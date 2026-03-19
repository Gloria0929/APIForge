import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { TestCase } from "./test-case.entity";
import { TestReport } from "./test-report.entity";
import { TestScenario } from "./test-scenario.entity";
import { Environment } from "../environment/environment.entity";
import { Project } from "../project/project.entity";
import { API } from "../api/api.entity";
import axios from "axios";

@Injectable()
export class TestService {
  constructor(
    @InjectRepository(TestCase)
    private testCaseRepository: Repository<TestCase>,
    @InjectRepository(TestReport)
    private testReportRepository: Repository<TestReport>,
    @InjectRepository(TestScenario)
    private testScenarioRepository: Repository<TestScenario>,
    @InjectRepository(Environment)
    private environmentRepository: Repository<Environment>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(API)
    private apiRepository: Repository<API>,
  ) {}

  private formatReportDate(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }

  private async getProjectName(projectId: string): Promise<string> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });
    return project?.name || "未知项目";
  }

  findAll(projectId: string) {
    if (projectId) {
      return this.testCaseRepository.find({ where: { projectId } });
    }
    return this.testCaseRepository.find();
  }

  findOne(id: string) {
    return this.testCaseRepository.findOne({ where: { id } });
  }

  create(testCase: Partial<TestCase>) {
    return this.testCaseRepository.save(testCase);
  }

  update(id: string, testCase: Partial<TestCase>) {
    return this.testCaseRepository.update(id, testCase);
  }

  remove(id: string) {
    return this.testCaseRepository.delete(id);
  }

  async removeBatch(projectId: string, ids: string[]) {
    const validIds = ids.filter((id) => id && typeof id === "string");
    if (validIds.length === 0) return { deleted: 0 };
    const result = await this.testCaseRepository.delete({
      id: In(validIds),
      projectId,
    });
    return { deleted: result.affected ?? 0 };
  }

  async executeTestCase(
    testCaseId: string,
    environmentId: string,
    extraVariables?: Record<string, any>,
    requestOverride?: any,
  ) {
    const testCase = await this.testCaseRepository.findOne({
      where: { id: testCaseId },
    });
    if (!testCase) {
      throw new Error("TestCase not found");
    }

    const run = await this.debugRequest(
      this.mergeRequestOverride(testCase.request, requestOverride),
      environmentId,
      extraVariables,
    );
    const responseTime = run.responseTime;
    const response = run.response;
    const requestError = run.error || null;

    // 执行断言
    const assertions = this.executeAssertions(
      response,
      responseTime,
      testCase.assertions,
    );

    const result = {
      testCaseId: testCase.id,
      name: testCase.name,
      status: assertions.every((a) => a.passed) ? "PASSED" : "FAILED",
      responseTime,
      error: requestError,
      request: run.request,
      // Convenience: the actual API business payload (what users usually care about).
      responseBody: response?.data,
      response: {
        status: response?.status,
        data: response?.data,
        headers: response?.headers,
      },
      assertions,
      failedAssertions: assertions.filter((a) => !a.passed),
      executedAt: new Date(),
    };

    // 持久化最近一次执行结果，刷新后仍可查看
    await this.testCaseRepository.update(testCaseId, {
      lastRun: result as any,
    });

    return result;
  }

  /**
   * Execute an ad-hoc request against an environment, with variable replacement and baseUrl join.
   * Used by API "debug" workflows and also as a shared primitive for test execution.
   */
  async debugRequest(
    request: any,
    environmentId: string,
    extraVariables?: Record<string, any>,
  ) {
    const environment = await this.environmentRepository.findOne({
      where: { id: environmentId },
    });
    if (!environment) {
      throw new Error("Environment not found");
    }

    const resolvedRequest = this.replaceVariables(
      request,
      environment,
      extraVariables,
    );

    const startTime = Date.now();
    let response: any;
    let requestError: { message: string; code?: string } | null = null;
    try {
      const built = this.buildAxiosDataAndHeaders(resolvedRequest);
      response = await axios({
        method: resolvedRequest.method,
        url: resolvedRequest.url,
        headers: built.headers,
        params: resolvedRequest.query,
        data: built.data,
        timeout: 30000,
        validateStatus: () => true,
      });
    } catch (error: any) {
      response = error?.response;
      requestError = {
        message: String(error?.message || "Request failed"),
        code: error?.code,
      };
    }

    const responseTime = Date.now() - startTime;
    return {
      request: resolvedRequest,
      responseTime,
      responseBody: response?.data,
      response: this.summarizeAxiosResponse(response),
      error: requestError,
      executedAt: new Date(),
    };
  }

  private summarizeAxiosResponse(response: any) {
    if (!response) return null;
    return {
      status: response?.status,
      statusText: response?.statusText,
      headers: response?.headers,
      data: response?.data,
      body: response?.data,
    };
  }

  async executeTestSuite(
    testCaseIds: string[],
    environmentId: string,
    projectId: string,
    reportName: string,
    concurrency?: number,
  ) {
    const ids = Array.isArray(testCaseIds) ? testCaseIds : [];
    const results: any[] = new Array(ids.length);
    const responseTimes: number[] = [];

    const rawLimit = Number(concurrency);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 1;
    const workerCount = Math.min(Math.max(limit, 1), ids.length || 1, 50);

    let cursor = 0;
    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= ids.length) return;
        const testCaseId = ids[idx];
        try {
          const result = await this.executeTestCase(testCaseId, environmentId);
          results[idx] = result;
          if (result?.responseTime) {
            responseTimes.push(result.responseTime);
          }
        } catch (error: any) {
          results[idx] = {
            testCaseId,
            status: "ERROR",
            error: error?.message || String(error),
          };
        }
      }
    };

    await Promise.all(new Array(workerCount).fill(0).map(() => worker()));

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === "PASSED").length,
      failed: results.filter((r) => r.status === "FAILED").length,
      error: results.filter((r) => r.status === "ERROR").length,
      passRate:
        results.length > 0
          ? Math.round(
              (results.filter((r) => r.status === "PASSED").length /
                results.length) *
                100,
            )
          : 0,
      duration: responseTimes.reduce((sum, time) => sum + time, 0),
      startTime: new Date(),
      endTime: new Date(),
    };

    // 计算性能指标
    const performance = {
      avgResponseTime:
        responseTimes.length > 0
          ? Math.round(
              responseTimes.reduce((sum, time) => sum + time, 0) /
                responseTimes.length,
            )
          : 0,
      minResponseTime:
        responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTime:
        responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      p95ResponseTime:
        responseTimes.length > 0
          ? this.calculatePercentile(responseTimes, 95)
          : 0,
      p99ResponseTime:
        responseTimes.length > 0
          ? this.calculatePercentile(responseTimes, 99)
          : 0,
      throughput:
        results.length > 0
          ? Math.round((results.length * 1000) / summary.duration)
          : 0,
    };

    // 生成图表数据
    const charts = {
      timeline: results.map((result, index) => ({
        name: result.name || `Test ${index + 1}`,
        time: result.responseTime || 0,
        status: result.status,
      })),
      distribution: this.generateResponseTimeDistribution(responseTimes),
      trend: [], // 可以从历史报告中获取趋势数据
    };

    // 创建测试报告
    const report = await this.testReportRepository.save({
      projectId,
      name:
        reportName ||
        `${await this.getProjectName(projectId)} - ${this.formatReportDate()}`,
      environment: await this.getEnvironmentName(environmentId),
      summary: JSON.stringify(summary),
      details: JSON.stringify(results),
      performance: JSON.stringify(performance),
      charts: JSON.stringify(charts),
    });

    return {
      reportId: report.id,
      results,
      summary,
      performance,
      charts,
    };
  }

  async exportTestCases(projectId: string) {
    const pid = String(projectId || "").trim();
    if (!pid) throw new BadRequestException("projectId is required");
    const list = await this.testCaseRepository.find({
      where: { projectId: pid },
    });
    const data = {
      projectId: pid,
      exportedAt: new Date().toISOString(),
      testCases: list,
    };
    return JSON.stringify(data, null, 2);
  }

  async importTestCases(projectId: string, payload: any) {
    const pid = String(projectId || "").trim();
    if (!pid) throw new BadRequestException("projectId is required");

    const project = await this.projectRepository.findOne({
      where: { id: pid },
    });
    if (!project) throw new BadRequestException("Project not found");

    let list: any[] | null = null;

    if (Array.isArray(payload?.testCases)) {
      list = payload.testCases;
    } else if (Array.isArray(payload)) {
      list = payload;
    } else if (payload?.spec) {
      const spec = payload.spec;
      if (Array.isArray(spec)) {
        list = spec;
      } else if (Array.isArray(spec?.testCases)) {
        list = spec.testCases;
      } else if (spec?.item && Array.isArray(spec.item)) {
        list = this.extractTestCasesFromPostman(spec);
      }
    } else if (payload?.format === "postman" && payload?.content) {
      const parsed = this.safeParseJson<any>(payload.content, null as any);
      if (parsed?.item && Array.isArray(parsed.item)) {
        list = this.extractTestCasesFromPostman(parsed);
      }
    } else if (payload?.format === "csv" && payload?.content) {
      list = this.parseTestCasesFromCsv(String(payload.content || ""));
    } else if (payload?.format === "json" && payload?.content) {
      const parsed = this.safeParseJson<any>(payload.content, null as any);
      if (Array.isArray(parsed)) list = parsed;
      else if (Array.isArray(parsed?.testCases)) list = parsed.testCases;
    }

    if (!list || !Array.isArray(list) || list.length === 0) {
      throw new BadRequestException("No testCases to import");
    }

    const normalized = list
      .map((raw) => this.normalizeImportedTestCase(raw, pid))
      .filter(Boolean) as Partial<TestCase>[];

    if (normalized.length === 0) {
      throw new BadRequestException("No valid testCases to import");
    }

    const apiIdsToCheck = [
      ...new Set(
        normalized
          .map((tc) => tc.apiId)
          .filter((id): id is string => Boolean(id?.trim())),
      ),
    ];
    const validApiIds = new Set<string>();
    if (apiIdsToCheck.length > 0) {
      const apis = await this.apiRepository.find({
        where: { id: In(apiIdsToCheck), projectId: pid },
        select: ["id"],
      });
      apis.forEach((a) => validApiIds.add(a.id));
    }
    for (const tc of normalized) {
      if (tc.apiId && !validApiIds.has(tc.apiId)) {
        tc.apiId = null as any;
      }
    }

    return this.testCaseRepository.save(normalized);
  }

  async cloneTestCase(id: string) {
    const existing = await this.testCaseRepository.findOne({ where: { id } });
    if (!existing) throw new BadRequestException("TestCase not found");

    const cloned = await this.testCaseRepository.save({
      projectId: existing.projectId,
      apiId: existing.apiId || null,
      name: `${existing.name} (复制)`,
      description: existing.description || null,
      priority: (existing.priority as any) || "P1",
      request: existing.request,
      assertions: Array.isArray(existing.assertions) ? existing.assertions : [],
      setup: (existing as any).setup ?? null,
      teardown: (existing as any).teardown ?? null,
      tags: (existing as any).tags ?? null,
    } as any);

    return cloned;
  }

  private normalizeImportedTestCase(
    raw: any,
    projectId: string,
  ): Partial<TestCase> | null {
    const name = String(raw?.name || "").trim();
    if (!name) return null;

    const request =
      raw?.request && typeof raw.request === "object" ? raw.request : raw;
    const method = String(
      request?.method || raw?.method || "GET",
    ).toUpperCase();
    const url = String(request?.url || raw?.url || "").trim();
    if (!url) return null;

    const allowed = [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "HEAD",
      "OPTIONS",
    ];
    const normalizedMethod = allowed.includes(method) ? method : "GET";

    const priority = String(raw?.priority || "P1").toUpperCase();
    const pAllowed = ["P0", "P1", "P2", "P3"];
    const normalizedPriority = (
      pAllowed.includes(priority) ? priority : "P1"
    ) as any;

    const tags = Array.isArray(raw?.tags)
      ? raw.tags.map((t: any) => String(t)).filter(Boolean)
      : typeof raw?.tags === "string"
        ? raw.tags
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : null;

    const req: any = {
      method: normalizedMethod,
      url,
      headers:
        request?.headers && typeof request.headers === "object"
          ? request.headers
          : {},
      query:
        request?.query && typeof request.query === "object"
          ? request.query
          : {},
    };
    if (request?.bodyType) req.bodyType = request.bodyType;
    if (request?.bodyForm) req.bodyForm = request.bodyForm;
    if (request?.body !== undefined) req.body = request.body;
    if (request?.auth) req.auth = request.auth;

    const assertions = Array.isArray(raw?.assertions)
      ? raw.assertions
      : Array.isArray(request?.assertions)
        ? request.assertions
        : [{ type: "STATUS", condition: "eq", expected: 200 }];

    return {
      projectId,
      apiId: raw?.apiId || request?.apiId,
      name,
      description: raw?.description || null,
      priority: normalizedPriority,
      request: req,
      assertions,
      tags: tags && tags.length > 0 ? (tags as any) : null,
    };
  }

  private parseTestCasesFromCsv(content: string): any[] {
    const text = String(content || "");
    const rows = this.parseCsv(text);
    if (rows.length === 0) return [];

    const header = rows[0].map((h) => String(h || "").trim());
    const indexOf = (key: string) =>
      header.findIndex((h) => h.toLowerCase() === key.toLowerCase());

    const col = {
      name: indexOf("name"),
      method: indexOf("method"),
      url: indexOf("url"),
      headers: indexOf("headers"),
      query: indexOf("query"),
      body: indexOf("body"),
      bodyType: indexOf("bodyType"),
      bodyForm: indexOf("bodyForm"),
      assertions: indexOf("assertions"),
      priority: indexOf("priority"),
      apiId: indexOf("apiId"),
      description: indexOf("description"),
      tags: indexOf("tags"),
    };

    const toJson = (input: string, fallback: any) => {
      const s = String(input || "").trim();
      if (!s) return fallback;
      try {
        return JSON.parse(s);
      } catch {
        return fallback;
      }
    };

    const out: any[] = [];
    for (const r of rows.slice(1)) {
      const get = (idx: number) => (idx >= 0 ? String(r[idx] ?? "") : "");
      const tc: any = {
        name: get(col.name).trim(),
        apiId: get(col.apiId).trim() || undefined,
        description: get(col.description).trim() || undefined,
        priority: get(col.priority).trim() || undefined,
        tags: get(col.tags).trim() || undefined,
        request: {
          method: get(col.method).trim() || "GET",
          url: get(col.url).trim(),
          headers: toJson(get(col.headers), {}),
          query: toJson(get(col.query), {}),
          body: toJson(get(col.body), undefined),
          bodyType: get(col.bodyType).trim() || undefined,
          bodyForm: toJson(get(col.bodyForm), undefined),
        },
        assertions: toJson(get(col.assertions), undefined),
      };
      out.push(tc);
    }
    return out;
  }

  private extractTestCasesFromPostman(spec: any): any[] {
    const out: any[] = [];

    const walkItems = (items: any[], tags: string[] = []) => {
      for (const item of items) {
        if (item?.item && Array.isArray(item.item)) {
          walkItems(item.item, [...tags, item.name].filter(Boolean));
          continue;
        }

        const req = item?.request;
        const method = String(req?.method || "GET").toUpperCase();
        const rawUrl =
          (typeof req?.url === "string" ? req.url : req?.url?.raw) || "";
        const url = String(rawUrl || "").trim();
        if (!url) continue;

        const headers: Record<string, string> = {};
        if (Array.isArray(req?.header)) {
          for (const h of req.header) {
            const k = String(h?.key || "").trim();
            if (!k) continue;
            headers[k] = String(h?.value ?? "");
          }
        }

        const query: Record<string, any> = {};
        if (Array.isArray(req?.url?.query)) {
          for (const q of req.url.query) {
            const k = String(q?.key || "").trim();
            if (!k) continue;
            query[k] = q?.value ?? "";
          }
        }

        let bodyType: any = "json";
        let body: any = undefined;
        let bodyForm: any = undefined;
        const b = req?.body;
        const mode = String(b?.mode || "").toLowerCase();
        if (mode === "raw") {
          const raw = String(b?.raw ?? "").trim();
          if (raw) {
            const parsed = this.safeParseJson<any>(raw, null as any);
            body = parsed ?? raw;
          }
        } else if (mode === "urlencoded") {
          bodyType = "urlencoded";
          if (Array.isArray(b?.urlencoded)) {
            bodyForm = b.urlencoded
              .map((p: any) => ({
                key: String(p?.key || "").trim(),
                value: String(p?.value ?? ""),
              }))
              .filter((p: any) => p.key);
          }
        } else if (mode === "formdata") {
          bodyType = "form-data";
          if (Array.isArray(b?.formdata)) {
            bodyForm = b.formdata
              .filter((p: any) => (p?.type || "text") === "text")
              .map((p: any) => ({
                key: String(p?.key || "").trim(),
                value: String(p?.value ?? ""),
              }))
              .filter((p: any) => p.key);
          }
        }

        out.push({
          name: item?.name || url,
          priority: "P1",
          tags,
          request: {
            method,
            url,
            headers,
            query,
            bodyType,
            body,
            bodyForm,
          },
          assertions: [{ type: "STATUS", condition: "eq", expected: 200 }],
        });
      }
    };

    walkItems(spec.item || [], []);
    return out;
  }

  private parseCsv(content: string): string[][] {
    const input = String(content || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const lines = input.split("\n").filter((l) => l.trim().length > 0);
    return lines.map((line) => this.parseCsvLine(line));
  }

  private parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = line[i + 1];
          if (next === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === ",") {
          out.push(cur);
          cur = "";
        } else if (ch === '"') {
          inQuotes = true;
        } else {
          cur += ch;
        }
      }
    }
    out.push(cur);
    return out;
  }

  // 获取环境名称
  private async getEnvironmentName(environmentId: string): Promise<string> {
    const environment = await this.environmentRepository.findOne({
      where: { id: environmentId },
    });
    return environment?.name || environmentId;
  }

  /**
   * 压力测试：在指定时长内以指定并发数持续请求同一接口，收集性能指标
   */
  async executeStressTest(
    request: any,
    environmentId: string,
    projectId: string,
    options: {
      apiName?: string;
      virtualUsers?: number;
      durationSeconds?: number;
    },
  ) {
    const virtualUsers = Math.min(
      Math.max(Number(options.virtualUsers) || 10, 1),
      100,
    );
    const durationSeconds = Math.min(
      Math.max(Number(options.durationSeconds) || 30, 5),
      300,
    );
    const apiName = options.apiName || "压力测试";

    const results: any[] = [];
    const responseTimes: number[] = [];
    const startTime = Date.now();
    const endTime = startTime + durationSeconds * 1000;

    const worker = async () => {
      while (Date.now() < endTime) {
        try {
          const run = await this.debugRequest(request, environmentId);
          const rt = run.responseTime ?? 0;
          responseTimes.push(rt);
          const status = run.error
            ? "ERROR"
            : run.response?.status >= 400
              ? "FAILED"
              : "PASSED";
          results.push({
            status,
            responseTime: rt,
            error: run.error?.message,
            executedAt: new Date(),
          });
        } catch (error: any) {
          results.push({
            status: "ERROR",
            responseTime: 0,
            error: error?.message || String(error),
            executedAt: new Date(),
          });
        }
      }
    };

    await Promise.all(new Array(virtualUsers).fill(0).map(() => worker()));

    const actualDuration = Date.now() - startTime;
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === "PASSED").length,
      failed: results.filter((r) => r.status === "FAILED").length,
      error: results.filter((r) => r.status === "ERROR").length,
      passRate:
        results.length > 0
          ? Math.round(
              (results.filter((r) => r.status === "PASSED").length /
                results.length) *
                100,
            )
          : 0,
      duration: actualDuration,
      startTime: new Date(startTime),
      endTime: new Date(),
      virtualUsers,
      durationSeconds,
    };

    const performance = {
      avgResponseTime:
        responseTimes.length > 0
          ? Math.round(
              responseTimes.reduce((sum, t) => sum + t, 0) /
                responseTimes.length,
            )
          : 0,
      minResponseTime:
        responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTime:
        responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      p95ResponseTime:
        responseTimes.length > 0
          ? this.calculatePercentile(responseTimes, 95)
          : 0,
      p99ResponseTime:
        responseTimes.length > 0
          ? this.calculatePercentile(responseTimes, 99)
          : 0,
      throughput:
        results.length > 0
          ? Math.round((results.length * 1000) / actualDuration)
          : 0,
    };

    const charts = {
      timeline: results.slice(0, 100).map((r, i) => ({
        name: `#${i + 1}`,
        time: r.responseTime || 0,
        status: r.status,
      })),
      distribution: this.generateResponseTimeDistribution(responseTimes),
      trend: [],
    };

    const report = await this.testReportRepository.save({
      projectId,
      name: `${apiName} - 压力测试 - ${this.formatReportDate()}`,
      environment: await this.getEnvironmentName(environmentId),
      summary: JSON.stringify({ ...summary, stressTest: true }),
      details: JSON.stringify(results),
      performance: JSON.stringify(performance),
      charts: JSON.stringify(charts),
    });

    return {
      reportId: report.id,
      results,
      summary,
      performance,
      charts,
    };
  }

  // 计算百分位数
  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  // 生成响应时间分布
  private generateResponseTimeDistribution(responseTimes: number[]): any[] {
    const buckets = [
      { range: "0-100ms", count: 0 },
      { range: "100-200ms", count: 0 },
      { range: "200-500ms", count: 0 },
      { range: "500-1000ms", count: 0 },
      { range: "1000ms+", count: 0 },
    ];

    responseTimes.forEach((time) => {
      if (time < 100) buckets[0].count++;
      else if (time < 200) buckets[1].count++;
      else if (time < 500) buckets[2].count++;
      else if (time < 1000) buckets[3].count++;
      else buckets[4].count++;
    });

    return buckets;
  }

  // 获取测试报告列表
  async getReports(projectId: string) {
    return this.testReportRepository.find({
      where: { projectId },
      order: { createdAt: "DESC" },
    });
  }

  // 获取测试报告详情
  async getReport(id: string) {
    const report = await this.testReportRepository.findOne({ where: { id } });
    if (report) {
      return {
        ...report,
        summary: JSON.parse(report.summary),
        details: JSON.parse(report.details),
        performance: JSON.parse(report.performance),
        charts: report.charts ? JSON.parse(report.charts) : null,
        aiSummary: report.aiSummary ? JSON.parse(report.aiSummary) : null,
      };
    }
    return null;
  }

  async deleteReport(id: string) {
    const report = await this.testReportRepository.findOne({ where: { id } });
    if (!report) {
      throw new Error("Report not found");
    }
    await this.testReportRepository.remove(report);
    return { success: true };
  }

  async deleteReportsBatch(ids: string[]) {
    const validIds = ids.filter((id) => id && typeof id === "string");
    if (validIds.length === 0) return { deleted: 0 };
    const result = await this.testReportRepository.delete({ id: In(validIds) });
    return { deleted: result.affected ?? 0 };
  }

  // 导出测试报告
  async exportReport(id: string, format: "json" | "html") {
    const report = await this.getReport(id);
    if (!report) {
      throw new Error("Report not found");
    }

    switch (format) {
      case "json":
        return JSON.stringify(report, null, 2);
      case "html":
        return this.generateHtmlReport(report);
      default:
        throw new Error("Unsupported format");
    }
  }

  // 生成 HTML 报告（美化版）
  private generateHtmlReport(report: any): string {
    const summary = report.summary || {};
    const details = report.details || [];
    const performance = report.performance || {};
    const charts = report.charts || {};
    const aiSummary = report.aiSummary || null;
    const dist = charts.distribution || [];
    const total = summary.total || 1;
    const created = report.createdAt
      ? new Date(report.createdAt).toLocaleString("zh-CN")
      : "";

    const detailRows = details
      .map((test: any) => {
        const status = (test.status || "UNKNOWN").toLowerCase();
        const assertions = (test.assertions || [])
          .map(
            (a: any) =>
              `<tr><td>${a.type || "-"}</td><td>${a.target || "-"}</td><td>${a.condition || "-"}</td><td>${a.expected ?? "-"}</td><td>${a.actual ?? "-"}</td><td class="col-result status-${a.passed ? "pass" : "fail"}">${a.passed ? "通过" : "失败"}</td></tr>`,
          )
          .join("");
        return `
          <div class="detail-card detail-${status}">
            <div class="detail-header">
              <span class="detail-name">${this.escapeHtml(test.name || "-")}</span>
              <span class="detail-status status-${status}">${test.status || "-"}</span>
            </div>
            <div class="detail-meta">
              <span>响应时间: ${test.responseTime ?? "-"}ms</span>
              ${test.response?.status ? `<span>状态码: ${test.response.status}</span>` : ""}
            </div>
            ${test.error ? `<div class="detail-error">${this.escapeHtml(String(test.error))}</div>` : ""}
            ${assertions ? `<div class="assert-table-wrapper"><table class="assert-table"><colgroup><col class="col-type"/><col class="col-target"/><col class="col-condition"/><col class="col-expected"/><col class="col-actual"/><col class="col-result"/></colgroup><thead><tr><th>类型</th><th>目标</th><th>条件</th><th>预期</th><th>实际</th><th class="col-result">结果</th></tr></thead><tbody>${assertions}</tbody></table></div>` : ""}
          </div>`;
      })
      .join("");

    const distBars = dist
      .map(
        (b: any) =>
          `<div class="dist-row"><span class="dist-label">${b.range || "-"}</span><div class="dist-bar"><div class="dist-fill" style="width:${((b.count || 0) / total) * 100}%"></div></div><span class="dist-count">${b.count || 0}</span></div>`,
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${this.escapeHtml(report.name || "测试报告")}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; background: #0f1117; color: #e2e8f0; line-height: 1.6; }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.75rem; font-weight: 600; color: #f8fafc; margin: 0 0 8px 0; }
    .meta { font-size: 0.875rem; color: #94a3b8; margin-bottom: 24px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stat { background: #1e293b; border-radius: 10px; padding: 16px; text-align: center; border: 1px solid rgba(255,255,255,0.06); }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #f8fafc; }
    .stat-label { font-size: 0.75rem; color: #94a3b8; margin-top: 4px; }
    .stat.success .stat-value { color: #22c55e; }
    .stat.error .stat-value { color: #ef4444; }
    .stat.warning .stat-value { color: #eab308; }
    .stat.primary .stat-value { color: #6366f1; }
    .section { margin-bottom: 28px; }
    .section-title { font-size: 1rem; font-weight: 600; color: #f1f5f9; margin-bottom: 12px; }
    .perf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .perf-item { background: #1e293b; border-radius: 8px; padding: 12px; border: 1px solid rgba(255,255,255,0.06); }
    .perf-label { font-size: 0.75rem; color: #94a3b8; }
    .perf-value { font-size: 1.125rem; font-weight: 600; color: #e2e8f0; }
    .dist-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; font-size: 0.875rem; }
    .dist-label { width: 100px; color: #94a3b8; }
    .dist-bar { flex: 1; height: 8px; background: #1e293b; border-radius: 4px; overflow: hidden; }
    .dist-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #818cf8); border-radius: 4px; transition: width 0.3s; }
    .dist-count { width: 40px; text-align: right; color: #94a3b8; }
    .detail-card { background: #1e293b; border-radius: 10px; padding: 16px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.06); }
    .detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .detail-name { font-weight: 600; color: #f1f5f9; }
    .detail-status { font-size: 0.75rem; padding: 2px 8px; border-radius: 6px; font-weight: 500; }
    .detail-passed, .status-pass { background: rgba(34,197,94,0.2); color: #22c55e; }
    .detail-failed, .detail-error, .status-fail { background: rgba(239,68,68,0.2); color: #ef4444; }
    .detail-error { font-size: 0.875rem; margin-top: 8px; padding: 8px; background: rgba(239,68,68,0.1); border-radius: 6px; }
    .detail-meta { font-size: 0.8rem; color: #94a3b8; }
    .assert-table-wrapper { overflow-x: auto; margin-top: 12px; -webkit-overflow-scrolling: touch; }
    .assert-table { width: 100%; min-width: 720px; font-size: 0.8rem; border-collapse: collapse; table-layout: auto; }
    .assert-table th, .assert-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.06); white-space: nowrap; }
    .assert-table th { color: #94a3b8; font-weight: 500; }
    .assert-table .col-type { width: 100px; }
    .assert-table .col-target { width: 140px; }
    .assert-table .col-condition { width: 80px; }
    .assert-table .col-expected { width: 140px; }
    .assert-table .col-actual { width: 140px; }
    .assert-table .col-result { width: 80px; }
    .assert-table th.col-result, .assert-table td.col-result { position: sticky; right: 0; z-index: 1; box-shadow: -4px 0 8px rgba(0,0,0,0.2); }
    .detail-card .assert-table th.col-result, .detail-card .assert-table td.col-result { background: #1e293b; }
    .detail-passed .assert-table th.col-result, .detail-passed .assert-table td.col-result { background: rgba(34,197,94,0.2); }
    .detail-failed .assert-table th.col-result, .detail-failed .assert-table td.col-result,
    .detail-error .assert-table th.col-result, .detail-error .assert-table td.col-result { background: rgba(239,68,68,0.2); }
    .ai-summary-card { background: #1e293b; border-radius: 10px; padding: 16px; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.06); }
    .ai-summary-card h3 { font-size: 0.9rem; font-weight: 600; color: #f1f5f9; margin: 12px 0 8px 0; }
    .ai-summary-card h3:first-child { margin-top: 0; }
    .ai-summary-card p, .ai-summary-card li { font-size: 0.875rem; color: #cbd5e1; margin: 4px 0; }
    .ai-summary-card ul { margin: 0; padding-left: 20px; }
    .footer { margin-top: 32px; font-size: 0.75rem; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${this.escapeHtml(report.name || "测试报告")}</h1>
    <div class="meta">环境: ${this.escapeHtml(report.environment || "-")} · 创建时间: ${created}</div>

    <div class="stats">
      <div class="stat"><div class="stat-value">${summary.total ?? 0}</div><div class="stat-label">总用例</div></div>
      <div class="stat success"><div class="stat-value">${summary.passed ?? 0}</div><div class="stat-label">通过</div></div>
      <div class="stat error"><div class="stat-value">${summary.failed ?? 0}</div><div class="stat-label">失败</div></div>
      <div class="stat warning"><div class="stat-value">${summary.error ?? 0}</div><div class="stat-label">错误</div></div>
      <div class="stat primary"><div class="stat-value">${summary.passRate ?? 0}%</div><div class="stat-label">通过率</div></div>
      <div class="stat"><div class="stat-value">${summary.duration ?? 0}ms</div><div class="stat-label">总耗时</div></div>
    </div>

    ${
      aiSummary
        ? `
    <div class="section ai-summary-card">
      <div class="section-title">AI 报告总结</div>
      ${aiSummary.risk_assessment?.level ? `<p><strong>风险等级：</strong>${this.escapeHtml(this.riskLevelLabel(aiSummary.risk_assessment.level))}</p>` : ""}
      ${aiSummary.summary?.short ? `<p><strong>摘要：</strong>${this.escapeHtml(aiSummary.summary.short)}</p>` : ""}
      ${aiSummary.summary?.detailed ? `<p><strong>详情：</strong>${this.escapeHtml(aiSummary.summary.detailed)}</p>` : ""}
      ${(aiSummary.highlights || []).length ? `<h3>关键发现</h3><ul>${(aiSummary.highlights || []).map((h: string) => `<li>${this.escapeHtml(String(h))}</li>`).join("")}</ul>` : ""}
      ${aiSummary.risk_assessment?.description ? `<h3>风险评估</h3><p>${this.escapeHtml(aiSummary.risk_assessment.description)}</p>` : ""}
      ${(aiSummary.risk_assessment?.recommendations || []).length ? `<h3>建议动作</h3><ul>${(aiSummary.risk_assessment?.recommendations || []).map((r: string) => `<li>${this.escapeHtml(String(r))}</li>`).join("")}</ul>` : ""}
    </div>`
        : ""
    }

    ${
      Object.keys(performance).length
        ? `
    <div class="section">
      <div class="section-title">性能指标</div>
      <div class="perf-grid">
        <div class="perf-item"><div class="perf-label">平均响应时间</div><div class="perf-value">${performance.avgResponseTime ?? "-"}ms</div></div>
        <div class="perf-item"><div class="perf-label">最小/最大</div><div class="perf-value">${performance.minResponseTime ?? "-"} / ${performance.maxResponseTime ?? "-"}ms</div></div>
        <div class="perf-item"><div class="perf-label">P95 / P99</div><div class="perf-value">${performance.p95ResponseTime ?? "-"} / ${performance.p99ResponseTime ?? "-"}ms</div></div>
        <div class="perf-item"><div class="perf-label">吞吐量</div><div class="perf-value">${performance.throughput ?? "-"} req/s</div></div>
      </div>
    </div>`
        : ""
    }

    ${distBars ? `<div class="section"><div class="section-title">响应时间分布</div>${distBars}</div>` : ""}

    <div class="section">
      <div class="section-title">测试详情</div>
      ${detailRows || "<p style='color:#94a3b8'>暂无详情</p>"}
    </div>

    <div class="footer">APIForge 测试报告 · 导出时间 ${new Date().toLocaleString("zh-CN")}</div>
  </div>
</body>
</html>`;
  }

  private escapeHtml(s: string): string {
    if (typeof s !== "string") return "";
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private riskLevelLabel(level: string): string {
    if (!level) return "-";
    const v = String(level).toUpperCase();
    if (v === "HIGH" || v === "高") return "高";
    if (v === "MEDIUM" || v === "中") return "中";
    if (v === "LOW" || v === "低") return "低";
    return level;
  }

  // 场景测试相关方法

  // 获取场景列表
  async getScenarios(projectId: string) {
    const list = projectId
      ? await this.testScenarioRepository.find({ where: { projectId } })
      : await this.testScenarioRepository.find();

    return list.map((s) => ({
      ...s,
      steps: this.safeParseJson(s.steps, [] as any[]),
      variables: s.variables ? this.safeParseJson(s.variables, {}) : {},
    }));
  }

  // 获取场景详情
  async getScenario(id: string) {
    const scenario = await this.testScenarioRepository.findOne({
      where: { id },
    });
    if (scenario) {
      return {
        ...scenario,
        steps: this.safeParseJson(scenario.steps, [] as any[]),
        variables: scenario.variables
          ? this.safeParseJson(scenario.variables, {})
          : {},
      };
    }
    return null;
  }

  // 创建场景
  async createScenario(scenario: Partial<TestScenario>) {
    const projectId = String((scenario as any)?.projectId || "").trim();
    const name = String((scenario as any)?.name || "").trim();
    if (!projectId) throw new BadRequestException("projectId is required");
    if (!name) throw new BadRequestException("name is required");

    const steps = Array.isArray((scenario as any)?.steps)
      ? (scenario as any).steps
      : [];
    if (steps.length === 0) {
      throw new BadRequestException("steps is required");
    }
    const variables =
      (scenario as any)?.variables &&
      typeof (scenario as any).variables === "object"
        ? (scenario as any).variables
        : null;

    const newScenario = await this.testScenarioRepository.save({
      ...scenario,
      projectId,
      name,
      steps: JSON.stringify(steps),
      variables: variables ? JSON.stringify(variables) : null,
    });
    return {
      ...newScenario,
      steps: this.safeParseJson(newScenario.steps, [] as any[]),
      variables: newScenario.variables
        ? this.safeParseJson(newScenario.variables, {})
        : {},
    };
  }

  // 更新场景
  async updateScenario(id: string, scenario: Partial<TestScenario>) {
    const updateData: any = { ...scenario };
    if ((scenario as any).projectId !== undefined) {
      // projectId immutable for scenario; ignore client-sent changes.
      delete updateData.projectId;
    }
    if ((scenario as any).name !== undefined) {
      const name = String((scenario as any).name || "").trim();
      if (!name) throw new BadRequestException("name is required");
      updateData.name = name;
    }
    if ((scenario as any).steps !== undefined) {
      const steps = Array.isArray((scenario as any).steps)
        ? (scenario as any).steps
        : [];
      if (steps.length === 0) {
        throw new BadRequestException("steps is required");
      }
      updateData.steps = JSON.stringify(steps);
    }
    if ((scenario as any).variables !== undefined) {
      const v = (scenario as any).variables;
      updateData.variables =
        v && typeof v === "object" ? JSON.stringify(v) : null;
    }
    await this.testScenarioRepository.update(id, updateData);
    return this.getScenario(id);
  }

  // 删除场景
  async deleteScenario(id: string) {
    return this.testScenarioRepository.delete(id);
  }

  async deleteScenariosBatch(ids: string[]) {
    const validIds = ids.filter((id) => id && typeof id === "string");
    if (validIds.length === 0) return { deleted: 0 };
    const result = await this.testScenarioRepository.delete({
      id: In(validIds),
    });
    return { deleted: result.affected ?? 0 };
  }

  // 执行场景测试
  async executeScenario(
    scenarioId: string,
    environmentId: string,
    projectId: string,
    reportName?: string,
    generateReport: boolean = true,
  ) {
    const scenario = await this.getScenario(scenarioId);
    if (!scenario) {
      throw new Error("Scenario not found");
    }

    const environment = await this.environmentRepository.findOne({
      where: { id: environmentId },
    });
    if (!environment) {
      throw new Error("Environment not found");
    }

    const results = [];
    const responseTimes = [];
    let scenarioVariables = { ...(scenario.variables || {}) };

    // 全局环境：执行前先运行登录用例一次，提取变量供所有步骤使用
    const loginTestCaseId = (environment as any).loginTestCaseId;
    const loginExtractRules = (environment as any).loginExtractRules;
    if (
      loginTestCaseId &&
      loginExtractRules &&
      typeof loginExtractRules === "object" &&
      Object.keys(loginExtractRules).length > 0
    ) {
      const loginCase = await this.testCaseRepository.findOne({
        where: { id: loginTestCaseId },
      });
      if (loginCase) {
        try {
          const loginResult = await this.executeTestCase(
            loginTestCaseId,
            environmentId,
            scenarioVariables,
            undefined,
          );
          const extracted = this.extractVariables(
            loginResult?.responseBody ?? loginResult?.response,
            loginExtractRules,
          );
          if (Object.keys(extracted).length > 0) {
            scenarioVariables = { ...scenarioVariables, ...extracted };
          }
        } catch (err) {
          // 登录失败时继续执行，但变量可能缺失
        }
      }
    }

    // 执行场景步骤
    for (const step of scenario.steps) {
      try {
        // 执行测试用例
        const testCase = await this.testCaseRepository.findOne({
          where: { id: step.testCaseId },
        });
        if (!testCase) {
          throw new Error(`Test case ${step.testCaseId} not found`);
        }

        // 执行测试
        const result = await this.executeTestCase(
          testCase.id,
          environmentId,
          scenarioVariables,
          step.requestOverrides,
        );
        let extractedVariables: any = {};
        results.push({
          ...result,
          stepName: step.name || `Step ${results.length + 1}`,
          extractedVariables,
        });

        if (result.responseTime) {
          responseTimes.push(result.responseTime);
        }

        // 提取变量
        if (step.extractRules) {
          extractedVariables = this.extractVariables(
            result.responseBody ?? result.response,
            step.extractRules,
          );
          scenarioVariables = { ...scenarioVariables, ...extractedVariables };
          results[results.length - 1].extractedVariables = extractedVariables;
        }
      } catch (error) {
        results.push({
          stepName: step.name || `Step ${results.length + 1}`,
          status: "ERROR",
          error: error.message,
          executedAt: new Date(),
        });
      }
    }

    // 生成场景测试报告
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === "PASSED").length,
      failed: results.filter((r) => r.status === "FAILED").length,
      error: results.filter((r) => r.status === "ERROR").length,
      passRate:
        results.length > 0
          ? Math.round(
              (results.filter((r) => r.status === "PASSED").length /
                results.length) *
                100,
            )
          : 0,
      duration: responseTimes.reduce((sum, time) => sum + time, 0),
      startTime: new Date(),
      endTime: new Date(),
      scenarioVariables,
    };

    // 计算性能指标
    const performance = {
      avgResponseTime:
        responseTimes.length > 0
          ? Math.round(
              responseTimes.reduce((sum, time) => sum + time, 0) /
                responseTimes.length,
            )
          : 0,
      minResponseTime:
        responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTime:
        responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      p95ResponseTime:
        responseTimes.length > 0
          ? this.calculatePercentile(responseTimes, 95)
          : 0,
      p99ResponseTime:
        responseTimes.length > 0
          ? this.calculatePercentile(responseTimes, 99)
          : 0,
      throughput:
        results.length > 0
          ? Math.round((results.length * 1000) / summary.duration)
          : 0,
    };

    // 生成图表数据
    const charts = {
      timeline: results.map((result, index) => ({
        name: result.stepName,
        time: result.responseTime || 0,
        status: result.status,
      })),
      distribution: this.generateResponseTimeDistribution(responseTimes),
      trend: [],
    };

    if (!generateReport) {
      return {
        reportId: null,
        results,
        summary,
        performance,
        charts,
        scenarioVariables,
      };
    }

    // 创建测试报告
    const report = await this.testReportRepository.save({
      projectId,
      name:
        reportName ||
        `${await this.getProjectName(projectId)} - ${scenario.name} - ${this.formatReportDate()}`,
      environment: await this.getEnvironmentName(environmentId),
      summary: JSON.stringify(summary),
      details: JSON.stringify(results),
      performance: JSON.stringify(performance),
      charts: JSON.stringify(charts),
    });

    return {
      reportId: report.id,
      results,
      summary,
      performance,
      charts,
      scenarioVariables,
    };
  }

  /**
   * 场景压力测试：在指定时长或请求数内以指定并发数重复执行完整场景，收集性能指标
   * 支持：固定时长 / 固定请求数、预热、失败率阈值提前停止、步间延迟
   */
  async executeScenarioStressTest(
    scenarioId: string,
    environmentId: string,
    projectId: string,
    options: {
      virtualUsers?: number;
      durationSeconds?: number;
      totalRequests?: number;
      executionMode?: "duration" | "requests";
      rampUpSeconds?: number;
      stopOnFailRate?: number;
      stepDelayMs?: number;
      reportName?: string;
    },
  ) {
    const scenario = await this.getScenario(scenarioId);
    if (!scenario) {
      throw new Error("Scenario not found");
    }

    const environment = await this.environmentRepository.findOne({
      where: { id: environmentId },
    });
    if (!environment) {
      throw new Error("Environment not found");
    }

    const virtualUsers = Math.min(
      Math.max(Number(options.virtualUsers) || 10, 1),
      100,
    );
    const executionMode = options.executionMode || "duration";
    const durationSeconds =
      executionMode === "duration"
        ? Math.min(Math.max(Number(options.durationSeconds) || 30, 5), 600)
        : 0;
    const totalRequests =
      executionMode === "requests"
        ? Math.min(Math.max(Number(options.totalRequests) || 100, 1), 10000)
        : 0;
    const rampUpSeconds = Math.min(
      Math.max(Number(options.rampUpSeconds) || 0, 0),
      120,
    );
    const stopOnFailRate =
      options.stopOnFailRate != null
        ? Math.min(Math.max(Number(options.stopOnFailRate), 0), 100)
        : null;
    const stepDelayMs = Math.min(
      Math.max(Number(options.stepDelayMs) || 0, 0),
      10000,
    );

    const allResults: any[] = [];
    const responseTimes: number[] = [];
    const startTime = Date.now();
    const endTime =
      executionMode === "duration" ? startTime + durationSeconds * 1000 : 0;
    let scenarioRunCount = 0;

    const shouldStop = (): boolean => {
      if (executionMode === "duration" && Date.now() >= endTime) return true;
      if (executionMode === "requests" && scenarioRunCount >= totalRequests)
        return true;
      if (
        stopOnFailRate != null &&
        allResults.length >= 10 &&
        allResults.length > 0
      ) {
        const failed = allResults.filter(
          (r) => r.status === "FAILED" || r.status === "ERROR",
        ).length;
        const rate = (failed / allResults.length) * 100;
        if (rate >= stopOnFailRate) return true;
      }
      return false;
    };

    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const runSingleScenario = async (): Promise<void> => {
      if (executionMode === "requests" && scenarioRunCount >= totalRequests)
        return;
      scenarioRunCount++;
      let scenarioVariables = { ...(scenario.variables || {}) };
      for (const step of scenario.steps) {
        if (shouldStop()) break;
        try {
          const testCase = await this.testCaseRepository.findOne({
            where: { id: step.testCaseId },
          });
          if (!testCase) {
            allResults.push({
              stepName: step.name || "Step",
              status: "ERROR",
              error: `Test case ${step.testCaseId} not found`,
              executedAt: new Date(),
            });
            continue;
          }

          const result = await this.executeTestCase(
            testCase.id,
            environmentId,
            scenarioVariables,
            step.requestOverrides,
          );
          let extractedVariables: any = {};
          allResults.push({
            ...result,
            stepName: step.name || `Step`,
            extractedVariables,
          });

          if (result.responseTime) {
            responseTimes.push(result.responseTime);
          }

          if (step.extractRules) {
            extractedVariables = this.extractVariables(
              result.responseBody ?? result.response,
              step.extractRules,
            );
            scenarioVariables = { ...scenarioVariables, ...extractedVariables };
            allResults[allResults.length - 1].extractedVariables =
              extractedVariables;
          }

          if (stepDelayMs > 0) await delay(stepDelayMs);
        } catch (error: any) {
          allResults.push({
            stepName: step.name || "Step",
            status: "ERROR",
            error: error?.message || String(error),
            executedAt: new Date(),
          });
        }
      }
    };

    const worker = async (workerIndex: number) => {
      if (rampUpSeconds > 0) {
        const delayPerWorker = (rampUpSeconds * 1000) / virtualUsers;
        await delay(workerIndex * delayPerWorker);
      }
      for (;;) {
        if (shouldStop()) break;
        await runSingleScenario();
      }
    };

    await Promise.all(new Array(virtualUsers).fill(0).map((_, i) => worker(i)));

    const actualDuration = Date.now() - startTime;
    const summary = {
      total: allResults.length,
      passed: allResults.filter((r) => r.status === "PASSED").length,
      failed: allResults.filter((r) => r.status === "FAILED").length,
      error: allResults.filter((r) => r.status === "ERROR").length,
      passRate:
        allResults.length > 0
          ? Math.round(
              (allResults.filter((r) => r.status === "PASSED").length /
                allResults.length) *
                100,
            )
          : 0,
      duration: actualDuration,
      startTime: new Date(startTime),
      endTime: new Date(),
      virtualUsers,
      durationSeconds: executionMode === "duration" ? durationSeconds : 0,
      totalRequests: executionMode === "requests" ? totalRequests : 0,
      executionMode,
      rampUpSeconds,
      stopOnFailRate: stopOnFailRate ?? undefined,
      stepDelayMs,
      stressTest: true,
    };

    const performance = {
      avgResponseTime:
        responseTimes.length > 0
          ? Math.round(
              responseTimes.reduce((sum, t) => sum + t, 0) /
                responseTimes.length,
            )
          : 0,
      minResponseTime:
        responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTime:
        responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      p95ResponseTime:
        responseTimes.length > 0
          ? this.calculatePercentile(responseTimes, 95)
          : 0,
      p99ResponseTime:
        responseTimes.length > 0
          ? this.calculatePercentile(responseTimes, 99)
          : 0,
      throughput:
        allResults.length > 0
          ? Math.round((allResults.length * 1000) / actualDuration)
          : 0,
    };

    const charts = {
      timeline: allResults.slice(0, 100).map((r, i) => ({
        name: r.stepName || `#${i + 1}`,
        time: r.responseTime || 0,
        status: r.status,
      })),
      distribution: this.generateResponseTimeDistribution(responseTimes),
      trend: [],
    };

    const reportTitle =
      options.reportName?.trim() ||
      `${scenario.name} - 压力测试 - ${this.formatReportDate()}`;
    const report = await this.testReportRepository.save({
      projectId,
      name: reportTitle,
      environment: await this.getEnvironmentName(environmentId),
      summary: JSON.stringify(summary),
      details: JSON.stringify(allResults),
      performance: JSON.stringify(performance),
      charts: JSON.stringify(charts),
    });

    return {
      reportId: report.id,
      results: allResults,
      summary,
      performance,
      charts,
    };
  }

  // 提取变量
  private extractVariables(response: any, extractRules: any): any {
    const extracted: any = {};
    let body: any;
    if (response?.responseBody !== undefined) {
      body = response.responseBody;
    } else if (
      response &&
      typeof response === "object" &&
      "status" in response &&
      "data" in response
    ) {
      body = response.data;
    } else if (response?.body !== undefined) {
      body = response.body;
    } else {
      body = response;
    }

    Object.entries(extractRules || {}).forEach(([key, path]) => {
      const value = this.extractJsonPath(body, String(path));
      if (value !== undefined) {
        extracted[key] = value;
      }
    });

    return extracted;
  }

  private replaceVariables(
    request: any,
    environment: Environment,
    extraVariables?: Record<string, any>,
  ): any {
    const variables = environment.variables || [];
    const varMap = new Map<string, string>(
      variables
        .filter((v: any) => v && v.key)
        .map((v: any) => [String(v.key), String(v.value ?? "")]),
    );

    // Built-in base url shortcuts
    varMap.set("base_url", String(environment.baseUrl || ""));
    varMap.set("baseUrl", String(environment.baseUrl || ""));

    // Scenario/runtime variables override environment variables.
    if (extraVariables && typeof extraVariables === "object") {
      for (const [k, v] of Object.entries(extraVariables)) {
        if (!k) continue;
        varMap.set(String(k), this.stringifyVariableValue(v));
      }
    }

    const replacedUrl = this.replaceMustacheVars(
      String(request.url || ""),
      varMap,
    );
    const url = this.ensureAbsoluteUrl(replacedUrl, environment.baseUrl);

    const headers = this.replaceVariablesInObject(
      request.headers || {},
      varMap,
    );
    const query = this.replaceVariablesInObject(request.query || {}, varMap);
    const body = this.replaceVariablesInObject(request.body, varMap);
    const bodyType = String(request.bodyType || "json");
    const bodyForm = this.replaceBodyFormVariables(request.bodyForm, varMap);

    const authHeaders = this.buildAuthHeaders(request.auth);

    return {
      ...request,
      url,
      headers: { ...(authHeaders || {}), ...(headers || {}) },
      query,
      body,
      bodyType,
      bodyForm,
    };
  }

  private mergeRequestOverride(baseRequest: any, requestOverride?: any) {
    if (!requestOverride || typeof requestOverride !== "object") {
      return baseRequest;
    }

    const base =
      baseRequest && typeof baseRequest === "object" ? baseRequest : {};
    const override = requestOverride;

    const overrideHeaders = this.normalizeOverrideToObject(override.headers);
    const overrideQuery = this.normalizeOverrideToObject(override.query);
    const overrideBody =
      override.body !== undefined
        ? this.mergeOverrideValue(
            base.body,
            this.normalizeOverrideToObject(override.body) ?? override.body,
          )
        : undefined;

    return {
      ...base,
      ...override,
      headers: {
        ...(base.headers || {}),
        ...(overrideHeaders || {}),
      },
      query: {
        ...(base.query || {}),
        ...(overrideQuery || {}),
      },
      body: overrideBody !== undefined ? overrideBody : base.body,
      bodyForm:
        override.bodyForm !== undefined ? override.bodyForm : base.bodyForm,
      auth: override.auth !== undefined ? override.auth : base.auth,
      bodyType:
        override.bodyType !== undefined ? override.bodyType : base.bodyType,
    };
  }

  private normalizeOverrideToObject(val: any): Record<string, any> | undefined {
    if (val === null || val === undefined) return undefined;
    if (Array.isArray(val)) {
      const out: Record<string, any> = {};
      for (const r of val) {
        if (r && typeof r === "object" && r.key != null) {
          out[String(r.key)] = r.value;
        }
      }
      return out;
    }
    if (typeof val === "object" && !Array.isArray(val)) return val;
    return undefined;
  }

  private mergeOverrideValue(baseValue: any, overrideValue: any) {
    if (
      baseValue &&
      overrideValue &&
      typeof baseValue === "object" &&
      typeof overrideValue === "object" &&
      !Array.isArray(baseValue) &&
      !Array.isArray(overrideValue)
    ) {
      return {
        ...baseValue,
        ...overrideValue,
      };
    }
    return overrideValue;
  }

  private buildAxiosDataAndHeaders(resolvedRequest: any): {
    data: any;
    headers: Record<string, string>;
  } {
    const headers: Record<string, string> = {
      ...(resolvedRequest.headers || {}),
    };
    const bodyType = String(resolvedRequest.bodyType || "json").toLowerCase();

    if (bodyType === "none" || bodyType === "") {
      return { data: undefined, headers };
    }

    const dropContentType = () => {
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === "content-type") delete headers[k];
      }
    };

    const setContentType = (value: string) => {
      dropContentType();
      headers["Content-Type"] = value;
    };

    const toPairs = (): Array<{ key: string; value: any }> => {
      const raw = resolvedRequest.bodyForm;
      if (Array.isArray(raw)) {
        return raw
          .map((r: any) => ({
            key: String(r?.key || "").trim(),
            value: r?.value,
          }))
          .filter((p) => p.key);
      }
      const b = resolvedRequest.body;
      if (b && typeof b === "object" && !Array.isArray(b)) {
        return Object.entries(b).map(([k, v]) => ({
          key: String(k).trim(),
          value: v,
        }));
      }
      return [];
    };

    if (bodyType === "urlencoded" || bodyType === "x-www-form-urlencoded") {
      setContentType("application/x-www-form-urlencoded");
      const params = new URLSearchParams();
      for (const p of toPairs()) {
        params.append(p.key, this.stringifyVariableValue(p.value));
      }
      return { data: params.toString(), headers };
    }

    if (
      bodyType === "form-data" ||
      bodyType === "formdata" ||
      bodyType === "multipart"
    ) {
      dropContentType();
      const fd = new FormData();
      const raw = resolvedRequest.bodyForm;
      if (Array.isArray(raw)) {
        for (const r of raw) {
          const key = String(r?.key || "").trim();
          if (!key) continue;
          const type = String(r?.type || "text").toLowerCase();
          const value = r?.value;
          const filename = r?.filename;
          if (type === "file" && typeof value === "string" && value) {
            try {
              const buf = Buffer.from(value, "base64");
              const blob = new Blob([buf]);
              fd.append(key, blob, filename || "file");
            } catch {
              fd.append(key, this.stringifyVariableValue(value));
            }
          } else {
            fd.append(key, this.stringifyVariableValue(value));
          }
        }
      } else {
        for (const p of toPairs()) {
          fd.append(p.key, this.stringifyVariableValue(p.value));
        }
      }
      return { data: fd as any, headers };
    }

    // Default JSON
    return { data: resolvedRequest.body, headers };
  }

  private stringifyVariableValue(value: any): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private safeParseJson<T>(input: any, fallback: T): T {
    if (input === null || input === undefined) return fallback;
    if (typeof input !== "string") return input as T;
    const trimmed = input.trim();
    if (!trimmed) return fallback;
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return fallback;
    }
  }

  private replaceBodyFormVariables(
    bodyForm: any,
    varMap: Map<string, string>,
  ): any {
    if (!Array.isArray(bodyForm)) {
      return this.replaceVariablesInObject(bodyForm, varMap);
    }
    return bodyForm.map((r: any) => {
      if (r && String(r?.type || "text").toLowerCase() === "file") {
        return {
          ...r,
          key: this.replaceMustacheVars(String(r?.key || ""), varMap),
          filename: r?.filename
            ? this.replaceMustacheVars(String(r.filename), varMap)
            : r.filename,
          value: r.value,
        };
      }
      return this.replaceVariablesInObject(r, varMap);
    });
  }

  private replaceVariablesInObject(obj: any, varMap: Map<string, string>): any {
    if (obj === null || obj === undefined) return obj;
    if (
      typeof obj === "string" ||
      typeof obj === "number" ||
      typeof obj === "boolean"
    ) {
      return this.replaceMustacheVars(String(obj), varMap);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.replaceVariablesInObject(item, varMap));
    }
    if (typeof obj === "object") {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [
          k,
          this.replaceVariablesInObject(v, varMap),
        ]),
      );
    }
    return obj;
  }

  private replaceMustacheVars(
    input: string,
    varMap: Map<string, string>,
  ): string {
    return input.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (m, key) => {
      const value = varMap.get(String(key));
      return value !== undefined ? value : m;
    });
  }

  private ensureAbsoluteUrl(url: string, baseUrl: string): string {
    const trimmed = (url || "").trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const base = String(baseUrl || "").trim();
    if (!base) return trimmed;
    return `${base.replace(/\/+$/, "")}/${trimmed.replace(/^\/+/, "")}`;
  }

  private buildAuthHeaders(auth: any): Record<string, string> | null {
    if (!auth || !auth.type) return null;
    try {
      switch (auth.type) {
        case "basic": {
          const username = String(auth?.credentials?.username ?? "");
          const password = String(auth?.credentials?.password ?? "");
          const token = Buffer.from(`${username}:${password}`).toString(
            "base64",
          );
          return { Authorization: `Basic ${token}` };
        }
        case "bearer": {
          const token = String(auth?.credentials?.token ?? "");
          if (!token) return null;
          return { Authorization: `Bearer ${token}` };
        }
        case "api_key": {
          const headerName = String(
            auth?.credentials?.headerName ?? "X-API-Key",
          );
          const value = String(auth?.credentials?.value ?? "");
          if (!value) return null;
          return { [headerName]: value };
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  private executeAssertions(
    response: any,
    responseTime: number,
    assertions: any[],
  ): any[] {
    const list = Array.isArray(assertions) ? assertions : [];
    return list.map((rawAssertion) => {
      const assertion = this.normalizeAssertion(rawAssertion);
      let actual;
      let passed = false;

      switch (assertion.type) {
        case "STATUS":
          actual = response?.status;
          passed = this.compareValues(
            actual,
            assertion.condition,
            assertion.expected,
          );
          break;
        case "JSON_PATH":
          actual = this.extractJsonPath(response?.data, assertion.target);
          passed = this.compareValues(
            actual,
            assertion.condition,
            assertion.expected,
          );
          break;
        case "RESPONSE_TIME":
          actual = responseTime;
          passed = this.compareValues(
            actual,
            assertion.condition,
            assertion.expected,
          );
          break;
        // 其他断言类型...
      }

      return {
        type: assertion.type,
        target: assertion.target,
        condition: assertion.condition,
        expected: assertion.expected,
        actual,
        passed,
        message: assertion.message,
      };
    });
  }

  private extractJsonPath(obj: any, path: string): any {
    if (!path || obj === undefined || obj === null) return undefined;
    const tokens = this.parseJsonPath(path);
    let current: any = obj;
    for (const token of tokens) {
      if (current === undefined || current === null) return undefined;
      if (typeof token === "number") {
        if (!Array.isArray(current)) return undefined;
        current = current[token];
      } else {
        current = current[token];
      }
    }
    return current;
  }

  private parseJsonPath(path: string): Array<string | number> {
    // Supports: $.a.b[0].c  OR  a.b.0.c  OR  a["b"]
    let p = String(path).trim();
    if (p.startsWith("$")) {
      p = p.slice(1);
    }
    if (p.startsWith(".")) p = p.slice(1);

    const tokens: Array<string | number> = [];
    const re = /(?:\.?([a-zA-Z0-9_-]+))|\[(\d+)\]|\[["']([^"']+)["']\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p)) !== null) {
      if (m[1] !== undefined) tokens.push(m[1]);
      else if (m[2] !== undefined) tokens.push(Number(m[2]));
      else if (m[3] !== undefined) tokens.push(m[3]);
    }
    return tokens;
  }

  private normalizeAssertion(assertion: any): any {
    const normalized = { ...(assertion || {}) };
    // Support `path` alias commonly used in docs/UI.
    if (!normalized.target && normalized.path)
      normalized.target = normalized.path;

    // JSON_PATH：如果目标丢失，但期望是一个路径（以$.开头），使用它
    if (
      normalized.type === "JSON_PATH" &&
      !normalized.target &&
      typeof normalized.expected === "string" &&
      normalized.expected.startsWith("$.")
    ) {
      normalized.target = normalized.expected;
      if (normalized.condition === "exists") {
        normalized.expected = true;
      }
    }

    // Support object-style expectations like: { "$exists": true }
    if (normalized.expected && typeof normalized.expected === "object") {
      if (
        Object.prototype.hasOwnProperty.call(normalized.expected, "$exists")
      ) {
        normalized.condition = "exists";
      } else if (
        Object.prototype.hasOwnProperty.call(normalized.expected, "$regex")
      ) {
        normalized.condition = "matches";
        normalized.expected = normalized.expected.$regex;
      } else if (
        Object.prototype.hasOwnProperty.call(normalized.expected, "$contains")
      ) {
        normalized.condition = "contains";
        normalized.expected = normalized.expected.$contains;
      } else if (
        Object.prototype.hasOwnProperty.call(normalized.expected, "$gt")
      ) {
        normalized.condition = "gt";
        normalized.expected = normalized.expected.$gt;
      } else if (
        Object.prototype.hasOwnProperty.call(normalized.expected, "$lt")
      ) {
        normalized.condition = "lt";
        normalized.expected = normalized.expected.$lt;
      } else if (
        Object.prototype.hasOwnProperty.call(normalized.expected, "$neq")
      ) {
        normalized.condition = "neq";
        normalized.expected = normalized.expected.$neq;
      } else if (
        Object.prototype.hasOwnProperty.call(normalized.expected, "$eq")
      ) {
        normalized.condition = "eq";
        normalized.expected = normalized.expected.$eq;
      }
    }

    if (!normalized.condition && normalized.type === "STATUS")
      normalized.condition = "eq";
    if (!normalized.condition) normalized.condition = "eq";
    if (normalized.condition === "not_empty") {
      normalized.condition = "exists";
      normalized.expected = true;
    }

    return normalized;
  }

  private compareValues(
    actual: any,
    condition: string,
    expected: any,
  ): boolean {
    if (expected && typeof expected === "object") {
      // Keep compatibility if callers still pass object-style expected.
      if (Object.prototype.hasOwnProperty.call(expected, "$exists")) {
        const shouldExist = Boolean(expected.$exists);
        const exists = actual !== undefined && actual !== null;
        return shouldExist ? exists : !exists;
      }
      if (Object.prototype.hasOwnProperty.call(expected, "$regex")) {
        try {
          return new RegExp(String(expected.$regex)).test(String(actual));
        } catch {
          return false;
        }
      }
    }
    switch (condition) {
      case "eq":
        return actual === expected;
      case "neq":
        return actual !== expected;
      case "gt":
        return actual > expected;
      case "lt":
        return actual < expected;
      case "contains":
        return String(actual).includes(String(expected));
      case "exists":
      case "not_empty": {
        const exists = actual !== undefined && actual !== null;
        if (condition === "not_empty") {
          if (!exists) return false;
          if (typeof actual === "string") return actual.length > 0;
          if (Array.isArray(actual)) return actual.length > 0;
          if (typeof actual === "object") return Object.keys(actual).length > 0;
          return true;
        }
        const shouldExist =
          expected === true || String(expected).toLowerCase() === "true";
        return shouldExist ? exists : !exists;
      }
      case "matches":
        try {
          return new RegExp(String(expected)).test(String(actual));
        } catch {
          return false;
        }
      default:
        return false;
    }
  }
}
