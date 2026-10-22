---
name: e2e-local-stack
description: Prove a change works on the real local Ostra stack (Garage + control-plane + Caddy in Docker Compose, dev mode) instead of only in unit tests — bring the stack up or rebuild just what changed, run the bundled smoke test (auth, bucket, access key + permissions, S3 upload with that key, custom domain and <bucket>.web serving, object browser, delete refusals; it cleans up after itself), add feature-specific checks through Caddy with curl/aws-cli, click through the dashboard in a browser (desktop, phone width, dark mode), read the container logs, and report what was and wasn't verified. Use whenever the user asks to test end to end, check something on the local stack or in Docker, verify a feature before a PR, confirm Caddy/TLS/custom domains/S3 still work after a change or dependency bump, or says "tes e2e", "cek di stack lokal", "coba jalanin", "udah jalan belum", "tes di docker", "smoke test" — and after finishing an add-feature change when the stack is available.
---

# End-to-end check on the local stack (Ostra)

Unit tests run against a SQLite temp file and an in-memory Garage fake. They can't see Caddy's
on-demand TLS, the `/caddy/ask` gate, Garage's real permission model, the embedded dashboard,
or compose wiring — which is where several past bugs lived. This skill checks the real thing
the way a user reaches it: through Caddy on 443.

## Step 0 — Safety

- **Only against a dev `.env`.** `.env` must contain
  `COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml` (written by
  `scripts/gen-env.sh --dev`). If it doesn't, stop and ask: this machine may be pointed at a
  real deployment. `scripts/init-dev.sh` and the smoke script both refuse to run otherwise.
- **Never wipe the user's dev data without asking.** `docker compose down -v`,
  `scripts/restore.sh`, and deleting volumes destroy the dev database, Garage data, and Caddy's
  local CA (the browser then distrusts the new one). `down` without `-v` is fine.
- **Leave the user's own fixtures alone** — the `assets` bucket, `app-key`, and
  `cdn.brandku.localhost` from `init-dev.sh`. Create your own resources named `e2e-<something>`
  and delete them afterwards.
- **Log in sparingly.** Login is rate limited per IP (5 attempts, then 1 every 12 seconds), and
  that limiter also locks out the user's browser session. Log in once per script and reuse the
  token.
