"use server";

import { redirect } from "next/navigation";
import { verifyAdminCreds } from "@/lib/nexus";
import { createSession } from "@/lib/session";

function fail(message: string): never {
  redirect("/login?error=" + encodeURIComponent(message));
}

export async function login(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) fail("یوزرنیم و رمز را وارد کن");

  let ok: boolean;
  try {
    ok = await verifyAdminCreds({ username, password });
  } catch {
    fail("اتصال به Nexus برقرار نشد — سرویس نکسس بالا نیست یا در دسترس نیست");
  }

  // فقط حسابی که privilege ادمین دارد می‌تواند وارد شود — پنل از همان
  // یوزر/پس نکسس برای همه‌ی درخواست‌های بعدی به REST API استفاده می‌کند.
  if (!ok) fail("یوزرنیم یا رمز اشتباه است، یا این حساب دسترسی ادمین ندارد");

  await createSession(username, password);
  redirect("/");
}
