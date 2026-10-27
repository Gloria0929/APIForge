require("ts-node/register");
const { test } = require("node:test");
const assert = require("node:assert/strict");

// 这组用例验证旧的语义化版本逻辑；latest 摘要模式单独验证
process.env.UPDATE_TRACK = "version";
const {
  parseImageRef,
  withTag,
  repoPathOf,
  buildImageCandidates,
  normalizeContainerName,
  registryRepository,
  dataMountSource,
  hostPortOf,
  matchLocalDigest,
  mountTargetOf,
  mergeUpdateBinds,
  demuxDockerLogs,
  buildUpdaterScript,
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

test("容器名去掉 inspect 返回的前导斜杠", () => {
  assert.equal(normalizeContainerName("/apiforge"), "apiforge");
  assert.equal(normalizeContainerName("apiforge"), "apiforge");
  assert.equal(normalizeContainerName(""), "");
});

test("Docker Hub 官方短名补全 library 前缀", () => {
  assert.equal(registryRepository(parseImageRef("redis:7")), "library/redis");
  assert.equal(registryRepository(parseImageRef("foehao09/apiforge")), "foehao09/apiforge");
  assert.equal(
    registryRepository(parseImageRef("crpi-x.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge")),
    "freyax/apiforge",
  );
  assert.equal(registryRepository(null), "");
});

test("从容器挂载中读取实际数据卷，而不是写死 apiforge-data", () => {
  const namedVolume = {
    Mounts: [
      { Type: "volume", Name: "custom-data", Destination: "/app/data" },
      { Type: "bind", Source: "/host/other", Destination: "/other" },
    ],
  };
  assert.equal(dataMountSource(namedVolume), "custom-data");
  assert.equal(
    dataMountSource({ HostConfig: { Binds: ["/host/data:/app/data"] } }),
    "/host/data",
  );
  assert.equal(dataMountSource({}), null);
});

test("读取容器实际映射端口，避免自定义端口更新后丢失", () => {
  assert.equal(
    hostPortOf({ HostConfig: { PortBindings: { "3000/tcp": [{ HostPort: "8080" }] } } }),
    "8080",
  );
  assert.equal(
    hostPortOf({ NetworkSettings: { Ports: { "3000/tcp": [{ HostPort: "9090" }] } } }),
    "9090",
  );
  assert.equal(hostPortOf({}, "3000"), "3000");
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

test("私有仓库用 Bearer token 取 tags（ACR/Harbor 认证流程）", async () => {
  const http = require("node:http");
  const { VersionService } = require("../src/modules/version/version.service");
  const backup = { ...process.env };
  const seen = { basic: null, bearer: null, scope: null };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/v2/") {
      res.statusCode = 401;
      res.setHeader(
        "www-authenticate",
        `Bearer realm="http://127.0.0.1:${server.address().port}/token",service="test-registry"`,
      );
      res.end("{}");
      return;
    }
    if (url.pathname === "/token") {
      seen.basic = req.headers.authorization || null;
      seen.scope = url.searchParams.get("scope");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ token: "tok-abc" }));
      return;
    }
    if (url.pathname === "/v2/ns/apiforge/tags/list") {
      const authorization = req.headers.authorization || "";
      // 没有 Bearer token 时按 Registry V2 规范返回 401 + 认证挑战
      if (authorization !== "Bearer tok-abc") {
        res.statusCode = 401;
        res.setHeader(
          "www-authenticate",
          `Bearer realm="http://127.0.0.1:${server.address().port}/token",service="test-registry"`,
        );
        res.end("{}");
        return;
      }
      seen.bearer = authorization;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ tags: ["1.0.0", "1.0.9", "latest", "nightly"] }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const registry = `127.0.0.1:${server.address().port}`;
  try {
    process.env.DOCKER_IMAGE = `${registry}/ns/apiforge:latest`;
    process.env.DOCKER_REGISTRY_USERNAME = "user";
    process.env.DOCKER_REGISTRY_PASSWORD = "pass";
    delete process.env.VERSION_MANIFEST_URL;
    delete process.env.VERSION_LATEST;
    const result = await new VersionService().checkUpdate();
    assert.equal(result.latest, "1.0.9");
    assert.equal(result.source, "registry");
    assert.equal(result.image, `${registry}/ns/apiforge:1.0.9`);
    assert.equal(seen.scope, "repository:ns/apiforge:pull");
    assert.equal(seen.bearer, "Bearer tok-abc");
    assert.equal(
      seen.basic,
      `Basic ${Buffer.from("user:pass").toString("base64")}`,
    );
  } finally {
    server.close();
    process.env = backup;
  }
});

