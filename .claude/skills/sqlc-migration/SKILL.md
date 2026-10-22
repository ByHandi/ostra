---
name: sqlc-migration
description: Change the control-plane's SQLite schema or queries safely in this repo (Ostra) — write a new numbered goose migration in control/db/migrations (never edit a released one), handle SQLite's ALTER TABLE limits with a table rebuild when needed (CHECK constraints, NOT NULL, renames, FKs with ON DELETE CASCADE), add or change queries in control/db/queries, run `sqlc generate`, fix the Go code that stops compiling, keep secrets out of API responses, and prove up/down/existing-data behavior. Use whenever the user wants to add/rename/drop a column or table, add an index, change a status/enum CHECK, add a query, store something new in the database, or says "tambah kolom", "tabel baru", "ubah schema", "bikin migration", "query baru", "simpan ke DB", even if they only describe the feature (roles, audit log, quotas) and not the database.
---

# sqlc migration (Ostra control-plane)

The control-plane keeps its state in SQLite (`modernc.org/sqlite`, no CGO). Migrations are
goose SQL files embedded into the binary (`control/db/embed.go`) and applied on every start by
`store.Open` (`control/internal/store/open.go`). Queries are written by hand in
`control/db/queries/*.sql` and turned into Go by sqlc into `control/internal/store/`
(generated, never edited by hand).

