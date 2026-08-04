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
client/setup-client.sh        وصل کردن کلاینت‌ها                   (روی سرورهای ایران)
nginx/acl.conf                allowlist آی‌پی — اولین بار دستی، بعد از پنل
nginx/templates/              کانفیگ nginx (envsubst روی ${MIRROR_DOMAIN})
nginx/optional/               کانکتور push داکر، پیش‌فرض غیرفعال
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
docker system df -v | grep nexus_data
```

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

## ۶. عیب‌یابی

| نشانه | علت معمول |
|---|---|
| همه‌چیز ۴۰۳ | IP در `nginx/acl.conf` نیست، یا بعد از ویرایش `restart nginx` نزدی |
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

## ۷. امنیت — چک‌لیست قبل از تحویل

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
