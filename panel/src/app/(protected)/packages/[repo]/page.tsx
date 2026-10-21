import Link from "next/link";
import { ChevronRight, Search, Trash2 } from "lucide-react";
import { requireSession } from "@/lib/session";
import { searchComponents } from "@/lib/nexus";
import { formatBytes } from "@/lib/format";
import { deleteComponentAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function DeleteCell({
  id,
  repo,
  q,
  name,
  version,
}: {
  id: string;
  repo: string;
  q: string | undefined;
  name: string;
  version?: string;
}) {
  const formId = `del-${id}`;
  return (
    <>
      <form id={formId} action={deleteComponentAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="repo" value={repo} />
        <input type="hidden" name="q" value={q ?? ""} />
      </form>
      <ConfirmSubmitButton
        formId={formId}
        title="حذف کامپوننت"
        confirmText={`«${name}${version ? " " + version : ""}» حذف شود؟ اگر از proxy کش شده، دوباره دانلود می‌شود؛ اگر hosted است، فقط خودت داری‌اش.`}
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:text-destructive"
      >
        <Trash2 />
        <span className="sr-only">حذف</span>
      </ConfirmSubmitButton>
    </>
  );
}

export default async function RepoPage({
  params,
  searchParams,
}: {
  params: Promise<{ repo: string }>;
  searchParams: Promise<{ q?: string; token?: string; error?: string }>;
}) {
  const session = await requireSession();
  const { repo } = await params;
  const { q, token, error } = await searchParams;

  let items: Awaited<ReturnType<typeof searchComponents>>["items"] = [];
  let continuationToken: string | null = null;
  let fetchError: string | null = null;

  try {
    const result = await searchComponents(session, {
      repository: repo,
      q: q || undefined,
      continuationToken: token,
    });
    items = result.items;
    continuationToken = result.continuationToken;
  } catch (err) {
    fetchError = (err as Error).message;
  }

  const nextQs = new URLSearchParams();
  if (q) nextQs.set("q", q);
  if (continuationToken) nextQs.set("token", continuationToken);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/packages">
            <ChevronRight /> پکیج‌ها
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="font-mono text-xl font-semibold" dir="ltr">
          {repo}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          کامپوننت‌های کش‌شده/منتشرشده در این ریپو. حذف یک نسخه‌ی خاص از اینجا انجام می‌شود.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {fetchError && (
        <Alert variant="destructive">
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      )}

      <form method="get" className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="جستجو با اسم پکیج…" className="ps-9" />
        </div>
        <Button type="submit" variant="outline">
          جستجو
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">نتایج</CardTitle>
          <CardDescription>
            {items.length > 0 ? `${items.length} آیتم` : "—"}
            {continuationToken ? " (صفحه‌بندی فعال — ادامه در صفحه‌ی بعد)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 && !fetchError ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {q ? `چیزی برای «${q}» پیدا نشد.` : "این ریپو هنوز چیزی کش نکرده."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم</TableHead>
                  <TableHead>نسخه</TableHead>
                  <TableHead>حجم</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => {
                  const size = c.assets.reduce((s, a) => s + (a.fileSize ?? 0), 0);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-64 truncate font-mono text-sm" title={c.name}>
                        {c.group ? `${c.group}/${c.name}` : c.name}
                      </TableCell>
                      <TableCell>
                        {c.version ? (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {c.version}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {size ? formatBytes(size) : "—"}
                      </TableCell>
                      <TableCell>
                        <DeleteCell id={c.id} repo={repo} q={q} name={c.name} version={c.version} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(continuationToken || token) && (
        <div className="flex items-center justify-between">
          {token ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/packages/${encodeURIComponent(repo)}${q ? `?q=${encodeURIComponent(q)}` : ""}`}>
                <ChevronRight /> صفحه‌ی اول
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {continuationToken && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/packages/${encodeURIComponent(repo)}?${nextQs.toString()}`}>
                بعدی
              </Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
