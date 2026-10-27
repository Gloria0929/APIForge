import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import axios from "axios";
import * as fs from "fs";
import { jsonrepair } from "jsonrepair";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { normalizeScenarioDraft } from "./scenario-draft";
import {
  normalizeEffort,
  reasoningFromError,
  reasoningFromMetadata,
  ReasoningCapabilities,
} from "./reasoning-capabilities";
import { mergeAllOf } from "../api/openapi";
import { AIProvider } from "./ai-provider.entity";
import { ProjectAIConfig } from "./project-ai-config.entity";
import { TestReport } from "../test/test-report.entity";
import { AIUsageLog } from "./ai-usage-log.entity";
import { API } from "../api/api.entity";
import { TestCase } from "../test/test-case.entity";
import { Environment } from "../environment/environment.entity";
import { TestService } from "../test/test.service";
import { buildStressReportSummary, normalizeStressReportSummary, parseSummaryObject } from "./stress-report-summary";
import { rewriteLoopbackHost } from "../../common/utils/runtime-host";
import {
  AI_FEATURE_KEYS,
  AI_FEATURE_LABELS,
  AIFeatureKey,
  FeatureRoute,
  mergeAvailableFeatures,
  normalizeFeatureProviders,
  resolveFeatureRoute,
  USAGE_FEATURE_TO_CONFIG,
} from "./feature-routing";

type AIUsageFeature =
  | "generate_scenario"
  | "semantic_parse"
  | "generate_tests"
  | "generate_assertions"
  | "analyze_error"
  | "summarize_report";

/** 不需要 API Key 的本地服务（Ollama 等），留空即可 */
const KEYLESS_PROVIDER_TYPES = new Set(["ollama"]);

/** 非对话类模型：Ollama 的嵌入模型常叫 nomic-embed-text / bge-m3 / all-minilm */
const NON_CHAT_MODEL_RE =
  /(embedding|embed|whisper|tts-|dall-e|moderation|text-to-speech|^bge-|all-minilm|snowflake-arctic)/i;

export const providerNeedsApiKey = (providerType?: string) =>
  !KEYLESS_PROVIDER_TYPES.has(String(providerType || "").toLowerCase());

/** 按 provider 类型生成认证头；没有 Key 时（如 Ollama）完全不带认证头 */
export const providerAuthHeaders = (provider: Partial<AIProvider>) => {
  const key = String(provider?.apiKey || "").trim();
  if (!key) return {};
  if (provider.providerType === "azure") return { "api-key": key };
  if (provider.providerType === "anthropic") {
    return { "x-api-key": key, "anthropic-version": "2023-06-01" };
  }
  return { Authorization: `Bearer ${key}` };
};

type ApiField = {
  name: string;
  in: "path" | "query" | "header" | "body";
  required: boolean;
  type: string;
  format?: string;
  description?: string;
  enum?: any[];
  example?: any;
};

