# راهنمای دیپلوی

از صفر تا میرور کارکرده روی VPS خارج، بعد وصل کردن سرورهای ایران، بعد
کارهای روزمره‌ای که اگر انجام ندهی چند ماه بعد به مشکل می‌خوری.

---

## ۰. چیدمان مخزن

```
docker-compose.yml            استک: nexus + nginx + certbot + panel
deploy.sh                     همه‌ی زیر را پشت‌سرهم می‌زند              (روی سرور خارج)
bootstrap.sh                  گواهی TLS + بالا آوردن استک        (روی سرور خارج)
provision.sh                  ساخت ریپوهای proxy + group          (روی سرور خارج)
provision-hosted.sh           ریپوهای hosted + کاربر deployer     (روی سرور خارج)
client/setup-all.sh           میرور + پروکسی SNI با یک دستور       (روی سرورهای ایران)
client/setup-client.sh        فقط کلاینت‌های پکیج                  (روی سرورهای ایران)
client/sni/                   اسکریپت‌های /etc/hosts پروکسی SNI     (vendor از sni-https-proxy، MIT)
nginx/acl.conf                allowlist آی‌پی — اولین بار دستی، بعد از پنل
nginx/templates/              کانفیگ nginx (envsubst روی ${MIRROR_*}) — شامل لایه‌ی کش
nginx/optional/               کانکتور push داکر، پیش‌فرض غیرفعال
nginx/sni-templates/          کانفیگ پروکسی SNI (اختیاری، پروفایل sni)
nginx/sni-allow.conf          allowlist پروکسی SNI — پنل می‌سازدش
panel/                        اپ مدیریت IP/پکیج‌ها روی /panel/    (خودش build می‌شود)
```

مسیرها در `docker-compose.yml` هاردکد شده‌اند؛ فایل‌ها را جابه‌جا نکن.

---

## ۱. پیش‌نیاز سرور خارج

| مورد | حداقل | توضیح |
|---|---|---|
| رم | ۶ گیگ | ۸ توصیه می‌شود. پیش‌فرض JVM در `docker-compose.yml` برای ۸ گیگ کالیبره شده (heap+direct=۵.۴ گیگ)؛ روی رم کمتر `NEXUS_JVM_ARGS`/`NEXUS_MEM_LIMIT` را در `.env` کم کن. |
| دیسک | ۱۰۰ گیگ | کش داکر سریع بزرگ می‌شود. |
| CPU | ۲ هسته | |
| پورت باز | ۸۰ و ۴۴۳ | ۸۰ برای ACME لازم است، حتی اگر همه‌چیز روی ۴۴۳ باشد. |

دو رکورد A به IP سرور:

```
mirror.example.com         → 1.2.3.4
docker.mirror.example.com  → 1.2.3.4
```

قبل از ادامه، پخش شدن DNS را چک کن — اگر هنوز پخش نشده باشد،
Let's Encrypt گواهی نمی‌دهد و به سقف نرخ خطای آن می‌خوری:

```bash
dig +short mirror.example.com
dig +short docker.mirror.example.com
```

نصب داکر روی سرور خارج (این یکی مستقیم، چون هنوز میروری نداری):

```bash
curl -fsSL https://get.docker.com | sh
```

---

## ۲. دیپلوی

```bash
git clone <repo> && cd mirror-first
./deploy.sh
```

اگر `.env` نباشد، `deploy.sh` خودش می‌سازدش و فقط دامنه و ایمیل را می‌پرسد
(`PANEL_SESSION_SECRET` را خودش می‌سازد). بعد پشت‌سرهم `bootstrap.sh` →
`provision.sh` → `provision-hosted.sh` را می‌زند و رمز اولیه‌ی `admin` را
خودش برای provisioning می‌گیرد — چیزی برای copy/paste دستی نمی‌ماند به‌جز
IP allowlist. اجرای دوباره‌اش بی‌خطر است.

اگر ترجیح می‌دهی هر قدم را جدا و با کنترل بیشتر بزنی:

```bash
cp .env.example .env && nano .env     # MIRROR_DOMAIN، LETSENCRYPT_EMAIL، اکانت داکرهاب
openssl rand -hex 32                  # نتیجه را PANEL_SESSION_SECRET= در .env بگذار
nano nginx/acl.conf                   # ⬅️ IP سرورهای ایرانت را اضافه کن (اجباری)

./bootstrap.sh                        # گواهی TLS + بالا آوردن استک (پنل هم همراهش build می‌شود)
./provision.sh                        # ریپوهای proxy و group
./provision-hosted.sh                 # اگر می‌خواهی پکیج خودت را هم منتشر کنی
```

