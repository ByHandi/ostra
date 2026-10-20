package service

import (
	"net"
	"regexp"
	"strings"
)

var labelRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)

// MaxDomainLength mengikuti batas nama bucket S3/Garage, karena domain dipasang sebagai alias bucket.
const MaxDomainLength = 63

func NormalizeDomain(s string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(s)), ".")
}

var bucketNameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`)

// ValidateBucketName mengikuti aturan nama bucket S3 yang juga dipakai Garage.
func ValidateBucketName(name string) error {
	if !bucketNameRe.MatchString(name) || strings.Contains(name, "..") || net.ParseIP(name) != nil {
		return invalid("name", "nama bucket 3–63 karakter: huruf kecil, angka, titik, atau tanda hubung, diawali dan diakhiri huruf/angka")
	}
	return nil
}

// ValidateDomain memastikan domain (sudah dinormalisasi) bisa dipakai sebagai custom domain.
func ValidateDomain(domain string, reserved []string) error {
	if domain == "" {
		return invalid("domain", "domain wajib diisi")
	}
	if len(domain) > MaxDomainLength {
		return invalid("domain", "domain maksimal %d karakter (batas nama alias bucket Garage)", MaxDomainLength)
	}
	if net.ParseIP(domain) != nil {
		return invalid("domain", "gunakan nama domain, bukan alamat IP")
	}

	labels := strings.Split(domain, ".")
	if len(labels) < 2 {
		return invalid("domain", "domain harus lengkap, mis. cdn.contoh.com")
	}
	for _, l := range labels {
		if !labelRe.MatchString(l) {
			return invalid("domain", "domain %q tidak valid", domain)
		}
	}
	if tld := labels[len(labels)-1]; strings.Trim(tld, "0123456789") == "" {
		return invalid("domain", "domain %q tidak valid", domain)
	}

	for _, r := range reserved {
		if domain == r || strings.HasSuffix(domain, "."+r) {
			return invalid("domain", "domain %q dipakai oleh sistem dan tidak bisa didaftarkan", domain)
		}
	}
	return nil
}
