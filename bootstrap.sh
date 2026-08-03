#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# راه‌اندازی اولیه روی سرور خارج: گرفتن گواهی TLS و بالا آوردن استک.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

[[ -f .env ]] || { echo "اول .env.example را به .env کپی و پر کن."; exit 1; }
set -a; . ./.env; set +a
: "${MIRROR_DOMAIN:?}" "${LETSENCRYPT_EMAIL:?}"

mkdir -p letsencrypt certbot-www

CERT_DIR="letsencrypt/live/$MIRROR_DOMAIN"
if [[ ! -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "→ گواهی موقت self-signed تا nginx بتواند بالا بیاید"
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$CERT_DIR/privkey.pem" -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=$MIRROR_DOMAIN" 2>/dev/null
  SELF_SIGNED=1
fi

echo "→ بالا آوردن nginx"
docker compose up -d nginx

if [[ "${SELF_SIGNED:-0}" == "1" ]]; then
  echo "→ گرفتن گواهی واقعی از Let's Encrypt"
  rm -rf "$CERT_DIR"
  docker compose run --rm --entrypoint certbot certbot certonly \
    --webroot -w /var/www/certbot \
    -d "$MIRROR_DOMAIN" -d "docker.$MIRROR_DOMAIN" \
    --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email -n
  docker compose restart nginx
fi

echo "→ بالا آوردن Nexus (اولین بوت ۲ تا ۵ دقیقه طول می‌کشد)"
docker compose up -d

echo
echo "منتظر آماده شدن Nexus..."
until docker compose exec -T nexus curl -fsS http://localhost:8081/service/rest/v1/status >/dev/null 2>&1; do
  printf '.'; sleep 5
done
echo " آماده شد."
echo
echo "رمز اولیه‌ی admin:"
docker compose exec -T nexus cat /nexus-data/admin.password 2>/dev/null || \
  echo "  (فایل نیست — یعنی قبلاً رمز عوض شده)"
echo
echo "قدم بعد:  ./provision.sh"
