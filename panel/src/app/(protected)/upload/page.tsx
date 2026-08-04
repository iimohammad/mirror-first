import { requireSession } from "@/lib/session";
import { listRepositories, type UploadableFormat } from "@/lib/nexus";
import { uploadAction } from "./actions";

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
    <div>
      <h2>آپلود پکیج</h2>
      <p className="muted">
        فقط برای pypi/npm/raw hosted — داکر با این روش آپلود نمی‌شود، با{" "}
        <code>docker push</code> به <code>push.&lt;domain&gt;</code> منتشرش کن (به PACKAGES.md
        نگاه کن).
      </p>

      {error && <div className="alert danger">{error}</div>}
      {ok && (
        <div
          className="alert"
          style={{ background: "var(--ok-bg)", color: "var(--ok)", border: "1px solid var(--ok)" }}
        >
          {ok}
        </div>
      )}

      {!repos ? (
        <div className="alert danger">اتصال به Nexus برقرار نشد.</div>
      ) : targets.length === 0 ? (
        <p className="alert warn">
          هیچ ریپوی hosted ای پیدا نشد — <code>provision-hosted.sh</code> را روی سرور خارج زده‌ای؟
        </p>
      ) : (
        <form
          action={uploadAction}
          className="card"
          style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}
        >
          <label>
            ریپوی مقصد
            <select name="repository" required style={{ display: "block", width: "100%", marginTop: 4 }}>
              {targets.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} ({r.format})
                </option>
              ))}
            </select>
          </label>
          <label>
            دایرکتوری (فقط برای raw)
            <input
              name="directory"
              placeholder="مثلا debs"
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          <label>
            فایل
            <input name="file" type="file" required style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <button type="submit" className="primary">
            آپلود
          </button>
        </form>
      )}
    </div>
  );
}
