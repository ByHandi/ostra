// Package config reads the control-plane configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"net/netip"
	"os"
	"strings"
	"time"
)

// defaultTrustedProxies covers loopback and private networks, where the bundled Caddy
// (Docker network) lives. Override via TRUSTED_PROXIES if another proxy sits in front.
const defaultTrustedProxies = "127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"

type Config struct {
	// ListenAddr serves the public API (via Caddy on the console domain).
	ListenAddr string
	// InternalAddr serves endpoints meant only for Caddy (/caddy/ask).
	// Do not expose it through the reverse proxy.
	InternalAddr string

	DBPath string

	GarageAdminURL   string
	GarageAdminToken string

	// JWTSecret signs dashboard access tokens (at least 32 characters).
	JWTSecret  string
	AccessTTL  time.Duration
	RefreshTTL time.Duration
	// CookieSecure=false is only for development over http:// (e.g. the Vite dev server).
	CookieSecure bool

	// EdgeHostname is the CNAME target for custom domains, e.g. edge.example.com.
	EdgeHostname string
	// WebRootDomain equals s3_web.root_domain in garage.toml, e.g. .web.example.com.
	WebRootDomain string
	// ReservedDomains cannot be registered as custom domains (nor can their subdomains).
	ReservedDomains []string

	// DNSVerify=false skips DNS checks. Development only.
	DNSVerify bool
	// DNSServer, e.g. 1.1.1.1:53. Empty = system resolver.
	DNSServer string

	// TrustedProxies: only requests from these addresses have their X-Forwarded-For header trusted
	// to determine the client IP (used by the login rate limit).
	TrustedProxies []netip.Prefix

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

	if cfg.TrustedProxies, err = ParsePrefixes(env("TRUSTED_PROXIES", defaultTrustedProxies)); err != nil {
		return cfg, fmt.Errorf("TRUSTED_PROXIES: %w", err)
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
		return cfg, fmt.Errorf("required env not set: %s", strings.Join(missing, ", "))
	}

	if err := checkDevSettings(cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// checkDevSettings keeps development settings from leaking into production: DNS_VERIFY=off and
// COOKIE_SECURE=false are only accepted when the control-plane clearly runs on a local domain.
func checkDevSettings(cfg Config) error {
	var unsafe []string
	if !cfg.DNSVerify {
		unsafe = append(unsafe, "DNS_VERIFY=off")
	}
	if !cfg.CookieSecure {
		unsafe = append(unsafe, "COOKIE_SECURE=false")
	}
	if len(unsafe) == 0 || IsDevDomain(cfg.EdgeHostname) {
		return nil
	}
	return fmt.Errorf("%s may only be used for development (EDGE_HOSTNAME ending in .localhost or .test), "+
		"not %q", strings.Join(unsafe, " and "), cfg.EdgeHostname)
}

// IsDevDomain reports whether domain is only reachable locally.
func IsDevDomain(domain string) bool {
	domain = strings.TrimSuffix(strings.ToLower(domain), ".")
	for _, tld := range []string{"localhost", "test"} {
		if domain == tld || strings.HasSuffix(domain, "."+tld) {
			return true
		}
	}
	return false
}

// ParsePrefixes parses a comma-separated list of CIDRs or single IP addresses.
func ParsePrefixes(list string) ([]netip.Prefix, error) {
	var out []netip.Prefix
	for _, item := range strings.Split(list, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		if strings.Contains(item, "/") {
			p, err := netip.ParsePrefix(item)
			if err != nil {
				return nil, err
			}
			out = append(out, p.Masked())
			continue
		}
		addr, err := netip.ParseAddr(item)
		if err != nil {
			return nil, err
		}
		out = append(out, netip.PrefixFrom(addr, addr.BitLen()))
	}
	if len(out) == 0 {
		return nil, errors.New("no valid addresses")
	}
	return out, nil
}
