#!/usr/bin/env bash
# Mengembalikan data dari backup yang dibuat scripts/backup.sh.
#
#   scripts/restore.sh <folder-backup> [--yes]
#
# SEMUA isi volume yang ada di backup akan DIHAPUS lalu diganti isi backup. Checksum
# diperiksa dulu; kalau ada arsip yang rusak, tidak ada yang diubah.
# File .env tidak dikembalikan otomatis. Kalau backup dibuat dengan --with-env, salin
# <folder-backup>/env ke .env sendiri bila perlu.
set -euo pipefail
cd "$(dirname "$0")/.."

TOOL_IMAGE=busybox:1.37.0

src=""
yes=false
for arg in "$@"; do
  case "$arg" in
    --yes) yes=true ;;
    -*) echo "pemakaian: $0 <folder-backup> [--yes]" >&2; exit 2 ;;
    *) src="$arg" ;;
  esac
done
if [[ -z "$src" || ! -f "$src/SHA256SUMS" ]]; then
  echo "pemakaian: $0 <folder-backup> [--yes]  (folder harus berisi SHA256SUMS)" >&2
  exit 2
fi
src="$(cd "$src" && pwd)"

echo "==> Memeriksa checksum"
if ! docker run --rm -v "$src:/backup:ro" -w /backup "$TOOL_IMAGE" sha256sum -c SHA256SUMS; then
  echo "Checksum tidak cocok: backup rusak atau tidak lengkap. Tidak ada data yang diubah." >&2
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
echo "Isi volume berikut di project '$project' akan DIHAPUS dan diganti isi backup:"
printf '    %s\n' "${volumes[@]}"
if ! $yes; then
  read -r -p "Ketik 'restore' untuk lanjut: " answer
  [[ "$answer" == restore ]] || { echo "Dibatalkan."; exit 1; }
fi

echo "==> Menghentikan service"
docker compose stop >/dev/null

for v in "${volumes[@]}"; do
  vol="$(volume_of "$v")"
  if [[ -z "$vol" ]]; then
    # Server baru: buat volume dengan label compose supaya dipakai `docker compose up`.
    vol="${project}_$v"
    docker volume create \
      --label "com.docker.compose.project=$project" \
      --label "com.docker.compose.volume=$v" \
      "$vol" >/dev/null
  fi
  echo "==> Mengembalikan $v"
  docker run --rm \
    -v "$vol:/data" \
    -v "$src:/backup:ro" \
    "$TOOL_IMAGE" sh -c "find /data -mindepth 1 -delete && tar xzf /backup/$v.tar.gz -C /data --numeric-owner"
done

echo "==> Menyalakan service"
docker compose up -d >/dev/null
echo "==> Selesai. Cek status dengan: docker compose ps"
