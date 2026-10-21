#!/usr/bin/env bash
# Back up all Ostra data to backups/ostra-<UTC time>/.
#
#   scripts/backup.sh [--with-env] [destination-folder]
#
# Cold backup: all services are stopped while copying, so the Garage metadata (LMDB),
# data blocks, and the control-plane database (SQLite) stay consistent with each other.
# Services that were running before are started again afterwards (also if the backup fails).
#
# Backup contents: garage-meta, garage-data, control-data, caddy-data (certificates), MANIFEST,
# and SHA256SUMS. The .env file (which holds secrets) is NOT included unless --with-env is
# given; store .env separately somewhere safe.
set -euo pipefail
cd "$(dirname "$0")/.."

TOOL_IMAGE=busybox:1.37.0
VOLUMES=(garage-meta garage-data control-data caddy-data)

with_env=false
out_root=backups
for arg in "$@"; do
  case "$arg" in
    --with-env) with_env=true ;;
    -*) echo "usage: $0 [--with-env] [destination-folder]" >&2; exit 2 ;;
    *) out_root="$arg" ;;
  esac
done

project="$(docker compose config | sed -n 's/^name: //p' | head -1)"
volume_of() {
  docker volume ls -q \
    --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.volume=$1"
}

for v in "${VOLUMES[@]}"; do
  if [[ -z "$(volume_of "$v")" ]]; then
    echo "Volume $v for project $project not found. Have you run 'docker compose up' yet?" >&2
    exit 1
  fi
done

dest="$out_root/ostra-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dest"
dest="$(cd "$dest" && pwd)"

# The version is read from the image of the existing container (not `compose run`, which in
# dev mode could trigger a build).
version="unknown"
container="$(docker compose ps -aq control 2>/dev/null | head -1)"
if [[ -n "$container" ]]; then
  image="$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true)"
  if [[ -n "$image" ]]; then
    version="$(docker run --rm "$image" version 2>/dev/null || echo "unknown")"
  fi
fi

running="$(docker compose ps --services --status running)"
restart() {
  if [[ -n "$running" ]]; then
    echo "==> Starting again: $(echo "$running" | tr '\n' ' ')"
    # shellcheck disable=SC2086 # intentionally split into one word per service name
    docker compose start $running >/dev/null
  fi
}
trap restart EXIT

echo "==> Stopping services"
docker compose stop >/dev/null

for v in "${VOLUMES[@]}"; do
  echo "==> Copying $v"
  docker run --rm \
    -v "$(volume_of "$v"):/data:ro" \
    -v "$dest:/backup" \
    "$TOOL_IMAGE" tar czf "/backup/$v.tar.gz" -C /data .
done

if $with_env; then
  cp .env "$dest/env"
  chmod 600 "$dest/env"
fi

cat > "$dest/MANIFEST" <<MANIFEST
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
project=$project
control=$version
volumes=${VOLUMES[*]}
with_env=$with_env
MANIFEST

docker run --rm -v "$dest:/backup" -w /backup "$TOOL_IMAGE" \
  sh -c 'sha256sum *.tar.gz > SHA256SUMS'

echo "==> Done: $dest"
du -sh "$dest" | cut -f1 | sed 's/^/    size: /'
