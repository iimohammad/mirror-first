import { NEXUS_URL } from "./config";
import type { NexusCreds } from "./session";

export class NexusError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "NexusError";
  }
}

function authHeader(creds: NexusCreds): string {
  return "Basic " + Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
}

async function nexusFetch(
  creds: NexusCreds,
  urlPath: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader(creds));
  return fetch(`${NEXUS_URL}${urlPath}`, { ...init, headers, cache: "no-store" });
}

async function nexusJson<T>(creds: NexusCreds, urlPath: string, init?: RequestInit): Promise<T> {
  const res = await nexusFetch(creds, urlPath, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new NexusError(res.status, body || res.statusText);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * فقط کاربری که privilege ادمین دارد می‌تواند این endpoint را بخواند —
 * برای همین به‌عنوان چک «آیا این یوزر/پس یک ادمین معتبر نکسس است؟» استفاده
 * می‌شود، بدون اینکه نکسس یک endpoint اختصاصی «verify login» داشته باشد.
 */
export async function verifyAdminCreds(creds: NexusCreds): Promise<boolean> {
  try {
    const res = await nexusFetch(creds, "/service/rest/v1/security/anonymous");
    return res.ok;
  } catch {
    return false;
  }
}

export interface RepoSummary {
  name: string;
  format: string;
  type: "hosted" | "proxy" | "group";
  url: string;
}

export async function listRepositories(creds: NexusCreds): Promise<RepoSummary[]> {
  return nexusJson<RepoSummary[]>(creds, "/service/rest/v1/repositories");
}

export interface RepoDetail extends RepoSummary {
  online?: boolean;
  [key: string]: unknown;
}

// جزئیات (ازجمله online/offline) در endpoint فهرست نیست؛ باید per-repo بگیری.
export async function getRepository(
  creds: NexusCreds,
  format: string,
  type: string,
  name: string
): Promise<RepoDetail | null> {
  try {
    return await nexusJson<RepoDetail>(
      creds,
      `/service/rest/v1/repositories/${encodeURIComponent(format)}/${encodeURIComponent(
        type
      )}/${encodeURIComponent(name)}`
    );
  } catch (err) {
    if (err instanceof NexusError && err.status === 404) return null;
    throw err;
  }
}

export interface ComponentAsset {
  downloadUrl: string;
  path: string;
  id: string;
  repository: string;
  format: string;
  contentType?: string;
  fileSize?: number;
  lastModified?: string;
}

export interface ComponentItem {
  id: string;
  repository: string;
  format: string;
  group?: string;
  name: string;
  version?: string;
  assets: ComponentAsset[];
}

export interface SearchResult {
  items: ComponentItem[];
  continuationToken: string | null;
}

export async function searchComponents(
  creds: NexusCreds,
  opts: { repository?: string; q?: string; continuationToken?: string }
): Promise<SearchResult> {
  const params = new URLSearchParams();
  if (opts.repository) params.set("repository", opts.repository);
  if (opts.q) params.set("q", opts.q);
  if (opts.continuationToken) params.set("continuationToken", opts.continuationToken);
  return nexusJson<SearchResult>(creds, `/service/rest/v1/search?${params.toString()}`);
}

export async function deleteComponent(creds: NexusCreds, id: string): Promise<void> {
  const res = await nexusFetch(creds, `/service/rest/v1/components/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new NexusError(res.status, body || res.statusText);
  }
}

export type UploadableFormat = "pypi" | "npm" | "raw";

// آپلود عمومی نکسس فقط برای همین فرمت‌ها ساده است. داکر با REST آپلود
// نمی‌شود؛ باید docker push بزنی (PACKAGES.md).
export async function uploadComponent(
  creds: NexusCreds,
  repository: string,
  format: UploadableFormat,
  file: File,
  rawDirectory?: string
): Promise<void> {
  const form = new FormData();
  if (format === "pypi") {
    form.append("pypi.asset", file, file.name);
  } else if (format === "npm") {
    form.append("npm.asset", file, file.name);
  } else {
    form.append("raw.directory", rawDirectory?.trim() || "uploads");
    form.append("raw.asset1", file, file.name);
    form.append("raw.asset1.filename", file.name);
  }
  const res = await nexusFetch(
    creds,
    `/service/rest/v1/components?repository=${encodeURIComponent(repository)}`,
    { method: "POST", body: form }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new NexusError(res.status, body || res.statusText);
  }
}

// شکل دقیق پاسخ این endpoint بین نسخه‌های نکسس فرق دارد؛ فیلدها را اختیاری
// نگه می‌داریم و UI هرچه موجود بود را نشان می‌دهد.
export interface BlobStoreInfo {
  name: string;
  type?: string;
  unavailable?: boolean;
  blobCount?: number;
  totalSizeInBytes?: number;
  availableSpaceInBytes?: number;
  [key: string]: unknown;
}

export async function listBlobStores(creds: NexusCreds): Promise<BlobStoreInfo[]> {
  return nexusJson<BlobStoreInfo[]>(creds, "/service/rest/v1/blobstores");
}

export interface TaskInfo {
  id: string;
  name: string;
  type: string;
  currentState: string;
  lastRunResult?: string;
  message?: string;
}

// برخلاف /repositories و /blobstores (که آرایه‌ی خام برمی‌گردانند)، این
// endpoint مثل /search داخل {items, continuationToken} پیچیده شده — با یک
// نکسس واقعی چک شد، حدسی نیست.
export async function listTasks(creds: NexusCreds): Promise<TaskInfo[]> {
  const res = await nexusJson<{ items: TaskInfo[]; continuationToken: string | null }>(
    creds,
    "/service/rest/v1/tasks"
  );
  return res.items;
}

export async function runTask(creds: NexusCreds, id: string): Promise<void> {
  const res = await nexusFetch(creds, `/service/rest/v1/tasks/${encodeURIComponent(id)}/run`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new NexusError(res.status, body || res.statusText);
  }
}
