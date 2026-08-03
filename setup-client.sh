#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# روی سرورهای ایران اجرا شود. کلاینت‌ها را به میرور وصل می‌کند.
#
#   sudo MIRROR_DOMAIN=mirror.example.com ./setup-client.sh docker pip npm go
#   sudo MIRROR_DOMAIN=mirror.example.com ./setup-client.sh all
#
# از هر فایلی که دست بزند اول بکاپ .bak می‌گیرد.
# ---------------------------------------------------------------------------
set -euo pipefail

: "${MIRROR_DOMAIN:?MIRROR_DOMAIN را ست کن، مثلا mirror.example.com}"
UBUNTU_CODENAME="${UBUNTU_CODENAME:-$( . /etc/os-release 2>/dev/null; echo "${VERSION_CODENAME:-noble}" )}"

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
  systemctl restart docker
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
  backup /etc/apt/sources.list
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

setup_pip() {
  echo "→ pip"
  mkdir -p /etc/pip
  backup /etc/pip.conf
  cat > /etc/pip.conf <<EOF
[global]
index-url = https://$MIRROR_DOMAIN/repository/pypi-proxy/simple
trusted-host = $MIRROR_DOMAIN
timeout = 60
EOF
}

setup_npm() {
  echo "→ npm"
  backup /etc/npmrc
  cat > /etc/npmrc <<EOF
registry=https://$MIRROR_DOMAIN/repository/npm-proxy/
EOF
}

setup_go() {
  echo "→ go"
  cat > /etc/profile.d/go-mirror.sh <<EOF
export GOPROXY="https://$MIRROR_DOMAIN/repository/go-proxy,direct"
export GOSUMDB=off
EOF
  echo "   (برای اعمال: source /etc/profile.d/go-mirror.sh)"
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
[[ "$1" == "all" ]] && set -- docker apt pip npm go git

for t in "$@"; do "setup_$t"; done
echo "تمام."
