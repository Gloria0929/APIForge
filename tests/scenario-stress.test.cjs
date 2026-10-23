require("reflect-metadata");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { TestService } = require("../src/modules/test/test.service");

const startServer = async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && url.pathname === "/api/v1/login") {
      res.end(JSON.stringify({ data: { token: "tok-123" } }));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/v1/knowledge/")) {
      res.end(JSON.stringify({ ok: true, path: url.pathname }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found", path: url.pathname }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port };
};

const buildService = ({ port, testCase, environment, api, captured, scenarioVariables = {}, scenarioSteps }) => {
  const cases = new Map(testCase.map((item) => [item.id, item]));
  const repos = {
    testCase: {
      // 服务端用 In(testCaseIds) 查询，这里直接返回全部用例
      find: async () => [...cases.values()],
      findOne: async ({ where }) => cases.get(where.id) || null,
      update: async () => ({}),
    },
    report: { save: async (row) => { captured.report = row; return { id: "report-1", ...row }; } },
    scenario: {
      findOne: async () => ({
        id: "s1",
        projectId: "p1",
        name: "知识库配置场景",
        steps: JSON.stringify(scenarioSteps || [{ testCaseId: "tc-config", name: "获取当前配置" }]),
        variables: JSON.stringify(scenarioVariables),
      }),
    },
    environment: { findOne: async () => ({ ...environment, baseUrl: `http://127.0.0.1:${port}/api/v1` }) },
    project: {},
    api: { findOne: async () => api },
    locust: {
      run: async (plan) => {
        captured.plan = plan;
        return {
          total: 10, failed: 0, failedRequests: 0, errors: 0, durationMs: 1000,
          startedAt: new Date(), endedAt: new Date(), avgResponseTime: 12,
          minResponseTime: 8, maxResponseTime: 30, p95ResponseTime: 25, p99ResponseTime: 30,
          throughput: 10, completedRuns: 1, timeline: [],
          endpoints: [{
            method: "GET", name: "获取当前配置", requestCount: 10, failureCount: 1,
            avgResponseTime: 12, minResponseTime: 8, maxResponseTime: 30,
            medianResponseTime: 11, p95ResponseTime: 25, p99ResponseTime: 30, requestsPerSecond: 10,
          }],
          failuresList: [{ method: "GET", name: "获取当前配置", error: "FAILED: 状态码 404", occurrences: 1 }],
        };
      },
    },
  };
  return new TestService(
    repos.testCase, repos.report, repos.scenario, repos.environment,
    repos.project, repos.api, repos.locust,
  );
};

const baseTestCase = {
  id: "tc-config",
  projectId: "p1",
  name: "获取当前配置",
  apiId: "api-1",
  assertions: [],
  request: {
    method: "GET",
    url: "/knowledge/{{kbId}}/config",
    headers: { Authorization: "Bearer {{token}}" },
  },
};

const baseApi = {
  id: "api-1",
  parameters: [{ in: "path", name: "kbId", schema: { example: "kb-123" } }],
};

test("场景压测补齐路径参数与环境登录变量，与普通场景执行保持一致", async () => {
  const { server, port } = await startServer();
  try {
    const captured = {};
    const service = buildService({
      port,
      captured,
      testCase: [
        baseTestCase,
        {
          id: "login", projectId: "p1", name: "登录", assertions: [],
          request: { method: "POST", url: "/login", headers: {}, body: { username: "u", password: "p" } },
        },
      ],
      environment: {
        id: "env", projectId: "p1", name: "本地环境", variables: [],
        loginTestCaseId: "login", loginExtractRules: { token: "$.data.token" },
      },
      api: baseApi,
    });

    await service.executeScenarioStressTest("s1", "env", "p1", {
      virtualUsers: 2, durationSeconds: 5, executionMode: "duration",
    });

    const step = captured.plan.steps[0];
    assert.equal(
      step.url,
      `http://127.0.0.1:${port}/api/v1/knowledge/kb-123/config`,
      "路径参数必须用接口文档示例值补齐，而不是把 {{kbId}} 直接发给压测引擎",
    );
    assert.equal(step.headers.Authorization, "Bearer tok-123", "压测前应先执行环境登录用例");
    assert.equal(captured.plan.variables.token, "tok-123", "登录提取的变量要传给压测引擎");
  } finally {
    server.close();
  }
});

test("场景变量显式提供路径参数时不使用文档示例值", async () => {
  const { server, port } = await startServer();
  try {
    const captured = {};
    const service = buildService({
      port, captured,
      testCase: [baseTestCase],
      environment: { id: "env", projectId: "p1", name: "本地环境", variables: [] },
      api: baseApi,
      scenarioVariables: { kbId: "kb-999", token: "manual" },
    });

    await service.executeScenarioStressTest("s1", "env", "p1", {
      virtualUsers: 1, durationSeconds: 5, executionMode: "duration",
    });

    const step = captured.plan.steps[0];
    assert.equal(step.url, `http://127.0.0.1:${port}/api/v1/knowledge/kb-999/config`);
  } finally {
    server.close();
  }
});

test("压测报告里的请求地址是真实 URL，而不是用例名", async () => {
  const { server, port } = await startServer();
  try {
    const captured = {};
    const service = buildService({
      port, captured,
      testCase: [baseTestCase],
      environment: { id: "env", projectId: "p1", name: "本地环境", variables: [] },
      api: baseApi,
      scenarioVariables: { token: "manual" },
    });

    await service.executeScenarioStressTest("s1", "env", "p1", {
      virtualUsers: 1, durationSeconds: 5, executionMode: "duration",
    });

    const details = JSON.parse(captured.report.details);
    const rows = details.filter((item) => item.name === "获取当前配置");
    assert.equal(rows.length, 2, "接口统计与失败记录各一行");
    for (const row of rows) {
      assert.deepEqual(
        row.request,
        baseTestCase.request,
        "报告的 request 应保留用例定义的原始配置（含 {{变量}} 占位符）",
      );
      assert.equal(
        row.resolvedUrl,
        `http://127.0.0.1:${port}/api/v1/knowledge/kb-123/config`,
        "实际请求地址单独记录，便于排查",
      );
    }
  } finally {
    server.close();
  }
});

test("循环步骤的 itemVar 不被接口文档示例值覆盖", async () => {
  const { server, port } = await startServer();
  try {
    const captured = {};
    const service = buildService({
      port, captured,
      testCase: [baseTestCase],
      environment: { id: "env", projectId: "p1", name: "本地环境", variables: [] },
      api: baseApi,
      scenarioVariables: { token: "manual" },
      scenarioSteps: [{
        testCaseId: "tc-config",
        name: "获取当前配置",
        repeat: { sourceKey: "items", itemVar: "kbId", itemPath: "id" },
      }],
    });

    await service.executeScenarioStressTest("s1", "env", "p1", {
      virtualUsers: 1, durationSeconds: 5, executionMode: "duration",
    });

    const step = captured.plan.steps[0];
    assert.equal(
      step.url,
      `http://127.0.0.1:${port}/api/v1/knowledge/{{kbId}}/config`,
      "循环变量必须留给压测引擎逐轮渲染，不能被示例值替换",
    );
    assert.deepEqual(step.repeat, { sourceKey: "items", itemVar: "kbId", itemPath: "id" });
  } finally {
    server.close();
  }
});
