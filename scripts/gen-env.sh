#!/usr/bin/env bash
# Create or complete .env:
#   scripts/gen-env.sh         production: fills in the secrets, then you set BASE_DOMAIN and ACME_EMAIL
#   scripts/gen-env.sh --dev   local development: everything filled in, docker-compose.dev.yml is used too
#
# Safe to re-run: existing values are left unchanged, new keys are added,
# and keys that are no longer used are removed.
set -euo pipefail
cd "$(dirname "$0")/.."

dev=false
case "${1:-}" in
  --dev) dev=true ;;
  "") ;;
  *) echo "usage: $0 [--dev]" >&2; exit 2 ;;
esac

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo ".env created."
fi

has() { grep -q "^$1=" .env; }
value() { sed -n "s/^$1=//p" .env | head -1; }
set_value() {
  if has "$1"; then
    sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak
  else
    echo "$1=$2" >> .env
  fi
}

# Required keys from .env.example that are still missing.
while IFS= read -r line; do
  [[ "$line" =~ ^([A-Z0-9_]+)= ]] || continue
  key="${BASH_REMATCH[1]}"
  if ! has "$key"; then
    echo "$line" >> .env
    echo "added: $key"
  fi
done < .env.example

# Old keys that have been replaced (domains are now derived from BASE_DOMAIN, dev mode comes
# from docker-compose.dev.yml).
for key in CONTROL_API_TOKEN CADDYFILE S3_DOMAIN CONSOLE_DOMAIN WEB_ROOT_DOMAIN DNS_VERIFY COOKIE_SECURE; do
  if has "$key"; then
    sed -i.bak "/^$key=/d" .env && rm -f .env.bak
    echo "removed (no longer used): $key"
  fi
done

secrets=(GARAGE_RPC_SECRET GARAGE_ADMIN_TOKEN GARAGE_METRICS_TOKEN CONTROL_JWT_SECRET)

if $dev; then
  [[ -n "$(value BASE_DOMAIN)" ]] || set_value BASE_DOMAIN localhost
  [[ -n "$(value ACME_EMAIL)" ]] || set_value ACME_EMAIL admin@example.com
  set_value COMPOSE_FILE docker-compose.yml:docker-compose.dev.yml
  has DEV_ADMIN_EMAIL || set_value DEV_ADMIN_EMAIL admin@example.com
  has DEV_ADMIN_PASSWORD || set_value DEV_ADMIN_PASSWORD ""
  # Filled in by scripts/init-dev.sh, used by the awscli service.
  has S3_ACCESS_KEY_ID || set_value S3_ACCESS_KEY_ID ""
  has S3_SECRET_ACCESS_KEY || set_value S3_SECRET_ACCESS_KEY ""
  secrets+=(DEV_ADMIN_PASSWORD)
fi

for key in "${secrets[@]}"; do
  if [[ -z "$(value "$key")" ]]; then
    set_value "$key" "$(openssl rand -hex 32)"
    echo "secret generated: $key"
  fi
done

if [[ -z "$(value BASE_DOMAIN)" || -z "$(value ACME_EMAIL)" ]]; then
  echo
  echo "Set BASE_DOMAIN and ACME_EMAIL in .env before running docker compose."
  echo "For local development, run: $0 --dev"
fi
