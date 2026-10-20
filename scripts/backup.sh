#!/usr/bin/env bash
# Backup semua data storage-edge ke backups/storage-edge-<waktu UTC>/.
#
#   scripts/backup.sh [--with-env] [folder-tujuan]
#
# Cold backup: semua service dihentikan selama penyalinan, supaya metadata Garage (LMDB),
# blok data, dan database control-plane (SQLite) konsisten satu sama lain. Service yang
# sebelumnya jalan dinyalakan lagi setelah selesai (juga kalau backup gagal).
#
# Isi backup: garage-meta, garage-data, control-data, caddy-data (sertifikat), MANIFEST,
# dan SHA256SUMS. File .env (berisi secret) TIDAK ikut kecuali --with-env; simpan .env di
# tempat aman secara terpisah.
set -euo pipefail
cd "$(dirname "$0")/.."

TOOL_IMAGE=busybox:1.37.0
VOLUMES=(garage-meta garage-data control-data caddy-data)

with_env=false
out_root=backups
for arg in "$@"; do
  case "$arg" in
    --with-env) with_env=true ;;
    -*) echo "pemakaian: $0 [--with-env] [folder-tujuan]" >&2; exit 2 ;;
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
    echo "Volume $v untuk project $project tidak ditemukan. Sudah pernah 'docker compose up'?" >&2
    exit 1
  fi
done

dest="$out_root/storage-edge-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dest"
dest="$(cd "$dest" && pwd)"

# Versi dibaca dari image container yang sudah ada (bukan `compose run`, yang di mode dev
# bisa memicu build).
version="tidak diketahui"
container="$(docker compose ps -aq control 2>/dev/null | head -1)"
image="$([[ -n "$container" ]] && docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true)"
if [[ -n "$image" ]]; then
  version="$(docker run --rm "$image" version 2>/dev/null || echo "tidak diketahui")"
fi

running="$(docker compose ps --services --status running)"
restart() {
  if [[ -n "$running" ]]; then
    echo "==> Menyalakan lagi: $(echo "$running" | tr '\n' ' ')"
    # shellcheck disable=SC2086 # sengaja dipecah per nama service
    docker compose start $running >/dev/null
  fi
}
trap restart EXIT

echo "==> Menghentikan service"
docker compose stop >/dev/null

for v in "${VOLUMES[@]}"; do
  echo "==> Menyalin $v"
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

echo "==> Selesai: $dest"
du -sh "$dest" | cut -f1 | sed 's/^/    ukuran: /'
