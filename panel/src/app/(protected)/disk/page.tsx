import { requireSession } from "@/lib/session";
import { getDiskInfo } from "@/lib/disk";
import { listBlobStores, listTasks } from "@/lib/nexus";
import { formatBytes } from "@/lib/format";
import { ConfirmSubmitButton } from "../_components/ConfirmSubmitButton";
import { runTaskAction } from "./actions";

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

  return (
    <div>
      <h2>دیسک و Cleanup</h2>
      {error && <div className="alert danger">{error}</div>}
      {ok && (
        <div
          className="alert"
          style={{ background: "var(--ok-bg)", color: "var(--ok)", border: "1px solid var(--ok)" }}
        >
          {ok}
        </div>
      )}

      <div className="stats-grid">
        <div className="card stat">
          <span className="value">
            {disk.nexusDataBytes != null ? formatBytes(disk.nexusDataBytes) : "—"}
          </span>
          <span className="label">مصرف nexus_data</span>
        </div>
        <div className="card stat">
          <span className="value">
            {disk.nginxCacheBytes != null ? formatBytes(disk.nginxCacheBytes) : "—"}
          </span>
          <span className="label">کش nginx</span>
        </div>
        <div className="card stat">
          <span className="value">{formatBytes(disk.filesystemFreeBytes)}</span>
          <span className="label">فضای آزاد دیسک</span>
        </div>
        <div className="card stat">
          <span className="value">{formatBytes(disk.filesystemTotalBytes)}</span>
          <span className="label">حجم کل دیسک</span>
        </div>
      </div>

      <p className="muted">
        «کش nginx» نسخه‌ی دومی از آرتیفکت‌های داغ است، جدا از nexus_data، و سقف حجمش را
        <code> MIRROR_CACHE_MAX_SIZE</code> در <code>.env</code> تعیین می‌کند. هرچه از آنجا سرو شود
        اصلاً به نکسس نمی‌رسد، پس در سقف روزانه‌ی درخواست‌های Community Edition هم شمرده نمی‌شود.
      </p>

      {blobStores && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Blob Store ها</h3>
          <table>
            <thead>
              <tr>
                <th>اسم</th>
                <th>نوع</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {blobStores.map((b) => (
                <tr key={b.name}>
                  <td>{b.name}</td>
                  <td>{b.type ?? "—"}</td>
                  <td>
                    {b.unavailable ? (
                      <span className="badge danger">غیرفعال</span>
                    ) : (
                      <span className="badge ok">آماده</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>تسک‌های پاک‌سازی</h3>
        {tasks === null && <p className="alert danger">لیست تسک‌ها در دسترس نیست.</p>}
        {tasks && cleanupTasks.length === 0 && (
          <p className="muted">
            هیچ تسک Cleanup ای در نکسس تعریف نشده. از پنل ادمین نکسس بساز: Administration →
            Repository → Cleanup Policies، بعد Administration → System → Tasks.
          </p>
        )}
        {cleanupTasks.map((t) => (
          <div
            key={t.id}
            className="row"
            style={{
              justifyContent: "space-between",
              padding: "8px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div>
              <div>{t.name}</div>
              <div className="muted">
                وضعیت: {t.currentState}
                {t.lastRunResult ? ` — آخرین اجرا: ${t.lastRunResult}` : ""}
              </div>
            </div>
            <form action={runTaskAction}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="name" value={t.name} />
              <ConfirmSubmitButton confirmText={`تسک «${t.name}» همین حالا اجرا شود؟`}>
                اجرای دستی
              </ConfirmSubmitButton>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
