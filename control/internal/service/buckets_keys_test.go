package service

import (
	"context"
	"testing"

	"github.com/handi7/storage-edge/control/internal/garage"
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

	// Bucket dengan custom domain tidak bisa dihapus.
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

	// Bucket berisi objek tidak bisa dihapus.
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

	_, err := svc.CreateKey(ctx, "  ")
	wantKind(t, err, KindInvalid)

	k, err := svc.CreateKey(ctx, "app")
	if err != nil || k.SecretAccessKey == "" || k.ID == "" {
		t.Fatalf("CreateKey() = %+v, %v", k, err)
	}

	// Beri read+write, lalu cabut write.
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

	// Cabut semua izin: key tidak lagi punya akses ke bucket.
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
