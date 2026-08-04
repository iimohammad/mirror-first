import Link from "next/link";
import { requireSession } from "@/lib/session";
import { logout } from "./logout/actions";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>پنل میرور</h1>
        <Link href="/">داشبورد</Link>
        <Link href="/ips">مدیریت IP</Link>
        <Link href="/packages">پکیج‌ها</Link>
        <Link href="/upload">آپلود</Link>
        <Link href="/disk">دیسک و Cleanup</Link>
        <form action={logout}>
          <p className="muted" style={{ marginBottom: 8, marginTop: 16 }}>
            {session.username}
          </p>
          <button type="submit" style={{ width: "100%" }}>
            خروج
          </button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
