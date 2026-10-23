require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildStressReportSummary, normalizeStressReportSummary } = require('../src/modules/ai/stress-report-summary');
const { AiService } = require('../src/modules/ai/ai.service');
const { AiController } = require('../src/modules/ai/ai.controller');
const { TestService } = require('../src/modules/test/test.service');
const report = () => ({
  id: 'report', projectId: 'p', name: '固定轮次压测', environment: '本地环境',
  summary: { stressTest: true, virtualUsers: 20, executionMode: 'requests', totalRequests: 100, completedRuns: 60, total: 2000, passed: 1940, failed: 50, error: 10, passRate: 97, duration: 32000, rampUpSeconds: 5, stepDelayMs: 100, timeoutMs: 30000, stopOnFailRate: 1, stopReason: 'failure_rate', scenarioVariables: { token: 'must-not-be-sent' } },
  performance: { throughput: 62.5, avgResponseTime: 130, p95ResponseTime: 700, p99ResponseTime: 1800, maxResponseTime: 2500 },
  details: [
    { name: '登录', stepName: '登录', status: 'FAILED', requests: 1000, failures: 50, requestsPerSecond: 31.2, responseTime: 100, p95ResponseTime: 500, request: { method: 'POST', headers: { Authorization: 'Bearer must-not-be-sent' } } },
    { name: '查询', stepName: '查询', status: 'FAILED', requests: 1000, failures: 10, requestsPerSecond: 31.3, responseTime: 160, p95ResponseTime: 900, request: { method: 'GET' } },
    { name: '登录', stepName: '登录', status: 'FAILED', requests: 50, error: 'FAILED: HTTP 500（出现 50 次）', request: { method: 'POST' } },
    { name: '查询', stepName: '查询', status: 'ERROR', requests: 10, error: 'timeout（出现 10 次）', request: { method: 'GET' } },
  ],
  charts: { trend: [{ time: '2026-10-23T00:00:01Z', rps: 40, failures: 1, avgResponseTime: 110 }, { time: '2026-10-23T00:00:02Z', rps: 70, failures: 2, avgResponseTime: 130 }] },
});

test('pressure summaries use weighted request failures without counting aggregate and error rows twice', () => {
  const result = buildStressReportSummary(report());
  assert.equal(result.stress_analysis.metrics.failureRate, 3);
  assert.equal(result.top_failures[0].count, 50);
  assert.equal(result.top_failures[0].requests, 1000);
  assert.equal(result.top_failures[0].failureRate, 5);
  assert.equal(result.top_failures[0].reasons.length, 1);
  assert.equal(result.top_failures.reduce((sum, item) => sum + item.count, 0), 60);
  assert.equal(result.slowest_apis[0].name, 'GET 查询');
  assert.equal(result.stress_analysis.execution.completion, 'PARTIAL');
  assert.equal(result.stress_analysis.execution.stopReasonLabel, '达到失败率阈值');
  assert.equal(result.risk_assessment.level, 'HIGH');
  assert(!JSON.stringify(result).includes('must-not-be-sent'));
});

test('models cannot rewrite factual metrics, erase required limitations or downgrade known pressure risk', () => {
  const facts = buildStressReportSummary(report());
  const result = normalizeStressReportSummary({ risk_assessment: { level: 'LOW' }, top_failures: [{ count: 0 }], stress_analysis: { metrics: { failureRate: 0 }, execution: { completion: 'COMPLETE' }, limitations: [], findings: ['应检查登录步骤的 HTTP 500'] } }, facts);
  assert.equal(result.risk_assessment.level, 'HIGH');
  assert.equal(result.stress_analysis.metrics.failureRate, 3);
  assert.equal(result.stress_analysis.execution.completion, 'PARTIAL');
  assert.equal(result.top_failures[0].count, 50);
  assert(result.stress_analysis.limitations.some(text => text.includes('SLA')));
  assert(result.stress_analysis.limitations.some(text => text.includes('提前停止')));
  assert.deepEqual(result.stress_analysis.findings, ['应检查登录步骤的 HTTP 500']);
});

test('manual, deadline and incomplete fixed-round results are partial; missing samples are not healthy results', () => {
  for (const reason of ['manual', 'time_limit', 'completed']) {
    const value = report(); value.summary.stopReason = reason;
    assert.equal(buildStressReportSummary(value).stress_analysis.execution.completion, 'PARTIAL');
  }
  const empty = report(); empty.summary = { stressTest: true, total: 0, failed: 0, error: 0, stopReason: 'manual' }; empty.performance = {};
  const result = buildStressReportSummary(empty);
  assert.equal(result.stress_analysis.execution.completion, 'NO_DATA');
  assert.equal(result.stress_analysis.metrics.p95ResponseTime, null);
  assert.notEqual(result.risk_assessment.level, 'LOW');
  assert(result.stress_analysis.limitations.some(text => text.includes('没有有效请求样本')));
  const legacy = buildStressReportSummary({ summary: JSON.stringify({ stressTest: true, total: 10, failed: 0, error: 0 }), details: '[]' });
  assert.equal(legacy.stress_analysis.execution.completion, 'UNKNOWN');
});

test('small failure rates remain visible even if the report rounds pass rate to 100 percent', () => {
  const value = report();
  Object.assign(value.summary, { total: 10000000, failed: 1, error: 0, passRate: 100, stopReason: 'completed', completedRuns: 100 });
  const result = buildStressReportSummary(value);
  assert(result.stress_analysis.metrics.failureRate > 0);
  assert.equal(result.risk_assessment.level, 'MEDIUM');
});

