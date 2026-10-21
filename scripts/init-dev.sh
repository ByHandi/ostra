#!/usr/bin/env bash
# Initial development setup: bucket, access key, sample files, dashboard admin account,
# and a sample custom domain (registered through the control-plane API).
# Requires a .env from `scripts/gen-env.sh --dev`.
# Safe to re-run (steps that are already done are skipped).
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="${BUCKET:-assets}"
KEY_NAME="${KEY_NAME:-app-key}"
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-cdn.brandku.localhost}"

set -a
# .env is created by gen-env.sh and is not in the repo, so shellcheck cannot follow it.
# shellcheck source=/dev/null
. ./.env
set +a
if [[ "${COMPOSE_FILE:-}" != *docker-compose.dev.yml* ]]; then
  echo "This script is for development only. Run this first: scripts/gen-env.sh --dev" >&2
  exit 1
fi
CONSOLE_HOST="console.$BASE_DOMAIN"

garage() { docker compose exec -T -e RUST_LOG=warn garage /garage "$@"; }

# The layout is created automatically by `garage server --single-node`; wait until it is ready.
echo "==> Waiting for Garage to be ready"
ready=false
for _ in $(seq 1 60); do
  if out="$(garage status 2>/dev/null)" && ! grep -q "NO ROLE ASSIGNED" <<<"$out"; then
    ready=true
    break
  fi
  sleep 1
done
$ready || { echo "Garage is still not ready after 60 seconds" >&2; exit 1; }

echo "==> Bucket '$BUCKET'"
if garage bucket info "$BUCKET" >/dev/null 2>&1; then
  echo "    already exists, skipped"
else
  garage bucket create "$BUCKET"
fi

echo "==> Access key '$KEY_NAME'"
if garage key info "$KEY_NAME" >/dev/null 2>&1; then
  echo "    already exists, skipped (the secret is only shown when it is first created; see .env)"
else
  out="$(garage key create "$KEY_NAME")"
  key_id="$(awk -F': *' '/^Key ID/ {print $2}' <<<"$out")"
  secret="$(awk -F': *' '/^Secret key/ {print $2}' <<<"$out")"
  if [[ -z "$key_id" || -z "$secret" ]]; then
    echo "Failed to parse the output of 'garage key create':" >&2
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
    # .env was sourced (and exported) above while these were still empty, and docker compose
    # prefers the shell environment over .env, so update the exported values too.
    export "${kv?}"
  done
  echo "    key $key_id saved to .env"
fi
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME" >/dev/null

echo "==> Uploading sample files"
docker compose run --rm -T --quiet-pull awscli s3 cp --only-show-errors --recursive /sample "s3://$BUCKET/"

echo "==> Dashboard admin account '$DEV_ADMIN_EMAIL'"
# The control-plane already creates it on startup when the database has no accounts
# (ADMIN_EMAIL in docker-compose.dev.yml); this covers a database that already had others.
set +e
printf '%s\n' "$DEV_ADMIN_PASSWORD" |
  docker compose exec -T control /control createuser \
    --email "$DEV_ADMIN_EMAIL" --name "Admin" --password-stdin >/dev/null 2>&1
code=$?
set -e
case "$code" in
  0) echo "    created (the password is in .env: DEV_ADMIN_PASSWORD)" ;;
  3) echo "    already exists, skipped" ;;
  *) echo "Failed to create the admin account (exit $code)" >&2; exit 1 ;;
esac

echo "==> Registering custom domain '$CUSTOM_DOMAIN' through the control-plane"
api() {
  curl -sk --resolve "$CONSOLE_HOST:443:127.0.0.1" -H "Content-Type: application/json" "$@"
}
login="$(api -d "{\"email\":\"$DEV_ADMIN_EMAIL\",\"password\":\"$DEV_ADMIN_PASSWORD\"}" \
  "https://$CONSOLE_HOST/api/auth/login")"
token="$(sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p' <<<"$login")"
if [[ -z "$token" ]]; then
  echo "Login failed: $login" >&2
  exit 1
fi

resp="$(mktemp)"
trap 'rm -f "$resp"' EXIT
status="$(api -o "$resp" -w '%{http_code}' -H "Authorization: Bearer $token" \
  -d "{\"domain\":\"$CUSTOM_DOMAIN\",\"bucket\":\"$BUCKET\"}" \
  "https://$CONSOLE_HOST/api/domains")"
case "$status" in
  201) echo "    registered: $(grep -o '"status":"[a-z]*"' "$resp")" ;;
  409) echo "    already registered, skipped" ;;
  *)   echo "Failed to register the domain (HTTP $status):" >&2; cat "$resp" >&2; exit 1 ;;
esac

cat <<MSG

Done.

Dashboard: https://$CONSOLE_HOST  (login: $DEV_ADMIN_EMAIL, password in .env → DEV_ADMIN_PASSWORD)

Also try:
  curl -k https://$CUSTOM_DOMAIN/
  curl -k https://$CUSTOM_DOMAIN/hello.txt
  curl -k https://$BUCKET.web.$BASE_DOMAIN/hello.txt
  docker compose run --rm awscli s3 ls s3://$BUCKET/
MSG
