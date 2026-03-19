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

@Injectable()
export class VersionService {
  private currentVersion: string;

  constructor() {
    try {
      const pkgPath = join(__dirname, "..", "..", "..", "package.json");
      const pkg = require(pkgPath);
      this.currentVersion = pkg?.version || "1.0.0";
    } catch {
      this.currentVersion = "1.0.0";
    }
  }

  /** 从 Docker Hub API 获取最新版本（带 1h 内存缓存） */
  private async fetchLatestFromDockerHub(): Promise<string | null> {
    const image = process.env.DOCKER_IMAGE || "apiforge:latest";
    const m = image.match(/^([^/]+\/[^/:]+)/);
    if (!m) return null;
    const repoPath = m[1];
    const cacheKey = `version:dh:${repoPath}`;
    const cached = (global as any)[cacheKey] as
      | { v: string; t: number }
      | undefined;
    if (cached && Date.now() - cached.t < 300000) return cached.v; // 5 分钟缓存，便于推送新版本后较快检测

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

  async checkUpdate(): Promise<{
    current: string;
    latest: string | null;
    hasUpdate: boolean;
    releaseUrl: string | null;
  }> {
    const empty = () => ({
      current: this.currentVersion,
      latest: null,
      hasUpdate: false,
      releaseUrl: null,
    });

    // 1. 优先从 Docker Hub API 自动检测（需 DOCKER_IMAGE 含仓库路径）
    const dhLatest = await this.fetchLatestFromDockerHub();
    if (dhLatest && /^\d+\.\d+/.test(dhLatest)) {
      return {
        current: this.currentVersion,
        latest: dhLatest,
        hasUpdate: isNewer(dhLatest, this.currentVersion),
        releaseUrl: process.env.VERSION_RELEASE_URL || null,
      };
    }

    // 2. 回退到 VERSION_LATEST 环境变量
    const envLatest = process.env.VERSION_LATEST?.trim();
    if (!envLatest || !/^\d+\.\d+/.test(envLatest)) {
      return empty();
    }

    return {
      current: this.currentVersion,
      latest: envLatest,
      hasUpdate: isNewer(envLatest, this.currentVersion),
      releaseUrl: process.env.VERSION_RELEASE_URL || null,
    };
  }

  async triggerDockerUpdate(): Promise<{
    ok: boolean;
    message: string;
    manualCommands?: string;
  }> {
    const image = process.env.DOCKER_IMAGE || "apiforge:latest";
    const port = process.env.PORT || "3000";
    const dataVolume = process.env.DOCKER_DATA_VOLUME || "apiforge-data";
    const socketMount = "-v /var/run/docker.sock:/var/run/docker.sock";
    const manualCmds = `docker pull ${image}\ndocker stop apiforge && docker rm -f apiforge\ndocker run -d -p ${port}:3000 -v ${dataVolume}:/app/data ${socketMount} --name apiforge ${image}`;

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
          const oldImage = oldInfo.Config?.Image || oldInfo.Image;
          await old.stop();
          await old.remove();
          const env = ['NODE_ENV=production', 'TZ=Asia/Shanghai', 'DB_TYPE=sqlite', 'DB_SQLITE_PATH=/app/data/apiforge.db', 'DOCKER_IMAGE=' + dockerImg];
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

    try {
      await new Promise<void>((resolve, reject) => {
        docker.pull(image, (err: Error | null, stream: any) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (e: Error | null) =>
            e ? reject(e) : resolve(),
          );
        });
      });
    } catch (err: any) {
      console.error("[Version] Docker pull failed:", err?.message);
      return {
        ok: false,
        message: `拉取镜像失败：${err?.message || "未知错误"}`,
        manualCommands: manualCmds,
      };
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
        Image: image,
        name: "apiforge-updater",
        Cmd: ["node", "-e", updaterScript],
        Env: [
          `UPDATER_IMAGE=${image}`,
          `UPDATER_PORT=${port}`,
          `UPDATER_DATA_VOLUME=${dataVolume}`,
          `DOCKER_IMAGE=${image}`,
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
    };
  }
}
