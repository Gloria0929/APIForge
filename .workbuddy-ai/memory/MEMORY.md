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
- `tests/regressions.test.cjs` 对 AI 报错文案有断言（如含「未开启」），改文案前先看该文件。

## 测试执行约定

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
