import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listRepositories } from "@/lib/nexus";
import { listIps } from "@/lib/ip-store";

export default async function DashboardPage() {
  const session = await requireSession();
  const [repos, ips] = await Promise.all([
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
    <div>
      <h2>داشبورد</h2>

      {!repos && (
        <div className="alert danger">
          اتصال به Nexus برقرار نشد — لیست ریپوها در دسترس نیست.
        </div>
      )}

      <div className="stats-grid">
        <div className="card stat">
          <span className="value">{ips.length}</span>
          <span className="label">IP مجاز</span>
        </div>
        <div className="card stat">
          <span className="value">{repos?.length ?? "—"}</span>
          <span className="label">ریپازیتوری</span>
        </div>
        <div className="card stat">
          <span className="value">{byType?.hosted ?? 0}</span>
          <span className="label">hosted</span>
        </div>
        <div className="card stat">
          <span className="value">{byType?.proxy ?? 0}</span>
          <span className="label">proxy</span>
        </div>
        <div className="card stat">
          <span className="value">{byType?.group ?? 0}</span>
          <span className="label">group</span>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>دسترسی سریع</h3>
        <div className="row">
          <Link className="btn" href="/ips">
            مدیریت IP
          </Link>
          <Link className="btn" href="/packages">
            مرور پکیج‌ها
          </Link>
          <Link className="btn" href="/upload">
            آپلود پکیج
          </Link>
          <Link className="btn" href="/disk">
            مصرف دیسک
          </Link>
        </div>
      </div>
    </div>
  );
}
