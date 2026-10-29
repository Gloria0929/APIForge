require("ts-node/register");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const {
  SpecFetchService,
  extractSpecCandidatesFromHtml,
  extractSpecUrlFromConfig,
} = require("../src/modules/api/spec-fetch.service");

// 测试机若在容器内会把 127.0.0.1 改写为 host.docker.internal，这里关掉
process.env.APIFORGE_KEEP_LOOPBACK = "true";

const SPEC = { openapi: "3.0.1", info: { title: "demo", version: "1.0.0" }, paths: { "/ping": { get: {} } } };
const YAML_SPEC = "openapi: 3.0.0\ninfo:\n  title: demo\npaths:\n  /ping:\n    get: {}\n";

async function startServer(routes) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    const route = routes[pathname];
    if (!route) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    const { status = 200, type = "application/json", body = "" } = route;
    // 故意不返回任何 Access-Control-Allow-* 头：模拟禁止浏览器跨域的第三方文档地址
    res.writeHead(status, { "Content-Type": type });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test("服务端代取规范，不受目标站点缺失 CORS 头影响", async () => {
  const { server, base } = await startServer({
    "/v3/api-docs": { body: SPEC },
  });
  try {
    const service = new SpecFetchService();
    const result = await service.fetchSpec(`${base}/v3/api-docs`);
    assert.match(result.text, /"openapi"\s*:\s*"3\.0\.1"/);
    assert.equal(result.url, `${base}/v3/api-docs`);
    assert.equal(result.requestedUrl, `${base}/v3/api-docs`);
    assert.equal(result.resolvedFrom, undefined);
  } finally {
    server.close();
  }
});

test("填 Swagger UI 页面地址时自动解析到 swagger-config，再取到真正文档", async () => {
  const { server, base } = await startServer({
    "/swagger-ui/index.html": {
      type: "text/html;charset=utf-8",
      body: `<!DOCTYPE html><html><body><script>
        window.ui = SwaggerUIBundle({ url: "/v3/api-docs/swagger-config", dom_id: "#swagger-ui" })
      </script></body></html>`,
    },
    "/v3/api-docs/swagger-config": { body: { configUrl: "/v3/api-docs/swagger-config", urls: [{ url: "/v3/api-docs", name: "default" }] } },
    "/v3/api-docs": { body: SPEC },
  });
  try {
    const service = new SpecFetchService();
    const result = await service.fetchSpec(`${base}/swagger-ui/index.html`);
    assert.ok(result.text.includes('"openapi"'));
    assert.equal(result.resolvedVia, "ui");
    assert.equal(result.resolvedFrom, `${base}/v3/api-docs`);
    assert.equal(result.requestedUrl, `${base}/swagger-ui/index.html`);
  } finally {
    server.close();
  }
});

test("HTML 页面里找不到文档地址时给出可操作的提示", async () => {
  const { server, base } = await startServer({
    "/docs": { type: "text/html", body: "<!doctype html><html><body>hello</body></html>" },
  });
  try {
    const service = new SpecFetchService();
    await assert.rejects(service.fetchSpec(`${base}/docs`), /Swagger UI 页面/);
  } finally {
    server.close();
  }
});

test("404 与 401 给出针对性提示", async () => {
  const { server, base } = await startServer({
    "/missing": { status: 404, body: { message: "not found" } },
    "/secure": { status: 401, body: { message: "unauthorized" } },
  });
  try {
    const service = new SpecFetchService();
    await assert.rejects(service.fetchSpec(`${base}/missing`), /不存在/);
    await assert.rejects(service.fetchSpec(`${base}/secure`), /鉴权/);
  } finally {
    server.close();
  }
});

test("YAML 文档原样返回，交由前端解析", async () => {
  const { server, base } = await startServer({
    "/openapi.yaml": { type: "application/yaml", body: YAML_SPEC },
  });
  try {
    const service = new SpecFetchService();
    const result = await service.fetchSpec(`${base}/openapi.yaml`);
    assert.equal(result.text.trim(), YAML_SPEC.trim());
  } finally {
    server.close();
  }
});

test("只接受 http/https，拒绝其它协议与空地址", async () => {
  const service = new SpecFetchService();
  await assert.rejects(service.fetchSpec("file:///etc/passwd"), /仅支持 http\/https/);
  await assert.rejects(service.fetchSpec("   "), /请输入/);
});

test("HTML 候选地址解析保留相对路径", () => {
  const html = `<script>SwaggerUIBundle({ configUrl: "./v3/api-docs/swagger-config" })</script>`;
  assert.deepEqual(extractSpecCandidatesFromHtml(html, "http://api.test/swagger-ui/"), [
    "http://api.test/swagger-ui/v3/api-docs/swagger-config",
  ]);
});

test("swagger-config 能取出文档地址，真正的规范不会被误判", () => {
  const config = JSON.stringify({ urls: [{ url: "/v3/api-docs", name: "default" }] });
  assert.equal(extractSpecUrlFromConfig(config, "http://api.test/v3/api-docs/swagger-config"), "http://api.test/v3/api-docs");
  assert.equal(extractSpecUrlFromConfig(JSON.stringify(SPEC), "http://api.test/v3/api-docs"), null);
  assert.equal(extractSpecUrlFromConfig(YAML_SPEC, "http://api.test/openapi.yaml"), null);
});
