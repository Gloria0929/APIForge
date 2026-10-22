import { BadRequestException } from "@nestjs/common";

/** Validate model output before saving any generated cases. */
export function normalizeScenarioDraft(
  result: any,
  cases: Array<{ id: string; name: string; request?: any }>,
  options?: { allowedApiIds?: Set<string> },
) {
  if (
    !Array.isArray(result?.steps) ||
    !result.steps.length ||
    result.steps.length > 30
  ) {
    throw new BadRequestException(
      "AI 场景必须包含 1 到 30 个有效步骤，请细化描述后重试",
    );
  }
  const valid = new Map(cases.map((item) => [item.id, item]));
  const variables =
    result.variables &&
    typeof result.variables === "object" &&
    !Array.isArray(result.variables)
      ? result.variables
      : {};
  const warnings = new Set<string>();
  const extractionStep = new Map<string, number>();
  const steps = result.steps.map((step: any, index: number) => {
    const rawTestCaseId = String(step?.testCaseId || "").trim();
    const rawApiId = String(step?.apiId || "").trim();
    let testCaseId = "";
    let apiId: string | null = null;
    let request: any = null;
    let assertions: any[] | null = null;
    if (rawTestCaseId) {
      if (!valid.has(rawTestCaseId))
        throw new BadRequestException(
          `AI 第 ${index + 1} 步引用了不存在的测试用例`,
        );
      testCaseId = rawTestCaseId;
    } else if (rawApiId) {
      if (options?.allowedApiIds && !options.allowedApiIds.has(rawApiId))
        throw new BadRequestException(
          `AI 第 ${index + 1} 步引用了不存在的接口`,
        );
      request = normalizeStepRequest(step?.request, index);
      assertions = normalizeStepAssertions(step?.assertions);
      apiId = rawApiId;
      testCaseId = `api:${rawApiId}:${index}`;
    } else {
      throw new BadRequestException(
        `AI 第 ${index + 1} 步必须提供 testCaseId 或 apiId`,
      );
    }
    const rules = Array.isArray(step.extractRules)
      ? step.extractRules
      : Object.entries(step.extractRules || {}).map(([key, path]) => ({
          key,
          path,
        }));
    const extractRules = rules.map((rule: any) => {
      const key = String(rule?.key || "").trim();
      const path = String(rule?.path || "").trim();
      if (
        !/^[a-zA-Z_][\w.-]*$/.test(key) ||
        !/^\$(?:\.[\w-]+|\[\d+\]|\["[^"\]]+"\]|\['[^'\]]+'\])*$/.test(path)
      ) {
        throw new BadRequestException(
          `AI 第 ${index + 1} 步的变量提取规则无效`,
        );
      }
      if (!extractionStep.has(key)) extractionStep.set(key, index);
      return { key, path };
    });
    const overrides = step.requestOverrides || {};
    if (typeof overrides !== "object" || Array.isArray(overrides))
      throw new BadRequestException("请求覆盖必须是对象");
    for (const field of ["headers", "query", "body"]) {
      if (
        overrides[field] != null &&
        (typeof overrides[field] !== "object" ||
          Array.isArray(overrides[field]))
      ) {
        throw new BadRequestException(
          `AI 第 ${index + 1} 步的 ${field} 覆盖必须是键值对象`,
        );
      }
    }
    const requestOverrides: any = Object.fromEntries(
      ["headers", "query", "body"]
        .filter((key) => overrides[key] != null)
        .map((key) => [key, overrides[key]]),
    );
    if (overrides.url != null) requestOverrides.url = String(overrides.url);
    const repeat = normalizeRepeat(step?.repeat, index);
    const normalized: any = {
      name: String(step?.name || (valid.get(testCaseId)?.name ?? `场景步骤 ${index + 1}`)),
      testCaseId,
      extractRules,
      requestOverrides,
    };
    if (repeat) normalized.repeat = repeat;
    if (apiId) {
      normalized.apiId = apiId;
      normalized.request = request;
      if (assertions) normalized.assertions = assertions;
    }
    return normalized;
  });
  steps.forEach((step: any, index: number) => {
    if (step.repeat) {
      const sourceIndex = extractionStep.get(step.repeat.sourceKey);
      if (sourceIndex === undefined || sourceIndex >= index) {
        throw new BadRequestException(
          `第 ${index + 1} 步的循环数据源 ${step.repeat.sourceKey} 必须由之前的步骤提取`,
        );
      }
    }
    const base =
      valid.get(step.testCaseId)?.request || step.request || {};
    const overrides = step.requestOverrides;
    const request = {
      ...base,
      ...overrides,
      headers: { ...base.headers, ...overrides.headers },
      query: { ...base.query, ...overrides.query },
      body: overrides.body ? { ...base.body, ...overrides.body } : base.body,
    };
    const references = JSON.stringify(request).matchAll(/{{\s*([\w.-]+)\s*}}/g);
    for (const [, key] of references) {
      if (step.repeat?.itemVar === key) continue;
      if (
        ["base_url", "baseUrl"].includes(key) ||
        Object.prototype.hasOwnProperty.call(variables, key)
      )
        continue;
      if (extractionStep.has(key) && extractionStep.get(key) >= index)
        throw new BadRequestException(
          `第 ${index + 1} 步使用变量 ${key}，但该变量尚未提取`,
        );
      if (!extractionStep.has(key))
        warnings.add(`变量 ${key} 需要在环境中提供初始值`);
    }
  });
  return {
    name: String(result.name || "AI 生成场景"),
    description: String(result.description || ""),
    variables,
    steps,
    warnings: [...warnings],
  };
}

