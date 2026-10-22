#!/usr/bin/env bash
# End-to-end smoke test of the core flows against the running local dev stack, through the same
# front door a user hits (Caddy on 443): API auth, bucket, access key + permissions, S3 upload
# with that key, custom domain + <bucket>.web serving, object browser, and the refusals that
# protect data. Everything it creates is named e2e-<timestamp> and removed at the end.
#
# Usage (from anywhere inside the repo):
#   .claude/skills/e2e-local-stack/scripts/smoke.sh
#   KEEP=1 .../smoke.sh    # leave the created bucket/key/domain for manual inspection
#
# Refuses to run unless .env is a development .env (scripts/gen-env.sh --dev).
# Logs in exactly once: login is rate limited (5 attempts per IP, then 1 every 12 s).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

env_value() { sed -n "s/^$1=//p" .env | head -1; }

[[ -f .env ]] || { echo "No .env. Run: scripts/gen-env.sh --dev" >&2; exit 2; }
if [[ "$(env_value COMPOSE_FILE)" != *docker-compose.dev.yml* ]]; then
  echo "Refusing to run: .env is not a development .env (COMPOSE_FILE lacks docker-compose.dev.yml)." >&2
  exit 2
fi

BASE="$(env_value BASE_DOMAIN)"
CONSOLE="console.$BASE"
EMAIL="$(env_value DEV_ADMIN_EMAIL)"
PASSWORD="$(env_value DEV_ADMIN_PASSWORD)"
RUN="e2e-$(date +%s)"
BUCKET="$RUN"
DOMAIN="$RUN.$BASE"
WEB_HOST="$BUCKET.web.$BASE"

TMP="$(mktemp -d)"
OUT="$TMP/body"
JAR="$TMP/cookies"
TOKEN=""
STATUS=""
BUCKET_ID=""
KEY_ID=""
KEY_SECRET=""
DOMAIN_ID=""
passed=0

pass() { passed=$((passed + 1)); printf '  ok    %s\n' "$1"; }
fail() {
  printf '  FAIL  %s\n' "$1" >&2
  [[ -s "$OUT" ]] && { printf '        response: ' >&2; head -c 600 "$OUT" >&2; echo >&2; }
  exit 1
}
step() { printf '\n== %s\n' "$1"; }

# api METHOD PATH [JSON] → $STATUS, body in $OUT
api() {
  local args=(-sk --resolve "$CONSOLE:443:127.0.0.1" -o "$OUT" -w '%{http_code}' -X "$1"
    -b "$JAR" -c "$JAR")
  [[ -n "$TOKEN" ]] && args+=(-H "Authorization: Bearer $TOKEN")
  [[ -n "${3-}" ]] && args+=(-H "Content-Type: application/json" --data "$3")
  STATUS="$(curl "${args[@]}" "https://$CONSOLE/api$2")"
}
# check LABEL FAILURE COMMAND... → pass if COMMAND succeeds, otherwise fail and stop
check() {
  local label=$1 failure=$2
  shift 2
  if "$@"; then pass "$label"; else fail "$failure"; fi
}
expect() { check "$2 ($STATUS)" "$2: want HTTP $1, got $STATUS" [ "$STATUS" = "$1" ]; }
field() { jq -r "$1" "$OUT"; }

# GET a public URL through Caddy (local CA, hence -k)
fetch() { curl -sk --resolve "$1:443:127.0.0.1" "https://$1$2"; }

s3_with_key() {
  docker compose --progress quiet run --rm -T --quiet-pull \
    -e AWS_ACCESS_KEY_ID="$KEY_ID" -e AWS_SECRET_ACCESS_KEY="$KEY_SECRET" \
    awscli "$@"
}

cleanup() {
  local code=$?
  set +e # best effort: one failed delete must not skip the rest
  if [[ "${KEEP:-}" == 1 ]]; then
    echo
    echo "KEEP=1: left bucket $BUCKET (id $BUCKET_ID), key $KEY_ID, domain $DOMAIN (id $DOMAIN_ID)."
  elif [[ -n "$TOKEN" ]]; then
    echo
    echo "== cleanup"
    [[ -n "$DOMAIN_ID" ]] && api DELETE "/domains/$DOMAIN_ID" && echo "  domain $DOMAIN: $STATUS"
    if [[ -n "$BUCKET_ID" ]]; then
      api GET "/buckets/$BUCKET_ID/objects?prefix=" || true
      if [[ "$STATUS" == 200 ]]; then
        local k
        for k in $(jq -r '.data.objects[].key' "$OUT"); do
          api DELETE "/buckets/$BUCKET_ID/objects?key=$k" || true
        done
        for k in $(jq -r '.data.folders[]' "$OUT" 2>/dev/null); do
          api DELETE "/buckets/$BUCKET_ID/objects?prefix=$k" || true
        done
      fi
      api DELETE "/buckets/$BUCKET_ID" || true
      echo "  bucket $BUCKET: $STATUS"
    fi
    [[ -n "$KEY_ID" ]] && api DELETE "/keys/$KEY_ID" && echo "  key $KEY_ID: $STATUS"
    TOKEN="" api POST /auth/logout || true
  fi
  rm -rf "$TMP"
  if [[ $code -eq 0 ]]; then
    echo
    echo "PASS: $passed checks"
  else
    echo
    echo "FAILED after $passed passing checks (run id $RUN)" >&2
  fi
}
trap cleanup EXIT