Because migrations run automatically at startup on real deployments (including Coolify/Dokploy
stacks you can't easily reach), a bad migration means a control-plane that won't boot or
silently loses rows. The steps below exist to prevent exactly that.

## Layout you'll touch

| Path | What |
|---|---|
| `control/db/migrations/NNNNN_name.sql` | goose migrations, 5-digit zero-padded, `-- +goose Up` / `-- +goose Down` |
| `control/db/queries/<table>.sql` | sqlc queries, one file per table (`domains.sql`, `auth.sql`, `settings.sql`) |
| `control/db/sqlc.yaml` | sqlc config: engine sqlite, `emit_interface`, camelCase JSON tags, `rename` for initialisms (`ip: IP`) |
| `control/internal/store/` | generated: `models.go`, `*.sql.go`, `querier.go` (do not edit) |
| `control/internal/service/` | consumers via the `store.Querier` interface |
| `control/internal/auth/` | consumers of `users` / `sessions` |
| `control/internal/api/` | maps store rows to response structs |

## Step 1 — Decide: new migration, or edit an unreleased one?

Never edit a migration that has already been released: goose records applied versions, so an
edited file is simply never re-run on existing databases, and those databases drift from fresh
ones.

Treat a migration as released if it exists on `main` (`git log main -- control/db/migrations`)
or in any tag (`git tag`). A migration that only exists on the current, unmerged branch may be
edited in place — but if the user already ran it against their local dev database, tell them
to reset it or bump the file to a new number, because goose won't re-apply it.

Next number = highest existing prefix + 1 (`ls control/db/migrations`). Name the file after the
change (`00004_user_roles.sql`, `00005_audit_log.sql`).

## Step 2 — Write the migration

Follow the conventions of the existing files (read `00001_init.sql`–`00003_settings.sql`
first):

- Timestamps are `TEXT` holding ISO-8601 UTC with milliseconds:
  `DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`. Tables have `created_at` and, if rows
  change, `updated_at` (queries set it explicitly on UPDATE — SQLite has no `ON UPDATE`).
- Primary keys: `id INTEGER PRIMARY KEY` (or a natural `TEXT PRIMARY KEY` for key/value).
- Enum-like columns use `CHECK (col IN (...))`, like `domains.status`.
- Strings that are "empty when unset" use `NOT NULL DEFAULT ''`; columns that are genuinely
  absent use a nullable column (becomes `sql.NullString`).
- Foreign keys are enforced (`_pragma=foreign_keys(1)` in the DSN) — `ON DELETE CASCADE` is real.
- Index columns that tables which can grow are filtered or joined by (`domains_status_idx`,
  `sessions_user_idx`). Skip it for small tables (`users`, `settings`) and two-value columns —
  an index there buys nothing and makes `DROP COLUMN` in Down need an extra `DROP INDEX`.
- A short SQL comment explains anything non-obvious (what a status means, why a column exists).
- Always write a working `-- +goose Down`. It is what makes a rollback to the previous image
  possible (the README's upgrade/rollback guide relies on it). In a comment, say what Down
  throws away and what a later Up does with it — e.g. dropping `role` then re-running Up's
  backfill turns every viewer back into an admin. That's often acceptable, but it must be a
  stated decision, not a surprise.

### What plain `ALTER TABLE` can and can't do in SQLite

Can: `ADD COLUMN` — including its own column-level `CHECK` and a constant `DEFAULT`
(`ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer'))` works);
if `NOT NULL`, it needs a constant `DEFAULT`, no expression defaults like `strftime(...)`.
Also `RENAME COLUMN`, `RENAME TO`, `CREATE/DROP INDEX`, and `DROP COLUMN` (drop the column's
indexes first; it refuses a column that's `UNIQUE`, `PRIMARY KEY`, a FK, or used by a
table-level constraint — a CHECK attached to that column alone is fine).

Can't: change an existing column's type or its `CHECK` (e.g. a new allowed value for
`domains.status`), add `NOT NULL` or `UNIQUE` to an existing column, add a FK to an existing
column, add a column with a non-constant default. These need a **table rebuild**.

Prefer the `ADD COLUMN` path whenever it can express the change: a rebuild is the riskiest
thing in this skill (see the cascade trap below).

### Table rebuild (the SQLite 12-step procedure, adapted to goose)

goose wraps each migration in a transaction, and `PRAGMA foreign_keys` is a no-op inside one.
That matters: with FKs on, `DROP TABLE users` runs an implicit `DELETE FROM users`, and
`sessions.user_id ... ON DELETE CASCADE` would wipe every session. So a rebuild of any table
that is referenced by a FK must run outside goose's transaction:

```sql
-- +goose NO TRANSACTION
-- +goose Up
PRAGMA foreign_keys = OFF;
BEGIN;

CREATE TABLE domains_new (
    -- full new definition, e.g. a CHECK with the new status added
);
INSERT INTO domains_new (id, domain, ...) SELECT id, domain, ... FROM domains;
DROP TABLE domains;
ALTER TABLE domains_new RENAME TO domains;
CREATE INDEX domains_status_idx ON domains (status);  -- indexes are dropped with the old table

COMMIT;
PRAGMA foreign_key_check;  -- reports orphans; should return nothing
PRAGMA foreign_keys = ON;

-- +goose Down
-- the mirror image, same shape
```

Why `foreign_keys = ON` at the end matters here specifically: `store.Open` uses a single
connection (`SetMaxOpenConns(1)`), so a pragma left OFF would stay off for the life of the
process.

Tables with no FK pointing at them (`domains`, `settings` today) can be rebuilt inside the
normal transaction without the pragmas — still list the columns explicitly in the
`INSERT ... SELECT` rather than `SELECT *`, so a column-order difference can't shift data.

### Backfills and existing data

A new column needs two separate decisions — make both explicitly:

1. **The `DEFAULT`** — what rows inserted *later* get when the caller doesn't set it. Usually
   the safe/least-privileged value (`viewer`).
2. **The backfill** — what rows that *already exist* become. Write it into Up (an `UPDATE`
   after `ADD COLUMN`, or a computed expression in the rebuild's `SELECT`). Often different
   from the default: every existing user was created as an admin, so they must become `admin`,
   or the only admin locks themselves out.

A new `UNIQUE` — check for duplicates first and decide what to do with them; the migration
failing at startup is the worst outcome.

Also ask what *rules* the new data creates, and put them in the service with a test — e.g.
"the last admin can't be demoted or deleted". The schema can't express these, and they're
easy to forget because nothing fails without them.

### Keep Postgres in mind (cheaply)

The roadmap has a Postgres option for the control-plane. Don't contort anything for it, but
prefer portable SQL when it costs nothing (`CHECK` over triggers, explicit column lists, no
`AUTOINCREMENT`), and mention any SQLite-only construct you had to use.

## Step 3 — Queries

Add or change queries in the table's file in `control/db/queries/` (new table → new file).
Style used in the repo:

```sql
-- name: MarkDomainActive :one
UPDATE domains
SET status = 'active',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = ?
RETURNING *;
```

- `:one` for single rows (missing row → `sql.ErrNoRows`, which the service maps to
  `notFound(...)`), `:many` for lists (always with an explicit `ORDER BY`), `:exec` for writes
  that return nothing.
- Use `RETURNING *` on INSERT/UPDATE when the caller needs the row — it saves a second query.
- Every UPDATE sets `updated_at` if the table has one.
- If a new column name is an initialism (`ip`, `url`, `id` suffixes are handled), add it to
  `rename:` in `sqlc.yaml` so Go gets `URL` not `Url`.
- For a query whose rows will be returned to the dashboard, consider listing columns instead of
  `*` so secrets (`password_hash`, `verify_token`) never enter the row at all. The trade-off:
  sqlc then generates a separate `<Query>Row` struct instead of reusing the model. Either is
  fine; just make the choice consciously (see "Secrets in rows" below).
- A comment meant as the Go doc comment goes on the lines *after* `-- name: ...`; comments
  above the `-- name:` line are dropped by sqlc.

## Step 4 — Generate

```bash
cd control/db && sqlc generate
```

The generated files carry the sqlc version in their header (`sqlc v1.31.1` today). If the local
`sqlc version` differs, every generated file's header changes — mention it to the user rather
than committing a noisy diff silently. Then confirm nothing is stale:

```bash
cd control/db && sqlc diff   # exits non-zero if generated code doesn't match
```

## Step 5 — Fix the code that breaks (and the code that doesn't)

```bash
cd control && go build ./... && go vet ./...
```

The compiler only catches removed or renamed fields. A **new field in a `Params` struct
compiles fine** — every existing literal silently passes the zero value (`""`, `0`). With a
`CHECK` that becomes a runtime failure; without one it becomes wrong data (e.g.
`control createuser` quietly creating viewers). So for every params struct whose shape changed,
find all literals and set the new field deliberately:

```bash
grep -rn "store\.CreateUserParams{" control --include=*.go   # one grep per changed struct
```

Typical fallout and how this repo handles it:

- **New `store.Querier` method** — `*store.Queries` gets it automatically. Search for any hand
  written type that implements `store.Querier` in tests (`grep -rn "store.Querier" control`)
  and extend it.
- **Changed `Create*Params` / model struct** — update every call site in `service/` and `auth/`
  (via the grep above, not the compiler), including CLI paths in `cmd/control/main.go` and the
  `ADMIN_EMAIL` bootstrap.
- **Nullable column** — it's `sql.NullString`/`sql.NullInt64` in Go. Don't send that to the
  dashboard as-is (it serializes as `{"String":..,"Valid":..}`); map it in a response struct with
  `nullable(s, valid)` like `domainResponse` in `control/internal/api/storage_handlers.go`, and
  type it `string | null` in `web/src/lib/api/*.ts`.
- **Secrets in rows** — store models have JSON tags, so returning a row directly from a handler
  would expose every column. `users.password_hash`, `domains.verify_token` and the system key in
  `settings` must never reach the API. If a handler returns a store type directly, check the
  new column is safe to expose; otherwise add/extend a response struct.
- **Status/enum values** — mirror the values as Go constants in the package that owns the
  table (`StatusPending` in `service/domains.go`; `users`/`sessions` belong to `auth`) and, once
  the API exposes them, in the TypeScript union (`DomainStatus` in `web/src/lib/api/storage.ts`)
  and UI badges/labels.
- **Stale assumptions in comments/docs** — grep for prose that the change makes untrue (e.g.
  "single admin" in `web/src/lib/api/session.ts`, README sections) and fix or flag it.

If the change also adds an endpoint or UI, continue with the `add-feature` skill for those parts.

## Step 6 — Prove it

Tests already exercise migrations: every service/auth/api test opens a fresh database through
`store.Open(ctx, filepath.Join(t.TempDir(), ...))`, which runs all migrations Up. So:

```bash
cd control && go test -race ./...
```

Add or update a test for the behavior the column/query enables, in the style of
`internal/service/*_test.go` (real SQLite in a temp dir + `fakeGarage`).

Then check what tests can't — Down, and data that existed before:

```bash
# Scratch copy, never the real file. The DSN turns FKs on like store.Open does —
# without it the cascade trap from Step 2 can't show up.
DB=$(mktemp -d)/check.db
DSN="file:$DB?_pragma=foreign_keys(1)"
MIG=control/db/migrations
SQL=/usr/bin/sqlite3   # macOS system sqlite3; the first one on PATH may be Android's
goose -dir $MIG sqlite3 "$DSN" up-to <previous-version>   # schema before your change
$SQL "$DB" "PRAGMA foreign_keys=ON; INSERT INTO ...;"      # realistic rows, incl. child tables
goose -dir $MIG sqlite3 "$DSN" up                          # your migration on existing data
$SQL "$DB" "SELECT ...;"                                   # backfill right? row counts unchanged?
$SQL "$DB" "PRAGMA foreign_key_check; PRAGMA integrity_check;"
goose -dir $MIG sqlite3 "$DSN" down                        # what did Down throw away?
goose -dir $MIG sqlite3 "$DSN" up                          # and what does re-Up turn it into?
```

The round-trip isn't just pass/fail: compare the data after re-Up with the data before Down,
and report the difference (it should match what the Down comment says).

For a rebuild of `users`, explicitly check that `sessions` rows survive (count before and
after) — that's the cascade trap from Step 2. It's been verified in this repo: rebuilding
`users` inside goose's normal transaction leaves `sessions` empty, logging everyone out.

If the local dev stack is running and the change is risky, a copy of the dev database is a
good extra check: `docker compose cp control:/data/control.db "$DB"` (stop `control` first or
accept a possibly torn copy; it's only a scratch check).

## Step 7 — Wrap up

- Complexity limits still apply to any Go you changed (`gocyclo -over 12`, `gocognit -over 15`,
  generated `internal/store/` is excluded) — see CONTRIBUTING.md.
- Add a line under `## [Unreleased]` in `CHANGELOG.md` if the change is user-visible, and note
  under `### Changed` if the migration rewrites existing data.
- Commit the migration, query file, and regenerated `internal/store/` together — CI builds from
  the committed generated code and never runs sqlc. (Only commit if the user asks.)

Report to the user: the migration file, whether it rebuilds a table, what happens to existing
rows, the Down behavior, and the commands you ran with their results.
