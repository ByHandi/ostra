---
name: cut-release
description: Prepare and verify an Ostra release — pick the semver version from what's in CHANGELOG [Unreleased], tidy those entries into release notes for operators (upgrade notes for migrations, new env vars, breaking config), rename the section to `## [X.Y.Z] - YYYY-MM-DD` with a fresh [Unreleased] above it, run the CI checks and a version-stamped image build, run the bundled preflight (branch, clean tree, tag unused, version newer, LICENSE, release-notes preview with the workflow's own awk), then hand the user the exact commit/PR/tag commands and, after they push the tag, verify the GitHub Release, the multi-arch GHCR image and `control version`. Use whenever the user wants to release, tag, publish, ship a version, cut v0.1.0 / an -rc, update the changelog for a release, or asks "rilis", "bikin tag", "naikin versi", "publish image", "siap rilis belum?", "release notes".
---

# Cut a release (Ostra)

How releases work here (`.github/workflows/release.yml`): pushing a tag `vX.Y.Z` runs the full
CI, then builds a `linux/amd64` + `linux/arm64` image with `VERSION=<tag>` and `COMMIT=<sha>`
baked in via ldflags (that's what `control version`, `/api/version` and the Settings page
show), pushes it to `ghcr.io/byhandi/ostra` with provenance and an SBOM, and creates a GitHub
Release whose notes are the `## [X.Y.Z]` section of `CHANGELOG.md`.

| Tag | Image tags | GitHub Release |
|---|---|---|
| `v0.2.0` | `0.2.0`, `0.2`, `latest` | normal |
| `v0.2.0-rc.1` | `0.2.0-rc.1` only | pre-release |

There is **no version number in any source file** to bump: the tag is the version.
(`web/package.json`'s `version` is unused; leave it.)

Pushing a tag publishes things other people pull — an image and a release. Deleting a tag
afterwards does not unpublish the image. So everything up to the tag is preparation and
checking, and the tag push itself is the user's call.

**Who runs git.** This user commits and pushes themselves. Prepare the files, run the checks,
and hand over the exact commands. Only commit, push or tag if the user explicitly asks you to
in the current conversation — and even then confirm the tag push separately, naming the tag
and what it will publish.

## Step 1 — Blockers and the version

Read `ROADMAP.md` as it is now (don't rely on this file's summary of it) and sort its open items
into two groups:

- **Blocks the tag** — things that must be in the tagged commit or decided before anyone can
  use the release. For the first release that's the license: a non-empty `LICENSE`, plus the
  README license section and the dependency license check (ROADMAP Phase 1.2). The preflight
  fails on a missing or empty `LICENSE`.
- **Around the release** — settings and follow-ups that don't change the commit: making the
  GHCR package Public (only possible after the first push), enabling private vulnerability
  reporting for `SECURITY.md`. List them in the hand-off; they don't stop preparation.

Tell the user about the blockers up front, then keep preparing everything else (notes, checks,
preview) so the release is ready the moment the blocker is resolved — unless they say to stop.

Then propose a version from what's under `## [Unreleased]` and `git log <last-tag>..HEAD`
(`git tag --sort=-v:refname | head -1`; no tags yet means the first release, `0.1.0`):

- While on `0.x`: anything breaking (removed/renamed env var, changed API response, a
  migration that changes behavior, config that must be edited on upgrade) or any new feature →
  bump **minor** (`0.1.0` → `0.2.0`). Only fixes/security → **patch** (`0.2.0` → `0.2.1`).
- After `1.0.0`: normal semver (breaking → major).
- Risky changes (data migrations, auth, Caddy/TLS, compose layout) → suggest an `-rc.1` first;
  it leaves `latest` alone, so production stacks that track `latest` don't pick it up.

The version is the user's decision; state your recommendation with the reason and confirm it.

## Step 2 — Release notes (CHANGELOG.md)

The section becomes the public release notes verbatim, so write it for operators who run Ostra,
not for its developers.

1. **Completeness.** Compare `[Unreleased]` with the merged PRs since the last tag
   (`git log --merges --oneline <last>..HEAD` keeps it short). For the first release there's no
   last tag and the history is long: cross-check against ROADMAP's done items and the README
   "Features" section instead. Add any user-visible change that's missing (features, behavior
   changes, new env vars, security fixes). Leave out internal refactors, CI tweaks, and tooling
   (e.g. agent skills). Don't claim support for what ROADMAP marks unverified (e.g. Dokploy).
