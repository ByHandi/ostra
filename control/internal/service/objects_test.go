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
	"time"

	"github.com/minio/minio-go/v7"

	"github.com/ByHandi/ostra/control/internal/garage"
	"github.com/ByHandi/ostra/control/internal/objects"
	"github.com/ByHandi/ostra/control/internal/store"
)

// fakeStore is an in-memory S3: bucket name → key → object.
type fakeStore struct {
	data       map[string]map[string]fakeObject
	cors       map[string]objects.CORSConfiguration
	lifecycle  map[string]objects.LifecycleConfiguration
	denyNext   int // the next N calls answer AccessDenied
	createdFor string
}

type fakeObject struct {
	body               []byte
	contentType        string
	cacheControl       string
	contentDisposition string
	lastModified       time.Time
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		data:      map[string]map[string]fakeObject{},
		cors:      map[string]objects.CORSConfiguration{},
		lifecycle: map[string]objects.LifecycleConfiguration{},
	}
}

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
		page.Objects = append(page.Objects, objects.Object{Key: key, Size: int64(len(o.body)), ContentType: o.contentType, LastModified: o.lastModified})
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
	return io.NopCloser(bytes.NewReader(o.body)), objects.Object{Key: key, Size: int64(len(o.body)), ContentType: o.contentType, LastModified: o.lastModified}, nil
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
	now := time.Now()
	f.data[bucket][key] = fakeObject{body: body, contentType: contentType, lastModified: now}
	return objects.Object{Key: key, Size: int64(len(body)), ContentType: contentType, LastModified: now}, nil
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

func (f *fakeStore) Copy(_ context.Context, bucket, srcKey, destKey string) error {
	if err := f.deny(); err != nil {
		return err
	}
	o, ok := f.data[bucket][srcKey]
	if !ok {
		return objects.ErrNotFound
	}
	if f.data[bucket] == nil {
		f.data[bucket] = map[string]fakeObject{}
	}
	f.data[bucket][destKey] = o
	return nil
}

func (f *fakeStore) CopyPrefix(_ context.Context, bucket, srcPrefix, destPrefix string) (int, error) {
	if err := f.deny(); err != nil {
		return 0, err
	}
	type pair struct {
		key string
		obj fakeObject
	}
	var copies []pair
	for key, o := range f.data[bucket] {
		if strings.HasPrefix(key, srcPrefix) {
			rel := strings.TrimPrefix(key, srcPrefix)
			copies = append(copies, pair{key: destPrefix + rel, obj: o})
		}
	}
	for _, cp := range copies {
		if f.data[bucket] == nil {
			f.data[bucket] = map[string]fakeObject{}
		}
		f.data[bucket][cp.key] = cp.obj
	}
	return len(copies), nil
}

func (f *fakeStore) GetCORS(_ context.Context, bucket string) (objects.CORSConfiguration, error) {
	if err := f.deny(); err != nil {
		return objects.CORSConfiguration{}, err
	}
	cfg, ok := f.cors[bucket]
	if !ok || len(cfg.Rules) == 0 {
		return objects.CORSConfiguration{Rules: []objects.CORSRule{}}, nil
	}
	return cfg, nil
}

func (f *fakeStore) SetCORS(_ context.Context, bucket string, cfg objects.CORSConfiguration) error {
	if err := f.deny(); err != nil {
		return err
	}
	if len(cfg.Rules) == 0 {
		delete(f.cors, bucket)
		return nil
	}
	f.cors[bucket] = cfg
	return nil
}

func (f *fakeStore) DeleteCORS(_ context.Context, bucket string) error {
	if err := f.deny(); err != nil {
		return err
	}
	delete(f.cors, bucket)
	return nil
}

func (f *fakeStore) GetLifecycle(_ context.Context, bucket string) (objects.LifecycleConfiguration, error) {
	if err := f.deny(); err != nil {
		return objects.LifecycleConfiguration{}, err
	}
	return f.lifecycle[bucket], nil
}

