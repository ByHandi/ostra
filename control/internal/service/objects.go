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
