export const NEXUS_URL = process.env.NEXUS_URL ?? "http://nexus:8081";
export const DATA_DIR = process.env.DATA_DIR ?? "/data";
export const ACL_CONF_PATH = process.env.ACL_CONF_PATH ?? "/shared/acl.conf";
export const NEXUS_DATA_PATH = process.env.NEXUS_DATA_PATH ?? "/nexus-data";

export const SESSION_COOKIE = "panel_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // ۱۲ ساعت
