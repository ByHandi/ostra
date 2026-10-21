# Ostra

Self-hosted object storage in the spirit of Cloudflare R2: **Garage** stores the data, **Caddy** sits in front with automatic TLS, and a **control-plane** (Go + React dashboard) manages buckets, access keys, and per-bucket custom domains.

```
                  Internet
                     │
        ┌────────────┴─────────────┐
        │          Caddy           │  ← automatic TLS per domain
        └──┬──────────────┬────────┘
           │              │
     s3.localhost    cdn.brandku.localhost, <bucket>.web.localhost, ...
     (S3 API)        (public read, custom domain per bucket)
           │              │
           ▼              ▼
   Garage :3900     Garage :3902 (web endpoint)
                          ▲
   control :8080 (dashboard + /api, via console.localhost)
           :9000 (internal: /caddy/ask, for Caddy only)
             │
             ├── SQLite (/data/control.db): domains, admin accounts, sessions
             └── Garage admin API :3903: attach/detach aliases, enable website
```

## Features

- **S3-compatible storage** backed by Garage v2 (single node, layout configured automatically).
- **Custom domains per bucket** with automatic HTTPS. Certificates are issued on demand, and only for domains the control-plane has approved.
- **Domain ownership verification** via DNS (CNAME or A/AAAA to the edge, plus a TXT token), re-checked automatically.
- **Admin dashboard** for buckets, custom domains, access keys with per-bucket permissions, and account settings.
- **Object browser** in the dashboard: browse folders, drag-and-drop uploads with progress, downloads, public URLs, and deleting files or folders.
- **Security by default:** argon2id passwords, short-lived JWT access tokens with rotating httpOnly refresh cookies, login rate limiting, a strict CSP, and a non-root `scratch` image. Development shortcuts refuse to run against real domains.
- **One-command operations:** production `docker compose`, cold backup/restore scripts, health checks, and multi-arch release images on GHCR.

The road to the first open-source release is tracked in [ROADMAP.md](ROADMAP.md). Want to contribute? See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## Production deployment

You need a server with Docker and ports 80/443 reachable from the internet.

**1. DNS.** Point these records at the server (replace `example.com` with your domain):

| Record | Purpose |
|---|---|
| `console.example.com` | Dashboard |
| `s3.example.com` | S3 API |
| `edge.example.com` | CNAME target for users' custom domains |
| `*.web.example.com` | Per-bucket web access (optional) |

**2. Configure and start.**

```bash
./scripts/gen-env.sh          # create .env and fill in every secret
# edit .env: set BASE_DOMAIN=example.com and ACME_EMAIL
docker compose pull           # release image from ghcr.io/byhandi/ostra
docker compose up -d
```

To pin a version, set `CONTROL_IMAGE=ghcr.io/byhandi/ostra:<version>` in `.env`. To build from source instead, run `docker compose up -d --build`.

The Garage layout is created automatically (`garage server --single-node`), and certificates are fetched from Let's Encrypt on the first request.

**3. Create the first admin account**, then open `https://console.example.com`:

```bash
docker compose exec control /control createuser --email you@example.com --name "Your Name"
```

