// Package garage is a minimal client for the Garage v2 admin API.
package garage

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

// Error is an error response from the admin API, e.g. {"code":"NoSuchBucket","message":"..."}.
type Error struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string {
	return fmt.Sprintf("garage: %s (%d): %s", e.Code, e.Status, e.Message)
}

// IsNotFound reports whether err means the bucket/key does not exist.
func IsNotFound(err error) bool {
	var ge *Error
	return errors.As(err, &ge) && ge.Status == http.StatusNotFound
}

type Bucket struct {
	ID            string   `json:"id"`
	Created       string   `json:"created"`
	GlobalAliases []string `json:"globalAliases"`
}

type BucketQuotas struct {
	MaxSize    *int64 `json:"maxSize"`
	MaxObjects *int64 `json:"maxObjects"`
}

type BucketInfo struct {
	Bucket
	WebsiteAccess bool         `json:"websiteAccess"`
	Objects       int64        `json:"objects"`
	Bytes         int64        `json:"bytes"`
	Keys          []BucketKey  `json:"keys"`
	Quotas        BucketQuotas `json:"quotas"`
}

type Permissions struct {
	Read  bool `json:"read"`
	Write bool `json:"write"`
	Owner bool `json:"owner"`
}

// BucketKey is an access key that has permissions on a bucket.
type BucketKey struct {
	AccessKeyID string      `json:"accessKeyId"`
	Name        string      `json:"name"`
	Permissions Permissions `json:"permissions"`
}

type Key struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Created string `json:"created"`
	Expired bool   `json:"expired"`
}

// KeyBucket is a bucket that a key can access.
type KeyBucket struct {
	ID            string      `json:"id"`
	GlobalAliases []string    `json:"globalAliases"`
	Permissions   Permissions `json:"permissions"`
}

type KeyInfo struct {
	AccessKeyID string `json:"accessKeyId"`
	Name        string `json:"name"`
	Created     string `json:"created"`
	Expired     bool   `json:"expired"`
	// SecretAccessKey is only set in the CreateKey response.
	SecretAccessKey string      `json:"secretAccessKey,omitempty"`
	Buckets         []KeyBucket `json:"buckets"`
}

type ClusterHealth struct {
	Status          string `json:"status"`
	KnownNodes      int    `json:"knownNodes"`
	ConnectedNodes  int    `json:"connectedNodes"`
	StorageNodes    int    `json:"storageNodes"`
	StorageNodesUp  int    `json:"storageNodesUp"`
	Partitions      int    `json:"partitions"`
	PartitionsAllOk int    `json:"partitionsAllOk"`
}

// HasAlias reports whether the global alias is already installed on this bucket.
func (b Bucket) HasAlias(alias string) bool {
	return slices.Contains(b.GlobalAliases, alias)
}

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func NewClient(baseURL, token string) *Client {
	return &Client{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		token:   token,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *Client) Health(ctx context.Context) (ClusterHealth, error) {
	var out ClusterHealth
	err := c.do(ctx, http.MethodGet, "/v2/GetClusterHealth", nil, nil, &out)
	return out, err
}

func (c *Client) ListBuckets(ctx context.Context) ([]Bucket, error) {
	var out []Bucket
	err := c.do(ctx, http.MethodGet, "/v2/ListBuckets", nil, nil, &out)
	return out, err
}

func (c *Client) GetBucketByAlias(ctx context.Context, alias string) (BucketInfo, error) {
	var out BucketInfo
	err := c.do(ctx, http.MethodGet, "/v2/GetBucketInfo", url.Values{"globalAlias": {alias}}, nil, &out)
	return out, err
}

func (c *Client) GetBucket(ctx context.Context, id string) (BucketInfo, error) {
	var out BucketInfo
	err := c.do(ctx, http.MethodGet, "/v2/GetBucketInfo", url.Values{"id": {id}}, nil, &out)
	return out, err
}

func (c *Client) CreateBucket(ctx context.Context, alias string) (BucketInfo, error) {
	var out BucketInfo
	err := c.do(ctx, http.MethodPost, "/v2/CreateBucket", nil, map[string]any{"globalAlias": alias}, &out)
	return out, err
}

// DeleteBucket only succeeds for empty buckets (Garage replies 409 BucketNotEmpty).
func (c *Client) DeleteBucket(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodPost, "/v2/DeleteBucket", url.Values{"id": {id}}, nil, nil)
}

