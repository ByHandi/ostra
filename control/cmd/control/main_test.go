package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/ByHandi/ostra/control/internal/auth"
	"github.com/ByHandi/ostra/control/internal/config"
	"github.com/ByHandi/ostra/control/internal/store"
)

func setupTestEnv(t *testing.T) string {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "cmd_test.db")
	t.Setenv("CONTROL_JWT_SECRET", "test-secret-test-secret-test-secret!")
	t.Setenv("EDGE_HOSTNAME", "edge.localhost")
	t.Setenv("GARAGE_ADMIN_TOKEN", "dummy-token")
	t.Setenv("DB_PATH", dbPath)
	t.Setenv("COOKIE_SECURE", "false")
	t.Setenv("DNS_VERIFY", "off")
	return dbPath
}

func checkUserRole(t *testing.T, dbPath, email, wantRole string) {
	t.Helper()
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	db, err := store.Open(context.Background(), cfg.DBPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	q := store.New(db)
	user, err := q.GetUserByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("GetUserByEmail(%q): %v", email, err)
	}
	if user.Role != wantRole {
		t.Fatalf("user %s role = %q, want %q", email, user.Role, wantRole)
	}
}

func feedStdin(t *testing.T, content string) {
	t.Helper()
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.WriteString(content); err != nil {
		t.Fatal(err)
	}
	w.Close()
	oldStdin := os.Stdin
	os.Stdin = r
	t.Cleanup(func() {
		os.Stdin = oldStdin
		r.Close()
	})
}

func TestCLICreateUserAndSetRole(t *testing.T) {
	dbPath := setupTestEnv(t)

	// 1. Create admin user (defaults to role "admin")
	feedStdin(t, "secret123\n")
	argsAdmin := []string{"--email", "admin@example.com", "--name", "Admin", "--password-stdin"}
	if err := createUser(argsAdmin); err != nil {
		t.Fatalf("createUser admin failed: %v", err)
	}
	checkUserRole(t, dbPath, "admin@example.com", auth.RoleAdmin)

	// 2. Create viewer user with --role viewer
	feedStdin(t, "secret123\n")
	argsViewer := []string{"--email", "viewer@example.com", "--name", "Viewer", "--role", "viewer", "--password-stdin"}
	if err := createUser(argsViewer); err != nil {
		t.Fatalf("createUser viewer failed: %v", err)
	}
	checkUserRole(t, dbPath, "viewer@example.com", auth.RoleViewer)

	// 3. Create user with invalid role must fail
	feedStdin(t, "secret123\n")
	argsInvalid := []string{"--email", "bad@example.com", "--name", "Bad", "--role", "owner", "--password-stdin"}
	if err := createUser(argsInvalid); err == nil {
		t.Fatal("createUser with invalid role must fail")
	}

	// 4. Set role using positional arguments: control setrole <email> <role>
	if err := setRole([]string{"viewer@example.com", "admin"}); err != nil {
		t.Fatalf("setRole positional failed: %v", err)
	}
	checkUserRole(t, dbPath, "viewer@example.com", auth.RoleAdmin)

	// Now there are 2 admins: admin@example.com and viewer@example.com.
	// Demote admin@example.com to viewer using flag arguments.
	if err := setRole([]string{"--email", "admin@example.com", "--role", "viewer"}); err != nil {
		t.Fatalf("setRole flags failed: %v", err)
	}
	checkUserRole(t, dbPath, "admin@example.com", auth.RoleViewer)

	// Now viewer@example.com is the ONLY admin left. Demoting it must fail!
	if err := setRole([]string{"viewer@example.com", "viewer"}); err == nil {
		t.Fatal("demoting the last admin must fail")
	}

	// Invalid role on setrole
	if err := setRole([]string{"viewer@example.com", "invalid-role"}); err == nil {
		t.Fatal("setRole with invalid role must fail")
	}

	// Missing args
	if err := setRole([]string{"viewer@example.com"}); err == nil {
		t.Fatal("setRole with missing args must fail")
	}
}