func (f *fakeStore) SetLifecycle(_ context.Context, bucket string, cfg objects.LifecycleConfiguration) error {
	if err := f.deny(); err != nil {
		return err
	}
	hasExp := cfg.ExpirationDays != nil && *cfg.ExpirationDays > 0
	hasAbort := cfg.AbortIncompleteMultipartUploadDays != nil && *cfg.AbortIncompleteMultipartUploadDays > 0
	if !hasExp && !hasAbort {
		delete(f.lifecycle, bucket)
		return nil
	}
	f.lifecycle[bucket] = cfg
	return nil
}

func (f *fakeStore) DeleteLifecycle(_ context.Context, bucket string) error {
	if err := f.deny(); err != nil {
		return err
	}
	delete(f.lifecycle, bucket)
	return nil
}

func (f *fakeStore) GetMetadata(_ context.Context, bucket, key string) (objects.ObjectMetadata, error) {
	if err := f.deny(); err != nil {
		return objects.ObjectMetadata{}, err
	}
	o, ok := f.data[bucket][key]
	if !ok {
		return objects.ObjectMetadata{}, objects.ErrNotFound
	}
	return objects.ObjectMetadata{
		Key:                key,
		Size:               int64(len(o.body)),
		ContentType:        o.contentType,
		CacheControl:       o.cacheControl,
		ContentDisposition: o.contentDisposition,
		ETag:               "fake-etag",
	}, nil
}

