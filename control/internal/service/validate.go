package service

import (
	"net"
	"regexp"
	"strings"
)

var labelRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)

// MaxDomainLength follows the S3/Garage bucket name limit, because the domain is installed as a bucket alias.
const MaxDomainLength = 63

func NormalizeDomain(s string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(s)), ".")
}

var bucketNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`)

// ValidateBucketName follows the S3 bucket naming rules, which Garage also uses.
func ValidateBucketName(name string) error {
	if !bucketNameRe.MatchString(name) || strings.Contains(name, "..") || net.ParseIP(name) != nil {
		return invalid("name", "bucket name must be 3–63 characters: lowercase letters, digits, dots, or hyphens, starting and ending with a letter/digit")
	}
	return nil
}

// ValidateDomain checks that domain (already normalized) can be used as a custom domain.
func ValidateDomain(domain string, reserved []string) error {
	if domain == "" {
		return invalid("domain", "domain is required")
	}
	if len(domain) > MaxDomainLength {
		return invalid("domain", "domain must be at most %d characters (Garage bucket alias name limit)", MaxDomainLength)
	}
	if net.ParseIP(domain) != nil {
		return invalid("domain", "use a domain name, not an IP address")
	}

	labels := strings.Split(domain, ".")
	if len(labels) < 2 {
		return invalid("domain", "domain must be fully qualified, e.g. cdn.example.com")
	}
	for _, l := range labels {
		if !labelRe.MatchString(l) {
			return invalid("domain", "domain %q is not valid", domain)
		}
	}
	if tld := labels[len(labels)-1]; strings.Trim(tld, "0123456789") == "" {
		return invalid("domain", "domain %q is not valid", domain)
	}

	for _, r := range reserved {
		if domain == r || strings.HasSuffix(domain, "."+r) {
			return invalid("domain", "domain %q is reserved by the system and cannot be registered", domain)
		}
	}
	return nil
}
