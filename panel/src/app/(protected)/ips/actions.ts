"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { addIp, removeIp } from "@/lib/ip-store";

export async function addIpAction(formData: FormData): Promise<void> {
  await requireSession();
  const cidr = String(formData.get("cidr") ?? "");
  const label = String(formData.get("label") ?? "");
  try {
    await addIp(cidr, label);
  } catch (err) {
    redirect("/ips?error=" + encodeURIComponent((err as Error).message));
  }
  redirect("/ips");
}

export async function removeIpAction(formData: FormData): Promise<void> {
  await requireSession();
  const id = String(formData.get("id") ?? "");
  try {
    await removeIp(id);
  } catch (err) {
    redirect("/ips?error=" + encodeURIComponent((err as Error).message));
  }
  redirect("/ips");
}