func (f *fakeStore) UpdateMetadata(_ context.Context, bucket, key string, meta objects.Metadata) error {
	if err := f.deny(); err != nil {
		return err
	}
	o, ok := f.data[bucket][key]
	if !ok {
		return objects.ErrNotFound
	}
	o.contentType = meta.ContentType
	o.cacheControl = meta.CacheControl
	o.contentDisposition = meta.ContentDisposition
	f.data[bucket][key] = o
	return nil
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
	g.CreateKey(ctx, "app", nil)
	st := newFakeStore()
	svc, sqlDB := newObjectService(t, g, st)

	// Nothing is created until the object browser is used.
	if keys, _ := svc.ListKeys(ctx); len(keys) != 1 || len(g.keys) != 1 {
		t.Fatalf("before browsing: keys=%v garage=%d", keys, len(g.keys))
	}

	if _, err := svc.ListObjects(ctx, "id-assets", ListObjectsOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ListObjects(ctx, "id-assets", ListObjectsOptions{}); err != nil {
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
	if _, err := svc2.ListObjects(ctx, "id-assets", ListObjectsOptions{}); err != nil || len(g.keys) != 2 || st.createdFor != sysID {
		t.Fatalf("restart: err=%v keys=%d key=%s", err, len(g.keys), st.createdFor)
	}

	// ...and replaces it if it was deleted from Garage.
	delete(g.keys, sysID)
	svc3 := newServiceOnDB(sqlDB, g, st)
	if _, err := svc3.ListObjects(ctx, "id-assets", ListObjectsOptions{}); err != nil {
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

	root, err := svc.ListObjects(ctx, "id-assets", ListObjectsOptions{})
	if err != nil || len(root.Folders) != 1 || root.Folders[0] != "img/" || len(root.Objects) != 1 {
		t.Fatalf("root listing = %+v, %v", root, err)
	}
	img, _ := svc.ListObjects(ctx, "id-assets", ListObjectsOptions{Prefix: "img/"})
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

	_, err = svc.ListObjects(ctx, "id-missing", ListObjectsOptions{})
	wantKind(t, err, KindNotFound)
}

func TestObjectAccessDeniedIsRegranted(t *testing.T) {
	ctx := context.Background()
	g := newFakeGarage("assets")
	st := newFakeStore()
	svc, _ := newObjectService(t, g, st)

	if _, err := svc.ListObjects(ctx, "id-assets", ListObjectsOptions{}); err != nil {
		t.Fatal(err)
	}
	// Someone revoked the permission by hand: the next call is denied once.
	st.denyNext = 1
	if _, err := svc.ListObjects(ctx, "id-assets", ListObjectsOptions{}); err != nil {
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
		_, err := svc.ListObjects(ctx, "id-assets", ListObjectsOptions{Prefix: prefix})
		wantKind(t, err, KindInvalid)
	}
	_, err := svc.DeleteFolder(ctx, "id-assets", "")
	wantKind(t, err, KindInvalid)
}

func TestObjectBrowserDisabled(t *testing.T) {
	svc := newTestService(t, newFakeGarage("assets"), &fakeDNS{}, false)
	if _, err := svc.ListObjects(context.Background(), "id-assets", ListObjectsOptions{}); err != errObjectBrowserDisabled {
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

func TestCopyMoveObject(t *testing.T) {
	ctx := context.Background()
	st := newFakeStore()
	svc, _ := newObjectService(t, newFakeGarage("assets"), st)

	put(t, svc, "id-assets", "docs/spec.txt", "hello world")

	// Same source and destination
	err := svc.CopyObject(ctx, "id-assets", "docs/spec.txt", "docs/spec.txt")
	wantField(t, err, KindInvalid, "dest")
	err = svc.MoveObject(ctx, "id-assets", "docs/spec.txt", "docs/spec.txt")
	wantField(t, err, KindInvalid, "dest")

	// Missing source
	err = svc.CopyObject(ctx, "id-assets", "docs/missing.txt", "docs/out.txt")
	wantKind(t, err, KindNotFound)
	err = svc.MoveObject(ctx, "id-assets", "docs/missing.txt", "docs/out.txt")
	wantKind(t, err, KindNotFound)

	// Invalid names
	err = svc.CopyObject(ctx, "id-assets", "docs/", "docs/out.txt")
	wantField(t, err, KindInvalid, "src")
	err = svc.CopyObject(ctx, "id-assets", "docs/spec.txt", "docs/")
	wantField(t, err, KindInvalid, "dest")
	err = svc.CopyObject(ctx, "id-assets", "../spec.txt", "docs/out.txt")
	wantField(t, err, KindInvalid, "src")

	// Successful copy
	if err := svc.CopyObject(ctx, "id-assets", "docs/spec.txt", "docs/spec-copy.txt"); err != nil {
		t.Fatalf("CopyObject: %v", err)
	}
	r, _, err := svc.OpenObject(ctx, "id-assets", "docs/spec.txt")
	if err != nil {
		t.Fatalf("source after copy: %v", err)
	}
	r.Close()
	r, obj, err := svc.OpenObject(ctx, "id-assets", "docs/spec-copy.txt")
	if err != nil {
		t.Fatalf("dest after copy: %v", err)
	}
	data, _ := io.ReadAll(r)
	r.Close()
	if string(data) != "hello world" || obj.Size != 11 {
		t.Fatalf("dest object content = %q, size = %d", data, obj.Size)
	}

	// Successful move (rename)
	if err := svc.MoveObject(ctx, "id-assets", "docs/spec.txt", "archive/spec-moved.txt"); err != nil {
		t.Fatalf("MoveObject: %v", err)
	}
	_, _, err = svc.OpenObject(ctx, "id-assets", "docs/spec.txt")
	wantKind(t, err, KindNotFound)
	r, obj, err = svc.OpenObject(ctx, "id-assets", "archive/spec-moved.txt")
	if err != nil {
		t.Fatalf("dest after move: %v", err)
	}
	data, _ = io.ReadAll(r)
	r.Close()
	if string(data) != "hello world" || obj.Size != 11 {
		t.Fatalf("dest object content = %q, size = %d", data, obj.Size)
	}
}

func TestCopyMoveFolder(t *testing.T) {
	ctx := context.Background()
	st := newFakeStore()
	svc, _ := newObjectService(t, newFakeGarage("assets"), st)

	put(t, svc, "id-assets", "images/2026/a.png", "img-a")
	put(t, svc, "id-assets", "images/2026/b.png", "img-b")
	put(t, svc, "id-assets", "images/readme.txt", "readme")

	// Validation: folder into itself or its subfolder
	_, err := svc.CopyFolder(ctx, "id-assets", "images/", "images/sub/")
	wantField(t, err, KindInvalid, "dest")
	_, err = svc.MoveFolder(ctx, "id-assets", "images/", "images/sub/")
	wantField(t, err, KindInvalid, "dest")

	// Validation: same prefix
	_, err = svc.CopyFolder(ctx, "id-assets", "images/", "images/")
	wantField(t, err, KindInvalid, "dest")

	// Validation: missing trailing slash
	_, err = svc.CopyFolder(ctx, "id-assets", "images", "backup/")
	wantField(t, err, KindInvalid, "src")
	_, err = svc.CopyFolder(ctx, "id-assets", "images/", "backup")
	wantField(t, err, KindInvalid, "dest")

	// Missing / empty folder
	_, err = svc.CopyFolder(ctx, "id-assets", "empty/", "backup/")
	wantKind(t, err, KindNotFound)
	_, err = svc.MoveFolder(ctx, "id-assets", "empty/", "backup/")
	wantKind(t, err, KindNotFound)

	// Successful CopyFolder
	copied, err := svc.CopyFolder(ctx, "id-assets", "images/", "images-backup/")
	if err != nil {
		t.Fatalf("CopyFolder: %v", err)
	}
	if copied != 3 {
		t.Fatalf("copied = %d, want 3", copied)
	}
	// Source still exists
	r, _, err := svc.OpenObject(ctx, "id-assets", "images/readme.txt")
	if err != nil {
		t.Fatalf("source after copy: %v", err)
	}
	r.Close()
	// Target exists
	r, _, err = svc.OpenObject(ctx, "id-assets", "images-backup/2026/a.png")
	if err != nil {
		t.Fatalf("dest after copy: %v", err)
	}
	r.Close()

	// Successful MoveFolder
	moved, err := svc.MoveFolder(ctx, "id-assets", "images/", "images-archived/")
	if err != nil {
		t.Fatalf("MoveFolder: %v", err)
	}
	if moved != 3 {
		t.Fatalf("moved = %d, want 3", moved)
	}
	// Source is deleted
	_, _, err = svc.OpenObject(ctx, "id-assets", "images/readme.txt")
	wantKind(t, err, KindNotFound)
	// Target exists
	r, _, err = svc.OpenObject(ctx, "id-assets", "images-archived/2026/b.png")
	if err != nil {
		t.Fatalf("dest after move: %v", err)
	}
	r.Close()
}

func TestObjectMetadata(t *testing.T) {
	ctx := context.Background()
	svc, _ := newObjectService(t, newFakeGarage("assets"), newFakeStore())

	// Not found on non-existent object
	_, err := svc.GetObjectMetadata(ctx, "id-assets", "missing.txt")
	wantKind(t, err, KindNotFound)

	// Upload a test object
	_, err = svc.PutObject(ctx, "id-assets", "docs/manual.pdf", strings.NewReader("PDF content"), 11, "application/pdf")
	if err != nil {
		t.Fatalf("PutObject: %v", err)
	}

	// Read initial metadata
	meta, err := svc.GetObjectMetadata(ctx, "id-assets", "docs/manual.pdf")
	if err != nil {
		t.Fatalf("GetObjectMetadata: %v", err)
	}
	if meta.Key != "docs/manual.pdf" || meta.ContentType != "application/pdf" || meta.CacheControl != "" || meta.ContentDisposition != "" {
		t.Fatalf("initial metadata mismatch: %+v", meta)
	}

	// Update metadata with valid headers
	updated, err := svc.UpdateObjectMetadata(ctx, "id-assets", "docs/manual.pdf", objects.Metadata{
		ContentType:        "application/pdf",
		CacheControl:       "public, max-age=31536000, immutable",
		ContentDisposition: `inline; filename="manual.pdf"`,
	})
	if err != nil {
		t.Fatalf("UpdateObjectMetadata: %v", err)
	}
	if updated.CacheControl != "public, max-age=31536000, immutable" || updated.ContentDisposition != `inline; filename="manual.pdf"` {
		t.Fatalf("updated metadata mismatch: %+v", updated)
	}

	// Verify persistence via GetObjectMetadata
	refetched, err := svc.GetObjectMetadata(ctx, "id-assets", "docs/manual.pdf")
	if err != nil {
		t.Fatalf("refetch metadata: %v", err)
	}
	if refetched.CacheControl != "public, max-age=31536000, immutable" || refetched.ContentDisposition != `inline; filename="manual.pdf"` {
		t.Fatalf("persisted metadata mismatch: %+v", refetched)
	}

	// Update on missing object -> KindNotFound
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "missing.txt", objects.Metadata{
		ContentType: "text/plain",
	})
	wantKind(t, err, KindNotFound)

	// Validation tests:
	// Empty content type
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "docs/manual.pdf", objects.Metadata{
		ContentType: "",
	})
	wantField(t, err, KindInvalid, "contentType")

	// Invalid content type format
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "docs/manual.pdf", objects.Metadata{
		ContentType: "invalid/mime; ; ;",
	})
	wantField(t, err, KindInvalid, "contentType")

	// Control character in content type
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "docs/manual.pdf", objects.Metadata{
		ContentType: "application/pdf\r\nX-Injected: true",
	})
	wantField(t, err, KindInvalid, "contentType")

	// Over-long content type (> 255)
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "docs/manual.pdf", objects.Metadata{
		ContentType: "application/" + strings.Repeat("a", 250),
	})
	wantField(t, err, KindInvalid, "contentType")

	// Control character in cache control
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "docs/manual.pdf", objects.Metadata{
		ContentType:  "application/pdf",
		CacheControl: "no-cache\nSet-Cookie: bad",
	})
	wantField(t, err, KindInvalid, "cacheControl")

	// Over-long cache control (> 512)
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "docs/manual.pdf", objects.Metadata{
		ContentType:  "application/pdf",
		CacheControl: strings.Repeat("c", 513),
	})
	wantField(t, err, KindInvalid, "cacheControl")

	// Control character in content disposition
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "docs/manual.pdf", objects.Metadata{
		ContentType:        "application/pdf",
		ContentDisposition: "inline\r\nX-Injected: true",
	})
	wantField(t, err, KindInvalid, "contentDisposition")

	// Over-long content disposition (> 512)
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "docs/manual.pdf", objects.Metadata{
		ContentType:        "application/pdf",
		ContentDisposition: strings.Repeat("d", 513),
	})
	wantField(t, err, KindInvalid, "contentDisposition")

	// Invalid disposition type (neither inline nor attachment)
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "docs/manual.pdf", objects.Metadata{
		ContentType:        "application/pdf",
		ContentDisposition: "unknown-disp",
	})
	wantField(t, err, KindInvalid, "contentDisposition")

	// Invalid key validation
	_, err = svc.GetObjectMetadata(ctx, "id-assets", "")
	wantField(t, err, KindInvalid, "key")
	_, err = svc.UpdateObjectMetadata(ctx, "id-assets", "", objects.Metadata{ContentType: "text/plain"})
	wantField(t, err, KindInvalid, "key")
}

