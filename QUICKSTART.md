# راهنمای سریع — وصل کردن یک سرور ایران

دو طرف دارد و ترتیبش مهم است: **اول** روی سرور میرور آی‌پی را مجاز می‌کنی،
**بعد** روی سرور ایران کلاینت‌ها را وصل می‌کنی. برعکسش، اسکریپت سمت کلاینت
روی سلامت‌سنجی می‌ایستد و جلوتر نمی‌رود.

---

## ۱) روی سرور ایران — آی‌پی عمومی‌اش را بگیر

```bash
curl -sS --noproxy '*' https://api.ipify.org; echo
```

---

## ۲) روی سرور میرور — مجازش کن

### راه اول: پنل (توصیه‌شده)

`https://<MIRROR_DOMAIN>/panel` → صفحه‌ی **IPs** → آی‌پی را اضافه کن.

هر دو فایل را با هم می‌نویسد (`acl.conf` برای میرور، `sni-allow.conf` برای
پروکسی) و nginx خودش ظرف چند ثانیه ری‌لود می‌کند. دستی چیزی لازم نیست.

### راه دوم: دستی

اگر پنل بالا نیست. `IP` را با آی‌پی قدم ۱ عوض کن:

```bash
cd /opt/mirror-first     # مسیر نصب
nano nginx/acl.conf      # داخل بلاک geo:   1.2.3.4/32   0;
nano nginx/sni-allow.conf # بالای «deny all;»:   allow 1.2.3.4;

docker compose exec nginx    nginx -s reload
docker compose exec sniproxy nginx -s reload
```

> `0` یعنی مجاز و `1` یعنی ممنوع — برعکس چیزی که انتظار داری. پیش‌فرض هر دو
> فایل «همه ممنوع» است.

---

## ۳) روی سرور ایران — وصلش کن

```bash
sudo apt-get install -y git
sudo git clone https://github.com/iimohammad/mirror-first.git /opt/mirror-first
cd /opt/mirror-first

sudo MIRROR_DOMAIN=<MIRROR_DOMAIN> ./client/setup-all.sh
```

یک دستور، هر دو کار: `apt`/`pip`/`npm`/`go`/`docker` را به میرور می‌بندد، و
دامنه‌های `client/sni/domains.sample.txt` را از پروکسی SNI رد می‌دهد.

اجرای دوباره‌اش بی‌خطر است.

**اختیاری:**

| متغیر | کار |
|---|---|
| `SKIP_SNI=1` | فقط میرور، بدون دست زدن به `/etc/hosts` |
| `SNI_DOMAINS="a.com b.com"` | به‌جای فهرست پیش‌فرض |
| `DISABLE_DEFAULT_SOURCES=1` | منابع پیش‌فرض apt را کنار می‌گذارد |

---

## ۴) تست

```bash
# میرور
sudo apt-get update

# پروکسی SNI — بدون دست زدن به /etc/hosts
curl --noproxy '*' --resolve github.com:443:<PROXY_IP> \
  -sS -o /dev/null -w 'HTTP=%{http_code} ip=%{remote_ip}\n' \
  https://github.com/
```

خروجی درست: `HTTP=200 ip=<PROXY_IP>`. اگر `ip` چیز دیگری بود، از پروکسی رد
نشده.

---

## ۵) عیب‌یابی

| علامت | علت | کار |
|---|---|---|
| `403` روی `/repository/…` | آی‌پی در `acl.conf` نیست | پنل → IPs |
| `403` روی `/` | `MIRROR_PANEL_OPEN` خاموش است | با `1` ریشه به `/panel` ریدایرکت می‌شود |
| timeout روی پروکسی | آی‌پی در `sni-allow.conf` نیست | پنل → IPs |
| `git pull` هنگ می‌کند | ریموت SSH است، پروکسی فقط ۴۴۳ | `git remote set-url origin https://github.com/…` |
| برنامه‌ی داکری مستقیم می‌رود | کانتینر `/etc/hosts` هاست را ارث نمی‌برد | `extra_hosts:` در compose خودش، بعد `up -d` (نه `restart`) |
| پنل در مرورگر باز نمی‌شود ولی `curl` می‌شود | ۳۰۸ کش‌شده | پنجره‌ی ناشناس |

---

## برداشتن

```bash
sudo bash /opt/mirror-first/client/sni/remove-hosts.sh   # فقط پروکسی SNI
```

میرور با ویرایش `/etc/apt/sources.list.d/`، `/etc/pip.conf` و
`~/.npmrc` برمی‌گردد — `setup-client.sh` از همه‌شان بکاپ گرفته.
