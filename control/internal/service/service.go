// Package service berisi logika bisnis control-plane: bucket, access key, dan custom domain.
package service

import (
	"context"
	"strings"

	"github.com/handi7/storage-edge/control/internal/garage"
	"github.com/handi7/storage-edge/control/internal/store"
)

// Garage adalah bagian admin API Garage yang dipakai service. *garage.Client memenuhinya.
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
	// DNSVerify=false langsung mengaktifkan domain tanpa cek DNS (development).
	DNSVerify       bool
	ReservedDomains []string
	// WebRootDomain, mis. ".web.domainku.com". <bucket><WebRootDomain> boleh dapat sertifikat
	// kalau bucket-nya ada dan website-nya aktif.
	WebRootDomain string
}

type Service struct {
	q      store.Querier
	garage Garage
	dns    DNSChecker
	opts   Options
}

func New(q store.Querier, g Garage, dns DNSChecker, opts Options) *Service {
	opts.WebRootDomain = NormalizeDomain(opts.WebRootDomain)
	if opts.WebRootDomain != "" && !strings.HasPrefix(opts.WebRootDomain, ".") {
		opts.WebRootDomain = "." + opts.WebRootDomain
	}
	return &Service{q: q, garage: g, dns: dns, opts: opts}
}

// registeredDomains mengembalikan set custom domain, dipakai untuk memisahkan
// nama bucket dari alias yang sebenarnya custom domain.
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

// bucketName memilih alias yang bukan custom domain sebagai nama tampilan.
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
