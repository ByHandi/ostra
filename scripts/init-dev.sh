#!/usr/bin/env bash
# Setup awal untuk development: bucket, access key, file contoh, akun admin dashboard,
# dan custom domain contoh (didaftarkan lewat API control-plane).
# Butuh .env dari `scripts/gen-env.sh --dev`.
# Aman dijalankan ulang (langkah yang sudah dilakukan akan dilewati).
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="${BUCKET:-assets}"
KEY_NAME="${KEY_NAME:-app-key}"
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-cdn.brandku.localhost}"

set -a
# .env dibuat gen-env.sh dan tidak ada di repo, jadi tidak bisa diikuti shellcheck.
# shellcheck source=/dev/null
. ./.env
set +a
if [[ "${COMPOSE_FILE:-}" != *docker-compose.dev.yml* ]]; then
  echo "Script ini hanya untuk development. Jalankan dulu: scripts/gen-env.sh --dev" >&2
  exit 1
fi
CONSOLE_HOST="console.$BASE_DOMAIN"

garage() { docker compose exec -T -e RUST_LOG=warn garage /garage "$@"; }

# Layout dibuat otomatis oleh `garage server --single-node`; tunggu sampai siap.
echo "==> Menunggu Garage siap"
ready=false
for _ in $(seq 1 60); do
  if out="$(garage status 2>/dev/null)" && ! grep -q "NO ROLE ASSIGNED" <<<"$out"; then
    ready=true
    break
  fi
  sleep 1
done
$ready || { echo "Garage belum siap setelah 60 detik" >&2; exit 1; }

echo "==> Bucket '$BUCKET'"
if garage bucket info "$BUCKET" >/dev/null 2>&1; then
  echo "    sudah ada, dilewati"
else
  garage bucket create "$BUCKET"
fi

echo "==> Access key '$KEY_NAME'"
if garage key info "$KEY_NAME" >/dev/null 2>&1; then
  echo "    sudah ada, dilewati (secret hanya tampil saat pertama dibuat; lihat .env)"
else
  out="$(garage key create "$KEY_NAME")"
  key_id="$(awk -F': *' '/^Key ID/ {print $2}' <<<"$out")"
  secret="$(awk -F': *' '/^Secret key/ {print $2}' <<<"$out")"
  if [[ -z "$key_id" || -z "$secret" ]]; then
    echo "Gagal membaca output 'garage key create':" >&2
    echo "$out" >&2
    exit 1
  fi
  for kv in "S3_ACCESS_KEY_ID=$key_id" "S3_SECRET_ACCESS_KEY=$secret"; do
    k="${kv%%=*}"
    if grep -q "^$k=" .env; then
      sed -i.bak "s|^$k=.*|$kv|" .env && rm -f .env.bak
    else
      echo "$kv" >> .env
    fi
  done
  echo "    key $key_id disimpan ke .env"
fi
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME" >/dev/null

echo "==> Upload file contoh"
docker compose run --rm -T --quiet-pull awscli s3 cp --only-show-errors --recursive /sample "s3://$BUCKET/"

echo "==> Akun admin dashboard '$DEV_ADMIN_EMAIL'"
set +e
printf '%s\n' "$DEV_ADMIN_PASSWORD" |
  docker compose exec -T control /control createuser \
    --email "$DEV_ADMIN_EMAIL" --name "Admin" --password-stdin >/dev/null 2>&1
code=$?
set -e
case "$code" in
  0) echo "    dibuat (password ada di .env: DEV_ADMIN_PASSWORD)" ;;
  3) echo "    sudah ada, dilewati" ;;
  *) echo "Gagal membuat akun admin (exit $code)" >&2; exit 1 ;;
esac

echo "==> Daftarkan custom domain '$CUSTOM_DOMAIN' lewat control-plane"
api() {
  curl -sk --resolve "$CONSOLE_HOST:443:127.0.0.1" -H "Content-Type: application/json" "$@"
}
login="$(api -d "{\"email\":\"$DEV_ADMIN_EMAIL\",\"password\":\"$DEV_ADMIN_PASSWORD\"}" \
  "https://$CONSOLE_HOST/api/auth/login")"
token="$(sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p' <<<"$login")"
if [[ -z "$token" ]]; then
  echo "Login gagal: $login" >&2
  exit 1
fi

resp="$(mktemp)"
trap 'rm -f "$resp"' EXIT
status="$(api -o "$resp" -w '%{http_code}' -H "Authorization: Bearer $token" \
  -d "{\"domain\":\"$CUSTOM_DOMAIN\",\"bucket\":\"$BUCKET\"}" \
  "https://$CONSOLE_HOST/api/domains")"
case "$status" in
  201) echo "    terdaftar: $(grep -o '"status":"[a-z]*"' "$resp")" ;;
  409) echo "    sudah terdaftar, dilewati" ;;
  *)   echo "Gagal mendaftarkan domain (HTTP $status):" >&2; cat "$resp" >&2; exit 1 ;;
esac

cat <<MSG

Selesai.

Dashboard: https://$CONSOLE_HOST  (login: $DEV_ADMIN_EMAIL, password di .env → DEV_ADMIN_PASSWORD)

Coba juga:
  curl -k https://$CUSTOM_DOMAIN/
  curl -k https://$CUSTOM_DOMAIN/hello.txt
  curl -k https://$BUCKET.web.$BASE_DOMAIN/hello.txt
  docker compose run --rm awscli s3 ls s3://$BUCKET/
MSG
