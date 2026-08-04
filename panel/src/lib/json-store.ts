import { promises as fs } from "node:fs";
import path from "node:path";

// یک صف ساده‌ی per-file تا دو نوشتن هم‌زمان (مثلاً دو تب پنل باز) رکورد
// همدیگر را گم نکنند. برای این حجم داده (چند ده IP، چند سشن) کافی است؛
// نیازی به SQLite/native module نیست.
const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  locks.set(file, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function readFileOr<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.trim() ? (JSON.parse(raw) as T) : fallback;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeAtomic(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  return readFileOr(file, fallback);
}

// mutate اجرا می‌شود روی آخرین نسخه‌ی فایل؛ اگر throw کند، هیچ‌چیز نوشته
// نمی‌شود — برای اعتبارسنجی (مثلاً «این IP از قبل هست») همین‌جا throw کن.
export async function updateJson<T>(
  file: string,
  fallback: T,
  mutate: (data: T) => T
): Promise<T> {
  return withLock(file, async () => {
    const data = await readFileOr(file, fallback);
    const next = mutate(data);
    await writeAtomic(file, next);
    return next;
  });
}
