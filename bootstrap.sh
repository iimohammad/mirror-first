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

# acl.conf پیش‌فرض همه را رد می‌کند. اگر یادت رفته باشد IP اضافه کنی، استک
# بالا می‌آید ولی هر درخواستی ۴۰۳ می‌گیرد و ساعت‌ها دنبال باگ می‌گردی.
# CIDR اختیاری است چون nginx geo هم فرم /CIDR و هم IP خام را قبول می‌کند —
# رجکس قبلی فقط فرم با CIDR را می‌دید و روی IP خام false positive می‌داد.
ACL_RE='^[[:space:]]*[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(/[0-9]+)?[[:space:]]+0;'
if [[ "${SKIP_ACL_CHECK:-0}" != "1" ]] && \
   { ! grep -Eq "$ACL_RE" nginx/acl.conf || [[ $(grep -Ec "$ACL_RE" nginx/acl.conf) -le 2 ]]; }; then
  echo "⚠️  در nginx/acl.conf هنوز IP سروری اضافه نکرده‌ای."
  echo "    استک بالا می‌آید ولی همه‌ی درخواست‌ها ۴۰۳ می‌گیرند."
  if [[ -t 0 ]]; then
    read -rp "    ادامه بدهم؟ [y/N] " ans
    [[ "$ans" == [yY] ]] || exit 1
  else
    echo "    اجرای غیرتعاملی — بدون IP ادامه نمی‌دهم."
    echo "    برای عبور از این چک: SKIP_ACL_CHECK=1 ./bootstrap.sh"
    exit 1
  fi
fi

CERT_DIR="letsencrypt/live/$MIRROR_DOMAIN"
if [[ ! -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "→ گواهی موقت self-signed تا nginx بتواند بالا بیاید"
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$CERT_DIR/privkey.pem" -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=$MIRROR_DOMAIN" 2>/dev/null
  SELF_SIGNED=1
elif [[ -n "${CERT_EXTRA_DOMAINS:-}" ]]; then
  # CERT_EXTRA_DOMAINS فقط روی بوت اول (بدون گواهی) اعمال می‌شود؛ اگر گواهی
  # از قبل هست، این بلاک اصلاً اجرا نمی‌شود و اضافه کردنش به .env بی‌اثر
  # می‌ماند. حداقل بی‌صدا نباشد.
  MISSING=()
  for d in ${CERT_EXTRA_DOMAINS}; do
    openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -ext subjectAltName 2>/dev/null \
      | grep -q "DNS:$d\b" || MISSING+=("$d")
  done
  if [[ ${#MISSING[@]} -gt 0 ]]; then
    EXTRA_FLAGS=""
    for d in ${CERT_EXTRA_DOMAINS}; do EXTRA_FLAGS+=" -d $d"; done
    echo "⚠️  گواهی فعلی این دامنه‌ها را ندارد: ${MISSING[*]}"
    echo "    یک گواهی از قبل هست، پس CERT_EXTRA_DOMAINS خودکار اعمال نمی‌شود."
    echo "    برای اضافه کردن دستی (به DEPLOY.md بخش Docker push هم نگاه کن):"
    echo "      docker compose run --rm --entrypoint certbot certbot certonly \\"
    echo "        --webroot -w /var/www/certbot --expand \\"
    echo "        -d $MIRROR_DOMAIN -d docker.$MIRROR_DOMAIN$EXTRA_FLAGS \\"
    echo "        --email $LETSENCRYPT_EMAIL --agree-tos -n"
  fi
fi

echo "→ بالا آوردن nginx"
docker compose up -d nginx

if [[ "${SELF_SIGNED:-0}" == "1" ]]; then
  # «docker compose up -d» به محض start شدن کانتینر برمی‌گردد، نه وقتی nginx
  # کامل کانفیگش را خوانده. اگر همین‌جا گواهی موقت را rm کنیم، ممکن است
  # nginx هنوز در حال بالا آمدن باشد و با پای خالی از زیرش [emerg] بدهد و
  # کل nginx (همراه با مسیر ACME روی پورت ۸۰) بالا نیاید.
  echo "→ صبر تا nginx واقعاً بالا بیاید"
  READY=0
  for i in $(seq 1 15); do
    docker compose exec -T nginx nginx -t >/dev/null 2>&1 && { READY=1; break; }
    sleep 1
  done
  [[ "$READY" == "1" ]] || echo "⚠️  nginx هنوز جواب نمی‌دهد؛ ادامه می‌دهم ولی issuance ممکن است شکست بخورد."

  echo "→ گرفتن گواهی واقعی از Let's Encrypt"
  rm -rf "$CERT_DIR"
  EXTRA=()
  for d in ${CERT_EXTRA_DOMAINS:-}; do EXTRA+=(-d "$d"); done
  docker compose run --rm --entrypoint certbot certbot certonly \
    --webroot -w /var/www/certbot \
    -d "$MIRROR_DOMAIN" -d "docker.$MIRROR_DOMAIN" ${EXTRA[@]+"${EXTRA[@]}"} \
    --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email -n

  if [[ ! -f "$CERT_DIR/fullchain.pem" ]]; then
    # اگر certbot به‌جای این مسیر یک lineage با پسوند -0001 ساخته باشد
    # (مثلاً چون یک renewal config قدیمی برای همین دامنه پیدا کرده)، nginx
    # همچنان به مسیر بدون پسوند نگاه می‌کند و گواهی جدید را نمی‌بیند.
    # سکوت اینجا یعنی «موفق» چاپ می‌شود درحالی‌که nginx گواهی معتبر ندارد.
    echo "✘ certbot گواهی را در مسیر انتظار ($CERT_DIR) ننوشت."
    echo "  بررسی کن: docker compose run --rm --entrypoint certbot certbot certificates"
    exit 1
  fi
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
