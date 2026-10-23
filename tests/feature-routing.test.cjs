require("ts-node/register");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  AI_FEATURE_KEYS,
  USAGE_FEATURE_TO_CONFIG,
  mergeAvailableFeatures,
  normalizeFeatureProviders,
  providerServesFeature,
  resolveFeatureRoute,
} = require("../src/modules/ai/feature-routing");

const flags = (...keys) => Object.fromEntries(AI_FEATURE_KEYS.map((key) => [key, keys.includes(key)]));

const semanticModel = { id: 1, name: "语义模型", model: "gemini-2.5-flash", isActive: true, features: flags("semanticParse") };
const summaryModel = { id: 2, name: "总结模型", model: "gpt-4o-mini", isActive: true, features: flags("reportSummary", "errorAnalysis") };

test("不同功能路由到各自勾选的模型", () => {
  const providers = [summaryModel, semanticModel];
  const config = { providerId: 1 };

  const semantic = resolveFeatureRoute(providers, config, "semanticParse");
  assert.equal(semantic.provider.id, 1);
  assert.equal(semantic.source, "default");

  const summary = resolveFeatureRoute(providers, config, "reportSummary");
  assert.equal(summary.provider.id, 2, "默认模型不承担该功能时必须换用承担它的模型");
  assert.equal(summary.source, "auto");
});

test("没有任何模型承担该功能时返回 none，而不是回落到默认模型", () => {
  const route = resolveFeatureRoute([semanticModel, summaryModel], { providerId: 1 }, "testGeneration");
  assert.equal(route.provider, null);
  assert.equal(route.source, "none");
  assert.deepEqual(route.candidates, []);
});

test("显式指定优先于默认模型", () => {
  const a = { ...semanticModel, id: 3, features: flags("semanticParse") };
  const b = { ...semanticModel, id: 4, features: flags("semanticParse") };
  const route = resolveFeatureRoute([a, b], { providerId: 3, featureProviders: { semanticParse: 4 } }, "semanticParse");
  assert.equal(route.provider.id, 4);
  assert.equal(route.source, "explicit");
  assert.equal(route.staleProviderId, null);
});

test("指定的模型已停用或不再承担该功能时自动改选并标记 stale", () => {
  const a = { ...semanticModel, id: 3 };
  const disabled = { ...semanticModel, id: 4, isActive: false };
  const route = resolveFeatureRoute([a, disabled], { featureProviders: { semanticParse: 4 } }, "semanticParse");
  assert.equal(route.provider.id, 3);
  assert.equal(route.source, "auto");
  assert.equal(route.staleProviderId, 4);
});

test("停用的模型不参与路由", () => {
  const disabled = { ...summaryModel, id: 9, isActive: false };
  const route = resolveFeatureRoute([disabled], null, "reportSummary");
  assert.equal(route.provider, null);
  assert.equal(route.source, "none");
});

test("老数据未配置功能时回落到项目级开关", () => {
  const legacy = { id: 7, name: "旧模型", isActive: true, features: null };
  assert.equal(providerServesFeature(legacy, { features: { semanticParse: true } }, "semanticParse"), true);
  assert.equal(providerServesFeature(legacy, { features: { semanticParse: true } }, "reportSummary"), false);
  const route = resolveFeatureRoute([legacy], { features: { semanticParse: true } }, "semanticParse");
  assert.equal(route.provider.id, 7);
});

test("项目功能可用性取所有启用模型的并集", () => {
  const merged = mergeAvailableFeatures([semanticModel, summaryModel], { features: {} });
  assert.equal(merged.semanticParse, true);
  assert.equal(merged.reportSummary, true);
  assert.equal(merged.errorAnalysis, true);
  assert.equal(merged.testGeneration, false);
});

test("所有模型都没有功能配置时并集回落到项目开关", () => {
  const merged = mergeAvailableFeatures([{ id: 1, isActive: true, features: null }], { features: { testGeneration: true } });
  assert.equal(merged.testGeneration, true);
});

test("功能绑定保存前清洗非法 id", () => {
  assert.equal(normalizeFeatureProviders(null), null);
  assert.equal(normalizeFeatureProviders({ semanticParse: 0, reportSummary: "abc" }), null);
  assert.deepEqual(normalizeFeatureProviders({ semanticParse: 3, reportSummary: -1, unknown: 5 }), { semanticParse: 3 });
});

test("每个调用侧功能都有对应的可配置功能", () => {
  const usageFeatures = [
    "generate_scenario",
    "semantic_parse",
    "generate_tests",
    "generate_assertions",
    "analyze_error",
    "summarize_report",
  ];
  for (const usage of usageFeatures) {
    assert.ok(AI_FEATURE_KEYS.includes(USAGE_FEATURE_TO_CONFIG[usage]), `${usage} 缺少功能映射`);
  }
});
