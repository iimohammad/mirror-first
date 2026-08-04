import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ACL_CONF_PATH, DATA_DIR } from "./config";
import { readJson, updateJson } from "./json-store";

export interface AllowedIp {
  id: string;
  cidr: string;
  label: string;
  createdAt: string;
}

const IPS_FILE = path.join(DATA_DIR, "ips.json");

// این مقدار مستقیم داخل یک بلاک geo نگین‌اکس نوشته می‌شود؛ ورودی نامعتبر
// یعنی کل nginx.conf از پارس شدن می‌افتد و کل میرور بالا نمی‌آید یا reload
// شکست می‌خورد. فقط IPv4 با پیشوند CIDR اختیاری (nginx geo هر دو فرم را
// قبول می‌کند).
const CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d{1,2}))?$/;

export function validateCidr(input: string): string {
  const s = input.trim();
  const m = CIDR_RE.exec(s);
  if (!m) {
    throw new Error("فرمت IP نامعتبر است — مثلاً 185.51.200.10 یا 91.99.0.0/16");
  }
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  if (octets.some((o) => o > 255)) {
    throw new Error("هر بخش IP باید بین 0 تا 255 باشد");
  }
  if (m[6] !== undefined && Number(m[6]) > 32) {
    throw new Error("پیشوند CIDR باید بین 0 تا 32 باشد");
  }
  return s;
}

function sanitizeLabel(label: string): string {
  // کامنت nginx تا انتهای خط ادامه دارد؛ newline باعث می‌شود خط بعدیِ بلاک
  // geo (که باید یک عبارت آی‌پی معتبر باشد) شکسته و کل کانفیگ نامعتبر شود.
  const clean = label.trim().replace(/[\r\n]/g, " ").slice(0, 80);
  if (!clean) throw new Error("برچسب نمی‌تواند خالی باشد");
  return clean;
}

export async function listIps(): Promise<AllowedIp[]> {
  return readJson<AllowedIp[]>(IPS_FILE, []);
}

export async function addIp(cidrInput: string, labelInput: string): Promise<AllowedIp[]> {
  const cidr = validateCidr(cidrInput);
  const label = sanitizeLabel(labelInput);
  const list = await updateJson<AllowedIp[]>(IPS_FILE, [], (cur) => {
    if (cur.some((x) => x.cidr === cidr)) {
      throw new Error("این IP از قبل در لیست هست");
    }
    return [...cur, { id: randomUUID(), cidr, label, createdAt: new Date().toISOString() }];
  });
  await writeAclConf(list);
  return list;
}

export async function removeIp(id: string): Promise<AllowedIp[]> {
  const list = await updateJson<AllowedIp[]>(IPS_FILE, [], (cur) => cur.filter((x) => x.id !== id));
  await writeAclConf(list);
  return list;
}

const ACL_HEADER = `# ---------------------------------------------------------------------------
# لیست IP هایی که اجازه‌ی استفاده از میرور را دارند.
#
# ⚠️  این فایل را پنل مدیریت می‌کند (/panel/ips). ویرایش دستی‌اش دفعه‌ی بعد که
#     کسی از پنل IP اضافه یا حذف کند از دست می‌رود.
#
# ⚠️  پیش‌فرض «همه ممنوع» است (fail closed). تا وقتی IP سرورهایت را از پنل
#     اضافه نکنی، همه چیز 403 می‌گیرد.
#
# اگر بازش بگذاری، ظرف چند ساعت به‌عنوان open proxy پیدا و سوءاستفاده می‌شود
# و ترافیک/آی‌پی سرورت می‌سوزد.
# ---------------------------------------------------------------------------

geo $mirror_denied {
    default         1;      # 1 = denied

    127.0.0.1/32    0;
    172.16.0.0/12   0;      # شبکه داخلی داکر روی همین سرور
`;

const ACL_FOOTER = `}

# اگر IP ثابت نداری: به‌جای IP از Basic Auth استفاده کن
# (htpasswd بساز و دو خط auth_basic را در 20-nexus.conf.template باز کن).
`;

async function writeAclConf(list: AllowedIp[]): Promise<void> {
  const body =
    list.length > 0
      ? "\n" +
        list.map((x) => `    ${x.cidr.padEnd(18)} 0;   # ${x.label}`).join("\n") +
        "\n"
      : "\n    # ⬇️ از پنل (/panel/ips) اضافه کن\n";

  const content = ACL_HEADER + body + ACL_FOOTER;

  // این فایل تک‌تکی از هاست bind mount شده، هم توی این کانتینر هم توی
  // nginx. نوشتن با الگوی معمولِ tmp+rename اینجا اشتباه است: چون دایرکتوری
  // بالادستش mount نشده (فقط خود فایل)، rename با خطای cross-device (EXDEV)
  // شکست می‌خورد؛ و حتی اگر می‌خورد، rename یک inode جدید می‌سازد که mount
  // جداگانه‌ی nginx روی همان مسیر آن را نمی‌بیند. writeFile ساده روی همان
  // inode موجود truncate+write می‌کند، که هر دو مشکل را کنار می‌زند.
  await fs.writeFile(ACL_CONF_PATH, content, "utf8");
}
