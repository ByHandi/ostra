# Roadmap

The order of work toward the first open-source release, and the development that follows.
Phases 1 and 2 are prerequisites before the repo is made public.

## Done

### Foundation: storage and routing

- [x] Single-node Garage v2 via Docker Compose (S3 API, web endpoint, admin API)
- [x] Caddy as the front door: S3 API, dashboard, and a catch-all for custom domains
- [x] On-demand TLS: certificates are only issued for domains the control-plane approves
      (`/caddy/ask` on an internal port that is not exposed)
- [x] Custom domain per bucket through Garage global aliases (Host header → bucket)
- [x] `<bucket>.web.<domain>` only gets a certificate if the bucket exists and its website is enabled
- [x] `scripts/gen-env.sh` (random secrets, adds new keys to `.env`) and
      `scripts/init-dev.sh` (dev setup, safe to re-run)

### Control-plane (Go)

- [x] SQLite (modernc, no CGO) with embedded goose migrations and sqlc queries
- [x] Custom domain lifecycle: register → DNS verification (CNAME/A + TXT) → attach alias → active
- [x] Worker: checks pending domains every 30 seconds, reconciles active domain aliases every 5 minutes
- [x] Domain validation (format, 63-character limit, reserved system domains)
- [x] Bucket management: list with statistics, details, create, delete (only when empty and without domains)
- [x] Access key management: create (secret shown once), delete, read/write/owner permissions per bucket
- [x] Overview: storage statistics, domain counts per status, Garage cluster health
- [x] API response format matches the `shadcn-vite` / `go-service-boilerplate` templates,
      including per-field errors

### Auth and security

- [x] Admin login with argon2id passwords; no sign-up page
- [x] 15-minute JWT access token + 30-day refresh token in an httpOnly, SameSite=Strict cookie,
      rotated on every use (only its hash is stored)
