package service

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"

	"golang.org/x/sync/errgroup"

	"github.com/ByHandi/ostra/control/internal/garage"
	"github.com/ByHandi/ostra/control/internal/store"
)

type BucketQuotas struct {
	MaxSize    *int64 `json:"maxSize"`
	MaxObjects *int64 `json:"maxObjects"`
}

type BucketWebsiteConfig struct {
	IndexDocument string  `json:"indexDocument"`
	ErrorDocument *string `json:"errorDocument"`
}

type Bucket struct {
	ID            string               `json:"id"`
	Name          string               `json:"name"`
	Created       string               `json:"created"`
	Objects       int64                `json:"objects"`
	Bytes         int64                `json:"bytes"`
	WebsiteAccess bool                 `json:"websiteAccess"`
	WebsiteConfig *BucketWebsiteConfig `json:"websiteConfig"`
	Domains       []string             `json:"domains"`
	Quotas        *BucketQuotas        `json:"quotas"`
}

type BucketKeyAccess struct {
	KeyID       string             `json:"keyId"`
	KeyName     string             `json:"keyName"`
	Permissions garage.Permissions `json:"permissions"`
}

type BucketDetail struct {
	Bucket
	Keys []BucketKeyAccess `json:"keys"`
	// PublicBaseURL is where the bucket's files can be read publicly, e.g.
	// "https://cdn.example.com", or "" when the bucket is not public.
	PublicBaseURL string `json:"publicBaseUrl"`
}

