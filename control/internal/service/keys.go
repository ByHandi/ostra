package service

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/handi7/storage-edge/control/internal/garage"
)

type AccessKey struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Created string `json:"created"`
	Expired bool   `json:"expired"`
}

type KeyBucketAccess struct {
	BucketID    string             `json:"bucketId"`
	BucketName  string             `json:"bucketName"`
	Permissions garage.Permissions `json:"permissions"`
}

type AccessKeyDetail struct {
	AccessKey
	Buckets []KeyBucketAccess `json:"buckets"`
}

// CreatedKey hanya dikembalikan sekali, saat key dibuat. Secret tidak bisa dibaca lagi.
type CreatedKey struct {
	AccessKeyDetail
	SecretAccessKey string `json:"secretAccessKey"`
}

func (s *Service) ListKeys(ctx context.Context) ([]AccessKey, error) {
	keys, err := s.garage.ListKeys(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]AccessKey, 0, len(keys))
	for _, k := range keys {
		out = append(out, AccessKey{ID: k.ID, Name: k.Name, Created: k.Created, Expired: k.Expired})
	}
	return out, nil
}

func (s *Service) GetKey(ctx context.Context, id string) (AccessKeyDetail, error) {
	info, err := s.garage.GetKey(ctx, id)
	if garage.IsNotFound(err) {
		return AccessKeyDetail{}, notFound("access key tidak ditemukan")
	}
	if err != nil {
		return AccessKeyDetail{}, err
	}
	return s.toKeyDetail(ctx, info)
}

func (s *Service) CreateKey(ctx context.Context, name string) (CreatedKey, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return CreatedKey{}, invalid("name", "nama key wajib diisi")
	}
	if utf8.RuneCountInString(name) > 100 {
		return CreatedKey{}, invalid("name", "nama key maksimal 100 karakter")
	}
	info, err := s.garage.CreateKey(ctx, name)
	if err != nil {
		return CreatedKey{}, err
	}
	detail, err := s.toKeyDetail(ctx, info)
	if err != nil {
		return CreatedKey{}, err
	}
	return CreatedKey{AccessKeyDetail: detail, SecretAccessKey: info.SecretAccessKey}, nil
}

func (s *Service) DeleteKey(ctx context.Context, id string) error {
	err := s.garage.DeleteKey(ctx, id)
	if garage.IsNotFound(err) {
		return notFound("access key tidak ditemukan")
	}
	return err
}

// SetKeyPermissions menyamakan izin key di bucket dengan p: izin true diberikan, izin false dicabut.
func (s *Service) SetKeyPermissions(ctx context.Context, keyID, bucketID string, p garage.Permissions) (AccessKeyDetail, error) {
	if _, err := s.garage.GetKey(ctx, keyID); garage.IsNotFound(err) {
		return AccessKeyDetail{}, notFound("access key tidak ditemukan")
	} else if err != nil {
		return AccessKeyDetail{}, err
	}
	if _, err := s.garage.GetBucket(ctx, bucketID); garage.IsNotFound(err) {
		return AccessKeyDetail{}, invalid("bucketId", "bucket tidak ditemukan")
	} else if err != nil {
		return AccessKeyDetail{}, err
	}

	allow := garage.Permissions{Read: p.Read, Write: p.Write, Owner: p.Owner}
	deny := garage.Permissions{Read: !p.Read, Write: !p.Write, Owner: !p.Owner}
	if allow != (garage.Permissions{}) {
		if err := s.garage.AllowBucketKey(ctx, bucketID, keyID, allow); err != nil {
			return AccessKeyDetail{}, err
		}
	}
	if deny != (garage.Permissions{}) {
		if err := s.garage.DenyBucketKey(ctx, bucketID, keyID, deny); err != nil {
			return AccessKeyDetail{}, err
		}
	}
	return s.GetKey(ctx, keyID)
}

func (s *Service) toKeyDetail(ctx context.Context, info garage.KeyInfo) (AccessKeyDetail, error) {
	isDomain, err := s.registeredDomains(ctx)
	if err != nil {
		return AccessKeyDetail{}, err
	}
	buckets := make([]KeyBucketAccess, 0, len(info.Buckets))
	for _, b := range info.Buckets {
		buckets = append(buckets, KeyBucketAccess{
			BucketID:    b.ID,
			BucketName:  bucketName(b.ID, b.GlobalAliases, isDomain),
			Permissions: b.Permissions,
		})
	}
	return AccessKeyDetail{
		AccessKey: AccessKey{ID: info.AccessKeyID, Name: info.Name, Created: info.Created, Expired: info.Expired},
		Buckets:   buckets,
	}, nil
}
