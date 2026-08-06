#!/usr/bin/env bash
# Tests for client/sni/set-hosts.sh and client/sni/remove-hosts.sh.
#
# Vendored from https://github.com/iimohammad/sni-https-proxy (MIT).
# Copyright (c) 2026 Rio Antonio — see client/sni/LICENSE.
# Only the paths differ from upstream: client-server/ → client/sni/, and
# examples/domains.sample.txt → client/sni/domains.sample.txt.
#
# These live here because the scripts they cover are vendored copies. Without
# them, a local edit to set-hosts.sh would break /etc/hosts on every Iran
# server and nothing would catch it.
#
# Safe to run anywhere: everything happens in a temporary directory and the real
# /etc/hosts is never touched (the scripts honour $HOSTS_FILE).
#
#   sudo bash tests/test-hosts.sh
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

H="$WORK/hosts"
export HOSTS_FILE="$H"

SET="bash $REPO/client/sni/set-hosts.sh"
RM="bash $REPO/client/sni/remove-hosts.sh"

pass=0
fail=0

check() { # check <desc> <expected-exit> <actual-exit>
  if [[ "$2" -eq "$3" ]]; then
    echo "  PASS: $1"; pass=$((pass + 1))
  else
    echo "  FAIL: $1 (expected exit $2, got $3)"; fail=$((fail + 1))
  fi
}

expect() { # expect <desc> <expected> <actual>
  if [[ "$2" == "$3" ]]; then
    echo "  PASS: $1"; pass=$((pass + 1))
  else
    echo "  FAIL: $1"
    echo "    expected: [$2]"
    echo "    actual:   [$3]"
    fail=$((fail + 1))
  fi
}

contains() { # contains <desc> <needle> <haystack>
  case "$3" in
    *"$2"*) echo "  PASS: $1"; pass=$((pass + 1)) ;;
    *) echo "  FAIL: $1 (expected to find '$2' in: $3)"; fail=$((fail + 1)) ;;
  esac
}

base()    { printf '127.0.0.1 localhost\n10.0.0.5 my-nas.lan\n' > "$H"; }
managed() { sed -n '/BEGIN SNI/,/END SNI/p' "$H" | sed '1d;$d'; }

if [[ $EUID -ne 0 ]]; then
  echo "These tests must run as root (the scripts require it): sudo bash tests/test-hosts.sh" >&2
  exit 2
fi

echo "=============================================================="
echo "TEST 1: fresh add"
echo "=============================================================="
base
$SET --proxy-ip 1.2.3.4 github.com api.github.com >/dev/null 2>&1
check "exits 0" 0 $?
expect "managed entries written" "1.2.3.4 github.com
1.2.3.4 api.github.com" "$(managed)"
expect "pre-existing entries preserved" "127.0.0.1 localhost
10.0.0.5 my-nas.lan" "$(grep -v 'SNI\|1\.2\.3\.4' "$H" | grep -v '^$')"

echo
echo "=============================================================="
echo "TEST 2: idempotency across repeated runs"
echo "=============================================================="
base
for _ in 1 2 3 4 5; do $SET --proxy-ip 1.2.3.4 github.com >/dev/null 2>&1; done
expect "no blank-line growth after 5 runs" "127.0.0.1 localhost
10.0.0.5 my-nas.lan

# BEGIN SNI-HTTPS-PROXY MANAGED
1.2.3.4 github.com
# END SNI-HTTPS-PROXY MANAGED" "$(cat "$H")"
expect "exactly one managed block" "1" "$(grep -c 'BEGIN SNI' "$H")"

echo
echo "=============================================================="
echo "TEST 3: refuses to destroy data when the END marker is missing"
echo "=============================================================="
printf '127.0.0.1 localhost\n# BEGIN SNI-HTTPS-PROXY MANAGED\n1.2.3.4 github.com\n10.0.0.5 my-critical-service\n192.168.1.9 nas.lan\n' > "$H"
snapshot="$(cat "$H")"
$SET --proxy-ip 1.2.3.4 example.com >/dev/null 2>&1
check "set-hosts refuses" 1 $?
expect "hosts file untouched" "$snapshot" "$(cat "$H")"
$RM >/dev/null 2>&1
check "remove-hosts refuses too" 1 $?
expect "hosts file still untouched" "$snapshot" "$(cat "$H")"

echo
echo "=============================================================="
echo "TEST 4: refuses on duplicated markers"
echo "=============================================================="
printf '127.0.0.1 localhost\n# BEGIN SNI-HTTPS-PROXY MANAGED\n1.1.1.1 a.com\n# END SNI-HTTPS-PROXY MANAGED\n# BEGIN SNI-HTTPS-PROXY MANAGED\n2.2.2.2 b.com\n# END SNI-HTTPS-PROXY MANAGED\n' > "$H"
snapshot="$(cat "$H")"
$SET --proxy-ip 1.2.3.4 example.com >/dev/null 2>&1
check "refuses" 1 $?
expect "hosts file untouched" "$snapshot" "$(cat "$H")"

