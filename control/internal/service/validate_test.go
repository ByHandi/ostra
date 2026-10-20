package service

import (
	"strings"
	"testing"
)

func TestValidateDomain(t *testing.T) {
	reserved := []string{"domainku.com", "edge.example.net"}

	valid := []string{
		"cdn.brand.com",
		"a.b",
		"img-1.sub.brand.co.id",
		"xn--bcher-kva.example",
	}
	for _, d := range valid {
		if err := ValidateDomain(d, reserved); err != nil {
			t.Errorf("ValidateDomain(%q) = %v, want nil", d, err)
		}
	}

	invalidDomains := []string{
		"",
		"localhost",
		"192.168.1.1",
		"brand..com",
		"-cdn.brand.com",
		"cdn-.brand.com",
		"cdn_x.brand.com",
		"cdn.brand.123",
		strings.Repeat("a", 60) + ".com",
		"domainku.com",
		"s3.domainku.com",
		"edge.example.net",
	}
	for _, d := range invalidDomains {
		if err := ValidateDomain(d, reserved); err == nil {
			t.Errorf("ValidateDomain(%q) = nil, want error", d)
		}
	}
}
