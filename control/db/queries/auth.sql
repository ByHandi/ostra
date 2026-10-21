-- name: CreateUser :one
INSERT INTO users (email, name, password_hash)
VALUES (?, ?, ?)
RETURNING *;

-- name: GetUser :one
SELECT * FROM users WHERE id = ?;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = ?;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: UpdateUserPassword :exec
UPDATE users
SET password_hash = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ?;

-- name: CreateSession :one
INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: GetValidSession :one
SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?;

-- name: DeleteSessionByHash :exec
DELETE FROM sessions WHERE token_hash = ?;

-- name: DeleteUserSessions :exec
DELETE FROM sessions WHERE user_id = ?;

-- name: DeleteExpiredSessions :exec
DELETE FROM sessions WHERE expires_at <= ?;
