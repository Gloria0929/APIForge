require("reflect-metadata");
require("ts-node/register");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TestService } = require("../src/modules/test/test.service");
const { EnvironmentService } = require("../src/modules/environment/environment.service");

const buildService = ({ testCase = {}, environment = {} } = {}) =>
  new TestService(testCase, {}, {}, environment, {}, {}, {});

test("环境支持多个前置用例：按顺序执行并合并提取的变量", async () => {
  const environment = {
    id: "env",
    projectId: "p",
    name: "本地环境",
    baseUrl: "http://127.0.0.1:8080/api/v1",
    setupSteps: [
      { testCaseId: "login", name: "登录", extractRules: { token: "$.token" } },
      { testCaseId: "list", extractRules: { sessionId: "$.data[0].id" } },
    ],
  };
  const calls = [];
  const service = buildService({
    testCase: {
      findOne: async ({ where }) => ({
        id: where.id,
        projectId: "p",
        name: where.id === "login" ? "登录" : "获取会话列表",
      }),
    },
    environment: { findOne: async () => environment },
  });
  service.executeTestCase = async (id, envId, vars) => {
    calls.push({ id, vars: { ...vars } });
    if (id === "login") {
      return { responseBody: { token: "tok-1" }, response: { status: 200 } };
    }
    return { responseBody: { data: [{ id: "s-9" }] }, response: { status: 200 } };
  };

  const variables = await service.resolveEnvironmentSetupVariables(
    undefined,
    "env",
    {},
  );

  assert.deepEqual(calls.map((call) => call.id), ["login", "list"]);
  assert.equal(
    calls[1].vars.token,
    "tok-1",
    "第二个前置用例要能用到第一个用例提取的 token",
  );
  assert.deepEqual(variables, { token: "tok-1", sessionId: "s-9" });
});

test("已有值的变量不再重复执行前置用例", async () => {
  const environment = {
    id: "env",
    projectId: "p",
    name: "本地环境",
    setupSteps: [
      { testCaseId: "login", extractRules: { token: "$.token" } },
    ],
  };
  let calls = 0;
  const service = buildService({
    testCase: { findOne: async () => ({ id: "login", projectId: "p" }) },
    environment: { findOne: async () => environment },
  });
  service.executeTestCase = async () => {
    calls++;
    return { responseBody: { token: "fresh" }, response: { status: 200 } };
  };

  const variables = await service.resolveEnvironmentSetupVariables(
    undefined,
    "env",
    { token: "given" },
  );

  assert.equal(calls, 0);
  assert.equal(variables.token, "given");
});

test("前置用例提取不到变量时报出具体步骤和 HTTP 状态", async () => {
  const environment = {
    id: "env",
    projectId: "p",
    name: "本地环境",
    setupSteps: [
      {
        testCaseId: "list",
        name: "获取会话列表",
        extractRules: { sessionId: "$.data[0].id" },
      },
    ],
  };
  const service = buildService({
    testCase: {
      findOne: async () => ({ id: "list", projectId: "p", name: "获取会话列表" }),
    },
    environment: { findOne: async () => environment },
  });
  service.executeTestCase = async () => ({
    responseBody: { data: [] },
    response: { status: 200 },
  });

  await assert.rejects(
    () => service.resolveEnvironmentSetupVariables(undefined, "env", {}),
    (error) => {
      assert.match(error.message, /获取会话列表/);
      assert.match(error.message, /sessionId/);
      assert.match(error.message, /HTTP 200/);
      return true;
    },
  );
});

test("正在执行的前置用例不会递归调用自己", async () => {
  const environment = {
    id: "env",
    projectId: "p",
    name: "本地环境",
    setupSteps: [
      { testCaseId: "login", extractRules: { token: "$.token" } },
    ],
  };
  let calls = 0;
  const service = buildService({
    testCase: { findOne: async () => ({ id: "login", projectId: "p" }) },
    environment: { findOne: async () => environment },
  });
  service.executeTestCase = async () => {
    calls++;
    return { responseBody: { token: "x" }, response: { status: 200 } };
  };

  const variables = await service.resolveEnvironmentSetupVariables(
    "login",
    "env",
    {},
  );

  assert.equal(calls, 0, "执行登录用例本身时不应再跑一遍登录");
  assert.deepEqual(variables, {});
});

test("旧版单登录用例配置（loginTestCaseId + loginExtractRules）继续生效", async () => {
  const environment = {
    id: "env",
    projectId: "p",
    name: "本地环境",
    loginTestCaseId: "login",
    loginExtractRules: { token: "$.token" },
  };
  const service = buildService({
    testCase: { findOne: async () => ({ id: "login", projectId: "p" }) },
    environment: { findOne: async () => environment },
  });
  service.executeTestCase = async () => ({
    responseBody: { token: "legacy-token" },
    response: { status: 200 },
  });

  const variables = await service.resolveEnvironmentSetupVariables(
    undefined,
    "env",
    {},
  );
  assert.equal(variables.token, "legacy-token");
});

test("前置用例配置会做清洗：丢掉空规则、合并同一用例的规则", () => {
  const service = new EnvironmentService({});
  const normalized = service.normalizeEnvironment(
    {
      projectId: "p",
      name: "本地环境",
      baseUrl: "http://127.0.0.1:8080",
      setupSteps: [
        { testCaseId: "list", extractRules: { " sessionId ": " $.data[0].id " } },
        { testCaseId: "list", extractRules: { total: "$.total" } },
        { testCaseId: "empty", extractRules: { key: "" } },
        { testCaseId: "", extractRules: { token: "$.token" } },
      ],
    },
    { requireProjectId: true },
  );

  assert.deepEqual(normalized.setupSteps, [
    {
      testCaseId: "list",
      extractRules: { sessionId: "$.data[0].id", total: "$.total" },
    },
  ]);
});

test("没有有效前置用例时置空而不是留空数组", () => {
  const service = new EnvironmentService({});
  const normalized = service.normalizeEnvironment(
    {
      projectId: "p",
      name: "本地环境",
      baseUrl: "http://127.0.0.1:8080",
      setupSteps: [{ testCaseId: "x", extractRules: {} }],
    },
    { requireProjectId: true },
  );
  assert.equal(normalized.setupSteps, null);
});
