# Contributing

Thanks for helping out! This guide covers the development setup, the checks CI runs, and the
conventions the codebase follows.

## Prerequisites

- Docker with Compose v2
- Go (version from `control/go.mod`)
- Node.js 24 and npm
- [sqlc](https://sqlc.dev) if you change SQL queries or migrations

## Development setup

```bash
./scripts/gen-env.sh --dev     # local .env, uses docker-compose.dev.yml
docker compose up -d --build
./scripts/init-dev.sh          # sample bucket, key, admin account, custom domain
```

Then open http://127.0.0.1:8080 and log in with `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` from
`.env`. For dashboard work with hot reload, run `npm run dev` in `web/` (it proxies `/api` to the
control-plane). See the [README](README.md#local-development) for more.

## Before opening a pull request

Run the same checks as CI:

```bash
# Go (in control/)
gofmt -l .                     # must print nothing
go vet ./...
go test -race ./...
go run golang.org/x/vuln/cmd/govulncheck@latest ./...

# Web (in web/)
npm run typecheck
npm run lint
npx prettier --check .
npm audit --omit=dev

# Scripts (repo root)
shellcheck scripts/*.sh
```

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org): `feat:`,
  `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`.
- **Changelog:** add user-visible changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
- **Go:** standard library first, `chi` for routing. Errors shown to users go through
  `service.Error` (with a `Field` when they belong to a form input), so the API can map them to
  status codes and per-field messages.
- **Database:** add a new numbered file in `control/db/migrations` (never edit a released one),
  put queries in `control/db/queries`, then run `sqlc generate` in `control/db` and commit the
  generated code.
- **Frontend:** data components ship their own loading skeleton as a static property
  (`BucketTable.Skeleton`), pages use `useQuery`, and API types live in `web/src/lib/api`.
  UI copy is currently in Indonesian; keep new strings consistent with the surrounding text.
- **Security-sensitive changes** (auth, Caddy `ask`, proxies, Docker config) need a test that
  shows the unsafe case is rejected.
- **Tests:** new behavior comes with tests. Service-level tests use the in-memory Garage fake in
  `control/internal/service`.

## Reporting security issues

Please don't open public issues for vulnerabilities; see [SECURITY.md](SECURITY.md).
