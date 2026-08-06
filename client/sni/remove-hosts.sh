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
# Entries set-hosts.sh commented out because they shadowed a managed domain.
DISABLED_PREFIX="#SNI-HTTPS-PROXY-DISABLED# "

die() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash remove-hosts.sh"
[[ -f "$HOSTS_FILE" ]] || die "Hosts file not found: $HOSTS_FILE"
[[ -w "$HOSTS_FILE" ]] || die "Hosts file is not writable: $HOSTS_FILE"

START_COUNT="$(grep -cFx "$START_MARKER" "$HOSTS_FILE" || true)"
END_COUNT="$(grep -cFx "$END_MARKER" "$HOSTS_FILE" || true)"
DISABLED_COUNT="$(grep -cF "$DISABLED_PREFIX" "$HOSTS_FILE" || true)"

if ((START_COUNT == 0 && END_COUNT == 0 && DISABLED_COUNT == 0)); then
  echo "No managed SNI proxy block found in $HOSTS_FILE. Nothing to do."
  exit 0
fi

if ((START_COUNT > 1 || END_COUNT > 1)); then
  die "$HOSTS_FILE contains ${START_COUNT} start and ${END_COUNT} end markers. Clean it up manually before re-running."
fi
if ((START_COUNT != END_COUNT)); then
  die "$HOSTS_FILE has a mismatched managed block (${START_COUNT} start marker(s), ${END_COUNT} end marker(s)). Repair it manually; refusing to edit so no entries are lost."
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
# -L so a symlinked /etc/hosts is backed up by content, not as another symlink.
cp -aL "$HOSTS_FILE" "$BACKUP"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# Drop the managed block, restore any entry we had commented out, and trim the
# trailing blank lines the block was padded with.
awk -v start="$START_MARKER" -v end="$END_MARKER" -v pfx="$DISABLED_PREFIX" '
  $0 == start { skip = 1; next }
  $0 == end   { skip = 0; next }
  skip        { next }
  {
    raw = $0
    if (substr(raw, 1, length(pfx)) == pfx) raw = substr(raw, length(pfx) + 1)
    lines[++n] = raw
  }
  END {
    last = 0
    for (i = 1; i <= n; i++) if (lines[i] ~ /[^[:space:]]/) last = i
    for (i = 1; i <= last; i++) print lines[i]
  }
' "$HOSTS_FILE" > "$TMP"

[[ -s "$TMP" ]] || die "Refusing to write an empty $HOSTS_FILE. It is unchanged; a backup is at $BACKUP."

cat "$TMP" > "$HOSTS_FILE"

echo "Removed managed SNI proxy entries from $HOSTS_FILE"
if ((DISABLED_COUNT > 0)); then
  echo "Restored ${DISABLED_COUNT} entry(ies) that had been commented out."
fi
echo "Backup: $BACKUP"