echo
echo "=============================================================="
echo "TEST 4b: refuses when the end marker sits above the start marker"
echo "=============================================================="
printf '127.0.0.1 localhost\n# END SNI-HTTPS-PROXY MANAGED\n1.1.1.1 keep-me.example.com\n# BEGIN SNI-HTTPS-PROXY MANAGED\n9.9.9.9 critical.example.com\n' > "$H"
snapshot="$(cat "$H")"
$SET --proxy-ip 1.2.3.4 github.com >/dev/null 2>&1
check "set-hosts refuses (marker counts alone are not enough)" 1 $?
expect "nothing after the start marker was deleted" "$snapshot" "$(cat "$H")"
$RM >/dev/null 2>&1
check "remove-hosts refuses too" 1 $?
expect "still untouched" "$snapshot" "$(cat "$H")"

echo
echo "=============================================================="
echo "TEST 4c: a symlinked hosts file is backed up by content"
echo "=============================================================="
rm -f "$H" "$WORK"/hosts.backup-*
printf '127.0.0.1 localhost\n' > "$WORK/real-hosts"
ln -sf "$WORK/real-hosts" "$H"
$SET --proxy-ip 1.2.3.4 github.com >/dev/null 2>&1
check "exits 0" 0 $?
newest_backup="$(find "$WORK" -name 'hosts.backup-*' | tail -n1)"
[[ -f "$newest_backup" && ! -L "$newest_backup" ]]
check "backup is a real file, not another symlink" 0 $?
expect "backup holds the pre-change content" "127.0.0.1 localhost" "$(cat "$newest_backup")"
rm -f "$H"; rm -f "$WORK"/hosts.backup-*

echo
echo "=============================================================="
echo "TEST 5: domain normalisation and validation"
echo "=============================================================="
base
$SET --proxy-ip 1.2.3.4 'HTTPS://GitHub.COM/some/path' 'api.github.com:443' 'raw.githubusercontent.com.' >/dev/null 2>&1
check "exits 0" 0 $?
expect "scheme, case, port, path and root dot normalised" "1.2.3.4 github.com
1.2.3.4 api.github.com
1.2.3.4 raw.githubusercontent.com" "$(managed)"

base
$SET --proxy-ip 1.2.3.4 github.com GitHub.com github.com >/dev/null 2>&1
expect "duplicates collapsed" "1.2.3.4 github.com" "$(managed)"

base
$SET --proxy-ip 1.2.3.4 xn--80ak6aa92e.xn--p1ai >/dev/null 2>&1
check "punycode/IDN TLD accepted" 0 $?

base
$SET --proxy-ip 1.2.3.4 'not a domain' >/dev/null 2>&1
check "space in domain rejected" 1 $?
$SET --proxy-ip 1.2.3.4 localhost >/dev/null 2>&1
check "single-label host rejected" 1 $?
$SET --proxy-ip 1.2.3.4 '-bad.example.com' >/dev/null 2>&1
check "leading-hyphen label rejected" 1 $?

echo
echo "=============================================================="
echo "TEST 6: proxy IP validation and loop guard"
echo "=============================================================="
base
$SET --proxy-ip 127.0.0.1 github.com >/dev/null 2>&1
check "loopback proxy IP rejected" 1 $?
$SET --proxy-ip 0.0.0.0 github.com >/dev/null 2>&1
check "0.0.0.0 rejected" 1 $?
$SET --proxy-ip 010.1.1.1 github.com >/dev/null 2>&1
check "leading-zero octet rejected" 1 $?
$SET --proxy-ip 300.1.1.1 github.com >/dev/null 2>&1
check "out-of-range octet rejected" 1 $?
$SET --proxy-ip '37.27.11.89.' github.com >/dev/null 2>&1
check "trailing-dot IP rejected (glibc would ignore the entry)" 1 $?
$SET --proxy-ip '1.2.3' github.com >/dev/null 2>&1
check "three-octet IP rejected" 1 $?
$SET --proxy-ip "$(printf '1.2.3.4\n    evil')" github.com >/dev/null 2>&1
check "multi-line IP rejected (validator must not stop at the newline)" 1 $?
$SET --proxy-ip 1.2.3.4 >/dev/null 2>&1
check "no domains rejected" 1 $?
$SET github.com >/dev/null 2>&1
check "missing --proxy-ip rejected" 1 $?
$SET --proxy-ip >/dev/null 2>&1
check "dangling --proxy-ip rejected" 1 $?

echo
echo "=============================================================="
echo "TEST 7: --file parsing (comments, CRLF, whitespace, quotes)"
echo "=============================================================="
base
printf '# comment line\r\n\r\n  github.com  \r\n api.github.com # trailing comment\r\n\r\nregistry.npmjs.org\r\n' > "$WORK/domains.txt"
$SET --proxy-ip 1.2.3.4 --file "$WORK/domains.txt" >/dev/null 2>&1
check "CRLF and comments parsed" 0 $?
expect "domains extracted cleanly" "1.2.3.4 github.com
1.2.3.4 api.github.com
1.2.3.4 registry.npmjs.org" "$(managed)"

