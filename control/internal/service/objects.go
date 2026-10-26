package service

import (
	"context"
	"errors"
	"io"
	"mime"
	"path"
	"strings"
	"unicode/utf8"

	"github.com/ByHandi/ostra/control/internal/objects"
)

// ObjectStore is the S3 side of the object browser. *objects.Client implements it.
type ObjectStore interface {
	List(ctx context.Context, bucket, prefix, cursor string, limit int) (objects.Page, error)
	Open(ctx context.Context, bucket, key string) (io.ReadCloser, objects.Object, error)
	Put(ctx context.Context, bucket, key string, r io.Reader, size int64, contentType string) (objects.Object, error)
	Delete(ctx context.Context, bucket, key string) error
	DeletePrefix(ctx context.Context, bucket, prefix string) (int, error)
	Copy(ctx context.Context, bucket, srcKey, destKey string) error
	CopyPrefix(ctx context.Context, bucket, srcPrefix, destPrefix string) (int, error)
	GetCORS(ctx context.Context, bucket string) (objects.CORSConfiguration, error)
	SetCORS(ctx context.Context, bucket string, cfg objects.CORSConfiguration) error
	DeleteCORS(ctx context.Context, bucket string) error
	GetLifecycle(ctx context.Context, bucket string) (objects.LifecycleConfiguration, error)
	SetLifecycle(ctx context.Context, bucket string, cfg objects.LifecycleConfiguration) error
	DeleteLifecycle(ctx context.Context, bucket string) error
	GetMetadata(ctx context.Context, bucket, key string) (objects.ObjectMetadata, error)
	UpdateMetadata(ctx context.Context, bucket, key string, meta objects.Metadata) error
}

const (
	defaultListLimit = 100
	maxListLimit     = 1000
	// maxKeyBytes is the S3 limit on object key length.
	maxKeyBytes = 1024
)

// ListObjects lists the direct children of prefix ("" for the bucket root, otherwise ending in "/").
func (s *Service) ListObjects(ctx context.Context, bucketID, prefix, cursor string, limit int) (objects.Page, error) {
	if err := validatePrefix(prefix); err != nil {
		return objects.Page{}, err
	}
	if limit <= 0 || limit > maxListLimit {
		limit = defaultListLimit
	}
	var page objects.Page
	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		var err error
		page, err = st.List(ctx, bucket, prefix, cursor, limit)
		return err
	})
	return page, err
}

// PutObject uploads one file. size may be -1 when unknown.
func (s *Service) PutObject(ctx context.Context, bucketID, key string, r io.Reader, size int64, contentType string) (objects.Object, error) {
	if err := ValidateObjectKey(key); err != nil {
		return objects.Object{}, err
	}
	contentType = objectContentType(key, contentType)
	var obj objects.Object
	err := s.withBucket(ctx, bucketID, false, func(st ObjectStore, bucket string) error {
		var err error
		obj, err = st.Put(ctx, bucket, key, r, size, contentType)
		return err
	})
	return obj, err
}

// OpenObject streams one file. The caller must close the reader.
func (s *Service) OpenObject(ctx context.Context, bucketID, key string) (io.ReadCloser, objects.Object, error) {
	if err := ValidateObjectKey(key); err != nil {
		return nil, objects.Object{}, err
	}
	var (
		body io.ReadCloser
		obj  objects.Object
	)
	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		var err error
		body, obj, err = st.Open(ctx, bucket, key)
		return err
	})
	if errors.Is(err, objects.ErrNotFound) {
		return nil, objects.Object{}, notFound("file not found")
	}
	return body, obj, err
}

// DeleteObject removes one file. Deleting a file that no longer exists succeeds.
func (s *Service) DeleteObject(ctx context.Context, bucketID, key string) error {
	if err := ValidateObjectKey(key); err != nil {
		return err
	}
	return s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		return st.Delete(ctx, bucket, key)
	})
}

// DeleteFolder removes every file under prefix and returns how many were deleted.
// The bucket root cannot be deleted this way.
func (s *Service) DeleteFolder(ctx context.Context, bucketID, prefix string) (int, error) {
	if prefix == "" {
		return 0, invalid("prefix", "choose a folder to delete")
	}
	if err := validatePrefix(prefix); err != nil {
		return 0, err
	}
	var deleted int
	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		var err error
		deleted, err = st.DeletePrefix(ctx, bucket, prefix)
		return err
	})
	return deleted, err
}

