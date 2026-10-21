package service

import (
	"bytes"
	"context"
	"database/sql"
	"io"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/minio/minio-go/v7"

	"github.com/ByHandi/ostra/control/internal/garage"
	"github.com/ByHandi/ostra/control/internal/objects"
	"github.com/ByHandi/ostra/control/internal/store"
)

// fakeStore is an in-memory S3: bucket name → key → object.
type fakeStore struct {
	data       map[string]map[string]fakeObject
	denyNext   int // the next N calls answer AccessDenied
	createdFor string
}

type fakeObject struct {
	body        []byte
	contentType string
}

func newFakeStore() *fakeStore { return &fakeStore{data: map[string]map[string]fakeObject{}} }

func (f *fakeStore) deny() error {
	if f.denyNext > 0 {
		f.denyNext--
		return minio.ErrorResponse{Code: "AccessDenied", StatusCode: 403}
	}
	return nil
}

func (f *fakeStore) List(_ context.Context, bucket, prefix, _ string, _ int) (objects.Page, error) {
	if err := f.deny(); err != nil {
		return objects.Page{}, err
	}
	page := objects.Page{Folders: []string{}, Objects: []objects.Object{}}
	seen := map[string]bool{}
	for key, o := range f.data[bucket] {
		rest, ok := strings.CutPrefix(key, prefix)
		if !ok || rest == "" {
			continue
		}
		if dir, _, isDir := strings.Cut(rest, "/"); isDir {
			if !seen[dir] {
				seen[dir] = true
				page.Folders = append(page.Folders, prefix+dir+"/")
			}
			continue
		}
		page.Objects = append(page.Objects, objects.Object{Key: key, Size: int64(len(o.body)), ContentType: o.contentType})
	}
	sort.Strings(page.Folders)
	sort.Slice(page.Objects, func(i, j int) bool { return page.Objects[i].Key < page.Objects[j].Key })
	return page, nil
}

func (f *fakeStore) Open(_ context.Context, bucket, key string) (io.ReadCloser, objects.Object, error) {
	if err := f.deny(); err != nil {
		return nil, objects.Object{}, err
	}
	o, ok := f.data[bucket][key]
	if !ok {
		return nil, objects.Object{}, objects.ErrNotFound
	}
	return io.NopCloser(bytes.NewReader(o.body)), objects.Object{Key: key, Size: int64(len(o.body)), ContentType: o.contentType}, nil
}

func (f *fakeStore) Put(_ context.Context, bucket, key string, r io.Reader, _ int64, contentType string) (objects.Object, error) {
	if err := f.deny(); err != nil {
		return objects.Object{}, err
	}
	body, err := io.ReadAll(r)
	if err != nil {
		return objects.Object{}, err
	}
	if f.data[bucket] == nil {
		f.data[bucket] = map[string]fakeObject{}
	}
	f.data[bucket][key] = fakeObject{body: body, contentType: contentType}
	return objects.Object{Key: key, Size: int64(len(body)), ContentType: contentType}, nil
}

func (f *fakeStore) Delete(_ context.Context, bucket, key string) error {
	if err := f.deny(); err != nil {
		return err
	}
	delete(f.data[bucket], key)
	return nil
}

func (f *fakeStore) DeletePrefix(_ context.Context, bucket, prefix string) (int, error) {
	if err := f.deny(); err != nil {
		return 0, err
	}
	n := 0
	for key := range f.data[bucket] {
		if strings.HasPrefix(key, prefix) {
			delete(f.data[bucket], key)
			n++
		}
	}
	return n, nil
}

// newObjectService returns a service with the object browser enabled, plus its DB so a
// second service can share it.
func newObjectService(t *testing.T, g *fakeGarage, st *fakeStore) (*Service, *sql.DB) {
	t.Helper()
	sqlDB, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "objects.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlDB.Close() })
	return newServiceOnDB(sqlDB, g, st), sqlDB
}

func newServiceOnDB(sqlDB *sql.DB, g *fakeGarage, st *fakeStore) *Service {
	return New(store.New(sqlDB), g, &fakeDNS{}, Options{
		WebRootDomain: ".web.example.com",
		NewObjectStore: func(accessKey, _ string) (ObjectStore, error) {
			st.createdFor = accessKey
			return st, nil
		},
	})
}

func put(t *testing.T, svc *Service, bucketID, key, body string) {
	t.Helper()
	if _, err := svc.PutObject(context.Background(), bucketID, key, strings.NewReader(body), int64(len(body)), ""); err != nil {
		t.Fatalf("PutObject(%q): %v", key, err)
	}
}