// AddAlias installs a global alias. Safe to repeat if the alias already points to the same bucket.
func (c *Client) AddAlias(ctx context.Context, bucketID, alias string) error {
	return c.do(ctx, http.MethodPost, "/v2/AddBucketAlias", nil,
		map[string]any{"bucketId": bucketID, "globalAlias": alias}, nil)
}

// RemoveAlias removes a global alias. Garage replies 500 if the alias no longer exists,
// so callers should check HasAlias first.
func (c *Client) RemoveAlias(ctx context.Context, bucketID, alias string) error {
	return c.do(ctx, http.MethodPost, "/v2/RemoveBucketAlias", nil,
		map[string]any{"bucketId": bucketID, "globalAlias": alias}, nil)
}

func (c *Client) EnableWebsite(ctx context.Context, bucketID string) error {
	body := map[string]any{
		"websiteAccess": map[string]any{
			"enabled":       true,
			"indexDocument": "index.html",
			"errorDocument": nil,
		},
	}
	return c.do(ctx, http.MethodPost, "/v2/UpdateBucket", url.Values{"id": {bucketID}}, body, nil)
}

func (c *Client) UpdateBucketQuotas(ctx context.Context, bucketID string, q BucketQuotas) error {
	body := map[string]any{
		"quotas": map[string]any{
			"maxSize":    q.MaxSize,
			"maxObjects": q.MaxObjects,
		},
	}
	return c.do(ctx, http.MethodPost, "/v2/UpdateBucket", url.Values{"id": {bucketID}}, body, nil)
}

func (c *Client) ListKeys(ctx context.Context) ([]Key, error) {
	var out []Key
	err := c.do(ctx, http.MethodGet, "/v2/ListKeys", nil, nil, &out)
	return out, err
}

func (c *Client) GetKey(ctx context.Context, id string) (KeyInfo, error) {
	var out KeyInfo
	err := c.do(ctx, http.MethodGet, "/v2/GetKeyInfo", url.Values{"id": {id}}, nil, &out)
	return out, err
}

// CreateKey creates an access key. The secret is only returned here and cannot be read again via the API.
func (c *Client) CreateKey(ctx context.Context, name string) (KeyInfo, error) {
	var out KeyInfo
	err := c.do(ctx, http.MethodPost, "/v2/CreateKey", nil, map[string]any{"name": name}, &out)
	return out, err
}

func (c *Client) DeleteKey(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodPost, "/v2/DeleteKey", url.Values{"id": {id}}, nil, nil)
}

// AllowBucketKey grants the permissions set to true; permissions set to false are left unchanged.
func (c *Client) AllowBucketKey(ctx context.Context, bucketID, keyID string, p Permissions) error {
	return c.do(ctx, http.MethodPost, "/v2/AllowBucketKey", nil,
		map[string]any{"bucketId": bucketID, "accessKeyId": keyID, "permissions": p}, nil)
}

// DenyBucketKey revokes the permissions set to true; permissions set to false are left unchanged.
func (c *Client) DenyBucketKey(ctx context.Context, bucketID, keyID string, p Permissions) error {
	return c.do(ctx, http.MethodPost, "/v2/DenyBucketKey", nil,
		map[string]any{"bucketId": bucketID, "accessKeyId": keyID, "permissions": p}, nil)
}

func (c *Client) do(ctx context.Context, method, path string, query url.Values, body, out any) error {
	u := c.baseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}

	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, u, reqBody)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("garage: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		ge := &Error{Status: resp.StatusCode}
		if err := json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(ge); err != nil || ge.Code == "" {
			ge.Code = http.StatusText(resp.StatusCode)
		}
		return ge
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
