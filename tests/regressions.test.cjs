require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const axios = require('axios').default;
const { DataSource } = require('typeorm');
const { ApiService } = require('../src/modules/api/api.service');
const { AiService } = require('../src/modules/ai/ai.service');
const { AIAnalysisJobService } = require('../src/modules/ai/ai-analysis-job.service');
const { AIAnalysisJob } = require('../src/modules/ai/ai-analysis-job.entity');
const { AIProvider } = require('../src/modules/ai/ai-provider.entity');
const { ProjectAIConfig } = require('../src/modules/ai/project-ai-config.entity');
const { Project } = require('../src/modules/project/project.entity');
const { TestService } = require('../src/modules/test/test.service');
const { normalizeScenarioDraft } = require('../src/modules/ai/scenario-draft');
function frontend(file) {
  const filename = path.resolve('frontend/src', file);
  const mod = new Module(filename, module);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, filename);
  return mod.exports;
}
const { requestParameters } = frontend('utils/api-schema.ts');
const { parseLooseValue } = frontend('utils/json.ts');
const captureApi = () => new ApiService({ save: async value => value });

test('OpenAPI imports inherited parameters, overrides, JSON Pointer refs and nested allOf fields', async () => {
  const spec = { openapi: '3.0.3', components: { parameters: { tenant: { name: 'tenant', in: 'header', schema: { type: 'string' }, required: true } }, schemas: {
    'Profile/V1': { allOf: [{ type: 'object', properties: { name: { type: 'string', description: 'Full name' } }, required: ['name'] },
      { type: 'object', properties: { addresses: { type: 'array', items: { type: 'object', properties: { zip: { type: 'integer' } }, required: ['zip'] } }, internal: { type: 'string', readOnly: true } } }] },
  } }, paths: { '/users/{id}': { parameters: [{ $ref: '#/components/parameters/tenant' }, { in: 'path', name: 'id', type: 'integer' }, { in: 'query', name: 'limit', required: true }],
    post: { summary: 'Update user', description: 'Long description', parameters: [{ in: 'query', name: 'limit', required: false, schema: { type: 'integer' } }],
      requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Profile~1V1' } } } } } } } };
  const [api] = await captureApi().importApi('project', spec);
  assert.equal(api.summary, 'Update user');
  assert.equal(api.parameters.length, 3);
  assert.equal(api.parameters.find(p => p.name === 'limit').required, false);
  const rows = requestParameters(api);
  assert.equal(rows.find(p => p.name === 'id').required, true);
  assert.equal(rows.find(p => p.name === 'tenant').in, 'header');
  assert.equal(rows.find(p => p.name === 'name').required, true);
  assert.equal(rows.find(p => p.name === 'name').description, 'Full name');
  const addresses = rows.find(p => p.name === 'addresses');
  assert.equal(addresses.type, 'array<object>');
  assert.equal(addresses.children[0].children[0].name, 'zip');
  assert.equal(addresses.children[0].children[0].required, true);
  assert(!rows.some(p => p.name === 'internal'));
});

test('Swagger body/form-data and recursive refs remain usable', async () => {
  const [api] = await captureApi().importApi('project', { swagger: '2.0', paths: { '/upload': { post: { parameters: [
    { name: 'file', in: 'formData', type: 'file', required: true }, { name: 'note', in: 'formData', type: 'string' },
  ] } } } });
  assert.equal(api.parameters.length, 0);
  assert.equal(requestParameters(api).find(p => p.name === 'file').type, 'file');
  const [recursive] = await captureApi().importApi('project', { definitions: { Node: { type: 'object', properties: { next: { $ref: '#/definitions/Node' } } } },
    paths: { '/node': { post: { parameters: [{ name: 'node', in: 'body', schema: { $ref: '#/definitions/Node' } }] } } } });
  assert.doesNotThrow(() => JSON.stringify(requestParameters(recursive)));
});

test('Postman does not infer required from enabled; keeps headers, path and examples', async () => {
  const [api] = await captureApi().importApi('project', { item: [{ name: 'Create', request: { method: 'POST', url: { path: ['users', ':id'], variable: [{ key: 'id', value: '42' }], query: [{ key: 'limit', value: '0' }, { key: 'disabled', disabled: true }] },
    header: [{ key: 'X-Tenant', value: 'one' }], body: { mode: 'raw', raw: '{"count":0,"enabled":false}' } } }] });
  assert.equal(api.path, '/users/{id}');
  assert.equal(api.parameters.find(p => p.name === 'limit').required, false);
  assert.equal(api.parameters.find(p => p.name === 'X-Tenant').in, 'header');
  assert(!api.parameters.some(p => p.name === 'disabled'));
  assert.equal(requestParameters(api).find(p => p.name === 'count').required, false);
  assert.equal(api.requestBody.content['application/json'].schema.properties.enabled.example, false);
});

test('scenario inputs and request execution preserve numeric/boolean/null types', async () => {
  for (const [input, expected] of [['0', 0], ['-2.5', -2.5], ['false', false], ['null', null], ['{{id}}', '{{id}}'], ['hello', 'hello']]) assert.deepEqual(parseLooseValue(input), expected);
  const service = new TestService();
  assert.deepEqual(service.replaceVariablesInObject({ count: 0, enabled: false, ratio: 1.5, data: null, token: '{{token}}' }, new Map([['token', 'abc']])),
    { count: 0, enabled: false, ratio: 1.5, data: null, token: 'abc' });
  assert.deepEqual(service.extractVariables({ responseBody: { status: 'ok', data: { token: 'abc', ids: [7] } } }, { token: '$.data.token', userId: '$.data.ids[0]' }), { token: 'abc', userId: 7 });
  const failed = new TestService({ findOne: async () => ({ id: 'case', name: 'Case', request: {}, assertions: [] }), update: async () => ({}) });
  failed.debugRequest = async () => ({ responseTime: 0, response: { status: 0, data: null }, error: 'Connection refused' });
  assert.equal((await failed.executeTestCase('case', 'env')).status, 'ERROR');
});

test('AI drafts reject invalid IDs, unsupported paths and forward references', () => {
  const cases = [{ id: 'login', name: 'Login', request: {} }, { id: 'profile', name: 'Profile', request: {} }];
  assert.throws(() => normalizeScenarioDraft({ steps: [{ testCaseId: 'made-up' }] }, cases), /不存在/);
  assert.throws(() => normalizeScenarioDraft({ steps: [{ testCaseId: 'login', extractRules: [{ key: 'token', path: '$..token' }] }] }, cases), /提取规则/);
  assert.throws(() => normalizeScenarioDraft({ steps: [
    { testCaseId: 'profile', requestOverrides: { headers: { Authorization: 'Bearer {{token}}' } } },
    { testCaseId: 'login', extractRules: [{ key: 'token', path: '$.data.token' }] },
  ] }, cases), /尚未提取/);
  const draft = normalizeScenarioDraft({ steps: [
    { testCaseId: 'login', extractRules: { token: '$.data.token' } },
    { testCaseId: 'profile', requestOverrides: { url: '/users/{{userId}}', headers: { Authorization: 'Bearer {{token}}' } } },
  ] }, cases);
  assert.deepEqual(draft.steps[0].extractRules, [{ key: 'token', path: '$.data.token' }]);
  assert.deepEqual(draft.warnings, ['变量 userId 需要在环境中提供初始值']);

  // 循环步骤：数据源必须来自之前的提取步骤，itemVar 仅在本步骤内可用
  assert.throws(() => normalizeScenarioDraft({ steps: [
    { testCaseId: 'profile', repeat: { sourceKey: 'items', itemVar: 'itemId' }, requestOverrides: { url: '/x/{{itemId}}' } },
  ] }, cases), /循环数据源/);
  const loopDraft = normalizeScenarioDraft({ steps: [
    { testCaseId: 'login', extractRules: { items: '$.data' } },
    { testCaseId: 'profile', repeat: { sourceKey: 'items', itemVar: 'itemId', itemPath: 'id' }, requestOverrides: { url: '/x/{{itemId}}' } },
  ] }, cases);
  assert.deepEqual(loopDraft.steps[1].repeat, { sourceKey: 'items', itemVar: 'itemId', itemPath: 'id' });
  assert.deepEqual(loopDraft.warnings, []);

  // 文档风格的 {id} 在生成请求时统一转成 {{id}}
  const apiDraft = normalizeScenarioDraft({ steps: [{ apiId: 'a1', request: { method: 'GET', url: '/kb/{kbId}' } }] }, [], { allowedApiIds: new Set(['a1']) });
  assert.equal(apiDraft.steps[0].request.url, '{{base_url}}/kb/{{kbId}}');
});

test('AI scenario selection uses full schemas and only saves referenced, validated cases', async () => {
  const apis = ['login', 'profile'].map(id => ({ id, path: '/' + id, method: 'POST', summary: id, parameters: [], tags: [],
    requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { user: { type: 'string' } } } } } },
    responses: { 200: { schema: { type: 'object', properties: { data: { type: 'object', properties: { token: { type: 'string' } } } } } } } }));
  const saved = [];
  const cases = { find: async () => [], manager: { transaction: async callback => callback({ getRepository: () => ({ save: async test => { saved.push(test); return { ...test, id: 'saved-' + test.apiId }; } }) }) } };
  const service = new AiService({}, {}, {}, { find: async () => apis }, {}, cases, {}, {});
  service.ensureFeatureEnabled = async () => {};
  service.getProjectRuntime = async () => ({ provider: {}, config: {} });
  service.logUsage = async () => {};
  let calls = 0;
  service.requestJsonCompletion = async (_provider, _config, prompt) => {
    calls++;
    if (calls % 2 === 1) return { requiredApiIds: ['login', 'profile', 'login'] };
    const context = JSON.parse(prompt.userPrompt);
    assert(context.apis[0].requestBody);
    assert(context.apis[0].responses['200']);
    assert(Array.isArray(context.testCases));
    return {
      name: 'Login flow',
      steps: [{
        apiId: 'login',
        name: '登录',
        request: {
          method: 'POST',
          url: '{{base_url}}/login',
          headers: { Authorization: 'Bearer {{token}}' },
          body: { user: 'tester' },
        },
      }],
    };
  };
  const result = await service.generateScenario('project', '登录');
  assert.equal(calls, 2);
  assert.equal(saved.length, 1);
  assert.equal(result.steps[0].testCaseId, 'saved-login');
  assert.equal(result.createdTestCaseCount, 1);
  service.requestJsonCompletion = async () => ++calls % 2 ? { requiredApiIds: ['login'] } : { steps: [{ testCaseId: 'fake' }] };
  await assert.rejects(service.generateScenario('project', '登录'), /不存在/);
  assert.equal(saved.length, 1, 'invalid model output must not persist cases');
});

