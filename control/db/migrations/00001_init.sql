-- +goose Up
CREATE TABLE domains (
    id              INTEGER PRIMARY KEY,
    domain          TEXT    NOT NULL UNIQUE,
    bucket_id       TEXT    NOT NULL,
    bucket_name     TEXT    NOT NULL,
    verify_token    TEXT    NOT NULL,
    -- pending: menunggu DNS, active: alias terpasang di Garage, error: gagal dipasang
    status          TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error')),
    last_error      TEXT    NOT NULL DEFAULT '',
    last_checked_at TEXT,
    activated_at    TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX domains_status_idx ON domains (status);

-- +goose Down
DROP TABLE domains;
