#!/usr/bin/env bash
# Restore data from a backup created by scripts/backup.sh.
#
#   scripts/restore.sh <backup-folder> [--yes]
#
# ALL contents of the volumes in the backup are DELETED and replaced with the backup contents.
# Checksums are verified first; if any archive is corrupt, nothing is changed.
# The .env file is not restored automatically. If the backup was made with --with-env, copy
# <backup-folder>/env to .env yourself if needed.
set -euo pipefail
cd "$(dirname "$0")/.."

TOOL_IMAGE=busybox:1.37.0

src=""
yes=false
for arg in "$@"; do
  case "$arg" in
    --yes) yes=true ;;
    -*) echo "usage: $0 <backup-folder> [--yes]" >&2; exit 2 ;;
    *) src="$arg" ;;
  esac
done
if [[ -z "$src" || ! -f "$src/SHA256SUMS" ]]; then
  echo "usage: $0 <backup-folder> [--yes]  (the folder must contain SHA256SUMS)" >&2
  exit 2
fi
src="$(cd "$src" && pwd)"

echo "==> Verifying checksums"
if ! docker run --rm -v "$src:/backup:ro" -w /backup "$TOOL_IMAGE" sha256sum -c SHA256SUMS; then
  echo "Checksum mismatch: the backup is corrupt or incomplete. No data was changed." >&2
  exit 1
fi
volumes=()
while read -r _ file; do
  volumes+=("${file%.tar.gz}")
done < "$src/SHA256SUMS"

project="$(docker compose config | sed -n 's/^name: //p' | head -1)"
volume_of() {
  docker volume ls -q \
    --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.volume=$1"
}

echo
sed 's/^/    /' "$src/MANIFEST" 2>/dev/null || true
echo
echo "The contents of the following volumes in project '$project' will be DELETED and replaced with the backup:"
printf '    %s\n' "${volumes[@]}"
if ! $yes; then
  read -r -p "Type 'restore' to continue: " answer
  [[ "$answer" == restore ]] || { echo "Aborted."; exit 1; }
fi

echo "==> Stopping services"
docker compose stop >/dev/null

for v in "${volumes[@]}"; do
  vol="$(volume_of "$v")"
  if [[ -z "$vol" ]]; then
    # New server: create the volume with compose labels so `docker compose up` uses it.
    vol="${project}_$v"
    docker volume create \
      --label "com.docker.compose.project=$project" \
      --label "com.docker.compose.volume=$v" \
      "$vol" >/dev/null
  fi
  echo "==> Restoring $v"
  docker run --rm \
    -v "$vol:/data" \
    -v "$src:/backup:ro" \
    "$TOOL_IMAGE" sh -c "find /data -mindepth 1 -delete && tar xzf /backup/$v.tar.gz -C /data --numeric-owner"
done

echo "==> Starting services"
docker compose up -d >/dev/null
echo "==> Done. Check the status with: docker compose ps"
