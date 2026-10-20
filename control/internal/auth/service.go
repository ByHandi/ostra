// Package auth mengelola akun admin dashboard: login, access token (JWT, umur pendek, disimpan
// di memory oleh FE), dan refresh token (acak, dirotasi setiap dipakai, dikirim lewat cookie httpOnly).
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

	"github.com/handi7/storage-edge/control/internal/store"
)

// timeLayout sama dengan format timestamp yang ditulis SQLite (strftime), supaya
// perbandingan string expires_at > now benar.
const timeLayout = "2006-01-02T15:04:05.000Z"

var (
	// ErrInvalidCredentials dipakai untuk email tidak ada maupun password salah,
	// supaya tidak bisa dipakai menebak email yang terdaftar.
	ErrInvalidCredentials = errors.New("email atau password salah")
	ErrSessionExpired     = errors.New("sesi sudah berakhir, silakan login lagi")
	ErrUserExists         = errors.New("user dengan email ini sudah ada")
	ErrUserNotFound       = errors.New("user tidak ditemukan")
)

// FieldError adalah kesalahan input yang terkait satu field form.
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
	// dummyHash dipakai saat email tidak ditemukan, supaya waktu respons login sama.
	dummyHash string
	now       func() time.Time
}

func NewService(db *sql.DB, opts Options) (*Service, error) {
	if len(opts.JWTSecret) < 32 {
		return nil, errors.New("JWT secret minimal 32 karakter")
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

// Session adalah hasil login atau refresh.
type Session struct {
	AccessToken  string
	ExpiresIn    time.Duration
	RefreshToken string
	RefreshTTL   time.Duration
}

// Client mencatat asal sesi, hanya untuk informasi.
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

	// Kesempatan murah untuk membersihkan sesi kedaluwarsa.
	s.q.DeleteExpiredSessions(ctx, s.now().UTC().Format(timeLayout))

	return s.newSession(ctx, s.q, user.ID, c)
}

// Refresh menukar refresh token dengan pasangan token baru. Token lama langsung dihapus (rotasi).
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

// Authenticate memverifikasi access token dan mengembalikan user-nya.
func (s *Service) Authenticate(ctx context.Context, accessToken string) (store.User, error) {
	id, err := s.tokens.verify(accessToken)
	if err != nil {
		return store.User{}, err
	}
	user, err := s.q.GetUser(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		// User sudah dihapus, token-nya ikut tidak berlaku.
		return store.User{}, ErrInvalidToken
	}
	return user, err
}

// ChangePassword mengganti password lalu mengakhiri semua sesi user tersebut,
// dan membuka sesi baru untuk client yang sedang dipakai.
func (s *Service) ChangePassword(ctx context.Context, userID int64, current, next string, c Client) (Session, error) {
	user, err := s.q.GetUser(ctx, userID)
	if err != nil {
		return Session{}, err
	}
	if err := VerifyPassword(user.PasswordHash, current); err != nil {
		if errors.Is(err, errMismatch) {
			return Session{}, &FieldError{Field: "currentPassword", Message: "password saat ini salah"}
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

// CreateUser dipakai CLI `control createuser`.
func (s *Service) CreateUser(ctx context.Context, email, name, password string) (store.User, error) {
	email = strings.TrimSpace(email)
	if _, err := mail.ParseAddress(email); err != nil {
		return store.User{}, fmt.Errorf("email %q tidak valid", email)
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return store.User{}, errors.New("nama wajib diisi")
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

// SetPassword dipakai CLI `control setpassword` untuk reset password tanpa password lama.
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
		return fmt.Errorf("password minimal %d karakter", MinPasswordLength)
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