test("公开仓库无需账号也能匿名换 token 检测版本", async () => {
  const http = require("node:http");
  const { VersionService } = require("../src/modules/version/version.service");
  const backup = { ...process.env };
  const seen = { tokenAuth: "unset" };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/token") {
      seen.tokenAuth = req.headers.authorization || null;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ token: "anon-token" }));
      return;
    }
    if (url.pathname === "/v2/public/apiforge/tags/list") {
      if (req.headers.authorization !== "Bearer anon-token") {
        res.statusCode = 401;
        res.setHeader(
          "www-authenticate",
          `Bearer realm="http://127.0.0.1:${server.address().port}/token",service="public-registry"`,
        );
        res.end("{}");
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ tags: ["1.0.9", "1.0.10"] }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const registry = `127.0.0.1:${server.address().port}`;
  try {
    process.env.DOCKER_IMAGE = `${registry}/public/apiforge:latest`;
    delete process.env.DOCKER_REGISTRY_USERNAME;
    delete process.env.DOCKER_REGISTRY_PASSWORD;
    delete process.env.VERSION_MANIFEST_URL;
    delete process.env.VERSION_LATEST;
    const result = await new VersionService().checkUpdate();
    assert.equal(result.latest, "1.0.10");
    assert.equal(result.source, "registry");
    assert.equal(seen.tokenAuth, null, "公开仓库换 token 不应带 Basic 头");
  } finally {
    server.close();
    process.env = backup;
  }
});

test("主源与备选源取最高版本，镜像地址仍用主源", async () => {
  const http = require("node:http");
  const { VersionService } = require("../src/modules/version/version.service");
  const backup = { ...process.env };

  const serve = async (tags) => {
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url.startsWith("/v2/") && req.url.includes("/tags/list")) {
        res.end(JSON.stringify({ tags }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, registry: `127.0.0.1:${server.address().port}` };
  };

  const primary = await serve(["1.0.0", "1.0.8", "latest"]);
  const mirror = await serve(["1.0.0", "1.0.9"]);
  try {
    process.env.DOCKER_IMAGE = `${primary.registry}/freyax/apiforge:latest`;
    process.env.DOCKER_IMAGE_MIRRORS = `${mirror.registry}/freyax/apiforge`;
    delete process.env.VERSION_MANIFEST_URL;
    delete process.env.VERSION_LATEST;

    const result = await new VersionService().checkUpdate();
    assert.equal(result.latest, "1.0.9", "备选源更新更及时时应采用更高的版本");
    assert.equal(result.source, "registry");
    assert.equal(
      result.image,
      `${primary.registry}/freyax/apiforge:1.0.9`,
      "镜像地址仍指向主源，拉取时再回退到备选源",
    );
  } finally {
    primary.server.close();
    mirror.server.close();
    process.env = backup;
  }
});

test("主源不可用时仍能从备选源发现更新", async () => {
  const http = require("node:http");
  const { VersionService } = require("../src/modules/version/version.service");
  const backup = { ...process.env };
  const mirror = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ tags: ["1.0.10"] }));
  });
  await new Promise((resolve) => mirror.listen(0, "127.0.0.1", resolve));
  try {
    process.env.DOCKER_IMAGE = "127.0.0.1:1/freyax/apiforge:latest"; // 必然连不上
    process.env.DOCKER_IMAGE_MIRRORS = `127.0.0.1:${mirror.address().port}/freyax/apiforge`;
    delete process.env.VERSION_MANIFEST_URL;
    delete process.env.VERSION_LATEST;
    const result = await new VersionService().checkUpdate();
    assert.equal(result.latest, "1.0.10");
    assert.equal(result.image, "127.0.0.1:1/freyax/apiforge:1.0.10");
  } finally {
    mirror.close();
    process.env = backup;
  }
});

// --- 本地镜像摘要匹配（latest 摘要模式的「当前版本」来源） ---
// 背景：本地 docker compose build 的镜像只有 apiforge@sha256:...，是单平台 manifest 摘要，
// 与远端多架构清单摘要不可比。旧实现匹配不到主仓库就退回 repoDigests[0]，导致永久误报有更新。

const ACR = "crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge";

test("本地构建镜像（无配置仓库的 RepoDigest）不参与摘要比较", () => {
  assert.equal(
    matchLocalDigest(["apiforge@sha256:localbuild"], [ACR, "foehao09/apiforge"]),
    null,
  );
});

