// Package auth manages dashboard admin accounts: login, access tokens (JWT, short-lived, kept
// in memory by the FE), and refresh tokens (random, rotated on every use, sent via an httpOnly cookie).
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/ByHandi/ostra/control/internal/store"
)

// timeLayout matches the timestamp format SQLite writes (strftime), so that
// the string comparison expires_at > now is correct.
const timeLayout = "2006-01-02T15:04:05.000Z"

var (
	// ErrInvalidCredentials is used for both an unknown email and a wrong password,
	// so it cannot be used to guess which emails are registered.
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrSessionExpired     = errors.New("session expired, please log in again")
	ErrUserExists         = errors.New("a user with this email already exists")
	ErrUserNotFound       = errors.New("user not found")
)

// FieldError is an input error tied to a single form field.
type FieldError struct {
	Field   string
	Message string
}

func (e *FieldError) Error() string { return e.Message }

type Options struct {
	JWTSecret  string
	AccessTTL  time.Duration
	RefreshTTL time.Duration
}

type Service struct {
	db         *sql.DB
	q          *store.Queries
	tokens     tokens
	refreshTTL time.Duration
	// dummyHash is used when the email is not found, so login response time stays the same.
	dummyHash string
	now       func() time.Time
}

func NewService(db *sql.DB, opts Options) (*Service, error) {
	if len(opts.JWTSecret) < 32 {
		return nil, errors.New("JWT secret must be at least 32 characters")
	}
	dummy, err := HashPassword("dummy-password-for-timing")
	if err != nil {
		return nil, err
	}
	return &Service{
		db:         db,
		q:          store.New(db),
		tokens:     tokens{secret: []byte(opts.JWTSecret), ttl: opts.AccessTTL},
		refreshTTL: opts.RefreshTTL,
		dummyHash:  dummy,
		now:        time.Now,
	}, nil
}

// Session is the result of a login or refresh.
type Session struct {
	AccessToken  string
	ExpiresIn    time.Duration
	RefreshToken string
	RefreshTTL   time.Duration
}

// Client records where a session came from, for information only.
type Client struct {
	UserAgent string
	IP        string
}

func (s *Service) Login(ctx context.Context, email, password string, c Client) (Session, error) {
	user, err := s.q.GetUserByEmail(ctx, strings.TrimSpace(email))
	if errors.Is(err, sql.ErrNoRows) {
		VerifyPassword(s.dummyHash, password)
		return Session{}, ErrInvalidCredentials
	}
	if err != nil {
		return Session{}, err
	}
	if err := VerifyPassword(user.PasswordHash, password); err != nil {
		if errors.Is(err, errMismatch) {
			return Session{}, ErrInvalidCredentials
		}
		return Session{}, err
	}

	// A cheap opportunity to clean up expired sessions.
	s.q.DeleteExpiredSessions(ctx, s.now().UTC().Format(timeLayout))

	return s.newSession(ctx, s.q, user.ID, c)
}

// Refresh exchanges a refresh token for a new token pair. The old token is deleted immediately (rotation).
func (s *Service) Refresh(ctx context.Context, refreshToken string, c Client) (Session, error) {
	if refreshToken == "" {
		return Session{}, ErrSessionExpired
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Session{}, err
	}
	defer tx.Rollback()
	q := s.q.WithTx(tx)

	hash := hashToken(refreshToken)
	sess, err := q.GetValidSession(ctx, store.GetValidSessionParams{
		TokenHash: hash,
		ExpiresAt: s.now().UTC().Format(timeLayout),
	})
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrSessionExpired
	}
	if err != nil {
		return Session{}, err
	}
	if err := q.DeleteSessionByHash(ctx, hash); err != nil {
		return Session{}, err
	}

	out, err := s.newSession(ctx, q, sess.UserID, c)
	if err != nil {
		return Session{}, err
	}
	return out, tx.Commit()
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	return s.q.DeleteSessionByHash(ctx, hashToken(refreshToken))
}

// Authenticate verifies an access token and returns its user.
func (s *Service) Authenticate(ctx context.Context, accessToken string) (store.User, error) {
	id, err := s.tokens.verify(accessToken)
	if err != nil {
		return store.User{}, err
	}
	user, err := s.q.GetUser(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		// The user has been deleted, so their token is no longer valid either.
		return store.User{}, ErrInvalidToken
	}
	return user, err
}

