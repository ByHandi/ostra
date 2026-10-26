# Agent Guidelines & Development Workflow

This document defines the essential workflow, conventions, and operational rules for AI coding assistants working in this repository (Ostra). Human-facing details live in [CONTRIBUTING.md](CONTRIBUTING.md); this file does not override it.

---

## 1. Task Discovery & Backlog Workflow

1. **GitHub Issues First**:
   - The authoritative source of backlog and planned work is **GitHub Issues** (`gh issue list --state all`) and active GitHub Milestones, not just static files.
   - Before proposing what to build next or starting work, always query open GitHub issues and current milestones.
2. **Issue Naming & Ticket Keys**:
   - Features and bug fixes follow the `[OSTRA-XX]` issue title prefix (e.g. `[OSTRA-10] feat: access keys with expiration date`).
3. **Branch Naming**:
   - Always branch from `main`:
     - Features: `feat/OSTRA-XX-short-description`
     - Bug fixes: `fix/OSTRA-XX-short-description`
     - Chores/Refactoring: `chore/short-description`
4. **Pull Requests**:
   - Write `Closes #<issue-number>` in the PR description so GitHub links and closes the issue on merge.

---

## 2. Git & Commit Policy (Crucial)

- **DO NOT commit directly unless explicitly instructed by the user.**
- Keep changes in the working tree (unstaged or staged as appropriate) so the user can inspect, review, and create the git commit themselves.
- If asked to commit, follow [Conventional Commits](https://www.conventionalcommits.org) format:
  `feat(scope): description` (e.g. `feat(objects): add browser search and sorting`). The ticket key belongs in the branch name and the PR's `Closes #N`, not the commit subject.
- Don't leave temporary or debug files behind, and report the exact files you modified.

---

## 3. Architecture & Feature Implementation Order

Features typically cross four layers in this order:

1. **Data Layer** (if needed):
   - SQLite migrations in `control/db/migrations/` (numbered, never modify existing released migrations).
   - Queries in `control/db/queries/`, then run `sqlc generate` in `control/db/` (where `sqlc.yaml` lives) and keep the generated code in `control/internal/store/`.
   - Garage Admin API client in `control/internal/garage/client.go` with `Garage` interface updates in `control/internal/service/service.go` and the `fakeGarage` used by service tests.
2. **Service Layer**:
   - Business logic in `control/internal/service/` (e.g. `keys.go`, `buckets.go`, `domains.go`).
   - Use `service.Error` with `Kind` (`KindInvalid`, `KindNotFound`, `KindConflict`) and `Field` (when the error belongs to a form input) for user-visible errors, via the `invalid`, `notFound`, and `conflict` helpers.
3. **API Layer**:
   - Handlers in `control/internal/api/` (`storage_handlers.go`, etc.).
   - Routes in `control/internal/api/api.go` under `requireUser` or public as appropriate.
   - Enforce the JSON response envelope via the helpers in `envelope.go` (`writeData`, `writeFail`, `writeError`).
4. **Dashboard (Web)**:
   - API types and client functions in `web/src/lib/api/`.
   - React query hooks with TanStack Query.
   - Hand-written loading skeletons as static properties (`Component.Skeleton`).
   - Form handling with React Hook Form and `applyApiError`.
   - Responsive design (desktop table + mobile list) with light/dark theme support.

**Complexity limits** (enforced by CI and the pre-commit hook; extract well-named helpers instead of raising a limit):

| Code | Cyclomatic | Cognitive |
|---|---|---|
| Go (`control/`) | 12 (gocyclo) | 15 (gocognit) |
| TypeScript (`web/`) | 15 (ESLint `complexity`) | 15 (`sonarjs/cognitive-complexity`) |

**Tests**: new behavior comes with tests. Service-level tests use the in-memory Garage fake on real SQLite. Security-sensitive changes (auth, Caddy `ask`, proxies, Docker config) need a test that shows the unsafe case is rejected.

**Project skills**: step-by-step workflows live in `.claude/skills/` (`add-feature`, `sqlc-migration`, `e2e-local-stack`, `cut-release`); `.agents/skills/` symlinks to the same files. Use them when the task matches.

---

## 4. Language & Documentation Rules

- **English only**: All code, comments, log and error messages, commit messages, PR descriptions, UI copy, and documentation must be written in English, even when chatting with the user in another language.
- **Changelog**: Add user-visible changes under `## [Unreleased]` in `CHANGELOG.md`.
- **API Documentation**: Update the API table in `README.md` whenever routes or payloads change.
- **Roadmap**: Keep `ROADMAP.md` updated as items are completed.

---

## 5. Verification & Quality Gates

Always verify changes locally before concluding work. Run the same checks as CI (`.github/workflows/ci.yml`), listed in [CONTRIBUTING.md § Before opening a pull request](CONTRIBUTING.md#before-opening-a-pull-request):

```bash
# Go (in control/)
gofmt -l .                     # must print nothing
go vet ./...
go test -race ./...
go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...
go run github.com/fzipp/gocyclo/cmd/gocyclo@v0.6.0 -over 12 -ignore '_test|internal/store/' .
go run github.com/uudashr/gocognit/cmd/gocognit@v1.3.0 -over 15 -ignore '_test|internal/store/' .

# Web (in web/)
npm run typecheck
npm run lint
npx prettier --check .
npm audit --omit=dev --audit-level=high
npm run build

# Scripts (repo root), same shellcheck version as CI
docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:v0.11.0 scripts/*.sh
```

If CI changes, follow `ci.yml` over this list.

---

## 6. Code Search

- Use standard search tools (`git grep`, ripgrep) for exact symbol and identifier references.
- If a semantic code-search MCP server (e.g. XERJ, prefix `storage-edge`) is configured in your environment, you may use it for broader exploration; don't assume it is available.
