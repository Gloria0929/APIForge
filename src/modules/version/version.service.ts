import { Injectable } from "@nestjs/common";
import { join } from "path";
import axios from "axios";

const GITHUB_REPO = process.env.GITHUB_REPO || "Gloria0929/APIForge";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

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
    try {
      const res = await axios.get(GITHUB_API, {
        timeout: 5000,
        headers: { Accept: "application/vnd.github.v3+json" },
      });
      const tagName = res.data?.tag_name;
      const htmlUrl = res.data?.html_url;
      if (!tagName) {
        return {
          current: this.currentVersion,
          latest: null,
          hasUpdate: false,
          releaseUrl: null,
        };
      }
      const latest = tagName.replace(/^v/i, "").trim();
      const hasUpdate = isNewer(latest, this.currentVersion);
      return {
        current: this.currentVersion,
        latest,
        hasUpdate,
        releaseUrl: htmlUrl || null,
      };
    } catch {
      return {
        current: this.currentVersion,
        latest: null,
        hasUpdate: false,
        releaseUrl: null,
      };
    }
  }
}
