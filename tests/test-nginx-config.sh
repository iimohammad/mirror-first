#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# کانفیگ nginx را با خود nginx تست می‌کند، نه با چشم.
#
#   bash tests/test-nginx-config.sh
#
# دو چیز را می‌سنجد:
#
#   ۱. هر دو مجموعه تمپلیت (میرور و پروکسی SNI) با envsubst رندر می‌شوند و
#      `nginx -t` قبولشان می‌کند. این کلاسِ خطایی را می‌گیرد که قبلاً این
#      مخزن را زمین زده: تمپلیتِ جاافتاده، متغیری که در compose تعریف نشده
#      و لفظی در فایل می‌ماند، یا دایرکتیوی که متغیر قبول نمی‌کند.
#
#   ۲. رفتار allowlist را با درخواست واقعی از دو کلاینت با IP ثابت — یکی
#      داخل allowlist و یکی بیرون — روی هر دو حالت MIRROR_PANEL_OPEN.
#      خواندن geo از روی کانفیگ جواب نمی‌دهد؛ باید دید nginx چه می‌کند.
#
# به داکر نیاز دارد. چیزی روی هاست نصب نمی‌شود و پورتی publish نمی‌شود.
# ---------------------------------------------------------------------------
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
NET="mirrorcfgtest-$$"
DOMAIN="test.local"
ALLOWED="10.77.0.50"
DENIED="10.77.0.60"
NGINX_IMAGE="nginx:1.27-alpine"
CURL_IMAGE="curlimages/curl:latest"

PASS=0
FAIL=0

