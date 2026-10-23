require("ts-node/register");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseImageRef,
  withTag,
  repoPathOf,
  buildImageCandidates,
} = require("../src/modules/version/version.service");

test("解析 Docker Hub 短名", () => {
  const ref = parseImageRef("foehao09/apiforge:1.0.8");
  assert.equal(ref.registry, "docker.io");
  assert.equal(ref.repository, "foehao09/apiforge");
  assert.equal(ref.tag, "1.0.8");
});

test("解析私有仓库地址", () => {
  const ref = parseImageRef("registry.cn-zhangjiakou.aliyuncs.com/apiforge/apiforge:1.0.8");
  assert.equal(ref.registry, "registry.cn-zhangjiakou.aliyuncs.com");
  assert.equal(ref.repository, "apiforge/apiforge");
  assert.equal(ref.tag, "1.0.8");
});

test("解析带端口的注册中心", () => {
  const ref = parseImageRef("registry.local:5000/ns/apiforge");
  assert.equal(ref.registry, "registry.local:5000");
  assert.equal(ref.repository, "ns/apiforge");
  assert.equal(ref.tag, "");
});

test("无命名空间的本地镜像", () => {
  const ref = parseImageRef("apiforge:latest");
  assert.equal(ref.registry, "docker.io");
  assert.equal(ref.repository, "apiforge");
  assert.equal(ref.tag, "latest");
});

test("换 tag 时保留注册中心与仓库路径", () => {
  const hub = parseImageRef("foehao09/apiforge:latest");
  assert.equal(withTag(hub, "1.0.9"), "foehao09/apiforge:1.0.9");
  const acr = parseImageRef("registry.cn-zhangjiakou.aliyuncs.com/ns/apiforge:latest");
  assert.equal(
    withTag(acr, "1.0.9"),
    "registry.cn-zhangjiakou.aliyuncs.com/ns/apiforge:1.0.9",
  );
  assert.equal(repoPathOf(acr), "registry.cn-zhangjiakou.aliyuncs.com/ns/apiforge");
  assert.equal(repoPathOf(hub), "foehao09/apiforge");
});

test("主源 + 完整镜像备选 + 注册中心前缀备选，按顺序去重", () => {
  const candidates = buildImageCandidates({
    primary: "registry.cn-zhangjiakou.aliyuncs.com/ns/apiforge",
    mirrors: "foehao09/apiforge, docker.m.daocloud.io",
    tag: "1.0.9",
  });
  assert.deepEqual(
    candidates.map((item) => item.image),
    [
      "registry.cn-zhangjiakou.aliyuncs.com/ns/apiforge:1.0.9",
      "foehao09/apiforge:1.0.9",
      "docker.m.daocloud.io/ns/apiforge:1.0.9",
    ],
  );
});

test("没有备选源时只有主源", () => {
  const candidates = buildImageCandidates({
    primary: "foehao09/apiforge:1.0.9",
    tag: "1.0.9",
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].image, "foehao09/apiforge:1.0.9");
});

test("空值与重复项不会产生多余候选", () => {
  const candidates = buildImageCandidates({
    primary: "foehao09/apiforge",
    mirrors: " , foehao09/apiforge ,",
    tag: "1.0.9",
  });
  assert.equal(candidates.length, 1);
  assert.equal(parseImageRef(""), null);
});

const http = require("node:http");

const withServer = async (payload, fn) => {
  const server = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/manifest.json`;
  try {
    return await fn(url);
  } finally {
    server.close();
  }
};

test("配置版本清单后，检测不依赖 Docker Hub", async () => {
  const { VersionService } = require("../src/modules/version/version.service");
  const backup = { ...process.env };
  try {
    await withServer(
      { version: "9.9.9", image: "registry.example.com/ns/apiforge:9.9.9" },
      async (url) => {
        process.env.DOCKER_IMAGE = "registry.example.com/ns/apiforge:latest";
        process.env.VERSION_MANIFEST_URL = url;
        delete process.env.VERSION_LATEST;
        const result = await new VersionService().checkUpdate();
        assert.equal(result.latest, "9.9.9");
        assert.equal(result.hasUpdate, true);
        assert.equal(result.source, "manifest");
        assert.equal(result.image, "registry.example.com/ns/apiforge:9.9.9");
      },
    );
  } finally {
    process.env = backup;
  }
});

test("清单不可用时回退到 VERSION_LATEST", async () => {
  const { VersionService } = require("../src/modules/version/version.service");
  const backup = { ...process.env };
  try {
    process.env.DOCKER_IMAGE = "registry.example.com/ns/apiforge:latest";
    process.env.VERSION_MANIFEST_URL = "http://127.0.0.1:1/manifest.json";
    process.env.VERSION_LATEST = "8.8.8";
    const result = await new VersionService().checkUpdate();
    assert.equal(result.latest, "8.8.8");
    assert.equal(result.source, "env");
    assert.equal(result.image, "registry.example.com/ns/apiforge:8.8.8");
  } finally {
    process.env = backup;
  }
});
