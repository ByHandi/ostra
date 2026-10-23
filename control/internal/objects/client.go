// Package objects is a small S3 client for the object browser, on top of minio-go.
// It talks to Garage's S3 API directly (path-style), never through Caddy.
package objects

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/cors"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// partSize bounds memory per upload: minio-go buffers one part at a time.
const partSize = 16 << 20

// ErrNotFound means the object does not exist.
var ErrNotFound = errors.New("object not found")

// Object describes one stored object.
type Object struct {
	Key          string    `json:"key"`
	Size         int64     `json:"size"`
	LastModified time.Time `json:"lastModified"`
	ETag         string    `json:"etag"`
	ContentType  string    `json:"contentType,omitempty"`
}

// Page is one page of a "folder" listing (prefix + "/" delimiter).
type Page struct {
	// Folders are the full prefixes of sub-folders, each ending in "/".
	Folders    []string `json:"folders"`
	Objects    []Object `json:"objects"`
	NextCursor string   `json:"nextCursor,omitempty"`
}

// CORSRule describes one CORS rule in a bucket's CORS configuration.
type CORSRule struct {
	ID             string   `json:"id,omitempty"`
	AllowedOrigins []string `json:"allowedOrigins"`
	AllowedMethods []string `json:"allowedMethods"`
	AllowedHeaders []string `json:"allowedHeaders,omitempty"`
	ExposeHeaders  []string `json:"exposeHeaders,omitempty"`
	MaxAgeSeconds  int      `json:"maxAgeSeconds,omitempty"`
}

// CORSConfiguration is the full CORS setup on a bucket.
type CORSConfiguration struct {
	Rules []CORSRule `json:"rules"`
}

type Client struct {
	// client does the high-level operations; core is only for single-page listings
	// (minio.Core shadows the high-level methods with low-level ones).
	client *minio.Client
	core   *minio.Core
}

// New connects to an S3 endpoint such as "garage:3900" (plain HTTP inside the Docker network).
func New(endpoint, region, accessKey, secretKey string) (*Client, error) {
	core, err := minio.NewCore(endpoint, &minio.Options{
		Creds:        credentials.NewStaticV4(accessKey, secretKey, ""),
		Region:       region,
		BucketLookup: minio.BucketLookupPath,
	})
	if err != nil {
		return nil, err
	}
	return &Client{client: core.Client, core: core}, nil
}

// List returns the direct children of prefix. cursor is the NextCursor of the previous page.
func (c *Client) List(ctx context.Context, bucket, prefix, cursor string, limit int) (Page, error) {
	res, err := c.core.ListObjectsV2(bucket, prefix, "", cursor, "/", limit)
	if err != nil {
		return Page{}, err
	}

	page := Page{Folders: []string{}, Objects: []Object{}}
	for _, p := range res.CommonPrefixes {
		page.Folders = append(page.Folders, p.Prefix)
	}
	for _, o := range res.Contents {
		// A zero-byte "photos/" object is a folder marker, not a file inside the folder.
		if o.Key == prefix {
			continue
		}
		page.Objects = append(page.Objects, toObject(o))
	}
	if res.IsTruncated {
		page.NextCursor = res.NextContinuationToken
	}
	return page, nil
}

// Open streams an object. The caller must close the reader.
func (c *Client) Open(ctx context.Context, bucket, key string) (io.ReadCloser, Object, error) {
	obj, err := c.client.GetObject(ctx, bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, Object{}, mapErr(err)
	}
	info, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, Object{}, mapErr(err)
	}
	return obj, toObject(info), nil
}

// Put uploads an object. size may be -1 when unknown.
func (c *Client) Put(ctx context.Context, bucket, key string, r io.Reader, size int64, contentType string) (Object, error) {
	info, err := c.client.PutObject(ctx, bucket, key, r, size, minio.PutObjectOptions{
		ContentType: contentType,
		PartSize:    partSize,
	})
	if err != nil {
		return Object{}, mapErr(err)
	}
	return Object{Key: info.Key, Size: info.Size, LastModified: info.LastModified, ETag: info.ETag, ContentType: contentType}, nil
}

// Delete removes one object. Deleting a missing object is not an error (S3 semantics).
func (c *Client) Delete(ctx context.Context, bucket, key string) error {
	return mapErr(c.client.RemoveObject(ctx, bucket, key, minio.RemoveObjectOptions{}))
}

