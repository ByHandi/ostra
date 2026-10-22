# shellcheck shell=bash
# Shared helpers for smoke.sh and api.sh. Sourced, not executed.
#
# Credentials are read from .env inside these scripts and never printed. The access token is
# cached in the repo's git dir (never committed, mode 600) and reused while it is valid (15
# minutes), because login is rate limited per IP (5 attempts, then 1 every 12 s) — and that
# limit is shared with the user's own browser.

cd "$(git rev-parse --show-toplevel)" || exit 2

env_value() { sed -n "s/^$1=//p" .env | head -1; }

[[ -f .env ]] || { echo "No .env. Run: scripts/gen-env.sh --dev" >&2; exit 2; }
if [[ "$(env_value COMPOSE_FILE)" != *docker-compose.dev.yml* ]]; then
  echo "Refusing to run: .env is not a development .env (COMPOSE_FILE lacks docker-compose.dev.yml)." >&2
  exit 2
fi

BASE="$(env_value BASE_DOMAIN)"
CONSOLE="console.$BASE"
TOKEN_CACHE="$(git rev-parse --absolute-git-dir)/ostra-e2e-token"

# console_curl ARGS... — curl against the console through Caddy, without relying on DNS.
console_curl() { curl -sk --resolve "$CONSOLE:443:127.0.0.1" "$@"; }

# login — POST /api/auth/login with the dev admin from .env; caches and prints nothing.
# Returns the HTTP status in $LOGIN_STATUS.
login() {
  local body
  body="$(jq -nc --arg e "$(env_value DEV_ADMIN_EMAIL)" --arg p "$(env_value DEV_ADMIN_PASSWORD)" \
    '{email:$e,password:$p}')"
  local out
  out="$(mktemp)"
  LOGIN_STATUS="$(console_curl -o "$out" -w '%{http_code}' -H "Content-Type: application/json" \
    --data "$body" "https://$CONSOLE/api/auth/login")"
  if [[ "$LOGIN_STATUS" == 200 ]]; then
    (umask 077 && jq -r .data.access_token "$out" >"$TOKEN_CACHE")
  fi
  rm -f "$out"
}

# token_valid — the cached token exists and the API accepts it.
token_valid() {
  [[ -s "$TOKEN_CACHE" ]] || return 1
  [[ "$(console_curl -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $(cat "$TOKEN_CACHE")" "https://$CONSOLE/api/me")" == 200 ]]
}

# ensure_token — reuse the cached token, log in only when it is missing or expired.
ensure_token() {
  token_valid && return 0
  login
  [[ "$LOGIN_STATUS" == 200 ]] || { echo "login failed: HTTP $LOGIN_STATUS" >&2; return 1; }
}

cached_token() { cat "$TOKEN_CACHE"; }
