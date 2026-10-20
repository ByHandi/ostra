#!/usr/bin/env bash
# Membuat .env dari .env.example, menambahkan key baru dari .env.example ke .env yang sudah ada,
# mengisi secret yang masih kosong, dan membuang key yang sudah tidak dipakai.
# Nilai yang sudah ada tidak diubah.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo ".env dibuat."
fi

while IFS= read -r line; do
  [[ "$line" =~ ^([A-Z0-9_]+)= ]] || continue
  key="${BASH_REMATCH[1]}"
  if ! grep -q "^$key=" .env; then
    echo "$line" >> .env
    echo "ditambahkan: $key"
  fi
done < .env.example

# Key lama yang sudah diganti.
for key in CONTROL_API_TOKEN; do
  if grep -q "^$key=" .env; then
    sed -i.bak "/^$key=/d" .env && rm -f .env.bak
    echo "dihapus (tidak dipakai lagi): $key"
  fi
done

for key in GARAGE_RPC_SECRET GARAGE_ADMIN_TOKEN GARAGE_METRICS_TOKEN CONTROL_JWT_SECRET DEV_ADMIN_PASSWORD; do
  if grep -q "^$key=$" .env; then
    sed -i.bak "s|^$key=$|$key=$(openssl rand -hex 32)|" .env && rm -f .env.bak
    echo "secret dibuat: $key"
  fi
done
