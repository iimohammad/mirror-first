#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ریپوهای hosted (پکیج‌های خودت) + group (یک URL برای hosted و proxy با هم)
# را می‌سازد، و یک کاربر deployer برای CI درست می‌کند.
#
#   ./provision-hosted.sh
#
# اجرای دوباره‌اش بی‌خطر است.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env ]] && set -a && . ./.env && set +a

NEXUS_URL="${NEXUS_URL:-http://127.0.0.1:8081}"
NEXUS_USER="${NEXUS_USER:-admin}"
NEXUS_PASS="${NEXUS_PASS:-}"
DEPLOYER_PASS="${DEPLOYER_PASS:-}"

[[ -n "$NEXUS_PASS" ]] || read -rsp "رمز admin: " NEXUS_PASS <&0 && echo
[[ -n "$DEPLOYER_PASS" ]] || DEPLOYER_PASS=$(openssl rand -base64 24)

API="$NEXUS_URL/service/rest/v1"
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT

req() {
  curl -sS -o "$TMP" -w '%{http_code}' -u "$NEXUS_USER:$NEXUS_PASS" \
       -X "$1" "$API$2" -H 'Content-Type: application/json' ${3:+-d "$3"}
}

post() { # label path body
  local code; code=$(req POST "$2" "$3")
  case "$code" in
    200|201|204) printf '  ✔ %s\n' "$1" ;;
    400) grep -qi 'already\|in use\|exist' "$TMP" \
           && printf '  • %s (از قبل هست)\n' "$1" \
           || printf '  ✘ %s → %s\n%s\n' "$1" "$code" "$(cat "$TMP")" ;;
    *)   printf '  ✘ %s → %s\n%s\n' "$1" "$code" "$(cat "$TMP")" ;;
  esac
}

put() { # label path body
  local code; code=$(req PUT "$2" "$3")
  case "$code" in
    200|204) printf '  ✔ %s\n' "$1" ;;
    *)       printf '  ✘ %s → %s\n%s\n' "$1" "$code" "$(cat "$TMP")" ;;
  esac
}

# writePolicy=ALLOW_ONCE یعنی نسخه‌ی منتشرشده قابل بازنویسی نیست (immutable).
# اگر می‌خواهی بتوانی overwrite کنی، ALLOW بگذار.
WRITE="${WRITE_POLICY:-ALLOW_ONCE}"
STORE="\"storage\":{\"blobStoreName\":\"default\",\"strictContentTypeValidation\":true,\"writePolicy\":\"$WRITE\"}"
GSTORE='"storage":{"blobStoreName":"default","strictContentTypeValidation":true}'
CLEAN='"cleanup":{"policyNames":[]}'
COMP='"component":{"proprietaryComponents":true}'

# ---------------------------------------------------------------------------
echo "→ ریپوهای hosted"
post "pypi-hosted"   "/repositories/pypi/hosted" \
  "{\"name\":\"pypi-hosted\",\"online\":true,$STORE,$CLEAN,$COMP}"
post "npm-hosted"    "/repositories/npm/hosted" \
  "{\"name\":\"npm-hosted\",\"online\":true,$STORE,$CLEAN,$COMP}"
post "raw-hosted"    "/repositories/raw/hosted" \
  "{\"name\":\"raw-hosted\",\"online\":true,$STORE,$CLEAN,\"raw\":{\"contentDisposition\":\"ATTACHMENT\"}}"
# داکر hosted کانکتور جدا لازم دارد چون push به ریپوی group کار نمی‌کند
post "docker-hosted (port 5001)" "/repositories/docker/hosted" \
  "{\"name\":\"docker-hosted\",\"online\":true,$STORE,$CLEAN,\"docker\":{\"v1Enabled\":false,\"forceBasicAuth\":true,\"httpPort\":5001}}"

# ---------------------------------------------------------------------------
echo "→ ریپوهای group (ترتیب مهم است: hosted اول، تا پکیج خودت بر proxy اولویت بگیرد)"
post "pypi-group" "/repositories/pypi/group" \
  "{\"name\":\"pypi-group\",\"online\":true,$GSTORE,\"group\":{\"memberNames\":[\"pypi-hosted\",\"pypi-proxy\"]}}"
post "npm-group"  "/repositories/npm/group" \
  "{\"name\":\"npm-group\",\"online\":true,$GSTORE,\"group\":{\"memberNames\":[\"npm-hosted\",\"npm-proxy\"]}}"

# docker-group موجود را آپدیت کن تا hosted هم داخلش باشد (برای pull)
put "docker-group + docker-hosted" "/repositories/docker/group/docker-group" \
  "{\"name\":\"docker-group\",\"online\":true,$GSTORE,\"group\":{\"memberNames\":[\"docker-hosted\",\"docker-hub\",\"docker-ghcr\",\"docker-quay\",\"docker-k8s\",\"docker-gcr\",\"docker-mcr\"]},\"docker\":{\"v1Enabled\":false,\"forceBasicAuth\":false,\"httpPort\":5000}}"

# ---------------------------------------------------------------------------
echo "→ کاربر deployer برای CI (به‌جای admin)"
for spec in "pypi|pypi-hosted" "npm|npm-hosted" "raw|raw-hosted" "docker|docker-hosted"; do
  fmt="${spec%%|*}"; repo="${spec##*|}"
  post "privilege $repo-deploy" "/security/privileges/repository-view" \
    "{\"name\":\"$repo-deploy\",\"description\":\"deploy to $repo\",\"actions\":[\"read\",\"browse\",\"add\",\"edit\"],\"format\":\"$fmt\",\"repository\":\"$repo\"}"
done

post "role deployer" "/security/roles" \
  '{"id":"deployer","name":"deployer","description":"push to hosted repos","privileges":["pypi-hosted-deploy","npm-hosted-deploy","raw-hosted-deploy","docker-hosted-deploy"],"roles":[]}'

post "user deployer" "/security/users" \
  "{\"userId\":\"deployer\",\"firstName\":\"Deploy\",\"lastName\":\"Bot\",\"emailAddress\":\"deploy@localhost\",\"password\":\"$DEPLOYER_PASS\",\"status\":\"active\",\"roles\":[\"deployer\"]}"

echo
echo "──────────────────────────────────────────────"
echo "کاربر: deployer"
echo "رمز:   $DEPLOYER_PASS"
echo "──────────────────────────────────────────────"
echo "این را جای امن ذخیره کن — دوباره نمایش داده نمی‌شود."
echo
echo "حالا کلاینت‌ها را از proxy به group منتقل کن:"
echo "  pip → /repository/pypi-group/simple   (به‌جای pypi-proxy)"
echo "  npm → /repository/npm-group/          (به‌جای npm-proxy)"
echo
echo "برای push داکر، بلاک nginx مربوط به push.${MIRROR_DOMAIN:-<domain>} را اضافه"
echo "و گواهی را با این ساب‌دامین دوباره صادر کن (nginx/templates/21-docker-push.conf.template)."
