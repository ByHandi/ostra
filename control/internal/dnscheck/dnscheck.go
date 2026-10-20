// Package dnscheck memverifikasi bahwa custom domain dimiliki user dan diarahkan ke edge.
package dnscheck

import (
	"context"
	"errors"
	"fmt"
	"net"
	"slices"
	"strings"
	"time"
)

// TXTPrefix adalah label tempat token verifikasi dipasang: _storage-edge.<domain>.
const TXTPrefix = "_storage-edge."

// TXTValue adalah isi record TXT yang diharapkan untuk sebuah token.
func TXTValue(token string) string { return "storage-edge-verify=" + token }

// Resolver adalah subset net.Resolver yang dipakai, supaya bisa di-fake di test.
type Resolver interface {
	LookupTXT(ctx context.Context, name string) ([]string, error)
	LookupCNAME(ctx context.Context, host string) (string, error)
	LookupHost(ctx context.Context, host string) ([]string, error)
}

// NewResolver membuat resolver. Kalau server diisi (mis. "1.1.1.1:53"), semua query
// dikirim ke sana; berguna supaya hasil tidak tertahan cache DNS lokal.
func NewResolver(server string) Resolver {
	if server == "" {
		return net.DefaultResolver
	}
	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			d := net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, network, server)
		},
	}
}

type Checker struct {
	resolver Resolver
	edge     string
}

func NewChecker(r Resolver, edgeHostname string) *Checker {
	return &Checker{resolver: r, edge: normalize(edgeHostname)}
}

// Check mengembalikan nil kalau TXT verifikasi cocok dan domain mengarah ke edge.
// Pesan error ditulis untuk ditampilkan ke user.
func (c *Checker) Check(ctx context.Context, domain, token string) error {
	domain = normalize(domain)

	txts, err := c.resolver.LookupTXT(ctx, TXTPrefix+domain)
	if err != nil && !isNotFound(err) {
		return fmt.Errorf("gagal membaca TXT %s%s: %w", TXTPrefix, domain, err)
	}
	if !slices.Contains(txts, TXTValue(token)) {
		return fmt.Errorf("record TXT %s%s belum berisi %q", TXTPrefix, domain, TXTValue(token))
	}

	if err := c.checkRouting(ctx, domain); err != nil {
		return err
	}
	return nil
}

// checkRouting menerima CNAME langsung ke edge, atau A/AAAA yang sama dengan IP edge
// (untuk apex domain yang memakai CNAME flattening/ALIAS).
func (c *Checker) checkRouting(ctx context.Context, domain string) error {
	notRouted := fmt.Errorf("%s belum diarahkan ke edge: buat CNAME ke %s", domain, c.edge)

	cname, err := c.resolver.LookupCNAME(ctx, domain)
	if err == nil && normalize(cname) == c.edge {
		return nil
	}
	if err != nil && !isNotFound(err) {
		return fmt.Errorf("gagal membaca CNAME %s: %w", domain, err)
	}

	domainIPs, err := c.resolver.LookupHost(ctx, domain)
	if err != nil {
		if isNotFound(err) {
			return notRouted
		}
		return fmt.Errorf("gagal membaca A/AAAA %s: %w", domain, err)
	}
	edgeIPs, err := c.resolver.LookupHost(ctx, c.edge)
	if err != nil {
		return fmt.Errorf("gagal membaca IP edge %s: %w", c.edge, err)
	}
	for _, ip := range domainIPs {
		if slices.Contains(edgeIPs, ip) {
			return nil
		}
	}
	return notRouted
}

func isNotFound(err error) bool {
	var dnsErr *net.DNSError
	return errors.As(err, &dnsErr) && dnsErr.IsNotFound
}

func normalize(name string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(name)), ".")
}
