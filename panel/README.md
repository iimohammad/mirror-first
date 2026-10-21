# پنل مدیریت میرور

اپ Next.js که با بقیه‌ی استک بالا می‌آید و پشت nginx روی `/panel/` سرو
می‌شود. مدیریت IP allowlist و مرور/حذف/آپلود پکیج‌ها را بدون REST/curl خام
انجام می‌دهد.

## معماری، خلاصه

```
مرورگر ──HTTPS──▶ nginx (همان ACL + همان گواهی) ──location /panel/──▶ panel:3000
                                                                          │
                                                                          ├─▶ Nexus REST API (پکیج‌ها)
                                                                          └─▶ nginx/acl.conf (IP ها)
```

- **basePath** در `next.config.ts` روی `/panel` است — یک اپ جدا با ساب‌دامین
  و گواهی جدا نیست، همه‌چیز زیر همان دامنه‌ی اصلی.
- **بدون دیتابیس.** IPها و سشن‌ها در دو فایل JSON روی یک Docker volume
  (`panel_data`) نگه داشته می‌شوند (`src/lib/json-store.ts`). حجم داده
  (چند ده IP، چند سشن) خیلی کمتر از آن است که SQLite/native module بخواهد.
- **UI** با Tailwind CSS v4 + shadcn/ui (پرست Nova، کامپوننت‌ها در
  `src/components/ui/`)، فونت وزیرمتن از next/font، تم روشن/تاریک با
  next-themes و DirectionProvider رادیکس برای RTL درست Select/Menu ها.

## احراز هویت

حساب جدایی نمی‌سازد. لاگین یعنی: یوزر/پس را با یک درخواست Basic Auth به یک
endpoint ادمین-محورِ Nexus (`/service/rest/v1/security/anonymous`) می‌فرستد؛
اگر ۲۰۰ برگشت یعنی معتبر و ادمین است. بعدش:

- یک سشن با شناسه‌ی تصادفی ساخته می‌شود، یوزر/پس نکسس با AES-256-GCM
  (کلید از `PANEL_SESSION_SECRET`) رمزنگاری و در `sessions.json` ذخیره
  می‌شود.
- کوکی مرورگر فقط شناسه‌ی سشن را دارد (httpOnly، secure، sameSite=strict)،
  نه خود رمز عبور — حتی رمزنگاری‌شده‌اش هم نه.
- هر Server Action/صفحه که به Nexus نیاز دارد، سشن را از کوکی پیدا می‌کند،
  رمز را decrypt می‌کند و با همان یوزر/پس به REST API نکسس وصل می‌شود.

اگر `PANEL_SESSION_SECRET` عوض شود، سشن‌های موجود دیگر decrypt نمی‌شوند و
همه باید دوباره لاگین کنند — هیچ داده‌ای خراب نمی‌شود.

## مدیریت IP

`src/lib/ip-store.ts` منبع اصلی (`ips.json`، با برچسب) را نگه می‌دارد و از
رویش محتوای `nginx/acl.conf` را با همان ساختار `geo` بلاک فعلی می‌سازد.

نکته‌ی فنی مهم: نوشتن روی این فایل **باید in-place باشد** (`fs.writeFile`
ساده)، نه الگوی معمولِ «بنویس در tmp، بعد rename». چون این فایل تک‌تکی از
هاست به دو کانتینر جدا (`panel` و `nginx`) bind mount شده:

- دایرکتوری بالادستش mount نشده، فقط خود فایل — یک tmp file در همان
  دایرکتوری روی device دیگری می‌نشیند و `rename` با خطای cross-device
  (EXDEV) شکست می‌خورد.
- حتی اگر شکست نمی‌خورد، `rename` یک inode جدید می‌سازد که mount جداگانه‌ی
  nginx روی همان مسیر آن را نمی‌بیند (bind mount تک‌فایلی به inode زمان
  استارت container پین می‌شود).

`fs.writeFile` روی inode موجود truncate+write می‌کند، که هر دو مشکل را
دور می‌زند.

nginx خودش بلاک `geo` را فقط در بوت/reload می‌خواند. برای اینکه تغییر از
پنل اثر کند، `nginx/docker-entrypoint.d/98-acl-reload.sh` هر ۵ ثانیه
چک‌سام فایل را می‌بیند و اگر عوض شده بود `nginx -s reload` می‌زند — بدون
نیاز به mount کردن docker.sock داخل پنل (که دسترسی معادل root به کل هاست
می‌داد).

## پکیج‌ها

`src/lib/nexus.ts` یک لایه‌ی نازک روی REST API نکسس است: لیست ریپو، جستجوی
کامپوننت (`/service/rest/v1/search` — فرمت‌آگنوستیک، داکر را هم پوشش
می‌دهد)، حذف کامپوننت، آپلود عمومی (فقط pypi/npm/raw — داکر با REST آپلود
نمی‌شود)، لیست blob storeها، لیست/اجرای task.

⚠️ شکل دقیق پاسخ `/service/rest/v1/blobstores` و اینکه
`/service/rest/v1/tasks/{id}/run` روی هر نسخه/edition نکسس فعال است یا نه،
بین نسخه‌ها فرق می‌کند. کد این بخش‌ها defensively نوشته شده (فیلدهای
اختیاری، نمایش هرچه موجود بود) و در UI خطای واقعی نکسس را نشان می‌دهد به‌جای
شکست خاموش.

## متغیرهای محیطی

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `PANEL_SESSION_SECRET` | (اجباری) | کلید AES، با `openssl rand -hex 32` |
| `NEXUS_URL` | `http://nexus:8081` | آدرس داخلی نکسس روی شبکه‌ی داکر |
| `DATA_DIR` | `/data` | مسیر JSON storeها |
| `ACL_CONF_PATH` | `/shared/acl.conf` | مسیر mount شده‌ی `nginx/acl.conf` داخل کانتینر panel |
| `NEXUS_DATA_PATH` | `/nexus-data` | mount فقط-خواندنی والیوم `nexus_data`، برای صفحه‌ی دیسک |

## توسعه‌ی محلی

UI با Tailwind CSS v4 و shadcn/ui ساخته شده (RTL، فونت وزیرمتن، تم
روشن/تاریک). برای توسعه بدون داکر و بدون نکسس واقعی، یک mock سرور همراه
ریپو هست:

```bash
cd panel
npm install
npm run mock      # ترمینال ۱ — mock نکسس روی http://127.0.0.1:9191
npm run dev       # ترمینال ۲ — پنل روی http://localhost:3000/panel
```

`.env.local` (گیت‌نمی‌شود) پنل را به mock وصل می‌کند و JSON storeها را
زیر `.local-data` می‌گذارد. یوزر/پس mock: `admin` / `admin123`. ریپوها،
کامپوننت‌ها، blob store و تسک‌های نمونه داخل `mock/mock-nexus.mjs` تعریف
شده‌اند — برای تست صفحه‌بندی، `PAGE_SIZE` بالای همان فایل را کم کن.

بدون mock هم می‌شود `NEXUS_URL` را به یک نکسس واقعی داد؛ صفحه‌ی IP چون فقط
JSON محلی می‌خواند مستقل کار می‌کند اما بدون سشن معتبر اصلاً به آن نمی‌رسی
(احراز هویت لازم است).
