#!/usr/bin/env bash
# Membuat atau melengkapi .env:
#   scripts/gen-env.sh         production: isi secret, lalu kamu isi BASE_DOMAIN dan ACME_EMAIL
#   scripts/gen-env.sh --dev   development lokal: semua terisi, docker-compose.dev.yml ikut dipakai
#
# Aman dijalankan ulang: nilai yang sudah ada tidak diubah, key baru ditambahkan,
# key yang sudah tidak dipakai dibuang.
set -euo pipefail
cd "$(dirname "$0")/.."

dev=false
case "${1:-}" in
  --dev) dev=true ;;
  "") ;;
  *) echo "pemakaian: $0 [--dev]" >&2; exit 2 ;;
esac

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo ".env dibuat."
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

# Key wajib dari .env.example yang belum ada.
while IFS= read -r line; do
  [[ "$line" =~ ^([A-Z0-9_]+)= ]] || continue
  key="${BASH_REMATCH[1]}"
  if ! has "$key"; then
    echo "$line" >> .env
    echo "ditambahkan: $key"
  fi
done < .env.example

# Key lama yang sudah diganti (domain sekarang diturunkan dari BASE_DOMAIN, mode dev dari
# docker-compose.dev.yml).
for key in CONTROL_API_TOKEN CADDYFILE S3_DOMAIN CONSOLE_DOMAIN WEB_ROOT_DOMAIN DNS_VERIFY COOKIE_SECURE; do
  if has "$key"; then
    sed -i.bak "/^$key=/d" .env && rm -f .env.bak
    echo "dihapus (tidak dipakai lagi): $key"
  fi
done

secrets=(GARAGE_RPC_SECRET GARAGE_ADMIN_TOKEN GARAGE_METRICS_TOKEN CONTROL_JWT_SECRET)

if $dev; then
  [[ -n "$(value BASE_DOMAIN)" ]] || set_value BASE_DOMAIN localhost
  [[ -n "$(value ACME_EMAIL)" ]] || set_value ACME_EMAIL admin@example.com
  set_value COMPOSE_FILE docker-compose.yml:docker-compose.dev.yml
  has DEV_ADMIN_EMAIL || set_value DEV_ADMIN_EMAIL admin@example.com
  has DEV_ADMIN_PASSWORD || set_value DEV_ADMIN_PASSWORD ""
  # Diisi scripts/init-dev.sh, dipakai service awscli.
  has S3_ACCESS_KEY_ID || set_value S3_ACCESS_KEY_ID ""
  has S3_SECRET_ACCESS_KEY || set_value S3_SECRET_ACCESS_KEY ""
  secrets+=(DEV_ADMIN_PASSWORD)
fi

for key in "${secrets[@]}"; do
  if [[ -z "$(value "$key")" ]]; then
    set_value "$key" "$(openssl rand -hex 32)"
    echo "secret dibuat: $key"
  fi
done

if [[ -z "$(value BASE_DOMAIN)" || -z "$(value ACME_EMAIL)" ]]; then
  echo
  echo "Isi BASE_DOMAIN dan ACME_EMAIL di .env sebelum menjalankan docker compose."
  echo "Untuk development lokal, jalankan: $0 --dev"
fi
