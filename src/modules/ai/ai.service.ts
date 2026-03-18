import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import axios from "axios";
import { jsonrepair } from "jsonrepair";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AIProvider } from "./ai-provider.entity";
import { ProjectAIConfig } from "./project-ai-config.entity";
import { TestReport } from "../test/test-report.entity";
import { AIUsageLog } from "./ai-usage-log.entity";
import { API } from "../api/api.entity";
import { TestCase } from "../test/test-case.entity";
import { Environment } from "../environment/environment.entity";
import { TestService } from "../test/test.service";

type AIUsageFeature =
  | "semantic_parse"
  | "generate_tests"
  | "generate_assertions"
  | "analyze_error"
  | "summarize_report";

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
      healthStatus: this.normalizeProviderHealth(provider),
    }));
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
      healthStatus: this.buildProviderHealthSnapshot(provider as AIProvider),
      lastCheck: new Date(),
    });
    this.validateProvider(entity);
    return this.providerRepository.save(entity);
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
      apiKey:
        provider?.apiKey !== undefined
          ? String(provider.apiKey || "").trim()
          : existing.apiKey,
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
    });

    this.validateProvider(merged);
    merged.healthStatus = this.buildProviderHealthSnapshot(merged);
    merged.lastCheck = new Date();
    return this.providerRepository.save(merged);
  }

  async deleteProvider(id: number) {
    const linked = await this.configRepository.findOne({
      where: { providerId: id },
    });
    if (linked) {
      await this.configRepository.save({
        ...linked,
        providerId: null as any,
      });
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
    const result: any[] = [];
    for (const config of configs) {
      const normalized = this.normalizeConfig(config);
      if (config.providerId) {
        const provider = await this.providerRepository.findOne({
          where: { id: config.providerId },
        });
        if (provider?.features) {
          normalized.features = this.normalizeFeatureFlags(provider.features);
        }
      }
      result.push(normalized);
    }
    return result;
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
      aiEnabled: Boolean(config?.aiEnabled),
      providerId:
        config?.providerId !== undefined && config.providerId !== null
          ? Number(config.providerId)
          : null,
      features:
        config?.features !== undefined
          ? this.normalizeFeatureFlags(config.features)
          : this.normalizeFeatureFlags(existing?.features),
      modelConfig: {
        temperature: Number(config?.modelConfig?.temperature ?? 0.2),
        maxTokens: Number(config?.modelConfig?.maxTokens ?? 2048),
        timeout: Number(config?.modelConfig?.timeout ?? 60000),
      },
    } as Partial<ProjectAIConfig>;

    const saved = await this.configRepository.save(payload);
    return this.normalizeConfig(saved);
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
    const path = this.materializePath(api.path);
    const bodyTemplate = this.buildBodyTemplate(fields);
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

  async summarizeReport(projectId: string, report: any) {
    await this.ensureFeatureEnabled(projectId, "reportSummary");
    const startedAt = Date.now();

    try {
      const summary = report?.summary || {};
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

  async saveReportAiSummary(reportId: string, summary: any) {
    await this.testReportRepository.update(reportId, {
      aiSummary: JSON.stringify(summary),
    });
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
    if (!promptStr) {
      throw new BadRequestException("场景描述不能为空");
    }

    const apis = await this.apiRepository.find({
      where: { projectId },
      select: ["id", "path", "method", "summary"],
    });
    if (apis.length === 0) {
      throw new BadRequestException(
        "当前项目暂无接口，请先导入接口后再使用 AI 生成场景",
      );
    }

    let testCases = await this.testCaseRepository.find({
      where: { projectId },
      select: ["id", "name", "apiId"],
    });

    // 根据描述分析所需 API，对缺失用例的接口先生成并保存测试用例
    const requiredApiIds = await this.resolveRequiredApisForScenario(
      projectId,
      promptStr,
      apis,
    );
    const coveredApiIds = new Set(
      testCases.map((tc) => tc.apiId).filter(Boolean),
    );
    const missingApiIds = requiredApiIds.filter((id) => !coveredApiIds.has(id));

    let usedFallbackCount = 0;
    for (const apiId of missingApiIds) {
      try {
        const api = await this.requireApi(projectId, apiId);
        const genResult = await this.generateTestsRuleBased(projectId, apiId);
        if (genResult?.usedFallback) usedFallbackCount++;
        const suggestions = Array.isArray(genResult?.suggestions)
          ? genResult.suggestions
          : [];
        const happyPath = suggestions.find(
          (s: any) =>
            s.type === "happy_path" || String(s.name || "").includes("正常"),
        );
        const toSave = happyPath ? [happyPath] : suggestions.slice(0, 1);
        for (const item of toSave) {
          const req = item.request || {
            method: "GET",
            url: "",
            headers: {},
            query: {},
          };
          const headers = this.ensureAuthHeaders(
            api,
            req.headers && typeof req.headers === "object" ? req.headers : {},
          );
          const assertions = this.buildAssertionsFromResponseDefinition(api);
          await this.testCaseRepository.save({
            projectId,
            apiId,
            name: item.name,
            description: item.rationale,
            priority: (item.priority as "P0" | "P1" | "P2" | "P3") || "P1",
            tags: Array.isArray(item.tags) ? item.tags : ["AI推荐"],
            request: { ...req, headers },
            assertions,
          });
        }
      } catch (err) {
        this.logger.warn(
          `[generateScenario] 为接口 ${apiId} 生成测试用例失败，跳过: ${(err as Error)?.message}`,
        );
      }
    }

    testCases = await this.testCaseRepository.find({
      where: { projectId },
      select: ["id", "name", "apiId"],
    });
    if (testCases.length === 0) {
      throw new BadRequestException(
        "无法为场景所需接口生成测试用例，请检查 AI 配置或手动创建用例后再试",
      );
    }

    const runtime = await this.getProjectRuntime(projectId);
    const userPrompt = JSON.stringify(
      {
        testCases: testCases.map((tc) => ({
          id: tc.id,
          name: tc.name,
          apiId: tc.apiId,
        })),
        apis: apis.map((a) => ({
          id: a.id,
          path: a.path,
          method: a.method,
          summary: a.summary,
        })),
        prompt: promptStr,
      },
      null,
      2,
    );

    const systemPrompt = `你是 APIForge 的测试场景编排专家，只能输出 JSON。

【规则】
1. 基于提供的 testCases 列表，选择并组合成有业务逻辑的步骤。
2. steps 中每个 step 的 testCaseId 必须是 testCases 中某条记录的 id。
3. 若步骤 A 的响应需要被步骤 B 使用（如 token），在 extractRules 中配置 JSONPath 提取。
4. 变量名用 {{varName}} 格式，后续步骤可引用。
5. 步骤顺序需符合业务流程。

【输出格式】
{
  "name": string,
  "description": string,
  "variables": { "key": "value" },
  "steps": [
    {
      "name": string,
      "testCaseId": string,
      "extractRules": [{ "key": "varName", "path": "$.data.token" }],
      "requestOverrides": {} 
    }
  ]
}`;

    const result = await this.requestJsonCompletion(
      runtime.provider,
      runtime.config,
      { systemPrompt, userPrompt },
      { minTimeout: 60000 },
    );

    const tcNameMap = new Map(testCases.map((tc) => [tc.id, tc.name]));
    const scenarioResult = {
      name: result.name || "AI 生成场景",
      description: result.description || "",
      variables: result.variables || {},
      usedFallbackCount,
      steps: Array.isArray(result.steps)
        ? result.steps.map((s: any) => {
            const testCaseId = String(s.testCaseId || "");
            const actualName = tcNameMap.get(testCaseId);
            return {
              name: actualName ?? String(s.name || ""),
              testCaseId,
              extractRules: Array.isArray(s.extractRules)
                ? s.extractRules.map((r: any) => ({
                    key: String(r.key || ""),
                    path: String(r.path || ""),
                  }))
                : [],
              requestOverrides: s.requestOverrides ?? {},
            };
          })
        : [],
    };
    return scenarioResult;
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
    const runtime = await this.getProjectRuntime(projectId);
    const userPrompt = this.buildFeatureUserPrompt(feature, payload);
    const startedAt = Date.now();

    this.logger.log(
      `[AI:${feature}] start projectId=${projectId} providerId=${runtime.provider.id} providerType=${runtime.provider.providerType} model=${runtime.provider.model} endpoint=${this.resolveChatCompletionsEndpoint(runtime.provider.baseUrl)}`,
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

  private async getProjectRuntime(projectId: string) {
    const config = await this.configRepository.findOne({
      where: { projectId },
    });
    if (!config || !config.aiEnabled) {
      throw new BadRequestException("当前项目尚未启用辅助功能");
    }
    if (!config.providerId) {
      throw new BadRequestException("当前项目未绑定 AI 提供商");
    }

    const provider = await this.providerRepository.findOne({
      where: { id: config.providerId },
    });
    if (!provider) {
      throw new BadRequestException("当前项目绑定的 AI 提供商不存在");
    }
    if (!provider.isActive) {
      throw new BadRequestException("当前 AI 提供商未启用");
    }
    if (!String(provider.model || "").trim()) {
      throw new BadRequestException("当前 AI 提供商未配置模型");
    }

    return {
      config: this.normalizeConfig(config),
      provider,
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
    const runtime = await this.getProjectRuntime(projectId);
    const systemPrompt = `你是 APIForge 的测试场景分析专家，只能输出 JSON。

根据用户描述和 API 列表，判断完成该场景需要调用哪些 API。输出格式：
{ "requiredApiIds": ["apiId1", "apiId2", ...] }

规则：
1. requiredApiIds 必须是 apis 中存在的 id，不能编造。
2. 按业务流程顺序排列，如登录 -> 获取信息 -> 其他操作。
3. 若描述模糊，可合理推断所需接口（如「查看备忘录」对应备忘录相关接口）。`;

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
      return validIds.length > 0 ? validIds : apis.map((a) => a.id);
    } catch (err) {
      this.logger.warn(
        `[resolveRequiredApisForScenario] LLM 分析失败，使用全部接口: ${(err as Error)?.message}`,
      );
      return apis.map((a) => a.id);
    }
  }

  private async performProviderHealthCheck(provider: Partial<AIProvider>) {
    const baseUrl = String(provider?.baseUrl || "").trim();
    const apiKey = String(provider?.apiKey || "").trim();
    const model = String(provider?.model || "").trim();
    const isHttp = /^https?:\/\//i.test(baseUrl);

    if (!baseUrl || !apiKey || !isHttp) {
      return {
        available: false,
        mode: "live-chat-completions",
        error: "请检查 API 地址、Key 或启用状态",
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
    const endpoint = this.resolveChatCompletionsEndpoint(provider.baseUrl);
    const maxTokens = Number(config?.modelConfig?.maxTokens ?? 2048);
    const temperature = Number(config?.modelConfig?.temperature ?? 0.2);
    let timeout = Number(config?.modelConfig?.timeout ?? 60000);
    if (options?.minTimeout != null && timeout < options.minTimeout) {
      timeout = options.minTimeout;
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
    };

    this.logger.debug(
      `[AI:http] request providerId=${provider.id} providerType=${provider.providerType} model=${provider.model} endpoint=${endpoint} timeoutMs=${timeout} maxTokens=${maxTokens} temperature=${temperature} systemPromptChars=${prompts.systemPrompt.length} userPromptChars=${prompts.userPrompt.length}`,
    );
    try {
      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
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
              Authorization: `Bearer ${provider.apiKey}`,
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

  private resolveChatCompletionsEndpoint(baseUrl: string) {
    const trimmed = String(baseUrl || "")
      .trim()
      .replace(/\/+$/, "");
    if (!trimmed) return trimmed;
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
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
      2. request 必须是可执行结构（method/path/params/body/headers）
      3. 非登录接口的 request.headers 必须包含 "Authorization": "Bearer {{token}}"，登录接口（path 含 login/signin 等）不添加
      4. assertions 必须优先使用：
        - STATUS
        - JSON_PATH
        - RESPONSE_TIME
      5. 不允许生成模糊测试（如“测试一下异常情况”）

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
              "path": string,
              "params": object,
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
      request:
        item?.request && typeof item.request === "object"
          ? {
              method: String(item.request.method || api.method).toUpperCase(),
              url: String(
                item.request.url ||
                  `{{base_url}}${this.materializePath(api.path)}`,
              ),
              headers: this.ensureAuthHeaders(
                api,
                item.request.headers && typeof item.request.headers === "object"
                  ? item.request.headers
                  : {},
              ),
              query:
                item.request.query && typeof item.request.query === "object"
                  ? item.request.query
                  : {},
              body: item.request.body,
            }
          : fallback.suggestions[index]?.request,
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
        level: ["低", "中", "高"].includes(llmResult?.risk_assessment?.level)
          ? llmResult.risk_assessment.level
          : fallback.risk_assessment.level,
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

  private async ensureFeatureEnabled(
    projectId: string,
    feature:
      | "semanticParse"
      | "testGeneration"
      | "assertionGeneration"
      | "errorAnalysis"
      | "reportSummary",
  ) {
    const config = await this.configRepository.findOne({
      where: { projectId },
    });
    if (!config || !config.aiEnabled) {
      throw new BadRequestException("当前项目尚未启用辅助功能");
    }
    if (!config.providerId) {
      throw new BadRequestException("当前项目未绑定 AI 提供商");
    }
    const configFeatures = this.normalizeFeatureFlags(config.features);
    let featureEnabled = configFeatures[feature];
    if (!featureEnabled) {
      const provider = await this.providerRepository.findOne({
        where: { id: config.providerId },
      });
      if (provider?.features) {
        const providerFeatures = this.normalizeFeatureFlags(provider.features);
        featureEnabled = providerFeatures[feature];
      }
    }
    if (!featureEnabled) {
      throw new BadRequestException(`当前项目未开启 ${feature} 功能`);
    }
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

  private validateProvider(provider: Partial<AIProvider>) {
    if (!String(provider?.name || "").trim()) {
      throw new BadRequestException("provider name is required");
    }
    if (!String(provider?.baseUrl || "").trim()) {
      throw new BadRequestException("provider baseUrl is required");
    }
    if (!String(provider?.apiKey || "").trim()) {
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
      return preferred?.schema || null;
    }
    if (requestBody?.schema) return requestBody.schema;
    if (requestBody?.body && typeof requestBody.body === "object")
      return requestBody.body;
    if (requestBody?.properties) return requestBody;
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

  private materializePath(path: string) {
    return String(path || "/").replace(/\{([^}]+)\}/g, (_match, key) => {
      const lower = String(key || "").toLowerCase();
      if (lower.includes("id")) return "1";
      if (lower.includes("uuid")) return "00000000-0000-0000-0000-000000000001";
      return "sample";
    });
  }

  private buildBodyTemplate(fields: ApiField[]) {
    const bodyFields = fields.filter((field) => field.in === "body");
    return Object.fromEntries(
      bodyFields.map((field) => [field.name, this.sampleValueForField(field)]),
    );
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
    if (field.example !== undefined) return field.example;
    if (Array.isArray(field.enum) && field.enum.length > 0)
      return field.enum[0];
    const name = field.name.toLowerCase();
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
    return success ? Number(success) : api.method === "POST" ? 201 : 200;
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
      if (status < 200 || status >= 300 || options?.statusOnly) {
        await this.testCaseRepository.update(testCaseId, {
          assertions: statusAssertion,
        } as any);
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
