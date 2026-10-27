require("ts-node/register");
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  rewriteLoopbackHost,
  runsInsideContainer,
  resetContainerDetection,
} = require("../src/common/utils/runtime-host");

const original = { ...process.env };

beforeEach(() => {
  resetContainerDetection();
  delete process.env.APIFORGE_IN_CONTAINER;
  delete process.env.APIFORGE_KEEP_LOOPBACK;
});

afterEach(() => {
  process.env = { ...original };
  resetContainerDetection();
});

test("容器内把 127.0.0.1 改写为 host.docker.internal，保留端口与路径", () => {
  process.env.APIFORGE_IN_CONTAINER = "true";
  assert.equal(
    rewriteLoopbackHost("http://127.0.0.1:8080/api/v1"),
    "http://host.docker.internal:8080/api/v1",
  );
});

test("localhost 与 IPv6 回环地址同样改写", () => {
  process.env.APIFORGE_IN_CONTAINER = "true";
  assert.equal(rewriteLoopbackHost("http://localhost:3000"), "http://host.docker.internal:3000");
  assert.equal(rewriteLoopbackHost("http://[::1]:9000/ping"), "http://host.docker.internal:9000/ping");
});

test("根路径不补斜杠，避免与 {{base_url}}/xxx 拼出双斜杠", () => {
  process.env.APIFORGE_IN_CONTAINER = "true";
  assert.equal(rewriteLoopbackHost("http://127.0.0.1:8080"), "http://host.docker.internal:8080");
  assert.equal(rewriteLoopbackHost("http://127.0.0.1:8080/"), "http://host.docker.internal:8080");
});

test("查询串与 hash 保留", () => {
  process.env.APIFORGE_IN_CONTAINER = "true";
  assert.equal(
    rewriteLoopbackHost("http://127.0.0.1:8080/api?debug=1#top"),
    "http://host.docker.internal:8080/api?debug=1#top",
  );
});

test("非回环地址原样返回", () => {
  process.env.APIFORGE_IN_CONTAINER = "true";
  for (const url of [
    "https://api.example.com/v1",
    "http://host.docker.internal:8080/api/v1",
    "http://192.168.1.20:8080/api",
    "http://my-service:8080/api",
  ]) {
    assert.equal(rewriteLoopbackHost(url), url);
  }
});

test("非容器环境不改写", () => {
  process.env.APIFORGE_IN_CONTAINER = "false";
  assert.equal(runsInsideContainer(), false);
  assert.equal(rewriteLoopbackHost("http://127.0.0.1:8080/api/v1"), "http://127.0.0.1:8080/api/v1");
});

test("APIFORGE_KEEP_LOOPBACK 可关闭改写", () => {
  process.env.APIFORGE_IN_CONTAINER = "true";
  process.env.APIFORGE_KEEP_LOOPBACK = "true";
  assert.equal(rewriteLoopbackHost("http://127.0.0.1:8080/api"), "http://127.0.0.1:8080/api");
});

test("非法 URL 与空值不抛错", () => {
  process.env.APIFORGE_IN_CONTAINER = "true";
  assert.equal(rewriteLoopbackHost(""), "");
  assert.equal(rewriteLoopbackHost("not a url"), "not a url");
  assert.equal(rewriteLoopbackHost("127.0.0.1:8080"), "127.0.0.1:8080");
});

test("执行链路：{{base_url}} 与相对路径都使用改写后的宿主机地址", () => {
  require("reflect-metadata");
  const { TestService } = require("../src/modules/test/test.service");
  const service = new TestService({}, {}, {}, {}, {}, {}, {}, {});
  process.env.APIFORGE_IN_CONTAINER = "true";
  const environment = { baseUrl: "http://127.0.0.1:8080/api/v1", variables: [] };

  const absolute = service.replaceVariables({ url: "{{base_url}}/users" }, environment);
  assert.equal(absolute.url, "http://host.docker.internal:8080/api/v1/users");

  const relative = service.replaceVariables({ url: "/users" }, environment);
  assert.equal(relative.url, "http://host.docker.internal:8080/api/v1/users");

  const explicitLoopback = service.replaceVariables({ url: "http://127.0.0.1:8080/api/v1/users" }, environment);
  assert.equal(
    explicitLoopback.url,
    "http://host.docker.internal:8080/api/v1/users",
    "调试表单保存的绝对回环地址也必须改写",
  );

  assert.equal(
    service.requestOrigin("", environment.baseUrl),
    "http://host.docker.internal:8080",
  );
});

test("环境连接测试同样把回环地址改写为宿主机地址", () => {
  require("reflect-metadata");
  process.env.APIFORGE_IN_CONTAINER = "true";
  const { connectionTarget } = require("../src/modules/environment/environment.service");
  assert.deepEqual(
    connectionTarget("http://127.0.0.1:8080/api/v1"),
    { host: "host.docker.internal", port: 8080 },
  );
  assert.deepEqual(
    connectionTarget("localhost:9000"),
    { host: "host.docker.internal", port: 9000 },
  );
});

test("执行链路：非容器环境保持原地址", () => {
  require("reflect-metadata");
  const { TestService } = require("../src/modules/test/test.service");
  const service = new TestService({}, {}, {}, {}, {}, {}, {}, {});
  process.env.APIFORGE_IN_CONTAINER = "false";
  const environment = { baseUrl: "http://127.0.0.1:8080/api/v1", variables: [] };
  assert.equal(
    service.replaceVariables({ url: "{{base_url}}/users" }, environment).url,
    "http://127.0.0.1:8080/api/v1/users",
  );
});

test("结果展示时把 host.docker.internal 还原成环境里配置的地址", () => {
  require("reflect-metadata");
  process.env.APIFORGE_IN_CONTAINER = "true";
  const { restoreLoopbackHost } = require("../src/common/utils/runtime-host");

  assert.equal(
    restoreLoopbackHost(
      "http://host.docker.internal:8080/api/v1/sessions/1",
      "http://127.0.0.1:8080/api/v1",
    ),
    "http://127.0.0.1:8080/api/v1/sessions/1",
    "由 {{base_url}} 拼出来的地址应整体换回配置的 baseUrl",
  );

  assert.equal(
    restoreLoopbackHost(
      "http://host.docker.internal:8080/other/x?debug=1",
      "http://127.0.0.1:8080/api/v1",
    ),
    "http://127.0.0.1:8080/other/x?debug=1",
    "用例里写死的绝对地址只替换主机名，路径与查询串保持原样",
  );

  assert.equal(
    restoreLoopbackHost(
      "http://host.docker.internal:9999/x",
      "http://127.0.0.1:8080/api/v1",
    ),
    "http://host.docker.internal:9999/x",
    "端口对不上说明不是同一个服务，不要硬改",
  );

  assert.equal(
    restoreLoopbackHost("https://api.example.com/x", "http://127.0.0.1:8080"),
    "https://api.example.com/x",
    "本来就不是网关地址，原样返回",
  );

  assert.equal(restoreLoopbackHost(""), "");
});
