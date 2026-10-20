package service

// Custom domain lifecycle:
// register → verify DNS → install alias in Garage → active → delete.

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/handi7/storage-edge/control/internal/garage"
	"github.com/handi7/storage-edge/control/internal/store"
)

const (
	StatusPending = "pending"
	StatusActive  = "active"
	StatusError   = "error"
)

func (s *Service) ListDomains(ctx context.Context) ([]store.Domain, error) {
	return s.q.ListDomains(ctx)
}

func (s *Service) GetDomain(ctx context.Context, id int64) (store.Domain, error) {
	d, err := s.q.GetDomain(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return d, notFound("domain not found")
	}
	return d, err
}

// CreateDomain registers a custom domain for a bucket. The domain stays pending until DNS is verified.
func (s *Service) CreateDomain(ctx context.Context, domain, bucketName string) (store.Domain, error) {
	domain = NormalizeDomain(domain)
	if err := ValidateDomain(domain, s.opts.ReservedDomains); err != nil {
		return store.Domain{}, err
	}
	bucketName = strings.TrimSpace(bucketName)
	if bucketName == "" {
		return store.Domain{}, invalid("bucket", "bucket is required")
	}

	bucket, err := s.garage.GetBucketByAlias(ctx, bucketName)
	if garage.IsNotFound(err) {
		return store.Domain{}, invalid("bucket", "bucket %q not found", bucketName)
	}
	if err != nil {
		return store.Domain{}, err
	}

	if _, err := s.q.GetDomainByName(ctx, domain); err == nil {
		return store.Domain{}, conflict("domain", "domain %s is already registered", domain)
	} else if !errors.Is(err, sql.ErrNoRows) {
		return store.Domain{}, err
	}

	// The domain is already an alias of another bucket (e.g. added manually via the CLI).
	if other, err := s.garage.GetBucketByAlias(ctx, domain); err == nil && other.ID != bucket.ID {
		return store.Domain{}, conflict("domain", "domain %s is already used as the name of another bucket", domain)
	} else if err != nil && !garage.IsNotFound(err) {
		return store.Domain{}, err
	}

	token, err := newToken()
	if err != nil {
		return store.Domain{}, err
	}
	row, err := s.q.CreateDomain(ctx, store.CreateDomainParams{
		Domain:      domain,
		BucketID:    bucket.ID,
		BucketName:  bucketName,
		VerifyToken: token,
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return row, conflict("domain", "domain %s is already registered", domain)
		}
		return row, err
	}
	slog.Info("domain registered", "domain", domain, "bucket", bucketName)

	if !s.opts.DNSVerify {
		return s.verify(ctx, row)
	}
	return row, nil
}

// VerifyDomain runs the DNS check right now. Domains in error status are retried too.
func (s *Service) VerifyDomain(ctx context.Context, id int64) (store.Domain, error) {
	row, err := s.GetDomain(ctx, id)
	if err != nil {
		return row, err
	}
	if row.Status == StatusActive {
		return row, nil
	}
	return s.verify(ctx, row)
}

func (s *Service) verify(ctx context.Context, row store.Domain) (store.Domain, error) {
	if s.opts.DNSVerify {
		if err := s.dns.Check(ctx, row.Domain, row.VerifyToken); err != nil {
			return s.q.MarkDomainChecked(ctx, store.MarkDomainCheckedParams{ID: row.ID, LastError: err.Error()})
		}
	}
	return s.activate(ctx, row)
}

// activate enables the bucket website and installs the domain as a global alias.
// A rejection from Garage (4xx) sets the error status; transient failures stay pending to be retried.
func (s *Service) activate(ctx context.Context, row store.Domain) (store.Domain, error) {
	err := s.garage.EnableWebsite(ctx, row.BucketID)
	if err == nil {
		err = s.garage.AddAlias(ctx, row.BucketID, row.Domain)
	}
	if err != nil {
		var ge *garage.Error
		if errors.As(err, &ge) && ge.Status < http.StatusInternalServerError {
			slog.Warn("domain activation rejected by Garage", "domain", row.Domain, "err", err)
			return s.q.MarkDomainError(ctx, store.MarkDomainErrorParams{ID: row.ID, LastError: ge.Message})
		}
		slog.Error("domain activation failed, will retry later", "domain", row.Domain, "err", err)
		return s.q.MarkDomainChecked(ctx, store.MarkDomainCheckedParams{
			ID:        row.ID,
			LastError: "failed to reach storage, will retry",
		})
	}

	slog.Info("domain active", "domain", row.Domain, "bucket", row.BucketName)
	return s.q.MarkDomainActive(ctx, row.ID)
}

