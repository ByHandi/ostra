package api

import (
	"net/http/httptest"
	"testing"

	"github.com/handi7/storage-edge/control/internal/config"
)

func TestClientIP(t *testing.T) {
	trusted, err := config.ParsePrefixes("10.0.0.0/8,172.16.0.0/12")
	if err != nil {
		t.Fatal(err)
	}
	h := &Handler{opts: Options{TrustedProxies: trusted}}

	tests := []struct {
		name, remote string
		xff          []string
		want         string
	}{
		{"no proxy", "203.0.113.7:5000", nil, "203.0.113.7"},
		{"direct client spoofs header", "203.0.113.7:5000", []string{"1.2.3.4"}, "203.0.113.7"},
		{"via Caddy", "172.18.0.4:4000", []string{"198.51.100.20"}, "198.51.100.20"},
		{"spoofed header forwarded by proxy", "172.18.0.4:4000", []string{"1.2.3.4, 198.51.100.20"}, "198.51.100.20"},
		{"two trusted proxies", "172.18.0.4:4000", []string{"198.51.100.20, 10.0.0.9"}, "198.51.100.20"},
		{"separate headers", "172.18.0.4:4000", []string{"1.2.3.4", "198.51.100.20"}, "198.51.100.20"},
		{"client on private network", "172.18.0.4:4000", []string{"10.1.2.3"}, "10.1.2.3"},
		{"malformed entry", "172.18.0.4:4000", []string{"not-an-ip"}, "172.18.0.4"},
		{"proxy without header", "172.18.0.4:4000", nil, "172.18.0.4"},
		{"IPv6", "[2001:db8::5]:443", []string{"1.2.3.4"}, "2001:db8::5"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/api/auth/login", nil)
			r.RemoteAddr = tt.remote
			for _, v := range tt.xff {
				r.Header.Add("X-Forwarded-For", v)
			}
			if got := h.clientIP(r); got != tt.want {
				t.Fatalf("clientIP() = %q, want %q", got, tt.want)
			}
		})
	}
}