اگر `PANEL_SESSION_SECRET` را خالی بگذاری، بقیه‌ی استک (nexus/nginx/certbot)
طبیعی بالا می‌آید — فقط کانتینر `panel` با پیام واضح در
`docker compose logs panel` crash-loop می‌کند تا وقتی درستش کنی. پنل
اختیاری است، هیچ‌کدام از اسکریپت‌های دیگر به آن وابسته نیستند.

`bootstrap.sh` (چه مستقیم چه از داخل `deploy.sh`) اگر ببیند در `acl.conf`
هیچ IP ای اضافه نکرده‌ای هشدار می‌دهد. جدی بگیرش: بدون آن همه‌چیز بالا
می‌آید ولی هر درخواستی ۴۰۳ می‌گیرد.

هر سه اسکریپت idempotent هستند — اجرای دوباره‌شان چیزی را خراب نمی‌کند و
ریپوهای موجود را رد می‌کند.

`provision-hosted.sh` رمز کاربر `deployer` را **یک بار** چاپ می‌کند. همان‌جا
ذخیره‌اش کن؛ اجرای بعدی می‌گوید «از قبل هست» و رمز جدید نمی‌سازد.

### بعد از دیپلوی، در پنل

وارد `https://mirror.example.com` شو با `admin` و رمزی که `bootstrap.sh` چاپ کرد.

1. **رمز admin را عوض کن.** بعدش:
   ```bash
   docker compose exec nexus rm -f /nexus-data/admin.password
   ```
2. **Administration → System → Capabilities → Base URL**
   = `https://mirror.example.com/`
   بدون این، Nexus در ایندکس‌ها لینک `localhost:8081` می‌دهد و pip گیج می‌شود.
3. **Cleanup Policy** بساز (بخش ۵ همین فایل) — وگرنه دیسک پر می‌شود.

---

## ۳. تست دود

روی یکی از سرورهای ایران که IP اش در allowlist هست:

```bash
# ۱) اصلاً می‌رسیم؟ (۲۰۰ یعنی allowlist درست است، ۴۰۳ یعنی IP اضافه نشده)
curl -sS -o /dev/null -w '%{http_code}\n' https://mirror.example.com/service/rest/v1/status

# ۲) pypi از طریق group
curl -sS https://mirror.example.com/repository/pypi-group/simple/requests/ | head -3

# ۳) داکر
docker pull docker.mirror.example.com/library/alpine:3.20

# ۴) واقعاً از میرور آمد یا مستقیم؟
docker compose logs nginx | tail -20     # روی سرور خارج
```

اگر ۴۰۳ گرفتی، اول IP خروجی سرور ایران را چک کن (نه IP داخلی‌اش):

```bash
curl -sS https://ifconfig.me      # این IP باید در nginx/acl.conf باشد
```

بعد از ویرایش `acl.conf`:

```bash
docker compose restart nginx
```

---

## ۴. وصل کردن سرورهای ایران

```bash
sudo MIRROR_DOMAIN=mirror.example.com ./client/setup-client.sh all
```

`all` شامل `docker apt pip npm go git` است. `containerd` عمداً داخلش نیست چون
به ویرایش دستی `/etc/containerd/config.toml` هم نیاز دارد؛ جدا صدایش بزن:

```bash
sudo MIRROR_DOMAIN=mirror.example.com ./client/setup-client.sh containerd
```

### دو نکته که آدم را گول می‌زنند

**apt.** اضافه شدن `mirror.sources` منابع پیش‌فرض را غیرفعال نمی‌کند. تا وقتی
`/etc/apt/sources.list.d/ubuntu.sources` سر جایش باشد، apt همچنان مستقیم هم
می‌زند و فکر می‌کنی میرور کار نمی‌کند. برای اینکه واقعاً همه‌چیز از میرور بیاید:

```bash
sudo MIRROR_DOMAIN=... DISABLE_DEFAULT_SOURCES=1 ./client/setup-client.sh apt
```

**docker.** تنظیم `registry-mirrors` **فقط برای داکرهاب** کار می‌کند — این
محدودیت خود داکر است، نه Nexus. برای بقیه‌ی رجیستری‌ها باید اسم ایمیج را عوض کنی:

```bash
docker pull ghcr.io/astral-sh/uv:latest              # ❌ از میرور رد نمی‌شود
docker pull docker.mirror.example.com/astral-sh/uv:latest   # ✅
```