cleanup() {
  docker rm -f cfgt-nginx cfgt-sni cfgt-nexus cfgt-panel >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

ok()   { printf '  PASS  %s\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  FAIL  %s\n' "$1"; FAIL=$((FAIL + 1)); }

command -v docker >/dev/null 2>&1 || { echo "docker is required."; exit 2; }
docker info >/dev/null 2>&1 || { echo "The docker daemon is not reachable."; exit 2; }

# --- fixtures --------------------------------------------------------------

mkdir -p "$WORK/le/live/$DOMAIN" "$WORK/www"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -keyout "$WORK/le/live/$DOMAIN/privkey.pem" \
  -out    "$WORK/le/live/$DOMAIN/fullchain.pem" \
  -subj "/CN=$DOMAIN" >/dev/null 2>&1 || { echo "openssl failed"; exit 2; }

# عمداً 172.16/12 پیش‌فرض acl.conf را ندارد، وگرنه هر کانتینری مجاز می‌شد
# و مسیر deny اصلاً تست نمی‌شد.
cat > "$WORK/acl.conf" <<EOF
geo \$mirror_denied {
    default        1;
    ${ALLOWED}/32  0;
}
EOF

cat > "$WORK/sni-allow.conf" <<EOF
allow ${ALLOWED};
deny all;
EOF

stub() {  # stub <name> <port>
  cat > "$WORK/$1.conf" <<EOF
server {
    listen $2;
    location / { add_header Content-Type text/plain; return 200 "UPSTREAM=$1 uri=\$uri\n"; }
}
EOF
  docker run -d --name "cfgt-$1" --network "$NET" --network-alias "$1" \
    -v "$WORK/$1.conf:/etc/nginx/conf.d/default.conf:ro" \
    "$NGINX_IMAGE" >/dev/null
}

docker network create --subnet 10.77.0.0/16 "$NET" >/dev/null || exit 2
stub nexus 8081
stub panel 3000

# --- ۱) تمپلیت‌های میرور ---------------------------------------------------

start_mirror() {  # start_mirror <panel-open>
  docker rm -f cfgt-nginx >/dev/null 2>&1
  docker run -d --name cfgt-nginx --network "$NET" --network-alias "$DOMAIN" \
    -v "$REPO/nginx/templates:/etc/nginx/templates:ro" \
    -v "$WORK/acl.conf:/etc/nginx/conf.d/00-acl.conf:ro" \
    -v "$WORK/le:/etc/letsencrypt:ro" \
    -v "$WORK/www:/var/www/certbot" \
    --mount type=tmpfs,dst=/var/cache/mirror \
    -e MIRROR_DOMAIN="$DOMAIN" \
    -e NGINX_ENVSUBST_FILTER=MIRROR_ \
    -e MIRROR_CACHE_MAX_SIZE=1g \
    -e MIRROR_CACHE_INACTIVE=1d \
    -e MIRROR_CACHE_KEYS_ZONE=8m \
    -e MIRROR_IMMUTABLE_TTL=365d \
    -e MIRROR_NEGATIVE_TTL=1m \
    -e MIRROR_DOCKER_TAG_TTL=1m \
    -e MIRROR_DOCKER_PING_TTL=5m \
    -e MIRROR_RATE_LIMIT=100r/s \
    -e MIRROR_RATE_BURST=500 \
    -e MIRROR_CONN_LIMIT=200 \
    -e MIRROR_PANEL_OPEN="$1" \
    -e MIRROR_PANEL_LOGIN_RATE=20r/m \
    -e MIRROR_PANEL_LOGIN_BURST=10 \
    -e MIRROR_LISTEN_EXTRA= \
    -e MIRROR_REALIP= \
    "$NGINX_IMAGE" >/dev/null

  for _ in $(seq 1 30); do
    docker exec cfgt-nginx nginx -t >/dev/null 2>&1 && return 0
    docker ps --filter name=cfgt-nginx --filter status=running -q | grep -q . || break
  done
  echo "--- nginx logs (MIRROR_PANEL_OPEN=$1) ---" >&2
  docker logs cfgt-nginx 2>&1 | tail -20 >&2
  return 1
}

req() {  # req <src-ip> <path>  -> "<code> <redirect-url>"
  docker run --rm --network "$NET" --ip "$1" "$CURL_IMAGE" \
    -sS -k -o /dev/null -w '%{http_code} %{redirect_url}\n' \
    --connect-timeout 10 "https://$DOMAIN$2" 2>&1 | tail -1
}

check() {  # check <label> <src-ip> <path> <want-code> [want-redirect-suffix]
  local got code redir
  got="$(req "$2" "$3")"
  code="${got%% *}"
  redir="${got#* }"
  if [[ "$code" == "$4" ]] && { [[ -z "${5:-}" ]] || [[ "$redir" == *"$5" ]]; }; then
    ok "$1 ($got)"
  else
    bad "$1 — got '$got', wanted '$4 ${5:-}'"
  fi
}

echo "== تمپلیت‌های میرور، MIRROR_PANEL_OPEN=1 =="
if start_mirror 1; then
  ok "nginx -t قبول کرد"
  check "کلاینت ممنوع: / به پنل ریدایرکت می‌شود"  "$DENIED"  "/"                302 "/panel"
  check "کلاینت ممنوع: /?x=1 هم همین‌طور"          "$DENIED"  "/?x=1"            302 "/panel"
  check "کلاینت ممنوع: /panel باز است"             "$DENIED"  "/panel"           200
  check "کلاینت ممنوع: /panel/login باز است"       "$DENIED"  "/panel/login"     200
  check "کلاینت ممنوع: /repository/foo بسته"       "$DENIED"  "/repository/foo"  403
  check "کلاینت ممنوع: /service/rest بسته"         "$DENIED"  "/service/rest/v1" 403
  check "کلاینت ممنوع: /favicon.ico بسته"          "$DENIED"  "/favicon.ico"     403
  check "کلاینت مجاز: / همان UI نکسس"              "$ALLOWED" "/"                200
  check "کلاینت مجاز: /repository/foo باز"         "$ALLOWED" "/repository/foo"  200
  check "کلاینت مجاز: /panel باز"                  "$ALLOWED" "/panel"           200
else
  bad "nginx با MIRROR_PANEL_OPEN=1 بالا نیامد"
fi

echo
echo "== تمپلیت‌های میرور، MIRROR_PANEL_OPEN=0 =="
if start_mirror 0; then
  ok "nginx -t قبول کرد"
  check "کلاینت ممنوع: / بسته (ریدایرکت به ۴۰۳ بی‌فایده است)" "$DENIED"  "/"       403
  check "کلاینت ممنوع: /panel هم بسته"                        "$DENIED"  "/panel"  403
  check "کلاینت مجاز: / همان UI نکسس"                         "$ALLOWED" "/"       200
  check "کلاینت مجاز: /panel باز"                             "$ALLOWED" "/panel"  200
else
  bad "nginx با MIRROR_PANEL_OPEN=0 بالا نیامد"
fi

# --- ۲) تمپلیت پروکسی SNI --------------------------------------------------
#
# فقط رندر و صحت کانفیگ. رد کردن واقعی ترافیک به یک مقصد اینترنتی نیاز
# دارد و در CI قابل اتکا نیست.

echo
echo "== تمپلیت پروکسی SNI =="
docker rm -f cfgt-sni >/dev/null 2>&1
docker run -d --name cfgt-sni --network "$NET" \
  -v "$REPO/nginx/sni-templates:/etc/nginx/templates:ro" \
  -v "$WORK/sni-allow.conf:/etc/nginx/sni-allow.conf:ro" \
  -e MIRROR_DOMAIN="$DOMAIN" \
  -e NGINX_ENVSUBST_FILTER=MIRROR_ \
  -e NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx \
  "$NGINX_IMAGE" >/dev/null

sni_ready=1
for _ in $(seq 1 30); do
  docker exec cfgt-sni nginx -t >/dev/null 2>&1 && { sni_ready=0; break; }
  docker ps --filter name=cfgt-sni --filter status=running -q | grep -q . || break
done

if ((sni_ready == 0)); then
  ok "nginx -t قبول کرد"

  rendered="$(docker exec cfgt-sni cat /etc/nginx/nginx.conf 2>/dev/null)"

  # ⚠️ حیاتی: بدون این خط، SNI برابر دامنه‌ی میرور از DNS عمومی به IP همین
  # سرور می‌رسد و پروکسی به خودش وصل می‌شود — یک درخواست کل
  # worker_connections را می‌خورد و پروکسی برای همه می‌خوابد.
  if grep -q "^\s*${DOMAIN}\s\+nginx:443;" <<<"$rendered"; then
    ok "دامنه‌ی میرور به کانتینر nginx مسیر داده شده (گارد حلقه‌ی خودی)"
  else
    bad "دامنه‌ی میرور در map نیست — پروکسی به خودش وصل می‌شود"
  fi

  if grep -q 'docker\.'"$DOMAIN"'\s\+nginx:443;' <<<"$rendered"; then
    ok "زیردامنه‌ی docker هم مسیر داده شده"
  else
    bad "docker.$DOMAIN در map نیست"
  fi

  # هیچ ${...} رندرنشده‌ای نباید مانده باشد.
  if grep -q '\${' <<<"$rendered"; then
    bad "متغیر رندرنشده در nginx.conf: $(grep -o '\${[A-Za-z_]*}' <<<"$rendered" | sort -u | tr '\n' ' ')"
  else
    ok "همه‌ی متغیرها رندر شدند"
  fi

  # server B باید هدر PROXY را باز کند، وگرنه $remote_addr می‌شود 127.0.0.1
  # و allowlist عملاً همه را مجاز می‌کند.
  if grep -q 'listen 127.0.0.1:8444 proxy_protocol;' <<<"$rendered" \
     && grep -q 'set_real_ip_from 127.0.0.1;' <<<"$rendered"; then
    ok "زنجیره‌ی PROXY protocol سالم است (IP واقعی به allowlist می‌رسد)"
  else
    bad "server B هدر PROXY را باز نمی‌کند — allowlist بی‌اثر می‌شود"
  fi

  if grep -q 'include /etc/nginx/sni-allow.conf;' <<<"$rendered"; then
    ok "allowlist در passthrough include شده"
  else
    bad "sni-allow.conf include نشده — پروکسی باز است"
  fi
else
  bad "sniproxy بالا نیامد"
  docker logs cfgt-sni 2>&1 | tail -20 >&2
fi

echo
echo "=============================================="
echo "RESULT: $PASS passed, $FAIL failed"
echo "=============================================="
[[ "$FAIL" -eq 0 ]]