Or set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (optionally `ADMIN_NAME`) in `.env` before step 2: the control-plane creates that account on startup while there are no accounts yet. See [Admin accounts](#admin-accounts).

`docker-compose.yml` is production-safe as is: custom-domain DNS verification is on, session cookies are `Secure`, and the Garage admin port is not published. Every development shortcut lives in `docker-compose.dev.yml`, and the control-plane refuses to start if those shortcuts are combined with a domain other than `.localhost`/`.test`.

### Behind an external proxy (Coolify, Dokploy, Cloudflare Tunnel)

When ports 80/443 and TLS belong to something else, such as Coolify's or Dokploy's Traefik, a Cloudflare Tunnel, or Nginx Proxy Manager, use `docker-compose.external-proxy.yml` instead. It is the same stack without the bundled Caddy, so the proxy terminates TLS and routes each hostname over the Docker network:

| Hostname | Service |
|---|---|
| `console.example.com` | `control:8080` |
| `s3.example.com` | `garage:3900` |
| Any other host (custom domains, `*.web.example.com`) | `garage:3902`, with the original `Host` |

```bash
docker compose -f docker-compose.external-proxy.yml up -d
```

For a Traefik that reads Docker labels, `garage` already carries that last route as a priority-1 catch-all, so only the console and S3 hostnames need to be set up. Other proxies need a default route to `garage:3902` that keeps the `Host` header. The object browser uploads a file in one request, so `MAX_UPLOAD_SIZE_MB` (default 5120) must fit the proxy's request body limit.

`scripts/backup.sh` finds the volumes through `docker compose config` in this directory, so it does not work for a stack deployed by a platform such as Coolify (which renames the project).

#### Coolify

On Coolify, create a Docker Compose resource from this repository, set the compose location to `/docker-compose.external-proxy.yml`, set `BASE_DOMAIN` and the four secrets in the environment variables (`openssl rand -hex 32` each), and assign the domains in the UI: the console to `control` (port 8080) and the S3 API to `garage` (port 3900). If those hostnames are not `console.` and `s3.` under `BASE_DOMAIN`, also set `RESERVED_DOMAINS` to them so nobody can register them as custom domains. Also set `ADMIN_EMAIL` and `ADMIN_PASSWORD` there, so the first admin is created when the stack starts. The `control` image has no shell, so Coolify's container terminal cannot open it; without those variables, create the first admin over SSH on the server instead: `docker exec -it $(docker ps -q --filter name=control-<resource-uuid>) /control createuser --email you@example.com --name "Your Name"`.

#### Cloudflare Tunnel

Limits that apply to any setup whose traffic goes through Cloudflare:

- Request bodies are capped at 100 MB on the Free and Pro plans. Set `MAX_UPLOAD_SIZE_MB=95` so the object browser rejects larger files with a clear error instead of a 413 from Cloudflare. S3 clients are unaffected as long as they use multipart uploads with smaller parts (the AWS CLI and SDKs do).
- `<bucket>.web.example.com` is two levels deep, which Universal SSL and a default Origin Certificate do not cover. It needs Advanced Certificate Manager or a certificate that includes `*.web.example.com`.
- Custom domains need Cloudflare for SaaS (see below): Cloudflare refuses to proxy a CNAME from another account's domain to yours unless that domain is added as a custom hostname.

#### Custom domains through a Cloudflare Tunnel

A request for a custom domain reaches the tunnel with its own `Host` (for example `files.customer.com`), and Garage needs that `Host` to find the bucket. It therefore matches none of the tunnel's hostname rules, so both the tunnel and the proxy behind it need a catch-all that passes it through unchanged. The steps below assume Coolify's Traefik behind the tunnel, as in Coolify's Full TLS guide.

1. **Fallback origin.** Add a public hostname `edge.example.com` to the tunnel with the same service and Origin Server Name as the other routes. In the zone, enable SSL/TLS → Custom Hostnames and set `edge.example.com` as the fallback origin. It matches the default `EDGE_HOSTNAME`, so the DNS records Ostra shows users stay correct.
2. **Tunnel catch-all.** A remotely managed tunnel's last ingress rule is `http_status:404`. Replace it through the API (a token with *Account → Cloudflare Tunnel → Edit*) so unmatched hostnames go to the proxy. Use the same service as the existing routes, and keep `matchSNItoHost` off so `cloudflared` checks the certificate against `edge.example.com`:

   ```bash
   api=https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$CF_TUNNEL_ID/configurations
   curl -s "$api" -H "Authorization: Bearer $CF_API_TOKEN" | jq '.result.config' > tunnel.json  # keep as a backup
   jq '.ingress[-1] = {service: "https://localhost:443", originRequest: {originServerName: "edge.example.com"}} | {config: .}' \
     tunnel.json > tunnel-new.json
   curl -s -X PUT "$api" -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
     --data @tunnel-new.json | jq '.success'
   ```

   The PUT replaces the whole configuration, which is why it starts from the current one. To undo, PUT `{config: <tunnel.json>}`.
3. **Proxy catch-all.** `docker-compose.external-proxy.yml` labels `garage` with a Traefik router that sends every host no other router matches to Garage's web endpoint (priority 1, below every `Host()` rule, so other apps keep their routes). Coolify's proxy picks it up on deploy, so there is nothing to configure. Only one catch-all can win: if the proxy already has one (for example a default redirect for unknown hosts), remove it or this one never matches.
4. **Per domain.** When a user registers `files.customer.com` in Ostra, add it under Custom Hostnames as well. The user creates the CNAME to `edge.example.com` and the `_ostra.` TXT record that Ostra shows. Cloudflare validates the certificate through that CNAME, and Ostra activates the domain once its own DNS check passes. Only subdomains work: an apex custom hostname needs Cloudflare's apex proxying (Enterprise).

Unknown hosts now get Garage's 404 instead of the proxy's.

## Backup and restore

```bash
./scripts/backup.sh                 # → backups/ostra-<UTC time>/
./scripts/restore.sh backups/ostra-20261020T082634Z
```

- **Cold backup:** all services are stopped while copying (usually a few seconds, depending on data size) so the Garage metadata, data blocks, and control-plane database stay consistent with each other. Services are started again automatically, even if the backup fails.
- A backup contains the `garage-meta`, `garage-data`, `control-data`, and `caddy-data` (TLS certificates) volumes, a `MANIFEST` (time and version), and `SHA256SUMS`.
- `.env` is **not** included because it holds secrets. Store it separately somewhere safe, or pass `--with-env`. Restoring onto a new server with a fresh `.env` still works; everyone just has to log in again.
- `restore.sh` verifies the checksums first. If any archive is corrupt, nothing is changed. Otherwise the volumes are wiped and replaced with the backup (it asks for confirmation; use `--yes` in scripts).
- Copy backups off the server (another object store, a separate disk). A backup that only lives on the same machine does not protect against disk failure.

## Upgrading

1. Read [CHANGELOG.md](CHANGELOG.md) for the target version, especially breaking changes.
2. Back up: `./scripts/backup.sh`.
3. Switch the version and restart:
   ```bash
   # in .env: CONTROL_IMAGE=ghcr.io/byhandi/ostra:<new-version>
   docker compose pull
   docker compose up -d
   ```
   When deploying from source: `git pull`, then `docker compose up -d --build`.
4. Database migrations run automatically when the control-plane starts. Make sure every service is `healthy` in `docker compose ps`; check `docker compose logs control` if not.

**Rollback:** migrations are not reverted automatically. Set `CONTROL_IMAGE` back to the old version, then run `./scripts/restore.sh <pre-upgrade-backup>`.

Caddy and the other images are bumped through a monthly Dependabot PR. Garage is deliberately excluded: upgrade it by hand (change the `dxflrs/garage` tag in `docker-compose.yml`) after reading the Garage release notes and taking a backup.

## Local development

Requires Docker, with ports 80, 443, and 8080 free.

```bash
./scripts/gen-env.sh --dev    # local .env: BASE_DOMAIN=localhost, also uses docker-compose.dev.yml
docker compose up -d --build
./scripts/init-dev.sh         # "assets" bucket, key, sample/, cdn.brandku.localhost
```

`--dev` writes `COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml` to `.env`, so every `docker compose` command picks up the development override: DNS verification off, cookies without `Secure`, certificates from Caddy's local CA, debug ports (`3900`, `3903`, `8080`) bound to `127.0.0.1`, and an `awscli` service.

Dashboard: **https://console.localhost** (or http://127.0.0.1:8080). Log in with `DEV_ADMIN_EMAIL` and `DEV_ADMIN_PASSWORD` from `.env`: the control-plane creates that account on its first start with an empty database, so it is back right after a `docker compose down -v`.

Try the custom domain and the S3 API:

```bash
curl -k https://cdn.brandku.localhost/            # index.html through a custom domain
curl -k https://assets.web.localhost/hello.txt    # through <bucket>.web.localhost
docker compose run --rm awscli s3 ls s3://assets/ # S3 API with the access key from .env
```

`-k` is needed because development certificates come from Caddy's local CA. `*.localhost` resolves to 127.0.0.1 in curl and modern browsers; otherwise add `--resolve <domain>:443:127.0.0.1`.

### Working on the dashboard

```bash
cd web
npm install
npm run dev      # http://localhost:5173, /api is proxied to the control-plane at 127.0.0.1:8080
```

`npm run build` writes to `control/internal/ui/dist/web`, which is embedded into the Go binary. The Docker image always builds the dashboard itself, so there is no need to build it before `docker compose build`.

### Admin accounts

There is no sign-up page. Accounts are created and reset through the CLI inside the container:

```bash
docker compose exec control /control createuser --email you@example.com --name "Your Name"
docker compose exec control /control setpassword --email you@example.com
```

The password is prompted for interactively (or use `--password-stdin` in scripts). `setpassword` also ends all of that user's sessions.

The first account can also come from the environment: with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set (and optionally `ADMIN_NAME`, default `Admin`), the control-plane creates it on startup when the database has no accounts. Once any account exists the variables are ignored, so they can stay set: changing `ADMIN_PASSWORD` later does not change the password, and a password changed in the dashboard is never overwritten. Setting only one of the two stops the control-plane from starting, and so does a password shorter than the minimum while the account still has to be created.

## CI and releases

- **CI** (`.github/workflows/ci.yml`) runs on every PR and push to `main`: gofmt, `go vet`, `go test -race`, govulncheck, typecheck/lint/Prettier/`npm audit` for the web app, shellcheck, compose validation, and an amd64 + arm64 image build.
- **Releases** (`.github/workflows/release.yml`): rename `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) to the new version, then push a tag:

  ```bash
  git tag v0.1.0
  git push origin v0.1.0
  ```

  The workflow runs CI, pushes a multi-arch image to `ghcr.io/byhandi/ostra` (tags `0.1.0`, `0.1`, and `latest`), and creates a GitHub Release from the CHANGELOG section. Tags with a suffix such as `-rc.1` become pre-releases and leave `latest` untouched.
- **Dependabot** opens at most one grouped PR per ecosystem per month (Go, npm, Docker, Compose, GitHub Actions). CI also runs every Monday so newly disclosed vulnerabilities fail govulncheck/npm audit even without new commits.

## Custom domain flow

```
POST /api/domains ──► pending ──(worker every 30s / POST .../verify)──► DNS ok? ──► active
                         ▲                                                  │ no
                         └──────────────── lastError set ◄──────────────────┘
```

1. A user registers a domain for a bucket. The response lists the `dnsRecords` to create:
   - `CNAME <domain> → EDGE_HOSTNAME` (an apex domain may use A/AAAA records matching the edge IP)
   - `TXT _ostra.<domain> = ostra-verify=<token>`
2. The worker checks `pending` domains. Once DNS is correct, the control-plane enables website access on the bucket and attaches the domain as a global alias in Garage.
3. The status becomes `active`. On the first request, Caddy asks `/caddy/ask` and then issues a certificate.
4. If Garage rejects the alias (for example, it already points to another bucket), the status becomes `error`. `POST .../verify` retries.
5. Every 5 minutes the worker makes sure active domains are still attached. If the bucket is gone, the status becomes `error`.

Locally (`docker-compose.dev.yml`) DNS verification is off, so domains become `active` immediately.

## API

Responses use the same envelope as the `shadcn-vite` template and `go-service-boilerplate`:

```json
{ "success": true, "statusCode": 200, "message": "OK", "data": {}, "meta": null, "error": null }
{ "success": false, "statusCode": 400, "message": "...", "data": null, "meta": null,
  "error": { "type": "validation", "message": "...", "errors": { "domain": ["..."] } } }
```

**Auth.** A JWT access token (15 minutes) is sent in the `Authorization: Bearer` header. The refresh token (30 days, rotated on every use) lives in the httpOnly cookie `ostra_refresh`, scoped to `/api/auth`. Login allows 5 attempts per IP, then 1 attempt every 12 seconds.

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | `{"email","password"}` → `access_token` + cookie |
| POST | `/api/auth/refresh-token` | Exchange the cookie for new tokens |
| POST | `/api/auth/logout` | Revoke the session, clear the cookie |
| GET | `/api/me` | The signed-in user |
| POST | `/api/me/password` | `{"currentPassword","newPassword"}`, ends other sessions |
| GET | `/api/version` | Build version and commit |
| GET | `/api/overview` | Statistics + cluster health |
| GET/POST | `/api/buckets` | List / create (`{"name"}`) |
| GET/DELETE | `/api/buckets/{id}` | Details (keys + domains) / delete (must be empty, no domains) |
| GET/POST | `/api/keys` | List / create (`{"name"}`; the secret is only returned here) |
| GET/DELETE | `/api/keys/{id}` | Per-bucket permissions / delete |
| PUT | `/api/keys/{id}/buckets/{bucketId}` | `{"read","write","owner"}`, sets permissions exactly |
| GET/POST | `/api/domains` | List / register (`{"domain","bucket"}`) |
| GET/DELETE | `/api/domains/{id}` | Details + `dnsRecords` / delete |
| POST | `/api/domains/{id}/verify` | Check DNS now |
| GET | `/api/buckets/{id}/objects` | List a folder: `?prefix=` (`""` or ending in `/`), `&cursor=`, `&limit=` (max 1000) |
| PUT | `/api/buckets/{id}/objects?key=` | Upload the raw request body as that file (capped by `MAX_UPLOAD_SIZE_MB`) |
| DELETE | `/api/buckets/{id}/objects` | Delete one file (`?key=`) or a whole folder (`?prefix=`) |
| POST | `/api/buckets/{id}/objects/download-link` | `{"key"}` → a signed `/api/downloads/{token}` link, valid 5 minutes |
| GET | `/api/downloads/{token}` | Download the file (no session needed; the signed token is the authorization) |

## Repository layout

| Path | Contents |
|---|---|
| `docker-compose.yml` | Production: Garage, control-plane, Caddy |
| `docker-compose.dev.yml` | Development override: debug ports, relaxed settings, `awscli` (profile `tools`) |
| `garage/garage.toml.tmpl` | Garage config template; `__BASE_DOMAIN__` is filled in by the `garage-config` service |
| `caddy/Caddyfile` | Production (Let's Encrypt) |
| `caddy/Caddyfile.dev` | Development (`local_certs`) |
| `control/Dockerfile` | Multi-stage: dashboard build (Node), then the Go binary with the dashboard embedded |
| `control/cmd/control` | Entry point: server, `createuser`, `setpassword`, `version`, `healthcheck` |
| `control/internal/service` | Business logic: buckets, access keys, custom domains, worker |
| `control/internal/auth` | Login, JWT, refresh tokens, rate limiting, argon2id |
| `control/internal/garage` | Garage v2 admin API client |
| `control/internal/dnscheck` | CNAME/A + TXT checks |
| `control/internal/api` | chi routers: dashboard + `/api` (:8080) and internal (:9000) |
| `control/internal/ui` | Serves the embedded dashboard (SPA fallback, CSP, asset caching) |
| `control/db` | goose migrations + sqlc queries (`cd control/db && sqlc generate`) |
| `web/` | Dashboard: Vite + React + TanStack Router/Query + shadcn |
| `scripts/gen-env.sh` | Create/complete `.env` (`--dev` for local) |
| `scripts/init-dev.sh` | Development setup, safe to re-run |
| `scripts/backup.sh`, `scripts/restore.sh` | Back up and restore all data |
| `.github/workflows/` | CI and releases |
| `CHANGELOG.md` | Per-version changes (used as release notes) |

## Production notes

- The object browser goes through the control-plane with its own S3 access key ("Ostra dashboard (system)"). It is created automatically, stored in the control-plane database, granted read/write on a bucket the first time that bucket is browsed, and hidden from the dashboard's key lists. Deleting it in Garage is harmless: a new one is created on next use. Uploads are streamed, and `MAX_UPLOAD_SIZE_MB` (default 5120) caps a single file.

- Every domain is derived from `BASE_DOMAIN`. `EDGE_HOSTNAME` and `RESERVED_DOMAINS` can be overridden in `.env`.
- If another proxy or load balancer sits in front of Caddy, put its addresses in `TRUSTED_PROXIES`. The default is loopback plus private networks (where the bundled Caddy lives). The client IP is used for login rate limiting.
- Never use `scripts/init-dev.sh` or `docker-compose.dev.yml` in production.
- Wildcard `*.s3.example.com` (virtual-hosted style) needs a DNS challenge, which means building Caddy with a DNS provider plugin. Without it, the S3 API is path-style only.
- The control-plane's internal port (9000) must never be proxied to the public.
- Activating a custom domain enables website access on the bucket, so its contents are also publicly readable at `<bucket>.web.<domain>`.
- Bucket aliases are limited to 63 characters, so longer domains cannot be used as custom domains yet.
- `replication_factor = 1` means no redundancy. For important data, run at least 3 nodes.
