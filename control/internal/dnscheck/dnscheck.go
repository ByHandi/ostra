// Package dnscheck verifies that a custom domain is owned by the user and points to the edge.
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

// TXTPrefix is the label where the verification token is placed: _ostra.<domain>.
const TXTPrefix = "_ostra."

// TXTValue is the expected TXT record content for a token.
func TXTValue(token string) string { return "ostra-verify=" + token }

// Resolver is the subset of net.Resolver in use, so it can be faked in tests.
type Resolver interface {
	LookupTXT(ctx context.Context, name string) ([]string, error)
	LookupCNAME(ctx context.Context, host string) (string, error)
	LookupHost(ctx context.Context, host string) ([]string, error)
}

// NewResolver creates a resolver. If server is set (e.g. "1.1.1.1:53"), all queries
// are sent there; useful so results are not held back by a local DNS cache.
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

// Check returns nil if the verification TXT matches and the domain points to the edge.
// Error messages are written to be shown to the user.
func (c *Checker) Check(ctx context.Context, domain, token string) error {
	domain = normalize(domain)

	txts, err := c.resolver.LookupTXT(ctx, TXTPrefix+domain)
	if err != nil && !isNotFound(err) {
		return fmt.Errorf("failed to read TXT %s%s: %w", TXTPrefix, domain, err)
	}
	if !slices.Contains(txts, TXTValue(token)) {
		return fmt.Errorf("TXT record %s%s does not contain %q yet", TXTPrefix, domain, TXTValue(token))
	}

	if err := c.checkRouting(ctx, domain); err != nil {
		return err
	}
	return nil
}

// checkRouting accepts a CNAME directly to the edge, or A/AAAA records matching the edge IPs
// (for apex domains using CNAME flattening/ALIAS).
func (c *Checker) checkRouting(ctx context.Context, domain string) error {
	notRouted := fmt.Errorf("%s does not point to the edge yet: create a CNAME to %s", domain, c.edge)

	cname, err := c.resolver.LookupCNAME(ctx, domain)
	if err == nil && normalize(cname) == c.edge {
		return nil
	}
	if err != nil && !isNotFound(err) {
		return fmt.Errorf("failed to read CNAME %s: %w", domain, err)
	}

	domainIPs, err := c.resolver.LookupHost(ctx, domain)
	if err != nil {
		if isNotFound(err) {
			return notRouted
		}
		return fmt.Errorf("failed to read A/AAAA %s: %w", domain, err)
	}
	edgeIPs, err := c.resolver.LookupHost(ctx, c.edge)
	if err != nil {
		return fmt.Errorf("failed to read edge IPs %s: %w", c.edge, err)
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
