package auth

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwt"
)

const issuer = "storage-edge"

// ErrInvalidToken sengaja tidak menyebut alasan kegagalan, supaya tidak membantu pemalsuan.
var ErrInvalidToken = errors.New("auth: token tidak valid")

// tokens menandatangani dan memverifikasi access token JWT (HS256).
type tokens struct {
	secret []byte
	ttl    time.Duration
}

func (t tokens) issue(userID int64, now time.Time) (string, error) {
	tok, err := jwt.NewBuilder().
		Issuer(issuer).
		Subject(strconv.FormatInt(userID, 10)).
		IssuedAt(now).
		Expiration(now.Add(t.ttl)).
		Build()
	if err != nil {
		return "", fmt.Errorf("build access token: %w", err)
	}
	signed, err := jwt.Sign(tok, jwt.WithKey(jwa.HS256(), t.secret))
	if err != nil {
		return "", fmt.Errorf("sign access token: %w", err)
	}
	return string(signed), nil
}

func (t tokens) verify(raw string) (int64, error) {
	parsed, err := jwt.Parse([]byte(raw),
		jwt.WithKey(jwa.HS256(), t.secret),
		jwt.WithIssuer(issuer),
		jwt.WithValidate(true),
	)
	if err != nil {
		return 0, ErrInvalidToken
	}
	sub, ok := parsed.Subject()
	if !ok {
		return 0, ErrInvalidToken
	}
	id, err := strconv.ParseInt(sub, 10, 64)
	if err != nil || id <= 0 {
		return 0, ErrInvalidToken
	}
	return id, nil
}
