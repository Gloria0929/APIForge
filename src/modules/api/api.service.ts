import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { API } from "./api.entity";

@Injectable()
export class ApiService {
  constructor(
    @InjectRepository(API)
    private apiRepository: Repository<API>,
  ) {}

  findAll(projectId: string) {
    if (projectId) {
      return this.apiRepository.find({ where: { projectId } });
    }
    return this.apiRepository.find();
  }

  findOne(id: string) {
    return this.apiRepository.findOne({ where: { id } });
  }

  async create(api: Partial<API>) {
    this.validateApiPayload(api, { requireProjectId: true });
    const normalized = this.normalizeApiPayload(api);
    return this.apiRepository.save(normalized);
  }

  async update(id: string, api: Partial<API>) {
    const existing = await this.apiRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("API not found");

    this.validateApiPayload(api, { requireProjectId: false });
    const normalized = this.normalizeApiPayload(api);

    return this.apiRepository.save({
      ...existing,
      ...normalized,
      id: existing.id,
      projectId: existing.projectId, // projectId immutable from this endpoint
    });
  }

  remove(id: string) {
    return this.apiRepository.delete(id);
  }

  async removeBatch(projectId: string, apiIds: string[]) {
    const ids = Array.isArray(apiIds) ? apiIds.filter(Boolean) : [];
    if (ids.length === 0) {
      throw new BadRequestException("apiIds is required");
    }
    const result = await this.apiRepository.delete({
      id: In(ids),
      projectId,
    });
    return { deleted: result.affected ?? 0 };
  }

  importApi(projectId: string, spec: any) {
    if (Array.isArray(spec?.testCases)) {
      throw new BadRequestException(
        "检测到测试用例格式，请到「测试用例」页面进行导入",
      );
    }

    const schemas = spec?.components?.schemas || spec?.definitions || {};

    const resolveRef = (obj: any, depth = 0): any => {
      if (!obj || typeof obj !== "object" || depth > 10) return obj;
      if (obj.$ref && typeof obj.$ref === "string") {
        const refPath = obj.$ref.replace(/^#\//, "").split("/");
        let resolved: any = spec;
        for (const seg of refPath) {
          resolved = resolved?.[seg];
          if (!resolved) return obj;
        }
        return resolveRef(resolved, depth + 1);
      }
      if (Array.isArray(obj))
        return obj.map((item) => resolveRef(item, depth + 1));
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = resolveRef(v, depth + 1);
      }
      return out;
    };

    const apis: Partial<API>[] = [];

    if (spec.paths) {
      Object.entries(spec.paths).forEach(([path, pathItem]) => {
        Object.entries(pathItem).forEach(([method, operation]) => {
          if (
            [
              "get",
              "post",
              "put",
              "delete",
              "patch",
              "head",
              "options",
            ].includes(method)
          ) {
            const op = operation as any;
            apis.push({
              projectId,
              path,
              method: method.toUpperCase() as any,
              summary: op.description || op.summary || "",
              description: op.description,
              tags: op.tags || [],
              parameters: resolveRef(op.parameters || []),
              requestBody: resolveRef(op.requestBody),
              responses: resolveRef(op.responses || {}),
            });
          }
        });
      });
    } else if (spec?.item && Array.isArray(spec.item)) {
      // Postman Collection v2.x
      const walkItems = (items: any[], tags: string[] = []) => {
        for (const item of items) {
          if (item?.item && Array.isArray(item.item)) {
            walkItems(item.item, [...tags, item.name].filter(Boolean));
            continue;
          }
          const req = item?.request;
          const method = String(req?.method || "").toLowerCase();
          if (
            ![
              "get",
              "post",
              "put",
              "delete",
              "patch",
              "head",
              "options",
            ].includes(method)
          ) {
            continue;
          }

          const rawUrl =
            (typeof req?.url === "string" ? req.url : req?.url?.raw) || "";
          const path = this.extractPathFromRawUrl(rawUrl);

          apis.push({
            projectId,
            path,
            method: method.toUpperCase() as any,
            summary: item?.name || "",
            description: item?.description || "",
            tags,
            parameters: this.parsePostmanParameters(req),
            requestBody: this.parsePostmanRequestBody(req?.body),
            responses: this.parsePostmanResponses(item?.response),
          });
        }
      };

      walkItems(spec.item, []);
    }

    if (apis.length === 0) {
      throw new BadRequestException(
        "未识别到有效的接口数据，请确认导入的是 Swagger/OpenAPI 或 Postman 格式",
      );
    }

    return this.apiRepository.save(apis);
  }

