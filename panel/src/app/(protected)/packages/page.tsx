import Link from "next/link";
import { ArrowLeft, PackageOpen } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getRepository, listRepositories, type RepoSummary } from "@/lib/nexus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FORMAT_LABELS: Record<string, string> = {
  docker: "داکر",
  apt: "APT",
  pypi: "PyPI",
  npm: "npm",
  go: "Go",
  raw: "Raw",
};

function TypeBadge({ type }: { type: RepoSummary["type"] }) {
  if (type === "hosted") return <Badge>hosted</Badge>;
  if (type === "group") return <Badge variant="secondary">group</Badge>;
  return <Badge variant="outline">proxy</Badge>;
}

export default async function PackagesPage() {
  const session = await requireSession();
  const repos = await listRepositories(session).catch(() => null);

  if (!repos) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-8 text-center text-sm text-destructive">
          اتصال به Nexus برقرار نشد.
        </CardContent>
      </Card>
    );
  }

  // وضعیت online هر ریپو از endpoint جزئیات می‌آید (در لیست نیست).
  const online = new Map<string, boolean>();
  await Promise.all(
    repos.map(async (r) => {
      const detail = await getRepository(session, r.format, r.type, r.name).catch(() => null);
      online.set(r.name, detail?.online ?? false);
    })
  );

  const groups = new Map<string, RepoSummary[]>();
  for (const r of repos) {
    const list = groups.get(r.format) ?? [];
    list.push(r);
    groups.set(r.format, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">پکیج‌ها</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          هر فرمت (داکر، apt، pypi، npm، go، raw) جدا فهرست شده. روی «مرور» بزن تا
          کامپوننت‌های همان ریپو را جستجو یا حذف کنی.
        </p>
      </div>

      {[...groups.entries()].map(([format, list]) => (
        <Card key={format}>
          <CardHeader>
            <CardTitle>{FORMAT_LABELS[format] ?? format}</CardTitle>
            <CardDescription>{list.length} ریپو</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-mono text-sm">{r.name}</TableCell>
                    <TableCell>
                      <TypeBadge type={r.type} />
                    </TableCell>
                    <TableCell>
                      {online.get(r.name) ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-emerald-600/30 text-emerald-700 dark:text-emerald-400"
                        >
                          <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                          آنلاین
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-muted-foreground" />
                          نامشخص
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/packages/${encodeURIComponent(r.name)}`}>
                          مرور <ArrowLeft />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {repos.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <PackageOpen className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            هیچ ریپویی پیدا نشد — <code className="rounded bg-muted px-1 py-0.5 text-xs">provision.sh</code> را روی
            سرور زده‌ای؟
          </p>
        </div>
      )}
    </div>
  );
}
