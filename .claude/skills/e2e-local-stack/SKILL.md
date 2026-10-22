---
name: e2e-local-stack
description: Prove a change works on the real local Ostra stack (Garage + control-plane + Caddy in Docker Compose, dev mode) instead of only in unit tests — check the running image isn't older than the code and rebuild just what changed, run the bundled smoke test (auth, bucket, access key + permissions, S3 upload with that key, custom domain and <bucket>.web serving, object browser API, delete refusals; it cleans up after itself), make feature-specific API calls through the bundled api.sh (no password handling, one cached login), check the dashboard in a browser (desktop, phone width, dark mode), read the container logs, and report what was and wasn't verified. Use whenever the user asks to test end to end, check something on the local stack or in Docker, verify a feature before a PR, confirm Caddy/TLS/custom domains/S3 still work after a change or dependency bump, or says "tes e2e", "cek di stack lokal", "coba jalanin", "udah jalan belum", "tes di docker", "smoke test".
---

# End-to-end check on the local stack (Ostra)

Unit tests run against a SQLite temp file and an in-memory Garage fake. They can't see Caddy's
on-demand TLS, the `/caddy/ask` gate, Garage's real permission model, the embedded dashboard,
or compose wiring — which is where several past bugs lived. This skill checks the real thing
the way a user reaches it: through Caddy on 443.

Bundled scripts (in `.claude/skills/e2e-local-stack/scripts/`, run from anywhere in the repo):

| Script | What it does |
|---|---|
| `smoke.sh` | ~35 checks of the core flows; creates `e2e-<time>-<pid>` resources and deletes them |
| `api.sh METHOD PATH [JSON\|@file]` | one API call as the dev admin; prints the body, `HTTP <code>` on stderr |
| `lib.sh` | shared: dev-`.env` guard, login, token cache (sourced by the two above) |

## Step 0 — Safety

- **Only against a dev `.env`.** `.env` must contain
  `COMPOSE_FILE=docker-compose.yml:docker-compose.dev.yml` (written by
  `scripts/gen-env.sh --dev`). If it doesn't, stop and ask: this machine may be pointed at a
  real deployment. The scripts refuse to run otherwise.
- **Never wipe the user's dev data without asking.** `docker compose down -v`,
  `scripts/restore.sh`, and deleting volumes destroy the dev database, Garage data, and Caddy's
  local CA (the browser then distrusts the new one). `down` without `-v` is fine.
- **Leave the user's own fixtures alone** — the `assets` bucket, `app-key`, and
  `cdn.brandku.localhost` from `init-dev.sh`. Create your own resources named `e2e-...` and
  delete them afterwards. Nothing in this skill needs those fixtures. If they're missing,
  mention it; `scripts/init-dev.sh` recreates them (safe to re-run), but run it only if the
  user wants that.
- **Don't handle the admin password.** The scripts read `.env` themselves and never print the
  credentials; use them instead of reading `.env` values into commands or the chat. For the
  dashboard in a browser, ask the user to sign in (Step 4).
- **Login is rate limited** per IP: 5 attempts, then 1 every 12 seconds — shared with the
  user's browser and any other agent. The scripts cache the access token in
  `.git/ostra-e2e-token` (mode 600, 15-minute lifetime) and only log in again when it has
  expired, so a whole session normally costs one login.

## Step 1 — Is the running stack the code you're testing?

```bash
docker compose ps        # garage, control, caddy should all be "healthy"
```

The smoke test's first block also warns when the control image is older than the last commit
to `control/` or `web/`, or when those directories have uncommitted changes. Testing a stale
image tests the wrong code: either rebuild, or say plainly in the report that the image is
older than the code.

| Situation | What to run |
|---|---|
| Nothing running, `.env` exists | `docker compose up -d --build`, then `scripts/init-dev.sh` |
| No `.env` at all | `scripts/gen-env.sh --dev` first, then the row above |
| `control/` or `web/` changed (both are in the control image) | `docker compose up -d --build control` (Node + Go build, a minute or two) |
| `caddy/Caddyfile.dev` changed (bind-mounted) | `docker compose restart caddy` |
| `garage/garage.toml.tmpl` changed | `docker compose up -d --force-recreate garage-config garage` |
| `docker-compose*.yml` or env vars changed | `docker compose config --quiet`, then `docker compose up -d` |
| Only `scripts/*.sh` changed | nothing to rebuild; run the script |

Rebuilding replaces what the user is running. If they started the stack themselves, say
you're rebuilding (or ask if they're in the middle of something). If a service isn't
`healthy` afterwards, read `docker compose logs --tail 100 <service>` before anything else.
Ports 80, 443 and 8080 must be free; if `up` fails on a port, report what holds it
(`lsof -iTCP:443 -sTCP:LISTEN`) rather than killing anything.

## Step 2 — Smoke test

```bash
.claude/skills/e2e-local-stack/scripts/smoke.sh          # PASS: N checks, exit 0
KEEP=1 .claude/skills/e2e-local-stack/scripts/smoke.sh   # keep what it created, to inspect
```

About 3 seconds warm; ~30 seconds the first time, while the aws-cli image is pulled. It
covers:

- stack health and image staleness; 401 without a token; login; `/me`
- bucket create, field error on an invalid name, 409 on a duplicate
- access key: the secret appears on create and never on `GET`; **a new key gets AccessDenied
  before it's granted anything**; grant read+write
- `aws s3 cp` / `ls` through the S3 API with that new key
- custom domain → `active` (DNS verification is off in dev); reserved domain rejected; the
  file is served at `https://<domain>/` and `https://<bucket>.web.localhost/`
- object browser **API** (not the UI): upload, list, signed download link that works without
  a session and refuses a tampered token, folder delete
