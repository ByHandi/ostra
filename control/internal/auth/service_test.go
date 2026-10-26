package auth

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/ByHandi/ostra/control/internal/store"
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
	hash, err := HashPassword("secret123")
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyPassword(hash, "secret123"); err != nil {
		t.Fatalf("correct password rejected: %v", err)
	}
	if err := VerifyPassword(hash, "wrong"); !errors.Is(err, errMismatch) {
		t.Fatalf("wrong password: err = %v", err)
	}
	if err := VerifyPassword("not-a-hash", "x"); err == nil || errors.Is(err, errMismatch) {
		t.Fatalf("corrupt hash must return a different error, got %v", err)
	}
}

func TestSessionLifecycle(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(t)

	if _, err := svc.CreateUser(ctx, "admin@example.com", "Admin", "short", RoleAdmin); err == nil {
		t.Fatal("short password must be rejected")
	}
	user, err := svc.CreateUser(ctx, "admin@example.com", "Admin", "secret123", RoleAdmin)
	if err != nil {
		t.Fatal(err)
	}
	if user.Role != RoleAdmin {
		t.Fatalf("expected role %s, got %s", RoleAdmin, user.Role)
	}
	if _, err := svc.CreateUser(ctx, "ADMIN@example.com", "Other", "secret123", RoleAdmin); !errors.Is(err, ErrUserExists) {
		t.Fatalf("duplicate email (different case): err = %v", err)
	}

	if _, err := svc.Login(ctx, "admin@example.com", "wrong-password", Client{}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("wrong password: err = %v", err)
	}
	if _, err := svc.Login(ctx, "nobody@example.com", "secret123", Client{}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("unknown email: err = %v", err)
	}

	sess, err := svc.Login(ctx, "Admin@Example.com", "secret123", Client{})
	if err != nil {
		t.Fatal(err)
	}
	got, err := svc.Authenticate(ctx, sess.AccessToken)
	if err != nil || got.ID != user.ID {
		t.Fatalf("Authenticate() = %+v, %v", got, err)
	}
	if _, err := svc.Authenticate(ctx, sess.AccessToken+"x"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("corrupt token: err = %v", err)
	}

	// Rotation: an old refresh token cannot be used twice.
	next, err := svc.Refresh(ctx, sess.RefreshToken, Client{})
	if err != nil || next.RefreshToken == sess.RefreshToken {
		t.Fatalf("Refresh() = %+v, %v", next, err)
	}
	if _, err := svc.Refresh(ctx, sess.RefreshToken, Client{}); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("old refresh token: err = %v", err)
	}

	// Changing the password ends other sessions.
	other, _ := svc.Login(ctx, "admin@example.com", "secret123", Client{})
	var fe *FieldError
	if _, err := svc.ChangePassword(ctx, user.ID, "wrong", "newpass123", Client{}); !errors.As(err, &fe) || fe.Field != "currentPassword" {
		t.Fatalf("wrong old password: err = %v", err)
	}
	if _, err := svc.ChangePassword(ctx, user.ID, "secret123", "123", Client{}); !errors.As(err, &fe) || fe.Field != "newPassword" {
		t.Fatalf("short new password: err = %v", err)
	}
	changed, err := svc.ChangePassword(ctx, user.ID, "secret123", "newpass123", Client{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Refresh(ctx, other.RefreshToken, Client{}); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("other session after password change: err = %v", err)
	}
	if _, err := svc.Refresh(ctx, changed.RefreshToken, Client{}); err != nil {
		t.Fatalf("new session after password change: %v", err)
	}

	// Logout revokes the refresh token.
	last, _ := svc.Login(ctx, "admin@example.com", "newpass123", Client{})
	if err := svc.Logout(ctx, last.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Refresh(ctx, last.RefreshToken, Client{}); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("refresh after logout: err = %v", err)
	}
}

func TestBootstrapAdmin(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(t)

	if _, _, err := svc.BootstrapAdmin(ctx, "admin@example.com", "Admin", "short"); err == nil {
		t.Fatal("short password must be rejected")
	}
	user, created, err := svc.BootstrapAdmin(ctx, "admin@example.com", "Admin", "secret123")
	if err != nil || !created || user.Email != "admin@example.com" {
		t.Fatalf("first run: user = %+v, created = %v, err = %v", user, created, err)
	}

	// Once an account exists, later starts leave it alone: a password changed in the
	// dashboard survives, and a different ADMIN_EMAIL adds no second account.
	if err := svc.SetPassword(ctx, "admin@example.com", "changed123"); err != nil {
		t.Fatal(err)
	}
	for _, email := range []string{"admin@example.com", "other@example.com"} {
		if _, created, err := svc.BootstrapAdmin(ctx, email, "Admin", "secret123"); err != nil || created {
			t.Fatalf("restart with %s: created = %v, err = %v", email, created, err)
		}
	}
	if _, err := svc.Login(ctx, "admin@example.com", "changed123", Client{}); err != nil {
		t.Fatalf("changed password no longer works: %v", err)
	}
	if _, err := svc.Login(ctx, "other@example.com", "secret123", Client{}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("second account was created: err = %v", err)
	}
}

