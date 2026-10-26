// Package api serves the JSON API and dashboard (public), plus internal endpoints for Caddy.
package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/ByHandi/ostra/control/internal/auth"
	"github.com/ByHandi/ostra/control/internal/service"
	"github.com/ByHandi/ostra/control/internal/store"
)

type Options struct {
	// Health is called by /healthz; an error means the control-plane is unhealthy (e.g. the database is unreachable).
	Health func(context.Context) error

	EdgeHostname string
	// TrustedProxies determines where X-Forwarded-For may be trusted from (see clientIP).
	TrustedProxies []netip.Prefix
	// CookieSecure=false is only for development over http://.
	CookieSecure bool
	Version      Version
	// DownloadSecret signs object browser download links (the JWT secret is fine: a
	// separate key is derived from it).
	DownloadSecret string
	// MaxUploadBytes caps one object browser upload; 0 means no limit.
	MaxUploadBytes int64
	// S3PublicURL is the public-facing S3 URL for clients (e.g. https://s3.example.com).
	S3PublicURL string
	// S3Region is the cluster region name for the S3 API (default "garage").
	S3Region string
	// UI serves the dashboard for all paths outside /api.
	UI http.Handler
}

// ClientConfig holds the server settings returned to the frontend.
type ClientConfig struct {
	S3Endpoint string `json:"s3Endpoint"`
	S3Region   string `json:"s3Region"`
}

// Version is the build info shown in the dashboard.
type Version struct {
	Version string `json:"version"`
	Commit  string `json:"commit"`
}

type Handler struct {
	svc       *service.Service
	auth      *auth.Service
	limiter   *auth.LoginLimiter
	downloads downloadTokens
	opts      Options
}

func NewHandler(svc *service.Service, authSvc *auth.Service, opts Options) *Handler {
	return &Handler{
		svc:       svc,
		auth:      authSvc,
		limiter:   auth.NewLoginLimiter(12*time.Second, 5),
		downloads: newDownloadTokens(opts.DownloadSecret, downloadLinkTTL),
		opts:      opts,
	}
}

// Public is the router exposed via Caddy (console domain).
func (h *Handler) Public() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)

	r.Get("/healthz", h.healthz)
	r.Route("/api", func(r chi.Router) {
		r.NotFound(func(w http.ResponseWriter, r *http.Request) {
			writeFail(w, http.StatusNotFound, "not_found", "endpoint not found", nil)
		})
		r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
			writeFail(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not supported", nil)
		})

		r.Post("/auth/login", h.login)
		r.Post("/auth/refresh-token", h.refresh)
		r.Post("/auth/logout", h.logout)
		// Authorized by the signed token in the URL, not by a session (see download.go).
		r.Get("/downloads/{token}", h.download)

		r.Group(func(r chi.Router) {
			r.Use(h.requireUser)

			r.Get("/version", func(w http.ResponseWriter, r *http.Request) {
				writeData(w, http.StatusOK, h.opts.Version)
			})
			r.Get("/config", func(w http.ResponseWriter, r *http.Request) {
				writeData(w, http.StatusOK, ClientConfig{
					S3Endpoint: h.opts.S3PublicURL,
					S3Region:   h.opts.S3Region,
				})
			})
			r.Get("/me", h.me)
			r.Post("/me/password", h.changePassword)

			r.Get("/overview", h.overview)

			r.Get("/buckets", h.listBuckets)
			r.Post("/buckets", h.createBucket)
			r.Get("/buckets/{id}", h.getBucket)
			r.Put("/buckets/{id}/quotas", h.updateBucketQuotas)
			r.Put("/buckets/{id}/website", h.updateBucketWebsite)
			r.Get("/buckets/{id}/cors", h.getBucketCORS)
			r.Put("/buckets/{id}/cors", h.setBucketCORS)
			r.Delete("/buckets/{id}/cors", h.deleteBucketCORS)
			r.Get("/buckets/{id}/lifecycle", h.getBucketLifecycle)
			r.Put("/buckets/{id}/lifecycle", h.setBucketLifecycle)
			r.Delete("/buckets/{id}/lifecycle", h.deleteBucketLifecycle)
			r.Delete("/buckets/{id}", h.deleteBucket)
			r.Get("/buckets/{id}/objects", h.listObjects)
			r.Put("/buckets/{id}/objects", h.uploadObject)
			r.Delete("/buckets/{id}/objects", h.deleteObjects)
			r.Get("/buckets/{id}/objects/metadata", h.getObjectMetadata)
			r.Put("/buckets/{id}/objects/metadata", h.updateObjectMetadata)
			r.Post("/buckets/{id}/objects/download-link", h.createDownloadLink)
			r.Post("/buckets/{id}/objects/share-link", h.createShareLink)
			r.Post("/buckets/{id}/objects/preview-link", h.createPreviewLink)
			r.Post("/buckets/{id}/objects/copy", h.copyObject)
			r.Post("/buckets/{id}/objects/move", h.moveObject)

			r.Get("/keys", h.listKeys)
			r.Post("/keys", h.createKey)
			r.Get("/keys/{id}", h.getKey)
			r.Delete("/keys/{id}", h.deleteKey)
			r.Put("/keys/{id}/expiration", h.updateKeyExpiration)
			r.Put("/keys/{id}/buckets/{bucketId}", h.setKeyPermissions)

			r.Get("/domains", h.listDomains)
			r.Post("/domains", h.createDomain)
			r.Get("/domains/{id}", h.getDomain)
			r.Post("/domains/{id}/verify", h.verifyDomain)
			r.Delete("/domains/{id}", h.deleteDomain)
		})
	})

	if h.opts.UI != nil {
		r.Handle("/*", h.opts.UI)
	}
	return r
}

