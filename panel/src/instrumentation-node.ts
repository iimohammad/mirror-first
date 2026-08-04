// این فایل فقط از instrumentation.ts و فقط زیر Node runtime دینامیک import
// می‌شود (نه استاتیک) — وگرنه باندلر تلاش می‌کند برای Edge runtime هم
// همین فایل را بسازد و روی process.exit وارنینگ می‌دهد.
export function checkPanelSessionSecret(): void {
  const secret = process.env.PANEL_SESSION_SECRET;
  if (!secret) {
    console.error(
      "✘ PANEL_SESSION_SECRET تنظیم نشده. با `openssl rand -hex 32` بساز، در .env بگذار و پنل را دوباره بالا بیاور."
    );
    process.exit(1);
  }
  if (Buffer.from(secret, "hex").length !== 32) {
    console.error("✘ PANEL_SESSION_SECRET باید ۳۲ بایت (۶۴ کاراکتر hex) باشد.");
    process.exit(1);
  }
}
