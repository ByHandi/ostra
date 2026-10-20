package auth

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/handi7/storage-edge/control/internal/store"
)

func newTestService(t *testing.T) *Service {
	t.Helper()
	db, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "auth.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	svc, err := NewService(db, Options{
		JWTSecret:  "test-secret-test-secret-test-secret!",
		AccessTTL:  time.Minute,
		RefreshTTL: time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}
	return svc
}

func TestPasswordHash(t *testing.T) {
	hash, err := HashPassword("rahasia123")
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyPassword(hash, "rahasia123"); err != nil {
		t.Fatalf("password benar ditolak: %v", err)
	}
	if err := VerifyPassword(hash, "salah"); !errors.Is(err, errMismatch) {
		t.Fatalf("password salah: err = %v", err)
	}
	if err := VerifyPassword("bukan-hash", "x"); err == nil || errors.Is(err, errMismatch) {
		t.Fatalf("hash rusak harus error berbeda, got %v", err)
	}
}

func TestSessionLifecycle(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(t)

	if _, err := svc.CreateUser(ctx, "admin@example.com", "Admin", "pendek"); err == nil {
		t.Fatal("password pendek harus ditolak")
	}
	user, err := svc.CreateUser(ctx, "admin@example.com", "Admin", "rahasia123")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateUser(ctx, "ADMIN@example.com", "Lain", "rahasia123"); !errors.Is(err, ErrUserExists) {
		t.Fatalf("email duplikat (beda huruf besar): err = %v", err)
	}

	if _, err := svc.Login(ctx, "admin@example.com", "salah-password", Client{}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("password salah: err = %v", err)
	}
	if _, err := svc.Login(ctx, "tidak@ada.com", "rahasia123", Client{}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("email tidak ada: err = %v", err)
	}

	sess, err := svc.Login(ctx, "Admin@Example.com", "rahasia123", Client{})
	if err != nil {
		t.Fatal(err)
	}
	got, err := svc.Authenticate(ctx, sess.AccessToken)
	if err != nil || got.ID != user.ID {
		t.Fatalf("Authenticate() = %+v, %v", got, err)
	}
	if _, err := svc.Authenticate(ctx, sess.AccessToken+"x"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("token rusak: err = %v", err)
	}

	// Rotasi: refresh token lama tidak bisa dipakai dua kali.
	next, err := svc.Refresh(ctx, sess.RefreshToken, Client{})
	if err != nil || next.RefreshToken == sess.RefreshToken {
		t.Fatalf("Refresh() = %+v, %v", next, err)
	}
	if _, err := svc.Refresh(ctx, sess.RefreshToken, Client{}); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("refresh token lama: err = %v", err)
	}

	// Ganti password mengakhiri sesi lain.
	other, _ := svc.Login(ctx, "admin@example.com", "rahasia123", Client{})
	var fe *FieldError
	if _, err := svc.ChangePassword(ctx, user.ID, "salah", "baru12345", Client{}); !errors.As(err, &fe) || fe.Field != "currentPassword" {
		t.Fatalf("password lama salah: err = %v", err)
	}
	if _, err := svc.ChangePassword(ctx, user.ID, "rahasia123", "123", Client{}); !errors.As(err, &fe) || fe.Field != "newPassword" {
		t.Fatalf("password baru pendek: err = %v", err)
	}
	changed, err := svc.ChangePassword(ctx, user.ID, "rahasia123", "baru12345", Client{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Refresh(ctx, other.RefreshToken, Client{}); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("sesi lain setelah ganti password: err = %v", err)
	}
	if _, err := svc.Refresh(ctx, changed.RefreshToken, Client{}); err != nil {
		t.Fatalf("sesi baru setelah ganti password: %v", err)
	}

	// Logout mencabut refresh token.
	last, _ := svc.Login(ctx, "admin@example.com", "baru12345", Client{})
	if err := svc.Logout(ctx, last.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Refresh(ctx, last.RefreshToken, Client{}); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("refresh setelah logout: err = %v", err)
	}
}

func TestExpiredRefreshToken(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(t)
	svc.CreateUser(ctx, "admin@example.com", "Admin", "rahasia123")

	sess, err := svc.Login(ctx, "admin@example.com", "rahasia123", Client{})
	if err != nil {
		t.Fatal(err)
	}
	svc.now = func() time.Time { return time.Now().Add(2 * time.Hour) }
	if _, err := svc.Refresh(ctx, sess.RefreshToken, Client{}); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("refresh token kedaluwarsa: err = %v", err)
	}
}

func TestLoginLimiter(t *testing.T) {
	l := NewLoginLimiter(time.Hour, 3)
	for i := range 3 {
		if !l.Allow("1.2.3.4") {
			t.Fatalf("percobaan ke-%d ditolak", i+1)
		}
	}
	if l.Allow("1.2.3.4") {
		t.Fatal("percobaan ke-4 harus ditolak")
	}
	if !l.Allow("5.6.7.8") {
		t.Fatal("IP lain tidak boleh ikut terblokir")
	}
}
