import { Injectable } from "@nestjs/common";
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
  private async fetchLatestFromDockerHub(): Promise<string | null> {
    const ref = parseImageRef(this.primaryImage);
    if (!ref || !DOCKER_HUB_HOSTS.has(ref.registry)) return null;
    const repoPath = ref.repository;
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
  private async fetchLatestFromRegistry(): Promise<string | null> {
    const ref = parseImageRef(this.primaryImage);
    if (!ref || DOCKER_HUB_HOSTS.has(ref.registry)) return null;
    const cacheKey = `version:reg:${ref.registry}/${ref.repository}`;
    const cached = (global as any)[cacheKey] as { v: string; t: number } | undefined;
    if (cached && Date.now() - cached.t < 300000) return cached.v;

    const auth = this.authConfig();
    try {
      const res = await fetch(
        `https://${ref.registry}/v2/${ref.repository}/tags/list?n=100`,
        {
          signal: AbortSignal.timeout(8000),
          headers: auth
            ? { Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}` }
            : undefined,
        },
      );
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

  async checkUpdate(): Promise<{
    current: string;
    latest: string | null;
    hasUpdate: boolean;
    releaseUrl: string | null;
    source: "manifest" | "dockerhub" | "registry" | "env" | null;
    image: string | null;
  }> {
    const releaseUrl = process.env.VERSION_RELEASE_URL || null;
    const empty = () => ({
      current: this.currentVersion,
      latest: null as string | null,
      hasUpdate: false,
      releaseUrl,
      source: null as any,
      image: null as string | null,
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
      };
    }

    // 2. Docker Hub tags（主镜像在 Docker Hub 时）
    const dhLatest = await this.fetchLatestFromDockerHub();
    if (dhLatest) {
      return {
        current: this.currentVersion,
        latest: dhLatest,
        hasUpdate: isNewer(dhLatest, this.currentVersion),
        releaseUrl,
        source: "dockerhub",
        image: withTag(parseImageRef(this.primaryImage), dhLatest),
      };
    }

    // 3. 私有仓库 tags
    const regLatest = await this.fetchLatestFromRegistry();
    if (regLatest) {
      return {
        current: this.currentVersion,
        latest: regLatest,
        hasUpdate: isNewer(regLatest, this.currentVersion),
        releaseUrl,
        source: "registry",
        image: withTag(parseImageRef(this.primaryImage), regLatest),
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
    const dataVolume = process.env.DOCKER_DATA_VOLUME || "apiforge-data";
    const socketMount = "-v /var/run/docker.sock:/var/run/docker.sock";

    // 目标版本：清单 → 远端 tags → 当前镜像
    const { latest, image: manifestImage } = await this.checkUpdate();
    const tag = latest && /^\d+\.\d+/.test(latest) ? latest : "";
    const targetImage =
      manifestImage || (tag ? withTag(primaryRef, tag) : primary) || primary;

    const candidates = buildImageCandidates({
      primary: targetImage,
      mirrors: process.env.DOCKER_IMAGE_MIRRORS,
      tag: parseImageRef(targetImage)?.tag || "latest",
    });
    const manualCmds = `docker pull ${candidates[0]?.image || targetImage}\ndocker stop apiforge && docker rm -f apiforge\ndocker run -d -p ${port}:3000 -v ${dataVolume}:/app/data ${socketMount} --name apiforge ${candidates[0]?.image || targetImage}`;

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

    // 使用 dockerode API：pull → 启动 helper 容器执行 stop/rm/create/start
    // helper 复用目标镜像（含 node + dockerode），执行完即退出
    const updaterScript = `
      const D = require('dockerode');
      const Docker = D.default || D;
      const d = new Docker({ socketPath: '/var/run/docker.sock' });
      (async () => {
        try {
          const img = process.env.UPDATER_IMAGE;
          const port = process.env.UPDATER_PORT || '3000';
          const vol = process.env.UPDATER_DATA_VOLUME || 'apiforge-data';
          const dockerImg = process.env.DOCKER_IMAGE || img;
          const old = d.getContainer('apiforge');
          const oldInfo = await old.inspect();
          const oldImage = oldInfo.Config?.Image || oldInfo.Image || '';
          await old.stop();
          await old.remove();
          const extra = (() => { try { return JSON.parse(process.env.UPDATER_EXTRA_ENV || '{}'); } catch (_) { return {}; } })();
          const env = [
            'NODE_ENV=production',
            'TZ=Asia/Shanghai',
            'DB_TYPE=' + (extra.DB_TYPE || 'sqlite'),
            'DB_SQLITE_PATH=' + (extra.DB_SQLITE_PATH || '/app/data/apiforge.db'),
            'DOCKER_IMAGE=' + dockerImg,
          ];
          // 透传更新源等配置，避免新容器忘记自己从哪里更新
          for (const key of Object.keys(extra)) {
            if (['DB_TYPE', 'DB_SQLITE_PATH', 'DOCKER_IMAGE'].includes(key)) continue;
            const value = extra[key];
            if (value === undefined || value === null || value === '') continue;
            env.push(key + '=' + value);
          }
          const c = await d.createContainer({
            Image: img,
            name: 'apiforge',
            ExposedPorts: { '3000/tcp': {} },
            HostConfig: {
              PortBindings: { '3000/tcp': [{ HostPort: String(port) }] },
              Binds: [vol + ':/app/data', '/var/run/docker.sock:/var/run/docker.sock'],
            },
            Env: env,
          });
          await c.start();
          if (oldImage && oldImage !== img) {
            try { await d.getImage(oldImage).remove({ force: true }); } catch (_) {}
          }
        } catch (e) { console.error(e); process.exit(1); }
      })();
    `.replace(/\n\s+/g, " ");

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

    // 若拉取的是 :latest，从镜像 label 解析版本号，使新容器 DOCKER_IMAGE 显示版本而非 latest
    let dockerImageEnv = pulledImage;
    if (pulledImage.endsWith(":latest")) {
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
          `UPDATER_PORT=${port}`,
          `UPDATER_DATA_VOLUME=${dataVolume}`,
          `DOCKER_IMAGE=${dockerImageEnv}`,
          `UPDATER_EXTRA_ENV=${JSON.stringify(this.forwardedEnv())}`,
        ],
        HostConfig: {
          Binds: [`${socketPath}:/var/run/docker.sock`],
          AutoRemove: true,
        },
      });
      await helper.start();
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
