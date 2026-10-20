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
}

// newDownloadTokens derives its own key from secret, so a download token can never be
// used as (or confused with) an access token signed with the same secret.
func newDownloadTokens(secret string, ttl time.Duration) downloadTokens {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("storage-edge download link v1"))
	return downloadTokens{key: mac.Sum(nil), ttl: ttl, now: time.Now}
}

func (t downloadTokens) issue(bucketID, key string) (string, time.Time) {
	exp := t.now().Add(t.ttl).Truncate(time.Second)
	payload, _ := json.Marshal(downloadClaims{Bucket: bucketID, Key: key, Expires: exp.Unix()})
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	return encoded + "." + t.sign(encoded), exp
}

// verify returns the bucket and key a valid, unexpired token was issued for.
func (t downloadTokens) verify(token string) (bucketID, key string, ok bool) {
	encoded, sig, found := strings.Cut(token, ".")
	if !found || !hmac.Equal([]byte(sig), []byte(t.sign(encoded))) {
		return "", "", false
	}
	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return "", "", false
	}
	var c downloadClaims
	if err := json.Unmarshal(payload, &c); err != nil || c.Bucket == "" || c.Key == "" {
		return "", "", false
	}
	if t.now().Unix() > c.Expires {
		return "", "", false
	}
	return c.Bucket, c.Key, true
}

func (t downloadTokens) sign(encoded string) string {
	mac := hmac.New(sha256.New, t.key)
	mac.Write([]byte(encoded))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
