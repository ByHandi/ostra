package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ByHandi/ostra/control/internal/auth"
	"github.com/ByHandi/ostra/control/internal/service"
	"github.com/ByHandi/ostra/control/internal/store"
)

// stubGarage is not used by the endpoints tested here.
type stubGarage struct{ service.Garage }

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	db, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "api.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	authSvc, err := auth.NewService(db, auth.Options{
		JWTSecret:  "test-secret-test-secret-test-secret!",
		AccessTTL:  time.Minute,
		RefreshTTL: time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := authSvc.CreateUser(context.Background(), "admin@example.com", "Admin", "secret123"); err != nil {
		t.Fatal(err)
	}
	svc := service.New(store.New(db), stubGarage{}, nil, service.Options{})
	ui := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ui")) })

	srv := httptest.NewServer(NewHandler(svc, authSvc, Options{
		CookieSecure: false,
		Version:      Version{Version: "v1.2.3", Commit: "abc123"},
		S3PublicURL:  "https://s3.example.com",
		S3Region:     "garage",
		UI:           ui,
	}).Public())
	t.Cleanup(srv.Close)
	return srv
}

type result struct {
	status int
	body   envelope
	cookie *http.Cookie
}

func call(t *testing.T, srv *httptest.Server, method, path, token string, cookie *http.Cookie, body string) result {
	t.Helper()
	req, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	var out result
	out.status = resp.StatusCode
	json.NewDecoder(resp.Body).Decode(&out.body)
	for _, c := range resp.Cookies() {
		if c.Name == refreshCookie {
			out.cookie = c
		}
	}
	return out
}

func accessToken(t *testing.T, r result) string {
	t.Helper()
	data, _ := r.body.Data.(map[string]any)
	tok, _ := data["access_token"].(string)
	if tok == "" {
		t.Fatalf("no access_token: %+v", r.body)
	}
	return tok
}

func TestAuthFlow(t *testing.T) {
	srv := newTestServer(t)

	// Without a token.
	if r := call(t, srv, "GET", "/api/me", "", nil, ""); r.status != 401 || r.body.Success || r.body.Error.Type != "unauthorized" {
		t.Fatalf("GET /api/me without token = %d %+v", r.status, r.body)
	}

	// Per-field validation.
	r := call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"","password":""}`)
	if r.status != 400 || len(r.body.Error.Errors["email"]) != 1 || len(r.body.Error.Errors["password"]) != 1 {
		t.Fatalf("empty login = %d %+v", r.status, r.body.Error)
	}

	// Wrong password.
	if r := call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"wrong"}`); r.status != 401 {
		t.Fatalf("wrong login = %d", r.status)
	}

	// Successful login: access token + httpOnly refresh cookie scoped to /api/auth.
	r = call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"secret123"}`)
	if r.status != 200 || !r.body.Success || r.cookie == nil || !r.cookie.HttpOnly || r.cookie.Path != "/api/auth" {
		t.Fatalf("login = %d %+v cookie=%+v", r.status, r.body, r.cookie)
	}
	token, cookie := accessToken(t, r), r.cookie

	me := call(t, srv, "GET", "/api/me", token, nil, "")
	if data, _ := me.body.Data.(map[string]any); me.status != 200 || data["email"] != "admin@example.com" {
		t.Fatalf("GET /api/me = %d %+v", me.status, me.body)
	}

	v := call(t, srv, "GET", "/api/version", token, nil, "")
	if data, _ := v.body.Data.(map[string]any); v.status != 200 || data["version"] != "v1.2.3" || data["commit"] != "abc123" {
		t.Fatalf("GET /api/version = %d %+v", v.status, v.body)
	}
	if r := call(t, srv, "GET", "/api/version", "", nil, ""); r.status != 401 {
		t.Fatalf("GET /api/version without token = %d, want 401", r.status)
	}

	cfgRes := call(t, srv, "GET", "/api/config", token, nil, "")
	if data, _ := cfgRes.body.Data.(map[string]any); cfgRes.status != 200 || data["s3Endpoint"] != "https://s3.example.com" || data["s3Region"] != "garage" {
		t.Fatalf("GET /api/config = %d %+v", cfgRes.status, cfgRes.body)
	}
	if r := call(t, srv, "GET", "/api/config", "", nil, ""); r.status != 401 {
		t.Fatalf("GET /api/config without token = %d, want 401", r.status)
	}

	// Refresh rotates the cookie; the old cookie is no longer valid.
	r = call(t, srv, "POST", "/api/auth/refresh-token", "", cookie, "")
	if r.status != 200 || r.cookie == nil || r.cookie.Value == cookie.Value {
		t.Fatalf("refresh = %d %+v", r.status, r.body)
	}
	accessToken(t, r)
	newCookie := r.cookie
	if r := call(t, srv, "POST", "/api/auth/refresh-token", "", cookie, ""); r.status != 401 || r.cookie == nil || r.cookie.MaxAge >= 0 {
		t.Fatalf("refresh with old cookie = %d cookie=%+v", r.status, r.cookie)
	}

	// Logout clears the cookie and revokes the refresh token.
	if r := call(t, srv, "POST", "/api/auth/logout", "", newCookie, ""); r.status != 200 || r.cookie == nil || r.cookie.MaxAge >= 0 {
		t.Fatalf("logout = %d cookie=%+v", r.status, r.cookie)
	}
	if r := call(t, srv, "POST", "/api/auth/refresh-token", "", newCookie, ""); r.status != 401 {
		t.Fatalf("refresh after logout = %d", r.status)
	}
}

func TestPreviewLinkValidation(t *testing.T) {
	srv := newTestServer(t)
	login := call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"secret123"}`)
	token := accessToken(t, login)

	if r := call(t, srv, "POST", "/api/buckets/bucket/objects/preview-link", "", nil, `{"key":"file.txt"}`); r.status != http.StatusUnauthorized {
		t.Fatalf("preview link without token = %d, want 401", r.status)
	}
	if r := call(t, srv, "POST", "/api/buckets/bucket/objects/preview-link", token, nil, `{"key":"file.txt","extra":true}`); r.status != http.StatusBadRequest {
		t.Fatalf("preview link with unknown field = %d, want 400", r.status)
	}
}

