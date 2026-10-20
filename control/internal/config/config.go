// Package config membaca konfigurasi control-plane dari environment.
package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

type Config struct {
	// ListenAddr melayani API publik (lewat Caddy di console domain).
	ListenAddr string
	// InternalAddr melayani endpoint yang hanya untuk Caddy (/caddy/ask).
	// Jangan di-expose lewat reverse proxy.
	InternalAddr string

	DBPath string

	GarageAdminURL   string
	GarageAdminToken string

	// JWTSecret menandatangani access token dashboard (minimal 32 karakter).
	JWTSecret  string
	AccessTTL  time.Duration
	RefreshTTL time.Duration
	// CookieSecure=false hanya untuk development lewat http:// (mis. Vite dev server).
	CookieSecure bool

	// EdgeHostname adalah target CNAME untuk custom domain, mis. edge.domainku.com.
	EdgeHostname string
	// WebRootDomain sama dengan s3_web.root_domain di garage.toml, mis. .web.domainku.com.
	WebRootDomain string
	// ReservedDomains tidak boleh didaftarkan sebagai custom domain (beserta subdomainnya).
	ReservedDomains []string

	// DNSVerify=false melewati pengecekan DNS. Hanya untuk development.
	DNSVerify bool
	// DNSServer, mis. 1.1.1.1:53. Kosong = resolver sistem.
	DNSServer string

	VerifyInterval    time.Duration
	ReconcileInterval time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		ListenAddr:       env("LISTEN_ADDR", ":8080"),
		InternalAddr:     env("INTERNAL_LISTEN_ADDR", ":9000"),
		DBPath:           env("DB_PATH", "control.db"),
		GarageAdminURL:   env("GARAGE_ADMIN_URL", "http://127.0.0.1:3903"),
		GarageAdminToken: os.Getenv("GARAGE_ADMIN_TOKEN"),
		JWTSecret:        os.Getenv("CONTROL_JWT_SECRET"),
		CookieSecure:     env("COOKIE_SECURE", "true") != "false",
		EdgeHostname:     strings.ToLower(os.Getenv("EDGE_HOSTNAME")),
		WebRootDomain:    strings.ToLower(os.Getenv("WEB_ROOT_DOMAIN")),
		DNSServer:        os.Getenv("DNS_SERVER"),
		DNSVerify:        env("DNS_VERIFY", "on") != "off",
	}

	for _, d := range strings.Split(os.Getenv("RESERVED_DOMAINS"), ",") {
		if d = strings.Trim(strings.ToLower(strings.TrimSpace(d)), "."); d != "" {
			cfg.ReservedDomains = append(cfg.ReservedDomains, d)
		}
	}
	for _, d := range []string{cfg.EdgeHostname, cfg.WebRootDomain} {
		if d = strings.Trim(d, "."); d != "" {
			cfg.ReservedDomains = append(cfg.ReservedDomains, d)
		}
	}

	var err error
	if cfg.VerifyInterval, err = time.ParseDuration(env("VERIFY_INTERVAL", "30s")); err != nil {
		return cfg, fmt.Errorf("VERIFY_INTERVAL: %w", err)
	}
	if cfg.ReconcileInterval, err = time.ParseDuration(env("RECONCILE_INTERVAL", "5m")); err != nil {
		return cfg, fmt.Errorf("RECONCILE_INTERVAL: %w", err)
	}
	if cfg.AccessTTL, err = time.ParseDuration(env("ACCESS_TOKEN_TTL", "15m")); err != nil {
		return cfg, fmt.Errorf("ACCESS_TOKEN_TTL: %w", err)
	}
	if cfg.RefreshTTL, err = time.ParseDuration(env("REFRESH_TOKEN_TTL", "720h")); err != nil {
		return cfg, fmt.Errorf("REFRESH_TOKEN_TTL: %w", err)
	}

	var missing []string
	for name, v := range map[string]string{
		"GARAGE_ADMIN_TOKEN": cfg.GarageAdminToken,
		"CONTROL_JWT_SECRET": cfg.JWTSecret,
		"EDGE_HOSTNAME":      cfg.EdgeHostname,
	} {
		if v == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return cfg, fmt.Errorf("env wajib belum diisi: %s", strings.Join(missing, ", "))
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