- refusals: a bucket with a domain or with objects can't be deleted

Cleanup runs in a trap, also when a check fails. Leftovers after a hard kill:
`docker compose exec -T garage /garage bucket list | grep e2e-` (and `key list`).

A failure on code you didn't touch means the stack or a dependency is broken. Report it as
that; don't change the test to make it pass.

**Extend it when a feature becomes core.** If the change adds a flow that future changes could
break (a new resource, a permission rule), add a step to `smoke.sh` in the same style (`step`,
`api`/`expect`/`check`, names from `$RUN`, deletion in `cleanup`), then run shellcheck as CI
does:

```bash
docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:v0.11.0 -x \
  .claude/skills/e2e-local-stack/scripts/*.sh
```

## Step 3 — Check the change itself

The smoke test is a regression net; the change still needs its own checks. Use `api.sh` for
API calls; it reuses the smoke test's cached token:

```bash
S=.claude/skills/e2e-local-stack/scripts
$S/api.sh POST /buckets '{"name":"e2e-quota"}'
$S/api.sh GET '/buckets/<id>/objects?prefix='        # quote paths with '?' (zsh)
$S/api.sh PUT '/buckets/<id>/objects?key=a.txt' @sample/hello.txt
$S/api.sh DELETE /buckets/<id>
```

Check the happy path, then each error case the change introduces (status code *and*
`error.errors.<field>` for form errors), then that existing data still looks right. Delete what
you created. Probes for specific areas:

| Area | Probe | Expect |
|---|---|---|
| Caddy `ask` / TLS | `curl -sk 'https://not-registered.localhost/'` | curl exit 35 (no certificate) |
| | first request to a newly activated domain | a certificate, then the content |
| Internal port | `curl -s -m 3 'http://127.0.0.1:9000/caddy/ask?domain=x'` | curl exit 7 (not reachable from the host) |
| Client IP / proxies | wrong-password logins with a spoofed `X-Forwarded-For` | still rate limited (the header from an untrusted hop is ignored) |
| Garage-backed behavior | `docker compose exec -T garage /garage bucket info <name>` | Garage agrees with the API's answer |
| Uploads | a body over `MAX_UPLOAD_SIZE_MB` | refused, not truncated |
| Migrations | `docker compose up -d --build control` on the existing dev DB | goose line in the logs, old rows still render |

The proxy probe burns failed logins on purpose; afterwards wait at least 12 seconds or
`docker compose restart control` (the limiter is in memory) before logging in for real.

Ask first, these stop the stack or replace data: **backup/restore and upgrade/rollback**. When
approved, take a backup (`scripts/backup.sh`), then follow the README sections "Backup and
restore" and "Upgrading". **External-proxy compose** can't run beside the dev stack (no Caddy,
expects a proxy): validate with `docker compose -f docker-compose.external-proxy.yml config
--quiet` and say that a real deployment test wasn't done.

## Step 4 — The dashboard, in a browser

URL: in an agent-driven browser use **http://127.0.0.1:8080**. It's the same control-plane and
embedded dashboard without Caddy, so there's no certificate problem, and TLS is already covered
by curl. For UI work with hot reload, `npm run dev` in `web/` serves http://localhost:5173
(the `web` entry in `.claude/launch.json`; it proxies `/api` to 127.0.0.1:8080). The user's own
browser can use https://console.localhost.

Signing in: don't type the password yourself. Open the login page and ask the user to sign in
in that browser (email `DEV_ADMIN_EMAIL`, password `DEV_ADMIN_PASSWORD` in their `.env`), then
continue; the session lasts 30 days in that browser profile. If the user isn't around, check
what doesn't need a session (login page layout, theme, console) and list everything behind
login as not checked.

For each screen the change touches:

- the happy path end to end, as a user would do it (create → see it listed → open details);
- loading (skeleton), empty state, and an error state (e.g. a 409 shown under the right input);
- phone width (~375 px: list layout, mobile tab bar, collapsing header) and desktop (table);
- dark mode;
- the browser console: no uncaught errors or failed requests (a 401 on `/api/auth/refresh-token`
  while signed out is expected).

Take screenshots of the key screens as proof. Delete what you created through the UI, or name
it `e2e-...`.

## Step 5 — Logs

Real problems only (Garage logs every 4xx at INFO level, including the ones the smoke test
causes on purpose, so don't grep Garage for "error"):

```bash
docker compose logs --since 15m --no-log-prefix control | grep -E ' (WARN|ERROR) |panic'
docker compose logs --since 15m --no-log-prefix caddy   | grep -E '"level":"(warn|error)"'
docker compose logs --since 15m --no-log-prefix garage  | sed 's/\x1b\[[0-9;]*m//g' | grep -E ' (WARN|ERROR) '
```

A control-plane `request failed` line means a 500 was returned somewhere; find which request,
even if the UI looked fine. `ask: denied` for your own `e2e-*` hosts after cleanup is expected.

## Step 6 — Report

Leave the stack as you found it: if you started it, ask whether to keep it running; don't stop
a stack the user already had running.

| Area | How it was checked | Result |
|---|---|---|
| Image vs code | smoke.sh stack block | current / stale (rebuilt or not) |
| Smoke test | `smoke.sh` | PASS 35 checks |
| Object browser API | `smoke.sh` | ... |
| Object browser UI | browser | ... |
| <the feature> | api.sh / curl / aws-cli / browser | ... |
| Phone width, dark mode | browser | ... |
| Logs | filtered `docker compose logs` | ... |

Then list **what was not checked and why**: screens behind login if nobody signed in, a stale
image you didn't rebuild, missing fixtures, no real DNS / Let's Encrypt / external proxy.
Reporting a gap honestly is more useful than implying everything passed.
