-- name: CreateDomain :one
INSERT INTO domains (domain, bucket_id, bucket_name, verify_token)
VALUES (?, ?, ?, ?)
RETURNING *;

-- name: GetDomain :one
SELECT * FROM domains WHERE id = ?;

-- name: GetDomainByName :one
SELECT * FROM domains WHERE domain = ?;

-- name: ListDomains :many
SELECT * FROM domains ORDER BY created_at DESC, id DESC;

-- name: ListDomainsByStatus :many
SELECT * FROM domains WHERE status = ? ORDER BY id;

-- name: MarkDomainChecked :one
UPDATE domains
SET last_error = ?,
    last_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ?
RETURNING *;

-- name: MarkDomainActive :one
UPDATE domains
SET status = 'active',
    last_error = '',
    last_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    activated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ?
RETURNING *;

-- name: MarkDomainError :one
UPDATE domains
SET status = 'error',
    last_error = ?,
    last_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ?
RETURNING *;

-- name: DeleteDomain :exec
DELETE FROM domains WHERE id = ?;

-- name: ListDomainsByBucket :many
SELECT * FROM domains WHERE bucket_id = ? ORDER BY domain;
