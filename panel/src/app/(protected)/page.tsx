import Link from "next/link";
import {
  CircleCheck,
  FolderUp,
  Globe,
  HardDrive,
  Layers,
  Package,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getStatus, listRepositories } from "@/lib/nexus";
import { listIps } from "@/lib/ip-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function StatCard({
  icon: Icon,
  value,
  label,
  sub,
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div className="flex aspect-square size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {label}
            {sub ? ` — ${sub}` : ""}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();
  const [status, repos, ips] = await Promise.all([
    getStatus(session),
    listRepositories(session).catch(() => null),
    listIps(),
  ]);

  const byType = repos
    ? repos.reduce<Record<string, number>>((acc, r) => {
        acc[r.type] = (acc[r.type] ?? 0) + 1;
        return acc;
      }, {})
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">داشبورد</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          وضعیت کلی میرور در یک نگاه.
        </p>
      </div>

      <Card
        className={
          status
            ? "border-emerald-600/30 bg-emerald-600/5 dark:border-emerald-500/30 dark:bg-emerald-500/5"
            : "border-destructive/30 bg-destructive/5"
        }
      >
        <CardContent className="flex flex-wrap items-center gap-3">
          {status ? (
            <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-500" />
          ) : (
            <TriangleAlert className="size-5 text-destructive" />
          )}
          <div>
            {status ? (
              <>
                <span className="font-medium">Nexus متصل است</span>
                <Badge variant="secondary" className="ms-2">
                  نسخه {status.version ?? "نامشخص"}
                </Badge>
              </>
            ) : (
              <span className="font-medium text-destructive">
                اتصال به Nexus برقرار نشد — لیست ریپوها در دسترس نیست.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Globe} value={ips.length} label="IP مجاز" />
        <StatCard
          icon={Package}
          value={repos?.length ?? "—"}
          label="ریپازیتوری"
          sub={byType ? `${byType.hosted ?? 0} hosted / ${byType.proxy ?? 0} proxy / ${byType.group ?? 0} group` : undefined}
        />
        <StatCard
          icon={ShieldCheck}
          value={status ? "فعال" : "—"}
          label="دسترسی ادمین"
          sub={session.username}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>دسترسی سریع</CardTitle>
          <CardDescription>پرکاربردترین بخش‌های پنل.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/ips">
              <Globe /> مدیریت IP
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/packages">
              <Package /> مرور پکیج‌ها
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/upload">
              <FolderUp /> آپلود پکیج
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/disk">
              <HardDrive /> مصرف دیسک
            </Link>
          </Button>
        </CardContent>
      </Card>

      {repos && repos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ریپازیتوری‌ها</CardTitle>
            <CardDescription>
              <Layers className="me-1 inline size-4" />
              {repos.length} ریپو روی این نکسس تعریف شده.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {repos.map((r) => (
              <Badge key={r.name} variant="outline" className="gap-1 font-mono text-xs">
                {r.name}
                <span className="text-muted-foreground">({r.type})</span>
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
