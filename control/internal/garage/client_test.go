package garage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClient(t *testing.T) {
	var gotAuth, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		switch r.URL.Path {
		case "/v2/GetBucketInfo":
			if r.URL.Query().Get("globalAlias") != "assets" {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"code":"NoSuchBucket","message":"Bucket not found: x"}`))
				return
			}
			w.Write([]byte(`{"id":"abc","globalAliases":["assets"],"websiteAccess":true,"websiteConfig":{"indexDocument":"index.html","errorDocument":"404.html"},"objects":2,"quotas":{"maxSize":1000,"maxObjects":10}}`))
		case "/v2/UpdateBucket":
			var body struct {
				Quotas        BucketQuotas `json:"quotas"`
				WebsiteAccess *struct {
					Enabled       bool    `json:"enabled"`
					IndexDocument *string `json:"indexDocument"`
					ErrorDocument *string `json:"errorDocument"`
				} `json:"websiteAccess"`
			}
			json.NewDecoder(r.Body).Decode(&body)
			if body.WebsiteAccess != nil {
				idx := ""
				if body.WebsiteAccess.IndexDocument != nil {
					idx = *body.WebsiteAccess.IndexDocument
				}
				errDoc := ""
				if body.WebsiteAccess.ErrorDocument != nil {
					errDoc = *body.WebsiteAccess.ErrorDocument
				}
				gotBody = fmt.Sprintf("%s|web:%v|%s|%s", r.URL.Query().Get("id"), body.WebsiteAccess.Enabled, idx, errDoc)
			} else {
				var size, count string
				if body.Quotas.MaxSize != nil {
					size = string(rune('0' + *body.Quotas.MaxSize))
				}
				if body.Quotas.MaxObjects != nil {
					count = string(rune('0' + *body.Quotas.MaxObjects))
				}
				gotBody = r.URL.Query().Get("id") + "|" + size + "|" + count
			}
			w.Write([]byte(`{}`))
		case "/v2/AddBucketAlias":
			var body map[string]string
			json.NewDecoder(r.Body).Decode(&body)
			gotBody = body["bucketId"] + "|" + body["globalAlias"]
			w.Write([]byte(`{}`))
		default:
			w.WriteHeader(http.StatusBadGateway)
		}
	}))
	defer srv.Close()

	ctx := context.Background()
	c := NewClient(srv.URL+"/", "secret")

	b, err := c.GetBucketByAlias(ctx, "assets")
	if err != nil {
		t.Fatal(err)
	}
	if b.ID != "abc" || !b.WebsiteAccess || b.WebsiteConfig == nil || b.WebsiteConfig.IndexDocument != "index.html" ||
		b.WebsiteConfig.ErrorDocument == nil || *b.WebsiteConfig.ErrorDocument != "404.html" || !b.HasAlias("assets") || gotAuth != "Bearer secret" ||
		b.Quotas.MaxSize == nil || *b.Quotas.MaxSize != 1000 || b.Quotas.MaxObjects == nil || *b.Quotas.MaxObjects != 10 {
		t.Fatalf("GetBucketByAlias() = %+v, auth %q", b, gotAuth)
	}

	maxSize := int64(5)
	maxObjs := int64(3)
	if err := c.UpdateBucketQuotas(ctx, "abc", BucketQuotas{MaxSize: &maxSize, MaxObjects: &maxObjs}); err != nil || gotBody != "abc|5|3" {
		t.Fatalf("UpdateBucketQuotas() err=%v body=%q", err, gotBody)
	}

	if err := c.UpdateWebsite(ctx, "abc", UpdateWebsiteConfig{Enabled: true, IndexDocument: "index.html", ErrorDocument: "404.html"}); err != nil || gotBody != "abc|web:true|index.html|404.html" {
		t.Fatalf("UpdateWebsite() err=%v body=%q", err, gotBody)
	}
	if err := c.UpdateWebsite(ctx, "abc", UpdateWebsiteConfig{Enabled: false}); err != nil || gotBody != "abc|web:false||" {
		t.Fatalf("UpdateWebsite(disabled) err=%v body=%q", err, gotBody)
	}

	_, err = c.GetBucketByAlias(ctx, "nope")
	if !IsNotFound(err) {
		t.Fatalf("err = %v, want not found", err)
	}

	if err := c.AddAlias(ctx, "abc", "cdn.brand.com"); err != nil || gotBody != "abc|cdn.brand.com" {
		t.Fatalf("AddAlias() err=%v body=%q", err, gotBody)
	}

	// A non-JSON error body still becomes an *Error with the correct status.
	_, err = c.Health(ctx)
	var ge *Error
	if !errors.As(err, &ge) || ge.Status != http.StatusBadGateway {
		t.Fatalf("Health() err = %v", err)
	}
}
