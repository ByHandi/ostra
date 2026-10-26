package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/ByHandi/ostra/control/internal/garage"
)

func TestBuckets(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	svc := newTestService(t, g, &fakeDNS{}, false)

	_, err := svc.CreateBucket(ctx, "Bad_Name")
	wantKind(t, err, KindInvalid)

	b, err := svc.CreateBucket(ctx, " media ")
	if err != nil || b.Name != "media" {
		t.Fatalf("CreateBucket() = %+v, %v", b, err)
	}
	_, err = svc.CreateBucket(ctx, "media")
	wantKind(t, err, KindConflict)

	// A bucket with a custom domain cannot be deleted.
	if _, err := svc.CreateDomain(ctx, "cdn.brand.com", "media"); err != nil {
		t.Fatal(err)
	}
	list, err := svc.ListBuckets(ctx)
	if err != nil || len(list) != 2 {
		t.Fatalf("ListBuckets() = %+v, %v", list, err)
	}
	for _, b := range list {
		if b.Name == "media" && (len(b.Domains) != 1 || b.Domains[0] != "cdn.brand.com" || !b.WebsiteAccess) {
			t.Fatalf("bucket media = %+v", b)
		}
	}
	err = svc.DeleteBucket(ctx, b.ID)
	wantKind(t, err, KindConflict)

	// A bucket that contains objects cannot be deleted.
	g.buckets["id-assets"].Objects = 3
	wantKind(t, svc.DeleteBucket(ctx, "id-assets"), KindConflict)

	g.buckets["id-assets"].Objects = 0
	if err := svc.DeleteBucket(ctx, "id-assets"); err != nil {
		t.Fatal(err)
	}
	wantKind(t, svc.DeleteBucket(ctx, "id-assets"), KindNotFound)
	_, err = svc.GetBucket(ctx, "id-assets")
	wantKind(t, err, KindNotFound)
}

func TestKeys(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	svc := newTestService(t, g, &fakeDNS{}, false)

	_, err := svc.CreateKey(ctx, "  ", nil)
	wantKind(t, err, KindInvalid)

	k, err := svc.CreateKey(ctx, "app", nil)
	if err != nil || k.SecretAccessKey == "" || k.ID == "" {
		t.Fatalf("CreateKey() = %+v, %v", k, err)
	}

	// Grant read+write, then revoke write.
	d, err := svc.SetKeyPermissions(ctx, k.ID, "id-assets", garage.Permissions{Read: true, Write: true})
	if err != nil || len(d.Buckets) != 1 || d.Buckets[0].BucketName != "assets" ||
		d.Buckets[0].Permissions != (garage.Permissions{Read: true, Write: true}) {
		t.Fatalf("SetKeyPermissions(rw) = %+v, %v", d, err)
	}
	d, err = svc.SetKeyPermissions(ctx, k.ID, "id-assets", garage.Permissions{Read: true})
	if err != nil || d.Buckets[0].Permissions != (garage.Permissions{Read: true}) {
		t.Fatalf("SetKeyPermissions(r) = %+v, %v", d, err)
	}
	bd, err := svc.GetBucket(ctx, "id-assets")
	if err != nil || len(bd.Keys) != 1 || bd.Keys[0].KeyName != "app" {
		t.Fatalf("GetBucket().Keys = %+v, %v", bd.Keys, err)
	}

	// Revoke all permissions: the key no longer has access to the bucket.
	d, err = svc.SetKeyPermissions(ctx, k.ID, "id-assets", garage.Permissions{})
	if err != nil || len(d.Buckets) != 0 {
		t.Fatalf("SetKeyPermissions(none) = %+v, %v", d, err)
	}

	_, err = svc.SetKeyPermissions(ctx, k.ID, "id-missing", garage.Permissions{Read: true})
	wantKind(t, err, KindInvalid)
	_, err = svc.SetKeyPermissions(ctx, "GKmissing", "id-assets", garage.Permissions{Read: true})
	wantKind(t, err, KindNotFound)

	o, err := svc.Overview(ctx)
	if err != nil || o.Keys != 1 || o.Buckets != 1 {
		t.Fatalf("Overview() = %+v, %v", o, err)
	}

	if err := svc.DeleteKey(ctx, k.ID); err != nil {
		t.Fatal(err)
	}
	wantKind(t, svc.DeleteKey(ctx, k.ID), KindNotFound)
}