func TestShareLinkValidation(t *testing.T) {
	srv := newTestServer(t)
	login := call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"secret123"}`)
	token := accessToken(t, login)

	if r := call(t, srv, "POST", "/api/buckets/bucket/objects/share-link", "", nil, `{"key":"file.txt","expiresIn":"1d"}`); r.status != http.StatusUnauthorized {
		t.Fatalf("share link without token = %d, want 401", r.status)
	}
	if r := call(t, srv, "POST", "/api/buckets/bucket/objects/share-link", token, nil, `{"key":"file.txt","expiresIn":"5m"}`); r.status != http.StatusBadRequest || len(r.body.Error.Errors["expiresIn"]) != 1 {
		t.Fatalf("invalid share link expiry = %d %+v", r.status, r.body.Error)
	}
	if r := call(t, srv, "POST", "/api/buckets/bucket/objects/share-link", token, nil, `{"key":"file.txt","expiresIn":"1d","extra":true}`); r.status != http.StatusBadRequest {
		t.Fatalf("share link with unknown field = %d, want 400", r.status)
	}
}

func TestBucketQuotasValidation(t *testing.T) {
	srv := newTestServer(t)
	login := call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"secret123"}`)
	token := accessToken(t, login)

	if r := call(t, srv, "PUT", "/api/buckets/bucket/quotas", "", nil, `{"maxSize":1000}`); r.status != http.StatusUnauthorized {
		t.Fatalf("quotas without token = %d, want 401", r.status)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/quotas", token, nil, `{"maxSize":1000,"extra":true}`); r.status != http.StatusBadRequest {
		t.Fatalf("quotas with unknown field = %d, want 400", r.status)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/quotas", token, nil, `{"maxSize":"invalid"}`); r.status != http.StatusBadRequest {
		t.Fatalf("quotas with invalid type = %d, want 400", r.status)
	}
}

