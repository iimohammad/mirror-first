# پروکسی SNI

میرور فقط پکیج‌ها را می‌شناسد. برای بقیه‌ی HTTPS — `git clone`، دانلود از
گیت‌هاب، APIهای مدل‌های زبانی، هر هاست دیگر — این پروکسی هست.

TLS هیچ‌وقت باز نمی‌شود. پروکسی فقط فیلد SNI را از ClientHello می‌خواند و
کانکشن را دست‌نخورده forward می‌کند. یعنی گواهی مقصد به خود کلاینت می‌رسد و
هیچ‌چیز رمزگشایی نمی‌شود.

از [`sni-https-proxy`](https://github.com/iimohammad/sni-https-proxy) (MIT،
© Rio Antonio) آمده. اسکریپت‌های سمت کلاینت عیناً vendor شده‌اند در
`client/sni/`؛ سمت سرور به‌جای نصب مستقیم روی هاست، سرویس `sniproxy` در
`docker-compose.yml` است — چون این سرور همزمان میرور را هم می‌چرخاند و هر
دو ۴۴۳ می‌خواهند.

---

## چه کاری می‌کند و چه کاری نمی‌کند

| | |
|---|---|
| ✅ HTTPS روی ۴۴۳ | فقط همین |
| ❌ HTTP ساده روی ۸۰ | SNI ندارد |
| ❌ SSH (پورت ۲۲) | نه TLS است نه SNI — `git@github.com:` از پروکسی رد نمی‌شود |
| ❌ فیلتر بر اساس مسیر | لایه‌۴ است، مسیر را نمی‌بیند؛ فقط نام دامنه |
| ❌ کش | چیزی ذخیره نمی‌شود؛ برای کش، پکیج‌ها را از میرور بگیر |

نکته‌ی SSH مهم است: اگر ریموت گیتت `git@github.com:` باشد، گذاشتن
`github.com` در `/etc/hosts` باعث می‌شود گیت به پورت ۲۲ آن آی‌پی بزند که
چیزی رویش نیست و `git pull` هنگ می‌کند. یا ریموت را HTTPS کن، یا آن دامنه
را از فهرست بردار.

---

## ۱) روشن کردنش روی سرور میرور

سه خط، و هر سه با هم لازم‌اند — پروکسی صاحب ۴۴۳ می‌شود، پس nginx میرور باید
از آن پورت کنار برود:

```bash
cd /opt/mirror-first
cat >> .env <<'EOF'
COMPOSE_PROFILES=sni
MIRROR_SNI=1
MIRROR_HTTPS_BIND=127.0.0.1:8443
EOF

docker compose up -d
```

`deploy.sh` هر سه را با هم می‌نویسد، پس اگر با آن راه انداخته‌ای کاری لازم
نیست.

اگر DNS شبکه‌ی سرور خارج مشکل دارد (پروکسی برای پیدا کردن مقصدِ SNI به آن
نیاز دارد):

```bash
SNI_DNS1=9.9.9.9
SNI_DNS2=149.112.112.112
```

### چرا میرور از ۴۴۳ کنار می‌رود ولی همچنان روی ۴۴۳ جواب می‌دهد

پروکسی ۴۴۳ عمومی را می‌گیرد و بر اساس SNI تصمیم می‌گیرد:

```
کلاینت ──TLS──▶ ۴۴۳ (sniproxy)
                  ├─ SNI = دامنه‌های میرور  ─▶ کانتینر nginx میرور
                  └─ هر چیز دیگر            ─▶ همان هاست روی ۴۴۳ در اینترنت
```

پس از بیرون هیچ فرقی نمی‌کند: `https://mirror.example.com/panel` همچنان روی
۴۴۳ کار می‌کند. پورت ۸۴۴۳ فقط داخلی است.

برای اینکه nginx میرور آی‌پی *واقعی* کلاینت را ببیند (نه آی‌پی پروکسی را)،
پروکسی PROXY protocol می‌فرستد. بدون این، `acl.conf` عملاً همه را مجاز
می‌کرد — چون `$remote_addr` می‌شد آدرس خود پروکسی داخل `172.16.0.0/12`.

---

## ۲) مجاز کردن کلاینت‌ها

پیش‌فرض «همه ممنوع» است. این تنها دروازه‌ی واقعی است: چون پروکسی TLS را باز
نمی‌کند، هر کلاینتی که مجاز باشد می‌تواند **هر هاستی** را که خود سرور
می‌بیند صدا بزند. مجازها را قابل‌اعتماد بدان.

از پنل: `https://<MIRROR_DOMAIN>/panel` → صفحه‌ی **IPs**. هم `acl.conf`
(میرور) و هم `sni-allow.conf` (پروکسی) را می‌نویسد و nginx را ری‌لود می‌کند.

دستی، اگر پنل بالا نیست:

```bash
nano nginx/sni-allow.conf        # بالای «deny all;»:   allow 1.2.3.4;
docker compose exec sniproxy nginx -s reload
```

---

## ۳) رد دادن ترافیک از سمت کلاینت

