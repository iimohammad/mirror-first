#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# روی سرورهای ایران اجرا شود. کلاینت‌ها را به میرور وصل می‌کند.
#
#   sudo MIRROR_DOMAIN=mirror.example.com ./client/setup-client.sh docker pip npm go
#   sudo MIRROR_DOMAIN=mirror.example.com ./client/setup-client.sh all
#
# متغیرهای اختیاری:
#   DISABLE_DEFAULT_SOURCES=1   منابع پیش‌فرض apt را کنار می‌گذارد
#   UBUNTU_CODENAME=jammy       اگر تشخیص خودکار درست نبود (فقط اوبونتو)
#   DEBIAN_CODENAME=bookworm    همان، برای دبیان
#
# از هر فایلی که دست بزند اول بکاپ .bak می‌گیرد.
# ---------------------------------------------------------------------------
set -euo pipefail

: "${MIRROR_DOMAIN:?MIRROR_DOMAIN را ست کن، مثلا mirror.example.com}"
UBUNTU_CODENAME="${UBUNTU_CODENAME:-$( . /etc/os-release 2>/dev/null; echo "${VERSION_CODENAME:-}" )}"

backup() { [[ -f "$1" ]] && cp -n "$1" "$1.bak" && echo "   (بکاپ: $1.bak)"; return 0; }

setup_docker() {
  echo "→ داکر"
  mkdir -p /etc/docker
  backup /etc/docker/daemon.json
  python3 - "$MIRROR_DOMAIN" <<'PY'
import json, sys, pathlib
p = pathlib.Path("/etc/docker/daemon.json")
cfg = json.loads(p.read_text()) if p.exists() and p.read_text().strip() else {}
cfg["registry-mirrors"] = [f"https://docker.{sys.argv[1]}"]
p.write_text(json.dumps(cfg, indent=2) + "\n")
PY
  # اگر systemd نیست (کانتینر) یا سرویس هنوز بالا نیامده، restart شکست
  # می‌خورد؛ نباید کل «all» را با خودش پایین بکشد — کانفیگ که نوشته شد،
  # کافی است.
  systemctl restart docker 2>/dev/null || \
    echo "   ⚠️  نتوانستم docker را ری‌استارت کنم؛ دستی بزن: systemctl restart docker"
  docker info 2>/dev/null | grep -A2 'Registry Mirrors' || true
  echo "   نکته: ایمیج‌های غیر داکرهاب را با اسم میرور بکش، مثلا:"
  echo "     docker pull docker.$MIRROR_DOMAIN/astral-sh/uv:latest   # به‌جای ghcr.io/..."
}

setup_containerd() {   # برای k8s / k3s
  echo "→ containerd"
  for up in docker.io ghcr.io quay.io registry.k8s.io gcr.io mcr.microsoft.com; do
    mkdir -p "/etc/containerd/certs.d/$up"
    backup "/etc/containerd/certs.d/$up/hosts.toml"
    cat > "/etc/containerd/certs.d/$up/hosts.toml" <<EOF
server = "https://$up"

[host."https://docker.$MIRROR_DOMAIN"]
  capabilities = ["pull", "resolve"]
EOF
  done
  echo "   config_path = \"/etc/containerd/certs.d\" را در بخش registry فایل"
  echo "   /etc/containerd/config.toml بگذار و containerd را restart کن."
}

setup_apt() {
  echo "→ apt"
  local distro_id
  distro_id=$( . /etc/os-release 2>/dev/null; echo "$ID" )
  case "$distro_id" in
    ubuntu) _setup_apt_ubuntu ;;
    debian) _setup_apt_debian ;;
    *)
      echo "   ✘ توزیع '$distro_id' پشتیبانی نمی‌شود (فقط ubuntu و debian)."
      return 1
      ;;
  esac
}

# اسم فایلی که DISABLE_DEFAULT_SOURCES باید کنار بگذارد بین توزیع‌ها فرق
# دارد؛ چک می‌کنیم واقعاً چیزی غیرفعال شد یا نه تا سکوت گمراه‌کننده نباشد.
_disable_default_apt_sources() { # فایل‌های احتمالی به‌عنوان آرگومان
  local disabled_any=0
  if [[ "${DISABLE_DEFAULT_SOURCES:-0}" == "1" ]]; then
    for f in "$@"; do
      [[ -f "$f" ]] && mv "$f" "$f.disabled" && echo "   (غیرفعال شد: $f → $f.disabled)" && disabled_any=1
    done
    [[ "$disabled_any" == "1" ]] || echo "   ⚠️  هیچ فایل منبع پیش‌فرضی برای غیرفعال کردن پیدا نشد."
  else
    echo "   نکته: منابع پیش‌فرض دست‌نخورده ماندند. برای اینکه واقعاً همه‌چیز از"
    echo "   میرور بیاید، دوباره با DISABLE_DEFAULT_SOURCES=1 اجرا کن."
  fi
}