2. **Structure.** [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) headings, in this
   order, only those that have entries: `### Added`, `### Changed`, `### Deprecated`,
   `### Removed`, `### Fixed`, `### Security`. One `- ` bullet per change, wrapped at ~100
   columns like the rest of the file. Remove blank lines inside a list (the current
   `[Unreleased]` has one in `### Added`): they break the list into two when rendered.
3. **Upgrade notes.** If the release needs anything from operators, put it first under
   `### Changed` (or a short paragraph right under the heading): new required env vars,
   `.env` keys renamed (`scripts/gen-env.sh` handles adding/removing keys — say to re-run it),
   compose changes, and **database migrations** — migrations aren't reverted on rollback, so a
   rollback needs the pre-upgrade backup (README "Upgrading"). The preflight warns when
   `control/db/migrations` changed since the last tag.
4. **Rename and reopen.** Turn `## [Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD` (the UTC date
   you expect to tag, ISO format; if the tag slips, the preflight warns and the user can re-date
   it in a small PR or accept it) and add an empty `## [Unreleased]` above it. Keep the intro
   paragraph at the top of the file as it is. The heading must be exactly that shape: the
   workflow's awk matches `^## \[X.Y.Z\]`, and anything else silently falls back to
   auto-generated notes.
5. **ROADMAP.** Tick only what will be true when the tag is pushed. The current line "First
   release `v0.1.0` (after the license is decided), then make sure the GHCR package is Public"
   bundles a post-release step, so split it: tick the release, leave a separate unticked item
   for making the package Public.

Preview the result while editing (the git checks are skipped, CHANGELOG lint is not):

```bash
.claude/skills/cut-release/scripts/preflight.sh --preview X.Y.Z
```

It warns about blank lines inside a list, lines over 100 columns, and headings out of Keep a
Changelog order, and prints the notes exactly as the GitHub Release will show them.

## Step 3 — Prove the commit is releasable

The tag re-runs CI, but a red CI after the tag means a tag pointing at a broken commit. Run
what `.github/workflows/ci.yml` runs — it is the source of truth; CONTRIBUTING.md's list lags
behind (no `npm run build`, no compose validation, unpinned govulncheck). The `pre-pr-verify`
skill derives the steps from `ci.yml`. Two local differences:

- **Compose validation** in CI copies `.env.example` over `.env` and edits it with GNU `sed`.
  Locally that would overwrite a real `.env`, and BSD `sed` on macOS silently doesn't match
  `\|`. Use a temporary env file instead:

  ```bash
  tmp=$(mktemp) && sed -e 's/^BASE_DOMAIN=$/BASE_DOMAIN=example.com/' \
    -e 's/^ACME_EMAIL=$/ACME_EMAIL=ops@example.com/' \
    -E -e 's/^(GARAGE_[A-Z_]*|CONTROL_JWT_SECRET)=$/\1=ci/' .env.example >"$tmp"
  docker compose --env-file "$tmp" -f docker-compose.yml config --quiet && echo ok prod
  docker compose --env-file "$tmp" -f docker-compose.yml -f docker-compose.dev.yml config --quiet && echo ok dev
  docker compose --env-file "$tmp" -f docker-compose.external-proxy.yml config --quiet && echo ok external-proxy
  rm -f "$tmp"
  ```

