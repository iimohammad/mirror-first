"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listRepositories, uploadComponent, type UploadableFormat } from "@/lib/nexus";

const UPLOADABLE_FORMATS = new Set<UploadableFormat>(["pypi", "npm", "raw"]);

export async function uploadAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const repository = String(formData.get("repository") ?? "");
  const directory = String(formData.get("directory") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/upload?error=" + encodeURIComponent("فایلی انتخاب نشده"));
  }

  const repos = await listRepositories(session).catch(() => []);
  const target = repos.find((r) => r.name === repository);
  if (!target || !UPLOADABLE_FORMATS.has(target.format as UploadableFormat)) {
    redirect("/upload?error=" + encodeURIComponent("ریپوی مقصد نامعتبر است"));
  }

  try {
    await uploadComponent(session, repository, target.format as UploadableFormat, file, directory);
  } catch (err) {
    redirect("/upload?error=" + encodeURIComponent((err as Error).message));
  }

  redirect("/upload?ok=" + encodeURIComponent(`آپلود شد: ${file.name}`));
}
