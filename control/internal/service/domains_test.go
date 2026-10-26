package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/ByHandi/ostra/control/internal/garage"
	"github.com/ByHandi/ostra/control/internal/store"
)

// fakeGarage mimics the relevant Garage admin API behavior, including a 500 on
// RemoveAlias for an alias that does not exist.
type fakeGarage struct {
	buckets    map[string]*garage.BucketInfo // by id
	keys       map[string]*garage.KeyInfo    // by id
	failAll    error
	allowCalls int
	keySeq     int
}

func newFakeGarage(names ...string) *fakeGarage {
	g := &fakeGarage{buckets: map[string]*garage.BucketInfo{}, keys: map[string]*garage.KeyInfo{}}
	for _, n := range names {
		id := "id-" + n
		g.buckets[id] = &garage.BucketInfo{Bucket: garage.Bucket{ID: id, GlobalAliases: []string{n}}}
	}
	return g
}

func notFoundErr() error { return &garage.Error{Status: http.StatusNotFound, Code: "NoSuchBucket"} }

func (g *fakeGarage) ListBuckets(context.Context) ([]garage.Bucket, error) {
	var out []garage.Bucket
	for _, b := range g.buckets {
		out = append(out, b.Bucket)
	}
	return out, g.failAll
}

func (g *fakeGarage) GetBucket(_ context.Context, id string) (garage.BucketInfo, error) {
	if g.failAll != nil {
		return garage.BucketInfo{}, g.failAll
	}
	if b, ok := g.buckets[id]; ok {
		return *b, nil
	}
	return garage.BucketInfo{}, notFoundErr()
}

func (g *fakeGarage) GetBucketByAlias(_ context.Context, alias string) (garage.BucketInfo, error) {
	if g.failAll != nil {
		return garage.BucketInfo{}, g.failAll
	}
	for _, b := range g.buckets {
		if b.HasAlias(alias) {
			return *b, nil
		}
	}
	return garage.BucketInfo{}, notFoundErr()
}

func (g *fakeGarage) CreateBucket(ctx context.Context, alias string) (garage.BucketInfo, error) {
	if _, err := g.GetBucketByAlias(ctx, alias); err == nil {
		return garage.BucketInfo{}, &garage.Error{Status: http.StatusConflict, Code: "BucketAlreadyExists"}
	}
	b := &garage.BucketInfo{Bucket: garage.Bucket{ID: "id-" + alias, GlobalAliases: []string{alias}}}
	g.buckets[b.ID] = b
	return *b, nil
}

func (g *fakeGarage) AddAlias(ctx context.Context, bucketID, alias string) error {
	if g.failAll != nil {
		return g.failAll
	}
	if other, err := g.GetBucketByAlias(ctx, alias); err == nil && other.ID != bucketID {
		return &garage.Error{Status: http.StatusBadRequest, Code: "InvalidRequest", Message: "alias points to different bucket"}
	}
	b := g.buckets[bucketID]
	if !b.HasAlias(alias) {
		b.GlobalAliases = append(b.GlobalAliases, alias)
	}
	return nil
}

func (g *fakeGarage) RemoveAlias(_ context.Context, bucketID, alias string) error {
	b := g.buckets[bucketID]
	i := slices.Index(b.GlobalAliases, alias)
	if i < 0 {
		return &garage.Error{Status: http.StatusInternalServerError, Code: "InternalError"}
	}
	b.GlobalAliases = slices.Delete(b.GlobalAliases, i, i+1)
	return nil
}

func (g *fakeGarage) EnableWebsite(ctx context.Context, bucketID string) error {
	return g.UpdateWebsite(ctx, bucketID, garage.UpdateWebsiteConfig{
		Enabled:       true,
		IndexDocument: "index.html",
	})
}

func (g *fakeGarage) UpdateWebsite(_ context.Context, bucketID string, cfg garage.UpdateWebsiteConfig) error {
	if g.failAll != nil {
		return g.failAll
	}
	b, ok := g.buckets[bucketID]
	if !ok {
		return notFoundErr()
	}
	b.WebsiteAccess = cfg.Enabled
	if cfg.Enabled {
		idx := cfg.IndexDocument
		if idx == "" {
			idx = "index.html"
		}
		var errDoc *string
		if cfg.ErrorDocument != "" {
			ed := cfg.ErrorDocument
			errDoc = &ed
		}
		b.WebsiteConfig = &garage.WebsiteConfig{
			IndexDocument: idx,
			ErrorDocument: errDoc,
		}
	} else {
		b.WebsiteConfig = nil
	}
	return nil
}

