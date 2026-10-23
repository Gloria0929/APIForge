require('ts-node/register');
const { chromium } = require('playwright');
const { buildStressReportSummary, normalizeStressReportSummary } = require('../src/modules/ai/stress-report-summary');
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
(async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const base = process.env.STRESS_UI_BASE_URL || `http://127.0.0.1:${port}`;
  const vite = process.env.STRESS_UI_BASE_URL ? null : spawn(process.execPath, [path.resolve('frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port)], { cwd: path.resolve('frontend'), stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('apiforge:auth', JSON.stringify({ username: 'summary-check', token: 'mock-only' })));
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    await context.route('https://fonts.gstatic.com/**', route => route.abort());
    const report = {
      id: 'pressure', name: '登录与查询 · 固定轮次压测', environment: '本地集成环境', createdAt: '2026-10-23T08:00:00Z',
      summary: { stressTest: true, total: 1000, passed: 975, failed: 20, error: 5, passRate: 98, duration: 32000, virtualUsers: 20, executionMode: 'requests', totalRequests: 100, completedRuns: 60, rampUpSeconds: 5, stopOnFailRate: 0, stopReason: 'manual' },
      performance: { throughput: 31.25, avgResponseTime: 130, p95ResponseTime: 650, p99ResponseTime: 1800, minResponseTime: 20, maxResponseTime: 2400 },
      details: [{ name: '登录', stepName: '登录', status: 'FAILED', requests: 600, failures: 25, responseTime: 160, p95ResponseTime: 780, requestsPerSecond: 18.75, request: { method: 'POST', url: '/login' } }, { name: '查询', stepName: '查询', status: 'PASSED', requests: 400, failures: 0, responseTime: 85, p95ResponseTime: 220, requestsPerSecond: 12.5, request: { method: 'GET', url: '/profile' } }, { name: '登录', stepName: '登录', status: 'ERROR', requests: 25, responseTime: 0, error: 'timeout（出现 25 次）', request: { method: 'POST' } }],
      charts: { trend: [{ time: '2026-10-23T08:00:01Z', rps: 18.5, avgResponseTime: 80, failures: 0 }, { time: '2026-10-23T08:00:02Z', rps: 35, avgResponseTime: 130, failures: 1 }] },
      aiSummary: { summary: { short: 'OLD_RELEASE_CLAIM', detailed: '整体回归稳定，可按计划发布。' }, risk_assessment: { level: 'LOW', description: '旧版规则' } },
    };
    const functional = { ...report, id: 'functional', name: '普通功能回归', summary: { total: 2, passed: 2, failed: 0, error: 0, passRate: 100, duration: 200 }, details: [], charts: {}, aiSummary: null };
    let requests = 0;
    let failModel = false;
    let enabled = true;
    const errors = [];
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await context.route(`${base}/api/**`, async route => {
      const name = new URL(route.request().url()).pathname;
      let data = [];
      if (name === '/api/projects') data = [{ id: 'p', name: '报告分析验证' }];
      else if (name === '/api/version/check') data = { hasUpdate: false };
      else if (name === '/api/ai/configs') data = [{ aiEnabled: enabled, providerId: 1, features: { reportSummary: true } }];
      else if (['/api/ai/analysis-jobs/active', '/api/tests/stress-runs/active'].includes(name)) data = null;
      else if (name === '/api/tests/reports/pressure') data = report;
      else if (name === '/api/tests/reports/functional') data = functional;
      else if (name === '/api/ai/summarize-report') {
        requests++;
        const body = route.request().postDataJSON();
        assert.equal(body.projectId, 'p');
        assert.equal(body.report, undefined, 'saved reports should be loaded on the server, not sent from the page');
        if (failModel) return route.fulfill({ status: 400, json: { message: '模型暂不可用' } });
        if (body.reportId === 'pressure') {
          report.aiSummary = normalizeStressReportSummary({ summary: { short: '本次为手动停止的部分压测结果', detailed: '20 个虚拟用户已完成 60 轮场景，25 次请求失败，实际失败率为 2.5%；尚不能评价性能达标。' }, stress_analysis: { findings: ['登录步骤是主要失败热点，应先核对超时原因并以相同负载复测。'] } }, buildStressReportSummary(report));
          data = report.aiSummary;
        } else {
          functional.aiSummary = { summary: { short: '普通回归执行完成', detailed: '两个用例通过。' }, highlights: ['功能回归结果'], risk_assessment: { level: 'LOW', description: '按功能回归口径分析', recommendations: [] } };
          data = functional.aiSummary;
        }
      }
      await route.fulfill({ json: data });
    });
    await fs.mkdir('/tmp/apiforge-stress-summary-ui', { recursive: true });
    await page.goto(`${base}/projects/p/tests/reports/pressure`);
    await page.getByText(/这份总结使用旧版通用报告规则/).waitFor();
    assert.equal(await page.getByText('OLD_RELEASE_CLAIM').count(), 0, 'old release claims must not be shown as pressure conclusions');
    await page.getByRole('button', { name: '重新生成压测分析', exact: true }).click();
    await page.getByText('部分结果 · 手动停止', { exact: true }).waitFor();
    await page.getByText('本次为手动停止的部分压测结果').waitFor();
    assert.equal(requests, 1);
    const facts = page.locator('.ai-stress-facts');
    assert.match(await facts.innerText(), /2\.5%/);
    assert.match(await facts.innerText(), /60 轮/);
    await page.getByRole('heading', { name: '失败热点（按实际失败请求数）' }).waitFor();
    const failures = page.locator('.ai-stress-table').first();
    assert.match(await failures.innerText(), /25/);
    assert.match(await failures.innerText(), /600/);
    await page.getByRole('heading', { name: '结论边界与缺失数据' }).waitFor();
    assert.match(await page.locator('.ai-data-limits').innerText(), /SLA/);
    await page.getByRole('heading', { name: 'AI 压测分析', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: '/tmp/apiforge-stress-summary-ui/pressure-analysis.png' });
    await page.reload();
    await page.getByText('本次为手动停止的部分压测结果').waitFor();
    assert.equal(requests, 1, 'page refresh must not trigger paid regeneration');
    failModel = true;
    await page.getByRole('button', { name: 'AI 压测分析', exact: true }).click();
    await page.getByText('模型暂不可用', { exact: true }).waitFor();
    assert(await page.getByText('本次为手动停止的部分压测结果').isVisible(), 'failed regeneration must keep the saved analysis');
    failModel = false;
    enabled = false;
    await page.reload();
    await page.getByText('本次为手动停止的部分压测结果').waitFor();
    assert.equal(await page.getByRole('button', { name: 'AI 压测分析', exact: true }).isEnabled(), false);
    enabled = true;
    await page.goto(`${base}/projects/p/tests/reports/functional`);
    await page.getByRole('button', { name: 'AI 总结报告', exact: true }).click();
    await page.getByText('普通回归执行完成').waitFor();
    assert.equal(await page.locator('.ai-stress-facts').count(), 0);
    assert.equal(await page.getByText(/旧版通用报告规则/).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS pressure-specific AI summary, old-summary upgrade, exact failure counts, limitations, persisted reload, no automatic AI calls, generation-error preservation, feature gate and functional-summary compatibility');
  } finally { if (browser) await browser.close(); vite?.kill('SIGTERM'); }
})().catch(error => { console.error(error); process.exitCode = 1; });