type SemanticInsights = {
  summary: string;
  businessContext: string;
  categories: string[];
  sensitiveFields: string[];
  fieldMeanings: Record<string, string>;
  suggestedTests: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  authRelated: boolean;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(AIProvider)
    private readonly providerRepository: Repository<AIProvider>,
    @InjectRepository(ProjectAIConfig)
    private readonly configRepository: Repository<ProjectAIConfig>,
    @InjectRepository(AIUsageLog)
    private readonly usageLogRepository: Repository<AIUsageLog>,
    @InjectRepository(API)
    private readonly apiRepository: Repository<API>,
    @InjectRepository(TestReport)
    private readonly testReportRepository: Repository<TestReport>,
    @InjectRepository(TestCase)
    private readonly testCaseRepository: Repository<TestCase>,
    @InjectRepository(Environment)
    private readonly environmentRepository: Repository<Environment>,
    private readonly testService: TestService,
  ) {}

  async getProviders() {
    const providers = await this.providerRepository.find({
      order: { id: "DESC" },
    });

    return providers.map((provider) => ({
      ...provider,
      apiKey: "",
      hasApiKey: Boolean(provider.apiKey),
      healthStatus: this.normalizeProviderHealth(provider),
    }));
  }

  async getProviderModels(
    draft: Partial<AIProvider> & { providerId?: number },
  ) {
    const stored = draft.providerId
      ? await this.providerRepository.findOne({
          where: { id: Number(draft.providerId) },
        })
      : null;
    const provider = {
      ...stored,
      ...draft,
      apiKey: String(draft.apiKey || "").trim() || stored?.apiKey,
    };
    if (!provider.apiKey && providerNeedsApiKey(provider.providerType)) {
      throw new BadRequestException("请先填写 API Key");
    }
    if (provider.providerType === "azure") return { models: [] };
    let url: URL;
    try {
      url = new URL(this.providerBaseUrl(provider));
    } catch {
      throw new BadRequestException("API 地址不是有效 URL");
    }
    if (!["http:", "https:"].includes(url.protocol))
      throw new BadRequestException("API 地址必须使用 HTTP 或 HTTPS");
    url.pathname =
      url.pathname
        .replace(/\/(chat\/completions|messages|models)\/?$/i, "")
        .replace(/\/+$/, "") + "/models";
    url.search = "";
    try {
      const { data } = await axios.get(url.toString(), {
        headers: providerAuthHeaders(provider as AIProvider),
        timeout: 15000,
      });
      const entries = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
          ? data.models
          : [];
      const models = [
        ...new Set<string>(
          entries
            .map((model: any) =>
              String(model.id || model.name || "").replace(/^models\//, ""),
            )
            .filter(
              (id: string) =>
                id &&
                !NON_CHAT_MODEL_RE.test(id),
            ),
        ),
      ].sort();
      return { models };
    } catch (error) {
      throw this.toProviderError(error, url.toString());
    }
  }

  async getProviderReasoning(draft: Partial<AIProvider> & { providerId?: number }) {
    const stored = draft.providerId
      ? await this.providerRepository.findOne({ where: { id: Number(draft.providerId) } })
      : null;
    const provider = {
      ...stored, ...draft,
      apiKey: String(draft.apiKey || "").trim() || stored?.apiKey,
    };
    if (!String(provider.model || "").trim()) {
      throw new BadRequestException("请先选择模型");
    }
    if (!provider.apiKey && providerNeedsApiKey(provider.providerType)) {
      throw new BadRequestException("请先填写 API Key");
    }
    let base: URL;
    try { base = new URL(this.providerBaseUrl(provider)); }
    catch { throw new BadRequestException("API 地址不是有效 URL"); }
    if (!["http:", "https:"].includes(base.protocol)) {
      throw new BadRequestException("API 地址必须使用 HTTP 或 HTTPS");
    }
    const anthropic = provider.providerType === "anthropic";
    const options = { headers: providerAuthHeaders(provider as AIProvider), timeout: 10000 };
    // Standard model lists often contain only IDs; use capability enums when exposed.
    if (provider.providerType !== "azure") {
      const modelsUrl = new URL(base);
      modelsUrl.pathname = modelsUrl.pathname.replace(/\/(chat\/completions|messages|models)\/?$/i, "").replace(/\/+$/, "") + "/models";
      modelsUrl.search = "";
      try {
        const { data } = await axios.get(modelsUrl.toString(), options);
        const entries = Array.isArray(data?.data) ? data.data : data?.models;
        const model = Array.isArray(entries)
          ? entries.find((item) => String(item.id || item.name || "").replace(/^models\//, "") === provider.model)
          : null;
        const capabilities = reasoningFromMetadata(model);
        if (capabilities) return capabilities;
      } catch (error: any) {
        if ([401, 403, 429].includes(error?.response?.status)) throw this.toProviderError(error, modelsUrl.toString());
      }
    }
    let endpoint = this.resolveChatCompletionsEndpoint(base.toString());
    if (anthropic) {
      const url = new URL(base);
      if (!url.pathname.endsWith("/messages")) {
        url.pathname = url.pathname.replace(/\/+$/, "") + "/messages";
      }
      endpoint = url.toString();
    }
    let tokenField = "max_tokens";
    const probe = async (effort: string): Promise<{
      accepted: boolean;
      rejected?: boolean;
      capability?: ReasoningCapabilities;
    }> => {
      const send = () => axios.post(endpoint, {
        model: provider.model,
        messages: [{ role: "user", content: "Reply OK." }],
        [tokenField]: 1,
        ...(anthropic ? { output_config: { effort } } : { reasoning_effort: effort }),
      }, options);
      try {
        await send();
        return { accepted: true };
      } catch (error: any) {
        const text = JSON.stringify(error?.response?.data ?? "");
        if (!anthropic && tokenField === "max_tokens" && /max_tokens/.test(text) && /max_completion_tokens/.test(text)) {
          tokenField = "max_completion_tokens";
          return probe(effort);
        }
        if (![400, 422].includes(error?.response?.status)) throw this.toProviderError(error, endpoint);
        return {
          accepted: false,
          rejected: /reasoning[_ .-]?effort|output_config[.\s]*effort|["']effort["']/i.test(text),
          capability: reasoningFromError(error.response.data),
        };
      }
    };
    // A rejected sentinel exposes the provider's enum. Acceptance means the
    // gateway may ignore the field, so never treat it as proof of support.
    const discovery = await probe("__apiforge_invalid_effort__");
    const capability = discovery.capability;
    if (!capability) return { status: "unknown", levels: [] } as ReasoningCapabilities;
    if (capability.status === "unsupported") return capability;
    const levels: string[] = [];
    for (const level of capability.levels) {
      const result = await probe(level);
      if (result.accepted) levels.push(level);
      else if (!result.rejected) return { status: "unknown", levels: [] } as ReasoningCapabilities;
    }
    return { status: levels.length ? "supported" : "unsupported", levels, source: "probe" } as ReasoningCapabilities;
  }

  async createProvider(provider: Partial<AIProvider>) {
    const entity = this.providerRepository.create({
      name: String(provider?.name || "").trim(),
      providerType: String(provider?.providerType || "custom"),
      baseUrl: String(provider?.baseUrl || "").trim(),
      apiKey: String(provider?.apiKey || "").trim(),
      model: provider?.model ? String(provider.model).trim() : undefined,
      isActive: Boolean(provider?.isActive),
      features: this.normalizeFeatureFlags(provider?.features),
      reasoningEffort: this.normalizeReasoningEffort(provider?.reasoningEffort),
      contextWindow: this.normalizeContextWindow(provider?.contextWindow),
      healthStatus: this.buildProviderHealthSnapshot(provider as AIProvider),
      lastCheck: new Date(),
    });
    this.validateProvider(entity);
    const saved = await this.providerRepository.save(entity);
    return { ...saved, apiKey: "", hasApiKey: Boolean(saved.apiKey) };
  }

  async updateProvider(id: number, provider: Partial<AIProvider>) {
    const existing = await this.providerRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("AI provider not found");

    const merged = this.providerRepository.create({
      ...existing,
      ...provider,
      id: existing.id,
      name:
        provider?.name !== undefined
          ? String(provider.name || "").trim()
          : existing.name,
      providerType:
        provider?.providerType !== undefined
          ? String(provider.providerType || "custom")
          : existing.providerType,
      baseUrl:
        provider?.baseUrl !== undefined
          ? String(provider.baseUrl || "").trim()
          : existing.baseUrl,
      apiKey: String(provider?.apiKey || "").trim() || existing.apiKey,
      model:
        provider?.model !== undefined
          ? String(provider.model || "").trim() || undefined
          : existing.model,
      isActive:
        provider?.isActive !== undefined
          ? Boolean(provider.isActive)
          : existing.isActive,
      features:
        provider?.features !== undefined
          ? this.normalizeFeatureFlags(provider.features)
          : existing.features,
      reasoningEffort:
        provider?.reasoningEffort !== undefined
          ? this.normalizeReasoningEffort(provider.reasoningEffort)
          : existing.reasoningEffort,
      contextWindow:
        provider?.contextWindow !== undefined
          ? this.normalizeContextWindow(provider.contextWindow)
          : existing.contextWindow,
    });

    this.validateProvider(merged);
    merged.healthStatus = this.buildProviderHealthSnapshot(merged);
    merged.lastCheck = new Date();
    const saved = await this.providerRepository.save(merged);
    return { ...saved, apiKey: "", hasApiKey: Boolean(saved.apiKey) };
  }

  async deleteProvider(id: number) {
    const configs = await this.configRepository.find();
    const remainingActive = (await this.listRoutableProviders()).filter(
      (provider) => provider.id !== id,
    );
    for (const config of configs) {
      const featureProviders = normalizeFeatureProviders(config.featureProviders);
      let mappingChanged = false;
      if (featureProviders) {
        for (const key of Object.keys(featureProviders)) {
          if (featureProviders[key] === id) {
            delete featureProviders[key];
            mappingChanged = true;
          }
        }
      }
      const boundToProvider = config.providerId === id;
      if (!boundToProvider && !mappingChanged) continue;
      await this.configRepository.update(
        { id: config.id },
        {
          ...(boundToProvider ? { providerId: null } : {}),
          featureProviders: normalizeFeatureProviders(featureProviders),
          // 还有其他可用模型时不关闭 AI，交给功能路由继续工作
          ...(boundToProvider && !remainingActive.length ? { aiEnabled: false } : {}),
        },
      );
    }
    return this.providerRepository.delete(id);
  }

  async testProvider(id: number) {
    const provider = await this.providerRepository.findOne({ where: { id } });
    if (!provider) throw new NotFoundException("AI provider not found");

    const health = await this.performProviderHealthCheck(provider);
    provider.healthStatus = health;
    provider.lastCheck = new Date();
    await this.providerRepository.save(provider);
    return health;
  }

  /** 测试所有提供商连接（与 testProvider 逻辑一致，批量执行） */
  async testAllProviders() {
    const providers = await this.providerRepository.find({
      order: { id: "DESC" },
    });
    const normalizedProviders = await Promise.all(
      providers.map(async (provider) => {
        const health = await this.performProviderHealthCheck(provider);
        provider.healthStatus = health;
        provider.lastCheck = new Date();
        await this.providerRepository.save(provider);
        return {
          id: provider.id,
          name: provider.name,
          available: health.available,
          error: health.error,
          mode: health.mode,
          healthUrl: provider.baseUrl,
          lastCheck: health.lastCheck,
        };
      }),
    );
    return {
      available: normalizedProviders.some((item) => item.available),
      providers: normalizedProviders,
    };
  }

  async getConfigs(projectId: string) {
    const where = projectId ? { projectId } : {};
    const configs = await this.configRepository.find({ where });
    const providers = await this.listRoutableProviders();
    // 辅助功能不再由用户单独开关：只要存在已启用的模型就视为开启
    const aiEnabled = providers.length > 0;
    const result: any[] = configs.map((config) => {
      const normalized = this.normalizeConfig(config);
      // 多模型并存后，功能是否可用取所有启用模型的并集，不再取决于单个绑定的提供商
      normalized.features = mergeAvailableFeatures(providers, config);
      return { ...normalized, aiEnabled };
    });
    // 项目尚未保存过配置但已有可用模型时，返回一份默认配置，让前端按「已开启」展示
    if (!result.length && projectId && aiEnabled) {
      result.push({
        projectId,
        aiEnabled,
        providerId: null,
        featureProviders: null,
        features: mergeAvailableFeatures(providers, null),
        modelConfig: { temperature: 0.2, maxTokens: 2048, timeout: 30000 },
      });
    }
    return result;
  }

  /** 各功能当前实际使用的模型，用于配置页展示与冲突提示 */
  async getFeatureRouting(projectId: string) {
    const config = await this.configRepository.findOne({ where: { projectId } });
    const providers = await this.listRoutableProviders();
    const routes = AI_FEATURE_KEYS.map((feature) => {
      const route: FeatureRoute = resolveFeatureRoute(providers, config, feature);
      return {
        feature,
        label: AI_FEATURE_LABELS[feature],
        providerId: route.provider?.id ?? null,
        providerName: route.provider?.name ?? null,
        model: route.provider?.model ?? null,
        source: route.source,
        staleProviderId: route.staleProviderId,
        candidates: route.candidates.map((provider) => ({
          id: provider.id,
          name: provider.name,
          model: provider.model || null,
        })),
      };
    });
    return {
      projectId,
      aiEnabled: providers.length > 0,
      defaultProviderId: config?.providerId ?? null,
      featureProviders: normalizeFeatureProviders(config?.featureProviders) || {},
      routes,
    };
  }

  async createConfig(config: Partial<ProjectAIConfig>) {
    const projectId = String(config?.projectId || "").trim();
    if (!projectId) {
      throw new BadRequestException("projectId is required");
    }

    const existing = await this.configRepository.findOne({
      where: { projectId },
    });
    const payload = {
      ...(existing || {}),
      projectId,
      // 辅助功能没有独立开关：未显式传入时保持原值（新配置默认开启），由模型是否存在决定实际可用性
      aiEnabled:
        config?.aiEnabled !== undefined
          ? Boolean(config.aiEnabled)
          : Boolean(existing?.aiEnabled ?? true),
      providerId:
        config?.providerId !== undefined && config.providerId !== null
          ? Number(config.providerId)
          : null,
      features:
        config?.features !== undefined
          ? this.normalizeFeatureFlags(config.features)
          : this.normalizeFeatureFlags(existing?.features),
      featureProviders:
        config?.featureProviders !== undefined
          ? normalizeFeatureProviders(config.featureProviders)
          : normalizeFeatureProviders(existing?.featureProviders),
      modelConfig: {
        temperature: Number(
          config?.modelConfig?.temperature ??
            existing?.modelConfig?.temperature ??
            0.2,
        ),
        maxTokens: Number(
          config?.modelConfig?.maxTokens ??
            existing?.modelConfig?.maxTokens ??
            2048,
        ),
        timeout: Number(
          config?.modelConfig?.timeout ??
            existing?.modelConfig?.timeout ??
            60000,
        ),
      },
    } as Partial<ProjectAIConfig>;

    const saved = await this.configRepository.save(payload);
    return (await this.getConfigs(projectId))[0] || this.normalizeConfig(saved);
  }

  async updateConfig(id: number, config: Partial<ProjectAIConfig>) {
    const existing = await this.configRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException("AI config not found");

    const saved = await this.configRepository.save({
      ...existing,
      aiEnabled:
        config?.aiEnabled !== undefined
          ? Boolean(config.aiEnabled)
          : existing.aiEnabled,
      providerId:
        config?.providerId !== undefined
          ? config.providerId === null
            ? null
            : Number(config.providerId)
          : existing.providerId,
      features:
        config?.features !== undefined
          ? this.normalizeFeatureFlags(config.features)
          : this.normalizeFeatureFlags(existing.features),
      featureProviders:
        config?.featureProviders !== undefined
          ? normalizeFeatureProviders(config.featureProviders)
          : normalizeFeatureProviders(existing.featureProviders),
      modelConfig:
        config?.modelConfig !== undefined
          ? {
              temperature: Number(config?.modelConfig?.temperature ?? 0.2),
              maxTokens: Number(config?.modelConfig?.maxTokens ?? 2048),
              timeout: Number(config?.modelConfig?.timeout ?? 60000),
            }
          : existing.modelConfig,
    });

    return this.normalizeConfig(saved);
  }

  async semanticParseApi(projectId: string, apiId: string, persist = false) {
    await this.ensureFeatureEnabled(projectId, "semanticParse");

    const api = await this.requireApi(projectId, apiId);
    const startedAt = Date.now();
    try {
      const fallbackInsights = this.buildSemanticInsights(api);
      const llmResult = await this.callFeatureJson(
        projectId,
        "semantic_parse",
        {
          api: this.serializeApiForPrompt(api),
          fallback: fallbackInsights,
        },
      );
      const insights = this.normalizeSemanticInsights(
        llmResult,
        fallbackInsights,
      );
      const updatedTags =
        Array.isArray(insights.categories) && insights.categories.length > 0
          ? insights.categories
          : api.tags || [];

      if (persist) {
        await this.apiRepository.save({
          ...api,
          tags: updatedTags,
          aiInsights: insights as any,
        });
      }

      const result = {
        apiId: api.id,
        persisted: Boolean(persist),
        tags: updatedTags,
        insights,
      };
      await this.logUsage(
        projectId,
        "semantic_parse",
        true,
        startedAt,
        result,
        llmResult?.__usage?.total_tokens,
      );
      return result;
    } catch (error: any) {
      await this.logUsage(
        projectId,
        "semantic_parse",
        false,
        startedAt,
        error?.message || "semantic parse failed",
      );
      throw error;
    }
  }

  async validateAnalysisJob(projectId: string, apiIds: string[]) {
    if (
      !projectId ||
      !Array.isArray(apiIds) ||
      apiIds.length === 0 ||
      apiIds.length > 5000 ||
      apiIds.some((id) => typeof id !== "string" || !id)
    ) {
      throw new BadRequestException("请选择 1 到 5000 个有效接口");
    }
    await this.ensureFeatureEnabled(projectId, "semanticParse");
    const ids = [...new Set(apiIds)];
    const apis = await this.apiRepository.find({
      where: { projectId, id: In(ids) },
      select: { id: true, aiInsights: true },
    });
    if (apis.length !== ids.length)
      throw new BadRequestException("部分接口不存在或不属于当前项目");
    // 已分析过的接口无需重复调用模型
    const pendingIds = apis
      .filter((api) => !api.aiInsights)
      .map((api) => api.id);
    if (pendingIds.length === 0)
      throw new BadRequestException("所选接口均已完成分析，无需重复分析");
    return pendingIds;
  }

  async analyzeImportedApis(
    projectId: string,
    apiIds: string[],
    persist = true,
  ) {
    await this.ensureFeatureEnabled(projectId, "semanticParse");
    const ids = Array.isArray(apiIds) ? apiIds.filter(Boolean) : [];
    if (ids.length === 0) {
      throw new BadRequestException("apiIds is required");
    }

    const startedAt = Date.now();
    try {
      const apis = await this.apiRepository.find({
        where: ids.map((id) => ({ id, projectId })),
      });

      const items = [];
      for (const api of apis) {
        const fallbackInsights = this.buildSemanticInsights(api);
        const llmResult = await this.callFeatureJson(
          projectId,
          "semantic_parse",
          {
            api: this.serializeApiForPrompt(api),
            fallback: fallbackInsights,
          },
        );
        const insights = this.normalizeSemanticInsights(
          llmResult,
          fallbackInsights,
        );
        const mergedTags = persist
          ? this.mergeUniqueStrings(api.tags || [], insights.categories)
          : api.tags || [];

        if (persist) {
          await this.apiRepository.save({
            ...api,
            tags: mergedTags,
          });
        }

        items.push({
          apiId: api.id,
          summary: api.summary,
          path: api.path,
          tags: persist ? mergedTags : api.tags || [],
          riskLevel: insights.riskLevel,
          suggestedTestsCount: insights.suggestedTests.length,
        });
      }

      const result = {
        processed: items.length,
        persisted: Boolean(persist),
        items,
      };
      await this.logUsage(projectId, "semantic_parse", true, startedAt, result);
      return result;
    } catch (error: any) {
      await this.logUsage(
        projectId,
        "semantic_parse",
        false,
        startedAt,
        error?.message || "analyze import failed",
      );
      throw error;
    }
  }

  /**
   * 生成测试用例：优先使用 AI（系统提示词），失败时回退到规则生成。
   * 用于接口文档页批量生成、AI 创建场景时补齐缺失用例。
   */
  async generateTestsRuleBased(projectId: string, apiId: string) {
    const api = await this.requireApi(projectId, apiId);
    const fallbackResult = this.buildRuleBasedTestSuggestions(api);
    const startedAt = Date.now();

    try {
      await this.ensureFeatureEnabled(projectId, "testGeneration");
      const fields = this.extractApiFields(api);
      const llmResult = await this.callFeatureJson(
        projectId,
        "generate_tests",
        {
          api: this.serializeApiForPrompt(api),
          fields,
          fallback: fallbackResult,
        },
      );
      return this.normalizeGeneratedTests(llmResult, fallbackResult, api);
    } catch (err) {
      const errMsg = (err as Error)?.message || "unknown";
      this.logger.warn(
        `[generateTestsRuleBased] AI 生成失败，使用规则回退（未消耗 token）: ${errMsg}`,
      );
      await this.logUsage(
        projectId,
        "generate_tests",
        false,
        startedAt,
        errMsg,
        0,
      );
      return this.normalizeGeneratedTests(null, fallbackResult, api);
    }
  }

  private buildRuleBasedTestSuggestions(api: API) {
    const fallbackInsights = this.buildSemanticInsights(api);
    const fields = this.extractApiFields(api);
    const successStatus = this.pickSuccessStatus(api);
    const path = this.materializePath(api);
    const bodyTemplate = this.buildBodyTemplate(api, fields);
    const queryTemplate = this.buildQueryTemplate(fields);
    const defaultHeaders: Record<string, string> =
      Object.keys(bodyTemplate).length > 0
        ? { "Content-Type": "application/json" }
        : {};
    // 仅登录接口不添加 Authorization，其他接口自动加入 token
    if (!this.isLoginEndpoint(api)) {
      defaultHeaders["Authorization"] = "Bearer {{token}}";
    }

    const successCase = {
      name: this.makeScenarioName(api, "正常流程"),
      type: "happy_path",
      priority: fallbackInsights.riskLevel === "HIGH" ? "P0" : "P1",
      rationale: "覆盖接口主业务链路，验证基础可用性。",
      tags: this.mergeUniqueStrings(fallbackInsights.categories, [
        "AI推荐",
        "正常流程",
      ]),
      request: {
        method: api.method,
        url: `{{base_url}}${path}`,
        headers: defaultHeaders,
        query: queryTemplate,
        body: Object.keys(bodyTemplate).length ? bodyTemplate : undefined,
      },
      assertions: [
        { type: "STATUS", condition: "eq", expected: successStatus },
      ],
    };

    const suggestions: any[] = [successCase];
    const requiredField = fields.find((field) => field.required);
    const stringField = fields.find(
      (field) => field.type === "string" && field.in !== "path",
    );

    if (requiredField) {
      suggestions.push({
        name: this.makeScenarioName(api, `${requiredField.name} 缺失`),
        type: "required_field",
        priority: "P1",
        rationale: "验证必填字段缺失时的输入校验与错误处理。",
        tags: ["AI推荐", "参数校验"],
        request: this.buildMutatedRequest(successCase.request, requiredField, {
          remove: true,
        }),
        assertions: [
          {
            type: "STATUS",
            condition: "eq",
            expected: this.pickClientErrorStatus(api),
          },
        ],
      });
    }

    if (stringField) {
      suggestions.push({
        name: this.makeScenarioName(api, `${stringField.name} 边界值`),
        type: "boundary",
        priority: "P1",
        rationale: "验证字符串参数长度边界与截断逻辑。",
        tags: ["AI推荐", "边界值"],
        request: this.buildMutatedRequest(successCase.request, stringField, {
          value: "X".repeat(128),
        }),
        assertions: [
          {
            type: "STATUS",
            condition: "eq",
            expected: this.pickClientErrorStatus(api),
          },
        ],
      });
      suggestions.push({
        name: this.makeScenarioName(api, `${stringField.name} SQL 注入`),
        type: "security_sql_injection",
        priority: fallbackInsights.riskLevel === "HIGH" ? "P0" : "P1",
        rationale: "验证服务端对恶意输入的过滤与鉴权防护。",
        tags: ["AI推荐", "安全", "SQL注入"],
        request: this.buildMutatedRequest(successCase.request, stringField, {
          value: "' OR '1'='1",
        }),
        assertions: [
          {
            type: "STATUS",
            condition: "eq",
            expected: this.pickUnauthorizedStatus(api),
          },
        ],
      });
    }

    if (fallbackInsights.authRelated) {
      suggestions.push({
        name: this.makeScenarioName(api, "未授权访问"),
        type: "auth_missing",
        priority: "P0",
        rationale: "验证缺少认证信息时接口是否正确拒绝请求。",
        tags: ["AI推荐", "鉴权"],
        request: { ...successCase.request, headers: {} },
        assertions: [
          {
            type: "STATUS",
            condition: "eq",
            expected: this.pickUnauthorizedStatus(api),
          },
        ],
      });
    }

    if (["POST", "PUT", "PATCH", "DELETE"].includes(api.method)) {
      suggestions.push({
        name: this.makeScenarioName(api, "重复提交 / 幂等性"),
        type: "idempotency",
        priority: fallbackInsights.riskLevel === "HIGH" ? "P0" : "P1",
        rationale: "验证重复请求时的幂等处理与状态保持。",
        tags: ["AI推荐", "幂等性"],
        request: successCase.request,
        assertions: [
          { type: "STATUS", condition: "eq", expected: successStatus },
        ],
      });
    }

    return {
      apiId: api.id,
      insights: fallbackInsights,
      suggestions,
    };
  }

  async generateTests(projectId: string, apiId: string) {
    await this.ensureFeatureEnabled(projectId, "testGeneration");

    const api = await this.requireApi(projectId, apiId);
    const startedAt = Date.now();
    try {
      const fallbackResult = this.buildRuleBasedTestSuggestions(api);
      const fields = this.extractApiFields(api);
      const llmResult = await this.callFeatureJson(
        projectId,
        "generate_tests",
        {
          api: this.serializeApiForPrompt(api),
          fields,
          fallback: fallbackResult,
        },
      );
      const result = this.normalizeGeneratedTests(
        llmResult,
        fallbackResult,
        api,
      );
      await this.logUsage(projectId, "generate_tests", true, startedAt, result);
      return result;
    } catch (error: any) {
      this.logger.warn(
        `[generateTests] AI 生成失败，使用规则回退（未消耗 token）: ${error?.message}`,
      );
      await this.logUsage(
        projectId,
        "generate_tests",
        false,
        startedAt,
        error?.message || "generate tests failed",
        0,
      );
      const fallbackResult = this.buildRuleBasedTestSuggestions(api);
      const result = this.normalizeGeneratedTests(null, fallbackResult, api);
      return result;
    }
  }

  async generateAssertions(projectId: string, response: any) {
    await this.ensureFeatureEnabled(projectId, "assertionGeneration");
    const startedAt = Date.now();

    const status = Number(
      response?.response?.status ?? response?.status ?? 200,
    );
    const data =
      response?.responseBody ??
      response?.response?.data ??
      response?.data ??
      response?.body ??
      null;
    const responseTime = Number(
      response?.responseTime ?? response?.elapsed ?? response?.time ?? 0,
    );

    const suggestions: any[] = [
      {
        type: "STATUS",
        condition: "eq",
        expected: status,
        message: "验证 HTTP 状态码符合预期",
        confidence: 0.99,
      },
    ];

    const rationale: string[] = ["已基于最近一次真实响应生成稳定断言建议。"];

    if (data && typeof data === "object" && !Array.isArray(data)) {
      const commonBusinessKeys = ["code", "success", "message"];
      for (const key of commonBusinessKeys) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
        const value = (data as any)[key];
        if (
          typeof value === "number" ||
          typeof value === "boolean" ||
          (typeof value === "string" && value.length <= 30)
        ) {
          suggestions.push({
            type: "JSON_PATH",
            target: `$.${key}`,
            condition: "eq",
            expected: value,
            message: `验证业务字段 ${key}`,
            confidence: 0.95,
          });
        }
      }

      for (const tokenPath of [
        "$.token",
        "$.accessToken",
        "$.data.token",
        "$.data.accessToken",
      ]) {
        const value = this.extractJsonPath(data, tokenPath);
        if (value !== undefined && value !== null) {
          suggestions.push({
            type: "JSON_PATH",
            target: tokenPath,
            condition: "exists",
            expected: true,
            message: `验证 ${tokenPath} 存在`,
            confidence: 0.92,
          });
        }
      }

      for (const arrayPath of [
        "$.data.list",
        "$.list",
        "$.items",
        "$.data.items",
      ]) {
        const value = this.extractJsonPath(data, arrayPath);
        if (Array.isArray(value)) {
          suggestions.push({
            type: "JSON_PATH",
            target: arrayPath,
            condition: "exists",
            expected: true,
            message: `验证 ${arrayPath} 已返回`,
            confidence: 0.86,
          });
          break;
        }
      }
    }

    if (responseTime > 0) {
      const threshold = this.suggestResponseTimeThreshold(responseTime);
      suggestions.push({
        type: "RESPONSE_TIME",
        condition: "lt",
        expected: threshold,
        message: "验证接口性能未明显劣化",
        confidence: 0.88,
      });
      rationale.push(
        `已根据当前响应 ${responseTime}ms 建议阈值 < ${threshold}ms。`,
      );
    }

    const fallbackResult = { suggestions, rationale };

    try {
      const llmResult = await this.callFeatureJson(
        projectId,
        "generate_assertions",
        {
          response: this.serializeResponseForPrompt(response),
          fallback: fallbackResult,
        },
      );
      const result = this.normalizeGeneratedAssertions(
        llmResult,
        fallbackResult,
      );
      await this.logUsage(
        projectId,
        "generate_assertions",
        true,
        startedAt,
        result,
        llmResult?.__usage?.total_tokens,
      );
      return result;
    } catch (error: any) {
      this.logger.warn(
        `[generateAssertions] AI 生成失败，使用规则回退（未消耗 token）: ${error?.message}`,
      );
      await this.logUsage(
        projectId,
        "generate_assertions",
        false,
        startedAt,
        error?.message || "generate assertions failed",
        0,
      );
      return fallbackResult;
    }
  }

  async analyzeError(projectId: string, error: any) {
    await this.ensureFeatureEnabled(projectId, "errorAnalysis");
    const startedAt = Date.now();

    try {
      const request = error?.request || {};
      const response = error?.response || {};
      const assertions = Array.isArray(error?.assertions)
        ? error.assertions
        : [];
      const api = error?.api || null;
      const status = Number(response?.status ?? 0);
      const failedAssertions = assertions.filter(
        (item: any) => item && !item.passed,
      );

      let rootCause = "未知原因，需要进一步排查";
      let details = "建议结合请求参数、环境变量和后端日志继续定位。";
      let confidence = 0.55;
      const suggestions: Array<{
        type: string;
        description: string;
        example?: any;
      }> = [];

      if (
        error?.error?.code === "ECONNABORTED" ||
        String(error?.error?.message || "").includes("timeout")
      ) {
        rootCause = "请求超时或上游服务响应过慢";
        details =
          "接口在预期时间内没有返回结果，通常与网络、数据库或下游依赖性能有关。";
        confidence = 0.9;
        suggestions.push(
          { type: "retry", description: "先重试一次，确认是否为偶发性抖动。" },
          {
            type: "observe_upstream",
            description: "检查数据库、缓存或外部服务的响应时间。",
          },
        );
      } else if (status >= 500) {
        rootCause = "服务端内部异常";
        details = "HTTP 5xx 通常意味着后端处理失败、依赖故障或未捕获异常。";
        confidence = 0.88;
        suggestions.push(
          {
            type: "check_backend",
            description: "查看后端应用日志与错误堆栈。",
          },
          {
            type: "check_dependencies",
            description: "检查数据库、缓存、消息队列等依赖是否可用。",
          },
        );
      } else if (status === 401 || status === 403) {
        rootCause = "鉴权失败或权限不足";
        details = "请求缺少有效认证信息，或当前账号无权访问该接口。";
        confidence = 0.93;
        suggestions.push(
          {
            type: "refresh_token",
            description: "重新生成 Token 或检查 Authorization 头。",
          },
          {
            type: "check_role",
            description: "确认当前环境变量中的账号角色是否匹配。",
          },
        );
      } else if (status === 404) {
        rootCause = "路径不存在或环境 base_url 配置错误";
        details = "通常是请求 URL 拼接错误、网关路由未命中或环境配置不正确。";
        confidence = 0.9;
        suggestions.push(
          {
            type: "check_url",
            description: "检查请求路径、环境 base_url 与接口版本号。",
          },
          {
            type: "check_route",
            description: "确认接口是否已部署到当前环境。",
          },
        );
      } else if (status === 400 || status === 409 || status === 422) {
        rootCause = "请求参数不符合接口约束";
        details =
          "服务端拒绝了当前输入，可能是必填字段缺失、字段名错误、类型不匹配或状态冲突。";
        confidence = 0.86;
        suggestions.push({
          type: "compare_contract",
          description:
            "对比接口文档定义与实际请求体，重点检查必填字段、字段名与枚举值。",
        });

        const mismatch = this.detectRequestContractMismatch(request, api);
        if (mismatch) {
          rootCause = mismatch.rootCause;
          details = mismatch.details;
          confidence = mismatch.confidence;
          if (mismatch.example) {
            suggestions.unshift({
              type: "fix_request",
              description: mismatch.fix,
              example: mismatch.example,
            });
          }
        }
      } else if (failedAssertions.length > 0) {
        rootCause = "断言与实际响应不一致";
        details = `共有 ${failedAssertions.length} 条断言失败，接口可能已变更或当前断言过于严格。`;
        confidence = 0.84;
        suggestions.push(
          {
            type: "review_assertions",
            description: "检查断言条件是否仍符合最新接口返回结构。",
          },
          {
            type: "regenerate_assertions",
            description: "根据最新响应重新生成断言建议。",
          },
        );
      }

      const fallbackResult = {
        analysis: {
          rootCause,
          details,
          confidence,
        },
        suggestions,
        similar_issues: this.buildSimilarIssues(
          status,
          failedAssertions.length,
        ),
      };
      const llmResult = await this.callFeatureJson(projectId, "analyze_error", {
        error: this.serializeErrorForPrompt(error),
        fallback: fallbackResult,
      });
      const result = this.normalizeErrorAnalysis(llmResult, fallbackResult);
      await this.logUsage(projectId, "analyze_error", true, startedAt, result);
      return result;
    } catch (errorValue: any) {
      await this.logUsage(
        projectId,
        "analyze_error",
        false,
        startedAt,
        errorValue?.message || "analyze error failed",
      );
      throw errorValue;
    }
  }

  async summarizeReport(projectId: string, report: any, reportId?: string) {
    await this.ensureFeatureEnabled(projectId, "reportSummary");
    const startedAt = Date.now();

    try {
      if (reportId) {
        const stored = await this.testReportRepository.findOne({ where: { id: reportId, projectId } });
        if (!stored) throw new NotFoundException("报告不存在或不属于当前项目");
        report = { ...stored, summary: parseSummaryObject(stored.summary), performance: parseSummaryObject(stored.performance), charts: parseSummaryObject(stored.charts), details: JSON.parse(stored.details || "[]") };
      }
      const summary = parseSummaryObject(report?.summary);
      if (summary.stressTest) {
        const facts = buildStressReportSummary(report);
        const llmResult = await this.callFeatureJson(projectId, "summarize_report", {
          report: {
            reportType: "stress", name: report?.name, environment: report?.environment,
            ...facts.stress_analysis, top_failures: facts.top_failures, slowest_apis: facts.slowest_apis,
          },
          fallback: { summary: facts.summary, highlights: facts.highlights, risk_assessment: facts.risk_assessment },
        }, { minTimeout: 120000 });
        const result = normalizeStressReportSummary(llmResult, facts);
        await this.logUsage(projectId, "summarize_report", true, startedAt, result, llmResult?.__usage?.total_tokens);
        return result;
      }
      const performance = report?.performance || {};
      const details = Array.isArray(report?.details) ? report.details : [];

      const failedItems = details.filter(
        (item: any) => item?.status === "FAILED" || item?.status === "ERROR",
      );
      const groupedFailures = new Map<string, number>();
      for (const item of failedItems) {
        const key = String(item?.stepName || item?.name || "未命名接口");
        groupedFailures.set(key, (groupedFailures.get(key) || 0) + 1);
      }

      const slowest = [...details]
        .filter((item: any) => Number(item?.responseTime) > 0)
        .sort(
          (a: any, b: any) => Number(b.responseTime) - Number(a.responseTime),
        )
        .slice(0, 3)
        .map((item: any) => ({
          name: item?.stepName || item?.name || "未命名接口",
          time: Number(item?.responseTime || 0),
        }));

      const passRate = Number(summary?.passRate || 0);
      const riskLevel =
        passRate >= 95 ? "LOW" : passRate >= 80 ? "MEDIUM" : "HIGH";

      const topFailureEntries = [...groupedFailures.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      const highlights: string[] = [];
      if (passRate >= 95) {
        highlights.push("整体回归稳定，核心链路未发现明显退化。");
      } else {
        highlights.push(
          `当前通过率 ${passRate}% ，建议优先处理失败最多的模块。`,
        );
      }

      if (topFailureEntries.length > 0) {
        const [name, count] = topFailureEntries[0];
        highlights.push(`${name} 失败 ${count} 次，是本轮最主要风险点。`);
      }

      if (slowest.length > 0) {
        highlights.push(
          `最慢接口为 ${slowest[0].name}（${slowest[0].time}ms），建议关注性能瓶颈。`,
        );
      }

      const recommendations = this.buildReportRecommendations(
        riskLevel,
        topFailureEntries,
        slowest,
      );

      const fallbackResult = {
        summary: {
          short: `本次执行 ${summary?.total || 0} 个用例，通过率 ${passRate}%，风险等级 ${riskLevel}。`,
          detailed: `共执行 ${summary?.total || 0} 个测试用例，通过 ${summary?.passed || 0} 个，失败 ${summary?.failed || 0} 个，错误 ${summary?.error || 0} 个。平均响应时间 ${performance?.avgResponseTime || 0}ms，P95 ${performance?.p95ResponseTime || 0}ms。`,
        },
        highlights,
        risk_assessment: {
          level: riskLevel,
          description:
            riskLevel === "LOW"
              ? "整体质量较稳定，可按计划发布。"
              : riskLevel === "MEDIUM"
                ? "存在需要关注的问题，建议修复后再做一次重点回归。"
                : "当前失败较多，建议先阻断发布并优先修复核心问题。",
          recommendations,
        },
        top_failures: topFailureEntries.map(([name, count]) => ({
          name,
          count,
        })),
        slowest_apis: slowest,
      };
      const llmResult = await this.callFeatureJson(
        projectId,
        "summarize_report",
        {
          report: this.serializeReportForPrompt(report),
          fallback: fallbackResult,
        },
        { minTimeout: 120000 },
      );
      const result = this.normalizeReportSummary(llmResult, fallbackResult);

      await this.logUsage(
        projectId,
        "summarize_report",
        true,
        startedAt,
        result,
        llmResult?.__usage?.total_tokens,
      );
      return result;
    } catch (error: any) {
      await this.logUsage(
        projectId,
        "summarize_report",
        false,
        startedAt,
        error?.message || "summarize report failed",
      );
      throw error;
    }
  }

  async saveReportAiSummary(reportId: string, summary: any, projectId: string) {
    const result = await this.testReportRepository.update({ id: reportId, projectId }, {
      aiSummary: JSON.stringify(summary),
    });
    if (result.affected === 0) throw new NotFoundException("报告不存在或不属于当前项目");
  }

  /**
   * AI 生成场景流程：
   * 1. 输入场景描述
   * 2. AI 根据描述查找所需接口，查看请求参数和响应定义
   * 3. 若用例不存在则创建当前场景需要的用例（基于接口文档的请求参数）
   * 4. 根据接口文档的响应定义生成断言（不请求接口）
   */
  async generateScenario(projectId: string, prompt?: string) {
    await this.ensureFeatureEnabled(projectId, "testGeneration");
    const promptStr = String(prompt || "").trim();
    if (!promptStr || promptStr.length > 4000)
      throw new BadRequestException("场景描述长度须为 1 到 4000 字符");
    const apis = await this.apiRepository.find({ where: { projectId } });
    if (!apis.length)
      throw new BadRequestException("当前项目暂无接口，请先导入接口");
    const ids = await this.resolveRequiredApisForScenario(
      projectId,
      promptStr,
      apis,
    );
    const selectedApis = ids.map((id) => apis.find((api) => api.id === id)!);
    const existing = await this.testCaseRepository.find({
      where: { projectId, apiId: In(ids) },
    });
    const candidates: any[] = [...existing];
    const generated = new Map<string, any>();
    const runtime = await this.getProjectRuntime(projectId, "testGeneration");
    const startedAt = Date.now();
    try {
      const result = await this.requestJsonCompletion(
        runtime.provider,
        runtime.config,
        {
          systemPrompt: `你是 APIForge 的测试场景编排专家，只输出 JSON，不执行接口。
根据场景描述，把多个接口编排成按业务依赖排序的多步骤流程。
每个步骤二选一：复用已有用例时提供 testCaseId（必须来自 testCases）；新建步骤时提供 apiId（必须来自 apis）、request 和 assertions。
优先复用 testCases，只有没有可用用例时才新建。
request 必须可直接执行：url 使用 {{base_url}} 前缀；路径参数使用文档中的 example 或 {{参数名}} 占位，禁止编造 1、sample 之类的假值。
非登录接口的 request.headers 必须包含 "Authorization": "Bearer {{token}}"。
assertions 优先使用 STATUS / JSON_PATH / RESPONSE_TIME，状态码取自 responses 中真实定义的 2xx。
响应变量提取使用 extractRules: [{key:"token",path:"$.data.token"}]，JSONPath 必须对应文档中的响应结构，禁止通配符。
当用户要求查看/处理“所有、全部、当前空间”的资源时：先用集合接口获取列表，并在该步用 extractRules 提取数组（如 {"key":"items","path":"$.data"}）；再用详情接口添加循环步骤 repeat: {"sourceKey":"items","itemVar":"itemId","itemPath":"id"}，详情 url 写成 {{base_url}}/xxx/{{itemId}}。循环步骤仍需提供 apiId/request；数组元素是字符串时省略 itemPath。
后续请求用 {{token}} 引用已提取变量；requestOverrides 仅允许 headers、query、body（键值对象）及 url（字符串）。
路径参数通过 url 覆盖，例如 /users/{{userId}}。不要将 $.data.token 写成 $.token。保留现有请求中的静态参数。
variables 只填写用户明确提供的初始值；其他输入保留环境变量占位符，不得编造密码或访问令牌。
request 的 body/query 中普通字段必须给具体样例值，禁止写成 {{字段名}} 占位；只有跨步骤传递的值才用 {{变量}}。
不得添加无关步骤或负向用例。
输出格式：{"name":"场景名称","description":"说明","variables":{},"steps":[{"name":"业务步骤","testCaseId":"id","apiId":"apiId","request":{"method":"GET","url":"{{base_url}}/path","query":{},"body":{},"headers":{}},"assertions":[],"extractRules":[],"repeat":null,"requestOverrides":{}}]}`,
          userPrompt: JSON.stringify({
            prompt: promptStr,
            apis: selectedApis.map((api) => this.serializeApiForPrompt(api)),
            testCases: candidates.map((test) => ({
              id: test.id,
              apiId: test.apiId,
              name: test.name,
              request: test.request,
              assertions: test.assertions,
            })),
          }),
        },
        { minTimeout: 60000 },
      );
      const draft = normalizeScenarioDraft(result, candidates, {
        allowedApiIds: new Set(selectedApis.map((api) => api.id)),
      });
      const savedIds = new Map<string, string>();
      for (const step of draft.steps as any[]) {
        if (!step.apiId || !step.request || generated.has(step.testCaseId))
          continue;
        const api = selectedApis.find((item) => item.id === step.apiId);
        if (!api) continue;
        generated.set(step.testCaseId, {
          projectId,
          apiId: api.id,
          name: step.name,
          description: "",
          priority: "P1",
          tags: ["AI场景"],
          request: {
            ...step.request,
            headers: this.ensureAuthHeaders(api, step.request.headers || {}),
            body: this.fillSameNamePlaceholders(step.request.body),
          },
          assertions:
            Array.isArray(step.assertions) && step.assertions.length > 0
              ? step.assertions
              : this.buildAssertionsFromResponseDefinition(api),
        });
      }
      // Only persist cases referenced by the validated draft, atomically.
      await this.testCaseRepository.manager.transaction(async (manager) => {
        for (const step of draft.steps) {
          if (!generated.has(step.testCaseId) || savedIds.has(step.testCaseId))
            continue;
          const saved = await manager
            .getRepository(TestCase)
            .save(generated.get(step.testCaseId));
          savedIds.set(step.testCaseId, saved.id);
        }
      });
      draft.steps = draft.steps.map((step: any) => {
        const next = { ...step };
        delete next.request;
        delete next.assertions;
        next.testCaseId = savedIds.get(step.testCaseId) || step.testCaseId;
        return next;
      });
      await this.logUsage(
        projectId,
        "generate_scenario",
        true,
        startedAt,
        draft,
        result.__usage?.total_tokens,
      );
      return {
        ...draft,
        createdTestCaseCount: savedIds.size,
        usedFallbackCount: 0,
      };
    } catch (error) {
      await this.logUsage(
        projectId,
        "generate_scenario",
        false,
        startedAt,
        error instanceof Error && error.message ? error.message : "场景编排失败",
      );
      throw error;
    }
  }

  async getUsageStats(projectId: string, limit = 50) {
    const logs = await this.usageLogRepository.find({
      where: { projectId },
      order: { createdAt: "DESC" },
      take: Math.min(limit, 100),
    });
    const successCount = logs.filter((l) => l.success).length;
    const failCount = logs.filter((l) => !l.success).length;
    const totalTokens = logs.reduce((sum, l) => sum + (l.tokensUsed ?? 0), 0);
    return {
      recent: logs.map((l) => ({
        feature: l.feature,
        success: l.success,
        tokensUsed: l.tokensUsed ?? 0,
        responseTimeMs: l.responseTimeMs,
        errorMessage: l.errorMessage,
        createdAt: l.createdAt,
      })),
      summary: {
        totalCalls: logs.length,
        successCount,
        failCount,
        totalTokens,
        note: "tokensUsed 仅在实际调用 AI 接口时记录；使用规则回退时 success=false 且 tokensUsed=0",
      },
    };
  }

  async checkHealth() {
    const providers = await this.providerRepository.find({
      order: { id: "DESC" },
    });
    const normalizedProviders = providers.map((provider) => {
      const health = this.normalizeProviderHealth(provider);
      return {
        id: provider.id,
        name: provider.name,
        available: health.available,
        error: health.error,
        mode: health.mode,
        healthUrl: provider.baseUrl,
        lastCheck: provider.lastCheck || health.lastCheck,
      };
    });

    return {
      available: normalizedProviders.some((item) => item.available),
      providers: normalizedProviders,
    };
  }

  private async callFeatureJson(
    projectId: string,
    feature: AIUsageFeature,
    payload: any,
    options?: { minTimeout?: number },
  ) {
    const configFeature = USAGE_FEATURE_TO_CONFIG[feature];
    const runtime = await this.getProjectRuntime(projectId, configFeature);
    const userPrompt = this.buildFeatureUserPrompt(feature, payload);
    const startedAt = Date.now();

    this.logger.log(
      `[AI:${feature}] start projectId=${projectId} feature=${configFeature} providerId=${runtime.provider.id} providerType=${runtime.provider.providerType} model=${runtime.provider.model} endpoint=${this.resolveChatCompletionsEndpoint(runtime.provider.baseUrl)}`,
    );

    try {
      const result = await this.requestJsonCompletion(
        runtime.provider,
        runtime.config,
        {
          systemPrompt: this.getFeatureSystemPrompt(feature),
          userPrompt,
        },
        options,
      );

      this.logger.log(
        `[AI:${feature}] success projectId=${projectId} providerId=${runtime.provider.id} model=${runtime.provider.model} durationMs=${Date.now() - startedAt} promptChars=${userPrompt.length} completionTokens=${result?.__usage?.completion_tokens ?? "n/a"} totalTokens=${result?.__usage?.total_tokens ?? "n/a"}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `[AI:${feature}] failed projectId=${projectId} providerId=${runtime.provider.id} model=${runtime.provider.model} durationMs=${Date.now() - startedAt} error=${error?.message || error}`,
      );
      throw error;
    }
  }

  /** 已启用的模型，后添加的排在前面，作为功能自动路由的默认优先级 */
  private async listRoutableProviders() {
    return this.providerRepository.find({
      where: { isActive: true },
      order: { id: "DESC" },
    });
  }

  /**
   * 辅助功能不再有独立开关：是否可用只取决于有没有已启用的模型。
   * ProjectAIConfig.aiEnabled 字段仅为兼容历史数据保留，不再参与判定。
   */
  private async requireEnabledConfig(projectId: string) {
    const config = await this.configRepository.findOne({ where: { projectId } });
    const providers = await this.listRoutableProviders();
    if (!providers.length) {
      throw new BadRequestException(
        "当前项目尚未启用辅助功能：还没有已启用的模型，请先在「模型服务配置」中新增一个模型提供商",
      );
    }
    return (config || ({ projectId, aiEnabled: true } as unknown as ProjectAIConfig));
  }

  private assertProviderReady(provider: AIProvider | null, feature?: AIFeatureKey) {
    if (!provider) {
      throw new BadRequestException(
        feature
          ? `「${AI_FEATURE_LABELS[feature]}」未开启：没有已启用的模型勾选该功能，请在「模型服务配置」中为它勾选一个模型`
          : "当前项目未绑定 AI 提供商",
      );
    }
    if (!provider.isActive) {
      throw new BadRequestException("当前 AI 提供商未启用");
    }
    if (!String(provider.model || "").trim()) {
      throw new BadRequestException("当前 AI 提供商未配置模型");
    }
    return provider;
  }

  /**
   * 解析某次调用实际使用的模型。
   * 传入 feature 时按功能路由（多模型并存），不传时沿用项目默认模型。
   */
  private async getProjectRuntime(projectId: string, feature?: AIFeatureKey) {
    const config = await this.requireEnabledConfig(projectId);

    if (feature) {
      const providers = await this.listRoutableProviders();
      const route = resolveFeatureRoute(providers, config, feature);
      const provider = this.assertProviderReady(route.provider as AIProvider | null, feature);
      return { config: this.normalizeConfig(config), provider, route };
    }

    const provider = config.providerId
      ? await this.providerRepository.findOne({ where: { id: config.providerId } })
      : null;
    if (config.providerId && !provider) {
      throw new BadRequestException("当前项目绑定的 AI 提供商不存在");
    }
    return {
      config: this.normalizeConfig(config),
      provider: this.assertProviderReady(provider, undefined),
    };
  }

  /**
   * 根据场景描述分析所需 API，返回 apiId 列表。用于在生成场景前补齐缺失的测试用例。
   */
  private async resolveRequiredApisForScenario(
    projectId: string,
    prompt: string,
    apis: Array<{ id: string; path: string; method: string; summary?: string }>,
  ): Promise<string[]> {
    if (apis.length === 0) return [];
    const runtime = await this.getProjectRuntime(projectId, "testGeneration");
    const systemPrompt = `你是 APIForge 的测试场景分析专家，只能输出 JSON。

根据用户描述和 API 列表，判断完成该场景需要调用哪些 API。输出格式：
{ "requiredApiIds": ["apiId1", "apiId2", ...] }

规则：
1. requiredApiIds 必须是 apis 中存在的 id，不能编造。
2. 按业务流程顺序排列，如登录 -> 获取信息 -> 其他操作。
3. 若描述模糊，可合理推断所需接口（如「查看备忘录」对应备忘录相关接口）。
4. 涉及某类资源的「所有 / 全部 / 当前空间」对象时，必须同时选择列表接口和对应的详情接口（先列表，再详情）。`;

    const userPrompt = JSON.stringify(
      {
        prompt,
        apis: apis.map((a) => ({
          id: a.id,
          path: a.path,
          method: a.method,
          summary: a.summary,
        })),
      },
      null,
      2,
    );

    try {
      const result = await this.requestJsonCompletion(
        runtime.provider,
        runtime.config,
        { systemPrompt, userPrompt },
        { minTimeout: 15000 },
      );
      const ids = Array.isArray(result?.requiredApiIds)
        ? result.requiredApiIds
        : [];
      const validIds = ids.filter((id) => apis.some((a) => a.id === id));
      const unique = [...new Set<string>(validIds)];
      if (!unique.length || unique.length > 30)
        throw new BadRequestException(
          "未匹配到合适接口或场景超过 30 个接口，请细化描述",
        );
      return unique;
    } catch (err) {
      this.logger.warn(
        `[resolveRequiredApisForScenario] 接口匹配失败: ${(err as Error)?.message}`,
      );
      throw new BadRequestException(
        `场景接口匹配失败：${(err as Error)?.message || "请检查模型配置"}`,
      );
    }
  }

  private async performProviderHealthCheck(provider: Partial<AIProvider>) {
    const baseUrl = String(provider?.baseUrl || "").trim();
    const apiKey = String(provider?.apiKey || "").trim();
    const model = String(provider?.model || "").trim();
    const isHttp = /^https?:\/\//i.test(baseUrl);

    const needsKey = providerNeedsApiKey(provider?.providerType);
    if (!baseUrl || (needsKey && !apiKey) || !isHttp) {
      return {
        available: false,
        mode: "live-chat-completions",
        error: needsKey ? "请检查 API 地址、Key 或启用状态" : "请检查 API 地址或启用状态",
        lastCheck: new Date(),
        healthUrl: baseUrl,
      };
    }

    if (!model) {
      return {
        available: false,
        mode: "live-chat-completions",
        error: "请先配置模型名称",
        lastCheck: new Date(),
        healthUrl: baseUrl,
      };
    }

    try {
      this.logger.log(
        `[AI:health_check] start providerId=${provider?.id ?? "n/a"} providerType=${provider?.providerType || "custom"} model=${provider?.model || "(empty)"} endpoint=${baseUrl}`,
      );
      const result = await this.requestJsonCompletion(
        provider as AIProvider,
        {
          aiEnabled: true,
          providerId: provider.id,
          projectId: "__health__",
          features: this.normalizeFeatureFlags({ semanticParse: true }),
          modelConfig: {
            temperature: 0,
            maxTokens: 128,
            timeout: 15000,
          },
        } as any,
        {
          systemPrompt:
            '你是 APIForge 的 AI 连通性探针。请只输出 JSON：{"ok":true,"provider":"..."}',
          userPrompt: JSON.stringify({
            task: "health_check",
            providerType: provider?.providerType || "custom",
          }),
        },
      );

      return {
        available: Boolean(result?.ok ?? true),
        mode: "live-chat-completions",
        error: null,
        lastCheck: new Date(),
        healthUrl: baseUrl,
      };
    } catch (error: any) {
      this.logger.error(
        `[AI:health_check] failed providerId=${provider?.id ?? "n/a"} providerType=${provider?.providerType || "custom"} model=${provider?.model || "(empty)"} endpoint=${baseUrl} error=${error?.message || error}`,
      );
      return {
        available: false,
        mode: "live-chat-completions",
        error: error?.message || "模型调用失败",
        lastCheck: new Date(),
        healthUrl: baseUrl,
      };
    }
  }

  private async requestJsonCompletion(
    provider: AIProvider,
    config: ProjectAIConfig,
    prompts: { systemPrompt: string; userPrompt: string },
    options?: { minTimeout?: number },
  ) {
    const endpoint = this.resolveChatCompletionsEndpoint(
      this.providerBaseUrl(provider),
    );
    let maxTokens = Number(config?.modelConfig?.maxTokens ?? 2048);
    if (provider.contextWindow != null) {
      // Providers use different tokenizers. UTF-8 bytes are a conservative input
      // estimate; reserve framing space without truncating structured prompts.
      const inputBudget = Buffer.byteLength(prompts.systemPrompt, "utf8") +
        Buffer.byteLength(prompts.userPrompt, "utf8") + 32;
      maxTokens = Math.min(maxTokens, provider.contextWindow - inputBudget);
      if (maxTokens < 1) {
        throw new BadRequestException(
          `输入内容按保守估算已达到配置的上下文长度（${provider.contextWindow} Token），请增大上下文长度或减少输入内容`,
        );
      }
    }
    const temperature = Number(config?.modelConfig?.temperature ?? 0.2);
    let timeout = Number(config?.modelConfig?.timeout ?? 60000);
    if (options?.minTimeout != null && timeout < options.minTimeout) {
      timeout = options.minTimeout;
    }

    if (provider.providerType === "anthropic") {
      const base = new URL(provider.baseUrl);
      if (!base.pathname.endsWith("/messages"))
        base.pathname = base.pathname.replace(/\/+$/, "") + "/messages";
      try {
        const { data } = await axios.post(
          base.toString(),
          {
            model: provider.model,
            system: prompts.systemPrompt,
            messages: [{ role: "user", content: prompts.userPrompt }],
            max_tokens: maxTokens,
            temperature,
            ...(provider.reasoningEffort ? { output_config: { effort: provider.reasoningEffort } } : {}),
          },
          {
            headers: {
              ...providerAuthHeaders(provider),
              "Content-Type": "application/json",
            },
            timeout,
          },
        );
        return {
          ...this.parseModelJson(
            (data.content || [])
              .filter((part: any) => part.type === "text")
              .map((part: any) => part.text)
              .join(""),
          ),
          __usage: {
            ...data.usage,
            total_tokens:
              (data.usage?.input_tokens || 0) +
              (data.usage?.output_tokens || 0),
          },
        };
      } catch (error) {
        throw this.toProviderError(error, base.toString());
      }
    }

    const payload = {
      model: String(provider.model || "").trim(),
      messages: [
        {
          role: "system",
          content: prompts.systemPrompt,
        },
        {
          role: "user",
          content: prompts.userPrompt,
        },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      ...(provider.reasoningEffort
        ? { reasoning_effort: provider.reasoningEffort }
        : {}),
    };

    this.logger.debug(
      `[AI:http] request providerId=${provider.id} providerType=${provider.providerType} model=${provider.model} endpoint=${endpoint} timeoutMs=${timeout} maxTokens=${maxTokens} temperature=${temperature} systemPromptChars=${prompts.systemPrompt.length} userPromptChars=${prompts.userPrompt.length}`,
    );
    try {
      const response = await axios.post(endpoint, payload, {
        headers: {
          ...providerAuthHeaders(provider),
          "Content-Type": "application/json",
        },
        timeout,
      });
      this.logger.debug(
        `[AI:http] response providerId=${provider.id} model=${provider.model} status=${response.status} totalTokens=${response.data?.usage?.total_tokens ?? "n/a"}`,
      );
      const result = this.extractJsonFromCompletionResponse(response.data);
      this.logAiResponse(result);
      return result;
    } catch (error: any) {
      const errMsg = String(
        error?.response?.data?.error?.message ??
          error?.response?.data?.message ??
          error?.message ??
          "",
      );
      const isJsonParseError =
        /Expected.*position|position\s+\d+|JSON\s*(parse|syntax)\s*error/i.test(
          errMsg,
        );
      const shouldRetryWithoutResponseFormat =
        (error?.response?.status &&
          [400, 404, 422].includes(Number(error.response.status))) ||
        isJsonParseError;
      if (!shouldRetryWithoutResponseFormat) {
        throw this.toProviderError(error, endpoint);
      }

      try {
        this.logger.warn(
          `[AI:http] retry_without_response_format providerId=${provider.id} model=${provider.model} endpoint=${endpoint} status=${error?.response?.status ?? "n/a"}`,
        );
        const retryResponse = await axios.post(
          endpoint,
          {
            ...payload,
            response_format: undefined,
          },
          {
            headers: {
              ...(provider.providerType === "azure"
                ? { "api-key": provider.apiKey }
                : { Authorization: `Bearer ${provider.apiKey}` }),
              "Content-Type": "application/json",
            },
            timeout,
          },
        );
        this.logger.debug(
          `[AI:http] retry_response providerId=${provider.id} model=${provider.model} status=${retryResponse.status} totalTokens=${retryResponse.data?.usage?.total_tokens ?? "n/a"}`,
        );
        const retryResult = this.extractJsonFromCompletionResponse(
          retryResponse.data,
        );
        this.logAiResponse(retryResult);
        return retryResult;
      } catch (retryError: any) {
        throw this.toProviderError(retryError, endpoint);
      }
    }
  }

  private logAiResponse(result: any) {
    const toLog = { ...result };
    if (typeof toLog.__rawContent === "string") {
      const raw = toLog.__rawContent
        .replace(/^\uFEFF/, "")
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const parsed = this.tryParseJsonForLog(raw);
      toLog.__rawContent = parsed ?? raw;
    }
    const maxLen = 16000;
    const str = JSON.stringify(toLog, null, 2);
    const out =
      str.length > maxLen
        ? `${str.slice(0, maxLen)}... [截断 ${str.length - maxLen} 字符]`
        : str;
    this.logger.log(`[AI:回复]\n${out}`);
  }

  private providerBaseUrl(provider: Partial<AIProvider>) {
    // Docker 容器内的 localhost 指向容器自身；本地模型服务通常跑在宿主机上
    let value = rewriteLoopbackHost(String(provider.baseUrl || "").trim());
    if (provider.providerType === "gemini") {
      try {
        const url = new URL(value);
        if (
          url.hostname === "generativelanguage.googleapis.com" &&
          /^\/v1beta\/?$/.test(url.pathname)
        ) {
          url.pathname = "/v1beta/openai";
          return url.toString();
        }
      } catch {
        /* URL validation provides the error at the request boundary. */
      }
    }
    return value;
  }

  private resolveChatCompletionsEndpoint(baseUrl: string) {
    const trimmed = String(baseUrl || "")
      .trim()
      .replace(/\/+$/, "");
    if (!trimmed) return trimmed;
    if (/\/chat\/completions(?:\?|$)/i.test(trimmed)) return trimmed;
    if (/\/v1beta\/openai$/i.test(trimmed))
      return `${trimmed}/chat/completions`;
    if (/\/v\d+$/i.test(trimmed)) return `${trimmed}/chat/completions`;
    if (
      /\/v\d+\//i.test(`${trimmed}/`) &&
      !/\/chat\/completions$/i.test(trimmed)
    ) {
      return `${trimmed}/chat/completions`;
    }
    return trimmed;
  }

  private extractJsonFromCompletionResponse(responseData: any) {
    const content = this.extractCompletionText(responseData);
    const parsed = this.parseModelJson(content);
    return {
      ...parsed,
      __usage: responseData?.usage || null,
      __rawContent: content,
    };
  }

  private extractCompletionText(responseData: any) {
    const content = responseData?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === "string") return item;
          if (item?.type === "text") return item?.text || "";
          return "";
        })
        .join("");
    }
    throw new BadRequestException("模型未返回可解析内容");
  }

  /** 尝试解析 JSON 字符串用于日志输出，失败返回 null */
  private tryParseJsonForLog(raw: string): any | null {
    const s = String(raw || "").trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      try {
        return JSON.parse(jsonrepair(s));
      } catch {
        const match = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (match?.[0]) {
          try {
            return JSON.parse(jsonrepair(match[0]));
          } catch {
            try {
              return JSON.parse(match[0]);
            } catch {
              // ignore
            }
          }
        }
      }
    }
    return null;
  }

  private parseModelJson(raw: string) {
    const cleaned = String(raw || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      try {
        const repaired = jsonrepair(cleaned);
        return JSON.parse(repaired);
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (match?.[0]) {
          try {
            return JSON.parse(jsonrepair(match[0]));
          } catch {
            // fallback: try raw match
            try {
              return JSON.parse(match[0]);
            } catch {
              // ignore
            }
          }
        }
      }
      throw new BadRequestException("模型返回的内容不是有效 JSON");
    }
  }

  private toProviderError(error: any, endpoint: string) {
    const detail =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      error?.message ||
      "模型调用失败";
    return new BadRequestException(
      `AI provider request failed: ${detail} (${endpoint})`,
    );
  }

  private getFeatureSystemPrompt(feature: AIUsageFeature) {
    const shared = [
      "你是 APIForge 的资深 API 测试 AI 助手。",
      "你必须严格基于输入内容分析，不要臆造不存在的字段、接口或环境信息。",
      "你必须只输出一个 JSON 对象，不要输出 Markdown、解释、前后缀、代码块或额外文本。",
      "如果信息不足，请给出保守结论，并在 JSON 字段中体现低置信度或空数组。",
    ].join(" ");

    const prompts: Record<AIUsageFeature, string> = {
      generate_scenario: shared,
      semantic_parse: `${shared}
      你是一个 API 语义分析引擎，只能输出 JSON，不允许输出任何解释性文本。

      【核心规则】
      1. 必须优先根据 path 和 method 推断接口用途（权重最高）
      2. summary 和 description 仅作为辅助信息（权重较低）
      3. 如果信息冲突，以 path 为准
      4. 不确定时必须给出合理推断，不允许留空

      【输出格式（必须严格符合 JSON）】
      {
        "summary": string,
        "businessContext": string,
        "categories": string[],
        "sensitiveFields": string[],
        "fieldMeanings": Record<string, string>,
        "suggestedTests": string[],
        "riskLevel": "LOW" | "MEDIUM" | "HIGH",
        "authRelated": boolean,
        "confidence": number
      }
      `,

      generate_tests: `${shared}
      你是一个 API 测试设计专家，只能输出 JSON。

      【目标】
      基于 API 定义生成高覆盖率、可执行的测试建议。

      【规则】
      1. 测试必须覆盖：正常路径、边界、异常、安全
      2. request 必须可直接执行：url 使用 {{base_url}} 前缀，query/body 为键值对象
      3. 路径参数必须替换为具体值：优先取接口文档 parameters/responses 中的 example、default 或 enum；没有示例时保留 {{参数名}} 占位，禁止编造 1、sample 之类的假值
      4. 非登录接口的 request.headers 必须包含 "Authorization": "Bearer {{token}}"，登录接口（path 含 login/signin 等）不添加
      5. 请求体必须补齐所有必填字段，字段类型与文档一致，format 为 date-time/date/email/uuid 时给合法值
      6. assertions 必须优先使用：
        - STATUS
        - JSON_PATH
        - RESPONSE_TIME
      7. 状态码断言必须来自 responses 中真实定义的 2xx 状态码，不要臆断
      8. 不允许生成模糊测试（如“测试一下异常情况”）
      9. body 与 query 中的普通字段必须给具体样例值，禁止写成 {{字段名}} 占位；只有需要跨请求传递的值（如 token、上一步创建的 id）才使用 {{变量}}

      【输出格式】
      {
        "insights": string[],
        "suggestions": [
          {
            "name": string,
            "type": string,
            "priority": "P0" | "P1" | "P2" | "P3",
            "rationale": string,
            "tags": string[],
            "request": {
              "method": string,
              "url": string,
              "query": object,
              "body": object,
              "headers": object
            },
            "assertions": [
              {
                "type": "STATUS" | "JSON_PATH" | "RESPONSE_TIME",
                "target": string,
                "condition": string,
                "expected": any
              }
            ]
          }
        ]
      }
      `,

      generate_assertions: `${shared}
      你是断言生成引擎，只能输出 JSON。

      【规则】
      1. 优先生成稳定断言（结构/状态/字段存在性）
      2. 禁止对以下内容做精确值断言：
        - token
        - 动态 ID
        - 时间戳
      3. 推荐使用 JSON_PATH + 条件判断
      4. 每条断言必须说明可靠性
      5. JSON_PATH 断言：target 放路径（如 $.code、$.data.token），expected 放预期值。exists 时 expected 为 true；eq 时必须使用响应中的实际值，禁止臆测（如 $.code 常见为 0 表示成功，不是 200）。
      6. target 路径必须以 $ 开头，禁止使用 $.body.xxx（body 已是根）
      7. token 类字段用 condition: "exists" 验证存在即可，不要用 eq 或 not_empty

      【输出格式】
      {
        "rationale": string,
        "suggestions": [
          {
            "type": "STATUS" | "JSON_PATH" | "RESPONSE_TIME",
            "target": string,
            "condition": string,
            "expected": any,
            "message": string,
            "confidence": number
          }
        ]
      }
      `,

      analyze_error: `${shared}
        你是 API 故障分析专家，只能输出 JSON。

        【规则】
        1. 必须给出明确 rootCause，不允许模糊描述
        2. suggestions 必须是可执行修复方案
        3. similar_issues 用于归类问题模式

        【输出格式】
        {
          "analysis": {
            "rootCause": string,
            "details": string,
            "confidence": number
          },
          "suggestions": string[],
          "similar_issues": string[]
        }
        `,

      summarize_report: `${shared}
        你是测试报告分析引擎，只能输出 JSON。

        【规则】
        1. summary.short 必须 ≤ 50字
        2. risk_assessment.level 必须基于失败率 + 接口重要性推断
        3. recommendations 必须可执行

        【压测报告专用规则：report.reportType 为 stress 时必须遵守】
        1. 请求数、场景完成轮次、虚拟用户数是不同口径；失败热点按 top_failures.count 的实际失败请求数分析，不能按记录条数计数或把聚合行与错误详情重复相加。
        2. 必须结合 load、execution、metrics、trend 和接口热点解释吞吐、平均、P95/P99 长尾、失败率及配置。失败率使用 metrics.failureRate，不能用四舍五入后的通过率代替。
        3. 手动停止、失败阈值、最长运行时间或目标轮次未完成，只能得出采集范围内的部分结论；正常结束也不代表性能达标。
        4. 未提供 SLA、容量目标或相同条件的历史基线，不得声称达标、可发布、容量上限、提升或退化。必须说明还缺什么数据。
        5. 没有有效样本时，不得把 0ms、零失败当作系统健康；缺失值不是零。缺少资源监控时 CPU、数据库、网络瓶颈只能作为待验证假设。
        6. 趋势可能包含爬升和收尾，不得把末尾 RPS 回落直接判定为系统瓶颈。单次报告不能证明稳定性或根因。
        7. 高风险失败或不完整执行不能被模型降为无风险；必须保留输入 limitations，建议应对应具体请求热点或下一轮验证步骤。
        8. 额外输出 stress_analysis: { "findings": string[], "limitations": string[] }，各至多 8 条；只给出解释，不要重写事实指标、计数或执行状态。

        【输出格式】
        {
          "summary": {
            "short": string,
            "detailed": string
          },
          "highlights": string[],
          "risk_assessment": {
            "level": "LOW" | "MEDIUM" | "HIGH",
            "description": string,
            "recommendations": string[]
          }
        }
        `,
    };

    return prompts[feature];
  }

  private buildFeatureUserPrompt(feature: AIUsageFeature, payload: any) {
    return JSON.stringify(
      {
        feature,
        locale: "zh-CN",
        payload,
      },
      null,
      2,
    );
  }

  private serializeApiForPrompt(api: API) {
    return {
      method: api.method,
      path: api.path,
      summary: api.summary || null,
      description: api.description || null,
      tags: api.tags || [],
      parameters: api.parameters || [],
      requestBody: api.requestBody || null,
      responses: api.responses || {},
      id: api.id,
    };
  }

  private serializeResponseForPrompt(response: any) {
    return {
      status: response?.response?.status ?? response?.status ?? null,
      responseTime: response?.responseTime ?? response?.elapsed ?? null,
      body:
        response?.responseBody ??
        response?.response?.data ??
        response?.data ??
        response?.body ??
        null,
      headers: response?.response?.headers ?? response?.headers ?? null,
    };
  }

  private serializeErrorForPrompt(error: any) {
    return {
      request: error?.request || {},
      response: error?.response || {},
      error: error?.error || null,
      assertions: Array.isArray(error?.assertions) ? error.assertions : [],
      api: error?.api || null,
    };
  }

  private serializeReportForPrompt(report: any) {
    return {
      summary: report?.summary || {},
      performance: report?.performance || {},
      details: Array.isArray(report?.details)
        ? report.details.slice(0, 50)
        : [],
      charts: report?.charts || null,
    };
  }

  private normalizeSemanticInsights(
    llmResult: any,
    fallback: SemanticInsights,
  ): SemanticInsights {
    const candidate = llmResult?.insights || llmResult || {};
    return {
      summary: String(candidate?.summary || fallback.summary),
      businessContext: String(
        candidate?.businessContext || fallback.businessContext,
      ),
      categories:
        Array.isArray(candidate?.categories) && candidate.categories.length > 0
          ? candidate.categories.map((item: any) => String(item))
          : fallback.categories,
      sensitiveFields: Array.isArray(candidate?.sensitiveFields)
        ? candidate.sensitiveFields.map((item: any) => String(item))
        : fallback.sensitiveFields,
      fieldMeanings:
        candidate?.fieldMeanings && typeof candidate.fieldMeanings === "object"
          ? Object.fromEntries(
              Object.entries(candidate.fieldMeanings).map(([key, value]) => [
                key,
                String(value),
              ]),
            )
          : fallback.fieldMeanings,
      suggestedTests: Array.isArray(candidate?.suggestedTests)
        ? candidate.suggestedTests.map((item: any) => String(item))
        : fallback.suggestedTests,
      riskLevel: ["LOW", "MEDIUM", "HIGH"].includes(candidate?.riskLevel)
        ? candidate.riskLevel
        : fallback.riskLevel,
      authRelated:
        typeof candidate?.authRelated === "boolean"
          ? candidate.authRelated
          : fallback.authRelated,
    };
  }

  private normalizeGeneratedTests(llmResult: any, fallback: any, api: API) {
    const insights = this.normalizeSemanticInsights(
      llmResult?.insights,
      fallback.insights,
    );
    const rawSuggestions = Array.isArray(llmResult?.suggestions)
      ? llmResult.suggestions
      : fallback.suggestions;

    const suggestions = rawSuggestions.map((item: any, index: number) => ({
      name: String(
        item?.name ||
          fallback.suggestions[index]?.name ||
          `${api.summary || api.path} - AI建议`,
      ),
      type: String(item?.type || fallback.suggestions[index]?.type || "custom"),
      priority: ["P0", "P1", "P2", "P3"].includes(item?.priority)
        ? item.priority
        : fallback.suggestions[index]?.priority || "P1",
      rationale: String(
        item?.rationale ||
          fallback.suggestions[index]?.rationale ||
          "AI 生成的测试建议",
      ),
      tags: Array.isArray(item?.tags)
        ? item.tags.map((tag: any) => String(tag))
        : fallback.suggestions[index]?.tags || ["AI推荐"],
      request: this.normalizeGeneratedRequest(
        item?.request,
        api,
        fallback.suggestions[index]?.request,
      ),
      assertions: Array.isArray(item?.assertions)
        ? item.assertions
        : fallback.suggestions[index]?.assertions || [
            {
              type: "STATUS",
              condition: "eq",
              expected: this.pickSuccessStatus(api),
            },
          ],
    }));

    return {
      apiId: fallback.apiId,
      insights,
      suggestions,
      __usage: llmResult?.__usage || null,
      usedFallback: !llmResult,
    };
  }

  /**
   * Accept both the current contract (url/query) and the legacy one
   * (path/params) so a model response is never silently discarded.
   */
  private normalizeGeneratedRequest(raw: any, api: API, fallbackRequest?: any) {
    if (!raw || typeof raw !== "object") return fallbackRequest;
    const rawUrl = raw.url ?? raw.path;
    const rawQuery = raw.query ?? raw.params ?? raw.queryParams;
    const rawBody = raw.body ?? raw.data;
    return {
      method: String(raw.method || api.method).toUpperCase(),
      url: this.normalizeRequestUrl(rawUrl, api),
      headers: this.ensureAuthHeaders(
        api,
        raw.headers && typeof raw.headers === "object" ? raw.headers : {},
      ),
      query:
        rawQuery && typeof rawQuery === "object" && !Array.isArray(rawQuery)
          ? rawQuery
          : {},
      body: this.fillSameNamePlaceholders(rawBody),
    };
  }

  /**
   * A model often writes {"email": "{{email}}"} where it just means "some
   * value here". Replace a placeholder that matches its own field name with a
   * real sample so the request is executable; genuine cross-step variables
   * (token, userId, ...) keep their braces.
   */
  private fillSameNamePlaceholders(value: any, depth = 0): any {
    if (value === null || value === undefined || depth > 5) return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.fillSameNamePlaceholders(item, depth + 1));
    }
    if (typeof value !== "object") return value;
    const out: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string") {
        const match = item.match(/^\{\{\s*([\w.-]+)\s*\}\}$/);
        if (match && match[1] === key) {
          out[key] = this.sampleValueForField({
            name: key,
            type: "string",
            required: false,
          } as ApiField);
          continue;
        }
      }
      out[key] = this.fillSameNamePlaceholders(item, depth + 1);
    }
    return out;
  }

  private normalizeRequestUrl(rawUrl: any, api: API) {
    const value = String(rawUrl ?? "").trim();
    if (!value) return `{{base_url}}${this.materializePath(api)}`;
    if (/^https?:\/\//i.test(value)) return value;
    const withBase = /^\{\{\s*base_?url\s*\}\}/i.test(value)
      ? value
      : `{{base_url}}${value.startsWith("/") ? value : `/${value}`}`;
    // A model may still return "/users/{id}"; expand it the same way as the
    // documented path instead of sending the braces literally.
    return this.materializePathTemplate(withBase, api);
  }

  private normalizeGeneratedAssertions(llmResult: any, fallback: any) {
    const rawSuggestions = Array.isArray(llmResult?.suggestions)
      ? llmResult.suggestions
      : fallback.suggestions;
    return {
      suggestions: rawSuggestions.map((item: any) => {
        let target = item?.target ? String(item.target) : undefined;
        let expected = item?.expected;
        if (
          String(item?.type || "") === "JSON_PATH" &&
          typeof expected === "string" &&
          expected.startsWith("$.")
        ) {
          if (!target) {
            target = expected;
            expected = item?.condition === "exists" ? true : expected;
          }
        }
        if (target?.startsWith("$.body.")) {
          target = "$" + target.slice(6);
        } else if (target === "$.body") {
          target = "$";
        }
        return {
          type: String(item?.type || "STATUS"),
          target,
          condition: String(item?.condition || "eq"),
          expected,
          message: item?.message ? String(item.message) : undefined,
          confidence:
            typeof item?.confidence === "number" ? item.confidence : undefined,
        };
      }),
      rationale: Array.isArray(llmResult?.rationale)
        ? llmResult.rationale.map((item: any) => String(item))
        : fallback.rationale,
      __usage: llmResult?.__usage || null,
    };
  }

  private normalizeErrorAnalysis(llmResult: any, fallback: any) {
    return {
      analysis: {
        rootCause: String(
          llmResult?.analysis?.rootCause || fallback.analysis.rootCause,
        ),
        details: String(
          llmResult?.analysis?.details || fallback.analysis.details,
        ),
        confidence:
          typeof llmResult?.analysis?.confidence === "number"
            ? llmResult.analysis.confidence
            : fallback.analysis.confidence,
      },
      suggestions: (() => {
        const raw = llmResult?.suggestions;
        if (!Array.isArray(raw)) return fallback.suggestions;
        return raw.map((item: any) => {
          if (typeof item === "string") {
            return {
              type: "suggestion",
              description: item,
              example: undefined,
            };
          }
          return {
            type: String(item?.type || "suggestion"),
            description: String(item?.description ?? item ?? ""),
            example: item?.example,
          };
        });
      })(),
      similar_issues: Array.isArray(llmResult?.similar_issues)
        ? llmResult.similar_issues
        : fallback.similar_issues,
      __usage: llmResult?.__usage || null,
    };
  }

  private normalizeReportSummary(llmResult: any, fallback: any) {
    return {
      summary: {
        short: String(llmResult?.summary?.short || fallback.summary.short),
        detailed: String(
          llmResult?.summary?.detailed || fallback.summary.detailed,
        ),
      },
      highlights: Array.isArray(llmResult?.highlights)
        ? llmResult.highlights.map((item: any) => String(item))
        : fallback.highlights,
      risk_assessment: {
        level: ({ LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", "低": "LOW", "中": "MEDIUM", "高": "HIGH" } as Record<string, string>)[llmResult?.risk_assessment?.level] || fallback.risk_assessment.level,
        description: String(
          llmResult?.risk_assessment?.description ||
            fallback.risk_assessment.description,
        ),
        recommendations: Array.isArray(
          llmResult?.risk_assessment?.recommendations,
        )
          ? llmResult.risk_assessment.recommendations.map((item: any) =>
              String(item),
            )
          : fallback.risk_assessment.recommendations,
      },
      top_failures: Array.isArray(llmResult?.top_failures)
        ? llmResult.top_failures
        : fallback.top_failures,
      slowest_apis: Array.isArray(llmResult?.slowest_apis)
        ? llmResult.slowest_apis
        : fallback.slowest_apis,
      __usage: llmResult?.__usage || null,
    };
  }

  /**
   * 校验功能是否可用，并与实际调用共用同一套路由规则，
   * 避免「校验通过但调用时换了模型」或提示不一致。
   */
  private async ensureFeatureEnabled(projectId: string, feature: AIFeatureKey) {
    await this.getProjectRuntime(projectId, feature);
  }

  private normalizeConfig(config: ProjectAIConfig) {
    return {
      ...config,
      features: this.normalizeFeatureFlags(config.features),
      modelConfig: config.modelConfig || {
        temperature: 0.2,
        maxTokens: 2048,
        timeout: 30000,
      },
    };
  }

  private normalizeFeatureFlags(features: any) {
    return {
      testGeneration: Boolean(features?.testGeneration),
      assertionGeneration: Boolean(features?.assertionGeneration),
      errorAnalysis: Boolean(features?.errorAnalysis),
      reportSummary: Boolean(features?.reportSummary),
      semanticParse: Boolean(features?.semanticParse),
    };
  }

  private normalizeReasoningEffort(value: any): string | null {
    return normalizeEffort(value);
  }

  private normalizeContextWindow(value: unknown): number | null {
    if (value == null || value === "") return null;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647) {
      throw new BadRequestException("上下文长度必须是 1 到 2147483647 之间的整数（Token）");
    }
    return value;
  }

  private validateProvider(provider: Partial<AIProvider>) {
    if (!String(provider?.name || "").trim()) {
      throw new BadRequestException("provider name is required");
    }
    if (!String(provider?.baseUrl || "").trim()) {
      throw new BadRequestException("provider baseUrl is required");
    }
    if (!String(provider?.apiKey || "").trim() && providerNeedsApiKey(provider.providerType)) {
      throw new BadRequestException("provider apiKey is required");
    }
    if (!String(provider?.model || "").trim()) {
      throw new BadRequestException("provider model is required");
    }
  }

  private buildProviderHealthSnapshot(provider: Partial<AIProvider>) {
    const baseUrl = String(provider?.baseUrl || "").trim();
    const apiKey = String(provider?.apiKey || "").trim();
    const isHttp = /^https?:\/\//i.test(baseUrl);
    const available = Boolean(
      baseUrl && apiKey && isHttp && provider?.isActive !== false,
    );
    return {
      available,
      mode: "config-validation",
      error: available ? null : "请检查 API 地址、Key 或启用状态",
      lastCheck: new Date(),
      healthUrl: baseUrl,
    };
  }

  private normalizeProviderHealth(provider: AIProvider) {
    return provider.healthStatus || this.buildProviderHealthSnapshot(provider);
  }

  private async requireApi(projectId: string, apiId: string) {
    const api = await this.apiRepository.findOne({
      where: { id: apiId, projectId },
    });
    if (!api) throw new NotFoundException("API not found");
    return api;
  }

  private buildSemanticInsights(api: API): SemanticInsights {
    const fields = this.extractApiFields(api);
    const pathCategories = this.inferCategoriesFromPath(api.path);
    const keywords = this.collectKeywords(api, fields);
    const keywordCategories = this.inferCategories(keywords);
    const categories =
      pathCategories.length > 0
        ? [
            ...pathCategories,
            ...keywordCategories.filter((c) => !pathCategories.includes(c)),
          ]
        : keywordCategories;
    const sensitiveFields = fields
      .filter((field) => this.isSensitiveField(field.name))
      .map((field) => field.name);

    const authRelated =
      categories.includes("认证") ||
      categories.includes("权限") ||
      fields.some((field) =>
        ["token", "authorization", "password", "secret"].includes(
          field.name.toLowerCase(),
        ),
      );

    const riskScore =
      (categories.includes("支付") ? 2 : 0) +
      (categories.includes("认证") ? 2 : 0) +
      (categories.includes("管理后台") ? 1 : 0) +
      (api.method === "DELETE" ? 2 : 0) +
      (sensitiveFields.length > 0 ? 1 : 0);

    const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
      riskScore >= 4 ? "HIGH" : riskScore >= 2 ? "MEDIUM" : "LOW";

    const fieldMeanings = Object.fromEntries(
      fields.map((field) => [field.name, this.describeField(field)]),
    );

    const suggestedTests = this.buildSuggestedTestNames(
      api,
      fields,
      authRelated,
    );
    const categoryText =
      categories.length > 0 ? categories.join(" / ") : "通用接口";
    const pathSummary = this.inferSummaryFromPath(api.method, api.path);

    return {
      summary:
        api.summary ||
        pathSummary ||
        `${api.method} ${api.path} 属于${categoryText}，建议优先覆盖主链路、参数校验和异常场景。`,
      businessContext:
        api.summary ||
        api.description ||
        pathSummary ||
        `${api.method} ${api.path} 的业务动作`,
      categories,
      sensitiveFields,
      fieldMeanings,
      suggestedTests,
      riskLevel,
      authRelated,
    };
  }

  private extractApiFields(api: API): ApiField[] {
    const fields: ApiField[] = [];
    const parameters = Array.isArray(api.parameters) ? api.parameters : [];

    for (const param of parameters) {
      fields.push({
        name: String(param?.name || "").trim(),
        in: (param?.in || "query") as ApiField["in"],
        required: Boolean(param?.required),
        type: String(
          param?.schema?.type || param?.type || "string",
        ).toLowerCase(),
        format: param?.schema?.format || param?.format,
        description: param?.description,
        enum: param?.schema?.enum || param?.enum,
        example: param?.example ?? param?.schema?.example,
      });
    }

    const requestBody = api.requestBody as any;
    if (requestBody) {
      const schema = this.extractBodySchema(requestBody);
      const properties = schema?.properties || {};
      const requiredList = Array.isArray(schema?.required)
        ? schema.required
        : [];
      for (const [name, meta] of Object.entries<any>(properties)) {
        fields.push({
          name,
          in: "body",
          required: requiredList.includes(name),
          type: String(meta?.type || "string").toLowerCase(),
          format: meta?.format,
          description: meta?.description,
          enum: meta?.enum,
          example: meta?.example,
        });
      }
    }

    return fields.filter((field) => Boolean(field.name));
  }

  private extractBodySchema(requestBody: any): any {
    if (!requestBody || typeof requestBody !== "object") return null;
    if (requestBody?.content && typeof requestBody.content === "object") {
      const preferred =
        requestBody.content["application/json"] ||
        requestBody.content["multipart/form-data"] ||
        requestBody.content["application/x-www-form-urlencoded"] ||
        Object.values(requestBody.content)[0];
      return mergeAllOf(preferred?.schema) || null;
    }
    if (requestBody?.schema) return mergeAllOf(requestBody.schema);
    if (requestBody?.body && typeof requestBody.body === "object")
      return requestBody.body;
    if (requestBody?.properties || requestBody?.allOf)
      return mergeAllOf(requestBody);
    return null;
  }

  private collectKeywords(api: API, fields: ApiField[]) {
    const source = [
      api.path,
      api.summary,
      api.description,
      ...(api.tags || []),
      ...fields.map((field) => field.name),
      ...fields.map((field) => field.description || ""),
    ]
      .join(" ")
      .toLowerCase();

    return source;
  }

  private inferCategoriesFromPath(path: string): string[] {
    const categories = new Set<string>();
    const p = String(path || "")
      .toLowerCase()
      .replace(/\{[^}]+\}/g, "");
    const segments = p.split("/").filter(Boolean);

    const pathMap: Record<string, string> = {
      auth: "认证",
      login: "认证",
      logout: "认证",
      token: "认证",
      signin: "认证",
      signup: "认证",
      register: "认证",
      user: "用户",
      users: "用户",
      profile: "用户",
      member: "用户",
      account: "用户",
      order: "订单",
      orders: "订单",
      cart: "订单",
      sku: "订单",
      inventory: "库存",
      payment: "支付",
      pay: "支付",
      refund: "支付",
      billing: "支付",
      charge: "支付",
      upload: "文件上传",
      file: "文件上传",
      image: "文件上传",
      avatar: "文件上传",
      admin: "管理后台",
      permission: "权限",
      role: "权限",
      report: "报表",
      export: "报表",
      analytics: "报表",
    };

    for (const seg of segments) {
      const cat = pathMap[seg];
      if (cat) categories.add(cat);
    }
    return [...categories];
  }

  private inferSummaryFromPath(method: string, path: string): string {
    const p = String(path || "").replace(/\{[^}]+\}/g, ":id");
    const segments = p.split("/").filter(Boolean);
    const last = segments[segments.length - 1] || "";
    const m = String(method || "GET").toUpperCase();
    const isDetail = last === ":id" || /^:?\w*id\w*$/i.test(last);
    const action =
      m === "GET" && isDetail
        ? "查询详情"
        : m === "GET"
          ? "查询列表"
          : m === "POST"
            ? "创建"
            : m === "PUT" || m === "PATCH"
              ? "更新"
              : m === "DELETE"
                ? "删除"
                : m;
    const resource = segments[segments.length - 2] || last;
    const resourceCn: Record<string, string> = {
      user: "用户",
      users: "用户",
      order: "订单",
      orders: "订单",
      auth: "认证",
      login: "登录",
      payment: "支付",
      file: "文件",
    };
    const cn = resourceCn[resource.toLowerCase()] || resource;
    return `${action}${cn}`;
  }

  private inferCategories(source: string) {
    const categories = new Set<string>();
    const match = (patterns: string[]) =>
      patterns.some((pattern) => source.includes(pattern));

    if (
      match([
        "login",
        "logout",
        "token",
        "auth",
        "signin",
        "signup",
        "password",
        "认证",
        "登录",
      ])
    ) {
      categories.add("认证");
    }
    if (match(["user", "profile", "member", "account", "用户"])) {
      categories.add("用户");
    }
    if (match(["order", "cart", "sku", "inventory", "订单", "库存"])) {
      categories.add("订单");
    }
    if (
      match(["payment", "pay", "refund", "billing", "charge", "支付", "退款"])
    ) {
      categories.add("支付");
    }
    if (match(["upload", "file", "image", "avatar", "附件", "文件"])) {
      categories.add("文件上传");
    }
    if (match(["admin", "permission", "role", "权限", "角色"])) {
      categories.add("权限");
      categories.add("管理后台");
    }
    if (match(["report", "export", "analytics", "统计", "报表"])) {
      categories.add("报表");
    }
    if (categories.size === 0) {
      categories.add("通用");
    }

    return [...categories];
  }

  private isSensitiveField(name: string) {
    const key = String(name || "").toLowerCase();
    return [
      "password",
      "passwd",
      "token",
      "secret",
      "authorization",
      "phone",
      "mobile",
      "email",
      "idcard",
      "id_no",
      "amount",
      "price",
    ].some((item) => key.includes(item));
  }

  private describeField(field: ApiField) {
    const lower = field.name.toLowerCase();
    if (lower.includes("email")) return "邮箱字段，建议验证格式与唯一性。";
    if (lower.includes("phone") || lower.includes("mobile")) {
      return "手机号字段，建议验证格式、长度与脱敏处理。";
    }
    if (lower.includes("password")) {
      return "密码字段，属于敏感信息，建议仅在安全通道中传输。";
    }
    if (lower.includes("token")) {
      return "认证凭证字段，建议作为环境变量管理并在日志中脱敏。";
    }
    if (lower.includes("amount") || lower.includes("price")) {
      return "金额字段，建议重点覆盖精度、边界值和幂等性。";
    }
    if (field.description) return String(field.description);
    return `${field.in} 参数，类型为 ${field.type}${field.required ? "，必填" : ""}。`;
  }

  private buildSuggestedTestNames(
    api: API,
    fields: ApiField[],
    authRelated: boolean,
  ) {
    const tests = new Set<string>();
    tests.add("正常业务路径");
    if (fields.some((field) => field.required)) tests.add("必填字段缺失");
    if (fields.some((field) => field.type === "string"))
      tests.add("字符串边界值");
    if (
      fields.some(
        (field) => field.type === "number" || field.type === "integer",
      )
    ) {
      tests.add("数值边界值");
    }
    if (authRelated) tests.add("未授权访问");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(api.method)) {
      tests.add("重复提交 / 幂等性");
    }
    if (fields.some((field) => field.type === "string")) {
      tests.add("SQL 注入 / 特殊字符");
    }
    return [...tests];
  }

  private materializePath(api: API) {
    return this.materializePathTemplate(String(api.path || "/"), api);
  }

  /** Expand single-brace path params while leaving {{variables}} untouched. */
  private materializePathTemplate(template: string, api: API) {
    const parameters = Array.isArray(api.parameters) ? api.parameters : [];
    return String(template || "/").replace(
      /\{\{([^{}]+)\}\}|\{([^{}]+)\}/g,
      (match, _doubleKey, singleKey) => {
        if (singleKey === undefined) return match;
        const name = String(singleKey || "").trim();
        const param: any = parameters.find(
          (item: any) => String(item?.name || "").trim() === name,
        );
        const sample =
          param?.example ??
          param?.schema?.example ??
          param?.default ??
          param?.schema?.default;
        if (sample !== undefined && sample !== null && String(sample) !== "") {
          return String(sample);
        }
        const enumValues = param?.schema?.enum || param?.enum;
        if (Array.isArray(enumValues) && enumValues.length > 0) {
          return String(enumValues[0]);
        }
        // Keep a placeholder so execution reports a missing variable instead of
        // requesting a made-up resource id that always 404s.
        return `{{${name}}}`;
      },
    );
  }

  private buildBodyTemplate(api: API, fields: ApiField[]) {
    const schema = this.extractBodySchema(api.requestBody);
    if (schema) {
      const built = this.buildValueFromSchema(schema, "", 0);
      if (built && typeof built === "object" && !Array.isArray(built)) {
        return built;
      }
    }
    const bodyFields = fields.filter((field) => field.in === "body");
    return Object.fromEntries(
      bodyFields.map((field) => [field.name, this.sampleValueForField(field)]),
    );
  }

  /** Build a request body value from a JSON schema, including nested objects and arrays. */
  private buildValueFromSchema(schema: any, fieldName = "", depth = 0): any {
    if (!schema || typeof schema !== "object" || depth > 5) return null;
    const merged = mergeAllOf(schema) || schema;
    if (merged.example !== undefined && merged.example !== null)
      return merged.example;
    if (merged.default !== undefined && merged.default !== null)
      return merged.default;
    if (Array.isArray(merged.enum) && merged.enum.length > 0)
      return merged.enum[0];

    const type = String(merged.type || "").toLowerCase();
    if (type === "object") {
      const properties = merged.properties || {};
      const required = Array.isArray(merged.required) ? merged.required : [];
      const out: Record<string, any> = {};
      for (const [key, prop] of Object.entries<any>(properties)) {
        const value = this.buildValueFromSchema(prop, key, depth + 1);
        if (required.includes(key) || (value !== null && value !== undefined)) {
          out[key] = value;
        }
      }
      return out;
    }
    if (type === "array") {
      const item = merged.items
        ? this.buildValueFromSchema(merged.items, fieldName, depth + 1)
        : null;
      return item === null || item === undefined ? [] : [item];
    }
    if (type === "boolean") return true;
    if (type === "integer" || type === "number") {
      return this.sampleValueForField({
        name: fieldName,
        type,
        required: false,
      } as ApiField);
    }
    if (type === "string") {
      const formatted = this.sampleStringForFormat(merged.format, fieldName);
      return formatted ?? this.sampleValueForField({
        name: fieldName,
        type: "string",
        required: false,
      } as ApiField);
    }
    return this.sampleValueForField({
      name: fieldName,
      type: type || "string",
      required: false,
    } as ApiField);
  }

  /** Valid sample values for common JSON-schema string formats. */
  private sampleStringForFormat(
    format: any,
    name = "",
  ): string | null {
    switch (String(format || "").toLowerCase()) {
      case "date-time":
        return "2024-01-01T00:00:00Z";
      case "date":
        return "2024-01-01";
      case "time":
        return "00:00:00";
      case "email":
        return "tester@example.com";
      case "uuid":
        return "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      case "uri":
      case "url":
        return "https://example.com";
      case "hostname":
        return "example.com";
      case "ipv4":
        return "127.0.0.1";
      case "byte":
        return "c2FtcGxl";
      case "password":
        return "Passw0rd!";
      default:
        return null;
    }
  }

  private buildQueryTemplate(fields: ApiField[]) {
    const queryFields = fields.filter((field) => field.in === "query");
    return Object.fromEntries(
      queryFields
        .filter((field) => field.required)
        .map((field) => [field.name, this.sampleValueForField(field)]),
    );
  }

  private sampleValueForField(field: ApiField): any {
    if (field.example !== undefined && field.example !== null)
      return field.example;
    if (Array.isArray(field.enum) && field.enum.length > 0)
      return field.enum[0];
    if (field.format) {
      const formatted = this.sampleStringForFormat(field.format, field.name);
      if (formatted !== null) return formatted;
    }
    const name = String(field.name || "").toLowerCase();
    if (name.includes("email")) return "tester@example.com";
    if (name.includes("phone") || name.includes("mobile")) return "13800138000";
    if (name.includes("password")) return "Passw0rd!";
    if (name.includes("token")) return "{{token}}";
    if (name.includes("amount") || name.includes("price")) return 100;
    if (name.includes("name")) return "测试用户";
    if (field.type === "integer" || field.type === "number") return 1;
    if (field.type === "boolean") return true;
    if (field.type === "array") return [];
    if (field.type === "object") return {};
    return "sample";
  }

  private pickSuccessStatus(api: API) {
    const responseKeys = Object.keys(api.responses || {});
    const success = responseKeys.find((key) => /^20\d$/.test(key));
    // 200 is the most common success code; 201 is only assumed when the
    // document actually declares it.
    return success ? Number(success) : 200;
  }

  /** 根据接口文档的响应定义生成断言 */
  private buildAssertionsFromResponseDefinition(api: API): Array<{
    type: "STATUS" | "JSON_PATH";
    condition: "eq" | "exists";
    expected?: any;
    target?: string;
  }> {
    const assertions: Array<{
      type: "STATUS" | "JSON_PATH";
      condition: "eq" | "exists";
      expected?: any;
      target?: string;
    }> = [];
    const successStatus = this.pickSuccessStatus(api);
    assertions.push({
      type: "STATUS",
      condition: "eq" as const,
      expected: successStatus,
    });

    const responses = api.responses || {};
    const successResp = responses[String(successStatus)];
    const content = successResp?.content;
    const jsonContent =
      content?.["application/json"] ?? content?.["*/*"] ?? content?.["json"];
    const schema = jsonContent?.schema;
    if (!schema || typeof schema !== "object") return assertions;

    const collectPaths = (
      obj: any,
      prefix: string,
      depth: number,
    ): string[] => {
      if (depth > 3) return [];
      const paths: string[] = [];
      const props = obj?.properties;
      if (!props || typeof props !== "object") return paths;
      for (const [key, sub] of Object.entries(props)) {
        const path = prefix ? `${prefix}.${key}` : `$.${key}`;
        paths.push(path);
        if (sub && typeof sub === "object" && (sub as any).properties) {
          paths.push(...collectPaths(sub as any, path, depth + 1));
        }
      }
      return paths;
    };

    const rootPaths = collectPaths(schema, "$", 0);
    const keyPaths = ["$.code", "$.data", "$.message", "$.msg"].filter((p) =>
      rootPaths.some((r) => r === p || r.startsWith(p + ".")),
    );
    const extraPaths = rootPaths.filter(
      (p) => !keyPaths.includes(p) && p !== "$",
    );
    const allPaths = [...new Set([...keyPaths, ...extraPaths])].slice(0, 6);
    for (const path of allPaths) {
      assertions.push({
        type: "JSON_PATH",
        target: path,
        condition: "exists" as const,
        expected: true,
      });
    }
    return assertions;
  }

  private pickClientErrorStatus(api: API) {
    const responseKeys = Object.keys(api.responses || {});
    const matched = responseKeys.find((key) =>
      ["400", "409", "422"].includes(key),
    );
    return matched ? Number(matched) : 400;
  }

  private pickUnauthorizedStatus(api: API) {
    const responseKeys = Object.keys(api.responses || {});
    const matched = responseKeys.find((key) => ["401", "403"].includes(key));
    return matched ? Number(matched) : 401;
  }

  private buildMutatedRequest(
    request: any,
    field: ApiField,
    opts: { remove?: boolean; value?: any },
  ) {
    const cloned = JSON.parse(JSON.stringify(request || {}));
    if (field.in === "query") {
      cloned.query = cloned.query || {};
      if (opts.remove) delete cloned.query[field.name];
      else cloned.query[field.name] = opts.value;
    } else if (field.in === "header") {
      cloned.headers = cloned.headers || {};
      if (opts.remove) delete cloned.headers[field.name];
      else cloned.headers[field.name] = opts.value;
    } else if (field.in === "body") {
      cloned.body = cloned.body || {};
      if (opts.remove) delete cloned.body[field.name];
      else cloned.body[field.name] = opts.value;
    }
    return cloned;
  }

  /** 根据实际响应更新用例断言，供保存 AI 建议后调用；statusOnly 时仅更新状态码断言（用于 AI 场景） */
  async enrichTestCaseWithAiAssertions(
    projectId: string,
    testCaseId: string,
    options?: { statusOnly?: boolean },
  ): Promise<void> {
    try {
      const env = await this.environmentRepository.findOne({
        where: { projectId },
        order: { createdAt: "ASC" },
      });
      if (!env) return;

      const execResult = await this.testService.executeTestCase(
        testCaseId,
        env.id,
      );
      const status = Number(execResult?.response?.status ?? 0);
      const statusAssertion = [
        { type: "STATUS" as const, condition: "eq" as const, expected: status },
      ];
      if (options?.statusOnly) {
        await this.testCaseRepository.update(testCaseId, {
          assertions: statusAssertion,
        } as any);
        return;
      }
      if (status < 200 || status >= 300) {
        // Do not persist a failure status as the expected value: that would turn
        // a broken request into a passing test and hide missing variables or
        // wrong paths from the user.
        this.logger.warn(
          `[enrichTestCaseWithAiAssertions] 跳过断言校准 testCaseId=${testCaseId} status=${status}`,
        );
        return;
      }

      const assertResult = await this.generateAssertions(projectId, execResult);
      const suggestions = Array.isArray(assertResult?.suggestions)
        ? assertResult.suggestions
        : [];
      if (suggestions.length === 0) return;

      const body = execResult?.responseBody ?? execResult?.response?.data;
      const assertions = suggestions
        .filter((s: any) => s.type && s.condition != null)
        .map((s: any) => {
          let target = s.target;
          let expected = s.expected;
          let condition = String(s.condition || "eq").toLowerCase();
          if (condition === "not_empty") condition = "exists";
          if (s.type === "JSON_PATH" && body) {
            const path =
              target ||
              (typeof expected === "string" && expected.startsWith("$.")
                ? expected
                : null);
            if (path) {
              if (!target) target = path;
              const actualVal = this.extractJsonPath(body, path);
              if (condition === "exists") {
                expected = true;
              } else if (
                condition === "eq" &&
                actualVal !== undefined &&
                actualVal !== null
              ) {
                expected = actualVal;
              } else if (
                typeof expected === "string" &&
                expected.startsWith("$.") &&
                actualVal !== undefined &&
                actualVal !== null
              ) {
                expected = actualVal;
              }
            }
          }
          return {
            type: s.type as
              | "STATUS"
              | "JSON_PATH"
              | "RESPONSE_TIME"
              | "HEADER"
              | "BODY",
            target,
            condition: condition as
              | "eq"
              | "neq"
              | "gt"
              | "lt"
              | "contains"
              | "exists"
              | "matches",
            expected,
            message: s.message,
          };
        });
      if (assertions.length > 0) {
        await this.testCaseRepository.update(testCaseId, { assertions } as any);
      }
    } catch (err) {
      this.logger.warn(
        `[enrichTestCaseWithAiAssertions] testCaseId=${testCaseId} 跳过: ${(err as Error)?.message}`,
      );
    }
  }

  /** 对外接口：根据实际响应更新用例断言 */
  async enrichAssertions(data: {
    projectId: string;
    testCaseId?: string;
    testCaseIds?: string[];
  }): Promise<{ enriched: number }> {
    const ids: string[] = [];
    if (data.testCaseId) ids.push(data.testCaseId);
    if (Array.isArray(data.testCaseIds)) ids.push(...data.testCaseIds);
    const unique = [...new Set(ids)];
    for (const id of unique) {
      await this.enrichTestCaseWithAiAssertions(data.projectId, id);
    }
    return { enriched: unique.length };
  }

  private ensureAuthHeaders(
    api: API,
    headers: Record<string, string>,
  ): Record<string, string> {
    const out = { ...headers };
    if (!this.isLoginEndpoint(api) && !out["Authorization"]) {
      out["Authorization"] = "Bearer {{token}}";
    }
    return out;
  }

  private isLoginEndpoint(api: API): boolean {
    const path = String(api.path || "")
      .toLowerCase()
      .replace(/\{[^}]+\}/g, "");
    const summary = String(api.summary || "").toLowerCase();
    const desc = String(api.description || "").toLowerCase();
    const loginPatterns = [
      "/login",
      "/signin",
      "/signup",
      "/register",
      "/auth/login",
      "/auth/signin",
      "/user/login",
      "登录",
      "登入",
      "sign in",
      "sign up",
    ];
    const combined = `${path} ${summary} ${desc}`;
    return loginPatterns.some((p) => combined.includes(p));
  }

  private makeScenarioName(api: API, suffix: string) {
    const base = api.summary || `${api.method} ${api.path}`;
    return `${base} - ${suffix}`;
  }

  private suggestResponseTimeThreshold(actual: number) {
    if (actual <= 200) return 500;
    if (actual <= 500) return 1000;
    if (actual <= 1000) return 1500;
    return Math.ceil((actual * 1.5) / 100) * 100;
  }

  private detectRequestContractMismatch(request: any, api: API | null) {
    if (!api) return null;
    const fields = this.extractApiFields(api).filter((field) => field.required);
    if (fields.length === 0) return null;

    const body =
      request?.body && typeof request.body === "object" ? request.body : {};
    const query =
      request?.query && typeof request.query === "object" ? request.query : {};
    const candidates = { ...query, ...body };
    const candidateKeys = Object.keys(candidates);

    for (const field of fields) {
      if (field.in === "path" || field.in === "header") continue;
      if (Object.prototype.hasOwnProperty.call(candidates, field.name))
        continue;
      const similar = candidateKeys.find(
        (key) => this.normalizeKey(key) === this.normalizeKey(field.name),
      );
      if (similar) {
        return {
          rootCause: "请求参数与接口定义不匹配",
          details: `接口要求字段 ${field.name}，但当前请求发送的是 ${similar}。`,
          confidence: 0.95,
          fix: `将请求中的 ${similar} 更正为 ${field.name}`,
          example: {
            ...body,
            [field.name]: body[similar],
          },
        };
      }
      if (field.required) {
        return {
          rootCause: "请求缺少必填字段",
          details: `当前请求未传入必填字段 ${field.name}。`,
          confidence: 0.9,
          fix: `补充请求字段 ${field.name}`,
          example: {
            ...body,
            [field.name]: this.sampleValueForField(field),
          },
        };
      }
    }

    return null;
  }

  private normalizeKey(input: string) {
    return String(input || "")
      .replace(/[_\-\s]/g, "")
      .toLowerCase();
  }

  private buildSimilarIssues(status: number, failedAssertions: number) {
    const issues = [];
    if (status >= 500) {
      issues.push({
        test_case: "服务端异常类问题",
        solution: "优先查看后端错误日志与依赖服务状态",
      });
    }
    if (status === 400 || status === 422) {
      issues.push({
        test_case: "参数校验失败",
        solution: "重新核对字段名、必填项和类型",
      });
    }
    if (failedAssertions > 0) {
      issues.push({
        test_case: "断言与响应不一致",
        solution: "根据最新响应更新断言或重新生成断言建议",
      });
    }
    return issues;
  }

  private buildReportRecommendations(
    riskLevel: "LOW" | "MEDIUM" | "HIGH",
    topFailures: Array<[string, number]>,
    slowest: Array<{ name: string; time: number }>,
  ) {
    const list: string[] = [];
    if (topFailures.length > 0) {
      list.push(`优先修复失败最多的模块：${topFailures[0][0]}。`);
    }
    if (slowest.length > 0) {
      list.push(`重点关注慢接口 ${slowest[0].name} 的性能瓶颈。`);
    }
    if (riskLevel === "HIGH") {
      list.push("建议修复后重新执行核心冒烟与回归测试，再评估是否发布。");
    } else if (riskLevel === "MEDIUM") {
      list.push("建议补跑高风险模块的定向回归，确认修复效果。");
    } else {
      list.push("可将本次高价值用例沉淀为后续稳定回归基线。");
    }
    return list;
  }

  private extractJsonPath(obj: any, path: string): any {
    if (!path || obj === undefined || obj === null) return undefined;
    let current = obj;
    const tokens = String(path)
      .replace(/^\$\.?/, "")
      .split(".")
      .filter(Boolean);

    for (const token of tokens) {
      if (current === undefined || current === null) return undefined;
      const arrayMatch = /^([a-zA-Z0-9_-]+)\[(\d+)\]$/.exec(token);
      if (arrayMatch) {
        current = current[arrayMatch[1]];
        if (!Array.isArray(current)) return undefined;
        current = current[Number(arrayMatch[2])];
      } else {
        current = current[token];
      }
    }
    return current;
  }

  private mergeUniqueStrings(source: string[], next: string[]) {
    return [...new Set([...(source || []), ...(next || [])].filter(Boolean))];
  }

  private async logUsage(
    projectId: string,
    feature: AIUsageFeature,
    success: boolean,
    startedAt: number,
    payload: any,
    tokensUsedOverride?: number | null,
  ) {
    const responseTimeMs = Math.max(Date.now() - startedAt, 0);
    const tokensUsed =
      typeof tokensUsedOverride === "number" &&
      Number.isFinite(tokensUsedOverride)
        ? tokensUsedOverride
        : this.estimateTokens(payload);
    await this.usageLogRepository.save({
      projectId,
      feature,
      success,
      responseTimeMs,
      tokensUsed,
      errorMessage: success ? null : String(payload || ""),
    });
  }

  private estimateTokens(payload: any) {
    const text =
      typeof payload === "string" ? payload : JSON.stringify(payload || {});
    return Math.max(Math.ceil(String(text).length / 4), 1);
  }
}