// Internal is only for the internal network (Caddy). Do not reverse-proxy it to the public.
func (h *Handler) Internal() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Get("/healthz", h.healthz)
	r.Get("/caddy/ask", h.caddyAsk)
	return r
}

// healthz deliberately does not check Garage: if Garage is down, restarting the control-plane
// fixes nothing. It only checks things that actually belong to this process.
func (h *Handler) healthz(w http.ResponseWriter, r *http.Request) {
	if h.opts.Health != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := h.opts.Health(ctx); err != nil {
			slog.Error("healthcheck failed", "err", err)
			http.Error(w, "unhealthy", http.StatusServiceUnavailable)
			return
		}
	}
	w.Write([]byte("ok"))
}

// caddyAsk: 200 = Caddy may issue a certificate for ?domain=, anything else is a refusal.
func (h *Handler) caddyAsk(w http.ResponseWriter, r *http.Request) {
	domain := r.URL.Query().Get("domain")
	ok, err := h.svc.AllowCertificate(r.Context(), domain)
	if err != nil {
		slog.Error("ask: failed to check domain", "domain", domain, "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if !ok {
		slog.Info("ask: denied", "domain", domain)
		http.Error(w, "domain not allowed", http.StatusNotFound)
		return
	}
	slog.Info("ask: allowed", "domain", domain)
	w.WriteHeader(http.StatusOK)
}

type ctxKey struct{}

func (h *Handler) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" {
			writeFail(w, http.StatusUnauthorized, "unauthorized", "please log in", nil)
			return
		}
		user, err := h.auth.Authenticate(r.Context(), token)
		if err != nil {
			if err != auth.ErrInvalidToken {
				slog.Error("authentication failed", "err", err)
			}
			writeFail(w, http.StatusUnauthorized, "unauthorized", "invalid session, please log in again", nil)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, user)))
	})
}

func currentUser(r *http.Request) store.User {
	u, _ := r.Context().Value(ctxKey{}).(store.User)
	return u
}

// clientIP determines the client IP for rate limiting. X-Forwarded-For is only read if
// the connection comes from a trusted proxy; the list is walked from the right and the first
// entry that is not a trusted proxy is taken as the client. That way a client cannot spoof
// its IP by sending the header itself.
func (h *Handler) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	remote, err := netip.ParseAddr(host)
	if err != nil || !h.trusted(remote) {
		return host
	}

	var hops []string
	for _, v := range r.Header.Values("X-Forwarded-For") {
		hops = append(hops, strings.Split(v, ",")...)
	}
	var leftmost string
	for i := len(hops) - 1; i >= 0; i-- {
		addr, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil {
			break // malformed entry: stop, trust nothing to its left
		}
		if !h.trusted(addr) {
			return addr.String()
		}
		leftmost = addr.String()
	}
	// All hops are trusted (e.g. a client on the same private network): use the leftmost one.
	if leftmost != "" {
		return leftmost
	}
	return host
}

func (h *Handler) trusted(addr netip.Addr) bool {
	addr = addr.Unmap()
	for _, p := range h.opts.TrustedProxies {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeFail(w, http.StatusBadRequest, "validation", "invalid JSON body: "+err.Error(), nil)
		return false
	}
	return true
}
