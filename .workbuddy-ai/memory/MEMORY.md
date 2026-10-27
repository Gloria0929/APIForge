# APIForge 项目约定

## 前端

- Vue 3 + TS + Element Plus + Pinia + Vite，源码在 `frontend/src`，后端在 `src/`（NestJS）。
- **全局样式陷阱**：`frontend/src/style.css` 对 `.el-button` 有强覆盖——
  `min-height: 36px`、`padding-inline: 14px !important`、`border-radius: var(--radius-md) !important`，
  以及 `.el-button:not(.el-button--primary):not(...):not(...):not(...)`（权重 0,5,0）
  统一设置底色/边框/文字色与 hover 态。
  因此**在组件内用 class 定制 `el-button` 尺寸/配色基本无效**（实测 computed height 仍 36px）。
  需要非标准外观的按钮时，用原生 `<button>` + 自定义 class，或直接提高权重到 (0,6,0) 以上。
- 表格行内操作若为 `el-button link`，不要额外加 `aria-label`：它会覆盖可见文本成为可访问名，
  导致按名称定位的 Playwright 用例失败。
- 设计变量：`--primary-color`(#3b82f6)/`--primary-rgb`、`--border-color`、
  `--card-background`(#0f0f0f)、`--card-background-strong`(#151515)、`--text-secondary`(#a3a3a3)、
  `--font-mono`(JetBrains Mono)、`--transition-fast/normal`；亮暗主题通过
  `document.documentElement.dataset.theme` 切换。
- 提示统一走 `utils/message.ts` 的 `message.*`（ElNotification，同时只保留一条）与
  `confirmAction()`（ElMessageBox 封装）。
- 列表页工具栏按钮不要直接写 `:disabled="list.length === 0"`：首屏数据未到时 `list` 为空，
  按钮会先渲染成禁用态再变色。正确写法是 `!loading && list.length === 0`，
  且 **`loading` 的初值必须是 `ref(true)`**——只在 `onMounted` 里置位已经晚了，
  那时首次渲染（禁用态）已经发生。

## 测试

- `tests/*.cjs` 为 Node 脚本，UI 用例用 Playwright（`channel: 'chrome'`）+ 路由 mock，
  需从仓库根目录运行（如 `node tests/stress-ui.cjs`），会自动起 vite。
- 压测报告的 `summary` 里，与当次执行模式无关的字段会以 `0` 落库
  （`durationSeconds: x || 0`、`totalRequests: x || 0`），前端读取时必须把 0 视为"未设置"。

## AI 模块约定

- **多模型按功能路由**：`src/modules/ai/feature-routing.ts` 是唯一的路由规则来源（纯函数，有单测）。
  优先级：`ProjectAIConfig.featureProviders[feature]` → 默认模型 `providerId`（须承担该功能）
  → 任一承担该功能的启用模型 → 报错。
- 任何 AI 调用必须经 `getProjectRuntime(projectId, feature)` 解析模型，禁止直接读 `config.providerId`，
  否则会绕过多模型路由。
- 调用侧 feature 名（`semantic_parse` 等）与配置功能名（`semanticParse` 等）是两套标识，
  映射表为 `USAGE_FEATURE_TO_CONFIG`；新增 AI 功能时必须同时补映射，单测会校验。
- 功能可用性（`getConfigs().features`）取所有启用模型的并集，不要改回单 provider。
- **辅助功能没有独立开关**：`aiEnabled` 由「是否存在已启用的模型」派生
  （`getConfigs`/`getFeatureRouting` 返回值、`requireEnabledConfig` 判定都如此）。
  `ProjectAIConfig.aiEnabled` 字段仅为兼容历史数据保留，不要再用它做门禁；
  想停用 AI 就让模型 `isActive=false`。
- 模型服务配置页只保留一个连接检测入口（提供商列表 header 的「测试连接」= `POST /api/ai/providers/test-all`），
  不要重新引入只测默认模型的按钮。默认模型是 `@change` 自动保存，没有「保存设置」。
- `tests/regressions.test.cjs` 对 AI 报错文案有断言（如含「未开启」），改文案前先看该文件。

## 测试执行约定

- **所有批量/套件执行入口都要先解析一次环境登录变量**：
  `resolveEnvironmentLoginVariables(undefined, environmentId, {})`，再把结果作为
  `extraVariables` 传给每个用例。`executeTestSuite`（一键执行）曾漏掉这一步，
  导致带 `{{token}}` 的用例整批报「未解析的变量」。单条执行的 `useEnvironmentLogin=true`
  只是给单用例用的兜底，批量入口要自己解析。
- **压测与普通执行必须共用同一套请求解析**。`executeTestCase`（场景/单用例）会做
  `fillMissingPathParams`（用接口文档路径参数示例值补 `{{kbId}}`）与环境登录用例预执行
  （注入 `{{token}}`）；`executeScenarioStressTest` 曾经漏掉这两步，导致压测把
  `{{kbId}}`/`{{token}}` 原样发给 Locust，整轮 100% 失败。新增执行入口时务必对齐。
- 压测步骤在 Node 侧解析后交给 Locust，`plan.variables` 只用于 runner 运行时渲染
  （前序步骤 extractRules 提取的值），因此不要在 Node 侧对"未解析变量"直接报错，
  否则会误伤跨步骤变量。
- 压测报告 `details[].request` 是用例定义的**原始请求配置**（保留 `{{base_url}}`/`{{token}}` 等占位符），
  实际请求地址另存 `details[].resolvedUrl`。Locust 统计只有步骤名（Name），
  这些字段都由 `saveStressReport` 的 `steps` 参数映射，不要直接拿 `item.name` 当地址。

## 发布与更新

- 官方镜像默认「阿里云 ACR 主源 + Docker Hub 备选」，两者都由 Dockerfile 的
  `ENV DOCKER_IMAGE` / `ENV DOCKER_IMAGE_MIRRORS` 内置，拉哪个仓库的镜像就从哪检查更新。
- `checkUpdate()` 会查询主源与所有备选源并取较高版本，`image` 始终返回主源地址。
- `scripts/docker-push.sh` 的 Docker Hub 用户名可选，`REGISTRY=` 可单独使用；
  两个目标都推时，`REGISTRY` 优先作为镜像内的 `DOCKER_IMAGE`。
- **`REGISTRY` 必须写到「registry 主机 + 命名空间」为止**（如
  `crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax`）。
  只写命名空间（`freyax` 或 `freyax/apiforge`）会被 Docker 解析成 Docker Hub，
  报 `insufficient_scope: authorization failed`；脚本已加参数防呆拦截。
- 构建前先跑 `scripts/check-registry-push.js` 探 push 权限，避免多架构构建跑完才在 push 阶段失败。
- 公开仓库的 tags 检测走匿名 Bearer token；私有仓库需配
  `DOCKER_REGISTRY_USERNAME/PASSWORD`，或直接用 `VERSION_MANIFEST_URL`。
- **`docker-compose.yml` 的数据卷必须写 `name: apiforge-data`**。不写 `name` 时 compose 会按
  项目名（目录名）加前缀生成 `apiforge_apiforge-data`，与文档/`DOCKER_DATA_VOLUME` 不一致；
  换目录名或首次用 compose 时会挂到新的空卷，应用随即初始化空库，表现为「数据丢失」。
  改完用 `docker compose config` 确认解析结果是 `apiforge-data`。
- 本地开发（`npm run dev`）与镜像内统一走 ACR：`.env` 的 `DOCKER_IMAGE` 写 ACR 全路径。
  ACR 仓库 `freyax/apiforge` 公开可匿名读，检测不需要账号密码。
- `fetchLocalDigest()` 只认「配置仓库路径（主源 + 备选源）」下的 RepoDigest，匹配不到返回 `null`
  并回退版本号比较。**不要退回 `repoDigests[0]`**：本地构建的 `apiforge@sha256:...` 是单平台
  manifest 摘要，与远端多架构清单摘要不可比，会让 `/api/version/check` 永久误报有更新。
- **更新助手脚本（`buildUpdaterScript()`）会被压成单行执行，里面绝不能写 `//` 注释**，
  否则会把同行后续代码整行注释掉，脚本变非法 JS、助手秒崩。单测已用 `new Function()` 兜底。
- Binds 判重必须按容器内路径（`mountTargetOf` / `mergeUpdateBinds`），不能 `endsWith(':/app/data')`——
  原容器 Binds 带 `:rw`，会漏判并追加重复挂载，Docker 报 `Duplicate mount point`。
- 助手重建容器要带上原容器 `Labels`（否则 compose 报名字冲突），且**不要删旧镜像**
  （旧容器 `Config.Image` 常是本地标签 `apiforge`，删了会把本地构建一起干掉）。
- 助手失败排查：`docker logs apiforge-updater`、`<数据卷>/update.log`。
- **文档与截图**：`docs/README.md` 与 `docs/image/` 由 Dockerfile 构建时 COPY 进镜像，
  站内 `/manual` 直接读它们；改文档必须重新构建镜像才生效。截图规范：1440x900、
  deviceScaleFactor 2、浅色主题（`localStorage['apiforge:theme']='light'`）。
  截图前务必脱敏：用例详情页展示的是 `lastRun.request`（变量已解析），
  `test_case.lastRun` 与 `test_report.details` 里的明文密码要替换掉。
- `POST /api/auth/login` 的字段是 `account`（不是 `username`），传错返回 401。
- **`.gitignore` 里不要出现裸目录名 `scripts`**：会把整个 `scripts/` 忽略掉，新增脚本静默提交不上
  （已跟踪的 `docker-push.sh` 不受影响，更容易漏掉）。判断是否有文件被忽略：
  `git status --ignored --short`。新增文件后确认 `git status` 里没有 `??` 残留。
