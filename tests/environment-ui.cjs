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

const environment = {
  id: 'env-1',
  projectId: 'p1',
  name: '本地环境',
  baseUrl: 'http://127.0.0.1:8080/api/v1',
  isActive: true,
  variables: [{ key: 'email', value: 'a@b.c', type: 'string' }],
  loginTestCaseId: null,
  loginExtractRules: null,
  setupSteps: [
    { testCaseId: 'login', name: '登录', extractRules: { token: '$.token' } },
    { testCaseId: 'list', name: '获取会话列表', extractRules: { sessionId: '$.data[0].id' } },
  ],
};

(async () => {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const vite = spawn(
    process.execPath,
    [path.resolve('frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port)],
    { cwd: path.resolve('frontend'), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let viteOutput = '';
  vite.stdout.on('data', chunk => { viteOutput += chunk; });
  vite.stderr.on('data', chunk => { viteOutput += chunk; });

  let browser;
  try {
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(base)).ok) break; } catch {}
      if (i === 149) throw new Error(`Frontend preview did not start${viteOutput ? `: ${viteOutput.trim()}` : ''}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('https://fonts.googleapis.com/**', route => route.abort());
    await context.route('https://fonts.gstatic.com/**', route => route.abort());

    let savedPayload = null;
    await context.route(`${base}/api/**`, async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/auth/login') {
        return route.fulfill({ json: { username: 'regression', token: 'mock-only', mustChangePassword: false } });
      }
      if (pathname === '/api/version/check') return route.fulfill({ json: { hasUpdate: false } });
      if (pathname === '/api/ai/analysis-jobs/active') return route.fulfill({ json: null });
      if (pathname === '/api/environments' && request.method() === 'GET') {
        return route.fulfill({ json: [environment] });
      }
      if (pathname === '/api/environments/env-1' && request.method() === 'PUT') {
        savedPayload = request.postDataJSON();
        return route.fulfill({ json: { ...environment, ...savedPayload } });
      }
      if (pathname === '/api/tests') {
        return route.fulfill({
          json: [
            { id: 'login', name: '用户登录并获取访问令牌' },
            { id: 'list', name: '获取会话列表' },
            { id: 'detail', name: '获取会话详情' },
          ],
        });
      }
      return route.fulfill({ json: [] });
    });

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));

    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('密码', { exact: true }).fill('mock-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page.waitForURL(`${base}/projects`);

    await page.goto(`${base}/projects/p1/environments`, { waitUntil: 'domcontentloaded' });
    await page.locator('.table-action', { hasText: '编辑' }).first().click();
    await page.locator('.setup-step').first().waitFor();

    assert.equal(await page.locator('.setup-step').count(), 2, '已有两个前置用例时应渲染两个步骤');
    const firstStep = page.locator('.setup-step').nth(0);
    const secondStep = page.locator('.setup-step').nth(1);
    assert.match(await firstStep.innerText(), /用户登录并获取访问令牌/);
    assert.equal(await firstStep.locator('input').nth(1).inputValue(), 'token');
    assert.equal(await firstStep.locator('input').nth(2).inputValue(), '$.token');
    assert.match(await secondStep.innerText(), /获取会话列表/);
    assert.equal(await secondStep.locator('input').nth(1).inputValue(), 'sessionId');
    assert.equal(
      await secondStep.locator('input').nth(2).inputValue(),
      '$.data[0].id',
      'sessionId 的提取路径要能回显',
    );

    // 下拉框高度与同一行的按钮一致；前置步骤区域不单独滚动（滚动交给弹窗内容区）
    const selectHeight = await page.locator('.setup-step__select').first().evaluate(el => el.getBoundingClientRect().height);
    const buttonHeight = await page.locator('.setup-step__head .el-button').first().evaluate(el => el.getBoundingClientRect().height);
    assert.equal(selectHeight, buttonHeight, '前置用例下拉框要与按钮等高');
    assert.equal(
      await page.locator('.setup-steps').evaluate(el => getComputedStyle(el).overflowY),
      'visible',
      '前置步骤区域不应有独立滚动条',
    );
    const dialogFits = await page.evaluate(() => {
      const dialog = document.querySelector('.env-dialog');
      const body = document.querySelector('.env-dialog .el-dialog__body');
      return {
        withinViewport: dialog.getBoundingClientRect().height <= window.innerHeight,
        bodyScrolls: getComputedStyle(body).overflowY,
      };
    });
    assert.ok(dialogFits.withinViewport, '弹窗高度不应超出视口');
    assert.equal(dialogFits.bodyScrolls, 'auto', '内容超出时由弹窗内容区滚动');

    // 新增第三步并保存，验证 payload 结构
    await page.getByRole('button', { name: '+ 添加前置用例' }).click();
    assert.equal(await page.locator('.setup-step').count(), 3);
    const thirdStep = page.locator('.setup-step').nth(2);
    await thirdStep.locator('.setup-step__select').click({ force: true });
    await page.locator('.el-select-dropdown__item:visible', { hasText: '获取会话详情' }).first().click();
    await thirdStep.locator('input').nth(1).fill('kbId');
    await thirdStep.locator('input').nth(2).fill('$.data.kb_id');
    await Promise.all([
      page.waitForResponse(
        response => response.url().includes('/api/environments/env-1') && response.request().method() === 'PUT',
      ),
      page.getByRole('button', { name: '保存' }).click(),
    ]);

    assert.ok(savedPayload, '保存时应发出 PUT 请求');
    assert.deepEqual(savedPayload.setupSteps, [
      { testCaseId: 'login', extractRules: { token: '$.token' } },
      { testCaseId: 'list', extractRules: { sessionId: '$.data[0].id' } },
      { testCaseId: 'detail', extractRules: { kbId: '$.data.kb_id' } },
    ]);
    assert.equal(savedPayload.loginTestCaseId, null, '新配置保存后要清掉旧的单登录用例字段');
    assert.equal(savedPayload.loginExtractRules, null);

    assert.deepEqual(errors, [], `页面不应有运行时报错：${errors.join(' | ')}`);
    console.log('PASS environment setup steps render, edit and save as ordered setupSteps');
  } finally {
    if (browser) await browser.close();
    vite.kill('SIGTERM');
  }
})().catch(error => {
  console.error('FAIL environment setup steps:', error);
  process.exit(1);
});
