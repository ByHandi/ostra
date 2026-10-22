#!/usr/bin/env bash
# Read-only release preflight for Ostra. Checks that tagging vX.Y.Z right now would produce the
# release you expect, and previews the GitHub Release notes with the same awk extraction that
# .github/workflows/release.yml uses.
#
#   .claude/skills/cut-release/scripts/preflight.sh 0.1.0             # full check, before tagging
#   .claude/skills/cut-release/scripts/preflight.sh --preview 0.1.0   # while preparing the PR:
#        skips branch/clean-tree/up-to-date checks, keeps CHANGELOG, tag, version and LICENSE
#
# Exit 0: every check passed (warnings allowed). Exit 1: at least one check failed.
# Changes nothing: no edits, no commits, no tags, no pushes (only `git fetch`).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

preview=false
if [[ "${1:-}" == --preview ]]; then preview=true; shift; fi
[[ $# -eq 1 ]] || { echo "usage: $0 [--preview] <version>   e.g. 0.1.0 or 0.2.0-rc.1" >&2; exit 2; }
version="${1#v}"
tag="v$version"
failed=0
expected=""

ok() { printf '  ok    %s\n' "$1"; }
warn() { printf '  warn  %s\n' "$1"; }
bad() { printf '  FAIL  %s\n' "$1"; failed=1; }

echo "== version $tag"
if [[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$ ]]; then
  ok "valid semver"
  core="${version%%-*}"
  prerelease=false
  [[ "$version" == *-* ]] && prerelease=true
else
  bad "'$version' is not semver X.Y.Z or X.Y.Z-<pre> (the release workflow's image tags need it)"
  exit 1
fi
if $prerelease; then
  ok "pre-release: GitHub pre-release, image tag $version only (no $(cut -d. -f1-2 <<<"$core"), no latest)"
else
  ok "stable: image tags $version, $(cut -d. -f1-2 <<<"$core"), and latest"
fi

echo
echo "== git"
git fetch --quiet --tags origin main || bad "git fetch origin failed"
if $preview; then
  warn "--preview: branch, clean tree and origin/main checks skipped (run without it before tagging)"
else
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$branch" == main ]]; then ok "on main"; else bad "on '$branch', release from main"; fi
  # Only tracked files matter: the tag points at a commit, untracked files never reach it.
  changed="$(git status --porcelain --untracked-files=no)"
  if [[ -z "$changed" ]]; then
    ok "no uncommitted changes to tracked files"
  else
    bad "uncommitted changes to tracked files (the tag would not include them):"
    while IFS= read -r line; do printf '          %s\n' "$line"; done <<<"$changed"
  fi
  untracked="$(git status --porcelain --untracked-files=normal | grep -c '^??' || true)"
  if [[ "$untracked" != 0 ]]; then
    warn "$untracked untracked path(s): not part of the release, listed by git status"
  fi
  head="$(git rev-parse HEAD)"
  remote="$(git rev-parse origin/main 2>/dev/null || echo none)"
  if [[ "$head" == "$remote" ]]; then
    ok "HEAD is origin/main ($(git rev-parse --short HEAD))"
  elif git merge-base --is-ancestor "$remote" "$head" 2>/dev/null; then
    bad "HEAD is ahead of origin/main: merge the release commit to main (through its PR) before tagging"
  else
    bad "HEAD differs from origin/main: pull, or you'd tag a commit that isn't on main"
  fi
fi
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then bad "tag $tag already exists locally"; else ok "tag $tag not used locally"; fi
if [[ -n "$(git ls-remote --tags origin "refs/tags/$tag" 2>/dev/null)" ]]; then bad "tag $tag already exists on origin"; else ok "tag $tag not on origin"; fi

last="$(git tag --list 'v*' --sort=-v:refname | head -1)"
if [[ -z "$last" ]]; then
  ok "first release (no earlier v* tags)"
else
  last_v="${last#v}"
  last_core="${last_v%%-*}"
  highest="$(printf '%s\n%s\n' "$core" "$last_core" | sort -V | tail -1)"
  if [[ "$core" != "$last_core" && "$highest" == "$core" ]]; then
    ok "$tag is newer than $last"
  elif [[ "$core" == "$last_core" && "$last_v" == *-* && "$version" != "$last_v" ]]; then
    ok "$tag follows pre-release $last"
  else
    bad "$tag is not newer than the latest tag $last"
  fi
fi

echo
echo "== CHANGELOG.md"
notes="$(mktemp)"
trap 'rm -f "$notes"' EXIT
# Same extraction as the "Create release" step in .github/workflows/release.yml.
awk -v v="$version" '
  $0 ~ "^## \\[" v "\\]" { found = 1; next }
  found && /^## \[/ { exit }
  found { print }
' CHANGELOG.md >"$notes"
heading="$(grep -m1 -E "^## \[$version\]" CHANGELOG.md || true)"
if [[ -z "$heading" ]]; then
  bad "no '## [$version] - YYYY-MM-DD' section (rename [Unreleased] to it)"
elif [[ "$heading" =~ ^##\ \[$version\]\ -\ ([0-9]{4}-[0-9]{2}-[0-9]{2})$ ]]; then
  ok "section: $heading"
  if [[ "${BASH_REMATCH[1]}" != "$(date -u +%F)" ]]; then
    warn "date ${BASH_REMATCH[1]} is not today (UTC $(date -u +%F)): fine if intended, else re-date it in a PR"
  fi
else
  bad "heading '$heading' should be exactly '## [$version] - YYYY-MM-DD'"
fi
if grep -q '[^[:space:]]' "$notes"; then
  ok "release notes non-empty ($(grep -c '^- ' "$notes") entries)"
  # A blank line between two bullets splits the rendered list in two.
  if awk 'prev_blank && /^- / && last_bullet {f=1} /^- /{last_bullet=1} /^#/{last_bullet=0} {prev_blank=($0=="")} END{exit !f}' "$notes"; then
    warn "blank line inside a list: the release page renders it as two lists"
  fi
  long="$(awk 'length > 100' "$notes" | wc -l | tr -d ' ')"
  if [[ "$long" != 0 ]]; then warn "$long line(s) over 100 columns (the file wraps at ~100)"; fi
  order="$(grep -oE '^### (Added|Changed|Deprecated|Removed|Fixed|Security)$' "$notes" | cut -c5- | tr '\n' ' ')"
  for h in Added Changed Deprecated Removed Fixed Security; do
    if grep -q "^### $h\$" "$notes"; then expected+="$h "; fi
  done
  if [[ "$order" != "${expected:-}" ]]; then warn "headings out of Keep a Changelog order: $order"; fi
  if grep -E '^### ' "$notes" | grep -vqE '^### (Added|Changed|Deprecated|Removed|Fixed|Security)$'; then
    warn "non-standard heading(s): $(grep -E '^### ' "$notes" | grep -vE '^### (Added|Changed|Deprecated|Removed|Fixed|Security)$' | tr '\n' ' ')"
  fi
elif [[ -n "$heading" ]]; then
  bad "section [$version] is empty: the release would fall back to generated notes"
fi
if grep -qE '^## \[Unreleased\]' CHANGELOG.md; then
  ok "an [Unreleased] section exists for the next changes"
  unreleased_items="$(awk '/^## \[Unreleased\]/{f=1;next} f&&/^## \[/{exit} f&&/^- /' CHANGELOG.md | wc -l | tr -d ' ')"
  if [[ "$unreleased_items" != 0 ]]; then
    warn "[Unreleased] still has $unreleased_items entries that won't be in $tag"
  fi
else
  warn "no [Unreleased] section above the release (add an empty one for the next changes)"
fi

echo
echo "== repository"
if [[ -s LICENSE || -s LICENSE.md ]]; then ok "LICENSE present"; else
  if [[ -z "$last" ]]; then bad "no LICENSE: ROADMAP blocks the first public release on the license decision"; else warn "no LICENSE"; fi
fi
if [[ -z "$last" ]]; then
  ok "first release: no migrations to compare against"
elif git diff --quiet "$last" HEAD -- control/db/migrations; then
  ok "no new database migrations since $last"
else
  warn "new migrations since $last: a rollback needs the pre-upgrade backup (say so in the notes)"
fi

echo
echo "== release notes preview (what GitHub will show)"
sed 's/^/  | /' "$notes"

echo
if [[ $failed -eq 0 ]]; then
  echo "READY: tag $tag can be pushed."
else
  echo "NOT READY: fix the FAIL lines above." >&2
  exit 1
fi
