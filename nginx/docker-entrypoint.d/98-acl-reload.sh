#!/bin/sh
# ---------------------------------------------------------------------------
# پنل (/panel/ips) مستقیم روی همین فایل host-bind-mount شده می‌نویسد. nginx
# بلاک geo را فقط در بوت/reload می‌خواند، پس بدون این حلقه تغییرات پنل تا
# reload دستی اثر نمی‌کند. الگویش عین 99-cert-reload.sh است، فقط با فاصله‌ی
# کوتاه‌تر چون تغییر IP باید سریع اثر کند، نه هر ۱۲ ساعت.
#
# md5sum از busybox coreutils می‌آید و توی nginx:alpine از قبل هست — نیازی
# به نصب inotify-tools نیست.
#
# همین اسکریپت در سرویس sniproxy هم استفاده می‌شود؛ آنجا فایلی که باید پاییده
# شود allowlist خود پروکسی است، پس مسیر از ACL_WATCH_FILE می‌آید.
# ---------------------------------------------------------------------------
ACL_FILE="${ACL_WATCH_FILE:-/etc/nginx/conf.d/00-acl.conf}"

( last=""
  while :; do
    cur=$(md5sum "$ACL_FILE" 2>/dev/null)
    if [ -n "$last" ] && [ "$cur" != "$last" ]; then
      nginx -s reload 2>/dev/null || true
    fi
    last="$cur"
    sleep 5
  done ) &