- **`npm audit`** needs the registry's advisories endpoint. If it times out, retry once later;
  if it still fails, report it as not verified (CI will run it on the tag) rather than
  spending more time on it.

The `e2e-local-stack` smoke test only makes sense against a stack built from the release
commit. The user's running dev stack is built from their main checkout and holds their dev
data, so run it there after the release PR is merged (with `docker compose up -d --build
control` first), not from a worktree.

Then check that the version stamping works, since that's the one thing only a release build
does:

```bash
docker build -q -f control/Dockerfile \
  --build-arg VERSION=vX.Y.Z --build-arg COMMIT="$(git rev-parse HEAD)" \
  -t ostra-control:release-check .
docker run --rm ostra-control:release-check version   # must print vX.Y.Z and the commit
docker image rm ostra-control:release-check
```

This builds the native architecture from the working tree, so the printed commit is only
accurate on a clean tree; the other architecture is covered by CI's cross-compiled build.

## Step 4 — Preflight and hand-off

```bash
.claude/skills/cut-release/scripts/preflight.sh X.Y.Z
```

It's read-only (only a `git fetch`). Without `--preview` it adds the git checks: branch
`main`, no uncommitted changes to tracked files (untracked files are only a warning; they
never reach a tag), HEAD equal to `origin/main` — on top of semver, tag unused locally and on
origin, version newer than the last tag, CHANGELOG heading/date/notes/lint, a remaining
`[Unreleased]`, a non-empty `LICENSE`, and new migrations. Those git checks only go green once
the release commit is merged to main; that's the run that must end with `READY`.

Hand the user the sequence, filled in with the real version and branch:

```bash
git switch -c chore/release-X.Y.Z
git add CHANGELOG.md ROADMAP.md
git commit -m "chore: release vX.Y.Z"
git push -u origin chore/release-X.Y.Z      # open a PR, let CI pass, merge it
git switch main && git pull
.claude/skills/cut-release/scripts/preflight.sh X.Y.Z   # must end with READY
git tag vX.Y.Z
git push origin vX.Y.Z                      # publishes the image and the GitHub Release
```

(Lightweight tag, matching the README's "CI and releases" section.)

## Step 5 — After the tag is pushed

Follow the run at https://github.com/ByHandi/ostra/actions (the `gh` CLI isn't installed on
this machine; use a browser tool, or ask the user to look). Jobs: CI → Image → GitHub Release.
Then verify the result rather than the workflow's green check:

```bash
docker buildx imagetools inspect ghcr.io/byhandi/ostra:X.Y.Z   # linux/amd64 and linux/arm64
docker run --rm ghcr.io/byhandi/ostra:X.Y.Z version            # vX.Y.Z + the tagged commit
```

- The GitHub Release exists, is (not) a pre-release as intended, and its notes match the
  preview.
- Stable release: `ghcr.io/byhandi/ostra:latest` and `:X.Y` point at the same digest as
  `:X.Y.Z`.
- First release: the GHCR package starts **private**. Making it Public is a package setting
  on GitHub (Package settings → Change visibility), and it's the user's to change. Until then
  the anonymous `docker pull` above fails with `unauthorized`, and so would every deployment
  that follows the README.

If something fails:

- **CI or Image job failed** → nothing was published. Fix on main through a PR, then move the
  tag (with the user's OK): `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`, re-tag
  the fixed commit, push again.
- **Image pushed, GitHub Release job failed** → re-run that job from the Actions page. Don't
  move the tag: the image for that version already exists.
- **A bug found after release** → fix forward with a patch version. Never re-point a
  published tag: anyone who already pulled `X.Y.Z` would have a different image than the
  release says.

## Report

End with: the version and why, the final release notes, the check results (CI commands,
image `version` output, preflight verdict), the exact commands for the user, and, after the
push, what you verified (release, both architectures, `version` output, `latest`, package
visibility) — plus anything you couldn't check.
