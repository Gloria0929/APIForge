require("reflect-metadata");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { AiService, providerNeedsApiKey, providerAuthHeaders } = require("../src/modules/ai/ai.service");

test("Ollama 等本地服务不需要 API Key", () => {
  assert.equal(providerNeedsApiKey("ollama"), false);
  assert.equal(providerNeedsApiKey("Ollama"), false);
  assert.equal(providerNeedsApiKey("openai"), true);
  assert.equal(providerNeedsApiKey("azure"), true);
  assert.equal(providerNeedsApiKey(undefined), true);
});

test("认证头按类型生成，没有 Key 时完全不带认证头", () => {
  assert.deepEqual(providerAuthHeaders({ providerType: "openai", apiKey: "sk-1" }), {
    Authorization: "Bearer sk-1",
  });
  assert.deepEqual(providerAuthHeaders({ providerType: "azure", apiKey: "az-1" }), {
    "api-key": "az-1",
  });
  assert.deepEqual(providerAuthHeaders({ providerType: "anthropic", apiKey: "an-1" }), {
    "x-api-key": "an-1",
    "anthropic-version": "2023-06-01",
  });
  for (const providerType of ["ollama", "openai", "azure", "anthropic"]) {
    assert.deepEqual(providerAuthHeaders({ providerType, apiKey: "" }), {}, providerType);
  }
});

const withFakeOllama = async (handler, fn) => {
  const seen = {};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.setHeader("Content-Type", "application/json");
    // 避免 keep-alive 连接跨用例复用导致 ECONNRESET
    res.setHeader("Connection", "close");
    handler(req, res, url, seen);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    return await fn(base, seen);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
};

const ollamaProvider = (base) => ({
  id: 7,
  providerType: "ollama",
  baseUrl: base,
  apiKey: "",
  model: "qwen2.5:7b",
  isActive: true,
  features: { semanticParse: true },
});

const buildService = (provider, config, api) =>
  new AiService(
    { findOne: async () => provider, find: async () => [provider] },
    { findOne: async () => config },
    { save: async (row) => row },
    { findOne: async () => api },
    {},
    {},
    {},
    null,
  );

test("无 Key 也能拉取模型列表，并过滤嵌入类模型", async () => {
  await withFakeOllama(
    (req, res, url, seen) => {
      if (req.method === "GET" && url.pathname === "/v1/models") {
        seen.auth = req.headers.authorization || null;
        res.end(
          JSON.stringify({
            data: [
              { id: "qwen2.5:7b" },
              { id: "llama3.1:8b" },
              { id: "nomic-embed-text" },
              { id: "bge-m3" },
              { id: "all-minilm:latest" },
            ],
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    },
    async (base, seen) => {
      const service = buildService(ollamaProvider(base), {}, {});
      const { models } = await service.getProviderModels({
        providerType: "ollama",
        baseUrl: base,
        apiKey: "",
      });
      assert.deepEqual(models, ["llama3.1:8b", "qwen2.5:7b"]);
      assert.equal(seen.auth, null, "无 Key 时不应带 Authorization");
    },
  );
});

test("Ollama 无 Key 时也能完成语义分析调用", async () => {
  await withFakeOllama(
    (req, res, url, seen) => {
      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          seen.auth = req.headers.authorization || null;
          seen.body = JSON.parse(body);
          res.end(
            JSON.stringify({
              choices: [{ message: { content: '{"summary":"ok"}' } }],
              usage: { total_tokens: 12 },
            }),
          );
        });
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    },
    async (base, seen) => {
      const config = {
        id: 1,
        projectId: "p1",
        aiEnabled: true,
        providerId: 7,
        features: { semanticParse: true },
        modelConfig: { temperature: 0.2, maxTokens: 2048, timeout: 60000 },
      };
      const service = buildService(
        ollamaProvider(base),
        config,
        { id: "api-1", projectId: "p1", name: "获取配置", method: "GET", path: "/config" },
      );
      await service.semanticParseApi("p1", "api-1");
      assert.equal(seen.auth, null, "Ollama 不应带 Authorization");
      assert.equal(seen.body.model, "qwen2.5:7b");
      assert.equal(seen.body.max_tokens, 2048, "未配置上下文长度时使用模型默认上限");
    },
  );
});
