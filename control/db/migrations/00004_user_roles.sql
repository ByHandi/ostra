-- +goose Up
-- Add role column to users table: 'admin' (full access) or 'viewer' (read-only).
-- SQLite ADD COLUMN with constant DEFAULT populates existing rows with 'admin'.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer'));

-- +goose Down
ALTER TABLE users DROP COLUMN role;
