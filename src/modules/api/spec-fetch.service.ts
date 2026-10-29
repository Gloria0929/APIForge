import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { rewriteLoopbackHost } from "../../common/utils/runtime-host";

/**
 * 服务端抓取 Swagger/OpenAPI 文档。
 *
 * 浏览器直接 fetch 第三方规范地址会被 CORS 拦下（对方只允许自己的页面跨域读取），
 * 因此 URL 导入统一走这里：由 Node 进程抓取后原样返回文本，前端再解析。
 * 顺带处理两类实际最常见的“填错地址”：
 *  1. 填了 Swagger UI 页面（HTML）→ 从页面里找出真正的规范地址；
 *  2. 填了 swagger-config（只有 urls 列表，没有 paths）→ 顺着 urls[0].url 继续取。
 */

/** 单份文档体积上限，与请求体限制（10MB）保持同一量级 */
const MAX_SPEC_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_RESOLVE_DEPTH = 3;

/** 云厂商元数据地址，禁止作为抓取源（SSRF 防护） */
const BLOCKED_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.tencentyun.com",
]);

const SPEC_ACCEPT = [
  "application/json",
  "application/yaml",
  "application/x-yaml",
  "text/yaml",
  "text/plain",
  "*/*",
].join(", ");

export interface FetchedSpec {
  /** 文档文本（JSON 或 YAML），由前端负责解析 */
  text: string;
  /** 实际返回文档的地址（跟随重定向后） */
  url: string;
  /** 用户填写的原始地址 */
  requestedUrl: string;
  contentType: string;
  /** 输入不是规范本身时，自动解析出的规范地址 */
  resolvedFrom?: string;
  /** 自动解析方式：ui=从 Swagger UI 页面解析；config=从 swagger-config 解析 */
  resolvedVia?: "ui" | "config";
}

interface RequestResult {
  text: string;
  contentType: string;
  finalUrl: string;
}

interface ResolveResult extends RequestResult {
  via?: "ui" | "config";
}

@Injectable()
export class SpecFetchService {
  async fetchSpec(input: string): Promise<FetchedSpec> {
    const requestedUrl = normalizeInput(input);
    if (!requestedUrl) {
      throw new BadRequestException("请输入 Swagger/OpenAPI 文档地址");
    }

    // 容器内运行时把 127.0.0.1/localhost 指向宿主机，与用例执行保持一致
    const startUrl = rewriteLoopbackHost(requestedUrl);
    assertFetchable(startUrl);

    const resolved = await this.resolve(startUrl, 0);
    return {
      text: resolved.text,
      url: resolved.finalUrl,
      requestedUrl,
      contentType: resolved.contentType,
      ...(resolved.via ? { resolvedFrom: resolved.finalUrl, resolvedVia: resolved.via } : {}),
    };
  }

  private async resolve(url: string, depth: number): Promise<ResolveResult> {
    const result = await this.request(url);

    if (isHtml(result.text, result.contentType)) {
      const candidates = extractSpecCandidatesFromHtml(result.text, result.finalUrl);
      if (candidates.length === 0 || depth >= MAX_RESOLVE_DEPTH) {
        throw new BadRequestException(
          "该地址返回的是 Swagger UI 页面，页面里没有找到 OpenAPI 文档地址。请改填 .../v3/api-docs、.../swagger.json 这类文档地址",
        );
      }
      const nested = await this.tryCandidates(candidates, depth + 1);
      if (!nested) {
        throw new BadRequestException(
          "该地址是 Swagger UI 页面，但页面指向的文档地址无法访问。请直接填写 .../v3/api-docs 或 .../swagger.json",
        );
      }
      return { ...nested, via: "ui" };
    }

    const nextFromConfig = extractSpecUrlFromConfig(result.text, result.finalUrl);
    if (nextFromConfig && nextFromConfig !== result.finalUrl && depth < MAX_RESOLVE_DEPTH) {
      const nested = await this.resolve(nextFromConfig, depth + 1);
      return { ...nested, via: "config" };
    }

    return result;
  }

  /** 依次尝试候选地址，全部失败时返回 null（避免 UI 页面里第一个 url 是无效配置时直接报错） */
  private async tryCandidates(
    candidates: string[],
    depth: number,
  ): Promise<ResolveResult | null> {
    for (const candidate of candidates) {
      try {
        return await this.resolve(candidate, depth);
      } catch {
        // 换下一个候选
      }
    }
    return null;
  }

