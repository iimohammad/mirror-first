#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# روی سرورهای ایران: هم کلاینت‌های پکیج را به میرور وصل می‌کند، هم دامنه‌های
# انتخابی را از پروکسی SNI رد می‌دهد. یک دستور، هر دو کار.
#
#   sudo MIRROR_DOMAIN=mirror.example.com ./client/setup-all.sh
#
# متغیرهای اختیاری:
#   PROXY_IP=1.2.3.4            IP سرور میرور برای پروکسی SNI.
#                               اگر ندهی، از خود MIRROR_DOMAIN حل می‌شود.
#   SNI_DOMAINS="a.com b.com"   به‌جای فهرست پیش‌فرض client/sni/domains.sample.txt
#   SKIP_SNI=1                  فقط میرور، بدون دست زدن به /etc/hosts
#   DISABLE_DEFAULT_SOURCES=1   منابع پیش‌فرض apt را کنار می‌گذارد (توصیه می‌شود)
#
# اجرای دوباره‌اش بی‌خطر است.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

: "${MIRROR_DOMAIN:?MIRROR_DOMAIN را ست کن، مثلا mirror.example.com}"
[[ $EUID -eq 0 ]] || { echo "با sudo اجرا کن."; exit 1; }

say() { printf '\n══ %s\n' "$1"; }

say "۱/۲ — وصل کردن apt/pip/npm/go/docker به میرور"
MIRROR_DOMAIN="$MIRROR_DOMAIN" \
  DISABLE_DEFAULT_SOURCES="${DISABLE_DEFAULT_SOURCES:-0}" \
  bash ./setup-client.sh all

if [[ "${SKIP_SNI:-0}" == "1" ]]; then
  say "۲/۲ — پروکسی SNI رد شد (SKIP_SNI=1)"
  echo "تمام."
  exit 0
fi

say "۲/۲ — رد دادن دامنه‌های گیت‌هاب و… از پروکسی SNI"

# IP سرور میرور. اگر دستی داده نشده، از خود دامنه حلش می‌کنیم — همان سروری
# است که پروکسی SNI رویش بالاست (سرویس sniproxy در docker-compose.yml).
if [[ -z "${PROXY_IP:-}" ]]; then
  PROXY_IP=$(getent ahostsv4 "$MIRROR_DOMAIN" 2>/dev/null | awk '{print $1; exit}')
  [[ -n "$PROXY_IP" ]] || {
    echo "✘ نتوانستم $MIRROR_DOMAIN را حل کنم. با PROXY_IP=... دستی بده."
    exit 1
  }
  echo "   IP پروکسی از روی $MIRROR_DOMAIN: $PROXY_IP"
fi

# سلامت‌سنجی قبل از دست زدن به /etc/hosts — اگر پروکسی بالا نباشد یا IP این
# سرور در allowlist نباشد، بهتر است همین‌جا بفهمی تا اینکه /etc/hosts عوض شود
# و بعد گیت و همه‌چیز بخوابد.
if ! bash ./sni/test-proxy.sh --proxy-ip "$PROXY_IP" github.com >/dev/null 2>&1; then
  echo "✘ پروکسی SNI روی $PROXY_IP جواب نداد."
  echo "  چک کن: سرویس sniproxy بالاست؟ (COMPOSE_PROFILES=sni در .env سرور)"
  echo "         IP این سرور در allowlist هست؟ (/panel/ips)"
  echo "  برای رد کردن این مرحله: SKIP_SNI=1 $0"
  exit 1
fi
echo "   پروکسی جواب داد."

if [[ -n "${SNI_DOMAINS:-}" ]]; then
  # shellcheck disable=SC2086
  bash ./sni/set-hosts.sh --proxy-ip "$PROXY_IP" $SNI_DOMAINS
else
  bash ./sni/set-hosts.sh --proxy-ip "$PROXY_IP" --file ./sni/domains.sample.txt
fi

cat <<EOF

تمام. حالا روی این سرور:
  • apt / pip / npm / go / docker  →  از میرور می‌آیند (کش‌شده)
  • git clone و دانلود از گیت‌هاب  →  از پروکسی SNI رد می‌شوند

تست:
  apt-get update
  git clone https://github.com/OWNER/REPO.git
EOF
