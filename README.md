# میرور بسته‌ها با Sonatype Nexus Repository

یک سرور میرور/کش برای ایمیج‌های داکر، پکیج‌های apt، PyPI، npm و Go —
همه با یک اپلیکیشن. روی VPS خارج بالا می‌آید، سرورهای ایران به آن وصل می‌شوند.

```
سرورهای ایران ──HTTPS──▶ nginx (TLS + IP allowlist) ──▶ Nexus ──▶ اینترنت آزاد
                                                          └─ کش روی دیسک
```

## پیش‌نیاز

- VPS خارج: **حداقل ۴ گیگ رم (۸ توصیه می‌شود)** — Nexus روی JVM است و کم‌رم نیست.
- دیسک: از ۱۰۰ گیگ شروع کن. کش داکر سریع بزرگ می‌شود.
- دو رکورد DNS به IP سرور:
  - `mirror.example.com`
  - `docker.mirror.example.com`

## راه‌اندازی

```bash
cp .env.example .env && nano .env        # دامنه، ایمیل، اکانت داکرهاب
nano nginx/acl.conf                      # ⬅️ IP سرورهایت را اضافه کن (اجباری)
./bootstrap.sh                           # گواهی TLS + بالا آوردن استک
./provision.sh                           # ساخت ریپوهای proxy و group
./provision-hosted.sh                    # اختیاری: انتشار پکیج‌های خودت
```

راهنمای کامل دیپلوی، بکاپ، به‌روزرسانی و عیب‌یابی: **[DEPLOY.md](DEPLOY.md)**
مدیریت پکیج‌ها (انتشار، حذف، کنترل upstream): **[PACKAGES.md](PACKAGES.md)**

`bootstrap.sh` رمز اولیه‌ی `admin` را چاپ می‌کند. بعد از ورود به پنل:

- **Administration → System → Capabilities → Base URL** = `https://mirror.example.com/`
- **Administration → Repository → Cleanup Policies** — سیاست پاک‌سازی بساز
  (مثلاً «آخرین دسترسی بیش از ۹۰ روز») و تسک `Cleanup unused asset blobs` را
  زمان‌بندی کن، وگرنه دیسک پر می‌شود.

## اتصال سرورهای ایران

```bash
sudo MIRROR_DOMAIN=mirror.example.com ./client/setup-client.sh all
```

یا دستی:

| ابزار | تنظیم |
|---|---|
| Docker | `/etc/docker/daemon.json` → `{"registry-mirrors":["https://docker.mirror.example.com"]}` |
| containerd/k8s | `/etc/containerd/certs.d/<upstream>/hosts.toml` |
| pip | `index-url = https://mirror.example.com/repository/pypi-group/simple` |
| npm | `registry=https://mirror.example.com/repository/npm-group/` |
| Go | `GOPROXY=https://mirror.example.com/repository/go-proxy,direct` و `GOSUMDB=off` |
| apt | `deb https://mirror.example.com/repository/apt-ubuntu-noble/ noble main …` |

### ایمیج‌های غیر داکرهاب

`registry-mirrors` فقط برای داکرهاب کار می‌کند — این محدودیت خود داکر است، نه Nexus.
برای بقیه، اسم ایمیج را با هاست میرور بنویس (ریپوی گروهی همه را پوشش می‌دهد):

```bash
docker pull ghcr.io/astral-sh/uv:latest
# ↓
docker pull docker.mirror.example.com/astral-sh/uv:latest
```

روی k8s این مشکل وجود ندارد؛ `hosts.toml` کانتینردی per-registry mirror را
درست پشتیبانی می‌کند.

## نکته‌ی مهم درباره‌ی گیت

**Nexus سرور گیت نیست و `git clone` را پروکسی نمی‌کند.** فقط `raw-github` و
`raw-ghusercontent` هستند که دانلود *فایل* و *ریلیز* از گیت‌هاب را کش می‌کنند:

```
https://mirror.example.com/repository/raw-github/owner/repo/releases/download/v1.0/x.tar.gz
https://mirror.example.com/repository/raw-ghusercontent/owner/repo/main/README.md
```

برای `git clone` دو راه داری:

1. **forward proxy** روی همان سرور خارج (squid یا tinyproxy با basic auth)، بعد:
   ```bash
   git config --global http.proxy http://user:pass@mirror.example.com:3128
   ```
   حواست باشد squid بدون auth ظرف چند ساعت پیدا و سوءاستفاده می‌شود.
2. **Gitea** روی سرور خارج با pull-mirror برای ریپوهای مشخص — تمیزتر است اگر
   تعداد ریپوها محدود و ثابت باشد.

## امنیت

- `nginx/acl.conf` پیش‌فرض **همه را رد می‌کند**. تا IP اضافه نکنی چیزی کار نمی‌کند —
  این عمدی است. میرور باز = ترافیک و IP سوخته.
- پورت `8081` و `5000` عمداً publish نشده‌اند؛ فقط از پشت nginx در دسترس‌اند.
- رمز `admin` را همان اول عوض کن و `admin.password` را پاک کن.
- توکن داکرهاب فقط در `.env` است، نه در compose. `.env` را کامیت نکن.
- اگر IP ثابت نداری: به‌جای allowlist از Basic Auth استفاده کن (در
  `nginx/templates/20-nexus.conf.template` کامنت شده). ولی توجه: داکر برای
  `registry-mirrors` احراز هویت نمی‌فرستد، پس برای مسیر داکر همان IP allowlist لازم است.

## دو نکته که قبل از تعهد به Nexus باید چک کنی

1. **لایسنس.** Sonatype نسخه‌ی رایگان را به «Community Edition» تبدیل کرده و
   سقف مصرف (تعداد کامپوننت، حجم، نرخ درخواست) گذاشته است. اعداد در نسخه‌های
   مختلف عوض شده — قبل از اینکه کل زیرساختت را رویش سوار کنی، شرایط نسخه‌ای که
   نصب می‌کنی را بخوان.
2. **نسخه و دیتابیس.** `3.70.1` آخرین نسخه‌ی خط OrientDB است و بدون تنظیم اضافه
   بالا می‌آید. از `3.71` به بعد H2/PostgreSQL است و باید
   `NEXUS_DATASTORE_ENABLED=true` را در compose باز کنی. Nexus سابقه‌ی CVE جدی
   دارد، پس نسخه را قدیمی نگه ندار و به‌روزرسانی را زمان‌بندی کن.

جایگزین سبک‌تر اگر Community Edition به دردت نخورد: **Harbor** برای داکر +
`apt-cacher-ng`/`verdaccio`/nginx-cache برای بقیه. بیشتر سرویس است ولی بدون
سقف و بدون JVM سنگین.