_setup_apt_ubuntu() {
  if [[ -z "$UBUNTU_CODENAME" ]]; then
    echo "   ✘ VERSION_CODENAME در /etc/os-release پیدا نشد."
    echo "     دستی بده: UBUNTU_CODENAME=noble $0 apt"
    return 1
  fi
  backup /etc/apt/sources.list
  _disable_default_apt_sources /etc/apt/sources.list /etc/apt/sources.list.d/ubuntu.sources
  cat > /etc/apt/sources.list.d/mirror.sources <<EOF
Types: deb
URIs: https://$MIRROR_DOMAIN/repository/apt-ubuntu-$UBUNTU_CODENAME/
Suites: $UBUNTU_CODENAME $UBUNTU_CODENAME-updates $UBUNTU_CODENAME-backports $UBUNTU_CODENAME-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
EOF
  echo "   برای ریپوهای HTTPS شخص ثالث از raw استفاده کن، مثلا داکر:"
  cat <<EOF
     deb [signed-by=/etc/apt/keyrings/docker.asc] \\
       https://$MIRROR_DOMAIN/repository/raw-docker/linux/ubuntu $UBUNTU_CODENAME stable
EOF
}

_setup_apt_debian() {
  local codename
  codename="${DEBIAN_CODENAME:-$( . /etc/os-release 2>/dev/null; echo "$VERSION_CODENAME" )}"
  if [[ -z "$codename" ]]; then
    echo "   ✘ VERSION_CODENAME در /etc/os-release پیدا نشد."
    echo "     دستی بده: DEBIAN_CODENAME=bookworm $0 apt"
    return 1
  fi
  if [[ "$codename" != "bookworm" ]]; then
    echo "   ⚠️  provision.sh فقط برای bookworm ریپو ساخته. با '$codename' ادامه"
    echo "      می‌دهم ولی تا ریپوی apt-debian-$codename روی سرور خارج نسازی، ۴۰۴ می‌گیری."
  fi

  # دبیان از bullseye/bookworm به بعد sources.list.d/debian.sources دارد،
  # نه sources.list یا ubuntu.sources — چک اشتباه یعنی «غیرفعال کردم»
  # چاپ می‌شود ولی منابع پیش‌فرض دست‌نخورده می‌مانند.
  backup /etc/apt/sources.list
  _disable_default_apt_sources /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources

  # non-free-firmware از bookworm (۱۲) به بعد وجود دارد؛ روی نسخه‌های
  # قدیم‌تر کامپوننتی به همین اسم نیست.
  local components="main contrib non-free"
  case "$codename" in
    bookworm|trixie|forky) components="main contrib non-free non-free-firmware" ;;
  esac

  cat > /etc/apt/sources.list.d/mirror.sources <<EOF
Types: deb
URIs: https://$MIRROR_DOMAIN/repository/apt-debian-$codename/
Suites: $codename $codename-updates $codename-backports
Components: $components
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg

Types: deb
URIs: https://$MIRROR_DOMAIN/repository/apt-debian-$codename-security/
Suites: $codename-security
Components: $components
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
EOF
  echo "   نکته: آرشیو امنیتی دبیان روی سرور جدایی است (security.debian.org)،"
  echo "   نه زیرمجموعه‌ی همان آرشیو اصلی مثل اوبونتو — برای همین یک بلاک جدا گرفت."
}

setup_pip() {
  echo "→ pip"
  backup /etc/pip.conf
  # group و نه proxy: هم پکیج‌های عمومی و هم پکیج‌های خودت از یک آدرس می‌آیند.
  # trusted-host عمداً نیست — گواهی Let's Encrypt معتبر است و trusted-host
  # اعتبارسنجی TLS را خاموش می‌کند.
  cat > /etc/pip.conf <<EOF
[global]
index-url = https://$MIRROR_DOMAIN/repository/pypi-group/simple
timeout = 60
retries = 5
EOF
}

