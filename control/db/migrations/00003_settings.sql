-- +goose Up
-- Small key/value store for control-plane state, e.g. the system S3 access key used by
-- the dashboard's object browser.
CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- +goose Down
DROP TABLE settings;
