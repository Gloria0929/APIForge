/**
 * 功能级模型路由。
 *
 * 一个项目可以同时启用多个模型，每个模型只承担自己勾选的功能；
 * 调用某个 AI 功能时，按「项目显式指定 → 默认模型 → 任一承担该功能的启用模型」的顺序选出实际使用的模型。
 *
 * 本文件只做纯计算，便于单测；数据库读写留在 AiService。
 */

export type AIFeatureKey =
  | "semanticParse"
  | "testGeneration"
  | "assertionGeneration"
  | "errorAnalysis"
  | "reportSummary";

export const AI_FEATURE_KEYS: AIFeatureKey[] = [
  "semanticParse",
  "testGeneration",
  "assertionGeneration",
  "errorAnalysis",
  "reportSummary",
];

export const AI_FEATURE_LABELS: Record<AIFeatureKey, string> = {
  semanticParse: "接口语义分析",
  testGeneration: "自动生成测试用例",
  assertionGeneration: "自动生成断言",
  errorAnalysis: "测试失败分析",
  reportSummary: "报告智能总结",
};

/** 调用侧的功能标识 → 配置页勾选的功能 */
export const USAGE_FEATURE_TO_CONFIG: Record<string, AIFeatureKey> = {
  generate_scenario: "testGeneration",
  semantic_parse: "semanticParse",
  generate_tests: "testGeneration",
  generate_assertions: "assertionGeneration",
  analyze_error: "errorAnalysis",
  summarize_report: "reportSummary",
};

export type FeatureFlags = Record<AIFeatureKey, boolean>;

export interface RoutableProvider {
  id: number;
  name?: string;
  model?: string | null;
  isActive?: boolean;
  features?: Partial<Record<string, unknown>> | null;
  updatedAt?: Date | string | null;
}

export interface RoutableConfig {
  providerId?: number | null;
  features?: Partial<Record<string, unknown>> | null;
  featureProviders?: Partial<Record<string, number | null>> | null;
}

export type FeatureRouteSource = "explicit" | "default" | "auto" | "none";

export interface FeatureRoute {
  feature: AIFeatureKey;
  provider: RoutableProvider | null;
  source: FeatureRouteSource;
  /** 当前承担该功能且已启用的模型，按传入顺序（后添加的优先） */
  candidates: RoutableProvider[];
  /** 配置里指定过、但已经不承担该功能或已停用的模型 id */
  staleProviderId: number | null;
}

export const emptyFeatureFlags = (): FeatureFlags => ({
  semanticParse: false,
  testGeneration: false,
  assertionGeneration: false,
  errorAnalysis: false,
  reportSummary: false,
});

export function normalizeFeatureFlags(features: unknown): FeatureFlags {
  const source = (features || {}) as Record<string, unknown>;
  const result = emptyFeatureFlags();
  for (const key of AI_FEATURE_KEYS) result[key] = Boolean(source[key]);
  return result;
}

/**
 * 该模型是否承担指定功能。
 * 从未配置过功能的老数据（features 为空）回落到项目级开关，保持旧项目可用。
 */
export function providerServesFeature(
  provider: RoutableProvider | null | undefined,
  config: RoutableConfig | null | undefined,
  feature: AIFeatureKey,
): boolean {
  const source = provider?.features ? provider.features : config?.features;
  return normalizeFeatureFlags(source)[feature];
}

const toPositiveId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export function resolveFeatureRoute(
  providers: RoutableProvider[],
  config: RoutableConfig | null | undefined,
  feature: AIFeatureKey,
): FeatureRoute {
  const candidates = (providers || []).filter(
    (provider) => provider && provider.isActive !== false && providerServesFeature(provider, config, feature),
  );
  const requestedId = toPositiveId(config?.featureProviders?.[feature]);
  const explicit = requestedId ? candidates.find((provider) => provider.id === requestedId) : undefined;
  const staleProviderId = requestedId && !explicit ? requestedId : null;

  if (explicit) {
    return { feature, provider: explicit, source: "explicit", candidates, staleProviderId };
  }

  const preferred = candidates.find(
    (provider) => provider.id === toPositiveId(config?.providerId),
  );
  if (preferred) {
    return { feature, provider: preferred, source: "default", candidates, staleProviderId };
  }

  const fallback = candidates[0] || null;
  return {
    feature,
    provider: fallback,
    source: fallback ? "auto" : "none",
    candidates,
    staleProviderId,
  };
}

/**
 * 项目层面某功能是否可用 = 至少有一个启用中的模型承担它。
 * 所有模型都没配置过功能时，回落到项目级开关。
 */
export function mergeAvailableFeatures(
  providers: RoutableProvider[],
  config: RoutableConfig | null | undefined,
): FeatureFlags {
  const active = (providers || []).filter((provider) => provider && provider.isActive !== false);
  const withFeatures = active.filter((provider) => provider.features);
  if (!withFeatures.length) return normalizeFeatureFlags(config?.features);

  const merged = emptyFeatureFlags();
  for (const provider of withFeatures) {
    const flags = normalizeFeatureFlags(provider.features);
    for (const key of AI_FEATURE_KEYS) merged[key] = merged[key] || flags[key];
  }
  return merged;
}

/** 保存前清洗显式绑定：丢弃非法 id，空对象存 null */
export function normalizeFeatureProviders(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object") return null;
  const result: Record<string, number> = {};
  for (const key of AI_FEATURE_KEYS) {
    const id = toPositiveId((value as Record<string, unknown>)[key]);
    if (id) result[key] = id;
  }
  return Object.keys(result).length ? result : null;
}
