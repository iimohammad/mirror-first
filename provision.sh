#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# همه‌ی ریپازیتوری‌های proxy را از طریق REST API روی Nexus می‌سازد.
# اجرای دوباره‌اش بی‌خطر است (idempotent) — ریپوهای موجود را رد می‌کند.
#
#   ./provision.sh
#
# نیازمند: curl, jq (اختیاری)
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"
[[ -f .env ]] && set -a && . ./.env && set +a

NEXUS_URL="${NEXUS_URL:-http://127.0.0.1:8081}"
NEXUS_USER="${NEXUS_USER:-admin}"
NEXUS_PASS="${NEXUS_PASS:-}"

if [[ -z "$NEXUS_PASS" ]]; then
  echo "رمز اولیه‌ی admin را بده. اگر بار اول است:"
  echo "  docker compose exec nexus cat /nexus-data/admin.password"
  read -rsp "NEXUS_PASS: " NEXUS_PASS; echo
fi

API="$NEXUS_URL/service/rest/v1"
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT

req() { # method path [body]
  curl -sS -o "$TMP" -w '%{http_code}' -u "$NEXUS_USER:$NEXUS_PASS" \
       -X "$1" "$API$2" -H 'Content-Type: application/json' \
       ${3:+-d "$3"}
}

mkrepo() { # label path body
  local label="$1" path="$2" body="$3" code
  code=$(req POST "/repositories/$path" "$body")
  case "$code" in
    201) printf '  ✔ %s\n' "$label" ;;
    400) if grep -qi 'already\|in use\|exist' "$TMP"; then
           printf '  • %s (از قبل هست)\n' "$label"
         else
           printf '  ✘ %s → %s\n%s\n' "$label" "$code" "$(cat "$TMP")"
         fi ;;
    *)   printf '  ✘ %s → %s\n%s\n' "$label" "$code" "$(cat "$TMP")" ;;
  esac
}

STORAGE='"storage":{"blobStoreName":"default","strictContentTypeValidation":true}'
NEGCACHE='"negativeCache":{"enabled":true,"timeToLive":1440}'
CLEANUP='"cleanup":{"policyNames":[]}'

# احراز هویت داکرهاب برای بالا بردن سقف pull (اختیاری)
if [[ -n "${DOCKERHUB_USERNAME:-}" && -n "${DOCKERHUB_TOKEN:-}" ]]; then
  HUB_HTTP="\"httpClient\":{\"blocked\":false,\"autoBlock\":true,\"authentication\":{\"type\":\"username\",\"username\":\"$DOCKERHUB_USERNAME\",\"password\":\"$DOCKERHUB_TOKEN\"}}"
else
  HUB_HTTP='"httpClient":{"blocked":false,"autoBlock":true}'
fi
HTTP='"httpClient":{"blocked":false,"autoBlock":true}'

proxy_body() { # remoteUrl contentMaxAge metadataMaxAge httpClientJson
  printf '"online":true,%s,%s,"proxy":{"remoteUrl":"%s","contentMaxAge":%s,"metadataMaxAge":%s},%s,%s' \
         "$STORAGE" "$CLEANUP" "$1" "$2" "$3" "$NEGCACHE" "$4"
}

echo "→ فعال‌سازی دسترسی ناشناس و رئالم توکن داکر"
req PUT "/security/anonymous" \
    '{"enabled":true,"userId":"anonymous","realmName":"NexusAuthorizingRealm"}' >/dev/null
req PUT "/security/realms/active" \
    '["NexusAuthenticatingRealm","NexusAuthorizingRealm","DockerToken"]' >/dev/null

# ---------------------------------------------------------------------------
echo "→ رجیستری‌های داکر"
# ایندکس HUB فقط برای خود داکرهاب؛ بقیه REGISTRY
mkrepo "docker-hub"  "docker/proxy" "{\"name\":\"docker-hub\",$(proxy_body 'https://registry-1.docker.io' 1440 1440 "$HUB_HTTP"),\"docker\":{\"v1Enabled\":false,\"forceBasicAuth\":false},\"dockerProxy\":{\"indexType\":\"HUB\",\"cacheForeignLayers\":false,\"foreignLayerUrlWhitelist\":[]}}"