- Credentials are in `.env` (`DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, `S3_*`). Read them from
  there in commands; don't echo them into the chat.

## Step 1 — Get the stack into the state of the code

Check what's running: `docker compose ps` (all three services should be `healthy`).

| What changed | What to run |
|---|---|
| Nothing running, `.env` exists | `docker compose up -d --build`, then `scripts/init-dev.sh` (safe to re-run) |
| No `.env` at all | `scripts/gen-env.sh --dev` first, then the row above |
| `control/` or `web/` (both are in the control image) | `docker compose up -d --build control` (Node build + Go build; takes a minute or two) |
| `caddy/Caddyfile.dev` (bind-mounted) | `docker compose restart caddy` |
| `garage/garage.toml.tmpl` | `docker compose up -d --force-recreate garage-config garage` |
| `docker-compose*.yml`, env vars | `docker compose up -d` (recreates what changed); `docker compose config --quiet` first |
| Only `scripts/*.sh` | nothing to rebuild; run the script |

Then wait until `docker compose ps` shows `healthy` for garage, control, and caddy. If one
isn't, read `docker compose logs --tail 100 <service>` before doing anything else; a
control-plane that refuses to start usually says why (missing env, dev settings on a
non-`.localhost` domain, migration error).

Ports 80, 443 and 8080 must be free. If `up` fails on a port, report what holds it
(`lsof -iTCP:443 -sTCP:LISTEN`) instead of killing anything.

## Step 2 — Run the smoke test

```bash
.claude/skills/e2e-local-stack/scripts/smoke.sh          # from anywhere in the repo
KEEP=1 .claude/skills/e2e-local-stack/scripts/smoke.sh   # keep what it created, to inspect by hand
```

It takes about half a minute and prints one line per check (about 34 of them), ending in
`PASS: N checks` or `FAILED ...` with the failing response body. It covers:

- stack health; 401 without a token; login; `/me`
- bucket create, field error on an invalid name, 409 on a duplicate
- access key create; the secret appears once and never again on `GET`; **a new key gets
  AccessDenied before it's granted anything**; grant read+write
- `aws s3 cp` / `ls` through the S3 API with that new key
- custom domain registration → `active` (DNS verification is off in dev); reserved domain
  rejected; the file is served at `https://<domain>/` and `https://<bucket>.web.localhost/`
- object browser API: upload, list, signed download link (works without a session, refuses a
  tampered token), delete folder
- refusals: a bucket with a domain or with objects can't be deleted

Everything is named `e2e-<unix time>` and deleted in a cleanup trap, also when a check fails.
If a run is killed hard, leftovers can be found with
`docker compose exec -T garage /garage bucket list | grep e2e-` (and `key list`).

A failure here on code you didn't touch means the stack or a dependency is broken — report it
as such rather than "fixing" the test.

**Extend it when a feature becomes core.** If the change adds a flow that every future change
could break (a new resource, a permission rule), add a step to `smoke.sh` in the same style:
a `step` header, `api`/`expect`/`check` helpers, resources named `$RUN`, and their deletion in
`cleanup`. Run `docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:v0.11.0
.claude/skills/e2e-local-stack/scripts/smoke.sh` afterwards (the same shellcheck version as CI).

## Step 3 — Check the change itself

The smoke test is a regression net; the change still needs its own checks. Use the same
approach as the script — through Caddy, with `--resolve` so nothing depends on the system
resolver:

```bash
CONSOLE=console.localhost
api() { curl -sk --resolve "$CONSOLE:443:127.0.0.1" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" "$@"; }
# login once, then reuse $TOKEN
```

Check the happy path, then each error case the change introduces (status code *and*
`error.errors.<field>` for form errors), then that existing data still looks right. Useful
probes for specific areas:

- **Caddy `ask` / TLS**: an unregistered host must not get a certificate —
  `curl -sk https://not-registered.localhost/` fails the TLS handshake (curl exit 35). A newly
  activated domain must get one on first request. Port 9000 (`/caddy/ask`) is internal and must
  not answer from the host.
- **Client IP / trusted proxies**: send `X-Forwarded-For` from the host and confirm the login
  rate limit still applies to the real client (the header from an untrusted hop is ignored).
  This deliberately burns failed logins: use a wrong password, and wait at least 12 seconds
  (or `docker compose restart control`, which resets the in-memory limiter) before logging in
  for real.
- **Garage-backed behavior**: confirm with the S3 API or the Garage CLI, not only the
  control-plane's own response, e.g. `docker compose exec -T garage /garage bucket info <name>`.
- **Uploads**: the limit is `MAX_UPLOAD_SIZE_MB`; a body over it must be refused, not
  truncated.
- **Migrations**: `docker compose up -d --build control` on the *existing* dev database is the
  real upgrade test — check the logs for the goose version and that old rows still render.
- **Backup/restore, upgrade/rollback**: these stop the stack and `restore.sh` replaces all
  volumes. Ask before running them; when approved, take a backup first
  (`scripts/backup.sh`), then follow the README sections "Backup and restore" and "Upgrading".
- **External-proxy compose** (`docker-compose.external-proxy.yml`): can't run beside the dev
  stack (it has no Caddy and expects a proxy); validate with
  `docker compose -f docker-compose.external-proxy.yml config --quiet` and say that a real
  deployment test was not done.

## Step 4 — The dashboard, in a browser

Open **https://console.localhost** (served by the control image, so it reflects the last
`--build`) or, for UI work with hot reload, run `npm run dev` in `web/` and use
http://localhost:5173 (the `web` entry in `.claude/launch.json`; it proxies `/api` to
127.0.0.1:8080). `https://console.localhost` uses Caddy's local CA; if the browser rejects
it, http://127.0.0.1:8080 reaches the same control-plane without Caddy.

Log in with the dev admin from `.env`, then for each screen the change touches:

- the happy path, end to end, as a user would do it (create → see it listed → open details);
- loading (skeleton), empty state, and an error state (e.g. a 409 from a duplicate shown under
  the right input);
- phone width (~375 px: list layout, mobile tab bar, collapsing header) and desktop (table);
- dark mode;
- the browser console: no errors or failed requests.

Take a screenshot of the key screens as proof when the tool allows it. Delete anything you
created through the UI (or name it `e2e-...` so it's recognizable).

## Step 5 — Logs

```bash
docker compose logs --since 15m control caddy garage | grep -iE 'error|panic|warn' | tail -50
```

A `request failed` line from the control-plane means a 500 was returned somewhere — find out
which request, even if the UI looked fine. Caddy `ask: denied` lines for your own `e2e-*` hosts
are expected after cleanup.

## Step 6 — Report

Leave the stack as you found it: if you started it, ask whether to keep it running; don't stop
a stack the user already had running.

Then report, briefly:

| Area | How it was checked | Result |
|---|---|---|
| Smoke test | `smoke.sh` | PASS 34 checks |
| <the feature> | curl / aws-cli / browser | ... |
| Phone width, dark mode | browser | ... |
| Logs | `docker compose logs` | no errors |

Followed by **what was not checked and why** (e.g. no real DNS, no Let's Encrypt, no external
proxy, browser not available). An honest gap is more useful than an implied full pass.