روی k8s این مشکل نیست؛ `hosts.toml` کانتینردی per-registry mirror را درست
پشتیبانی می‌کند.

### انتقال اسکریپت به سرور ایران

اسکریپت را **paste نکن** — متن چندخطی با کامنت فارسی داخل ترمینال به هم
می‌ریزد و نصفه اجرا می‌شود. فایل را منتقل کن:

```bash
# از سرور خارج:
scp client/setup-client.sh user@IRAN_SERVER:/tmp/
```

یا از خود میرور بگیرش (اگر IP آن سرور در allowlist هست) — همان `raw-ghusercontent`:

```bash
curl -fsSL -o /tmp/setup-client.sh \
  https://mirror.example.com/repository/raw-ghusercontent/OWNER/REPO/main/client/setup-client.sh
head -1 /tmp/setup-client.sh     # باید #!/usr/bin/env bash باشد
```

---

## ۴.۵. پروکسی SNI (اختیاری) — برای git clone و هر HTTPS دیگر

میرور فقط پکیج را کش می‌کند؛ `git clone` را پروکسی نمی‌کند (Nexus سرور گیت
نیست). سرویس `sniproxy` این سوراخ را می‌بندد: یک passthrough بر پایه‌ی SNI که
TLS را باز نمی‌کند و فقط بر اساس نام میزبانِ داخل ClientHello، کانکشن را به
همان مقصد forward می‌کند.

**روشن کردنش** — هر دو خط در `.env`، چون پروکسی صاحب ۴۴۳ می‌شود و nginx
میرور باید از آن پورت کنار برود:

```bash
COMPOSE_PROFILES=sni
MIRROR_SNI=1
MIRROR_HTTPS_BIND=127.0.0.1:8443
```

`MIRROR_SNI=1` جدا از پروفایل لازم است: به nginx میرور می‌گوید ترافیک با
PROXY protocol می‌آید. بدون آن، `$remote_addr` خودِ پروکسی می‌شود و
`acl.conf` عملاً هیچ‌کس را فیلتر نمی‌کند.

سپس:

```bash
docker compose up -d
```

همین. حالا `docker compose ps` پنج سرویس نشان می‌دهد و پورت ۴۴۳ دست
`sniproxy` است. دامنه‌های میرور (`mirror.`، `docker.`، `push.`) داخل شبکه‌ی
داکر به nginx میرور می‌روند و بقیه به اینترنت. پورت ۸۰ دست‌نخورده پیش میرور
می‌ماند، پس تمدید گواهی ACME عوض نمی‌شود.

**allowlist** همان `/panel/ips` است — پنل حالا هر دو فایل را با هم می‌نویسد
(`nginx/acl.conf` برای میرور، `nginx/sni-allow.conf` برای پروکسی) و هر دو
nginx ظرف ۵ ثانیه reload می‌شوند.

**آی‌پی واقعی کلاینت حفظ می‌شود.** پروکسی به هر دو مقصد PROXY protocol
می‌فرستد؛ nginx میرور آن را می‌خواند (`MIRROR_SNI=1`) و برای passthrough یک
server داخلی دوم هدر را باز می‌کند، allowlist را روی آی‌پی واقعی اعمال
می‌کند، و کانکشن تمیز را به اینترنت می‌فرستد. این دولایه لازم است چون nginx
`proxy_protocol` را فقط ثابت (`on`/`off`) قبول می‌کند و هاست‌های اینترنتی این
پروتکل را نمی‌فهمند — پس نمی‌شد آن را «فقط برای مقصد لوکال» روشن کرد.

**روی سرور ایران** لازم نیست کاری جدا بکنی — `client/setup-all.sh` هم کلاینت‌های
پکیج را به میرور وصل می‌کند و هم دامنه‌ها را از پروکسی رد می‌دهد:

```bash
sudo MIRROR_DOMAIN=mirror.example.com DISABLE_DEFAULT_SOURCES=1 ./client/setup-all.sh
```

IP پروکسی را خودش از روی `MIRROR_DOMAIN` حل می‌کند (همان سرور است). قبل از
دست زدن به `/etc/hosts` یک تست سلامت می‌زند و اگر پروکسی جواب ندهد — مثلاً
چون IP این سرور هنوز در allowlist نیست — همان‌جا با پیام روشن متوقف می‌شود
به‌جای اینکه `/etc/hosts` را نصفه عوض کند و گیت را بخواباند.

متغیرهای مفید:

