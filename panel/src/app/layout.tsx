import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "پنل میرور",
  description: "مدیریت IP allowlist و پکیج‌های میرور",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