func (g *fakeGarage) UpdateBucketQuotas(_ context.Context, bucketID string, q garage.BucketQuotas) error {
	if g.failAll != nil {
		return g.failAll
	}
	b, ok := g.buckets[bucketID]
	if !ok {
		return notFoundErr()
	}
	b.Quotas = q
	return nil
}

func (g *fakeGarage) Health(context.Context) (garage.ClusterHealth, error) {
	return garage.ClusterHealth{Status: "healthy"}, g.failAll
}

func (g *fakeGarage) DeleteBucket(_ context.Context, id string) error {
	b, ok := g.buckets[id]
	if !ok {
		return notFoundErr()
	}
	if b.Objects > 0 {
		return &garage.Error{Status: http.StatusConflict, Code: "BucketNotEmpty"}
	}
	delete(g.buckets, id)
	return nil
}

func (g *fakeGarage) ListKeys(context.Context) ([]garage.Key, error) {
	if g.failAll != nil {
		return nil, g.failAll
	}
	var out []garage.Key
	for _, k := range g.keys {
		out = append(out, garage.Key{
			ID:         k.AccessKeyID,
			Name:       k.Name,
			Created:    k.Created,
			Expired:    k.Expired,
			Expiration: k.Expiration,
		})
	}
	return out, nil
}

// GetKey derives the bucket list from the permissions recorded on buckets, like Garage.
func (g *fakeGarage) GetKey(_ context.Context, id string) (garage.KeyInfo, error) {
	if g.failAll != nil {
		return garage.KeyInfo{}, g.failAll
	}
	k, ok := g.keys[id]
	if !ok {
		return garage.KeyInfo{}, &garage.Error{Status: http.StatusNotFound, Code: "NoSuchAccessKey"}
	}
	out := garage.KeyInfo{
		AccessKeyID: k.AccessKeyID,
		Name:        k.Name,
		Created:     k.Created,
		Expired:     k.Expired,
		Expiration:  k.Expiration,
	}
	for _, b := range g.buckets {
		for _, bk := range b.Keys {
			if bk.AccessKeyID == id {
				out.Buckets = append(out.Buckets, garage.KeyBucket{ID: b.ID, GlobalAliases: b.GlobalAliases, Permissions: bk.Permissions})
			}
		}
	}
	return out, nil
}

func (g *fakeGarage) CreateKey(_ context.Context, name string, expiration *string) (garage.KeyInfo, error) {
	if g.failAll != nil {
		return garage.KeyInfo{}, g.failAll
	}
	// Like Garage, every key gets a fresh ID, even when the name is reused.
	g.keySeq++
	id := fmt.Sprintf("GK%d%s", g.keySeq, name)
	expired := false
	if expiration != nil {
		if t, err := time.Parse(time.RFC3339, *expiration); err == nil && time.Now().After(t) {
			expired = true
		}
	}
	k := &garage.KeyInfo{
		AccessKeyID: id,
		Name:        name,
		Created:     time.Now().UTC().Format(time.RFC3339),
		Expired:     expired,
		Expiration:  expiration,
	}
	g.keys[id] = k
	return garage.KeyInfo{
		AccessKeyID:     id,
		Name:            name,
		Created:         k.Created,
		SecretAccessKey: "secret-" + name,
		Expired:         expired,
		Expiration:      expiration,
	}, nil
}

func (g *fakeGarage) UpdateKey(_ context.Context, id string, expiration *string) (garage.KeyInfo, error) {
	if g.failAll != nil {
		return garage.KeyInfo{}, g.failAll
	}
	k, ok := g.keys[id]
	if !ok {
		return garage.KeyInfo{}, &garage.Error{Status: http.StatusNotFound, Code: "NoSuchAccessKey"}
	}
	k.Expiration = expiration
	k.Expired = false
	if expiration != nil {
		if t, err := time.Parse(time.RFC3339, *expiration); err == nil && time.Now().After(t) {
			k.Expired = true
		}
	}
	return *k, nil
}

func (g *fakeGarage) DeleteKey(_ context.Context, id string) error {
	if g.failAll != nil {
		return g.failAll
	}
	if _, ok := g.keys[id]; !ok {
		return &garage.Error{Status: http.StatusNotFound, Code: "NoSuchAccessKey"}
	}
	delete(g.keys, id)
	return nil
}

