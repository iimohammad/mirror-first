import { requireSession } from "@/lib/session";
import { listIps } from "@/lib/ip-store";
import { addIpAction, removeIpAction } from "./actions";

export default async function IpsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSession();
  const { error } = await searchParams;
  const ips = await listIps();

  return (
    <div>
      <h2>مدیریت IP</h2>
      <p className="muted">
        این لیست به‌جای <code>nginx/acl.conf</code> منبع اصلی است — هر تغییری اینجا خودکار
        فایل را می‌سازد و nginx ظرف چند ثانیه reload می‌شود. ویرایش دستی فایل روی سرور با
        اولین تغییر از همین‌جا از بین می‌رود.
      </p>

      {error && <div className="alert danger">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>اضافه کردن IP</h3>
        <form action={addIpAction} className="row">
          <input
            name="cidr"
            placeholder="185.51.200.10 یا 91.99.0.0/16"
            required
            style={{ flex: 1, minWidth: 200 }}
          />
          <input
            name="label"
            placeholder="برچسب، مثلا سرور تهران ۱"
            required
            style={{ flex: 1, minWidth: 160 }}
          />
          <button type="submit" className="primary">
            اضافه کن
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>لیست فعلی ({ips.length})</h3>
        {ips.length === 0 ? (
          <p className="muted">هیچ IP ای اضافه نشده — میرور همه‌چیز را 403 می‌کند.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>برچسب</th>
                <th>IP / CIDR</th>
                <th>اضافه‌شده</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ips.map((ip) => (
                <tr key={ip.id}>
                  <td>{ip.label}</td>
                  <td>
                    <code>{ip.cidr}</code>
                  </td>
                  <td className="muted">{new Date(ip.createdAt).toLocaleString("fa-IR")}</td>
                  <td>
                    <form action={removeIpAction}>
                      <input type="hidden" name="id" value={ip.id} />
                      <button type="submit" className="danger">
                        حذف
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
