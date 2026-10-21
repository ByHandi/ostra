package config

import (
	"net/netip"
	"strings"
	"testing"
)

func setRequired(t *testing.T, edge string) {
	t.Setenv("GARAGE_ADMIN_TOKEN", "x")
	t.Setenv("CONTROL_JWT_SECRET", strings.Repeat("s", 32))
	t.Setenv("EDGE_HOSTNAME", edge)
}

func TestDevSettingsGuard(t *testing.T) {
	tests := []struct {
		name, edge, dnsVerify, cookieSecure string
		wantErr                             bool
	}{
		{"production default", "edge.example.com", "", "", false},
		{"dev on localhost", "edge.localhost", "off", "false", false},
		{"dev on .test", "edge.storage.test", "off", "", false},
		{"DNS_VERIFY=off on a real domain", "edge.example.com", "off", "", true},
		{"COOKIE_SECURE=false on a real domain", "edge.example.com", "", "false", true},
		{"fake localhost", "edge.localhost.example.com", "off", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setRequired(t, tt.edge)
			t.Setenv("DNS_VERIFY", tt.dnsVerify)
			t.Setenv("COOKIE_SECURE", tt.cookieSecure)
			_, err := Load()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Load() err = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestTrustedProxies(t *testing.T) {
	setRequired(t, "edge.example.com")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !contains(cfg.TrustedProxies, "172.18.0.5") || contains(cfg.TrustedProxies, "203.0.113.9") {
		t.Fatalf("default TrustedProxies = %v", cfg.TrustedProxies)
	}

	t.Setenv("TRUSTED_PROXIES", "203.0.113.0/24, 2001:db8::1")
	cfg, err = Load()
	if err != nil {
		t.Fatal(err)
	}
	if !contains(cfg.TrustedProxies, "203.0.113.9") || !contains(cfg.TrustedProxies, "2001:db8::1") ||
		contains(cfg.TrustedProxies, "172.18.0.5") {
		t.Fatalf("TrustedProxies = %v", cfg.TrustedProxies)
	}

	t.Setenv("TRUSTED_PROXIES", "not-an-ip")
	if _, err := Load(); err == nil {
		t.Fatal("invalid TRUSTED_PROXIES must return an error")
	}
}

func TestAdminBootstrapPair(t *testing.T) {
	tests := []struct {
		name, email, password string
		wantErr               bool
	}{
		{"disabled", "", "", false},
		{"both set", "admin@example.com", "secret123", false},
		{"email only", "admin@example.com", "", true},
		{"password only", "", "secret123", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setRequired(t, "edge.example.com")
			t.Setenv("ADMIN_EMAIL", tt.email)
			t.Setenv("ADMIN_PASSWORD", tt.password)
			cfg, err := Load()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Load() err = %v, wantErr %v", err, tt.wantErr)
			}
			if err == nil && cfg.AdminName != "Admin" {
				t.Fatalf("AdminName = %q, want the default", cfg.AdminName)
			}
		})
	}
}

func contains(prefixes []netip.Prefix, ip string) bool {
	addr := netip.MustParseAddr(ip)
	for _, p := range prefixes {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}