function normalizeRepeat(raw: any, index: number) {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw))
    throw new BadRequestException(`AI 第 ${index + 1} 步的循环配置无效`);
  const sourceKey = String(raw.sourceKey || "").trim();
  const itemVar = String(raw.itemVar || "").trim();
  const itemPath = raw.itemPath == null ? "" : String(raw.itemPath).trim();
  if (
    !/^[a-zA-Z_][\w.-]*$/.test(sourceKey) ||
    !/^[a-zA-Z_][\w.-]*$/.test(itemVar) ||
    (itemPath && !/^\$?(?:\.?[\w-]+|\[\d+\])+$/.test(itemPath))
  ) {
    throw new BadRequestException(`AI 第 ${index + 1} 步的循环配置无效`);
  }
  return itemPath ? { sourceKey, itemVar, itemPath } : { sourceKey, itemVar };
}

function normalizeStepRequest(raw: any, index: number) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestException(`AI 第 ${index + 1} 步缺少请求定义`);
  }
  const method = String(raw.method || "GET").trim().toUpperCase();
  const rawUrl = String(raw.url ?? raw.path ?? "").trim();
  if (!rawUrl) {
    throw new BadRequestException(`AI 第 ${index + 1} 步的请求缺少 url`);
  }
  const url = /^https?:\/\//i.test(rawUrl) || /^\{\{/.test(rawUrl)
    ? rawUrl
    : `{{base_url}}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;
  // 文档里的 {id} 统一转成 {{id}}，运行时才能被变量替换
  const templatedUrl = url.replace(
    /(^|[^{])\{([a-zA-Z_][\w-]*)\}(?!\})/g,
    "$1{{$2}}",
  );
  const rawQuery = raw.query ?? raw.params;
  return {
    method,
    url: templatedUrl,
    headers:
      raw.headers && typeof raw.headers === "object" && !Array.isArray(raw.headers)
        ? raw.headers
        : {},
    query:
      rawQuery && typeof rawQuery === "object" && !Array.isArray(rawQuery)
        ? rawQuery
        : {},
    body: raw.body ?? raw.data,
  };
}

function normalizeStepAssertions(raw: any): any[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const allowed = new Set(["STATUS", "JSON_PATH", "RESPONSE_TIME"]);
  const out = raw
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      type: String(item.type || "").toUpperCase(),
      target: item.target != null ? String(item.target) : undefined,
      condition: String(item.condition || ""),
      expected: item.expected,
    }))
    .filter((item) => allowed.has(item.type) && item.condition);
  return out.length ? out : null;
}
