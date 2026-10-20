// Package service contains the control-plane business logic: buckets, access keys, and custom domains.
package service

import (
	"context"
	"strings"

	"github.com/handi7/storage-edge/control/internal/garage"
	"github.com/handi7/storage-edge/control/internal/store"
)

// Garage is the part of the Garage admin API used by the service. *garage.Client implements it.
type Garage interface {
	Health(ctx context.Context) (garage.ClusterHealth, error)

	ListBuckets(ctx context.Context) ([]garage.Bucket, error)
	GetBucket(ctx context.Context, id string) (garage.BucketInfo, error)
	GetBucketByAlias(ctx context.Context, alias string) (garage.BucketInfo, error)
	CreateBucket(ctx context.Context, alias string) (garage.BucketInfo, error)
	DeleteBucket(ctx context.Context, id string) error
	AddAlias(ctx context.Context, bucketID, alias string) error
	RemoveAlias(ctx context.Context, bucketID, alias string) error
	EnableWebsite(ctx context.Context, bucketID string) error

	ListKeys(ctx context.Context) ([]garage.Key, error)
	GetKey(ctx context.Context, id string) (garage.KeyInfo, error)
	CreateKey(ctx context.Context, name string) (garage.KeyInfo, error)
	DeleteKey(ctx context.Context, id string) error
	AllowBucketKey(ctx context.Context, bucketID, keyID string, p garage.Permissions) error
	DenyBucketKey(ctx context.Context, bucketID, keyID string, p garage.Permissions) error
}

type DNSChecker interface {
	Check(ctx context.Context, domain, token string) error
}

type Options struct {
	// DNSVerify=false activates domains immediately without a DNS check (development).
	DNSVerify       bool
	ReservedDomains []string
	// WebRootDomain, e.g. ".web.example.com". <bucket><WebRootDomain> may get a certificate
	// if the bucket exists and its website is enabled.
	WebRootDomain string
	// NewObjectStore builds the object browser's S3 client for the system key's credentials.
	// nil disables the object browser.
	NewObjectStore func(accessKey, secretKey string) (ObjectStore, error)
}

type Service struct {
	q      store.Querier
	garage Garage
	dns    DNSChecker
	opts   Options

	sys systemKey // object browser credentials, see systemkey.go
}

func New(q store.Querier, g Garage, dns DNSChecker, opts Options) *Service {
	opts.WebRootDomain = NormalizeDomain(opts.WebRootDomain)
	if opts.WebRootDomain != "" && !strings.HasPrefix(opts.WebRootDomain, ".") {
		opts.WebRootDomain = "." + opts.WebRootDomain
	}
	return &Service{q: q, garage: g, dns: dns, opts: opts}
}

// registeredDomains returns the set of custom domains, used to tell bucket names
// apart from aliases that are actually custom domains.
func (s *Service) registeredDomains(ctx context.Context) (map[string]bool, error) {
	rows, err := s.q.ListDomains(ctx)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool, len(rows))
	for _, d := range rows {
		set[d.Domain] = true
	}
	return set, nil
}

// bucketName picks an alias that is not a custom domain as the display name.
func bucketName(id string, aliases []string, isDomain map[string]bool) string {
	for _, a := range aliases {
		if !isDomain[a] {
			return a
		}
	}
	if len(aliases) > 0 {
		return aliases[0]
	}
	return id
}
