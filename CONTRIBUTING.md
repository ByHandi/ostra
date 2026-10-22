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
npm install                    # repo root: installs the git pre-commit hook (husky)
./scripts/gen-env.sh --dev     # local .env, uses docker-compose.dev.yml
docker compose up -d --build
./scripts/init-dev.sh          # sample bucket, key, custom domain
```

Then open http://127.0.0.1:8080 and log in with `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` from
`.env` (the control-plane creates that account on its first start with an empty database). For dashboard work with hot reload, run `npm run dev` in `web/` (it proxies `/api` to the
control-plane). See the [README](README.md#local-development) for more.

## Pre-commit hook

`npm install` at the repo root sets up a husky pre-commit hook that runs on the staged files:

- `web/`: Prettier and `eslint --fix` (lint-staged config in `web/package.json`), then
  `npm run typecheck` when the commit touches `web/`.
- `control/`: `gofmt -w`, `go vet`, and the complexity limits below.
- `scripts/`: shellcheck (the same pinned version as CI, via Docker).

Formatting fixes are applied and re-staged automatically; anything else blocks the commit.
CI runs the same checks, so skipping the hook (`--no-verify`) only moves the failure to the PR.

## Complexity limits

Functions are kept small enough to follow at a glance. When one grows past a limit, split it
into well-named helpers instead of raising the limit.

| Code | Cyclomatic | Cognitive |
|---|---|---|
| Go (`control/`) | 12 ([gocyclo](https://github.com/fzipp/gocyclo)) | 15 ([gocognit](https://github.com/uudashr/gocognit)) |
| TypeScript (`web/`) | 15 (ESLint `complexity`) | 15 (`sonarjs/cognitive-complexity`) |

Tests and sqlc-generated code are excluded on the Go side. In `web/`, the shadcn primitives
(`src/components/ui`) and the template's form wrappers (`src/components/form`) are exempt from
`complexity` only, because it counts every prop default and `?.`; cognitive complexity still
applies to them.

## Before opening a pull request

Run the same checks as CI:

```bash
# Go (in control/)
gofmt -l .                     # must print nothing
go vet ./...
go test -race ./...
go run golang.org/x/vuln/cmd/govulncheck@latest ./...
go run github.com/fzipp/gocyclo/cmd/gocyclo@v0.6.0 -over 12 -ignore '_test|internal/store/' .
go run github.com/uudashr/gocognit/cmd/gocognit@v1.3.0 -over 15 -ignore '_test|internal/store/' .

# Web (in web/)
npm run typecheck
npm run lint
npx prettier --check .
npm audit --omit=dev

# Scripts (repo root), same shellcheck version as CI
docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:v0.11.0 scripts/*.sh
```

## Issue & branch workflow

To coordinate work and avoid duplicate effort across collaborators:

1. **Pick an issue:** Choose an open, unassigned issue from GitHub Issues or the Project Board.
2. **Claim it:** Assign yourself to the issue and move its card to **In Progress** on the Project Board before starting work.
3. **Branch naming:** Branch from `main` following the ticket convention:
   - `feat/OSTRA-XX-short-description` for features
   - `fix/OSTRA-XX-short-description` for bug fixes
4. **Link in Pull Request:** In your PR description, write `Closes #<issue-number>` (e.g. `Closes #12`) so GitHub links the PR to the issue and closes it automatically upon merge.

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
- **Language:** all code, comments, log and error messages, UI copy, and docs are written in
  English.
- **Security-sensitive changes** (auth, Caddy `ask`, proxies, Docker config) need a test that
  shows the unsafe case is rejected.
- **Tests:** new behavior comes with tests. Service-level tests use the in-memory Garage fake in
  `control/internal/service`.

## Reporting security issues

Please don't open public issues for vulnerabilities; see [SECURITY.md](SECURITY.md).