| متغیر | کار |
|---|---|
| `SKIP_SNI=1` | فقط میرور، بدون دست زدن به `/etc/hosts` |
| `SNI_DOMAINS="a.com b.com"` | به‌جای فهرست پیش‌فرض `client/sni/domains.sample.txt` |
| `PROXY_IP=1.2.3.4` | اگر تشخیص خودکار درست نبود |

برای برگرداندن `/etc/hosts` به حالت اول:

```bash
sudo bash client/sni/remove-hosts.sh
```

⚠️ دامنه‌های خود میرور را هرگز در فهرست `/etc/hosts` نگذار — بی‌فایده است و
می‌تواند لوپ بسازد.

برای apt/pip/npm/docker از میرور استفاده کن، نه پروکسی — کش میرور سریع‌تر است.
فهرست پیش‌فرض دامنه‌ها آن‌ها را هم دارد، که به‌عنوان fallback بد نیست: اگر میرور
پایین باشد، `docker pull` به‌جای شکستن از پروکسی رد می‌شود.

اسکریپت‌های `client/sni/` از
[sni-https-proxy](https://github.com/iimohammad/sni-https-proxy) (MIT،
© Rio Antonio) vendor شده‌اند تا روی سرور ایران فقط یک مخزن لازم باشد؛ متن
لایسنسشان در `client/sni/LICENSE` است. سمت سرورِ آن پروژه استفاده نمی‌شود —
جایش را سرویس `sniproxy` در همین compose گرفته.

---

## ۴.۶. باز کردن پنل برای همه‌ی IPها

allowlist برای مخازن منطقی است، ولی برای پنل اذیت‌کننده می‌شود: IP خانگی یا
VPN مدام عوض می‌شود و تو را از پنل خودت بیرون می‌گذارد — و چون پنل خودش پشت
همان allowlist است، نمی‌توانی از داخلش IP جدید را اضافه کنی.

```bash
MIRROR_PANEL_OPEN=1
```

از این به بعد `/panel` از allowlist مستثناست. `/repository/…` و بقیه دست‌نخورده
بسته می‌مانند.

اگر پروکسی SNI روشن است، `MIRROR_SNI=1` را هم بگذار (که برای درست کار کردن
allowlist لازم است، مستقل از پنل). آن‌وقت پروکسی PROXY protocol می‌فرستد،
nginx آی‌پی واقعی کلاینت را می‌بیند، و همه‌چیز روی همان ۴۴۳ کار می‌کند — نه
پورت جدید، نه رکورد DNS، نه باز کردن فایروال:

```bash
COMPOSE_PROFILES=sni
MIRROR_SNI=1
MIRROR_PANEL_OPEN=1
```

| آدرس | دسترسی |
|---|---|
| `https://<domain>/panel/` | برای همه باز |
| `https://<domain>/repository/…` | پشت `acl.conf` (آی‌پی واقعی) |
| هر SNI دیگر (passthrough) | پشت `sni-allow.conf` (آی‌پی واقعی) |

**چه چیزی پشت پنل می‌ماند:** لاگین با یوزر/پس ادمین نکسس، به‌علاوه‌ی سهمیه‌ی
سخت‌گیرانه روی `/panel/login` (پیش‌فرض ۲۰ در دقیقه، burst ۱۰ — تست‌شده: تلاش
یازدهم به بعد `429` می‌گیرد، ولی دارایی‌های استاتیک پنل محدود نمی‌شوند). رمز
ادمین نکسس را قوی نگه دار؛ حالا از اینترنت قابل تلاش است.

اگر ترجیح می‌دهی هیچ‌چیز باز نشود، جایگزین بدون تغییر کانفیگ، تونل SSH از یک
سرور مجاز است:

```bash
ssh -L 9443:<domain>:443 user@<allowed-server>
# بعد: https://localhost:9443/panel/  (هشدار TLS را قبول کن)
```

---

## ۵. کارهای روزمره

### دیسک — مهم‌ترین کاری که فراموش می‌شود

کش داکر بدون سیاست پاک‌سازی تا پر شدن دیسک رشد می‌کند. دو مرحله است و اگر
مرحله‌ی دوم را نزنی فضا آزاد **نمی‌شود**:

1. **Administration → Repository → Cleanup Policies** — سیاست بساز
   (مثلاً «آخرین دانلود بیش از ۹۰ روز پیش») و به ریپوهای proxy وصلش کن.
2. **Administration → System → Tasks** — این دو را زمان‌بندی کن:
   - `Admin - Cleanup repositories using their associated policies`
   - `Admin - Compact blob store`

مرحله‌ی ۱ فقط فایل‌ها را «حذف‌شده» علامت می‌زند؛ فضا را مرحله‌ی ۲ آزاد می‌کند.

