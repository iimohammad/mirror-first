import { statfs } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NEXUS_DATA_PATH, NGINX_CACHE_PATH } from "./config";

const execFileAsync = promisify(execFile);

export interface DiskInfo {
  nexusDataBytes: number | null;
  nginxCacheBytes: number | null;
  filesystemTotalBytes: number | null;
  filesystemFreeBytes: number | null;
}

// busybox du از -b (بایت) پشتیبانی نمی‌کند، فقط -k (کیلوبایت) — قابل
// اعتمادتر است روی هر دو busybox و coreutils.
async function duBytes(path: string): Promise<number | null> {
  const result = await execFileAsync("du", ["-sk", path]).catch(() => null);
  const kb = result ? parseInt(result.stdout.split(/\s+/)[0] ?? "", 10) : NaN;
  return Number.isFinite(kb) ? kb * 1024 : null;
}

export async function getDiskInfo(): Promise<DiskInfo> {
  // statfs در لوکال/ویندوز یا قبل از اولین بالا آمدن والیوم‌ها ممکن است
  // مسیر را پیدا نکند — null یعنی «الان در دسترس نیست»، نه بهانه برای 500.
  const fsStat = await statfs(NEXUS_DATA_PATH).catch(() => null);
  const [nexusDataBytes, nginxCacheBytes] = await Promise.all([
    duBytes(NEXUS_DATA_PATH),
    // تا اولین بار که nginx بالا بیاید این مسیر وجود ندارد؛ null یعنی
    // «هنوز چیزی نیست»، نه خطا.
    duBytes(NGINX_CACHE_PATH),
  ]);

  return {
    nexusDataBytes,
    nginxCacheBytes,
    filesystemTotalBytes: fsStat ? fsStat.blocks * fsStat.bsize : null,
    filesystemFreeBytes: fsStat ? fsStat.bavail * fsStat.bsize : null,
  };
}
