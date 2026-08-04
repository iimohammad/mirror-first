import { statfs } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NEXUS_DATA_PATH } from "./config";

const execFileAsync = promisify(execFile);

export interface DiskInfo {
  nexusDataBytes: number | null;
  filesystemTotalBytes: number;
  filesystemFreeBytes: number;
}

export async function getDiskInfo(): Promise<DiskInfo> {
  const [fsStat, duResult] = await Promise.all([
    statfs(NEXUS_DATA_PATH),
    // busybox du از -b (بایت) پشتیبانی نمی‌کند، فقط -k (کیلوبایت) — قابل
    // اعتمادتر است روی هر دو busybox و coreutils.
    execFileAsync("du", ["-sk", NEXUS_DATA_PATH]).catch(() => null),
  ]);

  const kb = duResult ? parseInt(duResult.stdout.split(/\s+/)[0] ?? "", 10) : NaN;

  return {
    nexusDataBytes: Number.isFinite(kb) ? kb * 1024 : null,
    filesystemTotalBytes: fsStat.blocks * fsStat.bsize,
    filesystemFreeBytes: fsStat.bavail * fsStat.bsize,
  };
}
