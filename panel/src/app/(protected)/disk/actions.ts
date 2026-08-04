"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { runTask } from "@/lib/nexus";

export async function runTaskAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");

  try {
    await runTask(session, id);
  } catch (err) {
    redirect(
      "/disk?error=" + encodeURIComponent(`اجرای «${name}» شکست خورد: ${(err as Error).message}`)
    );
  }
  redirect(
    "/disk?ok=" + encodeURIComponent(`تسک «${name}» اجرا شد (در نکسس به‌صورت پس‌زمینه در جریان است).`)
  );
}
