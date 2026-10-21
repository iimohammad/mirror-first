// Mock Nexus server برای توسعه/تست لوکال پنل — بدون داکر و بدون نکسس واقعی.
// اجرا: npm run mock  (پورت 9191) — پنل را با .env.local به این آدرس وصل کن.
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 9191);
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";

// ---------------------------------------------------------------------------
// داده‌ی نمونه — هم‌شکل ریپوهایی که provision.sh / provision-hosted.sh می‌سازند
// ---------------------------------------------------------------------------
const REPOS = [
  { name: "docker-group", format: "docker", type: "group" },
  { name: "docker-proxy", format: "docker", type: "proxy" },
  { name: "apt-ubuntu-noble", format: "apt", type: "proxy" },
  { name: "pypi-group", format: "pypi", type: "group" },
  { name: "pypi-proxy", format: "pypi", type: "proxy" },
  { name: "pypi-hosted", format: "pypi", type: "hosted" },
  { name: "npm-group", format: "npm", type: "group" },
  { name: "npm-proxy", format: "npm", type: "proxy" },
  { name: "npm-hosted", format: "npm", type: "hosted" },
  { name: "go-proxy", format: "go", type: "proxy" },
  { name: "raw-github", format: "raw", type: "proxy" },
  { name: "raw-ghusercontent", format: "raw", type: "proxy" },
  { name: "raw-hosted", format: "raw", type: "hosted" },
];

const NAMES = [
  "nginx", "redis", "postgres", "rabbitmq", "clickhouse", "traefik", "vault",
  "consul", "grafana", "prometheus", "node", "python", "alpine", "ubuntu",
  "debian", "redis-commander", "minio", "memcached", "mariadb", "mongo",
];

// ~۵۰ کامپوننت داکر برای تست صفحه‌بندی + چند pypi/npm/raw
let seq = 0;
const uid = () => `mock-${String(++seq).padStart(4, "0")}`;

const DOCKER_COMPONENTS = NAMES.flatMap((base, i) =>
  ["latest", "1.27", "1.26"].slice(0, (i % 3) + 1).map((tag) => ({
    id: uid(),
    repository: i % 4 === 0 ? "docker-proxy" : "docker-group",
    format: "docker",
    group: base.includes("/") ? base.split("/")[0] : undefined,
    name: `library/${base}`,
    version: tag,
    assets: [
      {
        downloadUrl: `http://mock/repository/docker-group/v2/library/${base}/manifests/${tag}`,
        path: `v2/library/${base}/manifests/${tag}`,
        id: uid(),
        repository: "docker-group",
        format: "docker",
        contentType: "application/vnd.docker.distribution.manifest.v2+json",
        fileSize: 1_200_000 + i * 340_000,
        lastModified: new Date(Date.now() - i * 86_400_000).toISOString(),
      },
    ],
  }))
);

const PYPI_COMPONENTS = ["requests", "urllib3", "flask", "django", "fastapi"].map((n, i) => ({
  id: uid(),
  repository: "pypi-group",
  format: "pypi",
  name: n,
  version: `2.${i}.0`,
  assets: [{
    id: uid(), repository: "pypi-group", format: "pypi",
    path: `packages/${n}-${2 + i}.0-py3-none-any.whl`,
    downloadUrl: `http://mock/repository/pypi-group/packages/${n}-py3-none-any.whl`,
    contentType: "application/zip", fileSize: 500_000 + i * 100_000,
    lastModified: new Date().toISOString(),
  }],
}));

const NPM_COMPONENTS = ["typescript", "react", "next", "vite"].map((n, i) => ({
  id: uid(),
  repository: "npm-group",
  format: "npm",
  group: n === "react" ? "@types" : undefined,
  name: n,
  version: `5.${i}.3`,
  assets: [{
    id: uid(), repository: "npm-group", format: "npm",
    path: `/${n}/-/${n}-5.${i}.3.tgz`,
    downloadUrl: `http://mock/repository/npm-group/${n}/-/${n}.tgz`,
    contentType: "application/gzip", fileSize: 2_000_000 + i * 250_000,
    lastModified: new Date().toISOString(),
  }],
}));

const RAW_COMPONENTS = [
  { name: "owner/repo/releases/download/v1.0.0/app.tar.gz", version: "v1.0.0" },
  { name: "owner/repo/main/README.md", version: undefined },
].map((r) => ({
  id: uid(),
  repository: "raw-github",
  format: "raw",
  name: r.name,
  version: r.version,
  assets: [{
    id: uid(), repository: "raw-github", format: "raw",
    path: r.name, downloadUrl: `http://mock/repository/raw-github/${r.name}`,
    contentType: "application/octet-stream", fileSize: 42_000,
    lastModified: new Date().toISOString(),
  }],
}));

const COMPONENTS = [...DOCKER_COMPONENTS, ...PYPI_COMPONENTS, ...NPM_COMPONENTS, ...RAW_COMPONENTS];

