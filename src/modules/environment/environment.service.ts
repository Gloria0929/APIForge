import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository, Not } from "typeorm";
import { connect } from "net";
import { Environment, EnvironmentSetupStep } from "./environment.entity";
import { rewriteLoopbackHost } from "../../common/utils/runtime-host";

function tcpConnect(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port }, () => {
      socket.destroy();
      resolve();
    });
    socket.setTimeout(timeoutMs);
    socket.on("error", (err) => reject(err));
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Connection timeout"));
    });
  });
}

/** 解析连接测试目标；容器内的回环地址会先改写为宿主机地址 */
export function connectionTarget(value: string): { host: string; port: number } {
  const raw = String(value || "").trim();
  if (!raw) throw new BadRequestException("baseUrl is required");
  const baseUrl = rewriteLoopbackHost(
    raw.startsWith("http") ? raw : `http://${raw}`,
  );

  let host: string;
  let port: number;
  try {
    const u = new URL(baseUrl);
    host = u.hostname || u.host?.split(":")[0] || "127.0.0.1";
    port = u.port ? parseInt(u.port, 10) : u.protocol === "https:" ? 443 : 80;
  } catch {
    const part = baseUrl.replace(/^https?:\/\//, "").split("/")[0];
    const [h, p] = part.split(":");
    host = h || "127.0.0.1";
    port = p ? parseInt(p, 10) : 80;
  }
  if (!port || port < 1 || port > 65535) port = 80;
  if (!/^[a-zA-Z0-9.\-_:\[\]]+$/.test(host)) {
    throw new BadRequestException("Invalid host in baseUrl");
  }
  return { host, port };
}

@Injectable()
export class EnvironmentService {
  constructor(
    @InjectRepository(Environment)
    private environmentRepository: Repository<Environment>,
  ) {}

  findAll(projectId: string) {
    if (projectId) {
      return this.environmentRepository.find({ where: { projectId } });
    }
    return this.environmentRepository.find();
  }

  findOne(id: string) {
    return this.environmentRepository.findOne({ where: { id } });
  }

  async create(environment: Partial<Environment>) {
    const normalized = this.normalizeEnvironment(environment, {
      requireProjectId: true,
    });
    const saved = await this.environmentRepository.save(normalized);
    if (saved.isActive) {
      await this.deactivateOthers(saved.projectId, saved.id);
    }
    return saved;
  }

  async update(id: string, environment: Partial<Environment>) {
    const existing = await this.environmentRepository.findOne({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Environment not found");

    const normalized = this.normalizeEnvironment(environment, {
      requireProjectId: false,
    });
    const saved = await this.environmentRepository.save({
      ...existing,
      ...normalized,
      id: existing.id,
      projectId: existing.projectId, // immutable in update
    });

    if (saved.isActive) {
      await this.deactivateOthers(saved.projectId, saved.id);
    }

    return saved;
  }

  remove(id: string) {
    return this.environmentRepository.delete(id);
  }

  async removeBatch(projectId: string, ids: string[]) {
    const validIds = ids.filter((id) => id && typeof id === "string");
    if (validIds.length === 0) return { deleted: 0 };
    const result = await this.environmentRepository.delete({
      id: In(validIds),
      projectId,
    });
    return { deleted: result.affected ?? 0 };
  }

  async activate(id: string) {
    const environment = await this.environmentRepository.findOne({
      where: { id },
    });
    if (environment) {
      await this.deactivateOthers(environment.projectId, id);
      environment.isActive = true;
      return this.environmentRepository.save(environment);
    }
    return null;
  }

  async getActive(projectId: string) {
    if (!projectId) throw new BadRequestException("projectId is required");
    return this.environmentRepository.findOne({
      where: { projectId, isActive: true },
    });
  }

  async exportEnvironments(projectId: string) {
    if (!projectId) throw new BadRequestException("projectId is required");
    const envs = await this.environmentRepository.find({
      where: { projectId },
    });
    return {
      projectId,
      exportedAt: new Date().toISOString(),
      environments: envs.map((e) => ({
        name: e.name,
        baseUrl: e.baseUrl,
        description: e.description || "",
        isActive: Boolean(e.isActive),
        variables: e.variables || [],
        loginTestCaseId: e.loginTestCaseId || undefined,
        loginExtractRules: e.loginExtractRules || undefined,
        setupSteps: e.setupSteps || undefined,
      })),
    };
  }

  async importEnvironments(projectId: string, payload: any) {
    if (!projectId) throw new BadRequestException("projectId is required");
    const list = Array.isArray(payload?.environments)
      ? payload.environments
      : Array.isArray(payload)
        ? payload
        : null;
    if (!list) throw new BadRequestException("Invalid import payload");

    const toSave: Partial<Environment>[] = list.map((raw: any) =>
      this.normalizeEnvironment(
        {
          projectId,
          name: raw?.name,
          baseUrl: raw?.baseUrl,
          description: raw?.description,
          isActive: Boolean(raw?.isActive),
          variables: raw?.variables,
          loginTestCaseId: raw?.loginTestCaseId,
          loginExtractRules: raw?.loginExtractRules,
          setupSteps: raw?.setupSteps,
        },
        { requireProjectId: true },
      ),
    );

    // Ensure at most one active environment after import.
    const firstActiveIndex = toSave.findIndex((e) => e.isActive);
    toSave.forEach((e, idx) => {
      if (idx !== firstActiveIndex) e.isActive = false;
    });

    const saved = await this.environmentRepository.save(toSave);
    if (firstActiveIndex >= 0 && saved[firstActiveIndex]?.id) {
      await this.deactivateOthers(projectId, saved[firstActiveIndex].id);
    }
    return saved;
  }

  async testConnection(id: string) {
    const env = await this.environmentRepository.findOne({ where: { id } });
    if (!env) throw new NotFoundException("Environment not found");
    // 容器内的 127.0.0.1 指向容器自身，连接测试也必须走宿主机映射
    const { host, port } = connectionTarget(env.baseUrl);

    const started = Date.now();
    try {
      await tcpConnect(host, port, 5000);
      return {
        reachable: true,
        latencyMs: Date.now() - started,
      };
    } catch (error: any) {
      return {
        reachable: false,
        latencyMs: Date.now() - started,
        error: String(error?.message || "TCP connection failed"),
      };
    }
  }

  private async deactivateOthers(projectId: string, excludeId: string) {
    await this.environmentRepository.update(
      { projectId, id: Not(excludeId) },
      { isActive: false },
    );
  }

  private normalizeEnvironment(
    environment: Partial<Environment>,
    opts: { requireProjectId: boolean },
  ): Partial<Environment> {
    const projectId = String(environment.projectId || "").trim();
    if (opts.requireProjectId && !projectId) {
      throw new BadRequestException("projectId is required");
    }

    const name =
      environment.name !== undefined
        ? String(environment.name || "").trim()
        : undefined;
    const baseUrl =
      environment.baseUrl !== undefined
        ? String(environment.baseUrl || "")
            .trim()
            .replace(/\/+$/, "")
        : undefined;

    if (name !== undefined && !name)
      throw new BadRequestException("name is required");
    if (baseUrl !== undefined && !baseUrl)
      throw new BadRequestException("baseUrl is required");

    const out: Partial<Environment> = { ...environment };
    if (projectId) out.projectId = projectId;
    if (name !== undefined) out.name = name;
    if (baseUrl !== undefined) out.baseUrl = baseUrl;
    if (out.description !== undefined && out.description !== null) {
      out.description = String(out.description);
    }
    if (out.variables !== undefined) {
      out.variables = this.normalizeVariables(out.variables as any);
    }

    if (environment.loginTestCaseId !== undefined) {
      const v = String(environment.loginTestCaseId || "").trim();
      out.loginTestCaseId = v || null;
    }
    if (environment.loginExtractRules !== undefined) {
      const r = environment.loginExtractRules;
      if (r && typeof r === "object" && Object.keys(r).length > 0) {
        const normalized: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) {
          if (k && typeof v === "string" && v.trim()) {
            normalized[String(k).trim()] = String(v).trim();
          }
        }
        out.loginExtractRules =
          Object.keys(normalized).length > 0 ? normalized : null;
      } else {
        out.loginExtractRules = null;
      }
    }
    if (environment.setupSteps !== undefined) {
      out.setupSteps = this.normalizeSetupSteps(environment.setupSteps);
    }

    return out;
  }

  /**
   * 前置用例：丢掉没选用例或没提取规则的项，同一个用例只保留一次。
   * 允许同一用例重复出现（不同提取规则），这里按 testCaseId 合并提取规则。
   */
  private normalizeSetupSteps(input: any): EnvironmentSetupStep[] | null {
    const list = Array.isArray(input) ? input : [];
    const merged = new Map<string, EnvironmentSetupStep>();

    for (const raw of list) {
      const testCaseId = String(raw?.testCaseId || "").trim();
      if (!testCaseId) continue;

      const rules = raw?.extractRules;
      const pairs: Array<[string, string]> = Array.isArray(rules)
        ? rules.map((item: any) => [item?.key, item?.path])
        : Object.entries(rules || {});
      const normalizedRules: Record<string, string> = {};
      for (const [key, path] of pairs) {
        const k = String(key || "").trim();
        const p = String(path || "").trim();
        if (k && p) normalizedRules[k] = p;
      }
      if (Object.keys(normalizedRules).length === 0) continue;

      const name = String(raw?.name || "").trim();
      const existing = merged.get(testCaseId);
      if (existing) {
        existing.extractRules = { ...existing.extractRules, ...normalizedRules };
        if (name && !existing.name) existing.name = name;
      } else {
        merged.set(testCaseId, {
          testCaseId,
          ...(name ? { name } : {}),
          extractRules: normalizedRules,
        });
      }
    }

    return merged.size > 0 ? [...merged.values()] : null;
  }

  private normalizeVariables(input: any): any[] {
    const list = Array.isArray(input) ? input : [];
    const out: any[] = [];
    const seen = new Set<string>();

    for (const raw of list) {
      const key = String(raw?.key || "").trim();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);

      const type = String(raw?.type || "string");
      const allowed = ["string", "number", "boolean", "secret"];
      const normalizedType = allowed.includes(type) ? type : "string";

      out.push({
        key,
        value: raw?.value ?? "",
        type: normalizedType,
        description: raw?.description ? String(raw.description) : undefined,
      });
    }

    return out;
  }
}
