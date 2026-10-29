require("reflect-metadata");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApiService, apiIdentity } = require("../src/modules/api/api.service");

/** 内存版仓储：find 返回本项目已有接口，save 落库并生成 id */
function createRepository(seed = []) {
  const rows = seed.map((row, index) => ({ id: row.id || `seed-${index}`, ...row }));
  return {
    rows,
    async find({ where } = {}) {
      return rows.filter((row) => !where?.projectId || row.projectId === where.projectId);
    },
    async save(value) {
      const list = Array.isArray(value) ? value : [value];
      return list.map((item) => {
        if (item.id) return item;
        const row = { id: `new-${rows.length + 1}`, ...item };
        rows.push(row);
        return row;
      });
    },
  };
}

const SPEC = {
  openapi: "3.0.1",
  paths: {
    "/ping": { get: { summary: "ping" } },
    "/users/{id}": { get: { summary: "get user" } },
  },
};

test("首次导入全部落库", async () => {
  const repo = createRepository();
  const result = await new ApiService(repo).importApi("p1", SPEC);
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 0);
  assert.equal(result.apis.length, 2);
  assert.equal(repo.rows.length, 2);
});

test("重复导入同一份文档不产生重复记录", async () => {
  const repo = createRepository();
  const service = new ApiService(repo);
  await service.importApi("p1", SPEC);
  const second = await service.importApi("p1", SPEC);

  assert.equal(second.imported, 0);
  assert.equal(second.skipped, 2);
  assert.deepEqual(second.apis, []);
  assert.equal(repo.rows.length, 2, "重复导入后不应新增记录");
});

test("文档新增接口时只补新增的那条", async () => {
  const repo = createRepository();
  const service = new ApiService(repo);
  await service.importApi("p1", SPEC);

  const third = await service.importApi("p1", {
    openapi: "3.0.1",
    paths: { ...SPEC.paths, "/orders": { post: { summary: "create order" } } },
  });
  assert.equal(third.imported, 1);
  assert.equal(third.skipped, 2);
  assert.equal(third.apis[0].path, "/orders");
  assert.equal(repo.rows.length, 3);
});

test("路径参数改名不算新增接口", async () => {
  const repo = createRepository([{ projectId: "p1", method: "GET", path: "/users/{id}" }]);
  const result = await new ApiService(repo).importApi("p1", {
    openapi: "3.0.1",
    paths: { "/users/{userId}": { get: { summary: "get user" } } },
  });
  assert.equal(result.imported, 0);
  assert.equal(result.skipped, 1);
  assert.equal(repo.rows.length, 1);
});

test("Postman 的 :id 与 OpenAPI 的 {id} 视为同一接口", async () => {
  const repo = createRepository([{ projectId: "p1", method: "GET", path: "/users/{id}" }]);
  const result = await new ApiService(repo).importApi("p1", {
    item: [{ name: "Get", request: { method: "GET", url: { path: ["users", ":id"] } } }],
  });
  assert.equal(result.imported, 0);
  assert.equal(result.skipped, 1);
});

test("不同项目的同名接口互不影响", async () => {
  const repo = createRepository();
  await new ApiService(repo).importApi("p1", SPEC);
  const other = await new ApiService(repo).importApi("p2", SPEC);
  assert.equal(other.imported, 2);
  assert.equal(repo.rows.length, 4);
});

test("同一份文档里自身重复的接口只取第一条", async () => {
  const repo = createRepository();
  const result = await new ApiService(repo).importApi("p1", {
    openapi: "3.0.1",
    paths: {
      "/users/{id}": { get: { summary: "first" } },
      "/users/{userId}": { get: { summary: "second" } },
    },
  });
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
  assert.equal(repo.rows.length, 1);
});

test("唯一键归一化：忽略结尾斜杠、方法大小写，保留自定义方法后缀", () => {
  assert.equal(apiIdentity("get", "/users/{id}/"), apiIdentity("GET", "/users/:id"));
  assert.equal(apiIdentity("GET", "/ping?debug=1"), apiIdentity("GET", "/ping"));
  assert.notEqual(apiIdentity("GET", "/v1/users:batchGet"), apiIdentity("GET", "/v1/users:batchDelete"));
  assert.equal(apiIdentity("post", ""), apiIdentity("POST", "/"));
});
