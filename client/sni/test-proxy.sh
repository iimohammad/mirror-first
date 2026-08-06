#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vendored from https://github.com/iimohammad/sni-https-proxy (MIT).
# Copyright (c) 2026 Rio Antonio — see LICENSE in this directory.
#
# سمت سرورِ آن پروژه اینجا استفاده نمی‌شود: پروکسی به‌عنوان سرویس sniproxy
# داخل docker-compose.yml همین مخزن بالا می‌آید (پروفایل sni). این اسکریپت‌ها
# فقط سمت کلاینت‌اند و روی سرورهای ایران اجرا می‌شوند.
# ---------------------------------------------------------------------------
set -Eeuo pipefail

PROXY_IP=""
DOMAINS=()

usage() {
  cat <<'EOF'
Usage:
  bash test-proxy.sh --proxy-ip IP domain1 [domain2 ...]

Example:
  bash test-proxy.sh --proxy-ip 37.27.11.89 github.com registry-1.docker.io

Exits non-zero if any domain fails, so it can be used in a health check.
A 401 from registry-1.docker.io counts as success: the TLS session completed.
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

valid_ipv4() {
  local octet
  local -a octets=()
  # Strict whole-string shape first. "read -a" below stops at the first newline
  # and drops a trailing empty field, so on its own it would accept both a
  # multi-line value and "1.2.3.4.".
  [[ "$1" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  IFS=. read -r -a octets <<< "$1"
  ((${#octets[@]} == 4)) || return 1
  for octet in "${octets[@]}"; do
    [[ "$octet" =~ ^(0|[1-9][0-9]{0,2})$ ]] || return 1
    ((10#$octet <= 255)) || return 1
  done
}

while (($#)); do
  case "$1" in
    --proxy-ip)
      [[ $# -ge 2 ]] || die "--proxy-ip requires a value"
      PROXY_IP="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      usage >&2
      die "Unknown option: $1"
      ;;
    *)
      DOMAINS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "$PROXY_IP" ]] || ((${#DOMAINS[@]} == 0)); then
  usage >&2
  exit 1
fi

valid_ipv4 "$PROXY_IP" || die "Invalid proxy IPv4 address: $PROXY_IP"
command -v curl >/dev/null 2>&1 || die "curl is required but not installed."

# curl honours http_proxy/https_proxy over --resolve, which would route the
# request through that proxy and report a PASS without ever touching the SNI
# proxy. --noproxy '*' makes --resolve authoritative.
if [[ -n "${https_proxy:-${HTTPS_PROXY:-}}" || -n "${http_proxy:-${HTTP_PROXY:-}}" ]]; then
  echo "NOTE: a proxy is set in the environment; it is ignored for these tests so that --resolve decides the destination." >&2
fi

FAILED=()

for domain in "${DOMAINS[@]}"; do
  echo
  echo "============================================================"
  echo "Testing: https://${domain}/ via ${PROXY_IP}:443"
  echo "============================================================"
  if curl \
      --connect-timeout 15 \
      --max-time 45 \
      --noproxy '*' \
      --resolve "${domain}:443:${PROXY_IP}" \
      -sS -o /dev/null \
      -w 'HTTP=%{http_code} remote_ip=%{remote_ip} tls_verify=%{ssl_verify_result}\n' \
      "https://${domain}/"; then
    echo "PASS: TLS connection completed."
  else
    echo "FAIL: Could not complete the TLS/HTTPS request." >&2
    FAILED+=("$domain")
  fi
done

echo
echo "============================================================"
if ((${#FAILED[@]} == 0)); then
  echo "All ${#DOMAINS[@]} domain(s) passed."
  exit 0
fi

echo "${#FAILED[@]} of ${#DOMAINS[@]} domain(s) failed:" >&2
printf '  - %s\n' "${FAILED[@]}" >&2
exit 1