پایش:

```bash
df -h
docker system df -v | grep -E 'nexus_data|nginx_cache'
```

کش nginx (والیوم `nginx_cache`) والیوم دومی است و سقف خودش را دارد:
`MIRROR_CACHE_MAX_SIZE` در `.env`، پیش‌فرض ۲۰ گیگ. خودش وقتی پر شود
قدیمی‌ترین‌ها را دور می‌ریزد، پس دیسک را پر نمی‌کند — فقط موقع اندازه‌گیری
فضا حسابش کن. هر دو در صفحه‌ی `/panel/disk` هم دیده می‌شوند.

### بکاپ

همه‌چیز در والیوم `nexus_data` است — هم کانفیگ، هم دیتابیس، هم بلاب‌ها.

```bash
docker compose stop nexus          # نکن‌اش زنده، دیتابیس ممکن است ناسازگار بکاپ شود
docker run --rm -v nexus-mirror_nexus_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/nexus-$(date +%F).tar.gz -C /data .
docker compose start nexus
```

اگر بکاپِ کل بلاب‌ها بزرگ است، فقط `db/` و `etc/` را بردار — کش پکیج‌ها
دوباره از upstream ساخته می‌شود، فقط اولین بار کند است.

### به‌روزرسانی Nexus

Nexus سابقه‌ی CVE جدی دارد؛ نسخه را قدیمی نگه ندار.

```bash
# بکاپ بگیر (بالا)، بعد:
nano .env                  # NEXUS_VERSION را بالا ببر
docker compose pull nexus
docker compose up -d nexus
docker compose logs -f nexus
```

⚠️ **مرز ۳.۷۱:** خط `3.70.x` روی OrientDB است. از `3.71` به بعد دیتابیس
H2/PostgreSQL است و باید `NEXUS_DATASTORE_ENABLED: "true"` را در
`docker-compose.yml` از کامنت دربیاوری. این یک مهاجرت یک‌طرفه است — قبلش
حتماً بکاپ.

### گواهی TLS

`certbot` هر ۱۲ ساعت `renew` می‌زند و nginx هم هر ۱۲ ساعت reload می‌شود
(`nginx/docker-entrypoint.d/99-cert-reload.sh`)، پس تمدید خودکار است.
چک کردن:

```bash
docker compose run --rm --entrypoint certbot certbot certificates
echo | openssl s_client -connect mirror.example.com:443 2>/dev/null \
  | openssl x509 -noout -dates
```

### لاگ

```bash
docker compose logs -f --tail=100 nginx
docker compose logs -f --tail=100 nexus
```

سقف لاگ در compose روی ۱۰ مگ × ۳ فایل بسته شده، پس لاگ دیسک را پر نمی‌کند.

---

## ۶. سقف‌ها و share کردن میرور

تا وقتی میرور فقط برای سرورهای خودت است، معمولاً به هیچ سقفی نمی‌خوری. مشکل
از جایی شروع می‌شود که سرویس را با چند تیم share می‌کنی. سه سقفِ کاملاً
مستقل وجود دارد؛ هرکدام راه‌حل خودش را دارد و اشتباه گرفتنشان وقت تلف می‌کند.

### سقف ۱ — درخواست روزانه‌ی نکسس (Community Edition)

از نسخه‌ی **۳.۷۷ به بعد** نسخه‌ی رایگان نکسس «Community Edition» است، با دو
سقف سخت:

| سقف | مقدار |
|---|---|
| کامپوننت | ۴۰٬۰۰۰ |
| درخواست به `/repository*/` | ۱۰۰٬۰۰۰ در روز |

«درخواست» یعنی هر HTTP ای که به ریپو بخورد: دانلود، آپلود، خواندن متادیتا،
جستجو — و درخواست‌های **ناموفق** هم شمرده می‌شوند. مقیاسش را دست‌کم نگیر:

- یک `docker pull` = یک ping + یک manifest + یک درخواست به ازای **هر لایه**.
  یک ایمیج معمولی به‌تنهایی ۱۵ تا ۳۰ درخواست است.
- یک `npm ci` روی یک پروژه‌ی متوسط = چند صد درخواست.
- یک `apt update` روی ۱۰ سرور = ۱۰ برابر همان تعداد فایل ایندکس.

وقتی از سقف رد شوی نکسس **افزودن کامپوننت جدید را می‌بندد** — یعنی هرچه از
قبل کش شده سرو می‌شود ولی هر چیز تازه‌ای ۴۰۳/خطا می‌گیرد. برای یک میرور
مشترک این یعنی «همه‌ی بیلدها از فردا صبح می‌شکنند».

