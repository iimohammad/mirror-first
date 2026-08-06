#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# وضعیت پروکسی SNI — روی سرور میرور اجرا کن:
#
#   ./sni-status.sh
#
# معادلِ داکری proxy-server/status.sh در مخزن sni-https-proxy است. آنجا
# پروکسی مستقیم روی هاست با systemd نصب می‌شد و status.sh سراغ
# `systemctl status nginx` و /etc/nginx/stream-conf.d می‌رفت. اینجا پروکسی
# یک سرویس compose است، پس همان سؤال‌ها را از کانتینر می‌پرسیم.
#
# فقط می‌خواند؛ چیزی را عوض نمی‌کند.
# ---------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")" || exit 1

SERVICE=sniproxy

h() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

dc() { docker compose "$@"; }

# ---------------------------------------------------------------------------
h "پروفایل"

if [[ -f .env ]] && grep -Eq '^[[:space:]]*COMPOSE_PROFILES=.*\bsni\b' .env; then
  echo "COMPOSE_PROFILES در .env شامل sni است."
else
  echo "⚠️  sni در COMPOSE_PROFILES نیست — سرویس اصلاً بالا نمی‌آید."
  echo "    در .env این سه خط با هم لازم‌اند:"
  echo "      COMPOSE_PROFILES=sni"
  echo "      MIRROR_SNI=1"
  echo "      MIRROR_HTTPS_BIND=127.0.0.1:8443"
fi

for var in MIRROR_SNI MIRROR_HTTPS_BIND; do
  if [[ -f .env ]] && grep -Eq "^[[:space:]]*${var}=" .env; then
    printf '%s = %s\n' "$var" "$(grep -E "^[[:space:]]*${var}=" .env | tail -1 | cut -d= -f2-)"
  else
    echo "⚠️  $var در .env تنظیم نشده."
  fi
done

# ---------------------------------------------------------------------------
h "سرویس"

if ! dc ps --services 2>/dev/null | grep -qx "$SERVICE"; then
  echo "سرویس $SERVICE در این compose فعال نیست (پروفایل sni خاموش است)."
  exit 1
fi
dc ps "$SERVICE"

# ---------------------------------------------------------------------------
h "تست کانفیگ"

if dc exec -T "$SERVICE" nginx -t 2>&1; then
  :
else
  echo "⚠️  کانفیگ nginx مشکل دارد (بالا را ببین)."
fi

# ---------------------------------------------------------------------------
h "گوش دادن روی ۴۴۳"

# ۴۴۳ روی هاست باید دست همین کانتینر باشد. اگر nginx میرور آن را گرفته
# باشد، یعنی MIRROR_HTTPS_BIND را جا انداخته‌ای و پروکسی هرگز بالا نیامده.
if command -v ss >/dev/null 2>&1; then
  ss -lntH 2>/dev/null | awk '$4 ~ /:443$/ {print}' || true
elif command -v netstat >/dev/null 2>&1; then
  netstat -lnt 2>/dev/null | awk '$4 ~ /:443$/ {print}' || true
else
  echo "نه ss هست نه netstat؛ از خود داکر می‌پرسم:"
fi
echo
echo "publish شده توسط داکر:"
docker ps --filter "name=${SERVICE}" --format '  {{.Names}}  {{.Ports}}'

# ---------------------------------------------------------------------------
h "allowlist فعال (داخل کانتینر)"

# عمداً از داخل کانتینر خوانده می‌شود، نه از فایل روی دیسک: تنها چیزی که
# اهمیت دارد همانی است که nginx واقعاً بارگذاری کرده. اگر پنل روی فایل
# نوشته ولی reload نشده، این دو با هم فرق می‌کنند.
dc exec -T "$SERVICE" cat /etc/nginx/sni-allow.conf 2>/dev/null \
  | grep -Ev '^[[:space:]]*(#|$)' \
  || echo "خوانده نشد."

# ---------------------------------------------------------------------------
h "مقصدهای مسیریابی‌شده به میرور"

# این خطوط گاردِ حلقه‌ی خودی‌اند: بدون آن‌ها SNI برابر دامنه‌ی میرور از DNS
# عمومی به IP همین سرور می‌رسد و پروکسی به خودش وصل می‌شود.
dc exec -T "$SERVICE" sh -c 'sed -n "/map \$ssl_preread_server_name \$sni_destination/,/}/p" /etc/nginx/nginx.conf' 2>/dev/null \
  || echo "خوانده نشد."

# ---------------------------------------------------------------------------
h "۳۰ خط آخر لاگ"

dc exec -T "$SERVICE" tail -n 30 /var/log/nginx/sni-access.log 2>/dev/null \
  || echo "هنوز چیزی لاگ نشده (یا کسی هنوز از پروکسی رد نشده)."

h "خطاها"

dc exec -T "$SERVICE" tail -n 20 /var/log/nginx/sni-error.log 2>/dev/null \
  || echo "خطایی ثبت نشده."

# ---------------------------------------------------------------------------
cat <<'EOF'

── تست از یک کلاینت مجاز ────────────────────────────────────────────────
  curl --noproxy '*' --resolve github.com:443:<PROXY_IP> \
    -sS -o /dev/null -w 'HTTP=%{http_code} ip=%{remote_ip}\n' \
    https://github.com/

  درست: HTTP=200 و ip برابر PROXY_IP. اگر ip چیز دیگری بود، درخواست از
  پروکسی رد نشده. اگر تایم‌اوت شد، آی‌پی آن کلاینت در allowlist بالا نیست.
EOF
