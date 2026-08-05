import { statfs } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NEXUS_DATA_PATH, NGINX_CACHE_PATH } from "./config";

const execFileAsync = promisify(execFile);

export interface DiskInfo {
  nexusDataBytes: number | null;
  nginxCacheBytes: number | null;
  filesystemTotalBytes: number;
  filesystemFreeBytes: number;
}

// busybox du از -b (بایت) پشتیبانی نمی‌کند، فقط -k (کیلوبایت) — قابل
// اعتمادتر است روی هر دو busybox و coreutils.
async function duBytes(path: string): Promise<number | null> {
  const result = await execFileAsync("du", ["-sk", path]).catch(() => null);
  const kb = result ? parseInt(result.stdout.split(/\s+/)[0] ?? "", 10) : NaN;
  return Number.isFinite(kb) ? kb * 1024 : null;
}

export async function getDiskInfo(): Promise<DiskInfo> {
  const [fsStat, nexusDataBytes, nginxCacheBytes] = await Promise.all([
    statfs(NEXUS_DATA_PATH),
    duBytes(NEXUS_DATA_PATH),
    // تا اولین بار که nginx بالا بیاید این مسیر وجود ندارد؛ null یعنی
    // «هنوز چیزی نیست»، نه خطا.
    duBytes(NGINX_CACHE_PATH),
  ]);

  return {
    nexusDataBytes,
    nginxCacheBytes,
    filesystemTotalBytes: fsStat.blocks * fsStat.bsize,
    filesystemFreeBytes: fsStat.bavail * fsStat.bsize,
  };
}