test('provider model discovery, redaction and native protocol adapters', async t => {
  const stored = { id: 1, name: 'Private provider', providerType: 'custom', baseUrl: 'https://provider.test/v1/chat/completions', apiKey: 'secret', model: 'chat', isActive: true, features: { semanticParse: true } };
  const providers = { find: async () => [stored], findOne: async () => stored, create: obj => obj, save: async obj => obj };
  const service = new AiService(providers);
  assert.equal((await service.getProviders())[0].apiKey, '');
  assert.equal((await service.getProviders())[0].hasApiKey, true);
  const updated = await service.updateProvider(1, { apiKey: '', features: { semanticParse: false } });
  assert.equal(updated.apiKey, '');
  assert.equal(updated.features.semanticParse, false);
  const get = t.mock.method(axios, 'get', async (url, config) => {
    assert.equal(url, 'https://provider.test/v1/models');
    assert.equal(config.headers.Authorization, 'Bearer secret');
    return { data: { data: [{ id: 'chat-b' }, { id: 'chat-a' }, { id: 'text-embedding-3-small' }] } };
  });
  assert.deepEqual(await service.getProviderModels({ providerId: 1, baseUrl: stored.baseUrl, apiKey: '' }), { models: ['chat-a', 'chat-b'] });
  get.mock.restore();
  t.mock.method(axios, 'post', async (url, body, config) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(config.headers['x-api-key'], 'secret');
    assert.equal(body.system, 'system');
    assert.equal(body.response_format, undefined);
    return { data: { content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 5, output_tokens: 7 } } };
  });
  const result = await service.requestJsonCompletion({ providerType: 'anthropic', baseUrl: 'https://api.anthropic.com/v1/messages', apiKey: 'secret', model: 'test' }, { modelConfig: {} }, { systemPrompt: 'system', userPrompt: 'user' });
  assert.equal(result.ok, true);
  assert.equal(result.__usage.total_tokens, 12);
  assert.equal(service.resolveChatCompletionsEndpoint(service.providerBaseUrl({ providerType: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' })), 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
});

async function database() {
  const source = new DataSource({ type: 'sqlite', database: ':memory:', entities: [path.resolve('src/**/*.entity.ts')], synchronize: true });
  await source.initialize();
  return source;
}
async function until(predicate) {
  for (let i = 0; i < 150; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('background job did not finish');
}

test('provider context window persists, reloads and clears in the database', async () => {
  const db = await database();
  try {
    const repository = db.getRepository(AIProvider);
    const service = new AiService(repository);
    const created = await service.createProvider({ name: 'Context test', providerType: 'custom', baseUrl: 'https://test.invalid/v1', apiKey: 'secret', model: 'chat', contextWindow: 128000 });
    assert.equal((await repository.findOneBy({ id: created.id })).contextWindow, 128000);
    assert.equal((await service.getProviders())[0].contextWindow, 128000);
    await service.updateProvider(created.id, { contextWindow: 256000, apiKey: '' });
    assert.equal((await repository.findOneBy({ id: created.id })).contextWindow, 256000);
    await service.updateProvider(created.id, { contextWindow: null });
    assert.equal((await repository.findOneBy({ id: created.id })).contextWindow, null);
  } finally { await db.destroy(); }
});

test('background analysis survives client replacement, counts failures and preserves restart status', async () => {
  const db = await database();
  try {
    const project = await db.getRepository(Project).save({ name: 'Job test', createdBy: 'test' });
    const repo = db.getRepository(AIAnalysisJob);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const ai = { validateAnalysisJob: async (_project, ids) => [...new Set(ids)], semanticParseApi: async (_project, id) => { await gate; if (id === 'bad') throw new Error('Provider timeout'); return { tags: ['分析完成'] }; } };
    const jobs = new AIAnalysisJobService(repo, ai);
    const started = await jobs.start(project.id, ['good', 'bad', 'good']);
    assert.equal(started.total, 2);
    await assert.rejects(jobs.start(project.id, ['duplicate']), /已有/);
    const refreshedClient = new AIAnalysisJobService(repo, ai);
    assert.equal((await refreshedClient.active()).id, started.id);
    release();
    await until(async () => (await jobs.get(started.id)).status !== 'running');
    const done = await refreshedClient.get(started.id);
    assert.equal(done.status, 'completed');
    assert.equal(done.processed, 2);
    assert.equal(done.completed, 1);
    assert.equal(done.failed, 1);
    assert.deepEqual(done.results[0].tags, ['分析完成']);
    await repo.update(started.id, { status: 'running' });
    await refreshedClient.onModuleInit();
    assert.equal((await refreshedClient.get(started.id)).status, 'failed');
    assert.match((await refreshedClient.get(started.id)).errors[0], /服务已重启/);
  } finally { await db.destroy(); }
});

test('config switch updates keep model tuning and provider feature flags; disabled flags stay disabled', async () => {
  const db = await database();
  try {
    const project = await db.getRepository(Project).save({ name: 'Config test', createdBy: 'test' });
    const providerRepo = db.getRepository(AIProvider);
    const provider = await providerRepo.save({ name: 'Test', providerType: 'custom', baseUrl: 'https://test.invalid/v1', apiKey: 'secret', model: 'chat', isActive: true, features: { semanticParse: false, testGeneration: true } });
    const configs = db.getRepository(ProjectAIConfig);
    await configs.save({ projectId: project.id, providerId: provider.id, aiEnabled: true, features: { semanticParse: true }, modelConfig: { temperature: .7, maxTokens: 4096, timeout: 90000 } });
    const service = new AiService(providerRepo, configs);
    const config = await service.createConfig({ projectId: project.id, providerId: provider.id, aiEnabled: true });
    assert.deepEqual(config.modelConfig, { temperature: .7, maxTokens: 4096, timeout: 90000 });
    assert.equal(config.features.semanticParse, false);
    assert.equal(config.features.testGeneration, true);
    await assert.rejects(service.ensureFeatureEnabled(project.id, 'semanticParse'), /未开启/);
    await service.deleteProvider(provider.id);
    const stored = await configs.findOneBy({ projectId: project.id });
    assert.equal(stored.aiEnabled, false);
    assert.equal(stored.providerId, null);
  } finally { await db.destroy(); }
});

test('scenario saving rejects cases from another project and normalizes extraction rules', async () => {
  const test = new TestService({ count: async ({ where }) => where.projectId === 'right' ? 1 : 0 });
  await assert.rejects(test.validateScenarioSteps('wrong', [{ testCaseId: 'foreign' }]), /不属于/);
  const rows = await test.validateScenarioSteps('right', [{ testCaseId: 'local', extractRules: [{ key: 'token', path: '$.data.token' }] }]);
  assert.deepEqual(rows[0].extractRules, { token: '$.data.token' });
});

test('a schedule lasting longer than a tick does not execute twice concurrently', async () => {
  const { ScheduleService } = require('../src/modules/schedule/schedule.service');
  const schedule = { id: 1, cron: '* * * * *', enabled: true, nextExecutedAt: new Date(0) };
  let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const service = new ScheduleService({ find: async () => [schedule], update: async () => ({}) }, {});
  service.executeSchedule = async () => { calls++; await gate; };
  const first = service.checkSchedules();
  await new Promise(resolve => setImmediate(resolve));
  await service.checkSchedules();
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal(service.running.size, 0);
});
