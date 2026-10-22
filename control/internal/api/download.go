package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
)

// downloadTokens signs short-lived download links. A browser download (<a href>, a new tab)
// cannot send the Authorization header, so the dashboard first asks for a link while
// authenticated, then navigates to it. A token names exactly one file and expires quickly.
type downloadTokens struct {
	key []byte
	ttl time.Duration
	now func() time.Time
}

type downloadClaims struct {
	Bucket  string `json:"b"`
	Key     string `json:"k"`
	Expires int64  `json:"e"`
	Preview bool   `json:"p,omitempty"`
}

// newDownloadTokens derives its own key from secret, so a download token can never be
// used as (or confused with) an access token signed with the same secret.
func newDownloadTokens(secret string, ttl time.Duration) downloadTokens {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("ostra download link v1"))
	return downloadTokens{key: mac.Sum(nil), ttl: ttl, now: time.Now}
}

func (t downloadTokens) issue(bucketID, key string) (string, time.Time) {
	return t.issueWithTTL(bucketID, key, t.ttl)
}

func (t downloadTokens) issueWithTTL(bucketID, key string, ttl time.Duration) (string, time.Time) {
	return t.issueClaims(downloadClaims{Bucket: bucketID, Key: key}, ttl)
}

func (t downloadTokens) issuePreview(bucketID, key string) (string, time.Time) {
	return t.issueClaims(downloadClaims{Bucket: bucketID, Key: key, Preview: true}, t.ttl)
}

func (t downloadTokens) issueClaims(claims downloadClaims, ttl time.Duration) (string, time.Time) {
	exp := t.now().Add(ttl).Truncate(time.Second)
	claims.Expires = exp.Unix()
	payload, _ := json.Marshal(claims)
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	return encoded + "." + t.sign(encoded), exp
}

// verify returns the claims a valid, unexpired token was issued for.
func (t downloadTokens) verify(token string) (downloadClaims, bool) {
	encoded, sig, found := strings.Cut(token, ".")
	if !found || !hmac.Equal([]byte(sig), []byte(t.sign(encoded))) {
		return downloadClaims{}, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return downloadClaims{}, false
	}
	var claims downloadClaims
	if err := json.Unmarshal(payload, &claims); err != nil || claims.Bucket == "" || claims.Key == "" {
		return downloadClaims{}, false
	}
	if t.now().Unix() > claims.Expires {
		return downloadClaims{}, false
	}
	return claims, true
}

func (t downloadTokens) sign(encoded string) string {
	mac := hmac.New(sha256.New, t.key)
	mac.Write([]byte(encoded))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