base
printf "it's-a-quote.example.com\n" > "$WORK/quote.txt"
contains "unbalanced quote gives a clean error, not an xargs crash" \
  "Invalid domain" "$($SET --proxy-ip 1.2.3.4 --file "$WORK/quote.txt" 2>&1)"

base
printf 'foo\\bar.example.com\n' > "$WORK/backslash.txt"
$SET --proxy-ip 1.2.3.4 --file "$WORK/backslash.txt" >/dev/null 2>&1
check "backslash rejected, not silently stripped to foobar.example.com" 1 $?

base
$SET --proxy-ip 1.2.3.4 --file "$WORK/does-not-exist.txt" >/dev/null 2>&1
check "missing --file rejected" 1 $?

# A wildcard line must not be glob-expanded against the working directory.
base
mkdir -p "$WORK/globdir" && cd "$WORK/globdir" || exit 1
touch attacker-1.com attacker-2.com
printf '*.com\n' > "$WORK/glob.txt"
$SET --proxy-ip 1.2.3.4 --file "$WORK/glob.txt" >/dev/null 2>&1
check "wildcard line rejected, not expanded to local filenames" 1 $?
expect "no filename leaked into the hosts file" "0" "$(grep -c 'attacker' "$H")"
cd "$REPO" || exit 1

base
printf '\xef\xbb\xbfgithub.com\n' > "$WORK/bom.txt"
$SET --proxy-ip 1.2.3.4 --file "$WORK/bom.txt" >/dev/null 2>&1
check "UTF-8 BOM tolerated" 0 $?

echo
echo "=============================================================="
echo "TEST 8: the shipped sample file parses"
echo "=============================================================="
base
$SET --proxy-ip 1.2.3.4 --file "$REPO/client/sni/domains.sample.txt" >/dev/null 2>&1
check "client/sni/domains.sample.txt accepted" 0 $?
expect "every sample domain written" \
  "$(grep -cve '^\s*#' -e '^\s*$' "$REPO/client/sni/domains.sample.txt")" "$(managed | wc -l)"

echo
echo "=============================================================="
echo "TEST 9: remove-hosts"
echo "=============================================================="
base
$SET --proxy-ip 1.2.3.4 github.com >/dev/null 2>&1
$RM >/dev/null 2>&1
check "exits 0" 0 $?
expect "back to the original content" "127.0.0.1 localhost
10.0.0.5 my-nas.lan" "$(cat "$H")"
$RM >/dev/null 2>&1
check "idempotent when there is nothing to remove" 0 $?
contains "reports that there was nothing to do" "Nothing to do" "$($RM 2>&1)"

echo
echo "=============================================================="
echo "TEST 9b: a shadowing entry above the block is disabled and restored"
echo "=============================================================="
printf '127.0.0.1 localhost\n203.0.113.99 github.com\n198.51.100.7 unrelated.example.com\n' > "$H"
out="$($SET --proxy-ip 1.2.3.4 github.com 2>&1)"
check "exits 0" 0 $?
expect "shadowing entry commented out, others untouched" "127.0.0.1 localhost
#SNI-HTTPS-PROXY-DISABLED# 203.0.113.99 github.com
198.51.100.7 unrelated.example.com

# BEGIN SNI-HTTPS-PROXY MANAGED
1.2.3.4 github.com
# END SNI-HTTPS-PROXY MANAGED" "$(cat "$H")"
contains "the conflict is reported" "203.0.113.99 github.com" "$out"

$SET --proxy-ip 1.2.3.4 github.com >/dev/null 2>&1
expect "re-running does not double the disable prefix" "1" "$(grep -c 'SNI-HTTPS-PROXY-DISABLED' "$H")"

$RM >/dev/null 2>&1
expect "remove-hosts restores the original entry" "127.0.0.1 localhost
203.0.113.99 github.com
198.51.100.7 unrelated.example.com" "$(cat "$H")"

echo
echo "=============================================================="
echo "TEST 10: hosts file with no trailing newline"
echo "=============================================================="
printf '127.0.0.1 localhost' > "$H"
$SET --proxy-ip 1.2.3.4 github.com >/dev/null 2>&1
check "exits 0" 0 $?
expect "last line not merged into the marker" "127.0.0.1 localhost

# BEGIN SNI-HTTPS-PROXY MANAGED
1.2.3.4 github.com
# END SNI-HTTPS-PROXY MANAGED" "$(cat "$H")"

echo
echo "=============================================================="
echo "TEST 11: backups and permissions"
echo "=============================================================="
base
chmod 644 "$H"
$SET --proxy-ip 1.2.3.4 github.com >/dev/null 2>&1
[[ $(find "$WORK" -name 'hosts.backup-*' | wc -l) -ge 1 ]]
check "a backup file was written" 0 $?
expect "hosts file keeps its permissions" "644" "$(stat -c '%a' "$H")"

echo
echo "=============================================================="
echo "RESULT: $pass passed, $fail failed"
echo "=============================================================="
[[ "$fail" -eq 0 ]]
