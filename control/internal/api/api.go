// Package api melayani JSON API dan dashboard (publik), serta endpoint internal untuk Caddy.
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

	"github.com/handi7/storage-edge/control/internal/auth"
	"github.com/handi7/storage-edge/control/internal/service"
	"github.com/handi7/storage-edge/control/internal/store"
)

type Options struct {
	// Health dipanggil /healthz; error berarti control-plane tidak sehat (mis. database tidak bisa diakses).
	Health func(context.Context) error

	EdgeHostname string
	// TrustedProxies menentukan dari mana X-Forwarded-For boleh dipercaya (lihat clientIP).
	TrustedProxies []netip.Prefix
	// CookieSecure=false hanya untuk development lewat http://.
	CookieSecure bool
	Version      Version
	// UI melayani dashboard untuk semua path di luar /api.
	UI http.Handler
}

// Version adalah info build yang ditampilkan di dashboard.
type Version struct {
	Version string `json:"version"`
	Commit  string `json:"commit"`
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

	r.Get("/healthz", h.healthz)
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

			r.Get("/version", func(w http.ResponseWriter, r *http.Request) {
				writeData(w, http.StatusOK, h.opts.Version)
			})
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
	r.Get("/healthz", h.healthz)
	r.Get("/caddy/ask", h.caddyAsk)
	return r
}

// healthz sengaja tidak mengecek Garage: kalau Garage mati, me-restart control-plane
// tidak memperbaiki apa-apa. Yang dicek hanya hal yang memang milik proses ini.
func (h *Handler) healthz(w http.ResponseWriter, r *http.Request) {
	if h.opts.Health != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := h.opts.Health(ctx); err != nil {
			slog.Error("healthcheck gagal", "err", err)
			http.Error(w, "unhealthy", http.StatusServiceUnavailable)
			return
		}
	}
	w.Write([]byte("ok"))
}

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

// clientIP menentukan IP client untuk rate limit. X-Forwarded-For hanya dibaca kalau
// koneksi datang dari proxy tepercaya; daftarnya ditelusuri dari kanan dan entri pertama
// yang bukan proxy tepercaya dianggap client. Dengan begitu client tidak bisa memalsukan
// IP-nya dengan mengirim header sendiri.
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
			break // entri rusak: berhenti, jangan percaya apa pun di kirinya
		}
		if !h.trusted(addr) {
			return addr.String()
		}
		leftmost = addr.String()
	}
	// Semua hop tepercaya (mis. client di jaringan privat yang sama): pakai yang paling kiri.
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
		writeFail(w, http.StatusBadRequest, "validation", "body JSON tidak valid: "+err.Error(), nil)
		return false
	}
	return true
}