setup_npm() {
  echo "→ npm"
  # مسیر global config npm به prefix نصبش بستگی دارد: پکیج توزیع معمولاً
  # /etc/npmrc را می‌خواند، ولی نصب دستی (nodejs.org tarball در /usr/local،
  # nvm و…) جای دیگری را می‌خواند و /etc/npmrc را اصلاً نمی‌بیند. اگر npm
  # از قبل نصب است، مستقیم از خودش می‌پرسیم.
  local target="/etc/npmrc"
  if command -v npm >/dev/null 2>&1; then
    target=$(npm config get globalconfig 2>/dev/null || echo /etc/npmrc)
  fi
  mkdir -p "$(dirname "$target")"
  backup "$target"
  cat > "$target" <<EOF
registry=https://$MIRROR_DOMAIN/repository/npm-group/
fetch-retries=5
EOF
  echo "   نوشته شد در: $target"
  if [[ "$target" != "/etc/npmrc" ]]; then
    echo "   (نصب غیر توزیعی node تشخیص داده شد)"
  elif ! command -v npm >/dev/null 2>&1; then
    echo "   نکته: npm هنوز نصب نیست؛ اگر بعداً با روشی غیر از پکیج توزیع"
    echo "   (nvm، tarball رسمی و…) نصبش کردی، همین دستور را دوباره بزن."
  fi
}

setup_go() {
  echo "→ go"
  # GOSUMDB=off لازم است چون Nexus مسیر sum.golang.org را پروکسی نمی‌کند و
  # آن هاست هم از ایران در دسترس نیست. یعنی چک‌سام مرکزی خاموش می‌شود؛
  # امنیت روی go.sum کامیت‌شده‌ی خود پروژه می‌ماند، پس go.sum را کامیت کن
  # و اجازه نده CI با -mod=mod بی‌سروصدا به‌روزش کند.
  cat > /etc/profile.d/go-mirror.sh <<EOF
export GOPROXY="https://$MIRROR_DOMAIN/repository/go-proxy,direct"
export GOSUMDB=off
export GOFLAGS="-mod=readonly"
EOF
  echo "   (شل‌های لاگین: source /etc/profile.d/go-mirror.sh)"

  # /etc/profile.d فقط شل‌های لاگین را می‌گیرد؛ سرویس systemd، cron و
  # فرمان‌های غیرتعاملی ssh آن را نمی‌خوانند. /etc/environment را PAM برای
  # اغلب همین مسیرها هم اعمال می‌کند، بدون نیاز به source دستی.
  backup /etc/environment
  touch /etc/environment
  sed -i -E '/^(GOPROXY|GOSUMDB|GOFLAGS)=/d' /etc/environment
  cat >> /etc/environment <<EOF
GOPROXY=https://$MIRROR_DOMAIN/repository/go-proxy,direct
GOSUMDB=off
GOFLAGS=-mod=readonly
EOF
  echo "   (سرویس/ssh غیرتعاملی: از /etc/environment می‌خوانند، نیاز به source ندارد)"
  echo "   نکته: GOSUMDB خاموش شد؛ go.sum پروژه را کامیت‌شده نگه دار."
}

setup_git() {
  echo "→ git"
  echo "   ⚠️ Nexus سرور گیت نیست و git clone را پروکسی نمی‌کند."
  echo "   گزینه‌ها:"
  echo "     ۱) forward proxy روی همان سرور خارج (squid/tinyproxy) و بعد:"
  echo "        git config --global http.proxy http://user:pass@$MIRROR_DOMAIN:3128"
  echo "     ۲) Gitea روی سرور خارج با pull-mirror برای ریپوهای مشخص"
  echo "   فقط دانلود فایل/ریلیز از گیت‌هاب با raw کار می‌کند:"
  echo "     https://$MIRROR_DOMAIN/repository/raw-github/<owner>/<repo>/releases/download/..."
  echo "     https://$MIRROR_DOMAIN/repository/raw-ghusercontent/<owner>/<repo>/<branch>/<file>"
}

[[ $# -gt 0 ]] || { echo "استفاده: $0 [docker|containerd|apt|pip|npm|go|git|all]"; exit 1; }
# containerd عمداً در all نیست: به ویرایش دستی /etc/containerd/config.toml هم
# نیاز دارد، پس جدا صدایش بزن.
[[ "$1" == "all" ]] && set -- docker apt pip npm go git

FAILED=()
for t in "$@"; do
  # با set -e، اگر یک هدف شکست بخورد کل اجرای «all» همان‌جا متوقف می‌شود و
  # بقیه‌ی هدف‌ها (که به این یکی ربطی ندارند) اصلاً اجرا نمی‌شوند. هر هدف را
  # جدا می‌سنجیم تا یک شکست بقیه را قربانی نکند.
  if ! "setup_$t"; then
    echo "   ✘ setup_$t شکست خورد؛ به بعدی می‌روم" >&2
    FAILED+=("$t")
  fi
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "تمام، با خطا در: ${FAILED[*]}"
  exit 1
fi
echo "تمام."
