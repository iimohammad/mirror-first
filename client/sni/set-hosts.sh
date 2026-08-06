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

HOSTS_FILE="${HOSTS_FILE:-/etc/hosts}"
START_MARKER="# BEGIN SNI-HTTPS-PROXY MANAGED"
END_MARKER="# END SNI-HTTPS-PROXY MANAGED"
# glibc returns the first match in /etc/hosts, so an entry above our block would
# win and quietly bypass the proxy. Conflicting lines are commented out with
# this prefix; remove-hosts.sh puts them back.
DISABLED_PREFIX="#SNI-HTTPS-PROXY-DISABLED# "
PROXY_IP=""
DOMAIN_FILE=""
DOMAINS=()

usage() {
  cat <<'EOF'
Usage:
  sudo bash set-hosts.sh --proxy-ip IP domain1 domain2 ...
  sudo bash set-hosts.sh --proxy-ip IP --file domains.txt

Examples:
  sudo bash set-hosts.sh --proxy-ip 37.27.11.89 github.com api.github.com
  sudo bash set-hosts.sh --proxy-ip 37.27.11.89 --file examples/domains.sample.txt

The script rewrites only its own managed block in /etc/hosts and backs the file
up first. Re-running it replaces the previous block.
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

trim() {
  local s="${1//$'\r'/}"
  s="${s#$'\xef\xbb\xbf'}"   # UTF-8 BOM from Windows editors
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# Dotted-quad IPv4 only. Leading zeros are rejected because bash arithmetic
# reads them as octal while resolvers read them as decimal.
valid_ipv4() {
  local octet
  local -a octets=()
  # Strict whole-string shape first. "read -a" below stops at the first newline
  # and drops a trailing empty field, so on its own it would accept both a
  # multi-line value and "1.2.3.4." (which glibc then silently ignores).
  [[ "$1" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  IFS=. read -r -a octets <<< "$1"
  ((${#octets[@]} == 4)) || return 1
  for octet in "${octets[@]}"; do
    [[ "$octet" =~ ^(0|[1-9][0-9]{0,2})$ ]] || return 1
    ((10#$octet <= 255)) || return 1
  done
}

# Lowercase hostname, at least two labels. The TLD may be punycode (xn--p1ai),
# so it is allowed to contain digits and hyphens after the first character.
valid_domain() {
  local domain="$1"
  ((${#domain} <= 253)) || return 1
  [[ "$domain" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]]
}

while (($#)); do
  case "$1" in
    --proxy-ip)
      [[ $# -ge 2 ]] || die "--proxy-ip requires a value"
      PROXY_IP="$2"
      shift 2
      ;;
    --file)
      [[ $# -ge 2 ]] || die "--file requires a value"
      DOMAIN_FILE="$2"
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

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash set-hosts.sh ..."
[[ -n "$PROXY_IP" ]] || die "--proxy-ip is required"
valid_ipv4 "$PROXY_IP" || die "Invalid proxy IPv4 address: $PROXY_IP"

case "$PROXY_IP" in
  127.*|0.0.0.0)
    die "Refusing to use $PROXY_IP as the proxy address: it would loop back to this host."
    ;;
esac

if command -v hostname >/dev/null 2>&1; then
  for local_ip in $(hostname -I 2>/dev/null || true); do
    if [[ "$local_ip" == "$PROXY_IP" ]]; then
      echo "WARNING: $PROXY_IP is an address of this machine. Mapping domains to it on the proxy host itself creates a connection loop." >&2
      break
    fi
  done
fi

if [[ -n "$DOMAIN_FILE" ]]; then
  [[ -f "$DOMAIN_FILE" ]] || die "Domain file not found: $DOMAIN_FILE"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(trim "$line")"
    [[ -z "$line" ]] && continue
    # Several hostnames may share a line. Split with read -ra rather than an
    # unquoted expansion, which would glob "*.com" against the current
    # directory and silently substitute local filenames.
    tokens=()
    read -r -a tokens <<< "$line"
    DOMAINS+=("${tokens[@]}")
  done < "$DOMAIN_FILE"
fi

((${#DOMAINS[@]} > 0)) || die "Provide at least one domain or use --file"

[[ -f "$HOSTS_FILE" ]] || die "Hosts file not found: $HOSTS_FILE"
[[ -w "$HOSTS_FILE" ]] || die "Hosts file is not writable: $HOSTS_FILE"

declare -A SEEN=()
CLEAN_DOMAINS=()
for domain in "${DOMAINS[@]}"; do
  domain="$(trim "$domain")"
  domain="${domain,,}"
  domain="${domain#*://}"   # drop http:// https:// and friends
  domain="${domain##*@}"    # drop any userinfo
  domain="${domain%%/*}"    # drop path
  domain="${domain%%:*}"    # drop port
  domain="${domain%.}"      # drop the root dot
  [[ -n "$domain" ]] || continue
  valid_domain "$domain" || die "Invalid domain: $domain"
  if [[ -z "${SEEN[$domain]+x}" ]]; then
    SEEN["$domain"]=1
    CLEAN_DOMAINS+=("$domain")
  fi
done

((${#CLEAN_DOMAINS[@]} > 0)) || die "No usable domains after parsing the input"

# Refuse to touch a hosts file whose managed block has been hand-edited into an
# ambiguous state; blindly rewriting it would silently drop unrelated entries.
START_COUNT="$(grep -cFx "$START_MARKER" "$HOSTS_FILE" || true)"
END_COUNT="$(grep -cFx "$END_MARKER" "$HOSTS_FILE" || true)"

if ((START_COUNT > 1 || END_COUNT > 1)); then
  die "$HOSTS_FILE contains ${START_COUNT} start and ${END_COUNT} end markers. Clean it up manually before re-running."
fi
if ((START_COUNT != END_COUNT)); then
  die "$HOSTS_FILE has a mismatched managed block (${START_COUNT} start marker(s), ${END_COUNT} end marker(s)). Restore a backup or repair it manually; refusing to edit so no entries are lost."
fi
# Equal counts are not enough: with the end marker above the start marker, the
# stripper below would delete everything from the start marker to EOF.
if ((START_COUNT == 1)); then
  START_LINE="$(grep -nFx "$START_MARKER" "$HOSTS_FILE" | cut -d: -f1)"
  END_LINE="$(grep -nFx "$END_MARKER" "$HOSTS_FILE" | cut -d: -f1)"
  if ((END_LINE < START_LINE)); then
    die "$HOSTS_FILE has its end marker (line ${END_LINE}) above its start marker (line ${START_LINE}). Repair it manually; refusing to edit so no entries are lost."
  fi
fi

BACKUP="${HOSTS_FILE}.backup-$(date +%Y%m%d-%H%M%S)"
if [[ -e "$BACKUP" ]]; then
  BACKUP="$(mktemp "${HOSTS_FILE}.backup-$(date +%Y%m%d-%H%M%S)-XXXX")"
fi
# -L so a symlinked /etc/hosts is backed up by content, not as another symlink
# pointing at the file we are about to rewrite.
cp -aL "$HOSTS_FILE" "$BACKUP"

TMP="$(mktemp)"
CONFLICTS="$(mktemp)"
trap 'rm -f "$TMP" "$CONFLICTS"' EXIT

{
  # Everything outside the managed block, minus trailing blank lines so that
  # repeated runs do not grow the file. Entries elsewhere in the file that map a
  # domain we manage are commented out, because they would otherwise win.
  awk -v start="$START_MARKER" -v end="$END_MARKER" -v pfx="$DISABLED_PREFIX" \
      -v domains="${CLEAN_DOMAINS[*]}" -v conflicts="$CONFLICTS" '
    BEGIN {
      m = split(domains, d, " ")
      for (i = 1; i <= m; i++) managed[d[i]] = 1
    }
    $0 == start { skip = 1; next }
    $0 == end   { skip = 0; next }
    skip        { next }
    {
      raw = $0
      # Re-enable anything we disabled previously, then decide again below.
      if (substr(raw, 1, length(pfx)) == pfx) raw = substr(raw, length(pfx) + 1)

      work = raw
      sub(/#.*/, "", work)
      gsub(/^[ \t]+/, "", work)
      nf = split(work, f, /[ \t]+/)

      hit = 0
      for (i = 2; i <= nf; i++) {
        name = tolower(f[i])
        sub(/\.$/, "", name)
        if (name in managed) hit = 1
      }

      if (hit && nf >= 2) {
        lines[++n] = pfx raw
        print raw > conflicts
      } else {
        lines[++n] = raw
      }
    }
    END {
      last = 0
      for (i = 1; i <= n; i++) if (lines[i] ~ /[^[:space:]]/) last = i
      for (i = 1; i <= last; i++) print lines[i]
    }
  ' "$HOSTS_FILE"

  echo
  echo "$START_MARKER"
  for domain in "${CLEAN_DOMAINS[@]}"; do
    printf '%s %s\n' "$PROXY_IP" "$domain"
  done
  echo "$END_MARKER"
} > "$TMP"

# Never truncate the real file over an empty or truncated build.
[[ -s "$TMP" ]] || die "Refusing to write an empty $HOSTS_FILE. It is unchanged; a backup is at $BACKUP."
grep -qFx "$END_MARKER" "$TMP" || die "Generated content looks incomplete. $HOSTS_FILE is unchanged; a backup is at $BACKUP."

# Write through the existing inode so a bind-mounted /etc/hosts keeps working.
cat "$TMP" > "$HOSTS_FILE"

echo "Updated $HOSTS_FILE"
echo "Backup: $BACKUP"

if [[ -s "$CONFLICTS" ]]; then
  echo
  echo "Commented out pre-existing entries that would have taken precedence:"
  while IFS= read -r conflict; do
    printf '  %s\n' "$conflict"
  done < "$CONFLICTS"
  echo "  (remove-hosts.sh restores them)"
fi
echo
echo "Managed domains:"
for domain in "${CLEAN_DOMAINS[@]}"; do
  printf '  %s -> %s\n' "$domain" "$PROXY_IP"
done

echo
echo "Resolution check:"
for domain in "${CLEAN_DOMAINS[@]}"; do
  getent hosts "$domain" | head -n 1 || echo "  (no result for $domain)"
done