test("从 ACR 拉取的镜像按仓库路径匹配到摘要", () => {
  assert.equal(
    matchLocalDigest([`${ACR}@sha256:36c62b91`], [ACR, "foehao09/apiforge"]),
    "sha256:36c62b91",
  );
});

test("备选源（Docker Hub）拉取的镜像同样能匹配", () => {
  assert.equal(
    matchLocalDigest(["foehao09/apiforge@sha256:hubpull"], [ACR, "foehao09/apiforge"]),
    "sha256:hubpull",
  );
});

test("多个 RepoDigest 时取匹配项，不依赖顺序", () => {
  assert.equal(
    matchLocalDigest(
      ["apiforge@sha256:localbuild", `${ACR}@sha256:acrdigest`],
      [ACR],
    ),
    "sha256:acrdigest",
  );
});

test("没有配置仓库路径时返回 null", () => {
  assert.equal(matchLocalDigest([`${ACR}@sha256:x`], []), null);
});

test("RepoDigests 为空或格式异常时返回 null", () => {
  assert.equal(matchLocalDigest([], [ACR]), null);
  assert.equal(matchLocalDigest([ACR], [ACR]), null);
  assert.equal(matchLocalDigest(undefined, [ACR]), null);
});

// --- 更新助手的挂载合并（Duplicate mount point 曾导致更新静默失败） ---

test("带 :rw 后缀的 Binds 也能识别出容器内路径", () => {
  assert.equal(mountTargetOf("apiforge-data:/app/data:rw"), "/app/data");
  assert.equal(mountTargetOf("/var/run/docker.sock:/var/run/docker.sock:rw"), "/var/run/docker.sock");
  assert.equal(mountTargetOf("apiforge-data:/app/data"), "/app/data");
  assert.equal(mountTargetOf("apiforge-data:/app/data:ro,z"), "/app/data");
});

test("已有 :rw 挂载时不再追加同路径，避免 Duplicate mount point", () => {
  const merged = mergeUpdateBinds(
    ["/var/run/docker.sock:/var/run/docker.sock:rw", "apiforge-data:/app/data:rw"],
    "apiforge-data",
  );
  assert.deepEqual(merged, [
    "/var/run/docker.sock:/var/run/docker.sock:rw",
    "apiforge-data:/app/data:rw",
  ]);
  const targets = merged.map((item) => mountTargetOf(item));
  assert.equal(new Set(targets).size, targets.length);
});

test("缺少必需挂载时补上数据卷与 socket", () => {
  assert.deepEqual(mergeUpdateBinds([], "apiforge-data"), [
    "apiforge-data:/app/data",
    "/var/run/docker.sock:/var/run/docker.sock",
  ]);
});

test("原容器用宿主机路径挂载 /app/data 时保持不变", () => {
  const merged = mergeUpdateBinds(["/srv/apiforge:/app/data:rw"], "apiforge-data");
  assert.ok(merged.includes("/srv/apiforge:/app/data:rw"));
  assert.equal(merged.filter((item) => mountTargetOf(item) === "/app/data").length, 1);
});

test("解析多路复用日志帧", () => {
  const frame = (text) => {
    const body = Buffer.from(text, "utf8");
    const head = Buffer.alloc(8);
    head[0] = 1;
    head.writeUInt32BE(body.length, 4);
    return Buffer.concat([head, body]);
  };
  const buf = Buffer.concat([frame("line-1\n"), frame("line-2\n")]);
  assert.equal(demuxDockerLogs(buf), "line-1\nline-2\n");
});

test("非多路复用的裸文本原样返回", () => {
  assert.equal(demuxDockerLogs(Buffer.from("plain log", "utf8")), "plain log");
  assert.equal(demuxDockerLogs(Buffer.alloc(0)), "");
});

// --- 更新助手脚本（node -e 单行执行）---

test("助手脚本压成单行后仍是合法 JS", () => {
  const script = buildUpdaterScript();
  assert.ok(script.length > 500);
  assert.equal(script.includes("\n"), false, "必须是单行，node -e 才能正确执行");
  assert.doesNotThrow(() => new Function(script));
});

test("助手脚本不含 // 行注释（压成单行后会注释掉后续代码）", () => {
  assert.equal(buildUpdaterScript().includes("//"), false);
});

test("助手脚本包含失败日志落盘与回滚逻辑", () => {
  const script = buildUpdaterScript();
  assert.ok(script.includes("/app/data/update.log"));
  assert.ok(script.includes("rolled back"));
  assert.ok(script.includes("UPDATER_IMAGE"));
});
