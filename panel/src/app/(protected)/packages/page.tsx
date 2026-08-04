import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listRepositories, type RepoSummary } from "@/lib/nexus";

export default async function PackagesPage() {
  const session = await requireSession();
  const repos = await listRepositories(session).catch(() => null);

  if (!repos) {
    return <div className="alert danger">اتصال به Nexus برقرار نشد.</div>;
  }

  const groups = new Map<string, RepoSummary[]>();
  for (const r of repos) {
    const list = groups.get(r.format) ?? [];
    list.push(r);
    groups.set(r.format, list);
  }

  return (
    <div>
      <h2>پکیج‌ها</h2>
      <p className="muted">
        هر فرمت (داکر، apt، pypi، npm، go، raw) جدا فهرست شده. روی «مرور» بزن تا کامپوننت‌های
        همان ریپو را جستجو یا حذف کنی.
      </p>

      {[...groups.entries()].map(([format, list]) => (
        <div className="card" key={format}>
          <h3 style={{ marginTop: 0 }}>{format}</h3>
          <table>
            <thead>
              <tr>
                <th>اسم</th>
                <th>نوع</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>
                    <span
                      className={`badge ${
                        r.type === "hosted" ? "ok" : r.type === "group" ? "warn" : "muted"
                      }`}
                    >
                      {r.type}
                    </span>
                  </td>
                  <td>
                    <Link href={`/packages/${encodeURIComponent(r.name)}`}>مرور</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
