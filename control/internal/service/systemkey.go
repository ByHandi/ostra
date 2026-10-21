package service

// The object browser needs S3 credentials: Garage's admin API cannot list or transfer
// objects. The control-plane therefore owns one access key, created on first use, stored
// in the settings table, granted read/write on a bucket the first time that bucket is
// browsed, and hidden from every key listing in the dashboard.

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"sync"

	"github.com/ByHandi/ostra/control/internal/garage"
	"github.com/ByHandi/ostra/control/internal/objects"
	"github.com/ByHandi/ostra/control/internal/store"
)

const (
	systemKeyName          = "Ostra dashboard (system)"
	settingSystemKeyID     = "system_s3_access_key_id"
	settingSystemKeySecret = "system_s3_secret_access_key"
)

// errObjectBrowserDisabled is returned when no ObjectStore factory was configured.
var errObjectBrowserDisabled = errors.New("object browser is not configured")

type systemKey struct {
	mu      sync.Mutex
	id      string // "" until the key is known
	store   ObjectStore
	granted map[string]bool // bucket IDs the key already has read/write on
}

// systemKeyID returns the system key's ID without creating it ("" if it does not exist yet).
func (s *Service) systemKeyID(ctx context.Context) (string, error) {
	s.sys.mu.Lock()
	defer s.sys.mu.Unlock()
	if s.sys.id != "" {
		return s.sys.id, nil
	}
	id, err := s.q.GetSetting(ctx, settingSystemKeyID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	s.sys.id = id
	return id, nil
}

// isSystemKey reports whether id is the hidden system key.
func (s *Service) isSystemKey(ctx context.Context, id string) (bool, error) {
	sysID, err := s.systemKeyID(ctx)
	return err == nil && sysID != "" && sysID == id, err
}

// objectStore returns an S3 client authenticated as the system key, creating the key first if needed.
func (s *Service) objectStore(ctx context.Context) (ObjectStore, error) {
	if s.opts.NewObjectStore == nil {
		return nil, errObjectBrowserDisabled
	}
	s.sys.mu.Lock()
	defer s.sys.mu.Unlock()
	if s.sys.store != nil {
		return s.sys.store, nil
	}

	id, secret, err := s.loadOrCreateSystemKey(ctx)
	if err != nil {
		return nil, err
	}
	st, err := s.opts.NewObjectStore(id, secret)
	if err != nil {
		return nil, err
	}
	s.sys.id, s.sys.store, s.sys.granted = id, st, map[string]bool{}
	return st, nil
}

// loadOrCreateSystemKey reuses the stored key while it still exists in Garage, and creates
// (and stores) a new one otherwise, e.g. on first start or after Garage was reset.
// Callers must hold s.sys.mu.
func (s *Service) loadOrCreateSystemKey(ctx context.Context) (id, secret string, err error) {
	id, idErr := s.q.GetSetting(ctx, settingSystemKeyID)
	secret, secretErr := s.q.GetSetting(ctx, settingSystemKeySecret)
	switch {
	case idErr == nil && secretErr == nil:
		_, err := s.garage.GetKey(ctx, id)
		if err == nil {
			return id, secret, nil
		}
		if !garage.IsNotFound(err) {
			return "", "", err
		}
		slog.Warn("system S3 key is missing from Garage, creating a new one", "key", id)
	case !errors.Is(idErr, sql.ErrNoRows) && idErr != nil:
		return "", "", idErr
	case !errors.Is(secretErr, sql.ErrNoRows) && secretErr != nil:
		return "", "", secretErr
	}

	info, err := s.garage.CreateKey(ctx, systemKeyName)
	if err != nil {
		return "", "", err
	}
	for k, v := range map[string]string{settingSystemKeyID: info.AccessKeyID, settingSystemKeySecret: info.SecretAccessKey} {
		if err := s.q.SetSetting(ctx, store.SetSettingParams{Key: k, Value: v}); err != nil {
			return "", "", err
		}
	}
	slog.Info("created the system S3 key for the object browser", "key", info.AccessKeyID)
	return info.AccessKeyID, info.SecretAccessKey, nil
}

// grantSystemKey gives the system key read/write on a bucket. Grants are remembered, so the
// admin API is only called once per bucket unless force is set.
func (s *Service) grantSystemKey(ctx context.Context, bucketID string, force bool) error {
	s.sys.mu.Lock()
	id, done := s.sys.id, s.sys.granted[bucketID]
	s.sys.mu.Unlock()
	if done && !force {
		return nil
	}

	perms := garage.Permissions{Read: true, Write: true}
	if err := s.garage.AllowBucketKey(ctx, bucketID, id, perms); err != nil {
		return err
	}
	s.sys.mu.Lock()
	s.sys.granted[bucketID] = true
	s.sys.mu.Unlock()
	return nil
}

// withBucket runs fn against a bucket as the system key. When retry is set and S3 still
// answers AccessDenied (e.g. the permission was revoked by hand), the permission is granted
// again and fn runs once more. Uploads pass retry=false because their body cannot be replayed.
func (s *Service) withBucket(ctx context.Context, bucketID string, retry bool, fn func(ObjectStore, string) error) error {
	st, err := s.objectStore(ctx)
	if err != nil {
		return err
	}
	info, err := s.garage.GetBucket(ctx, bucketID)
	if garage.IsNotFound(err) {
		return notFound("bucket not found")
	}
	if err != nil {
		return err
	}
	if len(info.GlobalAliases) == 0 {
		return invalid("", "bucket has no global name, so it cannot be browsed")
	}
	name := info.GlobalAliases[0]

	if err := s.grantSystemKey(ctx, bucketID, false); err != nil {
		return err
	}
	err = fn(st, name)
	if retry && objects.IsAccessDenied(err) {
		if err := s.grantSystemKey(ctx, bucketID, true); err != nil {
			return err
		}
		err = fn(st, name)
	}
	return err
}