func TestSystemKeyIsCreatedOnceAndHidden(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	g.CreateKey(ctx, "app")
	st := newFakeStore()
	svc, sqlDB := newObjectService(t, g, st)

	// Nothing is created until the object browser is used.
	if keys, _ := svc.ListKeys(ctx); len(keys) != 1 || len(g.keys) != 1 {
		t.Fatalf("before browsing: keys=%v garage=%d", keys, len(g.keys))
	}

	if _, err := svc.ListObjects(ctx, "id-assets", "", "", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ListObjects(ctx, "id-assets", "", "", 0); err != nil {
		t.Fatal(err)
	}
	if len(g.keys) != 2 || g.allowCalls != 1 {
		t.Fatalf("garage keys = %d (want 2), allow calls = %d (want 1)", len(g.keys), g.allowCalls)
	}
	sysID := st.createdFor
	if g.keys[sysID] == nil || g.keys[sysID].Name != systemKeyName {
		t.Fatalf("system key %q not created in Garage", sysID)
	}

	// Hidden everywhere in the dashboard API.
	keys, _ := svc.ListKeys(ctx)
	if len(keys) != 1 || keys[0].Name != "app" {
		t.Fatalf("ListKeys() = %+v, want only the user key", keys)
	}
	bucket, err := svc.GetBucket(ctx, "id-assets")
	if err != nil || len(bucket.Keys) != 0 {
		t.Fatalf("GetBucket().Keys = %+v, %v", bucket.Keys, err)
	}
	_, err = svc.GetKey(ctx, sysID)
	wantKind(t, err, KindNotFound)
	wantKind(t, svc.DeleteKey(ctx, sysID), KindNotFound)
	_, err = svc.SetKeyPermissions(ctx, sysID, "id-assets", garage.Permissions{})
	wantKind(t, err, KindNotFound)
	if o, _ := svc.Overview(ctx); o.Keys != 1 {
		t.Fatalf("Overview().Keys = %d, want 1", o.Keys)
	}

	// A new process reuses the stored key...
	svc2 := newServiceOnDB(sqlDB, g, st)
	if _, err := svc2.ListObjects(ctx, "id-assets", "", "", 0); err != nil || len(g.keys) != 2 || st.createdFor != sysID {
		t.Fatalf("restart: err=%v keys=%d key=%s", err, len(g.keys), st.createdFor)
	}

	// ...and replaces it if it was deleted from Garage.
	delete(g.keys, sysID)
	svc3 := newServiceOnDB(sqlDB, g, st)
	if _, err := svc3.ListObjects(ctx, "id-assets", "", "", 0); err != nil {
		t.Fatal(err)
	}
	if st.createdFor == sysID || g.keys[st.createdFor] == nil {
		t.Fatalf("system key was not recreated: %s", st.createdFor)
	}
}

func TestObjectOperations(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	put(t, svc, "id-assets", "readme.md", "# hi")
	put(t, svc, "id-assets", "img/cat.png", "png")
	put(t, svc, "id-assets", "img/2026/dog.png", "png2")

	root, err := svc.ListObjects(ctx, "id-assets", "", "", 0)
	if err != nil || len(root.Folders) != 1 || root.Folders[0] != "img/" || len(root.Objects) != 1 {
		t.Fatalf("root listing = %+v, %v", root, err)
	}
	img, _ := svc.ListObjects(ctx, "id-assets", "img/", "", 0)
	if len(img.Folders) != 1 || img.Folders[0] != "img/2026/" || len(img.Objects) != 1 || img.Objects[0].Key != "img/cat.png" {
		t.Fatalf("img/ listing = %+v", img)
	}

	// Content type is guessed from the extension when the browser sends none.
	if ct := st.data["assets"]["img/cat.png"].contentType; ct != "image/png" {
		t.Fatalf("content type = %q, want image/png", ct)
	}

	body, obj, err := svc.OpenObject(ctx, "id-assets", "readme.md")
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(body)
	body.Close()
	if string(got) != "# hi" || obj.Size != 4 {
		t.Fatalf("OpenObject() = %q %+v", got, obj)
	}
	_, _, err = svc.OpenObject(ctx, "id-assets", "missing.txt")
	wantKind(t, err, KindNotFound)

	if err := svc.DeleteObject(ctx, "id-assets", "readme.md"); err != nil {
		t.Fatal(err)
	}
	n, err := svc.DeleteFolder(ctx, "id-assets", "img/")
	if err != nil || n != 2 || len(st.data["assets"]) != 0 {
		t.Fatalf("DeleteFolder() = %d, %v; left %v", n, err, st.data["assets"])
	}

	_, err = svc.ListObjects(ctx, "id-missing", "", "", 0)
	wantKind(t, err, KindNotFound)
}

func TestObjectAccessDeniedIsRegranted(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	if _, err := svc.ListObjects(ctx, "id-assets", "", "", 0); err != nil {
		t.Fatal(err)
	}
	// Someone revoked the permission by hand: the next call is denied once.
	st.denyNext = 1
	if _, err := svc.ListObjects(ctx, "id-assets", "", "", 0); err != nil {
		t.Fatalf("ListObjects after revoke: %v", err)
	}
	if g.allowCalls != 2 {
		t.Fatalf("allow calls = %d, want 2 (initial grant + regrant)", g.allowCalls)
	}

	// Uploads are not retried (the body cannot be replayed), so the error surfaces.
	st.denyNext = 1
	if _, err := svc.PutObject(ctx, "id-assets", "a.txt", strings.NewReader("x"), 1, ""); !objects.IsAccessDenied(err) {
		t.Fatalf("PutObject while denied: err = %v, want AccessDenied", err)
	}
}

func TestObjectKeyValidation(t *testing.T) {
	valid := []string{"a.txt", "photos/2026/cat.jpg", "with space/é.png", strings.Repeat("a", 1024)}
	for _, k := range valid {
		if err := ValidateObjectKey(k); err != nil {
			t.Errorf("ValidateObjectKey(%q) = %v, want nil", k, err)
		}
	}
	invalidKeys := []string{"", "/abs.txt", "folder/", "a//b.txt", "../etc/passwd", "a/./b", "tab\tname", "nul\x00", strings.Repeat("a", 1025)}
	for _, k := range invalidKeys {
		if err := ValidateObjectKey(k); err == nil {
			t.Errorf("ValidateObjectKey(%q) = nil, want error", k)
		}
	}

	ctx := context.Background()
	svc, _ := newObjectService(t, newFakeGarage("assets"), newFakeStore())
	for _, prefix := range []string{"no-slash", "/abs/", "a//"} {
		_, err := svc.ListObjects(ctx, "id-assets", prefix, "", 0)
		wantKind(t, err, KindInvalid)
	}
	_, err := svc.DeleteFolder(ctx, "id-assets", "")
	wantKind(t, err, KindInvalid)
}

func TestObjectBrowserDisabled(t *testing.T) {
	svc := newTestService(t, newFakeGarage("assets"), &fakeDNS{}, false)
	if _, err := svc.ListObjects(context.Background(), "id-assets", "", "", 0); err != errObjectBrowserDisabled {
		t.Fatalf("err = %v, want errObjectBrowserDisabled", err)
	}
}

func TestPublicBaseURL(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	svc, _ := newObjectService(t, g, newFakeStore())

	b, _ := svc.GetBucket(ctx, "id-assets")
	if b.PublicBaseURL != "" {
		t.Fatalf("private bucket PublicBaseURL = %q", b.PublicBaseURL)
	}
	g.buckets["id-assets"].WebsiteAccess = true
	if b, _ = svc.GetBucket(ctx, "id-assets"); b.PublicBaseURL != "https://assets.web.example.com" {
		t.Fatalf("website PublicBaseURL = %q", b.PublicBaseURL)
	}
	if _, err := svc.CreateDomain(ctx, "cdn.brand.com", "assets"); err != nil {
		t.Fatal(err)
	}
	if b, _ = svc.GetBucket(ctx, "id-assets"); b.PublicBaseURL != "https://cdn.brand.com" {
		t.Fatalf("custom domain PublicBaseURL = %q", b.PublicBaseURL)
	}
}

func TestObjectContentType(t *testing.T) {
	tests := []struct{ key, sent, want string }{
		{"a.png", "", "image/png"},
		{"a.png", "application/x-www-form-urlencoded", "image/png"},
		{"a.png", "application/octet-stream", "image/png"},
		{"notes.txt", "text/markdown", "text/markdown"},
		{"data.unknownext", "", "application/octet-stream"},
		{"data.unknownext", "multipart/form-data; boundary=x", "application/octet-stream"},
	}
	for _, tt := range tests {
		if got := objectContentType(tt.key, tt.sent); got != tt.want {
			t.Errorf("objectContentType(%q, %q) = %q, want %q", tt.key, tt.sent, got, tt.want)
		}
	}
}