const TASKS = [
  { id: "t1", name: "Cleanup docker-proxy", type: "repository.cleanup", currentState: "WAITING", lastRunResult: "OK", message: "3.70.1" },
  { id: "t2", name: "Cleanup apt-ubuntu-noble", type: "repository.cleanup", currentState: "WAITING", lastRunResult: "OK", message: "3.70.1" },
  { id: "t3", name: "Compact blob store", type: "blobstore.compact", currentState: "RUNNING", lastRunResult: undefined, message: "3.70.1" },
];

const BLOBSTORES = [
  { name: "default", type: "file", softQuota: null, blobCount: 48211, totalSizeInBytes: 41_900_000_000, availableSpaceInBytes: 58_100_000_000 },
  { name: "docker-blobs", type: "file", softQuota: null, blobCount: 130_522, totalSizeInBytes: 128_600_000_000, availableSpaceInBytes: 58_100_000_000 },
];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(payload);
}

function checkAuth(req) {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return false;
  const [user, pass] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

const PAGE_SIZE = 50;

function searchItems(url) {
  const repository = url.searchParams.get("repository");
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const token = url.searchParams.get("continuationToken");
  const offset = token ? parseInt(Buffer.from(token, "base64").toString("utf8"), 10) || 0 : 0;

  let list = COMPONENTS;
  if (repository) list = list.filter((c) => c.repository === repository);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));

  const page = list.slice(offset, offset + PAGE_SIZE);
  const nextToken = offset + PAGE_SIZE < list.length
    ? Buffer.from(String(offset + PAGE_SIZE)).toString("base64")
    : null;
  return { items: page, continuationToken: nextToken };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  console.log(`${new Date().toISOString().slice(11, 19)} ${req.method} ${p}${url.search}`);

  if (p === "/service/rest/v1/status") {
    return send(res, 200, { version: "3.70.1-01", edition: "COMMUNITY" });
  }

  if (p === "/service/rest/v1/security/anonymous") {
    if (!checkAuth(req)) return send(res, 401, { message: "bad credentials" });
    return send(res, 200, { enabled: true, userId: "anonymous", realmName: "NexusAuthorizingRealm" });
  }

  if (!checkAuth(req)) return send(res, 401, { message: "authentication required" });

  if (p === "/service/rest/v1/repositories" && req.method === "GET") {
    return send(res, 200, REPOS.map((r) => ({ ...r, url: `http://mock/repository/${r.name}`, attributes: {}, healthCheck: { enabled: false } })));
  }

  const repoDetail = /^\/service\/rest\/v1\/repositories\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(p);
  if (repoDetail && req.method === "GET") {
    const [, format, type, name] = repoDetail.map(decodeURIComponent);
    const found = REPOS.find((r) => r.format === format && r.type === type && r.name === name);
    if (!found) return send(res, 404, { message: "not found" });
    return send(res, 200, { ...found, url: `http://mock/repository/${found.name}`, online: true, storage: { blobStoreName: "default", strictContentTypeValidation: true } });
  }

  if (p === "/service/rest/v1/search" && req.method === "GET") {
    return send(res, 200, searchItems(url));
  }

  const delComp = /^\/service\/rest\/v1\/components\/(.+)$/.exec(p);
  if (delComp && req.method === "DELETE") {
    const id = decodeURIComponent(delComp[1]);
    const idx = COMPONENTS.findIndex((c) => c.id === id);
    if (idx === -1) return send(res, 404, { message: "component not found" });
    COMPONENTS.splice(idx, 1);
    return send(res, 204, "");
  }

  if (p === "/service/rest/v1/components" && req.method === "POST") {
    const repository = url.searchParams.get("repository");
    const repo = REPOS.find((r) => r.name === repository);
    if (!repo) return send(res, 400, { message: `repository ${repository} not found` });
    let size = 0;
    req.on("data", (chunk) => { size += chunk.length; });
    req.on("end", () => {
      console.log(`  ↳ upload به ${repository}: ${size} بایت`);
      if (size === 0) return send(res, 400, { message: "empty body" });
      send(res, 204, "");
    });
    return;
  }

  if (p === "/service/rest/v1/blobstores" && req.method === "GET") {
    return send(res, 200, BLOBSTORES);
  }

  if (p === "/service/rest/v1/tasks" && req.method === "GET") {
    return send(res, 200, { items: TASKS, continuationToken: null });
  }

  const runTask = /^\/service\/rest\/v1\/tasks\/([^/]+)\/run$/.exec(p);
  if (runTask && req.method === "POST") {
    const task = TASKS.find((t) => t.id === decodeURIComponent(runTask[1]));
    if (!task) return send(res, 404, { message: "task not found" });
    task.currentState = "RUNNING";
    setTimeout(() => { task.currentState = "WAITING"; task.lastRunResult = "OK"; }, 3000);
    return send(res, 204, "");
  }

  send(res, 404, { message: `no mock for ${req.method} ${p}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock nexus on http://127.0.0.1:${PORT} — ادمین: ${ADMIN_USER} / ${ADMIN_PASS}`);
});
