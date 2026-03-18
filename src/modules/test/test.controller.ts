import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import { TestService } from "./test.service";
import { TestCase } from "./test-case.entity";
import { Response } from "express";

@Controller("tests")
export class TestController {
  constructor(private readonly testService: TestService) {}

  @Get()
  findAll(@Query("projectId") projectId: string) {
    return this.testService.findAll(projectId);
  }

  @Post()
  create(@Body() testCase: Partial<TestCase>) {
    return this.testService.create(testCase);
  }

  @Post("execute")
  execute(@Body() data: { testCaseId: string; environmentId: string }) {
    return this.testService.executeTestCase(
      data.testCaseId,
      data.environmentId,
    );
  }

  @Post("execute-suite")
  executeSuite(
    @Body()
    data: {
      testCaseIds: string[];
      environmentId: string;
      projectId: string;
      reportName?: string;
      concurrency?: number;
    },
  ) {
    return this.testService.executeTestSuite(
      data.testCaseIds,
      data.environmentId,
      data.projectId,
      data.reportName,
      data.concurrency,
    );
  }

  @Get("export")
  async exportTests(
    @Query("projectId") projectId: string,
    @Res() res: Response,
  ) {
    const json = await this.testService.exportTestCases(projectId);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="testcases-${projectId}.json"`,
    );
    res.send(json);
  }

  @Post("import")
  importTests(
    @Body()
    data: {
      projectId: string;
      format?: "json" | "csv" | "postman";
      content?: string;
      testCases?: any[];
      spec?: any;
    },
  ) {
    return this.testService.importTestCases(data.projectId, data);
  }

  @Post(":id/clone")
  cloneTest(@Param("id") id: string) {
    return this.testService.cloneTestCase(id);
  }

  // API 调试（类似 Postman）：执行任意请求，不绑定测试用例
  @Post("debug")
  debug(@Body() data: { environmentId: string; request: any }) {
    return this.testService.debugRequest(data.request, data.environmentId);
  }

  // 压力测试：在指定时长内以指定并发数持续请求，收集性能指标
  @Post("stress")
  stress(
    @Body()
    data: {
      environmentId: string;
      projectId: string;
      request: any;
      apiName?: string;
      virtualUsers?: number;
      durationSeconds?: number;
    },
  ) {
    return this.testService.executeStressTest(
      data.request,
      data.environmentId,
      data.projectId,
      {
        apiName: data.apiName,
        virtualUsers: data.virtualUsers,
        durationSeconds: data.durationSeconds,
      },
    );
  }

  // 测试报告相关端点
  @Get("reports")
  getReports(@Query("projectId") projectId: string) {
    return this.testService.getReports(projectId);
  }

  @Get("reports/:id")
  getReport(@Param("id") id: string) {
    return this.testService.getReport(id);
  }

  @Post("reports/bulk-delete")
  deleteReportsBatch(@Body() data: { ids: string[] }) {
    return this.testService.deleteReportsBatch(data.ids || []);
  }

  @Delete("reports/:id")
  deleteReport(@Param("id") id: string) {
    return this.testService.deleteReport(id);
  }

  @Get("reports/:id/export")
  async exportReport(
    @Param("id") id: string,
    @Query("format") format: "json" | "html",
    @Res() res: Response,
  ) {
    try {
      const result = await this.testService.exportReport(id, format);

      if (format === "html") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="report-${id}.html"`,
        );
        res.send(result);
      } else {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="report-${id}.json"`,
        );
        res.send(result);
      }
    } catch (error) {
      res.status(500).send({ error: (error as Error).message });
    }
  }

  // 场景测试相关端点
  @Get("scenarios")
  getScenarios(@Query("projectId") projectId: string) {
    return this.testService.getScenarios(projectId);
  }

  @Get("scenarios/:id")
  getScenario(@Param("id") id: string) {
    return this.testService.getScenario(id);
  }

  @Post("scenarios")
  createScenario(@Body() scenario: any) {
    return this.testService.createScenario(scenario);
  }

  @Put("scenarios/:id")
  updateScenario(@Param("id") id: string, @Body() scenario: any) {
    return this.testService.updateScenario(id, scenario);
  }

  @Post("scenarios/bulk-delete")
  deleteScenariosBatch(@Body() data: { ids: string[] }) {
    return this.testService.deleteScenariosBatch(data.ids || []);
  }

  @Delete("scenarios/:id")
  deleteScenario(@Param("id") id: string) {
    return this.testService.deleteScenario(id);
  }

  @Post("scenarios/execute")
  executeScenario(
    @Body()
    data: {
      scenarioId: string;
      environmentId: string;
      projectId: string;
      reportName?: string;
      generateReport?: boolean;
    },
  ) {
    return this.testService.executeScenario(
      data.scenarioId,
      data.environmentId,
      data.projectId,
      data.reportName,
      data.generateReport,
    );
  }

  // 场景压力测试：支持固定时长/固定请求数、预热、失败率阈值、步间延迟
  @Post("scenarios/stress")
  executeScenarioStress(
    @Body()
    data: {
      scenarioId: string;
      environmentId: string;
      projectId: string;
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
    return this.testService.executeScenarioStressTest(
      data.scenarioId,
      data.environmentId,
      data.projectId,
      {
        virtualUsers: data.virtualUsers,
        durationSeconds: data.durationSeconds,
        totalRequests: data.totalRequests,
        executionMode: data.executionMode,
        rampUpSeconds: data.rampUpSeconds,
        stopOnFailRate: data.stopOnFailRate,
        stepDelayMs: data.stepDelayMs,
        reportName: data.reportName,
      },
    );
  }

  // 注意：动态路由必须放在静态路由之后，否则会吞掉 /reports /scenarios 等路径
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.testService.findOne(id);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() testCase: Partial<TestCase>) {
    return this.testService.update(id, testCase);
  }

  @Post("bulk-delete")
  removeBatch(@Body() data: { projectId: string; ids: string[] }) {
    return this.testService.removeBatch(data.projectId, data.ids || []);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.testService.remove(id);
  }
}
