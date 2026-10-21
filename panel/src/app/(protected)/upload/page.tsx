import { FolderUp } from "lucide-react";
import { requireSession } from "@/lib/session";
import { listRepositories, type UploadableFormat } from "@/lib/nexus";
import { uploadAction } from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const UPLOADABLE_FORMATS = new Set<UploadableFormat>(["pypi", "npm", "raw"]);

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession();
  const { error, ok } = await searchParams;
  const repos = await listRepositories(session).catch(() => null);

  const targets = (repos ?? []).filter(
    (r) => r.type === "hosted" && UPLOADABLE_FORMATS.has(r.format as UploadableFormat)
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">آپلود پکیج</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          فقط برای pypi/npm/raw hosted — داکر با این روش آپلود نمی‌شود، با{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">docker push</code> منتشرش کن
          (به PACKAGES.md نگاه کن).
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {ok && (
        <Alert className="border-emerald-600/30 text-emerald-800 dark:text-emerald-300">
          <AlertDescription>{ok}</AlertDescription>
        </Alert>
      )}

      {!repos ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-8 text-center text-sm text-destructive">
            اتصال به Nexus برقرار نشد.
          </CardContent>
        </Card>
      ) : targets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <FolderUp className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            هیچ ریپوی hosted ای پیدا نشد —{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">provision-hosted.sh</code> را
            روی سرور خارج زده‌ای؟
          </p>
        </div>
      ) : (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>فایل جدید</CardTitle>
            <CardDescription>فایل به ریپوی انتخاب‌شده در نکسس آپلود می‌شود.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={uploadAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="repository">ریپوی مقصد</Label>
                <Select name="repository" required>
                  <SelectTrigger id="repository" className="w-full">
                    <SelectValue placeholder="انتخاب کن…" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((r) => (
                      <SelectItem key={r.name} value={r.name}>
                        <span className="font-mono">{r.name}</span>
                        <span className="text-muted-foreground"> ({r.format})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="directory">دایرکتوری (فقط برای raw)</Label>
                <Input id="directory" name="directory" placeholder="مثلا debs" dir="ltr" />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="file">فایل</Label>
                <Input id="file" name="file" type="file" required />
              </div>

              <SubmitButton className="self-start" pendingText="در حال آپلود…">
                <FolderUp /> آپلود
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
