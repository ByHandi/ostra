// Package garage adalah client minimal untuk admin API Garage v2.
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

// Error adalah respons error dari admin API, mis. {"code":"NoSuchBucket","message":"..."}.
type Error struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string {
	return fmt.Sprintf("garage: %s (%d): %s", e.Code, e.Status, e.Message)
}

// IsNotFound melaporkan apakah err berarti bucket/key tidak ada.
func IsNotFound(err error) bool {
	var ge *Error
	return errors.As(err, &ge) && ge.Status == http.StatusNotFound
}

type Bucket struct {
	ID            string   `json:"id"`
	Created       string   `json:"created"`
	GlobalAliases []string `json:"globalAliases"`
}

type BucketInfo struct {
	Bucket
	WebsiteAccess bool        `json:"websiteAccess"`
	Objects       int64       `json:"objects"`
	Bytes         int64       `json:"bytes"`
	Keys          []BucketKey `json:"keys"`
}

type Permissions struct {
	Read  bool `json:"read"`
	Write bool `json:"write"`
	Owner bool `json:"owner"`
}

// BucketKey adalah access key yang punya izin di sebuah bucket.
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

// KeyBucket adalah bucket yang bisa diakses sebuah key.
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
	// SecretAccessKey hanya terisi di respons CreateKey.
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

// HasAlias melaporkan apakah alias global sudah terpasang di bucket ini.
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

// DeleteBucket hanya berhasil untuk bucket kosong (Garage membalas 409 BucketNotEmpty).
func (c *Client) DeleteBucket(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodPost, "/v2/DeleteBucket", url.Values{"id": {id}}, nil, nil)
}

// AddAlias memasang alias global. Aman diulang kalau alias sudah menunjuk ke bucket yang sama.
func (c *Client) AddAlias(ctx context.Context, bucketID, alias string) error {
	return c.do(ctx, http.MethodPost, "/v2/AddBucketAlias", nil,
		map[string]any{"bucketId": bucketID, "globalAlias": alias}, nil)
}

// RemoveAlias melepas alias global. Garage membalas 500 kalau alias sudah tidak ada,
// jadi pemanggil sebaiknya cek HasAlias dulu.
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

// CreateKey membuat access key. Secret hanya dikembalikan di sini, tidak bisa dibaca lagi lewat API.
func (c *Client) CreateKey(ctx context.Context, name string) (KeyInfo, error) {
	var out KeyInfo
	err := c.do(ctx, http.MethodPost, "/v2/CreateKey", nil, map[string]any{"name": name}, &out)
	return out, err
}

func (c *Client) DeleteKey(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodPost, "/v2/DeleteKey", url.Values{"id": {id}}, nil, nil)
}

// AllowBucketKey menambahkan izin yang bernilai true; izin yang false tidak diubah.
func (c *Client) AllowBucketKey(ctx context.Context, bucketID, keyID string, p Permissions) error {
	return c.do(ctx, http.MethodPost, "/v2/AllowBucketKey", nil,
		map[string]any{"bucketId": bucketID, "accessKeyId": keyID, "permissions": p}, nil)
}

// DenyBucketKey mencabut izin yang bernilai true; izin yang false tidak diubah.
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