> این ریپو پیش‌فرض روی `3.70.1` است که **قبل از** ۳.۷۷ است، پس هیچ‌کدام از
> این سقف‌ها را ندارد. اما روی آن نمان: نکسس سابقه‌ی CVE جدی دارد و خود
> Sonatype هم ماندن روی نسخه‌ی قدیمی را فقط «موقتاً» توصیه می‌کند. برنامه‌ی
> واقعی این است که به‌روزرسانی کنی و با کش زیر سقف بمانی. ضمناً این اعداد
> یک بار (از ۱۰۰٬۰۰۰ کامپوننت / ۲۰۰٬۰۰۰ درخواست) کم شده‌اند، پس قبل از
> تکیه کردن روی آن‌ها، مستند نسخه‌ای که نصب می‌کنی را بخوان.

**راه‌حل: کش nginx جلوی نکسس.** هر آدرسی که «تغییرناپذیر» است (محتوایش تابع
محضِ URL است) در nginx کش می‌شود و درخواست دومش اصلاً به نکسس نمی‌رسد — پس
در شمارش روزانه هم نمی‌آید. روی میرور مشترک، بیشترِ ترافیک دقیقاً همین است:
چند سرور همان ایمیج پایه و همان wheelها را می‌کشند.

| کش می‌شود | کش **نمی‌شود** |
|---|---|
| لایه‌ی داکر (`blobs/sha256:…`) | `tags/list`، `_catalog` |
| manifest با digest | — |
| manifest با تگ (TTL کوتاه، پیش‌فرض ۱ دقیقه) | — |
| wheel، sdist، tarball نpm، `.deb`، `.rpm`، jar، crate | صفحه‌ی `simple/` پایتون، packument نpm |
| `.info`/`.mod`/`.zip` ماژول گو | `@v/list`، `@latest` |
| ایندکس‌های `by-hash` اپت | `InRelease`، `Release`، `Packages` |
| فایل ریلیز گیت‌هاب | `raw-ghusercontent`، `archive/refs/heads/…` |

متادیتاها عمداً کش نمی‌شوند، چون زیر همان آدرس عوض می‌شوند — اگر `Release`
کش‌شده با `Packages` تازه نخواند، `apt` با «Hash Sum mismatch» می‌ترکد.

تنظیمات در `.env` است (`MIRROR_CACHE_MAX_SIZE`، `MIRROR_IMMUTABLE_TTL`،
`MIRROR_DOCKER_TAG_TTL` و…). فایل‌های مربوطه: `nginx/templates/10-cache.conf.template`
و `92-cache.inc.template`.

**چک کردن اینکه واقعاً کار می‌کند** — هدر `X-Mirror-Cache` را ببین. بار اول
`MISS`، بار دوم `HIT`:

```bash
URL=https://mirror.example.com/repository/pypi-group/packages/…/foo-1.0.whl
curl -sI "$URL" | grep -i x-mirror-cache   # MISS
curl -sI "$URL" | grep -i x-mirror-cache   # HIT
```

**نرخ hit و تعداد درخواستی که واقعاً به نکسس می‌رسد** (لاگ nginx ستون
`cache=` دارد):

```bash
# سهم HIT / MISS / بدون کش در ۱۰۰۰ خط آخر
docker compose logs --tail=1000 nginx | grep -o 'cache=[A-Z-]*' | sort | uniq -c | sort -rn

# چند درخواست امروز به /repository رفته و چندتایش از کش آمده
docker compose logs --since 24h nginx | grep '/repository' | grep -c 'cache=HIT'
docker compose logs --since 24h nginx | grep '/repository' | grep -cv 'cache=HIT'
```

عدد دوم است که با سقف ۱۰۰٬۰۰۰ مقایسه می‌شود. اگر بالا بود، اول ببین کدام
مسیرها MISS می‌خورند؛ معمولاً یا متادیتا است (طبیعی) یا یک کلاینت خراب.

خالی کردن کش (بی‌خطر است، فقط اولین درخواست‌ها کند می‌شوند):

```bash
docker compose exec nginx sh -c 'rm -rf /var/cache/mirror/cache/*'
docker compose exec nginx nginx -s reload
```

بعد از هر دست بردن به کانفیگ nginx، قبل از reload تستش کن:

```bash
docker compose exec nginx nginx -t
```

### سقف ۲ — تعداد کامپوننت (۴۰٬۰۰۰)

