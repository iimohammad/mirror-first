import { HardDrive, Play, TriangleAlert } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getDiskInfo } from "@/lib/disk";
import { listBlobStores, listTasks } from "@/lib/nexus";
import { formatBytes } from "@/lib/format";
import { runTaskAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function DiskPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession();
  const { error, ok } = await searchParams;

  const [disk, blobStores, tasks] = await Promise.all([
    getDiskInfo(),
    listBlobStores(session).catch(() => null),
    listTasks(session).catch(() => null),
  ]);

  const cleanupTasks = tasks?.filter((t) => /cleanup|compact/i.test(t.name)) ?? [];

  const hasFs = disk.filesystemTotalBytes != null && disk.filesystemFreeBytes != null;
  const usedBytes = hasFs ? disk.filesystemTotalBytes! - disk.filesystemFreeBytes! : null;
  const usedPct = hasFs
    ? Math.round((usedBytes! / disk.filesystemTotalBytes!) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">دیسک و Cleanup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مصرف دیسک، وضعیت blob storeها و اجرای دستی تسک‌های پاک‌سازی.
        </p>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="text-sm text-destructive">{error}</CardContent>
        </Card>
      )}
      {ok && (
        <Card className="border-emerald-600/30 bg-emerald-600/5">
          <CardContent className="text-sm text-emerald-800 dark:text-emerald-300">{ok}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent>
            <div className="text-2xl font-semibold leading-none">
              {disk.nexusDataBytes != null ? formatBytes(disk.nexusDataBytes) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">مصرف nexus_data</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-2xl font-semibold leading-none">
              {disk.nginxCacheBytes != null ? formatBytes(disk.nginxCacheBytes) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">کش nginx</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-2xl font-semibold leading-none">
              {disk.filesystemFreeBytes != null ? formatBytes(disk.filesystemFreeBytes) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">فضای آزاد دیسک</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="text-2xl font-semibold leading-none">
              {disk.filesystemTotalBytes != null ? formatBytes(disk.filesystemTotalBytes) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">حجم کل دیسک</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">پرشدگی فایل‌سیستم</CardTitle>
          <CardDescription>
            {hasFs
              ? `${formatBytes(usedBytes!)} استفاده‌شده از ${formatBytes(disk.filesystemTotalBytes!)} (${usedPct}%)`
              : "اطلاعات فایل‌سیستم در دسترس نیست."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasFs && <Progress value={usedPct} className="h-2.5" />}
          {usedPct >= 85 && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
              <TriangleAlert className="size-4" />
              دیسک تقریباً پر است — تسک‌های Cleanup را اجرا کن یا سیاست پاک‌سازی بساز.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        «کش nginx» نسخه‌ی دومی از آرتیفکت‌های داغ است، جدا از nexus_data، و سقف حجمش را{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">MIRROR_CACHE_MAX_SIZE</code> در{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> تعیین می‌کند. هرچه از آنجا سرو
        شود اصلاً به نکسس نمی‌رسد، پس در سقف روزانه‌ی درخواست‌های Community Edition هم شمرده نمی‌شود.
      </p>

      {blobStores && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blob Store ها</CardTitle>
            <CardDescription>
              داده‌ی نکسس داخل همین‌ها نگه داشته می‌شود.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>حجم</TableHead>
                  <TableHead>وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blobStores.map((b) => (
                  <TableRow key={b.name}>
                    <TableCell className="font-mono text-sm">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground">{b.type ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.totalSizeInBytes != null ? formatBytes(b.totalSizeInBytes) : "—"}
                    </TableCell>
                    <TableCell>
                      {b.unavailable ? (
                        <Badge variant="destructive">غیرفعال</Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-600/30 text-emerald-700 dark:text-emerald-400">
                          آماده
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تسک‌های پاک‌سازی</CardTitle>
          <CardDescription>
            اجرای دستی همان تسک‌هایی که در پنل ادمین نکسس زمان‌بندی شده‌اند.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {tasks === null && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="text-sm text-destructive">لیست تسک‌ها در دسترس نیست.</CardContent>
            </Card>
          )}
          {tasks && cleanupTasks.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              هیچ تسک Cleanup ای در نکسس تعریف نشده. از پنل ادمین نکسس بساز: Administration →
              Repository → Cleanup Policies، بعد Administration → System → Tasks.
            </p>
          )}
          {cleanupTasks.map((t) => {
            const formId = `task-run-${t.id}`;
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {t.name}
                    {t.currentState === "RUNNING" ? (
                      <Badge variant="secondary" className="animate-pulse">
                        در حال اجرا
                      </Badge>
                    ) : (
                      <Badge variant="outline">{t.currentState}</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t.lastRunResult ? `آخرین اجرا: ${t.lastRunResult}` : "هنوز اجرا نشده"}
                  </div>
                </div>
                <form id={formId} action={runTaskAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="name" value={t.name} />
                </form>
                <ConfirmSubmitButton
                  formId={formId}
                  title="اجرای تسک"
                  confirmText={`تسک «${t.name}» همین حالا اجرا شود؟ روی نکسس فشار می‌آورد؛ بهتر است سردترِ شب اجرا شود.`}
                  variant="outline"
                  size="sm"
                >
                  <Play /> اجرای دستی
                </ConfirmSubmitButton>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
