require("reflect-metadata");
require("ts-node/register");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TestService } = require("../src/modules/test/test.service");

/**
 * 构造一个只实现必要方法的 TestService。
 * 构造参数顺序：testCase / testReport / testScenario / environment / project / api / locust
 */
const buildService = (overrides = {}) =>
  new TestService(
    overrides.testCase ?? {},
    {},
    {},
    overrides.environment ?? {},
    {},
    overrides.api ?? {},
    overrides.locust ?? {},
  );

test("用例占位符名与接口路径参数名不一致时，按路径位置补示例值", async () => {
  const service = buildService({
    api: {
      findOne: async () => ({
        id: "api-1",
        path: "/sessions/{id}",
        parameters: [
          { in: "path", name: "id", schema: { type: "string", format: "uuid" } },
        ],
      }),
    },
  });

  const { request: filled, filled: samples } =
    await service.fillMissingPathParams(
      { method: "GET", url: "{{base_url}}/sessions/{{sessionId}}" },
      "api-1",
      { token: "t" },
    );

  assert.deepEqual(samples, { sessionId: "00000000-0000-4000-8000-000000000000" });
  assert.equal(
    filled.url,
    "{{base_url}}/sessions/00000000-0000-4000-8000-000000000000",
    "{{sessionId}} 应对齐接口的 {id} 并填入示例值，而不是原样保留",
  );
});

test("占位符名与参数名一致时仍按名称匹配", async () => {
  const service = buildService({
    api: {
      findOne: async () => ({
        path: "/sessions/{id}",
        parameters: [{ in: "path", name: "id", example: "abc-123" }],
      }),
    },
  });

  const { request: filled } = await service.fillMissingPathParams(
    { url: "{{base_url}}/sessions/{{id}}" },
    "api-1",
    {},
  );
  assert.equal(filled.url, "{{base_url}}/sessions/abc-123");
});

test("路径段数量不一致时不做位置映射，避免错位填值", async () => {
  const service = buildService({
    api: {
      findOne: async () => ({
        path: "/sessions/{id}",
        parameters: [{ in: "path", name: "id", example: "abc-123" }],
      }),
    },
  });

  const { request: filled, filled: samples } =
    await service.fillMissingPathParams(
      { url: "{{base_url}}/sessions/{{sessionId}}/messages" },
      "api-1",
      {},
    );
  assert.equal(filled.url, "{{base_url}}/sessions/{{sessionId}}/messages");
  assert.deepEqual(samples, {});
});

test("已有变量值时不再补示例值", async () => {
  const service = buildService({
    api: {
      findOne: async () => ({
        path: "/sessions/{id}",
        parameters: [{ in: "path", name: "id", example: "abc-123" }],
      }),
    },
  });

  const request = { url: "{{base_url}}/sessions/{{sessionId}}" };
  const { request: filled, filled: samples } =
    await service.fillMissingPathParams(request, "api-1", {
      sessionId: "s-1",
    });
  assert.equal(filled, request);
  assert.deepEqual(samples, {});
});

test("变量未解析时返回 400 且说明变量来源，而不是笼统的 500", async () => {
  const service = buildService({
    environment: {
      findOne: async () => ({
        id: "env-1",
        name: "本地",
        baseUrl: "http://127.0.0.1:8080/api/v1",
        variables: [],
      }),
    },
  });

  await assert.rejects(
    () =>
      service.debugRequest(
        { method: "GET", url: "{{base_url}}/sessions/{{sessionId}}" },
        "env-1",
        {},
      ),
    (error) => {
      assert.equal(error.getStatus?.(), 400, "必须是 4xx 业务错误，前端才能拿到 message");
      assert.match(error.message, /sessionId/);
      assert.match(error.message, /前序步骤/);
      return true;
    },
  );
});

test("执行用例失败时返回 ERROR 结果并带上具体原因", async () => {
  const updates = [];
  const service = buildService({
    testCase: {
      findOne: async () => ({
        id: "case-1",
        name: "获取会话详情",
        projectId: "p-1",
        apiId: null,
        assertions: [],
        request: { method: "GET", url: "{{base_url}}/sessions/1" },
      }),
      update: async (id, patch) => {
        updates.push({ id, patch });
        return {};
      },
    },
    environment: { findOne: async () => null },
  });

  const result = await service.executeTestCase("case-1", "env-1");

  assert.equal(result.status, "ERROR");
  assert.match(result.error.message, /环境不存在/);
  assert.equal(updates.length, 1, "失败结果也要落库，刷新后仍能看到原因");
  assert.equal(updates[0].patch.lastRun.status, "ERROR");
});

test("执行用例失败不抛异常，批量执行不会整批中断", async () => {
  const service = buildService({
    testCase: {
      findOne: async () => ({
        id: "case-2",
        name: "无环境的用例",
        assertions: [],
        request: { method: "GET", url: "http://example.com" },
      }),
      update: async () => ({}),
    },
    environment: { findOne: async () => null },
  });

  await assert.doesNotReject(() => service.executeTestCase("case-2", "env-x"));
});