این را کش حل نمی‌کند؛ کامپوننت در خود نکسس انباشته می‌شود. تنها راهش
Cleanup Policy است — همان کاری که برای دیسک هم لازم است (بخش ۵). برای یک
میرور مشترک، سیاست «آخرین دانلود بیش از ۳۰ روز پیش» را روی همه‌ی ریپوهای
proxy بگذار و تسکش را روزانه زمان‌بندی کن.

نکته‌ی خوب: حالا که کش nginx جلوی نکسس است، می‌توانی سیاست پاک‌سازی را
تهاجمی‌تر ببندی بدون اینکه کندی محسوسی حس شود — چیزهای داغ از nginx می‌آیند،
نه از بلاب‌استور.

شمارش فعلی را در `Administration → System → Usage Center` (روی ۳.۷۷+) یا از
صفحه‌ی **پکیج‌ها**ی پنل ببین.

### سقف ۳ — سقف pull خود داکرهاب

این ربطی به نکسس ندارد و با share کردن حتماً به آن می‌خوری، چون از دید
داکرهاب همه‌ی تیم‌ها یک آی‌پی و یک اکانت‌اند:

| اکانت | سقف |
|---|---|
| ناشناس | ۱۰۰ pull در ۶ ساعت (به‌ازای هر IPv4 یا `/64`) |
| Personal (رایگان، لاگین‌کرده) | ۲۰۰ pull در ۶ ساعت |
| Pro / Team / Business | بدون سقف |

فقط pull هایی از سهمیه کم می‌کنند که در نکسس کش نشده باشند. با این حال، اگر
میرور را با چند تیم share می‌کنی، ارزان‌ترین و قطعی‌ترین راه یک اکانت
Pro/Team است؛ `DOCKERHUB_USERNAME` و `DOCKERHUB_TOKEN` را در `.env` بگذار و
`./provision.sh` را دوباره بزن.

### سهمیه‌ی هر کلاینت

مستقل از همه‌ی این‌ها، nginx برای هر آی‌پی یک سقف نرخ و یک سقف اتصال دارد
(`MIRROR_RATE_LIMIT`، `MIRROR_RATE_BURST`، `MIRROR_CONN_LIMIT`). هدفش اعمال
سقف روزانه‌ی نکسس **نیست** — ۱۰۰٬۰۰۰ در روز یعنی ۱.۲ درخواست در ثانیه که
غیرقابل زندگی است. کارش این است که یک کلاینتِ گیرکرده در حلقه‌ی retry،
سهمیه‌ی مشترک بقیه را در چند دقیقه نسوزاند. پیش‌فرض‌ها برای CI موازی هم
راحت‌اند؛ اگر کسی `429` گرفت، اعداد را در `.env` ببر بالا و
`docker compose up -d nginx`.

### اگر باز هم کم آوردی