func TestExpiredRefreshToken(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(t)
	svc.CreateUser(ctx, "admin@example.com", "Admin", "secret123", RoleAdmin)

	sess, err := svc.Login(ctx, "admin@example.com", "secret123", Client{})
	if err != nil {
		t.Fatal(err)
	}
	svc.now = func() time.Time { return time.Now().Add(2 * time.Hour) }
	if _, err := svc.Refresh(ctx, sess.RefreshToken, Client{}); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("expired refresh token: err = %v", err)
	}
}

func TestLoginLimiter(t *testing.T) {
	l := NewLoginLimiter(time.Hour, 3)
	for i := range 3 {
		if !l.Allow("1.2.3.4") {
			t.Fatalf("attempt %d rejected", i+1)
		}
	}
	if l.Allow("1.2.3.4") {
		t.Fatal("attempt 4 must be rejected")
	}
	if !l.Allow("5.6.7.8") {
		t.Fatal("other IPs must not be blocked too")
	}
}

func TestUserRoles(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(t)

	// CreateUser with default empty role -> admin
	u1, err := svc.CreateUser(ctx, "u1@example.com", "U1", "secret123", "")
	if err != nil || u1.Role != RoleAdmin {
		t.Fatalf("CreateUser with empty role: err=%v, role=%s", err, u1.Role)
	}

	// CreateUser with viewer role
	u2, err := svc.CreateUser(ctx, "u2@example.com", "U2", "secret123", RoleViewer)
	if err != nil || u2.Role != RoleViewer {
		t.Fatalf("CreateUser with viewer role: err=%v, role=%s", err, u2.Role)
	}

	// CreateUser with invalid role
	if _, err := svc.CreateUser(ctx, "u3@example.com", "U3", "secret123", "superadmin"); !errors.Is(err, ErrInvalidRole) {
		t.Fatalf("CreateUser with invalid role: got %v, want ErrInvalidRole", err)
	}

	// SetRole invalid role
	if err := svc.SetRole(ctx, "u2@example.com", "owner"); !errors.Is(err, ErrInvalidRole) {
		t.Fatalf("SetRole with invalid role: got %v, want ErrInvalidRole", err)
	}

	// SetRole unknown user
	if err := svc.SetRole(ctx, "unknown@example.com", RoleAdmin); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("SetRole with unknown email: got %v, want ErrUserNotFound", err)
	}

	// SetRole viewer to admin
	if err := svc.SetRole(ctx, "u2@example.com", RoleAdmin); err != nil {
		t.Fatalf("SetRole to admin: %v", err)
	}

	// Now there are 2 admins (u1 and u2). Demoting u1 to viewer succeeds.
	if err := svc.SetRole(ctx, "u1@example.com", RoleViewer); err != nil {
		t.Fatalf("demoting u1: %v", err)
	}

	// Demoting the last remaining admin (u2) must fail.
	if err := svc.SetRole(ctx, "u2@example.com", RoleViewer); !errors.Is(err, ErrDemoteLastAdmin) {
		t.Fatalf("demoting last admin: got %v, want ErrDemoteLastAdmin", err)
	}

	// SetRole to same role is a no-op
	if err := svc.SetRole(ctx, "u2@example.com", RoleAdmin); err != nil {
		t.Fatalf("SetRole to same role: %v", err)
	}
}

func TestRoleImmediateEffectAndSessionRevocation(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(t)

	// Create two admins so demoting one is allowed.
	admin1, err := svc.CreateUser(ctx, "admin1@example.com", "Admin 1", "secret123", RoleAdmin)
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.CreateUser(ctx, "admin2@example.com", "Admin 2", "secret123", RoleAdmin)
	if err != nil {
		t.Fatal(err)
	}

	sess, err := svc.Login(ctx, "admin1@example.com", "secret123", Client{})
	if err != nil {
		t.Fatal(err)
	}

	// Before role change, Authenticate returns RoleAdmin
	user, err := svc.Authenticate(ctx, sess.AccessToken)
	if err != nil || user.Role != RoleAdmin {
		t.Fatalf("Authenticate before role change: role=%s, err=%v", user.Role, err)
	}

	// Demote admin1 to viewer
	if err := svc.SetRole(ctx, admin1.Email, RoleViewer); err != nil {
		t.Fatal(err)
	}

	// Immediate effect: next Authenticate with existing access token returns RoleViewer immediately!
	user, err = svc.Authenticate(ctx, sess.AccessToken)
	if err != nil || user.Role != RoleViewer {
		t.Fatalf("Authenticate after role change: role=%s, err=%v", user.Role, err)
	}

	// Changing role revoked refresh sessions
	if _, err := svc.Refresh(ctx, sess.RefreshToken, Client{}); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("refresh after role change: got %v, want ErrSessionExpired", err)
	}
}