func TestObjectSearchAndSort(t *testing.T) {
	ctx := context.Background()
	st := newFakeStore()
	svc, _ := newObjectService(t, newFakeGarage("assets"), st)

	t1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 1, 2, 10, 0, 0, 0, time.UTC)
	t3 := time.Date(2026, 1, 3, 10, 0, 0, 0, time.UTC)

	st.data["assets"] = map[string]fakeObject{
		"zebra.txt":         {body: []byte("12345"), contentType: "text/plain", lastModified: t2},
		"apple.txt":         {body: []byte("12"), contentType: "text/plain", lastModified: t3},
		"banana.txt":        {body: []byte("123456789"), contentType: "text/plain", lastModified: t1},
		"docs/guide.pdf":    {body: []byte("guide"), contentType: "application/pdf", lastModified: t1},
		"photos/nature.jpg": {body: []byte("img"), contentType: "image/jpeg", lastModified: t1},
	}

	// Default listing
	res, err := svc.ListObjects(ctx, "id-assets", ListObjectsOptions{})
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}
	if len(res.Folders) != 2 || res.Folders[0] != "docs/" || res.Folders[1] != "photos/" {
		t.Fatalf("default folders = %v", res.Folders)
	}
	if len(res.Objects) != 3 || res.Objects[0].Key != "apple.txt" || res.Objects[1].Key != "banana.txt" || res.Objects[2].Key != "zebra.txt" {
		t.Fatalf("default objects = %v", res.Objects)
	}

	// Search filter
	res, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{Search: "na"})
	if err != nil {
		t.Fatalf("search 'na': %v", err)
	}
	if len(res.Folders) != 0 || len(res.Objects) != 1 || res.Objects[0].Key != "banana.txt" {
		t.Fatalf("search 'na' result = %+v", res)
	}

	// Search folder name
	res, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{Search: "doc"})
	if err != nil {
		t.Fatalf("search 'doc': %v", err)
	}
	if len(res.Folders) != 1 || res.Folders[0] != "docs/" || len(res.Objects) != 0 {
		t.Fatalf("search 'doc' result = %+v", res)
	}

	// Search case-insensitive
	res, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{Search: "ZEBRA"})
	if err != nil {
		t.Fatalf("search 'ZEBRA': %v", err)
	}
	if len(res.Objects) != 1 || res.Objects[0].Key != "zebra.txt" {
		t.Fatalf("search 'ZEBRA' result = %+v", res)
	}

	// Search no match
	res, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{Search: "nonexistent"})
	if err != nil {
		t.Fatalf("search 'nonexistent': %v", err)
	}
	if len(res.Folders) != 0 || len(res.Objects) != 0 {
		t.Fatalf("search with no match should be empty: %+v", res)
	}

	// Sort name desc
	res, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{SortBy: "name", Order: "desc"})
	if err != nil {
		t.Fatalf("sort name desc: %v", err)
	}
	if res.Folders[0] != "photos/" || res.Folders[1] != "docs/" {
		t.Fatalf("folders name desc = %v", res.Folders)
	}
	if res.Objects[0].Key != "zebra.txt" || res.Objects[1].Key != "banana.txt" || res.Objects[2].Key != "apple.txt" {
		t.Fatalf("objects name desc = %v", res.Objects)
	}

	// Sort size asc
	res, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{SortBy: "size", Order: "asc"})
	if err != nil {
		t.Fatalf("sort size asc: %v", err)
	}
	if res.Objects[0].Key != "apple.txt" || res.Objects[1].Key != "zebra.txt" || res.Objects[2].Key != "banana.txt" {
		t.Fatalf("objects size asc = %v", res.Objects)
	}

	// Sort size desc
	res, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{SortBy: "size", Order: "desc"})
	if err != nil {
		t.Fatalf("sort size desc: %v", err)
	}
	if res.Objects[0].Key != "banana.txt" || res.Objects[1].Key != "zebra.txt" || res.Objects[2].Key != "apple.txt" {
		t.Fatalf("objects size desc = %v", res.Objects)
	}

	// Sort lastModified asc
	res, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{SortBy: "lastModified", Order: "asc"})
	if err != nil {
		t.Fatalf("sort lastModified asc: %v", err)
	}
	if res.Objects[0].Key != "banana.txt" || res.Objects[1].Key != "zebra.txt" || res.Objects[2].Key != "apple.txt" {
		t.Fatalf("objects lastModified asc = %v", res.Objects)
	}

	// Sort lastModified desc
	res, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{SortBy: "lastModified", Order: "desc"})
	if err != nil {
		t.Fatalf("sort lastModified desc: %v", err)
	}
	if res.Objects[0].Key != "apple.txt" || res.Objects[1].Key != "zebra.txt" || res.Objects[2].Key != "banana.txt" {
		t.Fatalf("objects lastModified desc = %v", res.Objects)
	}

	// Validation
	_, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{SortBy: "invalid"})
	wantField(t, err, KindInvalid, "sortBy")

	_, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{Order: "up"})
	wantField(t, err, KindInvalid, "order")

	_, err = svc.ListObjects(ctx, "id-assets", ListObjectsOptions{Search: strings.Repeat("x", 256)})
	wantField(t, err, KindInvalid, "search")
}
