import * as fs from "fs";

/**
 * 容器内访问宿主机。
 *
 * APIForge 的用例执行、压测和 AI 调用都发生在服务进程内；当服务跑在 Docker 里时，
 * 环境里的 `127.0.0.1` 指向容器自身而不是宿主机，用户必须手写 host.docker.internal 才能连通。
 * 这里统一把回环地址改写成 `host.docker.internal`，让两种写法都能用。
 *
 * 关闭方式：APIFORGE_KEEP_LOOPBACK=true（保留原地址）
 * 运行环境覆盖：APIFORGE_IN_CONTAINER=true/false（默认自动探测）
 */

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "host.containers.internal",
]);

const HOST_GATEWAY = "host.docker.internal";

let detected: boolean | null = null;

function detectContainer(): boolean {
  if (process.env.KUBERNETES_SERVICE_HOST) return true;
  try {
    if (fs.existsSync("/.dockerenv")) return true;
  } catch {
    /* 非 Linux 或权限不足时忽略 */
  }
  try {
    if (fs.existsSync("/run/.containerenv")) return true;
  } catch {
    /* 同上 */
  }
  try {
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf8");
    if (/docker|kubepods|containerd|libpod/.test(cgroup)) return true;
  } catch {
    /* 容器外通常没有 /proc/1/cgroup 读取权限 */
  }
  return false;
}

export function runsInsideContainer(): boolean {
  const override = String(process.env.APIFORGE_IN_CONTAINER || "").trim().toLowerCase();
  if (TRUTHY.has(override)) return true;
  if (FALSY.has(override)) return false;
  if (detected === null) detected = detectContainer();
  return detected;
}

/** 仅用于测试：清空探测缓存 */
export function resetContainerDetection(): void {
  detected = null;
}

/**
 * 把回环地址改写成 host.docker.internal，保留协议、端口、路径与查询串。
 * 非容器环境、非回环地址或显式关闭时原样返回。
 */
export function rewriteLoopbackHost(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return raw;
  if (!runsInsideContainer()) return raw;
  if (TRUTHY.has(String(process.env.APIFORGE_KEEP_LOOPBACK || "").trim().toLowerCase())) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) return raw;
  if (url.hostname === HOST_GATEWAY) return raw;

  const credentials = url.username
    ? `${url.username}${url.password ? `:${url.password}` : ""}@`
    : "";
  const port = url.port ? `:${url.port}` : "";
  // 根路径不补斜杠，避免与 {{base_url}}/xxx 拼接出双斜杠
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.protocol}//${credentials}${HOST_GATEWAY}${port}${path}${url.search}${url.hash}`;
}
