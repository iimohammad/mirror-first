"use client";

import { useState } from "react";
import { CopyBlock } from "../connect/copy-block";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// آپلود/کش‌کردن از ترمینال — برای وقتی که فایل روی مرورگر نیست یا اصلاً
// نمی‌خواهی از فرم رد شوی. دستورات همان‌هایی که PACKAGES.md توضیح می‌دهد.
export function PublishCli({ defaultDomain }: { defaultDomain: string }) {
  const [domain, setDomain] = useState(defaultDomain);
  const d = domain.trim() || defaultDomain;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-64 flex-1 flex-col gap-2">
          <Label htmlFor="cli-domain">دامنه‌ی میرور</Label>
          <Input
            id="cli-domain"
            dir="ltr"
            className="font-mono"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="mirror.example.com"
          />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          توکن/رمز را این دستورات می‌پرسند یا در خود دستور بگذار —
          از <code className="rounded bg-muted px-1 py-0.5 text-xs">admin</code> تا یوزر
          فقط-انتشار (deployer) که در نکسس بسازی.
        </p>
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="warm">
          <AccordionTrigger>
            پکیج عمومی — فقط دانلود و کش (بدون آپلود)
          </AccordionTrigger>
          <AccordionContent>
            <p className="mb-2 text-sm text-muted-foreground">
              پکیج عمومی (requests، postgres، react و…) نیاز به آپلود ندارد —
              اولین درخواست از میرور، نکسس خودش از upstream می‌کشد و کش می‌کند.
              از ترمینال این‌طور گرمش کن:
            </p>
            <CopyBlock
              label="گرم کردن کش"
              code={`# پایتون — فقط دانلود از میرور (کش می‌شود):
pip download -d /tmp/warm -r requirements.txt --index-url https://${d}/repository/pypi-group/simple

# نود:
npm ci --registry https://${d}/repository/npm-group/

# داکر:
docker pull docker.${d}/library/postgres:16`}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pypi">
          <AccordionTrigger>انتشار PyPI با twine</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="twine"
              code={`pip install --user build twine
python -m build

# یوزر/پس نکسس را می‌پرسد:
twine upload --repository-url https://${d}/repository/pypi-hosted/ dist/*`}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              برای اینکه هر بار رمز نپرسد، در{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">~/.pypirc</code> ذخیره
              کن:
            </p>
            <CopyBlock
              label="~/.pypirc"
              code={`cat > ~/.pypirc <<'EOF'
[distutils]
index-servers = nexus

[nexus]
repository = https://${d}/repository/pypi-hosted/
username = admin
password = <رمز>
EOF
twine upload -r nexus dist/*`}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="npm">
          <AccordionTrigger>انتشار npm</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="npm publish"
              code={`npm login --registry https://${d}/repository/npm-hosted/
npm publish --registry https://${d}/repository/npm-hosted/`}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="raw">
          <AccordionTrigger>فایل خام با curl (deb، آرشیو، باینری)</AccordionTrigger>
          <AccordionContent>
            <CopyBlock
              label="curl آپلود فایل"
              code={`# فایل محلی:
curl -u admin:PASS --upload-file myapp_1.0_amd64.deb \\
  https://${d}/repository/raw-hosted/debs/myapp_1.0_amd64.deb

# یا فایل هنوز دانلود نشده؟ مستقیم از اینترنت بگیر و به میرور بده — بدون مرورگر:
curl -fL -o /tmp/app.tar.gz https://github.com/OWNER/REPO/releases/download/v1.0/app.tar.gz
curl -u admin:PASS --upload-file /tmp/app.tar.gz \\
  https://${d}/repository/raw-hosted/downloads/app.tar.gz`}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="docker">
          <AccordionTrigger>داکر — docker push</AccordionTrigger>
          <AccordionContent>
            <p className="mb-2 text-sm text-muted-foreground">
              داکر با فرم و REST آپلود نمی‌شود؛ push می‌زنی به هاست{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">push</code> — این هاست
              پیش‌فرض خاموش است، فعال‌کردنش در PACKAGES.md آمده.
            </p>
            <CopyBlock
              label="docker push"
              code={`docker login push.${d} -u admin
docker tag myapp:1.2.0 push.${d}/myapp:1.2.0
docker push push.${d}/myapp:1.2.0

# pull همان از هاست معمولی (docker-hosted عضو group است):
docker pull docker.${d}/myapp:1.2.0`}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