func TestBucketCORSValidation(t *testing.T) {
	srv := newTestServer(t)
	login := call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"secret123"}`)
	token := accessToken(t, login)

	if r := call(t, srv, "GET", "/api/buckets/bucket/cors", "", nil, ""); r.status != http.StatusUnauthorized {
		t.Fatalf("get cors without token = %d, want 401", r.status)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/cors", "", nil, `{"rules":[]}`); r.status != http.StatusUnauthorized {
		t.Fatalf("put cors without token = %d, want 401", r.status)
	}
	if r := call(t, srv, "DELETE", "/api/buckets/bucket/cors", "", nil, ""); r.status != http.StatusUnauthorized {
		t.Fatalf("delete cors without token = %d, want 401", r.status)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/cors", token, nil, `{"rules":[],"extra":true}`); r.status != http.StatusBadRequest {
		t.Fatalf("put cors with unknown field = %d, want 400", r.status)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/cors", token, nil, `{"rules":[{"allowedOrigins":["*"],"allowedMethods":["INVALID"]}]}`); r.status != http.StatusBadRequest || len(r.body.Error.Errors["rules"]) != 1 {
		t.Fatalf("put cors with invalid method = %d %+v", r.status, r.body.Error)
	}
}

func TestBucketWebsiteValidation(t *testing.T) {
	srv := newTestServer(t)
	login := call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"secret123"}`)
	token := accessToken(t, login)

	if r := call(t, srv, "PUT", "/api/buckets/bucket/website", "", nil, `{"enabled":true}`); r.status != http.StatusUnauthorized {
		t.Fatalf("put website without token = %d, want 401", r.status)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/website", token, nil, `{"enabled":true,"extra":true}`); r.status != http.StatusBadRequest {
		t.Fatalf("put website with unknown field = %d, want 400", r.status)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/website", token, nil, `{"enabled":true,"indexDocument":"sub/index.html"}`); r.status != http.StatusBadRequest || len(r.body.Error.Errors["indexDocument"]) != 1 {
		t.Fatalf("put website with slash in indexDocument = %d %+v", r.status, r.body.Error)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/website", token, nil, `{"enabled":true,"errorDocument":"../404.html"}`); r.status != http.StatusBadRequest || len(r.body.Error.Errors["errorDocument"]) != 1 {
		t.Fatalf("put website with path traversal in errorDocument = %d %+v", r.status, r.body.Error)
	}
}

func TestBucketLifecycleValidation(t *testing.T) {
	srv := newTestServer(t)
	login := call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"secret123"}`)
	token := accessToken(t, login)

	if r := call(t, srv, "GET", "/api/buckets/bucket/lifecycle", "", nil, ""); r.status != http.StatusUnauthorized {
		t.Fatalf("get lifecycle without token = %d, want 401", r.status)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/lifecycle", "", nil, `{"expirationDays":30}`); r.status != http.StatusUnauthorized {
		t.Fatalf("put lifecycle without token = %d, want 401", r.status)
	}
	if r := call(t, srv, "DELETE", "/api/buckets/bucket/lifecycle", "", nil, ""); r.status != http.StatusUnauthorized {
		t.Fatalf("delete lifecycle without token = %d, want 401", r.status)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/lifecycle", token, nil, `{"expirationDays":30,"extra":true}`); r.status != http.StatusBadRequest {
		t.Fatalf("put lifecycle with unknown field = %d, want 400", r.status)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/lifecycle", token, nil, `{"expirationDays":-5}`); r.status != http.StatusBadRequest || len(r.body.Error.Errors["expirationDays"]) != 1 {
		t.Fatalf("put lifecycle with negative expirationDays = %d %+v", r.status, r.body.Error)
	}
	if r := call(t, srv, "PUT", "/api/buckets/bucket/lifecycle", token, nil, `{"abortIncompleteMultipartUploadDays":-1}`); r.status != http.StatusBadRequest || len(r.body.Error.Errors["abortIncompleteMultipartUploadDays"]) != 1 {
		t.Fatalf("put lifecycle with negative abortDays = %d %+v", r.status, r.body.Error)
	}
}

func TestHealthz(t *testing.T) {
	healthy := true
	h := &Handler{opts: Options{Health: func(context.Context) error {
		if !healthy {
			return errors.New("database locked")
		}
		return nil
	}}}
	srv := httptest.NewServer(h.Internal())
	defer srv.Close()

	for _, tt := range []struct {
		healthy bool
		want    int
	}{{true, 200}, {false, 503}} {
		healthy = tt.healthy
		resp, err := http.Get(srv.URL + "/healthz")
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != tt.want {
			t.Fatalf("healthy=%v: /healthz = %d, want %d", tt.healthy, resp.StatusCode, tt.want)
		}
	}
}

func TestRoutingAndLoginRateLimit(t *testing.T) {
	srv := newTestServer(t)

	if r := call(t, srv, "GET", "/api/missing", "", nil, ""); r.status != 404 || r.body.Error == nil {
		t.Fatalf("missing endpoint = %d %+v", r.status, r.body)
	}

	// Paths outside /api are served by the UI.
	resp, err := http.Get(srv.URL + "/buckets/abc")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("GET /buckets/abc = %d", resp.StatusCode)
	}

	var last int
	for range 6 {
		last = call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"wrong"}`).status
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("6th login attempt = %d, want 429", last)
	}
}
