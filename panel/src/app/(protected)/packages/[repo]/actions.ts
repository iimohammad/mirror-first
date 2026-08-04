"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { deleteComponent } from "@/lib/nexus";

export async function deleteComponentAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const repo = String(formData.get("repo") ?? "");
  const q = String(formData.get("q") ?? "");

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);

  try {
    await deleteComponent(session, id);
  } catch (err) {
    qs.set("error", (err as Error).message);
  }
  redirect(`/packages/${encodeURIComponent(repo)}?${qs.toString()}`);
}