func (g *fakeGarage) setPerm(bucketID, keyID string, p garage.Permissions, value bool) {
	b := g.buckets[bucketID]
	i := slices.IndexFunc(b.Keys, func(k garage.BucketKey) bool { return k.AccessKeyID == keyID })
	if i < 0 {
		b.Keys = append(b.Keys, garage.BucketKey{AccessKeyID: keyID, Name: g.keys[keyID].Name})
		i = len(b.Keys) - 1
	}
	perm := &b.Keys[i].Permissions
	if p.Read {
		perm.Read = value
	}
	if p.Write {
		perm.Write = value
	}
	if p.Owner {
		perm.Owner = value
	}
	if *perm == (garage.Permissions{}) {
		b.Keys = slices.Delete(b.Keys, i, i+1)
	}
}

func (g *fakeGarage) AllowBucketKey(_ context.Context, bucketID, keyID string, p garage.Permissions) error {
	g.allowCalls++
	g.setPerm(bucketID, keyID, p, true)
	return nil
}

func (g *fakeGarage) DenyBucketKey(_ context.Context, bucketID, keyID string, p garage.Permissions) error {
	g.setPerm(bucketID, keyID, p, false)
	return nil
}

type fakeDNS struct{ err error }

func (f *fakeDNS) Check(context.Context, string, string) error { return f.err }

func newTestService(t *testing.T, g *fakeGarage, dns *fakeDNS, verify bool) *Service {
	t.Helper()
	sqlDB, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlDB.Close() })
	return New(store.New(sqlDB), g, dns, Options{
		DNSVerify:       verify,
		ReservedDomains: []string{"example.com"},
		WebRootDomain:   ".web.example.com",
	})
}

func wantKind(t *testing.T, err error, kind Kind) {
	t.Helper()
	var de *Error
	if !errors.As(err, &de) || de.Kind != kind {
		t.Fatalf("error = %v, want kind %d", err, kind)
	}
}

func wantField(t *testing.T, err error, kind Kind, field string) {
	t.Helper()
	var de *Error
	if !errors.As(err, &de) || de.Kind != kind || de.Field != field {
		t.Fatalf("error = %v, want kind %d field %q", err, kind, field)
	}
}

