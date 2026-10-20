package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/handi7/storage-edge/control/internal/auth"
	"github.com/handi7/storage-edge/control/internal/service"
	"github.com/handi7/storage-edge/control/internal/store"
)

// stubGarage tidak dipakai oleh endpoint yang dites di sini.
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
	if _, err := authSvc.CreateUser(context.Background(), "admin@example.com", "Admin", "rahasia123"); err != nil {
		t.Fatal(err)
	}
	svc := service.New(store.New(db), stubGarage{}, nil, service.Options{})
	ui := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ui")) })

	srv := httptest.NewServer(NewHandler(svc, authSvc, Options{
		CookieSecure: false,
		Version:      Version{Version: "v1.2.3", Commit: "abc123"},
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
		t.Fatalf("tidak ada access_token: %+v", r.body)
	}
	return tok
}

func TestAuthFlow(t *testing.T) {
	srv := newTestServer(t)

	// Tanpa token.
	if r := call(t, srv, "GET", "/api/me", "", nil, ""); r.status != 401 || r.body.Success || r.body.Error.Type != "unauthorized" {
		t.Fatalf("GET /api/me tanpa token = %d %+v", r.status, r.body)
	}

	// Validasi per field.
	r := call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"","password":""}`)
	if r.status != 400 || len(r.body.Error.Errors["email"]) != 1 || len(r.body.Error.Errors["password"]) != 1 {
		t.Fatalf("login kosong = %d %+v", r.status, r.body.Error)
	}

	// Password salah.
	if r := call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"salah"}`); r.status != 401 {
		t.Fatalf("login salah = %d", r.status)
	}

	// Login sukses: access token + cookie refresh httpOnly yang dibatasi ke /api/auth.
	r = call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"rahasia123"}`)
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
		t.Fatalf("GET /api/version tanpa token = %d, want 401", r.status)
	}

	// Refresh merotasi cookie; cookie lama tidak berlaku lagi.
	r = call(t, srv, "POST", "/api/auth/refresh-token", "", cookie, "")
	if r.status != 200 || r.cookie == nil || r.cookie.Value == cookie.Value {
		t.Fatalf("refresh = %d %+v", r.status, r.body)
	}
	accessToken(t, r)
	newCookie := r.cookie
	if r := call(t, srv, "POST", "/api/auth/refresh-token", "", cookie, ""); r.status != 401 || r.cookie == nil || r.cookie.MaxAge >= 0 {
		t.Fatalf("refresh dengan cookie lama = %d cookie=%+v", r.status, r.cookie)
	}

	// Logout menghapus cookie dan mencabut refresh token.
	if r := call(t, srv, "POST", "/api/auth/logout", "", newCookie, ""); r.status != 200 || r.cookie == nil || r.cookie.MaxAge >= 0 {
		t.Fatalf("logout = %d cookie=%+v", r.status, r.cookie)
	}
	if r := call(t, srv, "POST", "/api/auth/refresh-token", "", newCookie, ""); r.status != 401 {
		t.Fatalf("refresh setelah logout = %d", r.status)
	}
}

func TestRoutingAndLoginRateLimit(t *testing.T) {
	srv := newTestServer(t)

	if r := call(t, srv, "GET", "/api/tidak-ada", "", nil, ""); r.status != 404 || r.body.Error == nil {
		t.Fatalf("endpoint tidak ada = %d %+v", r.status, r.body)
	}

	// Path di luar /api dilayani UI.
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
		last = call(t, srv, "POST", "/api/auth/login", "", nil, `{"email":"admin@example.com","password":"salah"}`).status
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("percobaan login ke-6 = %d, want 429", last)
	}
}