step "stack"
for svc in garage control caddy; do
  state="$(docker compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null | awk -v s="$svc" '$1==s {print $2}')"
  check "$svc healthy" "$svc is '${state:-not running}' (docker compose up -d --build)" [ "$state" = healthy ]
done

step "auth"
api GET /buckets
expect 401 "API without a token is refused"
api POST /auth/login "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')"
expect 200 "login as $EMAIL"
TOKEN="$(field .data.access_token)"
[[ -n "$TOKEN" && "$TOKEN" != null ]] || fail "login returned no access_token"
api GET /me
expect 200 "GET /me"

step "bucket"
api POST /buckets "{\"name\":\"BAD name\"}"
expect 400 "invalid bucket name rejected"
check "error is attached to field 'name'" "no field error for 'name'" [ "$(field '.error.errors.name[0]')" != null ]
api POST /buckets "{\"name\":\"$BUCKET\"}"
expect 201 "create bucket $BUCKET"
BUCKET_ID="$(field .data.id)"
api POST /buckets "{\"name\":\"$BUCKET\"}"
expect 409 "duplicate bucket name rejected"

step "access key"
api POST /keys "{\"name\":\"$RUN\"}"
expect 201 "create key $RUN"
KEY_ID="$(field .data.id)"
KEY_SECRET="$(field .data.secretAccessKey)"
check "secret returned once on create" "no secret on create" [ "${KEY_SECRET:-null}" != null ]
api GET "/keys/$KEY_ID"
expect 200 "GET key"
check "secret not returned by GET" "GET /keys/{id} leaks the secret" [ -z "$(field '.data.secretAccessKey // empty')" ]
# Must fail with AccessDenied specifically: any other error (docker, network) proves nothing.
denied="$(s3_with_key s3 ls "s3://$BUCKET/" 2>&1 || true)"
check "new key has no access before permissions are set" \
  "want AccessDenied for a key without permissions, got: ${denied:-success}" grep -q AccessDenied <<<"$denied"
api PUT "/keys/$KEY_ID/buckets/$BUCKET_ID" '{"read":true,"write":true,"owner":false}'
expect 200 "grant read+write on $BUCKET"

step "S3 API with the new key"
s3_with_key s3 cp --only-show-errors --recursive /sample "s3://$BUCKET/" ||
  fail "upload of sample/ through the S3 API failed"
pass "uploaded sample/ with aws s3 cp"
listing="$(s3_with_key s3 ls "s3://$BUCKET/")"
check "aws s3 ls shows hello.txt" "hello.txt missing from aws s3 ls" grep -q hello.txt <<<"$listing"

step "custom domain"
api POST /domains "{\"domain\":\"$DOMAIN\",\"bucket\":\"$BUCKET\"}"
expect 201 "register $DOMAIN"
DOMAIN_ID="$(field .data.id)"
check "status active (DNS_VERIFY=off in dev)" "status is $(field .data.status), want active" [ "$(field .data.status)" = active ]
api POST /domains "{\"domain\":\"console.$BASE\",\"bucket\":\"$BUCKET\"}"
expect 400 "reserved system domain rejected"
want="$(cat sample/hello.txt)"
check "https://$DOMAIN/hello.txt serves the file" "https://$DOMAIN/hello.txt did not return sample/hello.txt" \
  [ "$(fetch "$DOMAIN" /hello.txt)" = "$want" ]
check "https://$WEB_HOST/hello.txt serves the file" "https://$WEB_HOST/hello.txt did not return sample/hello.txt" \
  [ "$(fetch "$WEB_HOST" /hello.txt)" = "$want" ]
fetch "$DOMAIN" / >"$TMP/index.html"
check "https://$DOMAIN/ serves index.html" "index.html not served at /" grep -qi "<html" "$TMP/index.html"

step "object browser API"
printf 'smoke %s\n' "$RUN" >"$TMP/note.txt"
STATUS="$(curl -sk --resolve "$CONSOLE:443:127.0.0.1" -o "$OUT" -w '%{http_code}' -X PUT \
  -H "Authorization: Bearer $TOKEN" --data-binary @"$TMP/note.txt" \
  "https://$CONSOLE/api/buckets/$BUCKET_ID/objects?key=e2e/note.txt")"
expect 201 "upload e2e/note.txt through the API"
api GET "/buckets/$BUCKET_ID/objects?prefix="
expect 200 "list root"
check "folder e2e/ listed" "folder e2e/ missing" grep -q '"e2e/"' "$OUT"
api POST "/buckets/$BUCKET_ID/objects/download-link" '{"key":"e2e/note.txt"}'
expect 200 "create download link"
link="$(field .data.url)"
check "download link returns the file without a session" "download link content mismatch" \
  [ "$(curl -sk --resolve "$CONSOLE:443:127.0.0.1" "https://$CONSOLE$link")" = "$(cat "$TMP/note.txt")" ]
check "tampered download link refused" "tampered download link accepted" \
  [ "$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$CONSOLE:443:127.0.0.1" "https://$CONSOLE${link}x")" != 200 ]
api DELETE "/buckets/$BUCKET_ID/objects?prefix=e2e/"
expect 200 "delete folder e2e/"

step "refusals that protect data"
api DELETE "/buckets/$BUCKET_ID"
expect 409 "bucket with a custom domain cannot be deleted"
api DELETE "/domains/$DOMAIN_ID"
expect 200 "delete domain"
DOMAIN_ID=""
api DELETE "/buckets/$BUCKET_ID"
expect 409 "non-empty bucket cannot be deleted"
