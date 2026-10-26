# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

When releasing, replace `[Unreleased]` with `[X.Y.Z] - YYYY-MM-DD`, then push the tag `vX.Y.Z`.
The release workflow uses the contents of that version's section as the GitHub Release notes.

## [Unreleased]

### Added

- Viewer role UI permissions and display: clearly reflect read-only status for users logged in
  with the `viewer` role across the dashboard. Displays user role badges in the Settings page and
  sidebar footer, disables or hides write actions across buckets, access keys, custom domains, and
  the object browser (upload, drag-and-drop, rename, move, duplicate, delete, and metadata editing),
  and provides informative notices explaining administrator privileges required for write actions.
- User management API and dashboard page: admin-only `/users` page to list users, create accounts
  with generated one-time temporary passwords, change user roles, and delete accounts. Backed by
  `GET /api/users`, `POST /api/users`, `PATCH /api/users/{id}/role`, and `DELETE /api/users/{id}`.
  Enforces demotion and deletion protection for self and the last remaining admin, and immediately
  revokes target user sessions on role change or deletion.
- User roles and API authorization: support `admin` (full access) and `viewer` (read-only) roles
  backed by SQLite migration `00004_user_roles.sql`. Mutating API endpoints (buckets, access keys,
  custom domains, and object write operations) enforce admin privileges and reject viewer requests
  with `403 Forbidden`.
- CLI commands: `--role` flag on `control createuser` (defaulting to `admin`), and new
  `control setrole <email> <role>` command to update user roles with demotion protection for the
  last admin and automatic session revocation on role changes.
- Current user role returned in `GET /api/me` payload.

## [0.4.0] - 2026-10-26

### Added

- Access keys with expiration dates: set key expiration during creation (preset or custom date)
  or modify expiration on existing keys, backed by `PUT /api/keys/{id}/expiration` and updated
  `POST /api/keys`. Visual status badges show active, expiring soon, and expired states across
  the dashboard.
- Search and sort in the object browser: filter folders and files by case-insensitive substring
  match, and sort by name, size, or last modified date in ascending or descending order, backed
  by `search`, `sortBy`, and `order` query parameters on `GET /api/buckets/{id}/objects`.
- View and edit object HTTP metadata (`Content-Type`, `Cache-Control`, and
  `Content-Disposition`) in the object browser and preview modal, backed by
  `GET` and `PUT /api/buckets/{id}/objects/metadata`.
- Rename, move, and duplicate actions for files and folders in the object browser, backed by
  new `POST /api/buckets/{id}/objects/copy` and `POST /api/buckets/{id}/objects/move` endpoints.

## [0.3.0] - 2026-10-23

### Added

- Per-bucket CORS configuration editor on the bucket page to allow cross-origin browser
  uploads and S3 requests.
- Connection snippets modal on the Access Keys and key detail pages with ready-to-copy
  configurations and code for AWS CLI, rclone, Node.js (AWS SDK v3), Python (boto3),
  and environment variables.
- Configurable `S3_PUBLIC_URL` environment variable and `GET /api/config` endpoint to
  provide the authoritative S3 endpoint and region for dashboard connection snippets when
  using custom domains or external proxies (e.g. `cdn.example.com`).
- Custom static website configuration per bucket with editable index and error documents
  (e.g. for SPAs), accessible from the bucket settings tab.
- Per-bucket lifecycle rules configuration on the bucket settings page to automate object
  expiration and cleanup of incomplete multipart uploads.

## [0.2.0] - 2026-10-22

### Added

- Per-bucket storage size and object count quotas, configurable from the bucket page with
  usage progress bars.
- Shareable object download links with a selected expiry of 1 hour, 1 day, or 7 days.
- In-browser object previews for supported images, video, PDF, and text files.
- A global floating upload manager that keeps uploads running across dashboard navigation and warns
  before reloading or closing while uploads are active.

## [0.1.0] - 2026-10-22

### Added

- Self-hosted object storage built on Garage v2 (single node), with Caddy in front.
- Custom domains per bucket with automatic TLS (on demand, only for approved domains).
- Domain ownership verification via DNS (CNAME/A to the edge + TXT), re-checked automatically.
- Admin dashboard: overview, buckets, custom domains, access keys with per-bucket permissions, account settings.
- Admin login with JWT access tokens + rotating refresh tokens in an httpOnly cookie, login rate limiting.
- CLI `control createuser`, `control setpassword`, and `control version`.
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` (and `ADMIN_NAME`) create the first admin account on startup
  while there are no accounts yet; the dev override fills them from `DEV_ADMIN_*`.
- `/api/version` endpoint and version info on the Settings page.
- Production configuration through a single `BASE_DOMAIN` variable; development override in
  `docker-compose.dev.yml`.
- `TRUSTED_PROXIES` to determine the client IP behind a proxy.
- CI (Go, web, shell scripts, Docker image), multi-arch image releases to GHCR, Dependabot.
- Health checks for every service (`control healthcheck`, `/healthz` also checks the database);
  services wait for their dependencies to be `healthy` before starting.
- `scripts/backup.sh` and `scripts/restore.sh` (cold backup with checksums).
- English README, `SECURITY.md`, and `CONTRIBUTING.md`.

- Object browser: a Files tab on each bucket to browse folders, upload (drag and drop, per-file
  progress), download, copy a file's public URL, and delete files or whole folders. The
  control-plane uses its own hidden S3 access key, created automatically on first use.
- `MAX_UPLOAD_SIZE_MB` (default 5120) caps a single upload from the dashboard.

### Fixed

- Dashboard: a page transition the browser skips (first load and its redirect to the login page,
  a hidden tab, a resize) no longer logs an uncaught `InvalidStateError` in the console.

### Security

- The control-plane refuses to start if development settings (`DNS_VERIFY=off`,
  `COOKIE_SECURE=false`) are used with a domain other than `.localhost`/`.test`.
