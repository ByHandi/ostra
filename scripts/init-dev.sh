#!/usr/bin/env bash
# Setup awal untuk development: layout Garage, bucket, access key, file contoh,
# akun admin dashboard, dan custom domain contoh (didaftarkan lewat API control-plane).
# Aman dijalankan ulang (langkah yang sudah dilakukan akan dilewati).
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="${BUCKET:-assets}"
KEY_NAME="${KEY_NAME:-app-key}"
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-cdn.brandku.localhost}"
CAPACITY="${CAPACITY:-10G}"
CONSOLE_HOST="${CONSOLE_HOST:-console.localhost}"

garage() { docker compose exec -T -e RUST_LOG=warn garage /garage "$@"; }

echo "==> Menunggu Garage siap"
for _ in $(seq 1 30); do
  garage status >/dev/null 2>&1 && break
  sleep 1
done
garage status >/dev/null

echo "==> Layout cluster"
if garage status | grep -q "NO ROLE ASSIGNED"; then
  node_id="$(garage node id -q | cut -d@ -f1)"
  garage layout assign -z dc1 -c "$CAPACITY" "$node_id"
  garage layout apply --version 1
else
  echo "    sudah ada, dilewati"
fi

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
  sed -i.bak \
    -e "s|^S3_ACCESS_KEY_ID=.*|S3_ACCESS_KEY_ID=$key_id|" \
    -e "s|^S3_SECRET_ACCESS_KEY=.*|S3_SECRET_ACCESS_KEY=$secret|" \
    .env && rm -f .env.bak
  echo "    key $key_id disimpan ke .env"
fi
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME" >/dev/null

echo "==> Upload file contoh"
docker compose run --rm -T --quiet-pull awscli s3 cp --only-show-errors --recursive /sample "s3://$BUCKET/"

set -a; . ./.env; set +a

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
  curl -k https://$BUCKET.web.localhost/hello.txt
  docker compose run --rm awscli s3 ls s3://$BUCKET/
MSG