func TestKeyExpiration(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	svc := newTestService(t, g, &fakeDNS{}, false)

	// Past timestamp rejected.
	past := time.Now().Add(-1 * time.Hour).UTC().Format(time.RFC3339)
	_, err := svc.CreateKey(ctx, "past-key", &past)
	wantField(t, err, KindInvalid, "expiresAt")

	// Invalid format rejected.
	invalidDate := "not-a-date"
	_, err = svc.CreateKey(ctx, "bad-key", &invalidDate)
	wantField(t, err, KindInvalid, "expiresAt")

	// Future expiration works.
	future := time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339)
	k, err := svc.CreateKey(ctx, "temp-key", &future)
	if err != nil {
		t.Fatalf("CreateKey() failed: %v", err)
	}
	if k.ExpiresAt == nil || *k.ExpiresAt != future || k.Expired {
		t.Fatalf("k = %+v, want future expiry and expired=false", k)
	}

	// Update expiration to another future time.
	future2 := time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
	up, err := svc.UpdateKeyExpiration(ctx, k.ID, &future2)
	if err != nil {
		t.Fatalf("UpdateKeyExpiration() failed: %v", err)
	}
	if up.ExpiresAt == nil || *up.ExpiresAt != future2 || up.Expired {
		t.Fatalf("up = %+v, want future2 expiry", up)
	}

	// Clear expiration (never expires).
	up, err = svc.UpdateKeyExpiration(ctx, k.ID, nil)
	if err != nil {
		t.Fatalf("UpdateKeyExpiration(nil) failed: %v", err)
	}
	if up.ExpiresAt != nil || up.Expired {
		t.Fatalf("up = %+v, want nil expiry", up)
	}

	// Update expiration with past date rejected.
	_, err = svc.UpdateKeyExpiration(ctx, k.ID, &past)
	wantField(t, err, KindInvalid, "expiresAt")

	// Update expiration on non-existent key.
	_, err = svc.UpdateKeyExpiration(ctx, "GKmissing", &future)
	wantKind(t, err, KindNotFound)
}

func TestBucketQuotas(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	svc := newTestService(t, g, &fakeDNS{}, false)

	// Validation: negative limits rejected with field name.
	neg := int64(-1)
	pos := int64(100)
	_, err := svc.UpdateBucketQuotas(ctx, "id-assets", &neg, &pos)
	wantField(t, err, KindInvalid, "maxSize")

	_, err = svc.UpdateBucketQuotas(ctx, "id-assets", &pos, &neg)
	wantField(t, err, KindInvalid, "maxObjects")

	// Not found.
	_, err = svc.UpdateBucketQuotas(ctx, "id-missing", &pos, &pos)
	wantKind(t, err, KindNotFound)

	// Happy path: set quotas.
	maxSize := int64(1024 * 1024 * 50)
	maxObjs := int64(200)
	bd, err := svc.UpdateBucketQuotas(ctx, "id-assets", &maxSize, &maxObjs)
	if err != nil {
		t.Fatalf("UpdateBucketQuotas() failed: %v", err)
	}
	if bd.Quotas == nil || bd.Quotas.MaxSize == nil || *bd.Quotas.MaxSize != maxSize ||
		bd.Quotas.MaxObjects == nil || *bd.Quotas.MaxObjects != maxObjs {
		t.Fatalf("UpdateBucketQuotas() returned %+v", bd.Quotas)
	}

	// Verify GetBucket and ListBuckets reflect the quotas.
	get, err := svc.GetBucket(ctx, "id-assets")
	if err != nil {
		t.Fatalf("GetBucket() failed: %v", err)
	}
	if get.Quotas == nil || *get.Quotas.MaxSize != maxSize || *get.Quotas.MaxObjects != maxObjs {
		t.Fatalf("GetBucket() quotas = %+v", get.Quotas)
	}

	list, err := svc.ListBuckets(ctx)
	if err != nil || len(list) != 1 {
		t.Fatalf("ListBuckets() = %+v, %v", list, err)
	}
	if list[0].Quotas == nil || *list[0].Quotas.MaxSize != maxSize {
		t.Fatalf("ListBuckets()[0].Quotas = %+v", list[0].Quotas)
	}

	// Clearing quotas with 0 or nil.
	zero := int64(0)
	bd, err = svc.UpdateBucketQuotas(ctx, "id-assets", &zero, nil)
	if err != nil {
		t.Fatalf("UpdateBucketQuotas(clear) failed: %v", err)
	}
	if bd.Quotas != nil {
		t.Fatalf("expected nil quotas after clear, got %+v", bd.Quotas)
	}

	// Garage down returns error.
	g.failAll = errors.New("garage down")
	_, err = svc.UpdateBucketQuotas(ctx, "id-assets", &maxSize, &maxObjs)
	if err == nil {
		t.Fatal("expected error when garage is down, got nil")
	}
}

