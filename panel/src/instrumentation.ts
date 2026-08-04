// Next.js این register() را یک‌بار موقع بالا آمدن سرور صدا می‌زند. اینجا
// PANEL_SESSION_SECRET را زود و با پیام واضح چک می‌کنیم — وگرنه خطا فقط
// موقع اولین تلاش لاگین دیده می‌شود و گمراه‌کننده است («رمزم اشتباهه؟»).
// با restart: unless-stopped در compose، process.exit یعنی crash-loop
// قابل مشاهده در `docker compose ps` تا وقتی درستش کنی.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkPanelSessionSecret } = await import("./instrumentation-node");
    checkPanelSessionSecret();
  }
}
