import { Globe, Plus, TriangleAlert } from "lucide-react";
import { requireSession } from "@/lib/session";
import { listIps } from "@/lib/ip-store";
import { addIpAction, removeIpAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function IpsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSession();
  const { error } = await searchParams;
  const ips = await listIps();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">مدیریت IP</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          این لیست منبع اصلی <code className="rounded bg-muted px-1 py-0.5 text-xs">nginx/acl.conf</code> است —
          هر تغییری اینجا خودکار فایل را می‌سازد و nginx ظرف چند ثانیه reload می‌شود.
          ویرایش دستی فایل روی سرور با اولین تغییر از همین‌جا از بین می‌رود.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>اضافه کردن IP</CardTitle>
          <CardDescription>
            تک‌IP یا رنج CIDR — مثلاً <code className="rounded bg-muted px-1 py-0.5 text-xs">185.51.200.10</code> یا{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">91.99.0.0/16</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="ip-add-form" action={addIpAction} className="flex flex-wrap gap-2">
            <Input
              name="cidr"
              placeholder="185.51.200.10 یا 91.99.0.0/16"
              className="min-w-52 flex-1 font-mono"
              dir="ltr"
              required
            />
            <Input
              name="label"
              placeholder="برچسب، مثلا سرور تهران ۱"
              className="min-w-44 flex-1"
              required
            />
            <SubmitButton pendingText="در حال ثبت…">
              <Plus /> اضافه کن
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            لیست فعلی
            <Badge variant="secondary">{ips.length}</Badge>
          </CardTitle>
          <CardDescription>
            {ips.length === 0
              ? "هیچ IP ای اضافه نشده — میرور همه‌چیز را 403 می‌کند."
              : "حذف هر IP بلافاصله بعد از reload شدن nginx اعمال می‌شود."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ips.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
              <Globe className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                لیست خالی است. اولین IP سرورهایت را از فرم بالا اضافه کن.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>برچسب</TableHead>
                  <TableHead>IP / CIDR</TableHead>
                  <TableHead>اضافه‌شده</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ips.map((ip) => (
                  <TableRow key={ip.id}>
                    <TableCell className="font-medium">{ip.label}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" dir="ltr">
                        {ip.cidr}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(ip.createdAt).toLocaleString("fa-IR")}
                    </TableCell>
                    <TableCell>
                      <form id={`ip-del-${ip.id}`} action={removeIpAction}>
                        <input type="hidden" name="id" value={ip.id} />
                      </form>
                      <ConfirmSubmitButton
                        formId={`ip-del-${ip.id}`}
                        title={`حذف «${ip.label}»؟`}
                        confirmText={`با حذف ${ip.cidr}، این سرور دیگر نمی‌تواند از میرور استفاده کند.`}
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                      >
                        حذف
                      </ConfirmSubmitButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
