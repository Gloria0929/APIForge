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
    const loginCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
    await loginCtx.route('https://fonts.googleapis.com/**', route => route.abort());
    await loginCtx.route('https://fonts.gstatic.com/**', route => route.abort());
    await loginCtx.route(`${base}/api/**`, async route => {
      const pathname = new URL(route.request().url()).pathname;
      let data = [];
      if (pathname === '/api/auth/login') data = { username: 'regression', token: 'mock-only', mustChangePassword: false };
      else if (pathname === '/api/version/check') data = { hasUpdate: false };
      else if (pathname === '/api/ai/analysis-jobs/active') data = null;
      await route.fulfill({ json: data });
    });
    const loginPage = await loginCtx.newPage();
    await loginPage.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
    await loginPage.locator('.login-form').waitFor();
    const opacity = selector => loginPage.locator(selector).first().evaluate(el => getComputedStyle(el).opacity);
    assert.equal(await opacity('html'), '1', 'light login decorations must not fade the document');
    assert.equal(await opacity('.login-glow'), '0.32');
    assert.equal(await opacity('.login-grid'), '0.7');
    await loginPage.getByRole('button', { name: '切换到暗色模式' }).click();
    await loginPage.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await opacity('html'), '1');
    assert.equal(await opacity('.login-glow'), '0.5');
    assert.equal(await opacity('.login-grid'), '0.55');
    await loginPage.getByRole('button', { name: '切换到亮色模式' }).click();
    await loginPage.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await loginPage.getByLabel('密码', { exact: true }).fill('mock-password');
    await loginPage.getByRole('button', { name: '登录', exact: true }).click();
    await loginPage.waitForURL(`${base}/projects`);
    await loginPage.locator('.project-detail').waitFor();
    await loginPage.locator('.login-page').waitFor({ state: 'detached' });
    assert.equal(await opacity('html'), '1', 'SPA login must keep the workspace fully opaque');
    await loginPage.reload({ waitUntil: 'domcontentloaded' });
    await loginPage.locator('.project-detail').waitFor();
    assert.equal(await opacity('html'), '1', 'workspace opacity must stay unchanged after refresh');
    await loginCtx.close();
    console.log('PASS login theme decorations stay scoped; workspace stays opaque before and after refresh');
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
    const provider = { id: 1, name: 'Regression Provider', providerType: 'custom', baseUrl: 'https://provider.invalid/v1', apiKey: '', hasApiKey: true, model: 'chat-a', reasoningEffort: 'high', contextWindow: 96000, isActive: true, features: { ...flags } };
    const project = { id: 'p', name: 'Regression project', createdBy: 'test', createdAt: '2026-01-01' };
    const api = { id: 'api', projectId: 'p', path: '/users/{id}', method: 'POST', summary: 'Update profile', tags: [], parameters: [{ name: 'id', in: 'path', schema: { type: 'integer' } }],
      requestBody: { content: { 'application/json': { schema: { allOf: [{ type: 'object', properties: { profile: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } }, { type: 'object', properties: { active: { type: 'boolean' } } }] } } } }, responses: {} };
    let releaseConfig, releaseHealth;
    const configGate = new Promise(resolve => { releaseConfig = resolve; });
    const healthGate = new Promise(resolve => { releaseHealth = resolve; });
    let firstConfig = true;
    let job = null;
    let started = 0, modelRequests = 0, testAllRequests = 0, semanticRequests = 0;
    const savedConfigs = [], createdProviders = [], savedProviders = [], savedScenarios = [], reasoningRequests = [];
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
      else if (url.pathname === '/api/ai/providers/reasoning') {
        reasoningRequests.push(body);
        data = body.model === 'chat-b' ? { status: 'unsupported', levels: [] } : { status: 'supported', levels: ['high', 'max'], source: 'metadata' };
      }
      else if (url.pathname === '/api/ai/providers' && method === 'POST') { createdProviders.push(body); data = { id: 2, ...body }; }
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
    assert.equal(await dialog.locator('.provider-reasoning-field').count(), 0, 'hide effort until support is confirmed');
    const presets = [
      ['硅基流动 (SiliconFlow)', 'https://api.siliconflow.cn/v1/chat/completions'],
      ['火山方舟 (豆包)', 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'],
      ['MiniMax', 'https://api.minimax.cn/v1/chat/completions'],
      ['OpenRouter', 'https://openrouter.ai/api/v1/chat/completions'],
      ['Groq', 'https://api.groq.com/openai/v1/chat/completions'],
      ['Mistral AI', 'https://api.mistral.ai/v1/chat/completions'],
      ['NVIDIA NIM', 'https://integrate.api.nvidia.com/v1/chat/completions'],
      ['OpenAI', 'https://api.openai.com/v1/chat/completions'],
    ];
    for (const [label, baseUrl] of presets) {
      await dialog.locator('.el-form-item').filter({ hasText: '类型' }).locator('.el-select').click();
      await page.getByRole('option', { name: label, exact: true }).click();
      assert.equal(await dialog.locator('.el-form-item').filter({ hasText: 'API 地址' }).getByRole('textbox').inputValue(), baseUrl);
    }
    await dialog.getByPlaceholder('例如：OpenAI Production').fill('New provider');
    await dialog.getByPlaceholder('sk-...').fill('mock-key');
    const modelSelect = dialog.locator('.model-picker .el-select');
    const modelInput = dialog.getByRole('combobox', { name: '默认模型', exact: true });
    await dialog.locator('.provider-reasoning-field').waitFor();
    assert.match(await modelSelect.innerText(), /chat-a/);
    await modelSelect.click();
    await modelInput.fill('chat-');
    await page.getByRole('option', { name: 'chat-b', exact: true }).waitFor();
    assert(modelRequests > 0);
    await page.getByRole('option', { name: 'chat-a', exact: true }).click();
    await dialog.locator('.provider-reasoning-field').waitFor();
    await modelSelect.click();
    await modelInput.fill('private-custom-model');
    await page.getByRole('option', { name: 'private-custom-model', exact: true }).click();
    await dialog.locator('.provider-reasoning-field').waitFor();
    assert.match(await modelSelect.innerText(), /private-custom-model/);
    await dialog.locator('.model-picker').getByRole('button', { name: '刷新', exact: true }).click();
    await dialog.locator('.model-picker .el-button.is-loading').waitFor({ state: 'hidden' });
    assert.match(await modelSelect.innerText(), /private-custom-model/, 'refresh must preserve custom model names');
    await modelSelect.click();
    await modelInput.fill('chat-a');
    await page.getByRole('option', { name: 'chat-a', exact: true }).click();
    await dialog.locator('.provider-reasoning-field').waitFor();
    assert.equal(await dialog.locator('.reasoning-picker__hint').count(), 0);
    assert.equal(await dialog.getByRole('button', { name: '重新检测' }).count(), 0);
    await dialog.locator('.reasoning-picker').click();
    await page.getByRole('option', { name: '最高（max）', exact: true }).click();
    await dialog.locator('.el-form-item').filter({ hasText: '上下文长度' }).locator('.el-select').click();
    await page.getByRole('option', { name: '128K（128,000 Token）', exact: true }).click();
    await dialog.getByRole('button', { name: '确定', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(createdProviders.length, 1);
    assert.equal(createdProviders[0].reasoningEffort, 'max');
    assert.equal(createdProviders[0].contextWindow, 128000);
    assert(reasoningRequests.some(body => body.model === 'chat-a'));
    await page.locator('.table-action').filter({ hasText: '编辑' }).first().click();
    dialog = page.getByRole('dialog', { name: '编辑 AI 提供商' });
    assert.equal(await dialog.getByPlaceholder('留空保留已保存的 Key').inputValue(), '');
    await dialog.locator('.provider-reasoning-field').waitFor();
    assert.match(await dialog.locator('.reasoning-picker').innerText(), /high/);
    await dialog.locator('.el-form-item').filter({ hasText: '上下文长度' }).locator('.el-select').click();
    await page.getByRole('option', { name: '96K（96,000 Token）', exact: true }).waitFor();
    await page.getByRole('option', { name: '96K（96,000 Token）', exact: true }).click();
    await dialog.locator('.model-picker .el-select').click();
    await dialog.getByRole('combobox', { name: '默认模型', exact: true }).fill('chat-b');
    await page.getByRole('option', { name: 'chat-b', exact: true }).click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="dialog"] button')).some(button => button.textContent.trim() === '保存' && !button.disabled));
    assert.equal(await dialog.locator('.provider-reasoning-field').count(), 0, 'unsupported models hide the entire effort field');
    assert(reasoningRequests.some(body => body.model === 'chat-b' && body.providerId === 1 && body.apiKey === ''));
    await dialog.locator('.el-form-item').filter({ hasText: '上下文长度' }).locator('.el-select').click();
    await page.getByRole('option', { name: '256K（256,000 Token）', exact: true }).click();
    await dialog.locator('.el-form-item').filter({ hasText: '启用功能' }).locator('.el-select').click();
    for (const name of ['接口语义分析', '自动生成测试用例', '自动生成断言', '测试失败分析', '报告智能总结']) await page.getByRole('option', { name, exact: true }).click();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(savedProviders.length, 1);
    assert(Object.values(savedProviders[0].features).every(value => value === false));
    assert.equal(savedProviders[0].reasoningEffort, '', 'switching to unsupported models clears the old effort');
    assert.equal(savedProviders[0].contextWindow, 256000);
    await page.locator('.table-action').filter({ hasText: '编辑' }).first().click();
    dialog = page.getByRole('dialog', { name: '编辑 AI 提供商' });
    await dialog.getByText('256K（256,000 Token）', { exact: true }).waitFor();
    await dialog.locator('.el-form-item').filter({ hasText: '上下文长度' }).locator('.el-select').click();
    await page.getByRole('option', { name: '模型默认值', exact: true }).click();
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(savedProviders.length, 2);
    assert.equal(savedProviders[1].contextWindow, null);
    console.log('PASS automatic model/effort detection, unsupported effort hidden and cleared, context create/edit/clear, blank saved key and feature flags');

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
    await page.getByRole('dialog', { name: 'AI 编排场景', exact: true }).getByRole('textbox').fill('登录后查看个人信息');
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