func TestDomainLifecycle(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	dns := &fakeDNS{err: errors.New("TXT record missing")}
	svc := newTestService(t, g, dns, true)

	d, err := svc.CreateDomain(ctx, " CDN.Brand.com. ", "assets")
	if err != nil {
		t.Fatal(err)
	}
	if d.Domain != "cdn.brand.com" || d.Status != StatusPending || d.VerifyToken == "" {
		t.Fatalf("Create() = %+v", d)
	}

	// DNS not ready: stays pending, error message stored, alias not installed yet.
	d, err = svc.VerifyDomain(ctx, d.ID)
	if err != nil {
		t.Fatal(err)
	}
	if d.Status != StatusPending || d.LastError == "" || g.buckets["id-assets"].HasAlias("cdn.brand.com") {
		t.Fatalf("Verify() before DNS ready = %+v", d)
	}
	if ok, _ := svc.AllowCertificate(ctx, "cdn.brand.com"); ok {
		t.Fatal("pending domain must not get a certificate")
	}

	// DNS ready: the worker activates the domain.
	dns.err = nil
	svc.verifyPending(ctx)
	d, _ = svc.GetDomain(ctx, d.ID)
	b := g.buckets["id-assets"]
	if d.Status != StatusActive || !b.HasAlias("cdn.brand.com") || !b.WebsiteAccess {
		t.Fatalf("after verification: domain=%+v bucket=%+v", d, b)
	}
	if ok, _ := svc.AllowCertificate(ctx, "CDN.brand.com"); !ok {
		t.Fatal("active domain must get a certificate")
	}

	// Duplicates are rejected.
	_, err = svc.CreateDomain(ctx, "cdn.brand.com", "assets")
	wantKind(t, err, KindConflict)

	// The bucket list uses the non-domain alias as the name.
	buckets, err := svc.ListBuckets(ctx)
	if err != nil || len(buckets) != 1 || buckets[0].Name != "assets" {
		t.Fatalf("ListBuckets() = %+v, %v", buckets, err)
	}

	// Deleting removes the alias.
	if err := svc.DeleteDomain(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	if b.HasAlias("cdn.brand.com") {
		t.Fatal("alias still installed after domain was deleted")
	}
	_, err = svc.GetDomain(ctx, d.ID)
	wantKind(t, err, KindNotFound)
}

func TestCreateWithoutDNSVerifyActivatesImmediately(t *testing.T) {
	g := newFakeGarage("assets")
	svc := newTestService(t, g, &fakeDNS{err: errors.New("must not be called")}, false)

	d, err := svc.CreateDomain(context.Background(), "cdn.brand.localhost", "assets")
	if err != nil {
		t.Fatal(err)
	}
	if d.Status != StatusActive {
		t.Fatalf("status = %s, want active", d.Status)
	}
}

func TestCreateRejects(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets", "other")
	g.AddAlias(ctx, "id-other", "taken.brand.com")
	svc := newTestService(t, g, &fakeDNS{}, true)

	tests := []struct {
		domain, bucket string
		kind           Kind
	}{
		{"cdn.brand.com", "missing", KindInvalid},
		{"cdn.brand.com", " ", KindInvalid},
		{"assets.web.example.com", "assets", KindInvalid},
		{"example.com", "assets", KindInvalid},
		{"taken.brand.com", "assets", KindConflict},
	}
	for _, tt := range tests {
		_, err := svc.CreateDomain(ctx, tt.domain, tt.bucket)
		wantKind(t, err, tt.kind)
	}
}

func TestActivateErrors(t *testing.T) {
	ctx := context.Background()

	t.Run("garage rejects alias", func(t *testing.T) {
		g := newFakeGarage("assets", "other")
		svc := newTestService(t, g, &fakeDNS{}, true)
		d, err := svc.CreateDomain(ctx, "cdn.brand.com", "assets")
		if err != nil {
			t.Fatal(err)
		}
		// Another bucket takes the alias after the domain is registered.
		g.AddAlias(ctx, "id-other", "cdn.brand.com")

		d, err = svc.VerifyDomain(ctx, d.ID)
		if err != nil {
			t.Fatal(err)
		}
		if d.Status != StatusError || d.LastError == "" {
			t.Fatalf("Verify() = %+v, want status error", d)
		}
	})

	t.Run("garage down stays pending", func(t *testing.T) {
		g := newFakeGarage("assets")
		svc := newTestService(t, g, &fakeDNS{}, true)
		d, err := svc.CreateDomain(ctx, "cdn.brand.com", "assets")
		if err != nil {
			t.Fatal(err)
		}
		g.failAll = &garage.Error{Status: http.StatusServiceUnavailable, Code: "Unavailable"}

		d, err = svc.VerifyDomain(ctx, d.ID)
		if err != nil {
			t.Fatal(err)
		}
		if d.Status != StatusPending || d.LastError == "" {
			t.Fatalf("Verify() = %+v, want pending with an error message", d)
		}
	})
}

func TestReconcileRestoresAlias(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	svc := newTestService(t, g, &fakeDNS{}, false)
	d, err := svc.CreateDomain(ctx, "cdn.brand.com", "assets")
	if err != nil {
		t.Fatal(err)
	}

	// Alias missing from Garage (e.g. deleted manually).
	g.RemoveAlias(ctx, "id-assets", "cdn.brand.com")
	svc.reconcile(ctx)
	if !g.buckets["id-assets"].HasAlias("cdn.brand.com") {
		t.Fatal("reconcile did not reinstall the alias")
	}

	// Bucket deleted: the domain goes to error.
	delete(g.buckets, "id-assets")
	svc.reconcile(ctx)
	d, _ = svc.GetDomain(ctx, d.ID)
	if d.Status != StatusError {
		t.Fatalf("status = %s, want error", d.Status)
	}

	// Deleting a domain whose bucket is gone still succeeds.
	if err := svc.DeleteDomain(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
}

func TestAllowCertificateWebRoot(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets", "private")
	g.buckets["id-assets"].WebsiteAccess = true
	svc := newTestService(t, g, &fakeDNS{}, true)

	tests := map[string]bool{
		"assets.web.example.com":   true,
		"private.web.example.com":  false, // website not enabled
		"missing.web.example.com":  false,
		"a.assets.web.example.com": false,
		"web.example.com":          false,
		"random.example.com":       false,
		"":                         false,
	}
	for host, want := range tests {
		got, err := svc.AllowCertificate(ctx, host)
		if err != nil {
			t.Fatalf("AllowCertificate(%q): %v", host, err)
		}
		if got != want {
			t.Errorf("AllowCertificate(%q) = %v, want %v", host, got, want)
		}
	}
}
