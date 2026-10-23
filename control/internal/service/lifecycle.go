package service

import (
	"context"

	"github.com/ByHandi/ostra/control/internal/objects"
)

// GetBucketLifecycle retrieves the lifecycle configuration for a bucket.
func (s *Service) GetBucketLifecycle(ctx context.Context, bucketID string) (objects.LifecycleConfiguration, error) {
	var cfg objects.LifecycleConfiguration
	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		var err error
		cfg, err = st.GetLifecycle(ctx, bucket)
		return err
	})
	if err != nil {
		return objects.LifecycleConfiguration{}, err
	}
	return cfg, nil
}

// SetBucketLifecycle validates and applies lifecycle configuration to a bucket.
// If both expiration and abort days are unset or zero, any existing lifecycle rules are removed.
func (s *Service) SetBucketLifecycle(ctx context.Context, bucketID string, cfg objects.LifecycleConfiguration) (objects.LifecycleConfiguration, error) {
	norm, err := validateAndNormalizeLifecycle(cfg)
	if err != nil {
		return objects.LifecycleConfiguration{}, err
	}

	err = s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		return st.SetLifecycle(ctx, bucket, norm)
	})
	if err != nil {
		return objects.LifecycleConfiguration{}, err
	}
	return norm, nil
}

// DeleteBucketLifecycle removes the lifecycle configuration from a bucket.
func (s *Service) DeleteBucketLifecycle(ctx context.Context, bucketID string) error {
	return s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		return st.DeleteLifecycle(ctx, bucket)
	})
}

func validateAndNormalizeLifecycle(cfg objects.LifecycleConfiguration) (objects.LifecycleConfiguration, error) {
	var out objects.LifecycleConfiguration

	if cfg.ExpirationDays != nil {
		if *cfg.ExpirationDays < 0 {
			return objects.LifecycleConfiguration{}, invalid("expirationDays", "expiration days cannot be negative")
		}
		if *cfg.ExpirationDays > 0 {
			days := *cfg.ExpirationDays
			out.ExpirationDays = &days
		}
	}

	if cfg.AbortIncompleteMultipartUploadDays != nil {
		if *cfg.AbortIncompleteMultipartUploadDays < 0 {
			return objects.LifecycleConfiguration{}, invalid("abortIncompleteMultipartUploadDays", "abort incomplete multipart upload days cannot be negative")
		}
		if *cfg.AbortIncompleteMultipartUploadDays > 0 {
			days := *cfg.AbortIncompleteMultipartUploadDays
			out.AbortIncompleteMultipartUploadDays = &days
		}
	}

	return out, nil
}