- [x] Changing the password ends all other sessions; logout revokes the refresh token
- [x] Login rate limiting per IP
- [x] CLI `control createuser` and `control setpassword`
- [x] First admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` on startup while there are no accounts
- [x] Dashboard served with a strict CSP, `X-Frame-Options`, `nosniff`; hashed assets cached as immutable
- [x] `scratch` image, non-root user; Garage admin and debug ports only bound to `127.0.0.1`

### Dashboard (React)

- [x] Based on the `shadcn-vite` template; boneyard removed
- [x] Pages: login, dashboard, buckets (+ details), custom domains (+ details with DNS records),
      access keys (+ per-bucket permission editor), settings (profile, change password, theme)
- [x] Hand-written skeleton per component (`BucketTable.Skeleton`, `StatCards.Skeleton`, etc.)
- [x] Automatic polling while any domain is pending
- [x] English UI, responsive down to phone screens, light and dark mode
- [x] Embedded into the Go binary (`go:embed`), same origin as the API; `npm run dev` with an `/api` proxy
- [x] Multi-stage Dockerfile: build the dashboard (Node), then the Go binary

### Testing

- [x] Go unit tests: auth (sessions, rotation, expiry, rate limiting), service (domains, buckets, keys,
      reconcile), DNS checker, Garage client, API router, UI handler
- [x] Tested end-to-end on the local stack: login, create bucket/domain/key, set permissions, upload with
      the new key and read it back through the custom domain, bucket deletion refused, logout

---

## Pending decisions

- [x] **License**: Apache-2.0.
- [x] **GitHub repo name**: `ByHandi/ostra`, image `ghcr.io/byhandi/ostra`.

---

## Phase 1: Safe to open up (required)

### 1.1 Safe `.env` defaults

Currently `.env.example` contains `COOKIE_SECURE=false` and `DNS_VERIFY=off`, so a deployment
that follows `gen-env.sh` gets development settings straight away.

- [x] `.env.example` no longer contains dev settings; the defaults in code are safe (`COOKIE_SECURE=true`, `DNS_VERIFY=on`)
- [x] Dev settings moved to `docker-compose.dev.yml`, enabled through the `COMPOSE_FILE` written by
      `scripts/gen-env.sh --dev`
- [x] The control-plane refuses to start if `DNS_VERIFY=off` / `COOKIE_SECURE=false` is used
      together with an `EDGE_HOSTNAME` other than `.localhost`/`.test`

**Done when:** a production deployment that only follows the README never runs with dev settings.

### 1.2 License

- [x] Add Apache License 2.0 in `LICENSE`
- [x] License section in the README, including a note that Garage is licensed under AGPL-3.0 and
      is used as a separate service through its API (the Ostra code is not bound by the AGPL)
- [x] Check that the dependency licenses (Go and npm) are compatible with Apache-2.0

### 1.3 Production config without editing files

Currently `garage/garage.toml` hardcodes `.localhost` and compose defaults to dev mode.

- [x] `garage/garage.toml.tmpl` + a `garage-config` service (busybox) that fills in `BASE_DOMAIN`;
      every other domain is derived from `BASE_DOMAIN`
- [x] Garage uses `--single-node`, so the cluster layout does not have to be set up by hand
- [x] `docker-compose.yml` is now the production version (production Caddyfile, no debug ports,
      no `awscli`); development goes through `docker-compose.dev.yml`
- [x] Production deployment guide in the README: the DNS records to create (`console`, `s3`, `edge`,
      wildcard `*.web`), filling in `.env`, creating the first admin account

**Done when:** a production deployment only needs a filled-in `.env` and a single compose command.

### 1.4 Trusted proxies for the client IP

Login rate limiting uses `X-Forwarded-For`, assuming requests always go through the bundled Caddy.
Behind another proxy this header can be spoofed, so the rate limit can be bypassed.

- [x] `TRUSTED_PROXIES` env var (a list of CIDRs). `X-Forwarded-For` is only read if the request
      comes from an IP on that list, walked from the right; otherwise the connection address is used
- [x] Default: loopback + private networks (where the bundled Caddy lives on the Docker network)
- [x] Tests for spoofed headers from untrusted IPs, plus tested directly through Caddy

### 1.5 Dependency vulnerabilities

- [x] `control/go.mod`: `go 1.26.9` (4 `net/http` CVEs in 1.26.5)
- [x] `web/package.json`: `shadcn` (CLI) moved to `devDependencies`, then `npm audit fix`
      (the high-severity findings in `@modelcontextprotocol/sdk` and `brace-expansion` are gone)
- [x] `govulncheck ./...` has no findings reachable from our code; `npm audit --omit=dev` is clean
- Known leftovers: `golang.org/x/crypto` GO-2026-5932 (module level, no fix yet,
  not called by our code) and `braces` through the `shadcn` CLI (dev only, not in the bundle;
  fixing it needs `npm audit fix --force`). Monitor in Phase 2 through Dependabot.

---

## Phase 2: CI/CD and distribution

- [x] GitHub Actions for PRs (`.github/workflows/ci.yml`), plus shellcheck and compose validation:
  - Go: `gofmt`, `go vet`, `go test`, `govulncheck`
  - Web: `typecheck`, `lint`, `prettier --check`, `npm audit --omit=dev`
  - `docker build` (no push) to make sure the image still builds
- [x] Release: tag `v*` → CI → multi-arch image build (`linux/amd64`, `linux/arm64`, cross-compiled
      without QEMU) → push to GHCR with provenance + SBOM → GitHub Release from the CHANGELOG
- [x] Production compose uses the image from GHCR (`CONTROL_IMAGE` to pin a version); dev still builds locally
- [x] Dependabot for Go modules, npm, Docker images (Dockerfile + compose), and GitHub Actions
- [x] `CHANGELOG.md`, `control version`, `/api/version`, and the version on the Settings page
- [x] First release `v0.1.0` (after the license is decided), then make sure the GHCR package is Public

---

## Phase 3: Operations

- [x] `control healthcheck` subcommand; `/healthz` also checks the database. Compose health checks
      for Garage, the control-plane, and Caddy; the start order waits for the previous service to be `healthy`
- [x] `scripts/backup.sh` and `scripts/restore.sh`: cold backup of all volumes + MANIFEST + SHA256SUMS,
      restore rejects a corrupt backup before changing anything. Tested round-trip (backup → change
      data → restore → data is back, including the ownership of the database file)
- [x] Backup/restore and upgrade (including rollback) guide in the README
- [x] `SECURITY.md`: reporting through GitHub private vulnerability reporting
- [x] Docs are English-only (`README.md`); the Indonesian `README.id.md` has been removed
- [x] `CONTRIBUTING.md`: dev setup, the same checks as CI, and code conventions
- [x] Enable **Private vulnerability reporting** in the GitHub repo's Settings → Security
      (required by the flow in `SECURITY.md`)

---

## Phase 4: Other deployment targets

- [x] `docker-compose.external-proxy.yml`: the stack without the bundled Caddy, for hosts where an
      external proxy (Traefik, a tunnel, ...) owns 80/443 and TLS. Self-contained (Garage config inlined, no bind mounts), `garage-config` with
      `restart: "no"`, and Traefik labels for a priority-1 catch-all to the Garage web endpoint
- [x] Guide for Coolify behind a Cloudflare Tunnel (Full TLS), including custom domains through
      Cloudflare for SaaS (fallback origin + tunnel catch-all + proxy catch-all). Tested end-to-end:
      console, S3 API, and a custom domain serving a bucket
- [ ] Verify on Dokploy: its Traefik only reaches services on `dokploy-network`, and its entrypoints
      are named differently (`web` / `websecure`)
- [ ] Optional `cloudflared` service in `docker-compose.external-proxy.yml` for a plain Cloudflare Tunnel
      without a proxy (the services are only `expose`d, so a `cloudflared` on the host cannot reach them):
  - Behind a compose profile (e.g. `--profile cloudflared`) and `TUNNEL_TOKEN`, so Coolify/Dokploy
    deployments are unaffected; check that those platforms do not start profiled services
  - Ingress straight to the Docker network: `console` → `http://control:8080`,
    `s3` → `http://garage:3900`, catch-all → `http://garage:3902` (keeps the `Host` for custom domains)
  - README section for this setup, and an end-to-end test including a custom domain
