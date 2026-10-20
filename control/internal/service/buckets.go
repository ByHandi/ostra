package service

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"

	"golang.org/x/sync/errgroup"

	"github.com/handi7/storage-edge/control/internal/garage"
	"github.com/handi7/storage-edge/control/internal/store"
)

type Bucket struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Created       string   `json:"created"`
	Objects       int64    `json:"objects"`
	Bytes         int64    `json:"bytes"`
	WebsiteAccess bool     `json:"websiteAccess"`
	Domains       []string `json:"domains"`
}

type BucketKeyAccess struct {
	KeyID       string             `json:"keyId"`
	KeyName     string             `json:"keyName"`
	Permissions garage.Permissions `json:"permissions"`
}

type BucketDetail struct {
	Bucket
	Keys []BucketKeyAccess `json:"keys"`
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

	// ListBuckets tidak memuat statistik, jadi ambil detail per bucket secara paralel.
	out := make([]Bucket, len(list))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(8)
	for i, b := range list {
		g.Go(func() error {
			info, err := s.garage.GetBucket(gctx, b.ID)
			if garage.IsNotFound(err) {
				return nil // terhapus di antara list dan get
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
		return BucketDetail{}, notFound("bucket tidak ditemukan")
	}
	if err != nil {
		return BucketDetail{}, err
	}
	isDomain, err := s.registeredDomains(ctx)
	if err != nil {
		return BucketDetail{}, err
	}

	keys := make([]BucketKeyAccess, 0, len(info.Keys))
	for _, k := range info.Keys {
		keys = append(keys, BucketKeyAccess{KeyID: k.AccessKeyID, KeyName: k.Name, Permissions: k.Permissions})
	}
	return BucketDetail{Bucket: toBucket(info, isDomain), Keys: keys}, nil
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
			return Bucket{}, conflict("name", "nama %q sudah dipakai bucket atau custom domain lain", name)
		}
		return Bucket{}, err
	}
	return toBucket(info, nil), nil
}

// DeleteBucket hanya untuk bucket kosong tanpa custom domain.
func (s *Service) DeleteBucket(ctx context.Context, id string) error {
	domains, err := s.q.ListDomainsByBucket(ctx, id)
	if err != nil {
		return err
	}
	if len(domains) > 0 {
		return conflict("", "hapus dulu %d custom domain yang terpasang di bucket ini", len(domains))
	}

	err = s.garage.DeleteBucket(ctx, id)
	var ge *garage.Error
	switch {
	case garage.IsNotFound(err):
		return notFound("bucket tidak ditemukan")
	case errors.As(err, &ge) && ge.Status == http.StatusConflict:
		return conflict("", "bucket masih berisi objek; kosongkan dulu sebelum dihapus")
	}
	return err
}

// BucketDomains mengembalikan custom domain yang terdaftar untuk bucket.
func (s *Service) BucketDomains(ctx context.Context, id string) ([]store.Domain, error) {
	return s.q.ListDomainsByBucket(ctx, id)
}

func toBucket(info garage.BucketInfo, isDomain map[string]bool) Bucket {
	domains := []string{}
	for _, a := range info.GlobalAliases {
		if isDomain[a] {
			domains = append(domains, a)
		}
	}
	return Bucket{
		ID:            info.ID,
		Name:          bucketName(info.ID, info.GlobalAliases, isDomain),
		Created:       info.Created,
		Objects:       info.Objects,
		Bytes:         info.Bytes,
		WebsiteAccess: info.WebsiteAccess,
		Domains:       domains,
	}
}
