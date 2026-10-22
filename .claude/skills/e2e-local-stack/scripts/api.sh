#!/usr/bin/env bash
# Call the control-plane API on the local dev stack as the dev admin, through Caddy.
# Logs in only when the cached token is missing or expired; never prints credentials.
#
#   api.sh GET /buckets
#   api.sh POST /buckets '{"name":"e2e-demo"}'
#   api.sh PUT '/buckets/<id>/objects?key=a.txt' @path/to/file    # raw body upload
#   api.sh DELETE /buckets/<id>
#
# Prints the response body (pretty JSON when it is JSON) on stdout and "HTTP <code>" on
# stderr. Exits 0 for 2xx, 1 otherwise. Quote paths that contain '?' (zsh globbing).
set -euo pipefail
# shellcheck source=SCRIPTDIR/lib.sh
. "$(dirname "$0")/lib.sh"

[[ $# -ge 2 ]] || { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
method=$1 path=$2 data=${3-}

ensure_token

out="$(mktemp)"
trap 'rm -f "$out"' EXIT
args=(-o "$out" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $(cached_token)")
if [[ "$data" == @* ]]; then
  args+=(-H "Content-Type: application/octet-stream" --data-binary "$data")
elif [[ -n "$data" ]]; then
  args+=(-H "Content-Type: application/json" --data "$data")
fi
status="$(console_curl "${args[@]}" "https://$CONSOLE/api$path")"

jq . "$out" 2>/dev/null || cat "$out"
echo "HTTP $status" >&2
[[ "$status" == 2* ]]