- [ ] Backup and restore for stacks deployed by Coolify/Dokploy: `scripts/backup.sh` finds volumes
      through `docker compose config` in the repo directory, which does not exist there
- [ ] CI check that the Garage config inlined in `docker-compose.external-proxy.yml` matches
      `garage/garage.toml.tmpl`
- [ ] Postgres option for the control-plane (sqlc is ready; needs migrations and the pgx driver),
      so it can run more than 1 replica
- [ ] Kubernetes manifests / Helm chart (Garage, control-plane, Caddy or an ingress with
      on-demand TLS)
- [ ] Notes on PaaS limitations (Railway, Render, Fly): custom domains with automatic TLS
      need direct access to port 443

---

## Features

### Object browser (done)

Browse and manage bucket contents from the dashboard. All traffic goes through the
control-plane (no per-bucket CORS, works with the local dev CA); the control-plane uses its own
hidden S3 access key, created automatically and granted to a bucket on first use.

- [x] System S3 access key: created via the admin API, stored in the control-plane database,
      hidden from the Access Keys page and bucket access lists, granted per bucket on demand
- [x] API: list a "folder" (prefix + delimiter, paginated), upload (streamed), download through
      a short-lived signed link, delete a file or a whole folder
- [x] Dashboard: Files tab on the bucket page with breadcrumbs, "Load more", drag-and-drop
       upload with per-file progress, download, copy public URL, delete with confirmation
- [x] Global upload manager: floating progress survives dashboard navigation, supports cancellation,
      and warns before a reload or close would cancel active uploads
- [x] Skeletons, tests, and an end-to-end check against Garage (upload, paginated listing,
      download, copy public URL, delete file/folder, AccessDenied re-grant)