func (s *Service) ListBuckets(ctx context.Context) ([]Bucket, error) {
	list, err := s.garage.ListBuckets(ctx)
	if err != nil {
		return nil, err
	}
	isDomain, err := s.registeredDomains(ctx)
	if err != nil {
		return nil, err
	}

	// ListBuckets does not include statistics, so fetch each bucket's details in parallel.
	out := make([]Bucket, len(list))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(8)
	for i, b := range list {
		g.Go(func() error {
			info, err := s.garage.GetBucket(gctx, b.ID)
			if garage.IsNotFound(err) {
				return nil // deleted between list and get
			}
			if err != nil {
				return err
			}
			out[i] = toBucket(info, isDomain)
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, err
	}
	return slices.DeleteFunc(out, func(b Bucket) bool { return b.ID == "" }), nil
}

func (s *Service) GetBucket(ctx context.Context, id string) (BucketDetail, error) {
	info, err := s.garage.GetBucket(ctx, id)
	if garage.IsNotFound(err) {
		return BucketDetail{}, notFound("bucket not found")
	}
	if err != nil {
		return BucketDetail{}, err
	}
	isDomain, err := s.registeredDomains(ctx)
	if err != nil {
		return BucketDetail{}, err
	}

	sysID, err := s.systemKeyID(ctx)
	if err != nil {
		return BucketDetail{}, err
	}
	keys := make([]BucketKeyAccess, 0, len(info.Keys))
	for _, k := range info.Keys {
		if k.AccessKeyID == sysID {
			continue
		}
		keys = append(keys, BucketKeyAccess{KeyID: k.AccessKeyID, KeyName: k.Name, Permissions: k.Permissions})
	}

	detail := BucketDetail{Bucket: toBucket(info, isDomain), Keys: keys}
	if detail.PublicBaseURL, err = s.publicBaseURL(ctx, detail.Bucket); err != nil {
		return BucketDetail{}, err
	}
	return detail, nil
}

// publicBaseURL prefers an active custom domain, then <bucket>.<web root domain>.
func (s *Service) publicBaseURL(ctx context.Context, b Bucket) (string, error) {
	rows, err := s.q.ListDomainsByBucket(ctx, b.ID)
	if err != nil {
		return "", err
	}
	for _, d := range rows {
		if d.Status == StatusActive {
			return "https://" + d.Domain, nil
		}
	}
	if b.WebsiteAccess && s.opts.WebRootDomain != "" {
		return "https://" + b.Name + s.opts.WebRootDomain, nil
	}
	return "", nil
}

func (s *Service) CreateBucket(ctx context.Context, name string) (Bucket, error) {
	name = strings.TrimSpace(name)
	if err := ValidateBucketName(name); err != nil {
		return Bucket{}, err
	}
	info, err := s.garage.CreateBucket(ctx, name)
	if err != nil {
		var ge *garage.Error
		if errors.As(err, &ge) && ge.Status == http.StatusConflict {
			return Bucket{}, conflict("name", "name %q is already used by another bucket or custom domain", name)
		}
		return Bucket{}, err
	}
	return toBucket(info, nil), nil
}

// DeleteBucket only works for empty buckets without custom domains.
func (s *Service) DeleteBucket(ctx context.Context, id string) error {
	domains, err := s.q.ListDomainsByBucket(ctx, id)
	if err != nil {
		return err
	}
	if len(domains) > 0 {
		return conflict("", "delete the %d custom domain(s) attached to this bucket first", len(domains))
	}

	err = s.garage.DeleteBucket(ctx, id)
	var ge *garage.Error
	switch {
	case garage.IsNotFound(err):
		return notFound("bucket not found")
	case errors.As(err, &ge) && ge.Status == http.StatusConflict:
		return conflict("", "bucket still contains objects; empty it before deleting")
	}
	return err
}

// BucketDomains returns the custom domains registered for the bucket.
func (s *Service) BucketDomains(ctx context.Context, id string) ([]store.Domain, error) {
	return s.q.ListDomainsByBucket(ctx, id)
}

// UpdateBucketQuotas updates or clears the storage and object count quotas on a bucket.
func (s *Service) UpdateBucketQuotas(ctx context.Context, id string, maxSize, maxObjects *int64) (BucketDetail, error) {
	if maxSize != nil && *maxSize < 0 {
		return BucketDetail{}, invalid("maxSize", "max size cannot be negative")
	}
	if maxObjects != nil && *maxObjects < 0 {
		return BucketDetail{}, invalid("maxObjects", "max objects cannot be negative")
	}
	if maxSize != nil && *maxSize == 0 {
		maxSize = nil
	}
	if maxObjects != nil && *maxObjects == 0 {
		maxObjects = nil
	}

	q := garage.BucketQuotas{
		MaxSize:    maxSize,
		MaxObjects: maxObjects,
	}
	err := s.garage.UpdateBucketQuotas(ctx, id, q)
	if garage.IsNotFound(err) {
		return BucketDetail{}, notFound("bucket not found")
	}
	if err != nil {
		return BucketDetail{}, err
	}
	return s.GetBucket(ctx, id)
}

func validateDocumentName(field, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return invalid(field, "%s cannot be empty", field)
	}
	if len(name) > 255 {
		return invalid(field, "%s cannot exceed 255 characters", field)
	}
	if strings.Contains(name, "/") || strings.Contains(name, "\\") || strings.Contains(name, "..") || strings.ContainsRune(name, 0) {
		return invalid(field, "%s cannot contain slashes or path traversal characters", field)
	}
	return nil
}

// UpdateBucketWebsite configures or disables static website hosting on a bucket.
func (s *Service) UpdateBucketWebsite(ctx context.Context, id string, enabled bool, indexDoc, errorDoc string) (BucketDetail, error) {
	indexDoc = strings.TrimSpace(indexDoc)
	errorDoc = strings.TrimSpace(errorDoc)

	if enabled {
		if indexDoc == "" {
			indexDoc = "index.html"
		}
		if err := validateDocumentName("indexDocument", indexDoc); err != nil {
			return BucketDetail{}, err
		}
		if errorDoc != "" {
			if err := validateDocumentName("errorDocument", errorDoc); err != nil {
				return BucketDetail{}, err
			}
		}
	}

	err := s.garage.UpdateWebsite(ctx, id, garage.UpdateWebsiteConfig{
		Enabled:       enabled,
		IndexDocument: indexDoc,
		ErrorDocument: errorDoc,
	})
	if garage.IsNotFound(err) {
		return BucketDetail{}, notFound("bucket not found")
	}
	if err != nil {
		return BucketDetail{}, err
	}
	return s.GetBucket(ctx, id)
}

func toBucket(info garage.BucketInfo, isDomain map[string]bool) Bucket {
	domains := []string{}
	for _, a := range info.GlobalAliases {
		if isDomain[a] {
			domains = append(domains, a)
		}
	}
	var quotas *BucketQuotas
	if info.Quotas.MaxSize != nil || info.Quotas.MaxObjects != nil {
		quotas = &BucketQuotas{
			MaxSize:    info.Quotas.MaxSize,
			MaxObjects: info.Quotas.MaxObjects,
		}
	}
	var websiteCfg *BucketWebsiteConfig
	if info.WebsiteConfig != nil {
		websiteCfg = &BucketWebsiteConfig{
			IndexDocument: info.WebsiteConfig.IndexDocument,
			ErrorDocument: info.WebsiteConfig.ErrorDocument,
		}
	} else if info.WebsiteAccess {
		websiteCfg = &BucketWebsiteConfig{
			IndexDocument: "index.html",
		}
	}
	return Bucket{
		ID:            info.ID,
		Name:          bucketName(info.ID, info.GlobalAliases, isDomain),
		Created:       info.Created,
		Objects:       info.Objects,
		Bytes:         info.Bytes,
		WebsiteAccess: info.WebsiteAccess,
		WebsiteConfig: websiteCfg,
		Domains:       domains,
		Quotas:        quotas,
	}
}
