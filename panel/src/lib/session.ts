import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { cache } from "react";
import { DATA_DIR, SESSION_COOKIE, SESSION_TTL_MS } from "./config";
import { readJson, updateJson } from "./json-store";
import { encrypt, decrypt } from "./crypto";

interface SessionRecord {
  id: string;
  nexusUsername: string;
  nexusPasswordEnc: string;
  createdAt: number;
  expiresAt: number;
}

export interface NexusCreds {
  username: string;
  password: string;
}

const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

export async function createSession(username: string, password: string): Promise<void> {
  const id = randomUUID();
  const now = Date.now();
  await updateJson<SessionRecord[]>(SESSIONS_FILE, [], (cur) => {
    // ضمنی سشن‌های منقضی را هم پاک می‌کنیم تا فایل بی‌نهایت بزرگ نشود.
    const alive = cur.filter((s) => s.expiresAt > now);
    return [
      ...alive,
      {
        id,
        nexusUsername: username,
        nexusPasswordEnc: encrypt(password),
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS,
      },
    ];
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);
  if (!id) return;
  await updateJson<SessionRecord[]>(SESSIONS_FILE, [], (cur) => cur.filter((s) => s.id !== id));
}

// هم layout و هم هر page زیرمجموعه‌اش مستقل سشن را می‌خواهند (لایه‌ها در
// App Router داده را به children پاس نمی‌دهند)؛ cache() این را per-request
// یک‌بار محاسبه می‌کند تا فایل سشن چندبار در یک ریکوئست خوانده/decrypt نشود.
export const getSession = cache(async (): Promise<NexusCreds | null> => {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const all = await readJson<SessionRecord[]>(SESSIONS_FILE, []);
  const record = all.find((s) => s.id === id);
  if (!record || record.expiresAt < Date.now()) return null;

  try {
    return { username: record.nexusUsername, password: decrypt(record.nexusPasswordEnc) };
  } catch {
    // کلید رمزنگاری عوض شده یا داده خراب است — سشن را نامعتبر بدان.
    return null;
  }
});

export async function requireSession(): Promise<NexusCreds> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
