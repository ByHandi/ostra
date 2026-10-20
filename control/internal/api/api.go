// Package api melayani JSON API dan dashboard (publik), serta endpoint internal untuk Caddy.
package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/handi7/storage-edge/control/internal/auth"
	"github.com/handi7/storage-edge/control/internal/service"
	"github.com/handi7/storage-edge/control/internal/store"
)

type Options struct {
	EdgeHostname string
	// CookieSecure=false hanya untuk development lewat http://.
	CookieSecure bool
	// UI melayani dashboard untuk semua path di luar /api.
	UI http.Handler
}

type Handler struct {
	svc     *service.Service
	auth    *auth.Service
	limiter *auth.LoginLimiter
	opts    Options
}

func NewHandler(svc *service.Service, authSvc *auth.Service, opts Options) *Handler {
	return &Handler{
		svc:     svc,
		auth:    authSvc,
		limiter: auth.NewLoginLimiter(12*time.Second, 5),
		opts:    opts,
	}
}

// Public adalah router yang di-expose lewat Caddy (console domain).
func (h *Handler) Public() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)

	r.Get("/healthz", healthz)
	r.Route("/api", func(r chi.Router) {
		r.NotFound(func(w http.ResponseWriter, r *http.Request) {
			writeFail(w, http.StatusNotFound, "not_found", "endpoint tidak ditemukan", nil)
		})
		r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
			writeFail(w, http.StatusMethodNotAllowed, "method_not_allowed", "method tidak didukung", nil)
		})

		r.Post("/auth/login", h.login)
		r.Post("/auth/refresh-token", h.refresh)
		r.Post("/auth/logout", h.logout)

		r.Group(func(r chi.Router) {
			r.Use(h.requireUser)

			r.Get("/me", h.me)
			r.Post("/me/password", h.changePassword)

			r.Get("/overview", h.overview)

			r.Get("/buckets", h.listBuckets)
			r.Post("/buckets", h.createBucket)
			r.Get("/buckets/{id}", h.getBucket)
			r.Delete("/buckets/{id}", h.deleteBucket)

			r.Get("/keys", h.listKeys)
			r.Post("/keys", h.createKey)
			r.Get("/keys/{id}", h.getKey)
			r.Delete("/keys/{id}", h.deleteKey)
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

// Internal hanya untuk jaringan internal (Caddy). Jangan di-reverse-proxy ke publik.
func (h *Handler) Internal() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Get("/healthz", healthz)
	r.Get("/caddy/ask", h.caddyAsk)
	return r
}

func healthz(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) }

// caddyAsk: 200 = Caddy boleh menerbitkan sertifikat untuk ?domain=, selain itu ditolak.
func (h *Handler) caddyAsk(w http.ResponseWriter, r *http.Request) {
	domain := r.URL.Query().Get("domain")
	ok, err := h.svc.AllowCertificate(r.Context(), domain)
	if err != nil {
		slog.Error("ask: gagal cek domain", "domain", domain, "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if !ok {
		slog.Info("ask: ditolak", "domain", domain)
		http.Error(w, "domain not allowed", http.StatusNotFound)
		return
	}
	slog.Info("ask: diizinkan", "domain", domain)
	w.WriteHeader(http.StatusOK)
}

type ctxKey struct{}

func (h *Handler) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" {
			writeFail(w, http.StatusUnauthorized, "unauthorized", "silakan login", nil)
			return
		}
		user, err := h.auth.Authenticate(r.Context(), token)
		if err != nil {
			if err != auth.ErrInvalidToken {
				slog.Error("autentikasi gagal", "err", err)
			}
			writeFail(w, http.StatusUnauthorized, "unauthorized", "sesi tidak valid, silakan login lagi", nil)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, user)))
	})
}

func currentUser(r *http.Request) store.User {
	u, _ := r.Context().Value(ctxKey{}).(store.User)
	return u
}

// clientIP mengambil IP client. Caddy (tanpa trusted_proxies) mengabaikan X-Forwarded-For
// dari client dan mengisinya sendiri, jadi entri pertama bisa dipercaya selama
// control-plane hanya bisa dijangkau lewat Caddy.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		first, _, _ := strings.Cut(xff, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeFail(w, http.StatusBadRequest, "validation", "body JSON tidak valid: "+err.Error(), nil)
		return false
	}
	return true
}
