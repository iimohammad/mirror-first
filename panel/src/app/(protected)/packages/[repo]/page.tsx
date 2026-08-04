import Link from "next/link";
import { requireSession } from "@/lib/session";
import { searchComponents } from "@/lib/nexus";
import { formatBytes } from "@/lib/format";
import { ConfirmSubmitButton } from "../../_components/ConfirmSubmitButton";
import { deleteComponentAction } from "./actions";

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
    <div>
      <p>
        <Link href="/packages">← بازگشت</Link>
      </p>
      <h2>{repo}</h2>

      {error && <div className="alert danger">{error}</div>}
      {fetchError && <div className="alert danger">{fetchError}</div>}

      <form method="get" className="row" style={{ marginBottom: 16 }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="جستجو با اسم پکیج..."
          style={{ flex: 1, minWidth: 200 }}
        />
        <button type="submit">جستجو</button>
      </form>

      {items.length === 0 && !fetchError ? (
        <p className="muted">چیزی پیدا نشد.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>اسم</th>
              <th>نسخه</th>
              <th>حجم</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const size = c.assets.reduce((s, a) => s + (a.fileSize ?? 0), 0);
              return (
                <tr key={c.id}>
                  <td>{c.group ? `${c.group}/${c.name}` : c.name}</td>
                  <td>{c.version ?? "—"}</td>
                  <td className="muted">{size ? formatBytes(size) : "—"}</td>
                  <td>
                    <form action={deleteComponentAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="repo" value={repo} />
                      <input type="hidden" name="q" value={q ?? ""} />
                      <ConfirmSubmitButton
                        className="danger"
                        confirmText={`«${c.name}${c.version ? " " + c.version : ""}» حذف شود؟ اگر از proxy کش شده، دوباره دانلود می‌شود؛ اگر hosted است، فقط خودت داری‌اش.`}
                      >
                        حذف
                      </ConfirmSubmitButton>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {continuationToken && (
        <p>
          <Link href={`/packages/${encodeURIComponent(repo)}?${nextQs.toString()}`}>بعدی →</Link>
        </p>
      )}
    </div>
  );
}
