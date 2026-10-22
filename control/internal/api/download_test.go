package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDownloadTokens(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	tokens := newDownloadTokens("jwt-secret-jwt-secret-jwt-secret!!", time.Minute)
	tokens.now = func() time.Time { return now }

	tok, exp := tokens.issue("bucket-1", "photos/cat.jpg")
	if !exp.Equal(now.Add(time.Minute)) {
		t.Fatalf("expires = %v", exp)
	}
	share, shareExp := tokens.issueWithTTL("bucket-1", "photos/cat.jpg", 7*24*time.Hour)
	if !shareExp.Equal(now.Add(7 * 24 * time.Hour)) {
		t.Fatalf("share expires = %v", shareExp)
	}
	if b, k, ok := tokens.verify(share); !ok || b != "bucket-1" || k != "photos/cat.jpg" {
		t.Fatalf("verify(share) = %q %q %v", b, k, ok)
	}
	if b, k, ok := tokens.verify(tok); !ok || b != "bucket-1" || k != "photos/cat.jpg" {
		t.Fatalf("verify(valid) = %q %q %v", b, k, ok)
	}

	payload, sig, _ := strings.Cut(tok, ".")
	other, _ := tokens.issue("bucket-1", "other.txt")
	otherPayload, _, _ := strings.Cut(other, ".")

	bad := map[string]string{
		"empty":           "",
		"no signature":    payload,
		"wrong signature": payload + ".AAAA",
		"swapped payload": otherPayload + "." + sig, // signature of a different file
		"garbage":         "not-a-token",
		"other secret key": func() string {
			o := newDownloadTokens("another-secret-another-secret-xx", time.Minute)
			t, _ := o.issue("bucket-1", "photos/cat.jpg")
			return t
		}(),
	}
	for name, tk := range bad {
		if _, _, ok := tokens.verify(tk); ok {
			t.Errorf("verify(%s) accepted an invalid token", name)
		}
	}

	now = now.Add(2 * time.Minute)
	if _, _, ok := tokens.verify(tok); ok {
		t.Fatal("verify accepted an expired token")
	}
}

func TestShareLinkTTL(t *testing.T) {
	for _, tt := range []struct {
		expiresIn string
		want      time.Duration
	}{
		{"1h", shareLinkHour},
		{"1d", shareLinkDay},
		{"7d", shareLinkWeek},
	} {
		if got, ok := shareLinkTTL(tt.expiresIn); !ok || got != tt.want {
			t.Errorf("shareLinkTTL(%q) = %v, %v; want %v, true", tt.expiresIn, got, ok, tt.want)
		}
	}
	if _, ok := shareLinkTTL("5m"); ok {
		t.Error("shareLinkTTL accepted an invalid expiry")
	}
}

func TestDownloadRejectsBadToken(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/api/downloads/not-a-token")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusGone {
		t.Fatalf("GET /api/downloads/<bad> = %d, want 410", resp.StatusCode)
	}
}

func TestUploadSizeLimit(t *testing.T) {
	h := &Handler{opts: Options{MaxUploadBytes: 1 << 20}}
	r := httptest.NewRequest(http.MethodPut, "/api/buckets/b/objects?key=big.bin", strings.NewReader(""))
	r.ContentLength = 2 << 20
	w := httptest.NewRecorder()
	h.uploadObject(w, r)
	if w.Code != http.StatusRequestEntityTooLarge || !strings.Contains(w.Body.String(), "1 MB upload limit") {
		t.Fatalf("upload over limit = %d %s", w.Code, w.Body.String())
	}
}