  private parsePostmanParameters(req: any): any[] {
    if (!req) return [];
    const params: any[] = [];
    const url = req.url;
    const query = Array.isArray(url?.query) ? url.query : [];
    for (const q of query) {
      const key = String(q?.key ?? q?.name ?? "").trim();
      if (!key) continue;
      if (q?.disabled) continue;
      params.push({
        name: key,
        in: "query",
        type: "string",
        required:
          q?.required === true || (q?.required === undefined && !q?.disabled),
        description: q?.description || "",
      });
    }
    return params;
  }

  private parsePostmanRequestBody(body: any): any | null {
    if (!body || typeof body !== "object") return null;
    const mode = String(body.mode || "raw").toLowerCase();
    if (mode === "raw" && body.raw) {
      const raw = String(body.raw || "").trim();
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        const schema = this.inferSchemaFromValue(parsed);
        return {
          content: {
            "application/json": {
              schema: schema || { type: "object" },
              example: parsed,
            },
          },
        };
      } catch {
        return {
          content: {
            "text/plain": { schema: { type: "string" }, example: raw },
          },
        };
      }
    }
    if (mode === "urlencoded" && Array.isArray(body.urlencoded)) {
      const props: Record<string, any> = {};
      const required: string[] = [];
      for (const row of body.urlencoded) {
        const key = String(row?.key ?? row?.name ?? "").trim();
        if (!key || row?.disabled) continue;
        props[key] = {
          type: "string",
          description: row?.description || "",
        };
        if (
          row?.required === true ||
          (row?.required === undefined && !row?.disabled)
        ) {
          required.push(key);
        }
      }
      if (Object.keys(props).length === 0) return null;
      const schema: any = { type: "object", properties: props };
      if (required.length > 0) schema.required = required;
      return {
        content: {
          "application/x-www-form-urlencoded": { schema },
        },
      };
    }
    if (mode === "formdata" && Array.isArray(body.formdata)) {
      const props: Record<string, any> = {};
      const required: string[] = [];
      for (const row of body.formdata) {
        const key = String(row?.key ?? row?.name ?? "").trim();
        if (!key || row?.disabled) continue;
        props[key] = {
          type: "string",
          format: row?.type === "file" ? "binary" : undefined,
          description: row?.description || "",
        };
        if (
          row?.required === true ||
          (row?.required === undefined && !row?.disabled)
        ) {
          required.push(key);
        }
      }
      if (Object.keys(props).length === 0) return null;
      const schema: any = { type: "object", properties: props };
      if (required.length > 0) schema.required = required;
      return {
        content: {
          "multipart/form-data": { schema },
        },
      };
    }
    return null;
  }

  private parsePostmanResponses(responses: any): Record<string, any> | null {
    if (!Array.isArray(responses) || responses.length === 0) return null;
    const first = responses[0];
    const code =
      String(first?.code ?? first?.status ?? "200").replace(/\D/g, "") || "200";
    const bodyStr = first?.body;
    if (!bodyStr || typeof bodyStr !== "string") {
      return { [code]: { description: first?.name || "Response" } };
    }
    try {
      const parsed = JSON.parse(bodyStr);
      const schema = this.inferSchemaFromValue(parsed);
      return {
        [code]: {
          description: first?.name || "Response",
          content: {
            "application/json": {
              schema: schema || { type: "object" },
              example: parsed,
            },
          },
        },
      };
    } catch {
      return {
        [code]: {
          description: first?.name || "Response",
          content: {
            "text/plain": { schema: { type: "string" }, example: bodyStr },
          },
        },
      };
    }
  }

  private inferSchemaFromValue(val: any, depth = 0): any {
    if (depth > 10) return { type: "object" };
    if (val === null) return { type: "null" };
    if (typeof val === "boolean") return { type: "boolean" };
    if (typeof val === "number")
      return { type: Number.isInteger(val) ? "integer" : "number" };
    if (typeof val === "string") return { type: "string" };
    if (Array.isArray(val)) {
      const item =
        val.length > 0
          ? this.inferSchemaFromValue(val[0], depth + 1)
          : { type: "object" };
      return { type: "array", items: item };
    }
    if (typeof val === "object") {
      const props: Record<string, any> = {};
      const keys = Object.keys(val);
      for (const k of keys) {
        props[k] = this.inferSchemaFromValue((val as any)[k], depth + 1);
      }
      const schema: any = { type: "object", properties: props };
      if (keys.length > 0) schema.required = keys;
      return schema;
    }
    return { type: "object" };
  }

  private extractPathFromRawUrl(raw: string): string {
    const input = String(raw || "").trim();
    if (!input) return "/";

    // Try URL parsing when possible.
    try {
      if (/^https?:\/\//i.test(input)) {
        const u = new URL(input);
        return u.pathname || "/";
      }
    } catch {
      // ignore
    }

    const withoutQuery = input.split("?")[0];
    // If it's already a path-like string, keep it.
    if (withoutQuery.startsWith("/")) return withoutQuery || "/";

    // Handle "{{base_url}}/path" or "host/path" style inputs.
    const idx = withoutQuery.indexOf("/");
    if (idx >= 0)
      return `/${withoutQuery.slice(idx + 1)}`.replace(/\/+$/, "") || "/";

    return "/";
  }

  private validateApiPayload(
    api: Partial<API>,
    opts: { requireProjectId: boolean },
  ) {
    if (opts.requireProjectId && !api.projectId) {
      throw new BadRequestException("projectId is required");
    }
    if (api.path !== undefined) {
      const p = String(api.path || "").trim();
      if (!p) throw new BadRequestException("path is required");
    }
    if (api.method !== undefined) {
      const m = String(api.method || "").toUpperCase();
      const allowed = [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "PATCH",
        "HEAD",
        "OPTIONS",
      ];
      if (!allowed.includes(m)) {
        throw new BadRequestException(`Unsupported method: ${m}`);
      }
    }
  }

  private normalizeApiPayload(api: Partial<API>): Partial<API> {
    const out: Partial<API> = { ...api };
    if (out.path !== undefined) {
      const p = String(out.path || "").trim();
      out.path = p.startsWith("/") ? p : `/${p}`;
    }
    if (out.method !== undefined) {
      out.method = String(out.method || "").toUpperCase() as any;
    }
    if (out.summary !== undefined) {
      out.summary = String(out.summary || "");
    }
    if (out.description !== undefined && out.description !== null) {
      out.description = String(out.description);
    }
    // Normalize empty arrays/objects to null to keep payload clean.
    if (Array.isArray(out.tags) && out.tags.length === 0)
      out.tags = null as any;
    if (Array.isArray(out.parameters) && out.parameters.length === 0)
      out.parameters = null as any;
    if (out.requestBody && typeof out.requestBody === "object") {
      const keys = Object.keys(out.requestBody || {});
      if (keys.length === 0) out.requestBody = null as any;
    }
    if (out.responses && typeof out.responses === "object") {
      const keys = Object.keys(out.responses || {});
      if (keys.length === 0) out.responses = null as any;
    }
    return out;
  }
}
