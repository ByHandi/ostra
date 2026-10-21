# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

When releasing, replace `[Unreleased]` with `[X.Y.Z] - YYYY-MM-DD`, then push the tag `vX.Y.Z`.
The release workflow uses the contents of that version's section as the GitHub Release notes.

## [Unreleased]

### Added
- Self-hosted object storage built on Garage v2 (single node), with Caddy in front.
- Custom domains per bucket with automatic TLS (on demand, only for approved domains).
- Domain ownership verification via DNS (CNAME/A to the edge + TXT), re-checked automatically.
- Admin dashboard: overview, buckets, custom domains, access keys with per-bucket permissions, account settings.
- Admin login with JWT access tokens + rotating refresh tokens in an httpOnly cookie, login rate limiting.
- CLI `control createuser`, `control setpassword`, and `control version`.
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

### Security
- The control-plane refuses to start if development settings (`DNS_VERIFY=off`,
  `COOKIE_SECURE=false`) are used with a domain other than `.localhost`/`.test`.