// CopyObject duplicates one file within a bucket.
func (s *Service) CopyObject(ctx context.Context, bucketID, srcKey, destKey string) error {
	if err := validateCopyMoveFiles(srcKey, destKey); err != nil {
		return err
	}
	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		return st.Copy(ctx, bucket, srcKey, destKey)
	})
	if errors.Is(err, objects.ErrNotFound) {
		return notFound("file not found")
	}
	return err
}

// CopyFolder duplicates every file under srcPrefix into destPrefix.
func (s *Service) CopyFolder(ctx context.Context, bucketID, srcPrefix, destPrefix string) (int, error) {
	if err := validateCopyMoveFolders(srcPrefix, destPrefix); err != nil {
		return 0, err
	}
	var copied int
	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		var err error
		copied, err = st.CopyPrefix(ctx, bucket, srcPrefix, destPrefix)
		return err
	})
	if err != nil {
		return 0, err
	}
	if copied == 0 {
		return 0, notFound("folder not found or empty")
	}
	return copied, nil
}

// MoveObject renames or moves one file within a bucket.
func (s *Service) MoveObject(ctx context.Context, bucketID, srcKey, destKey string) error {
	if err := validateCopyMoveFiles(srcKey, destKey); err != nil {
		return err
	}
	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		if err := st.Copy(ctx, bucket, srcKey, destKey); err != nil {
			return err
		}
		return st.Delete(ctx, bucket, srcKey)
	})
	if errors.Is(err, objects.ErrNotFound) {
		return notFound("file not found")
	}
	return err
}

// MoveFolder moves every file under srcPrefix into destPrefix.
func (s *Service) MoveFolder(ctx context.Context, bucketID, srcPrefix, destPrefix string) (int, error) {
	if err := validateCopyMoveFolders(srcPrefix, destPrefix); err != nil {
		return 0, err
	}
	var moved int
	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		var err error
		moved, err = st.CopyPrefix(ctx, bucket, srcPrefix, destPrefix)
		if err != nil {
			return err
		}
		if moved == 0 {
			return notFound("folder not found or empty")
		}
		_, err = st.DeletePrefix(ctx, bucket, srcPrefix)
		return err
	})
	return moved, err
}

// GetObjectMetadata returns the metadata and HTTP headers of an object.
func (s *Service) GetObjectMetadata(ctx context.Context, bucketID, key string) (objects.ObjectMetadata, error) {
	if err := ValidateObjectKey(key); err != nil {
		return objects.ObjectMetadata{}, err
	}
	var meta objects.ObjectMetadata
	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		var err error
		meta, err = st.GetMetadata(ctx, bucket, key)
		return err
	})
	if errors.Is(err, objects.ErrNotFound) {
		return objects.ObjectMetadata{}, notFound("file not found")
	}
	return meta, err
}

// UpdateObjectMetadata validates and replaces HTTP headers (Content-Type, Cache-Control, Content-Disposition) for an object.
func (s *Service) UpdateObjectMetadata(ctx context.Context, bucketID, key string, meta objects.Metadata) (objects.ObjectMetadata, error) {
	if err := ValidateObjectKey(key); err != nil {
		return objects.ObjectMetadata{}, err
	}
	meta.ContentType = strings.TrimSpace(meta.ContentType)
	meta.CacheControl = strings.TrimSpace(meta.CacheControl)
	meta.ContentDisposition = strings.TrimSpace(meta.ContentDisposition)

	if err := validateMetadata(meta); err != nil {
		return objects.ObjectMetadata{}, err
	}

	err := s.withBucket(ctx, bucketID, true, func(st ObjectStore, bucket string) error {
		return st.UpdateMetadata(ctx, bucket, key, meta)
	})
	if errors.Is(err, objects.ErrNotFound) {
		return objects.ObjectMetadata{}, notFound("file not found")
	}
	if err != nil {
		return objects.ObjectMetadata{}, err
	}
	return s.GetObjectMetadata(ctx, bucketID, key)
}

func validateCopyMoveFiles(src, dest string) error {
	if src == "" {
		return invalid("src", "source file name is required")
	}
	if strings.HasSuffix(src, "/") {
		return invalid("src", "source file name must not end with /")
	}
	if err := validatePath(src, "src"); err != nil {
		return err
	}
	if dest == "" {
		return invalid("dest", "destination file name is required")
	}
	if strings.HasSuffix(dest, "/") {
		return invalid("dest", "destination file name must not end with /")
	}
	if err := validatePath(dest, "dest"); err != nil {
		return err
	}
	if src == dest {
		return invalid("dest", "destination must be different from source")
	}
	return nil
}

