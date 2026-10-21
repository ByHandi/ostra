// Package config reads the control-plane configuration from the environment.
package config

import (
	"errors"
	"fmt"
	"net/netip"
	"os"
	"slices"
	"strconv"
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

	// S3Endpoint is Garage's S3 API as seen from the control-plane (host:port, plain HTTP),
	// used by the object browser.
	S3Endpoint string
	S3Region   string
	// MaxUploadBytes caps one object browser upload.
	MaxUploadBytes int64

	// TrustedProxies: only requests from these addresses have their X-Forwarded-For header trusted
	// to determine the client IP (used by the login rate limit).
	TrustedProxies []netip.Prefix

	VerifyInterval    time.Duration
	ReconcileInterval time.Duration

	// AdminEmail/AdminPassword create the first account at startup, only while there are no
	// accounts yet. Both empty = disabled (create one with `control createuser` instead).
	AdminEmail    string
	AdminName     string
	AdminPassword string
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
		S3Endpoint:       env("S3_ENDPOINT", "127.0.0.1:3900"),
		S3Region:         env("S3_REGION", "garage"),
		AdminEmail:       strings.TrimSpace(os.Getenv("ADMIN_EMAIL")),
		AdminName:        env("ADMIN_NAME", "Admin"),
		AdminPassword:    os.Getenv("ADMIN_PASSWORD"),
	}

	maxUploadMB, err := strconv.ParseInt(env("MAX_UPLOAD_SIZE_MB", "5120"), 10, 64)
	if err != nil || maxUploadMB <= 0 {
		return cfg, fmt.Errorf("MAX_UPLOAD_SIZE_MB: must be a positive number of megabytes")
	}
	cfg.MaxUploadBytes = maxUploadMB << 20

	cfg.ReservedDomains = reservedDomains(os.Getenv("RESERVED_DOMAINS"), cfg.EdgeHostname, cfg.WebRootDomain)

	durations := []struct {
		dst      *time.Duration
		key, def string
	}{
		{&cfg.VerifyInterval, "VERIFY_INTERVAL", "30s"},
		{&cfg.ReconcileInterval, "RECONCILE_INTERVAL", "5m"},
		{&cfg.AccessTTL, "ACCESS_TOKEN_TTL", "15m"},
		{&cfg.RefreshTTL, "REFRESH_TOKEN_TTL", "720h"},
	}
	for _, d := range durations {
		v, err := time.ParseDuration(env(d.key, d.def))
		if err != nil {
			return cfg, fmt.Errorf("%s: %w", d.key, err)
		}
		*d.dst = v
	}

	if cfg.TrustedProxies, err = ParsePrefixes(env("TRUSTED_PROXIES", defaultTrustedProxies)); err != nil {
		return cfg, fmt.Errorf("TRUSTED_PROXIES: %w", err)
	}

	if err := checkRequired(map[string]string{
		"GARAGE_ADMIN_TOKEN": cfg.GarageAdminToken,
		"CONTROL_JWT_SECRET": cfg.JWTSecret,
		"EDGE_HOSTNAME":      cfg.EdgeHostname,
	}); err != nil {
		return cfg, err
	}

	if (cfg.AdminEmail == "") != (cfg.AdminPassword == "") {
		return cfg, errors.New("ADMIN_EMAIL and ADMIN_PASSWORD must be set together")
	}

	if err := checkDevSettings(cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

// reservedDomains combines RESERVED_DOMAINS (comma-separated) with the system's own domains.
func reservedDomains(list string, own ...string) []string {
	var out []string
	for _, d := range append(strings.Split(list, ","), own...) {
		if d = strings.Trim(strings.ToLower(strings.TrimSpace(d)), "."); d != "" {
			out = append(out, d)
		}
	}
	return out
}

func checkRequired(vars map[string]string) error {
	var missing []string
	for name, v := range vars {
		if v == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) == 0 {
		return nil
	}
	slices.Sort(missing)
	return fmt.Errorf("required env not set: %s", strings.Join(missing, ", "))
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
