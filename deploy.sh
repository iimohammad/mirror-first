#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# یک‌جا همه‌چیز را روی سرور خارج بالا می‌آورد: .env، گواهی TLS، استک
# (Nexus + nginx + certbot + پنل)، ریپوهای proxy/group، ریپوهای hosted.
#
#   ./deploy.sh
#
# اجرای دوباره‌اش بی‌خطر است — bootstrap.sh/provision.sh/provision-hosted.sh
# هر سه idempotent هستند و این اسکریپت فقط لایه‌ی هماهنگ‌کننده‌ی رویشان است.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\n→ %s\n' "$1"; }
warn() { printf '⚠️  %s\n' "$1"; }

# ---------------------------------------------------------------------------
say "چک پیش‌نیازها"
for cmd in docker openssl curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "✘ $cmd نصب نیست."; exit 1; }
done
docker compose version >/dev/null 2>&1 || {
  echo "✘ docker compose (پلاگین v2) نصب نیست یا در دسترس نیست."
  echo "  نصب سریع: curl -fsSL https://get.docker.com | sh"
  exit 1
}
echo "  همه هست."

# ---------------------------------------------------------------------------
if [[ ! -f .env ]]; then
  say ".env نیست، می‌سازمش"
  cp .env.example .env

  read -rp "  دامنه‌ی میرور (مثلا mirror.example.com): " MIRROR_DOMAIN_INPUT
  : "${MIRROR_DOMAIN_INPUT:?دامنه نمی‌تواند خالی باشد}"
  read -rp "  ایمیل برای Let's Encrypt: " LETSENCRYPT_EMAIL_INPUT
  : "${LETSENCRYPT_EMAIL_INPUT:?ایمیل نمی‌تواند خالی باشد}"

  sed -i "s/^MIRROR_DOMAIN=.*/MIRROR_DOMAIN=$MIRROR_DOMAIN_INPUT/" .env
  sed -i "s/^LETSENCRYPT_EMAIL=.*/LETSENCRYPT_EMAIL=$LETSENCRYPT_EMAIL_INPUT/" .env
  sed -i "s/^PANEL_SESSION_SECRET=.*/PANEL_SESSION_SECRET=$(openssl rand -hex 32)/" .env
  echo "  .env ساخته شد. برای اکانت داکرهاب یا تنظیمات اضافه: nano .env"
else
  say ".env از قبل هست"
  # ممکن است .env قدیمی‌تر از اضافه شدن پنل باشد و این خط را نداشته باشد.
  grep -q '^PANEL_SESSION_SECRET=' .env || echo 'PANEL_SESSION_SECRET=' >> .env
fi

set -a; . ./.env; set +a
: "${MIRROR_DOMAIN:?در .env خالی است}" "${LETSENCRYPT_EMAIL:?در .env خالی است}"

if [[ -z "${PANEL_SESSION_SECRET:-}" ]]; then
  say "PANEL_SESSION_SECRET خالی است، می‌سازمش"
  SECRET=$(openssl rand -hex 32)
  sed -i "s/^PANEL_SESSION_SECRET=.*/PANEL_SESSION_SECRET=$SECRET/" .env
  export PANEL_SESSION_SECRET="$SECRET"
fi

# ---------------------------------------------------------------------------
if command -v dig >/dev/null 2>&1; then
  say "چک DNS (فقط هشدار، جلوی چیزی را نمی‌گیرد)"
  MY_IP=$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)
  for host in "$MIRROR_DOMAIN" "docker.$MIRROR_DOMAIN"; do
    RESOLVED=$(dig +short "$host" 2>/dev/null | tail -1)
    if [[ -z "$RESOLVED" ]]; then
      warn "$host هنوز جایی resolve نمی‌شود — Let's Encrypt رد می‌کند."
    elif [[ -n "$MY_IP" && "$RESOLVED" != "$MY_IP" ]]; then
      warn "$host به $RESOLVED می‌رود، نه IP همین سرور ($MY_IP)."
    else
      echo "  $host → $RESOLVED  خوب است"
    fi
  done
fi

# ---------------------------------------------------------------------------
say "چک nginx/acl.conf"
ACL_RE='^[[:space:]]*[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(/[0-9]+)?[[:space:]]+0;'
if [[ $(grep -Ec "$ACL_RE" nginx/acl.conf 2>/dev/null || echo 0) -le 2 ]]; then
  warn "هنوز IP سروری در nginx/acl.conf اضافه نکرده‌ای — بعد از بالا آمدن همه‌چیز ۴۰۳ می‌گیرد."
  echo "  الان می‌توانی رد شوی و بعداً از پنل (/panel/ips) اضافه‌اش کنی."
fi

# ---------------------------------------------------------------------------
say "bootstrap.sh — گواهی TLS + بالا آوردن استک"
./bootstrap.sh

say "گرفتن رمز اولیه‌ی admin برای provisioning"
NEXUS_PASS=$(docker compose exec -T nexus cat /nexus-data/admin.password 2>/dev/null || true)
if [[ -z "$NEXUS_PASS" ]]; then
  echo "  رمز اولیه پیدا نشد (احتمالاً از یک اجرای قبلی رمز admin را عوض کرده‌ای)."
  read -rsp "  رمز فعلی admin نکسس: " NEXUS_PASS; echo
fi
export NEXUS_PASS

say "provision.sh — ریپوهای proxy و group"
./provision.sh

say "provision-hosted.sh — ریپوهای hosted + کاربر deployer"
./provision-hosted.sh

# ---------------------------------------------------------------------------
say "تمام. آدرس‌ها:"
cat <<EOF
  میرور:  https://$MIRROR_DOMAIN/
  داکر:   https://docker.$MIRROR_DOMAIN/
  پنل:    https://$MIRROR_DOMAIN/panel/   (لاگین با یوزر/پس ادمین نکسس بالا)

قدم‌های بعدی:
  1. اگر IP اضافه نکردی: از پنل (/panel/ips) یا دستی nginx/acl.conf
  2. رمز admin نکسس را عوض کن، بعد:
       docker compose exec nexus rm -f /nexus-data/admin.password
  3. در نکسس: Administration → System → Capabilities → Base URL = https://$MIRROR_DOMAIN/
  4. در نکسس یا پنل (/panel/disk): Cleanup Policy بساز وگرنه دیسک پر می‌شود
  5. وصل کردن سرورهای ایران:
       sudo MIRROR_DOMAIN=$MIRROR_DOMAIN ./client/setup-client.sh all

جزئیات کامل: DEPLOY.md
EOF