- **Nexus Pro** — سقف ندارد، ولی پولی است.
- **تقسیم بار:** بیشترِ درخواست‌ها مال داکر است. اگر داکر را به
  [Harbor](https://goharbor.io/) (یا رجیستری pull-through خود داکر) بدهی و
  نکسس را برای pypi/npm/go/apt نگه داری، شمارش نکسس چند برابر پایین می‌آید.
- **چند نمونه‌ی نکسس** برای فرمت‌های مختلف — سقف per-deployment است.

---

## ۷. عیب‌یابی

| نشانه | علت معمول |
|---|---|
| همه‌چیز ۴۰۳ | IP در `nginx/acl.conf` نیست، یا بعد از ویرایش `restart nginx` نزدی |
| مرورگر: `PR_END_OF_FILE_ERROR` / کانکشن بسته می‌شود | لایه‌ی stream ردت کرده: IP در `nginx/sni-allow.conf` نیست. (۴۰۳ فرق دارد — یعنی از پروکسی رد شدی و `acl.conf` بلاکت کرد.) |
| از پنل خودت بیرون می‌افتی چون IP عوض می‌شود | `MIRROR_PANEL_OPEN=1` — بخش ۴.۶ |
| ۵۰۲ روی `mirror.` | Nexus هنوز بالا نیامده؛ بوت اول ۲ تا ۵ دقیقه طول می‌کشد |
| ۵۰۲ روی `push.` | `provision-hosted.sh` را نزدی، پس `docker-hosted` روی ۵۰۰۱ وجود ندارد |
| pip لینک `localhost:8081` می‌دهد | Base URL در Capabilities ست نشده |
| `docker pull ghcr.io/...` کند است | `registry-mirrors` فقط داکرهاب را پوشش می‌دهد (بخش ۴) |
| apt هنوز کند است | منابع پیش‌فرض غیرفعال نشده‌اند (بخش ۴) |
| `git clone` کار نمی‌کند | Nexus سرور گیت نیست — به README بخش «نکته‌ی مهم درباره‌ی گیت» |
| pull از داکرهاب rate limit می‌خورد | `DOCKERHUB_USERNAME/TOKEN` در `.env` خالی است |
| `docker pull` از میرور ۴۰۱ می‌دهد | رئالم DockerToken فعال نیست؛ دوباره `./provision.sh` بزن |
| `bootstrap.sh` در CI/غیرتعاملی می‌میرد | `SKIP_ACL_CHECK=1 ./bootstrap.sh` (فقط بعد از اینکه واقعاً IP اضافه کردی) |
| apt روی Debian کار نمی‌کند | فقط `bookworm` پشتیبانی می‌شود؛ `apt-debian-bookworm(-security)` باید با `./provision.sh` ساخته شده باشد |
| `/panel/` بالا نمی‌آید (crash-loop) | `PANEL_SESSION_SECRET` در `.env` خالی یا نامعتبر است؛ `docker compose logs panel` پیام دقیق را می‌دهد |
| لاگین پنل رد می‌شود | باید یوزر/پس یک حساب **ادمین** Nexus باشد، نه `deployer` (که privilege محدود دارد) |
| تغییر IP در پنل روی سایت اثر نمی‌کند | تا ۵ ثانیه صبر کن (فاصله‌ی poll)؛ اگر بازهم نه، `docker compose logs nginx` را چک کن |
| کلاینت‌ها `429` می‌گیرند | سهمیه‌ی هر آی‌پی؛ `MIRROR_RATE_LIMIT`/`MIRROR_RATE_BURST`/`MIRROR_CONN_LIMIT` را در `.env` ببر بالا (بخش ۶) |
| `X-Mirror-Cache` همیشه `MISS` است | آن مسیر عمداً کش نمی‌شود (متادیتا)، یا کش تازه پاک شده. جدول بخش ۶ را ببین |
| تگ داکر تازه push شده ولی قدیمی می‌آید | `MIRROR_DOCKER_TAG_TTL` (پیش‌فرض ۱ دقیقه)؛ صبر کن یا کمش کن |
| نکسس «افزودن کامپوننت» را بسته | به سقف Community Edition خوردی — بخش ۶ |
| nginx بعد از تغییر `.env` بالا نمی‌آید | متغیر `MIRROR_*` جدیدی در تمپلیت هست که در `docker-compose.yml` تعریف نشده؛ `docker compose logs nginx` اسمش را می‌گوید |

اگر یک بار `nginx/acl.conf` را از پنل دست زدی، دیگر آن را دستی ویرایش نکن —
اولین تغییر بعدی از پنل، ویرایش دستی‌ات را بی‌سروصدا از بین می‌برد.

بررسی وضعیت استک:

```bash
docker compose ps
curl -sS -u admin:PASS http://127.0.0.1:8081/service/rest/v1/status/writable
```

پورت `8081` فقط روی `127.0.0.1` سرور خارج باز است (نه پابلیک) — همان چیزی
است که اسکریپت‌های provision از آن استفاده می‌کنند.

---

## ۸. امنیت — چک‌لیست قبل از تحویل

- [ ] `nginx/acl.conf` فقط IP های خودت را دارد (پیش‌فرض «همه ممنوع» است)
- [ ] رمز `admin` عوض شده و `/nexus-data/admin.password` پاک شده
- [ ] `.env` کامیت نشده (در `.gitignore` هست)
- [ ] `deployer` برای CI استفاده می‌شود، نه `admin`
- [ ] پورت‌های ۸۰۸۱ و ۵۰۰۰ و ۵۰۰۱ پابلیک نیستند — فقط از پشت nginx
- [ ] فایروال سرور خارج فقط ۸۰ و ۴۴۳ (و SSH) را باز دارد
- [ ] `NEXUS_VERSION` به‌روز است
- [ ] `PANEL_SESSION_SECRET` یکتا و تصادفی است (`openssl rand -hex 32`)، نه مقدار نمونه

دسترسی anonymous برای خواندن **عمداً روشن** است — وگرنه باید روی هر کلاینت
لاگین بگذاری و داکر هم برای `registry-mirrors` احراز هویت نمی‌فرستد. یعنی
تنها چیزی که میرور را بسته نگه می‌دارد همان allowlist در nginx است. اگر
بازش بگذاری، ظرف چند ساعت به‌عنوان open proxy پیدا می‌شود.