Later: empty folders, direct-to-S3 uploads with presigned URLs for very large files. Preview and
rename/move are listed under [Console features](#console-features-not-scheduled).

### Behind Cloudflare (not scheduled)

Limits found while running Ostra behind a Cloudflare Tunnel.

- [ ] Chunked (multipart) uploads in the object browser. Cloudflare rejects request bodies over
      100 MB on the Free and Pro plans, so for now the README tells Cloudflare setups to set
      `MAX_UPLOAD_SIZE_MB=95`
- [ ] Cloudflare for SaaS integration: create the custom hostname through the Cloudflare API when a
      domain is registered (and delete it with the domain), and show its certificate status in the
      dashboard. Today every custom domain has to be added by hand under Custom Hostnames

### Console features (not scheduled)

What the consoles of AWS S3, Cloudflare R2, MinIO, Backblaze B2, and DigitalOcean Spaces usually
offer and Ostra does not yet, limited to what Garage v2 supports. In priority order; check the
Garage API for each one before starting, since this list was put together from its documentation.

- [x] Share links: a download link for one file with a chosen lifetime (1 hour, 1 day, 7 days).
      The control-plane already signs short-lived download links, so this mostly exposes them
- [x] File preview in the object browser: images, video, PDF, and text
- [x] Per-bucket quotas: maximum size and maximum number of objects (Garage admin API)
- [x] CORS editor per bucket (`PutBucketCors`), needed for browser uploads straight to S3
- [ ] Lifecycle rules per bucket: expire objects after N days, abort incomplete multipart uploads
      (Garage supports only these two, no storage-class transitions)
- [ ] Connection snippets on the access key page: aws-cli, rclone, and the JS/Python SDKs with the
      endpoint, region, and key filled in
- [ ] Website settings per bucket: index document and error page (today the website is only
      switched on with the defaults)
- [ ] Object metadata: view and edit `Content-Type`, `Cache-Control`, `Content-Disposition`
      (through a copy onto itself)
- [ ] Rename, move, and copy files and folders (`CopyObject` + delete)
- [ ] Search and sort in the object browser: by prefix (native), by size or date (per loaded page)
- [ ] Access keys with an expiry date (Garage key expiration)
- [ ] Bucket size and object count over time. Garage only reports the current numbers, so the
      control-plane has to record them

Not possible with Garage, so no UI for them: versioning and restoring deleted objects, Object
Lock/retention, bucket policies and per-object ACLs (access is per key per bucket, public only
through the website), event notifications, per-bucket replication (Garage replicates the whole
cluster), object tagging, storage classes, SSE-KMS (only SSE-C), and keys limited to a prefix.

### Multi-user and roles (not scheduled)

More than one person on the dashboard, with an `admin` role (everything, including users) and a
`viewer` role (read-only). Stays on SQLite: the write load is tiny, and Postgres is only needed
once the control-plane runs as more than one instance.

- [ ] Migration: `role` column on `users` (`admin` / `viewer`), existing accounts become `admin`
- [ ] Authorization in the API, not only the UI: `viewer` gets read endpoints only, checked per
      route with tests. `Authenticate` already loads the user on every request, so a role change
      applies immediately instead of when the access token expires
- [ ] Users page (admin only): list, create with a one-time password, change role, delete.
      Deleting a user or changing their role ends their sessions; the last admin cannot be
      deleted or demoted
- [ ] CLI: `createuser --role`, plus `setrole`; `ADMIN_EMAIL` keeps creating an `admin`
- [ ] Dashboard: hide or disable write actions for `viewer`, show the role on the Settings page
- [ ] Audit log: who did what to which bucket/key/domain/user, with IP and time, written in the
      same transaction as the change where possible. Admin-only page with filters, and old entries
      removed after a retention period (e.g. `AUDIT_LOG_RETENTION`, default 90 days)

Later: roles per bucket (a `user_buckets` table), so a user only sees and manages their own buckets.

---

## Feature ideas (not scheduled)

- Periodic re-verification of active domains (detect DNS records that have been removed)
- Wildcard virtual-hosted S3 (`*.s3.domain`) through Caddy with a DNS challenge plugin
- Caching in front of custom domains (Caddy cache or an external CDN)
- Multi-node Garage: a 3-node cluster guide and `replication_factor = 3`