func validateCopyMoveFolders(src, dest string) error {
	if src == "" || src == "/" {
		return invalid("src", "choose a folder to copy or move")
	}
	if !strings.HasSuffix(src, "/") {
		return invalid("src", "source folder must end with /")
	}
	if err := validatePath(strings.TrimSuffix(src, "/"), "src"); err != nil {
		return err
	}
	if dest == "" || dest == "/" {
		return invalid("dest", "destination folder is required")
	}
	if !strings.HasSuffix(dest, "/") {
		return invalid("dest", "destination folder must end with /")
	}
	if err := validatePath(strings.TrimSuffix(dest, "/"), "dest"); err != nil {
		return err
	}
	if src == dest {
		return invalid("dest", "destination must be different from source")
	}
	if strings.HasPrefix(dest, src) {
		return invalid("dest", "cannot copy or move a folder into itself or its subfolder")
	}
	return nil
}

// objectContentType keeps a meaningful type sent by the uploader and otherwise guesses one
// from the extension. Form encodings (what curl sends by default) describe the request, not
// the file, so they are ignored too.
func objectContentType(key, sent string) string {
	media, _, _ := mime.ParseMediaType(sent)
	switch media {
	case "", "application/octet-stream", "application/x-www-form-urlencoded", "multipart/form-data":
		if guessed := mime.TypeByExtension(path.Ext(key)); guessed != "" {
			return guessed
		}
		return "application/octet-stream"
	}
	return sent
}

// ValidateObjectKey checks a file key such as "photos/2026/cat.jpg".
func ValidateObjectKey(key string) error {
	if key == "" {
		return invalid("key", "file name is required")
	}
	if strings.HasSuffix(key, "/") {
		return invalid("key", "file name must not end with /")
	}
	return validatePath(key, "key")
}

// validatePrefix checks a folder prefix: "" (bucket root) or a path ending in "/".
func validatePrefix(prefix string) error {
	if prefix == "" {
		return nil
	}
	if !strings.HasSuffix(prefix, "/") {
		return invalid("prefix", "folder must end with /")
	}
	return validatePath(strings.TrimSuffix(prefix, "/"), "prefix")
}

// validatePath rejects keys that S3 accepts but that are confusing or unsafe to show and
// download: control characters, empty or relative path segments, and over-long keys.
func validatePath(p, field string) error {
	if len(p) > maxKeyBytes {
		return invalid(field, "path must be at most %d bytes", maxKeyBytes)
	}
	if !utf8.ValidString(p) {
		return invalid(field, "path must be valid UTF-8")
	}
	if strings.ContainsFunc(p, func(r rune) bool { return r < 0x20 || r == 0x7f }) {
		return invalid(field, "path must not contain control characters")
	}
	for _, seg := range strings.Split(p, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return invalid(field, "path must not start with /, contain //, or use . or .. as a folder")
		}
	}
	return nil
}

func validateMetadata(meta objects.Metadata) error {
	if err := validateContentType(meta.ContentType); err != nil {
		return err
	}
	if err := validateCacheControl(meta.CacheControl); err != nil {
		return err
	}
	return validateContentDisposition(meta.ContentDisposition)
}

func validateContentType(ct string) error {
	if ct == "" {
		return invalid("contentType", "Content-Type is required")
	}
	if len(ct) > 255 {
		return invalid("contentType", "Content-Type must be at most 255 characters")
	}
	if hasHeaderControlChars(ct) {
		return invalid("contentType", "Content-Type must not contain control characters")
	}
	if _, _, err := mime.ParseMediaType(ct); err != nil {
		return invalid("contentType", "invalid Content-Type format")
	}
	return nil
}

func validateCacheControl(cc string) error {
	if cc == "" {
		return nil
	}
	if len(cc) > 512 {
		return invalid("cacheControl", "Cache-Control must be at most 512 characters")
	}
	if hasHeaderControlChars(cc) {
		return invalid("cacheControl", "Cache-Control must not contain control characters")
	}
	return nil
}

func validateContentDisposition(cd string) error {
	if cd == "" {
		return nil
	}
	if len(cd) > 512 {
		return invalid("contentDisposition", "Content-Disposition must be at most 512 characters")
	}
	if hasHeaderControlChars(cd) {
		return invalid("contentDisposition", "Content-Disposition must not contain control characters")
	}
	dispType, _, err := mime.ParseMediaType(cd)
	if err != nil || (dispType != "inline" && dispType != "attachment") {
		return invalid("contentDisposition", `Content-Disposition must be "inline", "attachment", or follow RFC 6266 (e.g. attachment; filename="file.ext")`)
	}
	return nil
}

func hasHeaderControlChars(s string) bool {
	return strings.ContainsFunc(s, func(r rune) bool {
		return (r < 0x20 && r != '\t') || r == 0x7f
	})
}