  private async request(url: string): Promise<RequestResult> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: SPEC_ACCEPT, "User-Agent": "APIForge-SpecFetcher" },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error: any) {
      throw new BadGatewayException(describeFetchError(error));
    }

    if (!response.ok) {
      const detail = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
      if (response.status === 401 || response.status === 403) {
        throw new BadRequestException(
          `目标地址需要鉴权（${detail}），请改用「粘贴内容」或上传文件导入`,
        );
      }
      if (response.status === 404) {
        throw new BadRequestException(
          `目标地址不存在（${detail}），请确认路径是 .../v3/api-docs 或 .../swagger.json`,
        );
      }
      throw new BadGatewayException(`获取文档失败：${detail}`);
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (error: any) {
      throw new BadGatewayException(describeFetchError(error));
    }
    if (buffer.byteLength > MAX_SPEC_BYTES) {
      throw new BadRequestException(
        `文档体积超过 ${MAX_SPEC_BYTES / 1024 / 1024}MB，请改用上传文件导入`,
      );
    }

    return {
      text: buffer.toString("utf8").replace(/^\uFEFF/, ""),
      contentType: String(response.headers.get("content-type") || ""),
      finalUrl: response.url || url,
    };
  }
}

function normalizeInput(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  // 允许省略协议，默认 http（与本地/内网文档地址为主的使用场景一致）
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
}

function assertFetchable(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException(
      "地址格式不正确，请填写完整 URL，例如 https://api.example.com/v3/api-docs",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BadRequestException("仅支持 http/https 地址");
  }
  if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new BadRequestException("不允许访问该地址");
  }
}

function isHtml(text: string, contentType: string): boolean {
  if (/html/i.test(contentType)) return true;
  const head = text.slice(0, 512).trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

function resolveUrl(value: string, baseUrl: string): string | null {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("data:") || raw === "#") return null;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * 从 Swagger UI 页面里推断文档地址。
 * 常见形态：SwaggerUIBundle({ url: "/v3/api-docs/swagger-config" }) 或 configUrl 指向配置。
 */
export function extractSpecCandidatesFromHtml(html: string, baseUrl: string): string[] {
  const patterns = [
    /\bconfigUrl\s*[:=]\s*["']([^"']+)["']/i,
    /\burls\s*:\s*\[\s*\{[\s\S]{0,200}?\burl\s*:\s*["']([^"']+)["']/i,
    /\burl\s*:\s*["']([^"']+)["']/i,
    /href\s*=\s*["']([^"']+\.(?:json|ya?ml))["']/i,
  ];

  const found: string[] = [];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const resolved = match?.[1] ? resolveUrl(match[1], baseUrl) : null;
    if (resolved && !found.includes(resolved)) found.push(resolved);
  }
  return found.slice(0, 3);
}

/**
 * swagger-config 只有 urls 列表，没有 paths；顺着第一个 url 继续取。
 * 真正的规范（含 swagger/openapi/paths）返回 null，避免无谓递归。
 */
export function extractSpecUrlFromConfig(text: string, baseUrl: string): string | null {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (parsed.swagger || parsed.openapi || parsed.paths || parsed.item) return null;

  const fromUrls = Array.isArray(parsed.urls)
    ? parsed.urls.find((item: any) => item && typeof item.url === "string" && item.url.trim())
    : null;
  const target: string =
    fromUrls?.url || (typeof parsed.url === "string" ? parsed.url : "");
  return target ? resolveUrl(target, baseUrl) : null;
}

function describeFetchError(error: any): string {
  const cause = error?.cause ?? error ?? {};
  const code = String(cause?.code || error?.code || "");
  const message = String(cause?.message || error?.message || "");

  if (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    /timeout|timed out/i.test(message)
  ) {
    return `请求超时（超过 ${TIMEOUT_MS / 1000} 秒），请确认地址可访问`;
  }
  if (code === "ENOTFOUND" || /getaddrinfo/i.test(message)) {
    return "域名解析失败，请检查地址拼写";
  }
  if (code === "ECONNREFUSED") {
    return "连接被拒绝，目标服务可能未启动或端口不通";
  }
  if (code === "ECONNRESET") {
    return "连接被重置，目标服务可能提前关闭了连接";
  }
  if (/CERT_|certificate|self[- ]signed|UNABLE_TO_VERIFY/i.test(`${code} ${message}`)) {
    return "HTTPS 证书校验失败，内网自签证书请改用 http 或上传文件导入";
  }
  return `无法访问该地址${message ? `：${message}` : ""}`;
}
