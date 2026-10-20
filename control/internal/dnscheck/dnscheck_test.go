package dnscheck

import (
	"context"
	"net"
	"strings"
	"testing"
)

type fakeResolver struct {
	txt   map[string][]string
	cname map[string]string
	hosts map[string][]string
}

func notFound(name string) error { return &net.DNSError{Name: name, IsNotFound: true} }

func (f fakeResolver) LookupTXT(_ context.Context, name string) ([]string, error) {
	if v, ok := f.txt[name]; ok {
		return v, nil
	}
	return nil, notFound(name)
}

// Mimics net.Resolver: without a CNAME, LookupCNAME returns the name itself (with a trailing dot).
func (f fakeResolver) LookupCNAME(_ context.Context, host string) (string, error) {
	if v, ok := f.cname[host]; ok {
		return v, nil
	}
	if _, ok := f.hosts[host]; ok {
		return host + ".", nil
	}
	return "", notFound(host)
}

func (f fakeResolver) LookupHost(_ context.Context, host string) ([]string, error) {
	if target, ok := f.cname[host]; ok {
		host = strings.TrimSuffix(target, ".")
	}
	if v, ok := f.hosts[host]; ok {
		return v, nil
	}
	return nil, notFound(host)
}

func TestCheck(t *testing.T) {
	const token = "tok123"
	txtOK := map[string][]string{"_storage-edge.cdn.brand.com": {"other", TXTValue(token)}}
	edgeHosts := map[string][]string{"edge.example.com": {"203.0.113.10"}}

	tests := []struct {
		name    string
		res     fakeResolver
		wantErr string
	}{
		{
			name: "cname to edge",
			res:  fakeResolver{txt: txtOK, cname: map[string]string{"cdn.brand.com": "Edge.Example.com."}, hosts: edgeHosts},
		},
		{
			name: "A record matches edge IP",
			res: fakeResolver{txt: txtOK, hosts: map[string][]string{
				"edge.example.com": {"203.0.113.10"},
				"cdn.brand.com":    {"203.0.113.10"},
			}},
		},
		{
			name:    "TXT missing",
			res:     fakeResolver{cname: map[string]string{"cdn.brand.com": "edge.example.com."}, hosts: edgeHosts},
			wantErr: "does not contain",
		},
		{
			name: "TXT with wrong token",
			res: fakeResolver{
				txt:   map[string][]string{"_storage-edge.cdn.brand.com": {TXTValue("other")}},
				cname: map[string]string{"cdn.brand.com": "edge.example.com."}, hosts: edgeHosts,
			},
			wantErr: "does not contain",
		},
		{
			name: "points elsewhere",
			res: fakeResolver{txt: txtOK, hosts: map[string][]string{
				"edge.example.com": {"203.0.113.10"},
				"cdn.brand.com":    {"198.51.100.1"},
			}},
			wantErr: "does not point to the edge",
		},
		{
			name:    "domain has no records yet",
			res:     fakeResolver{txt: txtOK, hosts: edgeHosts},
			wantErr: "does not point to the edge",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := NewChecker(tt.res, "edge.example.com").Check(context.Background(), "CDN.brand.com.", token)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("Check() error = %v, want nil", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("Check() error = %v, want containing %q", err, tt.wantErr)
			}
		})
	}
}