test('malformed legacy objects and null detail entries are treated as missing evidence', () => {
  for (const value of ['null', '[]', 'invalid-json', null]) {
    const result = buildStressReportSummary({ summary: value, performance: value, charts: value, details: [null, false, [], 0] });
    assert.equal(result.stress_analysis.execution.completion, 'NO_DATA');
    assert.deepEqual(result.top_failures, []);
  }
});

test('uniform trend sampling preserves endpoints and global peak without sending the full series', () => {
  const value = report();
  value.charts.trend = Array.from({ length: 300 }, (_, index) => ({ time: new Date(index * 1000).toISOString(), rps: index === 173 ? 999 : index, failures: 0, avgResponseTime: index }));
  const trend = buildStressReportSummary(value).stress_analysis.trend;
  assert.equal(trend.sampleCount, 300);
  assert.equal(trend.points.length, 60);
  assert.equal(trend.points[0].rps, 0);
  assert.equal(trend.points.at(-1).rps, 299);
  assert.equal(trend.peakRps, 999);
});

test('saved report analysis reads authoritative project-scoped data and sends pressure-specific evidence to the model', async () => {
  const value = report();
  const stored = { ...value, summary: JSON.stringify(value.summary), performance: JSON.stringify(value.performance), details: JSON.stringify(value.details), charts: JSON.stringify(value.charts) };
  let query, payload;
  const service = new AiService({}, {}, {}, {}, { findOne: async options => { query = options; return stored; } });
  service.ensureFeatureEnabled = async () => {};
  service.logUsage = async () => {};
  service.callFeatureJson = async (_project, feature, input) => {
    assert.equal(feature, 'summarize_report'); payload = input;
    return { summary: { short: '失败阈值触发，建议优先排查登录接口' }, risk_assessment: { level: 'LOW' }, __usage: { total_tokens: 100 } };
  };
  const result = await service.summarizeReport('p', { summary: { total: 999999 } }, 'report');
  assert.deepEqual(query.where, { id: 'report', projectId: 'p' });
  assert.equal(payload.report.reportType, 'stress');
  assert.equal(payload.report.metrics.totalRequests, 2000);
  assert.equal(payload.report.load.virtualUsers, 20);
  assert.equal(payload.report.trend.peakRps, 70);
  assert(!JSON.stringify(payload).includes('must-not-be-sent'));
  assert.equal(result.risk_assessment.level, 'HIGH');
  assert.equal(result.analysis_type, 'stress');
  assert.equal(result.schema_version, 2);
  const prompt = service.getFeatureSystemPrompt('summarize_report');
  assert.match(prompt, /正常结束也不代表性能达标/);
  assert.match(prompt, /不能用四舍五入后的通过率代替/);
});

test('report ownership is checked before model calls; summaries are persisted under the same project', async () => {
  let modelCalled = false, update;
  const service = new AiService({}, {}, {}, {}, { findOne: async () => null, update: async (...args) => { update = args; return { affected: 1 }; } });
  service.ensureFeatureEnabled = async () => {};
  service.logUsage = async () => {};
  service.callFeatureJson = async () => { modelCalled = true; };
  await assert.rejects(service.summarizeReport('wrong', report(), 'report'), /不属于当前项目/);
  assert.equal(modelCalled, false);
  await service.saveReportAiSummary('report', { analysis_type: 'stress' }, 'p');
  assert.deepEqual(update[0], { id: 'report', projectId: 'p' });
  assert.equal(JSON.parse(update[1].aiSummary).analysis_type, 'stress');
  const calls = [];
  const controller = new AiController({ summarizeReport: async (...args) => { calls.push(args); return { ok: true }; }, saveReportAiSummary: async (...args) => calls.push(args) }, {});
  await controller.summarizeReport({ projectId: 'p', reportId: 'report' });
  assert.deepEqual(calls[0], ['p', undefined, 'report']);
  assert.deepEqual(calls[1], ['report', { ok: true }, 'p']);
});

test('functional regression reports retain their existing summary contract and accept English risk levels', async () => {
  const service = new AiService({});
  service.ensureFeatureEnabled = async () => {};
  service.logUsage = async () => {};
  service.callFeatureJson = async (_project, _feature, input) => {
    assert.equal(input.report.reportType, undefined);
    return { risk_assessment: { level: 'HIGH', description: '需要核对失败断言' } };
  };
  const result = await service.summarizeReport('p', { summary: { total: 2, passed: 1, failed: 1, error: 0, passRate: 50 }, details: [], performance: {} });
  assert.equal(result.analysis_type, undefined);
  assert.equal(result.risk_assessment.level, 'HIGH');
  assert(result.summary.detailed.includes('测试用例'));
});

test('HTML exports preserve pressure scope and limitations, escape evidence and suppress legacy release claims', () => {
  const value = report();
  value.aiSummary = buildStressReportSummary(value);
  const service = new TestService();
  const html = service.generateHtmlReport(value);
  assert.match(html, /AI 压测分析/);
  assert.match(html, /部分结果/);
  assert.match(html, /POST 登录：50 \/ 1000 次失败/);
  assert.match(html, /SLA/);
  value.aiSummary = { summary: { short: 'OLD_RELEASE_CLAIM' } };
  const legacy = service.generateHtmlReport(value);
  assert.doesNotMatch(legacy, /OLD_RELEASE_CLAIM/);
  assert.match(legacy, /重新生成压测分析/);
  value.details[0].name = value.details[0].stepName = '<script>alert(1)</script>';
  value.aiSummary = buildStressReportSummary(value);
  const escaped = service.generateHtmlReport(value);
  assert(!escaped.includes('<script>alert(1)</script>'));
  assert(escaped.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});
