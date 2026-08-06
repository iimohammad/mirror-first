export const NEXUS_URL = process.env.NEXUS_URL ?? "http://nexus:8081";
export const DATA_DIR = process.env.DATA_DIR ?? "/data";
export const ACL_CONF_PATH = process.env.ACL_CONF_PATH ?? "/shared/acl.conf";
// allowlist پروکسی SNI. اگر سرویس sniproxy روشن نباشد، این فایل فقط نوشته
// می‌شود و کسی نمی‌خواندش — بی‌ضرر است، پس شرطی‌اش نمی‌کنیم.
export const SNI_ALLOW_PATH = process.env.SNI_ALLOW_PATH ?? "/shared/sni-allow.conf";
export const NEXUS_DATA_PATH = process.env.NEXUS_DATA_PATH ?? "/nexus-data";
// کش nginx (فقط-خواندنی مانت شده). دایرکتوری‌اش را خود nginx با مالکیت یوزر
// worker می‌سازد، پس تا اولین بالا آمدن nginx ممکن است اصلاً وجود نداشته باشد.
export const NGINX_CACHE_PATH = process.env.NGINX_CACHE_PATH ?? "/nginx-cache/cache";

export const SESSION_COOKIE = "panel_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // ۱۲ ساعت
