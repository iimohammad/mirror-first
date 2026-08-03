# مدیریت پکیج‌ها روی میرور

## مدل ذهنی: سه نوع ریپازیتوری

| نوع | چه کاری می‌کند | تو چه می‌کنی |
|---|---|---|
| **proxy** | اولین بار که کسی پکیجی بخواهد، از upstream می‌گیرد و کش می‌کند | **هیچی.** خودکار است |
| **hosted** | انبار پکیج‌های خودت | `twine upload` / `npm publish` / `docker push` |
| **group** | چند ریپو را پشت **یک URL** جمع می‌کند | فقط کلاینت را به آن وصل می‌کنی |

الگوی درست: کلاینت‌ها را به **group** وصل کن، نه مستقیم به proxy.
آن‌وقت `pip install django` و `pip install my-private-lib` هر دو از یک آدرس کار می‌کنند.

```
pip ──▶ pypi-group ──┬──▶ pypi-hosted   (پکیج‌های خودت — اول چک می‌شود)
                     └──▶ pypi-proxy ──▶ pypi.org
```

---

## ۱. پکیج عمومی (مثلاً `requests`) — کاری لازم نیست

سؤال «چطور `requests` را به میرورم اضافه کنم؟» پاسخش این است که اضافه نمی‌کنی.
اولین `pip install requests` که از میرور رد شود، Nexus خودش دانلود و کش می‌کند.
دفعه‌ی بعد از دیسک می‌آید.

**گرم کردن کش از قبل** (اگر می‌خواهی قبل از deploy آماده باشد) — روی هر ماشینی
که از میرور رد می‌شود:

```bash
pip download -d /tmp/warm -r requirements.txt   # پایتون
npm ci                                           # نود
docker pull docker.mirror.example.com/library/postgres:16
```

همین کافی است. هیچ دستور «add» در کار نیست.

---

## ۲. پکیج خودت — این جایی است که آپلود می‌کنی

اول یک بار `./provision-hosted.sh` را اجرا کن تا ریپوهای hosted و group ساخته شوند.

### PyPI

`~/.pypirc`:
```ini
[distutils]
index-servers = nexus

[nexus]
repository = https://mirror.example.com/repository/pypi-hosted/
username = deployer
password = <رمز deployer>
```

```bash
python -m build
twine upload -r nexus dist/*
```

نصب (از **group**، نه hosted):
```bash
pip install --index-url https://mirror.example.com/repository/pypi-group/simple my-lib
```

### npm

```bash
npm config set registry https://mirror.example.com/repository/npm-group/
npm login --registry https://mirror.example.com/repository/npm-hosted/
npm publish --registry https://mirror.example.com/repository/npm-hosted/
```

### Docker

```bash
docker login push.mirror.example.com -u deployer
docker tag myapp:1.2.0 push.mirror.example.com/myapp:1.2.0
docker push push.mirror.example.com/myapp:1.2.0

# pull از هاست معمولی، چون docker-hosted عضو docker-group است
docker pull docker.mirror.example.com/myapp:1.2.0
```

### فایل خام (`.deb`، بایناری، آرشیو)

```bash
curl -u deployer:PASS --upload-file myapp_1.0_amd64.deb \
  https://mirror.example.com/repository/raw-hosted/debs/myapp_1.0_amd64.deb
```

### آپلود عمومی با REST API

اگر ابزار اختصاصی در دسترس نیست:
```bash
curl -u deployer:PASS -X POST \
  "https://mirror.example.com/service/rest/v1/components?repository=pypi-hosted" \
  -F "pypi.asset=@dist/my_lib-1.0-py3-none-any.whl"
```

---

## ۳. حذف و رفرش

### پاک کردن یک پکیج کش‌شده

مثلاً upstream نسخه‌ی خرابی داده و می‌خواهی دوباره دانلود شود:

```bash
# پیدا کردن id
curl -su admin:PASS \
  "https://mirror.example.com/service/rest/v1/search?repository=pypi-proxy&name=django" \
  | jq -r '.items[] | "\(.id)  \(.name) \(.version)"'

# حذف
curl -su admin:PASS -X DELETE \
  "https://mirror.example.com/service/rest/v1/components/<ID>"
```

### باطل کردن کل کش یک proxy

```bash
curl -su admin:PASS -X POST \
  "https://mirror.example.com/service/rest/v1/repositories/pypi-proxy/invalidate-cache"
```

فقط متادیتا را باطل می‌کند؛ فایل‌های دانلودشده سر جایشان می‌مانند.

### آزاد کردن دیسک

دو مرحله است و اگر مرحله‌ی دوم را فراموش کنی فضا آزاد نمی‌شود:

1. **Administration → Repository → Cleanup Policies** — سیاست بساز
   (مثلاً «آخرین دانلود بیش از ۹۰ روز پیش») و به ریپوها وصلش کن.
2. **Administration → System → Tasks** — این دو تسک را زمان‌بندی کن:
   - `Admin - Cleanup repositories using their associated policies`
   - `Admin - Compact blob store`

---

## ۴. کنترل اینکه چه چیزی از upstream بیاید

**Administration → Repository → Routing Rules** — قانون `ALLOW` یا `BLOCK` با
regex بساز و به یک proxy وصل کن.

مثال: جلوگیری از dependency confusion — نگذار پکیج‌هایی با پیشوند شرکت خودت از
pypi.org عمومی کشیده شوند:

```
mode:     BLOCK
matchers: ^/simple/mycompany-.*
```

روی `pypi-proxy` اعمالش کن. حالا `mycompany-*` فقط از `pypi-hosted` می‌آید،
حتی اگر کسی همان اسم را روی pypi.org عمومی منتشر کند. این یکی از عملی‌ترین
دلایل استفاده از ریپوی group است.

---

## ۵. خلاصه‌ی آدرس‌ها

| ابزار | آدرس |
|---|---|
| pip | `https://mirror.example.com/repository/pypi-group/simple` |
| npm | `https://mirror.example.com/repository/npm-group/` |
| docker pull | `docker.mirror.example.com` |
| docker push | `push.mirror.example.com` |
| go | `https://mirror.example.com/repository/go-proxy,direct` |
| apt | `https://mirror.example.com/repository/apt-ubuntu-noble/` |
| raw | `https://mirror.example.com/repository/raw-hosted/` |
