require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StressRunService } = require('../src/modules/test/stress-run.service');
const { TestService } = require('../src/modules/test/test.service');
const { LocustService } = require('../src/modules/test/locust.service');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('active stress runs reject duplicates, report interval throughput and preserve partial results on stop', async () => {
  const service = new StressRunService();
  const run = service.create({ projectId: 'p', scenarioId: 's' });
  let release, hooks;
  const task = service.execute(run, async value => {
    hooks = value;
    value.onProgress({ total: 100, failed: 2, runs: 10, elapsedSeconds: 10, users: 5 });
    value.onProgress({ total: 100, failed: 2, runs: 10, elapsedSeconds: 20, users: 5 });
    await new Promise(resolve => { release = resolve; });
    return { reportId: 'partial', summary: { total: 100, failed: 2, completedRuns: 10 }, performance: { p95ResponseTime: 250 } };
  });
  assert.equal(service.active().id, run.id);
  assert.throws(() => service.create(), /已有压力测试/);
  assert.equal(run.progress.rps, 0, 'no recent requests means zero current throughput');
  assert.equal(run.timeline[0].rps, 10);
  assert.equal(service.stop(run.id).status, 'stopping');
  assert.equal(hooks.signal.aborted, true);
  service.stop(run.id);
  release();
  await task;
  assert.equal(run.status, 'stopped');
  assert.equal(run.reportId, 'partial');
  assert.equal(run.stopReason, 'manual');
  assert.equal(service.active(), null);
  assert.equal(service.stop(run.id).status, 'stopped');
});

test('engine failure releases the active slot and zero final counts do not retain stale values', async () => {
  const service = new StressRunService();
  const failed = service.create();
  await service.execute(failed, async () => { throw new Error('engine unavailable'); });
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /engine unavailable/);
  const run = service.create();
  await service.execute(run, async hooks => {
    hooks.onProgress({ total: 8, failed: 0, runs: 2, elapsedSeconds: 1 });
    return { summary: { total: 0, completedRuns: 0, stopReason: 'failure_rate' } };
  });
  assert.equal(run.status, 'stopped');
  assert.equal(run.progress.total, 0);
  assert.equal(run.progress.runs, 0);
});

test('scenario load tests validate configuration, keep project boundaries and persist reusable settings', async () => {
  let plan, runOptions, saved;
  const scenario = { id: 's', projectId: 'p', name: 'Checkout', steps: [{ testCaseId: 'case', name: 'Read' }], variables: {} };
  const environment = { id: 'env', projectId: 'p', name: 'Local fixture', baseUrl: 'http://127.0.0.1:9000', variables: [] };
  const metrics = { total: 12, failures: 0, failed: 0, errors: 0, durationMs: 2000, startedAt: new Date(), endedAt: new Date(), endpoints: [], failuresList: [], timeline: [], completedRuns: 12, stopReason: 'completed' };
  const caseRow = { id: 'case', projectId: 'p', name: 'Read', request: { method: 'GET', url: '/users' } };
  const service = new TestService({ find: async () => [caseRow] }, { save: async report => { saved = report; return { id: 'report', ...report }; } }, {}, { findOne: async () => environment }, {}, {}, { run: async (value, options) => { plan = value; runOptions = options; return metrics; } });
  service.getScenario = async () => scenario;
  for (const options of [{ executionMode: 'other' }, { virtualUsers: 1.2 }, { durationSeconds: 10, rampUpSeconds: 10 }, { timeoutMs: -1 }, { stopOnFailRate: NaN }]) {
    await assert.rejects(service.executeScenarioStressTest('s', 'env', 'p', options));
  }
  const controller = new AbortController();
  await service.executeScenarioStressTest('s', 'env', 'p', { executionMode: 'requests', totalRequests: 12, virtualUsers: 3, timeoutMs: 5000, stopOnFailRate: 0 }, { signal: controller.signal });
  assert.equal(plan.stopOnFailRate, undefined);
  assert.equal(plan.timeoutMs, 5000);
  assert.equal(runOptions.signal, controller.signal);
  const summary = JSON.parse(saved.summary);
  assert.equal(summary.scenarioId, 's');
  assert.equal(summary.environmentId, 'env');
  assert.equal(summary.totalRequests, 12);
  assert.equal(summary.completedRuns, 12);
  caseRow.projectId = 'another-project';
  await assert.rejects(service.executeScenarioStressTest('s', 'env', 'p', {}), /测试用例/);
});

test('Locust history uses average response time rather than the median and retains fractional throughput', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stress-csv-test-'));
  try {
    const prefix = path.join(dir, 'stats');
    await fs.writeFile(prefix + '_stats.csv', 'Type,Name,Request Count,Failure Count,Average Response Time,Median Response Time,Requests/s\n,Aggregated,10,0,240,50,1.23\n');
    await fs.writeFile(prefix + '_stats_history.csv', 'Timestamp,Name,Total Request Count,Total Failure Count,50%,Total Average Response Time\n1000,Aggregated,0,0,20,80\n1001,Aggregated,10,0,50,240\n');
    const metrics = await new LocustService().readMetrics(prefix, new Date(0), new Date(2000));
    assert.equal(metrics.throughput, 1.23);
    assert.equal(metrics.timeline[0].avgResponseTime, 240);
    assert.equal(metrics.timeline[0].rps, 10);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