// ChangePassword changes the password, then ends all of that user's sessions
// and opens a new session for the current client.
func (s *Service) ChangePassword(ctx context.Context, userID int64, current, next string, c Client) (Session, error) {
	user, err := s.q.GetUser(ctx, userID)
	if err != nil {
		return Session{}, err
	}
	if err := VerifyPassword(user.PasswordHash, current); err != nil {
		if errors.Is(err, errMismatch) {
			return Session{}, &FieldError{Field: "currentPassword", Message: "current password is incorrect"}
		}
		return Session{}, err
	}
	if err := validatePassword(next); err != nil {
		return Session{}, &FieldError{Field: "newPassword", Message: err.Error()}
	}

	hash, err := HashPassword(next)
	if err != nil {
		return Session{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Session{}, err
	}
	defer tx.Rollback()
	q := s.q.WithTx(tx)

	if err := q.UpdateUserPassword(ctx, store.UpdateUserPasswordParams{PasswordHash: hash, ID: userID}); err != nil {
		return Session{}, err
	}
	if err := q.DeleteUserSessions(ctx, userID); err != nil {
		return Session{}, err
	}
	out, err := s.newSession(ctx, q, userID, c)
	if err != nil {
		return Session{}, err
	}
	return out, tx.Commit()
}

// CreateUser is used by the CLI `control createuser`.
func (s *Service) CreateUser(ctx context.Context, email, name, password string) (store.User, error) {
	email = strings.TrimSpace(email)
	if _, err := mail.ParseAddress(email); err != nil {
		return store.User{}, fmt.Errorf("email %q is not valid", email)
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return store.User{}, errors.New("name is required")
	}
	if err := validatePassword(password); err != nil {
		return store.User{}, err
	}

	if _, err := s.q.GetUserByEmail(ctx, email); err == nil {
		return store.User{}, ErrUserExists
	} else if !errors.Is(err, sql.ErrNoRows) {
		return store.User{}, err
	}

	hash, err := HashPassword(password)
	if err != nil {
		return store.User{}, err
	}
	return s.q.CreateUser(ctx, store.CreateUserParams{Email: email, Name: name, PasswordHash: hash})
}

// BootstrapAdmin creates the first account from ADMIN_EMAIL/ADMIN_PASSWORD at startup. It does
// nothing once any account exists, so it never overwrites a password changed since then.
// created reports whether an account was made.
func (s *Service) BootstrapAdmin(ctx context.Context, email, name, password string) (user store.User, created bool, err error) {
	count, err := s.q.CountUsers(ctx)
	if err != nil || count > 0 {
		return store.User{}, false, err
	}
	user, err = s.CreateUser(ctx, email, name, password)
	if err != nil {
		return store.User{}, false, err
	}
	return user, true, nil
}

// SetPassword is used by the CLI `control setpassword` to reset a password without the old one.
func (s *Service) SetPassword(ctx context.Context, email, password string) error {
	user, err := s.q.GetUserByEmail(ctx, strings.TrimSpace(email))
	if errors.Is(err, sql.ErrNoRows) {
		return ErrUserNotFound
	}
	if err != nil {
		return err
	}
	if err := validatePassword(password); err != nil {
		return err
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	if err := s.q.UpdateUserPassword(ctx, store.UpdateUserPasswordParams{PasswordHash: hash, ID: user.ID}); err != nil {
		return err
	}
	return s.q.DeleteUserSessions(ctx, user.ID)
}

func (s *Service) newSession(ctx context.Context, q *store.Queries, userID int64, c Client) (Session, error) {
	now := s.now()
	access, err := s.tokens.issue(userID, now)
	if err != nil {
		return Session{}, err
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return Session{}, err
	}
	refresh := base64.RawURLEncoding.EncodeToString(raw)

	_, err = q.CreateSession(ctx, store.CreateSessionParams{
		UserID:    userID,
		TokenHash: hashToken(refresh),
		ExpiresAt: now.Add(s.refreshTTL).UTC().Format(timeLayout),
		UserAgent: truncate(c.UserAgent, 255),
		IP:        c.IP,
	})
	if err != nil {
		return Session{}, err
	}
	return Session{
		AccessToken:  access,
		ExpiresIn:    s.tokens.ttl,
		RefreshToken: refresh,
		RefreshTTL:   s.refreshTTL,
	}, nil
}

func validatePassword(p string) error {
	if len(p) < MinPasswordLength {
		return fmt.Errorf("password must be at least %d characters", MinPasswordLength)
	}
	return nil
}

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