// DeleteDomain removes the alias from Garage (if still installed), then deletes the domain.
func (s *Service) DeleteDomain(ctx context.Context, id int64) error {
	row, err := s.GetDomain(ctx, id)
	if err != nil {
		return err
	}

	bucket, err := s.garage.GetBucket(ctx, row.BucketID)
	switch {
	case garage.IsNotFound(err):
		// The bucket has been deleted, so the alias is gone too.
	case err != nil:
		return err
	case bucket.HasAlias(row.Domain):
		if err := s.garage.RemoveAlias(ctx, row.BucketID, row.Domain); err != nil {
			return err
		}
	}

	if err := s.q.DeleteDomain(ctx, id); err != nil {
		return err
	}
	slog.Info("domain deleted", "domain", row.Domain)
	return nil
}

// AllowCertificate answers Caddy: may a TLS certificate be issued for this host?
func (s *Service) AllowCertificate(ctx context.Context, host string) (bool, error) {
	host = NormalizeDomain(host)
	if host == "" {
		return false, nil
	}

	if s.opts.WebRootDomain != "" {
		if label, ok := strings.CutSuffix(host, s.opts.WebRootDomain); ok {
			if label == "" || strings.Contains(label, ".") {
				return false, nil
			}
			b, err := s.garage.GetBucketByAlias(ctx, label)
			if garage.IsNotFound(err) {
				return false, nil
			}
			return err == nil && b.WebsiteAccess, err
		}
	}

	row, err := s.q.GetDomainByName(ctx, host)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil && row.Status == StatusActive, err
}

// Run periodically verifies pending domains and makes sure active domain aliases
// stay installed in Garage (e.g. after Garage is reset). Stops when ctx is done.
func (s *Service) Run(ctx context.Context, verifyEvery, reconcileEvery time.Duration) {
	s.reconcile(ctx)

	verifyTick := time.NewTicker(verifyEvery)
	defer verifyTick.Stop()
	reconcileTick := time.NewTicker(reconcileEvery)
	defer reconcileTick.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-verifyTick.C:
			s.verifyPending(ctx)
		case <-reconcileTick.C:
			s.reconcile(ctx)
		}
	}
}

func (s *Service) verifyPending(ctx context.Context) {
	rows, err := s.q.ListDomainsByStatus(ctx, StatusPending)
	if err != nil {
		slog.Error("failed to read pending domains", "err", err)
		return
	}
	for _, row := range rows {
		if _, err := s.verify(ctx, row); err != nil {
			slog.Error("failed to verify domain", "domain", row.Domain, "err", err)
		}
	}
}

func (s *Service) reconcile(ctx context.Context) {
	rows, err := s.q.ListDomainsByStatus(ctx, StatusActive)
	if err != nil {
		slog.Error("failed to read active domains", "err", err)
		return
	}
	for _, row := range rows {
		if err := s.reconcileOne(ctx, row); err != nil {
			slog.Error("domain reconcile failed", "domain", row.Domain, "err", err)
		}
	}
}

func (s *Service) reconcileOne(ctx context.Context, row store.Domain) error {
	bucket, err := s.garage.GetBucket(ctx, row.BucketID)
	if garage.IsNotFound(err) {
		_, err := s.q.MarkDomainError(ctx, store.MarkDomainErrorParams{
			ID:        row.ID,
			LastError: fmt.Sprintf("bucket %s has been deleted", row.BucketName),
		})
		return err
	}
	if err != nil {
		return err
	}
	if bucket.HasAlias(row.Domain) && bucket.WebsiteAccess {
		return nil
	}

	slog.Warn("domain alias missing from Garage, reinstalling", "domain", row.Domain)
	_, err = s.activate(ctx, row)
	return err
}

func newToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
