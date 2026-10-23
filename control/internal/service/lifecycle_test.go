package service

import (
	"context"
	"errors"
	"testing"

	"github.com/ByHandi/ostra/control/internal/objects"
)

func TestGetBucketLifecycleEmpty(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	cfg, err := svc.GetBucketLifecycle(ctx, "id-assets")
	if err != nil {
		t.Fatalf("GetBucketLifecycle: %v", err)
	}
	if cfg.ExpirationDays != nil {
		t.Fatalf("expected nil ExpirationDays, got %v", *cfg.ExpirationDays)
	}
	if cfg.AbortIncompleteMultipartUploadDays != nil {
		t.Fatalf("expected nil AbortIncompleteMultipartUploadDays, got %v", *cfg.AbortIncompleteMultipartUploadDays)
	}
}

func TestSetAndGetBucketLifecycle(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	exp := 30
	abort := 7
	in := objects.LifecycleConfiguration{
		ExpirationDays:                     &exp,
		AbortIncompleteMultipartUploadDays: &abort,
	}

	applied, err := svc.SetBucketLifecycle(ctx, "id-assets", in)
	if err != nil {
		t.Fatalf("SetBucketLifecycle: %v", err)
	}
	if applied.ExpirationDays == nil || *applied.ExpirationDays != 30 {
		t.Fatalf("expected ExpirationDays 30, got %v", applied.ExpirationDays)
	}
	if applied.AbortIncompleteMultipartUploadDays == nil || *applied.AbortIncompleteMultipartUploadDays != 7 {
		t.Fatalf("expected AbortIncompleteMultipartUploadDays 7, got %v", applied.AbortIncompleteMultipartUploadDays)
	}

	fetched, err := svc.GetBucketLifecycle(ctx, "id-assets")
	if err != nil {
		t.Fatalf("GetBucketLifecycle: %v", err)
	}
	if fetched.ExpirationDays == nil || *fetched.ExpirationDays != 30 {
		t.Fatalf("expected fetched ExpirationDays 30, got %v", fetched.ExpirationDays)
	}
	if fetched.AbortIncompleteMultipartUploadDays == nil || *fetched.AbortIncompleteMultipartUploadDays != 7 {
		t.Fatalf("expected fetched AbortIncompleteMultipartUploadDays 7, got %v", fetched.AbortIncompleteMultipartUploadDays)
	}
}

func TestDeleteBucketLifecycle(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	exp := 14
	_, err := svc.SetBucketLifecycle(ctx, "id-assets", objects.LifecycleConfiguration{
		ExpirationDays: &exp,
	})
	if err != nil {
		t.Fatalf("SetBucketLifecycle: %v", err)
	}

	if err := svc.DeleteBucketLifecycle(ctx, "id-assets"); err != nil {
		t.Fatalf("DeleteBucketLifecycle: %v", err)
	}

	fetched, err := svc.GetBucketLifecycle(ctx, "id-assets")
	if err != nil {
		t.Fatalf("GetBucketLifecycle after delete: %v", err)
	}
	if fetched.ExpirationDays != nil || fetched.AbortIncompleteMultipartUploadDays != nil {
		t.Fatalf("expected nil fields after delete, got %+v", fetched)
	}
}

func TestSetBucketLifecycleZeroClears(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	exp := 14
	_, err := svc.SetBucketLifecycle(ctx, "id-assets", objects.LifecycleConfiguration{
		ExpirationDays: &exp,
	})
	if err != nil {
		t.Fatalf("SetBucketLifecycle: %v", err)
	}

	zero := 0
	cleared, err := svc.SetBucketLifecycle(ctx, "id-assets", objects.LifecycleConfiguration{
		ExpirationDays:                     &zero,
		AbortIncompleteMultipartUploadDays: &zero,
	})
	if err != nil {
		t.Fatalf("SetBucketLifecycle with zero: %v", err)
	}
	if cleared.ExpirationDays != nil || cleared.AbortIncompleteMultipartUploadDays != nil {
		t.Fatalf("expected nil fields after zeroing, got %+v", cleared)
	}

	fetched, err := svc.GetBucketLifecycle(ctx, "id-assets")
	if err != nil {
		t.Fatalf("GetBucketLifecycle: %v", err)
	}
	if fetched.ExpirationDays != nil || fetched.AbortIncompleteMultipartUploadDays != nil {
		t.Fatalf("expected nil fetched fields, got %+v", fetched)
	}
}

func TestSetBucketLifecycleInvalid(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	neg := -5
	_, err := svc.SetBucketLifecycle(ctx, "id-assets", objects.LifecycleConfiguration{
		ExpirationDays: &neg,
	})
	var se *Error
	if !errors.As(err, &se) || se.Kind != KindInvalid || se.Field != "expirationDays" {
		t.Fatalf("want invalid expirationDays, got %v", err)
	}

	pos := 10
	negAbort := -1
	_, err = svc.SetBucketLifecycle(ctx, "id-assets", objects.LifecycleConfiguration{
		ExpirationDays:                     &pos,
		AbortIncompleteMultipartUploadDays: &negAbort,
	})
	if !errors.As(err, &se) || se.Kind != KindInvalid || se.Field != "abortIncompleteMultipartUploadDays" {
		t.Fatalf("want invalid abortIncompleteMultipartUploadDays, got %v", err)
	}
}

func TestBucketLifecycleNotFound(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	if _, err := svc.GetBucketLifecycle(ctx, "non-existent"); err == nil {
		t.Fatal("expected error for non-existent bucket")
	} else {
		wantKind(t, err, KindNotFound)
	}

	exp := 30
	if _, err := svc.SetBucketLifecycle(ctx, "non-existent", objects.LifecycleConfiguration{ExpirationDays: &exp}); err == nil {
		t.Fatal("expected error for non-existent bucket")
	} else {
		wantKind(t, err, KindNotFound)
	}

	if err := svc.DeleteBucketLifecycle(ctx, "non-existent"); err == nil {
		t.Fatal("expected error for non-existent bucket")
	} else {
		wantKind(t, err, KindNotFound)
	}
}

func TestBucketLifecycleGarageDown(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	g.failAll = errors.New("down")
	if _, err := svc.GetBucketLifecycle(ctx, "id-assets"); err == nil {
		t.Fatal("expected error when garage is down")
	}
}
