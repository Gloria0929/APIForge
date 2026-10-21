const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
(async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const vite = spawn(process.execPath, [path.resolve('frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port)], {
    cwd: path.resolve('frontend'), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(base)).ok) break; } catch {}
      if (i === 149) throw new Error('Frontend preview did not start');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await ctx.route('https://fonts.googleapis.com/**', route => route.abort());
    await ctx.route('https://fonts.gstatic.com/**', route => route.abort());
    await ctx.addInitScript(() => localStorage.setItem('apiforge:auth', JSON.stringify({ username: 'regression', token: 'mock-only' })));
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const flags = { semanticParse: true, testGeneration: true, assertionGeneration: true, errorAnalysis: true, reportSummary: true };
    let enabled = true;
    const provider = { id: 1, name: 'Regression Provider', providerType: 'custom', baseUrl: 'https://provider.invalid/v1', apiKey: '', hasApiKey: true, model: 'chat-a', isActive: true, features: { ...flags } };
    const project = { id: 'p', name: 'Regression project', createdBy: 'test', createdAt: '2026-01-01' };
    const api = { id: 'api', projectId: 'p', path: '/users/{id}', method: 'POST', summary: 'Update profile', tags: [], parameters: [{ name: 'id', in: 'path', schema: { type: 'integer' } }],
      requestBody: { content: { 'application/json': { schema: { allOf: [{ type: 'object', properties: { profile: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } }, { type: 'object', properties: { active: { type: 'boolean' } } }] } } } }, responses: {} };
    let releaseConfig, releaseHealth;
    const configGate = new Promise(resolve => { releaseConfig = resolve; });
    const healthGate = new Promise(resolve => { releaseHealth = resolve; });
    let firstConfig = true;
    let job = null;
    let started = 0, modelRequests = 0, testAllRequests = 0, semanticRequests = 0;
    const savedConfigs = [], savedProviders = [], savedScenarios = [];
    await page.route(`${base}/api/**`, async route => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      const body = method === 'GET' ? null : route.request().postDataJSON();
      let data = [];
      if (url.pathname === '/api/projects') data = [project];
      else if (url.pathname === '/api/projects/p') data = project;
      else if (url.pathname === '/api/version/check') data = { hasUpdate: false };
      else if (url.pathname === '/api/ai/configs') {
        if (method === 'GET' && firstConfig) { firstConfig = false; await configGate; }
        if (method === 'POST') { savedConfigs.push(body); enabled = body.aiEnabled; }
        data = { aiEnabled: enabled, providerId: 1, features: { ...provider.features } };
        if (method === 'GET') data = [data];
      } else if (url.pathname === '/api/ai/providers/models') { modelRequests++; data = { models: ['chat-a', 'chat-b'] }; }
      else if (url.pathname === '/api/ai/providers') data = [provider];
      else if (url.pathname === '/api/ai/providers/1' && method === 'PUT') { savedProviders.push(body); Object.assign(provider, body); data = provider; }
      else if (url.pathname === '/api/ai/providers/test-all') { testAllRequests++; data = { available: true, providers: [] }; }
      else if (url.pathname === '/api/ai/health') { await healthGate; data = { available: true, providers: [{ id: 1, available: true }] }; }
      else if (url.pathname === '/api/apis') data = [api];
      else if (url.pathname === '/api/apis/api') data = api;
      else if (url.pathname === '/api/ai/analysis-jobs' && method === 'POST') { started++; job = { id: 'job', projectId: 'p', status: 'running', total: 1, processed: 0, completed: 0, failed: 0, results: [], errors: [] }; data = job; }
      else if (url.pathname === '/api/ai/analysis-jobs/active') data = job?.status === 'running' ? job : null;
      else if (url.pathname === '/api/ai/analysis-jobs/job') data = job;
      else if (url.pathname === '/api/ai/semantic-parse') { semanticRequests++; data = {}; }
      else if (url.pathname === '/api/tests') data = [{ id: 'login', name: 'Login case' }, { id: 'profile', name: 'Profile case' }];
      else if (url.pathname === '/api/ai/generate-scenario') data = { name: 'Login and profile', variables: { retry: 0, active: false }, warnings: [], steps: [
        { name: 'Login', testCaseId: 'login', extractRules: [{ key: 'token', path: '$.data.token' }], requestOverrides: {} },
        { name: 'Profile', testCaseId: 'profile', extractRules: [], requestOverrides: { url: '/users/{{userId}}', headers: { Authorization: 'Bearer {{token}}' }, query: { page: 1 } } },
      ] };
      else if (url.pathname === '/api/tests/scenarios' && method === 'POST') { savedScenarios.push(body); data = { id: 'scenario', ...body }; }
      await route.fulfill({ json: data });
    });
    await page.goto(`${base}/projects/p/ai`, { waitUntil: 'domcontentloaded' });
    await page.locator('.el-skeleton').first().waitFor();
    assert.equal(await page.locator('.config-form').getByRole('switch').count(), 0, 'do not render a false initial switch');
    releaseConfig();
    const configSwitch = page.locator('.config-form .el-switch');
    await configSwitch.waitFor();
    await page.waitForFunction(() => document.querySelector('.config-form .el-switch input').getAttribute('aria-checked') === 'true');
    assert.equal(savedConfigs.length, 0, 'hydration must not save configuration');
    assert.equal(testAllRequests, 0, 'entering configuration must not send paid health probes');
    releaseHealth();
    await configSwitch.click();
    await page.waitForFunction(() => !document.querySelector('.config-form .el-switch').classList.contains('is-disabled'));
    assert.equal(savedConfigs.length, 1);
    assert.equal(savedConfigs[0].aiEnabled, false);
    console.log('PASS configuration hydration, no switch flash, no initial write/probe, explicit switch save');

    await page.getByRole('button', { name: '新增', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: '新增模型提供商' });
    await dialog.getByPlaceholder('sk-...').fill('mock-key');
    await dialog.locator('.model-picker .el-select__selected-item').filter({ hasText: 'chat-a' }).waitFor();
    await dialog.locator('.model-picker .el-select').click();
    await page.getByRole('option', { name: 'chat-b', exact: true }).waitFor();
    assert(modelRequests > 0);
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await page.locator('.table-action').filter({ hasText: '编辑' }).first().click();
    dialog = page.getByRole('dialog', { name: '编辑 AI 提供商' });
    assert.equal(await dialog.getByPlaceholder('留空保留已保存的 Key').inputValue(), '');
    await dialog.locator('.el-form-item').filter({ hasText: '启用功能' }).locator('.el-select').click();
    for (const name of ['接口语义分析', '自动生成测试用例', '自动生成断言', '测试失败分析', '报告智能总结']) await page.getByRole('option', { name, exact: true }).click();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(savedProviders.length, 1);
    assert(Object.values(savedProviders[0].features).every(value => value === false));
    console.log('PASS automatic model list, blank saved key, disabling all provider features');

    enabled = true; provider.features = { ...flags };
    await page.goto(`${base}/projects/p/apis/api`, { waitUntil: 'domcontentloaded' });
    await page.locator('.el-table .cell').filter({ hasText: /^profile$/ }).first().waitFor();
    await page.locator('.el-table .cell').filter({ hasText: /^name$/ }).first().waitFor();
    await page.locator('.el-table .cell').filter({ hasText: /^boolean$/ }).first().waitFor();
    console.log('PASS nested allOf request fields in API detail');
    await page.goto(`${base}/projects/p/apis`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'AI 批量分析', exact: true }).click();
    await page.locator('.analyzing-banner').waitFor();
    assert.equal(started, 1);
    assert.equal(semanticRequests, 0, 'the browser must not own the analysis loop');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.analyzing-banner').waitFor();
    assert.match(await page.locator('.analyzing-banner').innerText(), /0\/1/);
    assert.equal(await page.evaluate(() => localStorage.getItem('apiforge:analysisJob')), 'job');
    assert((await page.locator('.project-detail').boundingBox()).y >= 40, 'progress must not cover the workspace');
    job = { ...job, status: 'completed', processed: 1, completed: 1 };
    await page.locator('.analyzing-banner').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => localStorage.getItem('apiforge:analysisJob')), null);
    console.log('PASS server job start, page refresh recovery, completion and banner layout');

    await page.goto(`${base}/projects/p/scenarios`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'AI 编排场景', exact: true }).click();
    await page.getByPlaceholder('描述期望的场景，例如：登录后查看个人信息').fill('登录后查看个人信息');
    await page.getByRole('button', { name: '生成场景', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '创建场景', exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getByPlaceholder('例如：登录后获取用户信息').inputValue(), 'Login and profile');
    await dialog.getByRole('button', { name: '创建', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(savedScenarios.length, 1);
    assert.equal(savedScenarios[0].steps[1].requestOverrides.url, '/users/{{userId}}');
    assert.equal(savedScenarios[0].steps[1].requestOverrides.query.page, 1);
    assert.equal(savedScenarios[0].variables.retry, 0);
    assert.equal(savedScenarios[0].variables.active, false);
    assert.deepEqual(savedScenarios[0].steps[0].extractRules, { token: '$.data.token' });
    assert.deepEqual(errors, []);
    console.log('PASS AI scenario preview/save keeps URL overrides, extraction rules and JSON types; no browser errors');
  } finally {
    if (browser) await browser.close();
    vite.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
