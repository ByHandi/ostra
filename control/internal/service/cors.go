package service

import (
	"context"
	"slices"
	"strings"

	"github.com/ByHandi/ostra/control/internal/objects"
)

const maxCORSRules = 100

var validCORSMethods = []string{"GET", "PUT", "POST", "DELETE", "HEAD"}

// GetBucketCORS retrieves the CORS configuration for a bucket.
func (s *Service) GetBucketCORS(ctx context.Context, bucketID string) (objects.CORSConfiguration, error) {
	var cfg objects.CORSConfiguration
	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		var err error
		cfg, err = st.GetCORS(ctx, bucket)
		return err
	})
	if err != nil {
		return objects.CORSConfiguration{Rules: []objects.CORSRule{}}, err
	}
	if cfg.Rules == nil {
		cfg.Rules = []objects.CORSRule{}
	}
	return cfg, nil
}

// SetBucketCORS validates and applies CORS rules to a bucket.
// If cfg.Rules is empty, any existing CORS configuration is removed.
func (s *Service) SetBucketCORS(ctx context.Context, bucketID string, cfg objects.CORSConfiguration) (objects.CORSConfiguration, error) {
	norm, err := validateAndNormalizeCORS(cfg.Rules)
	if err != nil {
		return objects.CORSConfiguration{}, err
	}
	cfg.Rules = norm

	err = s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		return st.SetCORS(ctx, bucket, cfg)
	})
	if err != nil {
		return objects.CORSConfiguration{}, err
	}
	return cfg, nil
}

// DeleteBucketCORS removes the CORS configuration for a bucket.
func (s *Service) DeleteBucketCORS(ctx context.Context, bucketID string) error {
	return s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		return st.DeleteCORS(ctx, bucket)
	})
}

func validateAndNormalizeCORS(rules []objects.CORSRule) ([]objects.CORSRule, error) {
	if len(rules) > maxCORSRules {
		return nil, invalid("rules", "too many CORS rules (maximum %d)", maxCORSRules)
	}
	if len(rules) == 0 {
		return []objects.CORSRule{}, nil
	}

	norm := make([]objects.CORSRule, len(rules))
	for i, r := range rules {
		rule, err := validateSingleCORSRule(r)
		if err != nil {
			return nil, err
		}
		norm[i] = rule
	}
	return norm, nil
}

func validateSingleCORSRule(r objects.CORSRule) (objects.CORSRule, error) {
	origins, err := normalizeOrigins(r.AllowedOrigins)
	if err != nil {
		return objects.CORSRule{}, err
	}
	methods, err := normalizeMethods(r.AllowedMethods)
	if err != nil {
		return objects.CORSRule{}, err
	}
	if r.MaxAgeSeconds < 0 {
		return objects.CORSRule{}, invalid("rules", "maxAgeSeconds must be non-negative")
	}

	return objects.CORSRule{
		ID:             strings.TrimSpace(r.ID),
		AllowedOrigins: origins,
		AllowedMethods: methods,
		AllowedHeaders: trimStrings(r.AllowedHeaders),
		ExposeHeaders:  trimStrings(r.ExposeHeaders),
		MaxAgeSeconds:  r.MaxAgeSeconds,
	}, nil
}

func normalizeOrigins(in []string) ([]string, error) {
	var out []string
	for _, o := range in {
		trimmed := strings.TrimSpace(o)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	if len(out) == 0 {
		return nil, invalid("rules", "each CORS rule must have at least one allowed origin")
	}
	return out, nil
}

func normalizeMethods(in []string) ([]string, error) {
	var out []string
	for _, m := range in {
		upper := strings.ToUpper(strings.TrimSpace(m))
		if upper == "" {
			continue
		}
		if !slices.Contains(validCORSMethods, upper) {
			return nil, invalid("rules", "unsupported HTTP method %q in CORS rule", m)
		}
		if !slices.Contains(out, upper) {
			out = append(out, upper)
		}
	}
	if len(out) == 0 {
		return nil, invalid("rules", "each CORS rule must have at least one allowed method")
	}
	return out, nil
}

func trimStrings(in []string) []string {
	if in == nil {
		return nil
	}
	var out []string
	for _, s := range in {
		trimmed := strings.TrimSpace(s)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
