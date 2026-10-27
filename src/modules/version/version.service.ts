import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { join } from "path";
import * as fs from "fs";
import * as os from "os";
// dockerode 为 CommonJS，避免 default 导入问题
const Docker = require("dockerode");

/** 获取可用的 Docker socket 路径 */
function getDockerSocketPath(): string | null {
  if (process.env.DOCKER_HOST) {
    const m = process.env.DOCKER_HOST.match(/^unix:\/\/(.+)$/);
    if (m) return m[1];
  }
  const candidates = [
    "/var/run/docker.sock",
    join(os.homedir(), ".docker", "run", "docker.sock"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function parseVersion(v: string): number[] {
  const s = String(v || "0")
    .replace(/^v/i, "")
    .trim();
  return s.split(".").map((n) => parseInt(n, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export interface ImageRef {
  /** 注册中心主机名，Docker Hub 为 docker.io */
  registry: string;
  /** 不含注册中心的仓库路径，如 library/apiforge */
  repository: string;
  tag: string;
  digest: string;
  /** 原始字符串 */
  ref: string;
}

export interface UpdateCheckResult {
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  releaseUrl: string | null;
  source: "manifest" | "dockerhub" | "registry" | "env" | null;
  image: string | null;
  /** digest：比较 latest 镜像摘要；version：旧的语义化版本比较 */
  mode: "digest" | "version" | null;
  currentDigest?: string | null;
  latestDigest?: string | null;
}

const DOCKER_HUB_HOSTS = new Set(["docker.io", "index.docker.io", "registry-1.docker.io"]);

/**
 * 解析镜像引用，正确处理 `registry:5000/ns/repo:tag` 这类带端口的写法。
 * 不依赖 docker 命令，便于单测。
 */
export function parseImageRef(value: string): ImageRef | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let rest = raw;
  let digest = "";
  const atIndex = rest.indexOf("@");
  if (atIndex >= 0) {
    digest = rest.slice(atIndex + 1);
    rest = rest.slice(0, atIndex);
  }
  const lastSlash = rest.lastIndexOf("/");
  const lastColon = rest.lastIndexOf(":");
  let tag = "";
  if (lastColon > lastSlash) {
    tag = rest.slice(lastColon + 1);
    rest = rest.slice(0, lastColon);
  }
  const parts = rest.split("/");
  let registry = "docker.io";
  if (
    parts.length > 1 &&
    (parts[0].includes(".") || parts[0].includes(":") || parts[0] === "localhost")
  ) {
    registry = parts.shift() as string;
  }
  const repository = parts.join("/");
  return { registry, repository, tag, digest, ref: raw };
}

/** 给镜像换上指定 tag，保留注册中心与仓库路径 */
export function withTag(ref: ImageRef | null, tag: string): string | null {
  if (!ref) return null;
  const host = ref.registry === "docker.io" ? "" : `${ref.registry}/`;
  return `${host}${ref.repository}:${tag}`;
}

/** 去掉 tag 的仓库地址，用于拼接版本号 */
export function repoPathOf(ref: ImageRef | null): string | null {
  if (!ref) return null;
  return ref.registry === "docker.io" ? ref.repository : `${ref.registry}/${ref.repository}`;
}

/** Docker inspect 返回的 Name 带前导斜杠，API 调用时需要去掉 */
export function normalizeContainerName(value: unknown): string {
  return String(value || "").trim().replace(/^\/+/, "");
}

/** Docker Hub 官方镜像短名需要补全 library/ 前缀 */
export function registryRepository(ref: ImageRef | null): string {
  if (!ref) return "";
  if (ref.registry === "docker.io" && !ref.repository.includes("/")) {
    return `library/${ref.repository}`;
  }
  return ref.repository;
}

/**
 * 从镜像的 RepoDigests 中挑出属于「配置的镜像仓库」的摘要。
 * 只认主源/备选源的仓库路径：本地 `docker compose build` 产出的镜像只带 apiforge@sha256:...，
 * 那是单平台构建的 manifest 摘要，与远端多架构清单摘要本就不可比，拿来比较会永久误报「有更新」。
 * 匹配不到返回 null，由调用方回退到版本号比较。
 */
export function matchLocalDigest(
  repoDigests: string[],
  repoPaths: Iterable<string>,
): string | null {
  const allowed = new Set(repoPaths);
  if (allowed.size === 0) return null;
  for (const item of repoDigests || []) {
    const [repo, digest] = String(item).split("@");
    if (digest && allowed.has(repo)) return digest;
  }
  return null;
}

/**
 * 从 Binds 条目取出容器内挂载路径，去掉 :rw / :ro / :z 等模式后缀。
 * 原容器的 Binds 通常带 :rw，直接用 endsWith(':/app/data') 判重会漏判。
 */
export function mountTargetOf(bind: string): string {
  const parts = String(bind || "").split(":");
  const last = parts[parts.length - 1];
  // 模式后缀可能逗号分隔（如 :ro,z），逐项确认后才整体去掉
  const isMode = (token: string) =>
    /^(ro|rw|z|Z|shared|slave|private|rshared|rslave|rprivate)$/.test(token);
  if (parts.length > 2 && last.split(",").every(isMode)) {
    parts.pop();
  }
  return parts[parts.length - 1] || "";
}

/**
 * 合并原容器 Binds 与更新必需的挂载，按容器内路径判重。
 * 重复挂载同一路径会让 Docker 以 `Duplicate mount point` 拒绝创建容器，
 * 更新助手因此静默失败、容器停留在旧镜像。
 */
export function mergeUpdateBinds(binds: string[], dataSource: string): string[] {
  const merged = (binds || []).slice();
  if (!merged.some((item) => mountTargetOf(item) === "/app/data")) {
    merged.push(`${dataSource}:/app/data`);
  }
  if (!merged.some((item) => mountTargetOf(item) === "/var/run/docker.sock")) {
    merged.push("/var/run/docker.sock:/var/run/docker.sock");
  }
  return merged;
}

/** 拆分 Docker 多路复用日志（非 TTY 时每帧 8 字节头），拿到纯文本 */
export function demuxDockerLogs(buf: Buffer): string {
  if (!buf || buf.length === 0) return "";
  if (buf[0] > 2) return buf.toString("utf8");
  const chunks: string[] = [];
  let off = 0;
  while (off + 8 <= buf.length) {
    const size = buf.readUInt32BE(off + 4);
    if (size === 0 || off + 8 + size > buf.length) break;
    chunks.push(buf.subarray(off + 8, off + 8 + size).toString("utf8"));
    off += 8 + size;
  }
  return chunks.length ? chunks.join("") : buf.toString("utf8");
}

/** 从容器 inspect 结果里找出 /app/data 对应的数据源（命名卷或宿主机路径） */
export function dataMountSource(info: any): string | null {
  const mount = (info?.Mounts || []).find((item: any) => item?.Destination === "/app/data");
  if (mount) return mount.Name || mount.Source || null;
  const bind = (info?.HostConfig?.Binds || []).find((item: any) =>
    String(item).endsWith(":/app/data"),
  );
  if (bind) return String(bind).slice(0, -":/app/data".length) || null;
  return null;
}

/** 读取宿主机实际映射端口，避免自定义端口在更新后丢失 */
export function hostPortOf(info: any, fallback = "3000"): string {
  const bindings = info?.HostConfig?.PortBindings?.["3000/tcp"];
  const hostPort = Array.isArray(bindings) ? bindings[0]?.HostPort : null;
  if (hostPort) return String(hostPort);
  const exposed = info?.NetworkSettings?.Ports?.["3000/tcp"];
  const mapped = Array.isArray(exposed) ? exposed[0]?.HostPort : null;
  return mapped ? String(mapped) : fallback;
}

/**
 * 生成拉取候选列表：主镜像优先，其后是 DOCKER_IMAGE_MIRRORS。
 * 备选可以写完整镜像（含仓库路径），也可以只写注册中心前缀。
 */
export function buildImageCandidates(params: {
  primary: string;
  mirrors?: string;
  tag: string;
}): { ref: ImageRef; image: string }[] {
  const primaryRef = parseImageRef(params.primary);
  if (!primaryRef) return [];
  const results: { ref: ImageRef; image: string }[] = [];
  const seen = new Set<string>();
  const push = (ref: ImageRef | null) => {
    if (!ref) return;
    const image = withTag(ref, params.tag);
    if (!image || seen.has(image)) return;
    seen.add(image);
    results.push({ ref, image });
  };
  push(primaryRef);
  for (const entry of String(params.mirrors || "").split(",")) {
    const value = entry.trim();
    if (!value) continue;
    const parsed = parseImageRef(value);
    if (!parsed) continue;
    const looksLikeRegistryOnly = !value.includes("/") || value.endsWith("/");
    if (looksLikeRegistryOnly) {
      const host = value.replace(/\/+$/, "");
      push({ ...primaryRef, registry: host, ref: `${host}/${primaryRef.repository}` });
    } else {
      // 完整镜像：沿用主镜像的仓库路径，只替换注册中心
      push({ ...primaryRef, registry: parsed.registry, repository: parsed.repository, ref: value });
    }
  }
  return results;
}

/**
 * 生成更新助手容器内执行的脚本（单行，node -e 直接执行）。
 * 注意：这里会被压成一行，脚本内不能出现 // 行注释，否则会把后续代码整行注释掉。
 */
export function buildUpdaterScript(): string {
    return `
      const D = require('dockerode');
      const Docker = D.default || D;
      const fs = require('fs');
      const d = new Docker({ socketPath: '/var/run/docker.sock' });
      const LOG = '/app/data/update.log';
      const log = (...a) => {
        const line = new Date().toISOString() + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
        console.log(line);
        try { fs.appendFileSync(LOG, line + '\\n'); } catch (_) {}
      };
      const parse = (value, fallback) => { try { return JSON.parse(value); } catch (_) { return fallback; } };
      (async () => {
        try {
          const name = process.env.UPDATER_CONTAINER_NAME || 'apiforge';
          const img = process.env.UPDATER_IMAGE;
          const port = process.env.UPDATER_HOST_PORT || process.env.UPDATER_PORT || '3000';
          const vol = process.env.UPDATER_DATA_SOURCE || 'apiforge-data';
          const dockerImg = process.env.DOCKER_IMAGE || img;
          log('[update] start', JSON.stringify({ name, img, port, vol }));
          const old = d.getContainer(name);
          const oldInfo = await old.inspect();
          const oldImage = oldInfo.Config?.Image || oldInfo.Image || '';
          const originalEnv = parse(process.env.UPDATER_ORIGINAL_ENV, []);
          const extra = parse(process.env.UPDATER_EXTRA_ENV, {});
          const binds = parse(process.env.UPDATER_BINDS, []).slice();
          const extraHosts = parse(process.env.UPDATER_EXTRA_HOSTS, []);
          const restartPolicy = parse(process.env.UPDATER_RESTART_POLICY, { Name: 'unless-stopped' });
          const overrides = Object.assign(
            { NODE_ENV: 'production', TZ: 'Asia/Shanghai', DB_TYPE: extra.DB_TYPE || 'sqlite', DB_SQLITE_PATH: extra.DB_SQLITE_PATH || '/app/data/apiforge.db' },
            extra,
            { DOCKER_IMAGE: dockerImg, DOCKER_DATA_VOLUME: vol },
          );
          const env = originalEnv.filter((line) => {
            const key = String(line).split('=')[0];
            return !(key in overrides);
          });
          for (const key of Object.keys(overrides)) {
            const value = overrides[key];
            if (value !== undefined && value !== null && value !== '') env.push(key + '=' + value);
          }
          log('[update] binds', JSON.stringify(binds));
          const backupName = name + '-old-' + Date.now();
          await old.rename({ name: backupName });
          log('[update] old container renamed to', backupName);
          const backup = d.getContainer(backupName);
          try { await backup.stop(); } catch (_) {}
          try {
            const c = await d.createContainer({
              Image: img,
              name: name,
              ExposedPorts: { '3000/tcp': {} },
              Env: env,
              Labels: oldInfo.Config?.Labels || {},
              HostConfig: {
                PortBindings: { '3000/tcp': [{ HostPort: String(port) }] },
                Binds: binds,
                ExtraHosts: extraHosts.length ? extraHosts : undefined,
                RestartPolicy: restartPolicy && restartPolicy.Name ? restartPolicy : { Name: 'unless-stopped' },
                NetworkMode: process.env.UPDATER_NETWORK_MODE && process.env.UPDATER_NETWORK_MODE !== 'default' ? process.env.UPDATER_NETWORK_MODE : undefined,
              },
            });
            await c.start();
            log('[update] new container started from', img);
          } catch (e) {
            log('[update] create failed', String(e && e.message ? e.message : e));
            try { await d.getContainer(name).remove({ force: true }); } catch (_) {}
            try { await backup.rename({ name: name }); await d.getContainer(name).start(); log('[update] rolled back to old container'); } catch (_) {}
            throw e;
          }
          try { await backup.remove({ force: true }); } catch (_) {}
          log('[update] done, replaced image', oldImage);
        } catch (e) { log('[update] failed', String(e && e.message ? e.message : e)); process.exit(1); }
      })();
    `.replace(/\n\s+/g, " ");
}

@Injectable()
export class VersionService {
  private currentVersion: string;
  private manifestCache: { version: string | null; image: string | null; t: number } | null = null;

  constructor() {
    try {
      const pkgPath = join(__dirname, "..", "..", "..", "package.json");
      const pkg = require(pkgPath);
      this.currentVersion = pkg?.version || "1.0.0";
    } catch {
      this.currentVersion = "1.0.0";
    }
  }

  private get primaryImage(): string {
    return String(process.env.DOCKER_IMAGE || "apiforge:latest").trim();
  }

  /** 从 cgroup 读取当前容器 ID（兼容 Docker、containerd、Podman） */
  private selfContainerId(): string | null {
    try {
      const cgroup = fs.readFileSync("/proc/self/cgroup", "utf8");
      return cgroup.match(/[0-9a-f]{64}/)?.[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * 找到当前应用所在的容器。
   * 容器名可以被 --name 改成任意值，不能假设一定是 apiforge。
   */
  private async findSelfContainer(docker: any): Promise<any | null> {
    const candidates = [
      process.env.DOCKER_CONTAINER_NAME,
      this.selfContainerId(),
      os.hostname(),
      process.env.HOSTNAME,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    for (const candidate of Array.from(new Set(candidates))) {
      try {
        const info = await docker.getContainer(candidate).inspect();
        if (info?.Id) return info;
      } catch {
        /* 尝试下一个候选 */
      }
    }

    try {
      const list = await docker.listContainers();
      const hostname = os.hostname();
      const match = list.find((item: any) => {
        const id = String(item?.Id || "");
        const names = (item?.Names || []).map((name: string) => normalizeContainerName(name));
        return (hostname && id.startsWith(hostname)) || names.includes(hostname);
      });
      if (match?.Id) return await docker.getContainer(match.Id).inspect();
      // 自定义 --hostname 时，容器 ID 不会出现在 cgroup 里，按 Config.Hostname 反查
      for (const item of list) {
        try {
          const info = await docker.getContainer(item.Id).inspect();
          if (hostname && info?.Config?.Hostname === hostname) return info;
        } catch {
          /* 忽略单个容器 inspect 失败 */
        }
      }
    } catch {
      /* 忽略列容器失败 */
    }
    return null;
  }

  /** 私有仓库认证，供 docker pull 与 registry 接口复用 */
  private authConfig() {
    const username = String(process.env.DOCKER_REGISTRY_USERNAME || "").trim();
    const password = String(process.env.DOCKER_REGISTRY_PASSWORD || "").trim();
    if (!username || !password) return undefined;
    return { username, password, serveraddress: parseImageRef(this.primaryImage)?.registry };
  }

  /**
   * 版本清单：一个静态 JSON，形如 {"version":"1.0.9","image":"registry.example.com/ns/apiforge:1.0.9"}。
   * 放在对象存储/CDN 上即可，不依赖 Docker Hub 是否可达。
   */
  private async fetchManifest(): Promise<{ version: string | null; image: string | null }> {
    const url = String(process.env.VERSION_MANIFEST_URL || "").trim();
    if (!url) return { version: null, image: null };
    if (this.manifestCache && Date.now() - this.manifestCache.t < 300000) {
      return { version: this.manifestCache.version, image: this.manifestCache.image };
    }
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) return { version: null, image: null };
      const data: any = await res.json();
      const version = String(data?.version ?? data?.latest ?? "").replace(/^v/i, "").trim();
      const valid = /^\d+\.\d+/.test(version) ? version : null;
      const image = typeof data?.image === "string" && data.image.trim() ? data.image.trim() : null;
      this.manifestCache = { version: valid, image, t: Date.now() };
      return { version: valid, image };
    } catch {
      return { version: null, image: null };
    }
  }

  /** 从 Docker Hub 的 tags 接口取最新语义化版本（仅在主镜像位于 Docker Hub 时使用） */
  private async fetchLatestFromDockerHub(ref: ImageRef | null): Promise<string | null> {
    if (!ref || !DOCKER_HUB_HOSTS.has(ref.registry)) return null;
    const repoPath = registryRepository(ref);
    const cacheKey = `version:dh:${repoPath}`;
    const cached = (global as any)[cacheKey] as { v: string; t: number } | undefined;
    if (cached && Date.now() - cached.t < 300000) return cached.v;

    try {
      const url = `https://hub.docker.com/v2/repositories/${repoPath}/tags?page_size=50&ordering=-last_updated`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { results?: { name: string }[] };
      const tags = data?.results || [];
      const semverRe = /^v?(\d+\.\d+(?:\.\d+)?)$/;
      let latest: string | null = null;
      for (const t of tags) {
        const match = t.name.match(semverRe);
        if (match && (!latest || isNewer(match[1], latest))) {
          latest = match[1];
        }
      }
      if (latest) (global as any)[cacheKey] = { v: latest, t: Date.now() };
      return latest;
    } catch {
      return null;
    }
  }

  /**
   * 私有/自建仓库的 tags 接口（Registry V2）。公开仓库可匿名读取，
   * 私有仓库依赖 DOCKER_REGISTRY_USERNAME/PASSWORD。
   */
  /**
   * 自建仓库常不开 TLS（内网 Harbor 等），本机地址或显式开启时走 http。
   * DOCKER_REGISTRY_INSECURE=true 可强制 http。
   */
  private registryBase(registry: string): string {
    const insecure = ["1", "true", "yes"].includes(
      String(process.env.DOCKER_REGISTRY_INSECURE || "").trim().toLowerCase(),
    );
    const isLoopback = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(registry);
    const host = DOCKER_HUB_HOSTS.has(registry) ? "registry-1.docker.io" : registry;
    return `${insecure || isLoopback ? "http" : "https"}://${host}`;
  }

  /**
   * 按 Docker Registry V2 的认证流程换取 Bearer token：
   * 从 401 响应的 WWW-Authenticate 里取 realm/service，再用账号密码换 token。
   */
  private async registryBearerToken(
    registry: string,
    repository: string,
    challenge: Response,
  ): Promise<string | null> {
    // 公开仓库允许匿名换 token（不带头），因此没有配置账号时也继续尝试
    const auth = this.authConfig();
    const header = challenge.headers.get("www-authenticate") || "";
    const realm = /realm="([^"]+)"/.exec(header)?.[1];
    if (!realm) return null;
    const service = /service="([^"]+)"/.exec(header)?.[1];
    try {
      const tokenUrl = new URL(realm);
      if (service) tokenUrl.searchParams.set("service", service);
      tokenUrl.searchParams.set("scope", `repository:${repository}:pull`);
      const res = await fetch(tokenUrl, {
        signal: AbortSignal.timeout(8000),
        headers: auth
          ? {
              Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`,
            }
          : undefined,
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data?.token || data?.access_token || null;
    } catch {
      return null;
    }
  }

  private async fetchLatestFromRegistry(ref: ImageRef | null): Promise<string | null> {
    if (!ref || DOCKER_HUB_HOSTS.has(ref.registry)) return null;
    const cacheKey = `version:reg:${ref.registry}/${ref.repository}`;
    const cached = (global as any)[cacheKey] as { v: string; t: number } | undefined;
    if (cached && Date.now() - cached.t < 300000) return cached.v;

    try {
      const repository = registryRepository(ref);
    const url = `${this.registryBase(ref.registry)}/v2/${repository}/tags/list?n=100`;
      let res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.status === 401) {
        // 阿里云 ACR、Harbor 等用 Bearer token，Basic 认证拿不到 tags
        const token = await this.registryBearerToken(ref.registry, repository, res);
        if (!token) return null;
        res = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (!res.ok) return null;
      const data: any = await res.json();
      const tags: string[] = Array.isArray(data?.tags) ? data.tags : [];
      const semverRe = /^v?(\d+\.\d+(?:\.\d+)?)$/;
      let latest: string | null = null;
      for (const t of tags) {
        const match = String(t).match(semverRe);
        if (match && (!latest || isNewer(match[1], latest))) latest = match[1];
      }
      if (latest) (global as any)[cacheKey] = { v: latest, t: Date.now() };
      return latest;
    } catch {
      return null;
    }
  }

  /** 读取远端 latest 标签的 manifest 摘要（HEAD 优先，不支持时回退 GET） */
  private async fetchRemoteDigest(ref: ImageRef | null): Promise<string | null> {
    if (!ref) return null;
    const tag = ref.tag || "latest";
    const cacheKey = `digest:${ref.registry}/${ref.repository}:${tag}`;
    const cached = (global as any)[cacheKey] as { v: string; t: number } | undefined;
    if (cached && Date.now() - cached.t < 60000) return cached.v;

    const repository = registryRepository(ref);
    const url = `${this.registryBase(ref.registry)}/v2/${repository}/manifests/${encodeURIComponent(tag)}`;
    const accept = [
      "application/vnd.docker.distribution.manifest.list.v2+json",
      "application/vnd.oci.image.index.v1+json",
      "application/vnd.docker.distribution.manifest.v2+json",
      "application/vnd.oci.image.manifest.v1+json",
    ].join(", ");
    const request = (method: "HEAD" | "GET", token?: string | null) =>
      fetch(url, {
        method,
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: accept,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

    try {
      let token: string | null = null;
      let res = await request("HEAD");
      if (res.status === 401) {
        token = await this.registryBearerToken(ref.registry, repository, res);
        if (!token) return null;
        res = await request("HEAD", token);
      }
      if (!res.ok && res.status !== 405) return null;
      let digest = res.headers.get("docker-content-digest");
      if (!digest || res.status === 405) {
        res = await request("GET", token);
        if (res.status === 401) {
          token = await this.registryBearerToken(ref.registry, repository, res);
          if (!token) return null;
          res = await request("GET", token);
        }
        if (!res.ok) return null;
        digest = res.headers.get("docker-content-digest");
        if (!digest) {
          const body = Buffer.from(await res.arrayBuffer());
          digest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
        }
      }
      if (!digest) return null;
      (global as any)[cacheKey] = { v: digest, t: Date.now() };
      return digest;
    } catch {
      return null;
    }
  }

  /** 读取当前运行镜像的 registry 摘要；本地构建、没有 RepoDigests 时返回 null */
  private async fetchLocalDigest(): Promise<string | null> {
    const socketPath = getDockerSocketPath();
    if (!socketPath) return null;
    try {
      const docker = new Docker({ socketPath });
      const selfInfo = await this.findSelfContainer(docker);
      const imageRef = selfInfo?.Image || selfInfo?.Config?.Image || this.primaryImage;
      const info = await docker.getImage(imageRef).inspect();
      const repoDigests: string[] = Array.isArray(info?.RepoDigests) ? info.RepoDigests : [];
      // 只认「配置的镜像仓库」下的摘要，见 matchLocalDigest 说明
      return matchLocalDigest(repoDigests, this.configuredRepoPaths());
    } catch {
      return null;
    }
  }

  /** 主源 + 备选源的全部仓库路径（不含 tag），用于匹配本地 RepoDigests */
  private configuredRepoPaths(): string[] {
    return buildImageCandidates({
      primary: this.primaryImage,
      mirrors: process.env.DOCKER_IMAGE_MIRRORS,
      tag: "latest",
    })
      .map((candidate) => repoPathOf(candidate.ref))
      .filter((value): value is string => !!value);
  }

  /** latest 跟踪模式：远端 latest 摘要与当前运行镜像摘要不同即视为有更新 */
  private async checkLatestDigest(): Promise<UpdateCheckResult | null> {
    const primaryRef = parseImageRef(this.primaryImage);
    if (!primaryRef) return null;
    const image = withTag({ ...primaryRef, tag: "latest" }, "latest");
    const candidates = buildImageCandidates({
      primary: this.primaryImage,
      mirrors: process.env.DOCKER_IMAGE_MIRRORS,
      tag: "latest",
    });
    let latestDigest: string | null = null;
    let source: "dockerhub" | "registry" | null = null;
    for (const candidate of candidates) {
      const digest = await this.fetchRemoteDigest(candidate.ref);
      if (digest) {
        latestDigest = digest;
        source = DOCKER_HUB_HOSTS.has(candidate.ref.registry) ? "dockerhub" : "registry";
        break;
      }
    }
    const currentDigest = await this.fetchLocalDigest();
    if (!latestDigest || !currentDigest) return null;
    return {
      current: this.currentVersion,
      latest: "latest",
      hasUpdate: latestDigest !== currentDigest,
      releaseUrl: process.env.VERSION_RELEASE_URL || null,
      source,
      image,
      mode: "digest",
      currentDigest,
      latestDigest,
    };
  }

  async checkUpdate(): Promise<UpdateCheckResult> {
    const track = String(process.env.UPDATE_TRACK || "latest").trim().toLowerCase();
    if (track !== "version") {
      const latest = await this.checkLatestDigest();
      if (latest) return latest;
    }
    return this.checkVersionUpdate();
  }

  private async checkVersionUpdate(): Promise<UpdateCheckResult> {
    const releaseUrl = process.env.VERSION_RELEASE_URL || null;
    const empty = (): UpdateCheckResult => ({
      current: this.currentVersion,
      latest: null,
      hasUpdate: false,
      releaseUrl,
      source: null,
      image: null,
      mode: null,
    });

    // 1. 版本清单优先：完全绕开 Docker Hub，适合国内/内网
    const manifest = await this.fetchManifest();
    if (manifest.version) {
      return {
        current: this.currentVersion,
        latest: manifest.version,
        hasUpdate: isNewer(manifest.version, this.currentVersion),
        releaseUrl,
        source: "manifest",
        image: manifest.image,
        mode: "version",
      };
    }

    // 2. 主源 + 备选源的 tags，取其中最高版本（主源不可用时仍能发现更新）
    const primaryRef = parseImageRef(this.primaryImage);
    const candidates = buildImageCandidates({
      primary: this.primaryImage,
      mirrors: process.env.DOCKER_IMAGE_MIRRORS,
      tag: "latest",
    });
    let latest: string | null = null;
    let source: "dockerhub" | "registry" | null = null;
    for (const candidate of candidates) {
      const isHub = DOCKER_HUB_HOSTS.has(candidate.ref.registry);
      const version = isHub
        ? await this.fetchLatestFromDockerHub(candidate.ref)
        : await this.fetchLatestFromRegistry(candidate.ref);
      if (version && (!latest || isNewer(version, latest))) {
        latest = version;
        source = isHub ? "dockerhub" : "registry";
      }
    }
    if (latest) {
      return {
        current: this.currentVersion,
        latest,
        hasUpdate: isNewer(latest, this.currentVersion),
        releaseUrl,
        source,
        // 统一用主源地址；拉取时会按主源 → 备选源回退
        image: withTag(primaryRef, latest),
        mode: "version",
      };
    }

    // 4. 环境变量兜底
    const envLatest = process.env.VERSION_LATEST?.trim();
    if (!envLatest || !/^\d+\.\d+/.test(envLatest)) return empty();
    return {
      current: this.currentVersion,
      latest: envLatest,
      hasUpdate: isNewer(envLatest, this.currentVersion),
      releaseUrl,
      source: "env",
      image: withTag(parseImageRef(this.primaryImage), envLatest),
      mode: "version",
    };
  }

  /** 更新后需要带进新容器的配置，避免新容器丢失更新源等设置 */
  private forwardedEnv(): Record<string, string> {
    const keys = [
      "DOCKER_IMAGE_MIRRORS",
      "VERSION_MANIFEST_URL",
      "VERSION_RELEASE_URL",
      "VERSION_LATEST",
      "DOCKER_REGISTRY_USERNAME",
      "DOCKER_REGISTRY_PASSWORD",
      "DOCKER_DATA_VOLUME",
      "DOCKER_CONTAINER_NAME",
      "UPDATE_TRACK",
      "DB_TYPE",
      "DB_SQLITE_PATH",
      "PORT",
    ];
    const result: Record<string, string> = {};
    for (const key of keys) {
      const value = String(process.env[key] ?? "").trim();
      if (value) result[key] = value;
    }
    return result;
  }

  /** 依次尝试各镜像源拉取，返回成功的镜像与来源 */
  private async pullWithFallback(
    docker: any,
    candidates: { image: string; ref: ImageRef }[],
  ): Promise<{ image: string; errors: string[] }> {
    const authconfig = this.authConfig();
    const errors: string[] = [];
    for (const candidate of candidates) {
      try {
        await new Promise<void>((resolve, reject) => {
          const onPull = (err: Error | null, stream: any) => {
            if (err) return reject(err);
            docker.modem.followProgress(stream, (e: Error | null) => (e ? reject(e) : resolve()));
          };
          if (authconfig) docker.pull(candidate.image, { authconfig }, onPull);
          else docker.pull(candidate.image, onPull);
        });
        return { image: candidate.image, errors };
      } catch (err: any) {
        const detail = err?.message || String(err);
        errors.push(`${candidate.image}：${detail}`);
        console.error(`[Version] pull failed ${candidate.image}:`, detail);
      }
    }
    throw new Error(errors.join("；"));
  }

  async triggerDockerUpdate(): Promise<{
    ok: boolean;
    message: string;
    manualCommands?: string;
    image?: string;
  }> {
    const primary = this.primaryImage;
    const primaryRef = parseImageRef(primary);
    const port = process.env.PORT || "3000";
    let containerName = normalizeContainerName(process.env.DOCKER_CONTAINER_NAME) || "apiforge";
    let dataSource = process.env.DOCKER_DATA_VOLUME || "apiforge-data";
    let hostPort = port;
    const socketMount = "-v /var/run/docker.sock:/var/run/docker.sock";

    // 目标镜像：latest 摘要模式直接使用 :latest；版本模式沿用版本 tag
    const { latest, image: updateImage, mode } = await this.checkUpdate();
    const tag = latest && /^\d+\.\d+/.test(latest) ? latest : "";
    const targetImage =
      updateImage ||
      (tag ? withTag(primaryRef, tag) : withTag(primaryRef, "latest")) ||
      primary;

    const candidates = buildImageCandidates({
      primary: targetImage,
      mirrors: process.env.DOCKER_IMAGE_MIRRORS,
      tag: parseImageRef(targetImage)?.tag || "latest",
    });
    const manualCommands = () =>
      `docker pull ${candidates[0]?.image || targetImage}\ndocker stop ${containerName} && docker rm -f ${containerName}\ndocker run -d --name ${containerName} --restart unless-stopped -p ${hostPort}:3000 --add-host host.docker.internal:host-gateway -v "${dataSource}:/app/data" ${socketMount} ${candidates[0]?.image || targetImage}`;
    let manualCmds = manualCommands();

    const socketPath = getDockerSocketPath();
    if (!socketPath) {
      return {
        ok: false,
        message:
          "无法连接 Docker。请确保：1) Docker 已启动；2) 若在容器内运行，需挂载 -v /var/run/docker.sock:/var/run/docker.sock",
        manualCommands: manualCmds,
      };
    }

    let docker: InstanceType<typeof Docker>;
    try {
      docker = new Docker({ socketPath });
      await docker.ping();
    } catch (err: any) {
      const detail = err?.message || err?.reason || String(err);
      console.error("[Version] Docker ping failed:", detail);
      return {
        ok: false,
        message: `无法连接 Docker：${detail}。请确保：1) Docker 已启动；2) 若在容器内运行，需挂载 -v /var/run/docker.sock:/var/run/docker.sock`,
        manualCommands: manualCmds,
      };
    }

    // 容器名可以被 --name 改成任意值，必须按当前容器自身信息重建
    const selfInfo = await this.findSelfContainer(docker);
    if (!selfInfo) {
      return {
        ok: false,
        message:
          "无法识别当前运行容器，已停止自动更新。请设置 DOCKER_CONTAINER_NAME 指定容器名，或使用手动命令重建容器。",
        manualCommands: manualCmds,
      };
    }
    containerName = normalizeContainerName(selfInfo.Name) || containerName;
    dataSource = dataMountSource(selfInfo) || dataSource;
    hostPort = hostPortOf(selfInfo, hostPort);
    manualCmds = manualCommands();

    // 使用 dockerode API：pull → 启动 helper 容器执行 stop/rm/create/start
    // helper 复用目标镜像（含 node + dockerode），执行完即退出
    // 注意：脚本会被压成单行执行，内部不能出现 // 行注释，否则会把后续代码整行注释掉
    const updaterScript = buildUpdaterScript();

    let pulledImage = targetImage;
    try {
      const pulled = await this.pullWithFallback(docker, candidates);
      pulledImage = pulled.image;
    } catch (err: any) {
      return {
        ok: false,
        message: `拉取镜像失败：${err?.message || "未知错误"}。可配置 DOCKER_IMAGE_MIRRORS 指定备用源，或 VERSION_MANIFEST_URL 走对象存储清单。`,
        manualCommands: manualCmds,
      };
    }

    // latest 摘要模式固定回到主源 :latest；版本模式沿用实际拉取镜像的版本 tag
    let dockerImageEnv = mode === "digest" ? targetImage : pulledImage;
    if (mode !== "digest" && pulledImage.endsWith(":latest")) {
      try {
        const info = await docker.getImage(pulledImage).inspect();
        const ver =
          info?.Config?.Labels?.["org.opencontainers.image.version"] ||
          info?.Config?.Labels?.version;
        const ref = parseImageRef(pulledImage);
        if (ver && /^\d+\.\d+/.test(ver) && ref) {
          dockerImageEnv = withTag(ref, ver) as string;
        }
      } catch {
        /* 忽略 */
      }
    }

    try {
      // 清理可能残留的上次更新 helper
      try {
        const oldHelper = docker.getContainer("apiforge-updater");
        await oldHelper.remove({ force: true });
      } catch {
        /* 不存在则忽略 */
      }
      const helper = await docker.createContainer({
        Image: pulledImage,
        name: "apiforge-updater",
        Cmd: ["node", "-e", updaterScript],
        Env: [
          `UPDATER_IMAGE=${pulledImage}`,
          `UPDATER_CONTAINER_NAME=${containerName}`,
          `UPDATER_DATA_SOURCE=${dataSource}`,
          `UPDATER_HOST_PORT=${hostPort}`,
          `UPDATER_PORT=${port}`,
          `DOCKER_IMAGE=${dockerImageEnv}`,
          `UPDATER_EXTRA_ENV=${JSON.stringify(this.forwardedEnv())}`,
          `UPDATER_ORIGINAL_ENV=${JSON.stringify(selfInfo.Config?.Env || [])}`,
          `UPDATER_BINDS=${JSON.stringify(mergeUpdateBinds(selfInfo.HostConfig?.Binds || [], dataSource))}`,
          `UPDATER_EXTRA_HOSTS=${JSON.stringify(selfInfo.HostConfig?.ExtraHosts || [])}`,
          `UPDATER_RESTART_POLICY=${JSON.stringify(selfInfo.HostConfig?.RestartPolicy || { Name: "unless-stopped" })}`,
          `UPDATER_NETWORK_MODE=${selfInfo.HostConfig?.NetworkMode || ""}`,
        ],
        HostConfig: {
          // 数据卷也挂进助手：失败时把过程写进 <数据卷>/update.log，容器被删也能查
          Binds: [`${socketPath}:/var/run/docker.sock`, `${dataSource}:/app/data`],
        },
      });
      await helper.start();

      // 助手失败得很快（1 秒内），短暂等待后确认状态。
      // 否则接口会返回「已启动」，而实际上什么都没发生——之前就是这样静默失败的。
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const state = await helper.inspect();
        if (state?.State?.Status === "exited" && state.State.ExitCode !== 0) {
          let detail = "";
          try {
            const raw = await helper.logs({ stdout: true, stderr: true, tail: 40 });
            detail = demuxDockerLogs(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw))).trim();
          } catch {
            /* 日志读取失败时退回退出码 */
          }
          console.error("[Version] updater failed:", detail || `exit ${state.State.ExitCode}`);
          return {
            ok: false,
            message: `更新失败：${detail || `更新助手退出码 ${state.State.ExitCode}`}`,
            manualCommands: manualCmds,
          };
        }
      } catch {
        /* 助手仍在运行或已被移除，按成功处理 */
      }
    } catch (err: any) {
      console.error("[Version] Docker update failed:", err?.message);
      return {
        ok: false,
        message: `更新启动失败：${err?.message || "未知错误"}`,
        manualCommands: manualCmds,
      };
    }

    return {
      ok: true,
      message: "更新已启动，新容器将在约 30 秒内就绪，请稍后刷新页面",
      image: pulledImage,
    };
  }
}
