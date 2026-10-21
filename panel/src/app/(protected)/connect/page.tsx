import { requireSession } from "@/lib/session";
import { ConnectTools } from "./connect-tools";

export default async function ConnectPage() {
  await requireSession();

  // دامنه از compose می‌آید (همان MIRROR_DOMAIN که nginx هم استفاده می‌کند)؛
  // اگر ست نباشد، کاربر می‌تواند بالا فرمش را دستی عوض کند.
  const mirrorDomain = process.env.MIRROR_DOMAIN ?? "mirror.example.com";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">اتصال سرورها به میرور</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          دستورات آماده برای سرورهای ایران — کپی کن، آن‌ورو بچسبان. برای هر
          ابزار جدا یا همه با یک اسکریپت.
        </p>
      </div>

      <ConnectTools defaultDomain={mirrorDomain} />
    </div>
  );
}
