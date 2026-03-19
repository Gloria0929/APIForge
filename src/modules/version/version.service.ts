import { Injectable } from "@nestjs/common";
import { join } from "path";
import axios from "axios";
import Docker from "dockerode";

const GITHUB_REPO = process.env.GITHUB_REPO || "Gloria0929/APIForge";
const GITHUB_RELEASES = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const GITHUB_TAGS = `https://api.github.com/repos/${GITHUB_REPO}/tags`;
const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;

const GITHUB_HEADERS = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "APIForge-Update-Check",
};

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

    try {
      const res = await axios.get(GITHUB_RELEASES, {
        timeout: 8000,
        headers: GITHUB_HEADERS,
      });
      const tagName = res.data?.tag_name;
      const htmlUrl = res.data?.html_url;
      if (tagName) {
        const latest = tagName.replace(/^v/i, "").trim();
        return {
          current: this.currentVersion,
          latest,
          hasUpdate: isNewer(latest, this.currentVersion),
          releaseUrl: htmlUrl || `${GITHUB_REPO_URL}/releases`,
        };
      }
    } catch {
      /* releases/latest 可能 404（无 Release），尝试 tags */
    }

    try {
      const res = await axios.get(GITHUB_TAGS, {
        timeout: 8000,
        headers: GITHUB_HEADERS,
      });
      const tags = Array.isArray(res.data) ? res.data : [];
      let best: string | null = null;
      for (const t of tags) {
        const name = (t?.name || "").replace(/^v/i, "").trim();
        if (!name || !/^\d+\.\d+/.test(name)) continue;
        if (!best || isNewer(name, best)) best = name;
      }
      if (best) {
        return {
          current: this.currentVersion,
          latest: best,
          hasUpdate: isNewer(best, this.currentVersion),
          releaseUrl: `${GITHUB_REPO_URL}/releases`,
        };
      }
    } catch {
      /* 忽略 */
    }

    return empty();
  }

  async triggerDockerUpdate(): Promise<{
    ok: boolean;
    message: string;
    manualCommands?: string;
  }> {
    const containerId = process.env.HOSTNAME || "";
    const image = process.env.DOCKER_IMAGE || "apiforge:latest";
    const port = process.env.PORT || "3000";
    const dataVolume = process.env.DOCKER_DATA_VOLUME || "apiforge-data";
    const manualCmds = `docker pull ${image}\ndocker stop <容器名或ID> && docker rm <容器名或ID>\ndocker run -d -p ${port}:3000 -v ${dataVolume}:/app/data --name apiforge ${image}`;

    if (!containerId) {
      return {
        ok: false,
        message: "无法获取容器 ID，请手动执行更新命令",
        manualCommands: manualCmds,
      };
    }

    const script = `docker pull ${image} && docker stop ${containerId} && docker rm ${containerId} && docker run -d -p ${port}:3000 -v ${dataVolume}:/app/data -e TZ=Asia/Shanghai -e NODE_ENV=production -e DB_TYPE=sqlite -e DB_SQLITE_PATH=/app/data/apiforge.db --name apiforge ${image}`;

    let docker: Docker;
    try {
      docker = new Docker({ socketPath: "/var/run/docker.sock" });
      await docker.ping();
    } catch {
      return {
        ok: false,
        message:
          "无法连接 Docker，请确保容器已挂载 -v /var/run/docker.sock:/var/run/docker.sock",
        manualCommands: manualCmds,
      };
    }

    try {
      const helper = await docker.createContainer({
        Image: "docker:24-cli",
        Cmd: ["sh", "-c", script],
        HostConfig: {
          Binds: ["/var/run/docker.sock:/var/run/docker.sock"],
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
