"use client";

import Link from "next/link";
import { useState } from "react";
import { Cable, TriangleAlert } from "lucide-react";
import { CopyBlock } from "./copy-block";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// دستورات اتصال — دقیقاً همان کاری که client/setup-all.sh و
// client/setup-client.sh می‌کنند، به شکل دستی و قابل‌کپی.
export function ConnectTools({ defaultDomain }: { defaultDomain: string }) {
  const [domain, setDomain] = useState(defaultDomain);
  const d = domain.trim() || defaultDomain;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-2">
          <Label htmlFor="domain">دامنه‌ی میرور</Label>
          <Input
            id="domain"
            dir="ltr"
            className="font-mono"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="mirror.example.com"
          />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          {defaultDomain.includes("example")
            ? "دامنه‌ی واقعی روی سرور از .env می‌آید؛ اینجا موقتاً جایگزین کن."
            : "این دامنه در همه‌ی دستورات زیر اعمال می‌شود."}
        </p>
      </div>

      <Alert>
        <TriangleAlert />
        <AlertDescription>
          قبل از اتصال، IP عمومی سرور ایران باید در{" "}
          <Link href="/ips" className="font-medium underline underline-offset-4">
            مدیریت IP
          </Link>{" "}
          مجاز شده باشد — پیش‌فرض میرور «همه ممنوع» است و تا IP اضافه نکنی همه‌چیز
          403 می‌گیرد.
        </AlertDescription>
      </Alert>

      <Accordion type="multiple" defaultValue={["prep", "script"]}>
        <AccordionItem value="prep">
          <AccordionTrigger>قدم ۰ — گرفتن IP عمومی سرور ایران</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="گرفتن IP عمومی"
              code={`curl -sS --noproxy '*' https://api.ipify.org; echo`}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              خروجی را در صفحه‌ی «مدیریت IP» همین پنل اضافه کن، بعد برو سراغ قدم
              بعدی.
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="script">
          <AccordionTrigger>
            راه سریع — اسکریپت همه‌کاره (apt + pip + npm + go + docker + SNI)
          </AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="اتصال کامل با اسکریپت"
              code={`sudo apt-get install -y git
sudo git clone https://github.com/iimohammad/mirror-first.git /opt/mirror-first
cd /opt/mirror-first

sudo MIRROR_DOMAIN=${d} DISABLE_DEFAULT_SOURCES=1 ./client/setup-all.sh`}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              اجرای دوباره بی‌خطر است. متغیرهای اختیاری:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">SKIP_SNI=1</code>{" "}
              فقط میرور بدون دست زدن به{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">/etc/hosts</code>،{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                SNI_DOMAINS=&quot;a.com b.com&quot;
              </code>{" "}
              به‌جای فهرست پیش‌فرض دامنه‌ها.
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="docker">
          <AccordionTrigger>Docker</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="داکر"
              code={`sudo mkdir -p /etc/docker
printf '{ "registry-mirrors": ["https://docker.${d}"] }\\n' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
docker info | grep -A2 'Registry Mirrors'

# ایمیج‌های غیر داکرهابی را با اسم میرور بکش:
docker pull docker.${d}/astral-sh/uv:latest`}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="containerd">
          <AccordionTrigger>containerd / Kubernetes</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="containerd"
              code={`for up in docker.io ghcr.io quay.io registry.k8s.io gcr.io mcr.microsoft.com; do
  sudo mkdir -p "/etc/containerd/certs.d/$up"
  printf 'server = "https://%s"\\n\\n[host."https://docker.${d}"]\\n  capabilities = ["pull", "resolve"]\\n' "$up" \\
    | sudo tee "/etc/containerd/certs.d/$up/hosts.toml"
done

# سپس در بخش registry فایل /etc/containerd/config.toml:
#   config_path = "/etc/containerd/certs.d"
sudo systemctl restart containerd`}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="apt">
          <AccordionTrigger>apt (اوبونتو / دبیان)</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="apt اوبونتو"
              code={`# اوبونتو — noble را با کدنیم نسخه‌ی خودت عوض کن (jammy, noble, …)
sudo tee /etc/apt/sources.list.d/mirror.sources > /dev/null <<'EOF'
Types: deb
URIs: https://${d}/repository/apt-ubuntu-noble/
Suites: noble noble-updates noble-backports noble-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
EOF

# دبیان ۱۲ (bookworm):
sudo tee /etc/apt/sources.list.d/mirror.sources > /dev/null <<'EOF'
Types: deb
URIs: https://${d}/repository/apt-debian-bookworm/
Suites: bookworm bookworm-updates bookworm-backports
Components: main contrib non-free non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
EOF

# منابع پیش‌فرض را کنار بگذار (وگرنه ترافیک از میرور رد نمی‌شود):
sudo mv /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources.disabled 2>/dev/null || true
sudo mv /etc/apt/sources.list /etc/apt/sources.list.disabled 2>/dev/null || true

sudo apt-get update`}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pip">
          <AccordionTrigger>pip</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="pip"
              code={`sudo tee /etc/pip.conf > /dev/null <<'EOF'
[global]
index-url = https://${d}/repository/pypi-group/simple
timeout = 60
retries = 5
EOF`}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              ریپوی group است: پکیج‌های عمومی و پکیج‌های خودت از یک آدرس می‌آیند.
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="npm">
          <AccordionTrigger>npm</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="npm"
              code={`sudo tee "/etc/npmrc" > /dev/null <<'EOF'
registry=https://${d}/repository/npm-group/
fetch-retries=5
EOF`}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              اگر node را با nvm یا tarball رسمی نصب کرده‌ای، مسیر کانفیگ global
              فرق دارد:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                npm config get globalconfig
              </code>
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="go">
          <AccordionTrigger>Go</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="گو"
              code={`sudo tee /etc/profile.d/go-mirror.sh > /dev/null <<'EOF'
export GOPROXY="https://${d}/repository/go-proxy,direct"
export GOSUMDB=off
export GOFLAGS="-mod=readonly"
EOF
sudo sed -i -E '/^(GOPROXY|GOSUMDB|GOFLAGS)=/d' /etc/environment
sudo tee -a /etc/environment > /dev/null <<'EOF'
GOPROXY=https://${d}/repository/go-proxy,direct
GOSUMDB=off
GOFLAGS=-mod=readonly
EOF`}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              GOSUMDB خاموش می‌شود چون sum.golang.org از نکسس رد نمی‌شود؛ امنیت
              روی go.sum کامیت‌شده‌ی خود پروژه می‌ماند — پس go.sum را کامیت کن.
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="sni">
          <AccordionTrigger>پروکسی SNI (گیت‌هاب و…)</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="تست پروکسی SNI"
              code={`# IP پروکسی همان IP سرور میرور است:
PROXY_IP=$(getent ahostsv4 ${d} | awk '{print $1; exit}')

curl --noproxy '*' --resolve github.com:443:$PROXY_IP \\
  -sS -o /dev/null -w 'HTTP=%{http_code} ip=%{remote_ip}\\n' https://github.com/`}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              نیاز دارد روی سرور میرور پروفایل{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                COMPOSE_PROFILES=sni
              </code>{" "}
              در <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>{" "}
              فعال باشد و IP کلاینت در «مدیریت IP» باشد (همان لیست، هر دو فایل را
              می‌پوشاند). git clone از این رد نمی‌شود — برای آن راه‌ها در README
              آمده.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <Cable className="size-4 shrink-0" />
        اسکریپت کامل این مراحل با سلامت‌سنجی قبل از اعمال، در{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          client/setup-all.sh
        </code>{" "}
        ریپو هست — راه سریعِ بالا همان را صدا می‌زند.
      </div>
    </div>
  );
}