for spec in \
  "docker-ghcr|https://ghcr.io" \
  "docker-quay|https://quay.io" \
  "docker-k8s|https://registry.k8s.io" \
  "docker-gcr|https://gcr.io" \
  "docker-mcr|https://mcr.microsoft.com"
do
  name="${spec%%|*}"; url="${spec##*|}"
  mkrepo "$name" "docker/proxy" "{\"name\":\"$name\",$(proxy_body "$url" 1440 1440 "$HTTP"),\"docker\":{\"v1Enabled\":false,\"forceBasicAuth\":false},\"dockerProxy\":{\"indexType\":\"REGISTRY\",\"cacheForeignLayers\":false,\"foreignLayerUrlWhitelist\":[]}}"
done

# گروه: یک نقطه‌ی ورود واحد روی پورت ۵۰۰۰ که nginx به آن وصل است
mkrepo "docker-group (port 5000)" "docker/group" \
  "{\"name\":\"docker-group\",\"online\":true,$STORAGE,\"group\":{\"memberNames\":[\"docker-hub\",\"docker-ghcr\",\"docker-quay\",\"docker-k8s\",\"docker-gcr\",\"docker-mcr\"]},\"docker\":{\"v1Enabled\":false,\"forceBasicAuth\":false,\"httpPort\":5000}}"

# ---------------------------------------------------------------------------
echo "→ مخازن APT"
# ریپوی نوع apt برای هر suite جداست (محدودیت خود Nexus)
for spec in \
  "apt-ubuntu-noble|http://archive.ubuntu.com/ubuntu/|noble" \
  "apt-ubuntu-jammy|http://archive.ubuntu.com/ubuntu/|jammy" \
  "apt-debian-bookworm|http://deb.debian.org/debian/|bookworm"
do
  IFS='|' read -r name url dist <<<"$spec"
  mkrepo "$name" "apt/proxy" \
    "{\"name\":\"$name\",$(proxy_body "$url" 1440 60 "$HTTP"),\"apt\":{\"distribution\":\"$dist\",\"flat\":false}}"
done

# ---------------------------------------------------------------------------
echo "→ مخازن raw (suite-agnostic؛ برای ریپوهای HTTPS شخص ثالث و فایل‌ها)"
for spec in \
  "raw-docker|https://download.docker.com/" \
  "raw-nodesource|https://deb.nodesource.com/" \
  "raw-pgdg|https://apt.postgresql.org/" \
  "raw-ubuntu|http://archive.ubuntu.com/ubuntu/" \
  "raw-github|https://github.com/" \
  "raw-ghusercontent|https://raw.githubusercontent.com/"
do
  name="${spec%%|*}"; url="${spec#*|}"
  mkrepo "$name" "raw/proxy" \
    "{\"name\":\"$name\",$(proxy_body "$url" 1440 60 "$HTTP"),\"raw\":{\"contentDisposition\":\"ATTACHMENT\"}}"
done

# ---------------------------------------------------------------------------
echo "→ pypi / npm / go"
mkrepo "pypi-proxy" "pypi/proxy" \
  "{\"name\":\"pypi-proxy\",$(proxy_body 'https://pypi.org/' 1440 60 "$HTTP")}"
mkrepo "npm-proxy"  "npm/proxy"  \
  "{\"name\":\"npm-proxy\",$(proxy_body 'https://registry.npmjs.org' 1440 60 "$HTTP"),\"npm\":{\"removeQuarantined\":false}}"
mkrepo "go-proxy"   "go/proxy"   \
  "{\"name\":\"go-proxy\",$(proxy_body 'https://proxy.golang.org/' 1440 60 "$HTTP")}"

echo
echo "تمام شد. حالا در پنل این دو مورد را ست کن:"
echo "  • Administration → System → Capabilities → Base URL = https://${MIRROR_DOMAIN:-<domain>}/"
echo "  • Administration → Repository → Cleanup Policies (تا دیسک پر نشود)"