سه راه دارد و کدامش را لازم داری بستگی دارد به اینکه چه چیزی درخواست
می‌زند.

### الف) کل سرور — `/etc/hosts`

```bash
sudo MIRROR_DOMAIN=mirror.example.com ./client/setup-all.sh
```

یا فقط بخش SNI، با فهرست دلخواه:

```bash
sudo bash client/sni/set-hosts.sh --proxy-ip <PROXY_IP> github.com api.github.com
sudo bash client/sni/set-hosts.sh --proxy-ip <PROXY_IP> --file client/sni/domains.sample.txt
```

بلاک مدیریت‌شده‌ی خودش را بازنویسی می‌کند، از فایل بکاپ می‌گیرد، و ورودی‌های
متعارضِ بالاتر را کامنت می‌کند (چون glibc اولین تطابق را برمی‌دارد و آن‌ها
بی‌سروصدا برنده می‌شدند). برداشتنش:

```bash
sudo bash client/sni/remove-hosts.sh
```

### ب) برنامه‌ای که خودش داخل داکر است — `extra_hosts`

**کانتینر `/etc/hosts` هاست را به ارث نمی‌برد.** این متداول‌ترین جایی است که
آدم گیر می‌کند: روی هاست تست می‌گیری و جواب می‌دهد، ولی برنامه همچنان
مستقیم می‌رود.

نمونه‌ی کامل: [`client/sni/docker-compose.extra-hosts.yml`](client/sni/docker-compose.extra-hosts.yml)

```yaml
services:
  api:
    extra_hosts:
      - "openrouter.ai:<PROXY_IP>"
```

بعد **بازبساز**، نه restart — `/etc/hosts` کانتینر فقط موقع ساخته‌شدن نوشته
می‌شود:

```bash
docker compose up -d api
docker compose exec api getent hosts openrouter.ai   # باید <PROXY_IP> بدهد
```

### ج) یک درخواست تکی — `curl --resolve`

بدون دست زدن به هیچ فایلی. برای تست بهترین راه است:

```bash
curl --noproxy '*' --resolve github.com:443:<PROXY_IP> \
  -sS -o /dev/null -w 'HTTP=%{http_code} ip=%{remote_ip}\n' \
  https://github.com/
```

`--noproxy '*'` لازم است: اگر `https_proxy` در محیط ست باشد، curl آن را بر
`--resolve` ترجیح می‌دهد و بدون اینکه اصلاً پروکسی SNI را ببیند PASS گزارش
می‌کند.

---

## ۴) وضعیت و عیب‌یابی

روی سرور میرور:

```bash
./sni-status.sh
```

پروفایل، سرویس، تست کانفیگ، مالک پورت ۴۴۳، allowlist فعال (از داخل
کانتینر، نه از فایل روی دیسک)، مقصدهای مسیریابی‌شده، و لاگ‌ها را می‌دهد.

از یک کلاینت:

```bash
bash client/sni/test-proxy.sh --proxy-ip <PROXY_IP> github.com registry-1.docker.io
```

| علامت | علت | کار |
|---|---|---|
| timeout | آی‌پی کلاینت در `sni-allow.conf` نیست | پنل ← IPs |
| `ip=` چیز دیگری | از پروکسی رد نشده | `/etc/hosts` یا `extra_hosts` را چک کن |
| `git pull` هنگ می‌کند | ریموت SSH است | `git remote set-url origin https://…` |
| برنامه‌ی داکری مستقیم می‌رود | `/etc/hosts` ارث نمی‌رسد | `extra_hosts` + `up -d` |
| پروکسی برای همه می‌خوابد | حلقه‌ی خودی | دامنه‌ی میرور باید در map باشد (تست پوششش می‌دهد) |

آن آخری یک بار واقعاً اتفاق افتاد: بدون خط صریح برای دامنه‌ی میرور، SNI
برابر `mirror.example.com` به DNS عمومی می‌رفت، به آی‌پی همین سرور می‌رسید و
پروکسی به خودش وصل می‌شد. یک درخواست کل `worker_connections` را می‌خورد.

---

## چه چیزی از مخزن اصلی نیامد

`proxy-server/install.sh` و `uninstall.sh` نصب مستقیم روی هاست بودند
(apt + systemd + `/etc/nginx/stream-conf.d/`). اینجا لازم نیستند و کارشان را
سرویس `sniproxy` انجام می‌دهد — با دو چیز اضافه که آن نسخه نداشت: زنجیره‌ی
PROXY protocol برای رسیدن آی‌پی واقعی به میرور، و گاردِ حلقه‌ی خودی.

`proxy-server/status.sh` به `sni-status.sh` تبدیل شد (همان سؤال‌ها، از
کانتینر به‌جای systemd).

تست‌ها آمدند: `tests/test-hosts.sh` روی همان اسکریپت‌های vendorشده اجرا
می‌شود و در CI است، تا یک ویرایش محلی روی `set-hosts.sh` بی‌سروصدا
`/etc/hosts` همه‌ی سرورهای ایران را خراب نکند.