// DeletePrefix removes every object under prefix and returns how many were deleted.
func (c *Client) DeletePrefix(ctx context.Context, bucket, prefix string) (int, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	toDelete := make(chan minio.ObjectInfo)
	var listErr error
	go func() {
		defer close(toDelete)
		for o := range c.client.ListObjects(ctx, bucket, minio.ListObjectsOptions{Prefix: prefix, Recursive: true}) {
			if o.Err != nil {
				listErr = o.Err
				return
			}
			select {
			case toDelete <- o:
			case <-ctx.Done():
				return
			}
		}
	}()

	deleted := 0
	var removeErr error
	for res := range c.client.RemoveObjectsWithResult(ctx, bucket, toDelete, minio.RemoveObjectsOptions{}) {
		if res.Err != nil {
			if removeErr == nil {
				removeErr = fmt.Errorf("delete %s: %w", res.ObjectName, res.Err)
			}
			continue
		}
		deleted++
	}
	if listErr != nil {
		return deleted, mapErr(listErr)
	}
	return deleted, mapErr(removeErr)
}

// GetCORS retrieves the bucket's CORS configuration.
func (c *Client) GetCORS(ctx context.Context, bucket string) (CORSConfiguration, error) {
	cfg, err := c.client.GetBucketCors(ctx, bucket)
	if err != nil {
		return CORSConfiguration{Rules: []CORSRule{}}, mapErr(err)
	}
	if cfg == nil || len(cfg.CORSRules) == 0 {
		return CORSConfiguration{Rules: []CORSRule{}}, nil
	}

	rules := make([]CORSRule, len(cfg.CORSRules))
	for i, r := range cfg.CORSRules {
		origins := r.AllowedOrigin
		if origins == nil {
			origins = []string{}
		}
		methods := r.AllowedMethod
		if methods == nil {
			methods = []string{}
		}
		rules[i] = CORSRule{
			ID:             r.ID,
			AllowedOrigins: origins,
			AllowedMethods: methods,
			AllowedHeaders: r.AllowedHeader,
			ExposeHeaders:  r.ExposeHeader,
			MaxAgeSeconds:  r.MaxAgeSeconds,
		}
	}
	return CORSConfiguration{Rules: rules}, nil
}

// SetCORS applies CORS rules to a bucket. If cfg.Rules is empty, existing CORS is removed.
func (c *Client) SetCORS(ctx context.Context, bucket string, cfg CORSConfiguration) error {
	if len(cfg.Rules) == 0 {
		return mapErr(c.client.SetBucketCors(ctx, bucket, nil))
	}

	rules := make([]cors.Rule, len(cfg.Rules))
	for i, r := range cfg.Rules {
		rules[i] = cors.Rule{
			ID:            r.ID,
			AllowedOrigin: r.AllowedOrigins,
			AllowedMethod: r.AllowedMethods,
			AllowedHeader: r.AllowedHeaders,
			ExposeHeader:  r.ExposeHeaders,
			MaxAgeSeconds: r.MaxAgeSeconds,
		}
	}
	corsCfg := cors.NewConfig(rules)
	return mapErr(c.client.SetBucketCors(ctx, bucket, corsCfg))
}

// DeleteCORS removes CORS configuration from a bucket.
func (c *Client) DeleteCORS(ctx context.Context, bucket string) error {
	return mapErr(c.client.SetBucketCors(ctx, bucket, nil))
}

// IsAccessDenied reports whether S3 rejected the request for lack of permissions.
func IsAccessDenied(err error) bool {
	if err == nil {
		return false
	}
	resp := minio.ToErrorResponse(errors.Unwrap(err))
	if resp.Code == "" {
		resp = minio.ToErrorResponse(err)
	}
	return resp.Code == "AccessDenied" || resp.StatusCode == http.StatusForbidden
}

func mapErr(err error) error {
	if err == nil {
		return nil
	}
	resp := minio.ToErrorResponse(err)
	if resp.Code == "NoSuchKey" || (resp.StatusCode == http.StatusNotFound && !strings.Contains(resp.Code, "Bucket")) {
		return ErrNotFound
	}
	return err
}

func toObject(o minio.ObjectInfo) Object {
	return Object{
		Key:          o.Key,
		Size:         o.Size,
		LastModified: o.LastModified,
		ETag:         strings.Trim(o.ETag, `"`),
		ContentType:  o.ContentType,
	}
}