func TestBucketWebsite(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	svc := newTestService(t, g, &fakeDNS{}, false)

	// Validation: invalid document names.
	_, err := svc.UpdateBucketWebsite(ctx, "id-assets", true, "sub/index.html", "")
	wantField(t, err, KindInvalid, "indexDocument")

	_, err = svc.UpdateBucketWebsite(ctx, "id-assets", true, "index.html", "../secret.html")
	wantField(t, err, KindInvalid, "errorDocument")

	longName := string(make([]byte, 256))
	_, err = svc.UpdateBucketWebsite(ctx, "id-assets", true, longName, "")
	wantField(t, err, KindInvalid, "indexDocument")

	// Not found.
	_, err = svc.UpdateBucketWebsite(ctx, "id-missing", true, "index.html", "")
	wantKind(t, err, KindNotFound)

	// Happy path: configure website with custom index & error document.
	bd, err := svc.UpdateBucketWebsite(ctx, "id-assets", true, "main.html", "error.html")
	if err != nil {
		t.Fatalf("UpdateBucketWebsite() failed: %v", err)
	}
	if !bd.WebsiteAccess || bd.WebsiteConfig == nil || bd.WebsiteConfig.IndexDocument != "main.html" ||
		bd.WebsiteConfig.ErrorDocument == nil || *bd.WebsiteConfig.ErrorDocument != "error.html" {
		t.Fatalf("UpdateBucketWebsite() returned %+v", bd.WebsiteConfig)
	}

	// Verify GetBucket and ListBuckets reflect website settings.
	get, err := svc.GetBucket(ctx, "id-assets")
	if err != nil {
		t.Fatalf("GetBucket() failed: %v", err)
	}
	if !get.WebsiteAccess || get.WebsiteConfig == nil || get.WebsiteConfig.IndexDocument != "main.html" {
		t.Fatalf("GetBucket() websiteConfig = %+v", get.WebsiteConfig)
	}

	list, err := svc.ListBuckets(ctx)
	if err != nil || len(list) != 1 {
		t.Fatalf("ListBuckets() = %+v, %v", list, err)
	}
	if !list[0].WebsiteAccess || list[0].WebsiteConfig == nil || list[0].WebsiteConfig.IndexDocument != "main.html" {
		t.Fatalf("ListBuckets()[0].WebsiteConfig = %+v", list[0].WebsiteConfig)
	}

	// Default index.html when empty string passed.
	bd, err = svc.UpdateBucketWebsite(ctx, "id-assets", true, "", "")
	if err != nil {
		t.Fatalf("UpdateBucketWebsite(default) failed: %v", err)
	}
	if bd.WebsiteConfig.IndexDocument != "index.html" || bd.WebsiteConfig.ErrorDocument != nil {
		t.Fatalf("expected default index.html and nil errorDoc, got %+v", bd.WebsiteConfig)
	}

	// Disabling website hosting.
	bd, err = svc.UpdateBucketWebsite(ctx, "id-assets", false, "", "")
	if err != nil {
		t.Fatalf("UpdateBucketWebsite(disable) failed: %v", err)
	}
	if bd.WebsiteAccess || bd.WebsiteConfig != nil {
		t.Fatalf("expected websiteAccess false and nil config, got %+v", bd)
	}

	// Garage down returns error.
	g.failAll = errors.New("garage down")
	_, err = svc.UpdateBucketWebsite(ctx, "id-assets", true, "index.html", "")
	if err == nil {
		t.Fatal("expected error when garage is down, got nil")
	}
}
