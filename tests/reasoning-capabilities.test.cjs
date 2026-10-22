require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios').default;
const { AiService } = require('../src/modules/ai/ai.service');
const { normalizeEffort, reasoningFromMetadata, reasoningFromError } = require('../src/modules/ai/reasoning-capabilities');
const provider = { providerType: 'custom', baseUrl: 'https://provider.test/v1', model: 'deepseek-v4.1-flash-1017', apiKey: 'secret' };
const failure = (message, extra = {}) => Object.assign(new Error(message), { response: { status: 400, data: { error: { message, ...extra } } } });

test('uses provider model metadata, including levels outside the old low/medium/high list', async t => {
  t.mock.method(axios, 'get', async () => ({ data: { data: [{ id: provider.model, supported_reasoning_efforts: ['high', 'max'] }] } }));
  t.mock.method(axios, 'post', async () => { throw new Error('metadata should not require paid probes'); });
  const service = new AiService({});
  assert.deepEqual(await service.getProviderReasoning(provider), { status: 'supported', levels: ['high', 'max'], source: 'metadata' });
  assert.equal(normalizeEffort(' xhigh '), 'xhigh');
  assert.equal(normalizeEffort(''), null);
  assert.equal(normalizeEffort('not an effort'), null);
  assert.equal(reasoningFromMetadata({ id: 'gpt-5', capabilities: { reasoning: true } }), null);
});

test('validates enum candidates against the selected model instead of treating a generic enum as model support', async t => {
  t.mock.method(axios, 'get', async () => ({ data: { data: [{ id: provider.model }] } }));
  const efforts = [];
  t.mock.method(axios, 'post', async (_url, body) => {
    assert.equal(body.model, provider.model);
    assert.equal(body.max_tokens, 1);
    efforts.push(body.reasoning_effort);
    if (body.reasoning_effort.startsWith('__')) throw failure("Invalid reasoning_effort. Supported values are: 'low', 'high', 'max'.");
    if (body.reasoning_effort === 'low') throw failure("Unsupported value: 'low' is not supported with this model.", { param: 'reasoning_effort' });
    return { data: {} };
  });
  const result = await new AiService({}).getProviderReasoning(provider);
  assert.deepEqual(result.levels, ['high', 'max']);
  assert.deepEqual(efforts, ['__apiforge_invalid_effort__', 'low', 'high', 'max']);
});

test('reads DeepSeek live model effort metadata without sending completion probes', async t => {
  t.mock.method(axios, 'get', async () => ({ data: {
    object: 'list', data: [
      { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash', effort: { supported_levels: ['low', 'high', 'max'], default_level: 'high' } },
      { id: 'other-model', effort: { supported_levels: ['low'] } },
    ],
  } }));
  t.mock.method(axios, 'post', async () => { throw new Error('must use model metadata before probes'); });
  const result = await new AiService({}).getProviderReasoning({ ...provider, model: 'deepseek-flash' });
  assert.deepEqual(result, { status: 'supported', levels: ['low', 'high', 'max'], source: 'metadata' });
  assert.deepEqual(reasoningFromMetadata({ effort: { supported_levels: ['low', 'max'] } }).levels, ['low', 'max']);
  assert.equal(reasoningFromMetadata({ effort: { default_level: 'high' } }), null);
  assert.equal(reasoningFromMetadata({ effort: { supported_levels: [] } }).status, 'unsupported');
});

test('parses DeepSeek backtick enum errors and verifies returned levels', async t => {
  t.mock.method(axios, 'get', async () => ({ data: { data: [] } }));
  const calls = [];
  t.mock.method(axios, 'post', async (_url, body) => {
    calls.push(body.reasoning_effort);
    if (body.reasoning_effort.startsWith('__')) throw failure(
      'Failed to deserialize the JSON body into the target type: reasoning_effort: unknown variant `__apiforge_invalid_effort__`, expected one of `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `ultra`, `max` at line 1 column 140',
    );
    return { data: {} };
  });
  const result = await new AiService({}).getProviderReasoning(provider);
  assert.deepEqual(result.levels, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'ultra', 'max']);
  assert.deepEqual(calls.slice(1), result.levels);
});

test('does not invent capabilities for silently ignored fields, auth errors or unrelated validation errors', async t => {
  t.mock.method(axios, 'get', async () => ({ data: { data: [] } }));
  const post = t.mock.method(axios, 'post', async () => ({ data: {} }));
  const service = new AiService({});
  assert.equal((await service.getProviderReasoning(provider)).status, 'unknown');
  post.mock.mockImplementation(async () => { throw failure("Unsupported parameter: 'reasoning_effort'."); });
  assert.equal((await service.getProviderReasoning(provider)).status, 'unsupported');
  post.mock.mockImplementation(async () => { throw failure("temperature must be one of 'low' or 'high'"); });
  assert.equal((await service.getProviderReasoning(provider)).status, 'unknown');
  post.mock.mockImplementation(async () => { throw { response: { status: 401, data: { error: { message: 'Invalid API key' } } } }; });
  await assert.rejects(service.getProviderReasoning(provider), /Invalid API key/);
});

test('reads structured effort errors without confusing other enum fields', () => {
  assert.deepEqual(reasoningFromError({ error: { param: 'reasoning_effort', allowed_values: ['none', 'xhigh'] } }).levels, ['none', 'xhigh']);
  assert.deepEqual(reasoningFromError({ detail: [{ loc: ['body', 'output_config', 'effort'], msg: "Input should be 'low', 'medium' or 'high'" }] }).levels, ['low', 'medium', 'high']);
  assert.deepEqual(reasoningFromError({ error: { message: "reasoning_effort supported values are: 'low', 'medium', and 'high'" } }).levels, ['low', 'medium', 'high']);
});

test('reuses saved credentials and adapts the output cap when the provider requires max_completion_tokens', async t => {
  const service = new AiService({ findOne: async () => ({ ...provider, id: 1 }) });
  t.mock.method(axios, 'get', async (_url, config) => {
    assert.equal(config.headers.Authorization, 'Bearer secret');
    return { data: { data: [] } };
  });
  t.mock.method(axios, 'post', async (_url, body) => {
    if (body.max_tokens) throw failure("Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead.");
    assert.equal(body.max_completion_tokens, 1);
    if (body.reasoning_effort.startsWith('__')) throw failure("reasoning_effort must be one of ['high', 'xhigh']");
    return { data: {} };
  });
  assert.deepEqual((await service.getProviderReasoning({ providerId: 1, apiKey: '', model: 'new-model' })).levels, ['high', 'xhigh']);
});

test('clears persisted effort with null and passes new levels to both completion protocols without hardcoded budgets', async t => {
  let saved;
  const stored = { ...provider, id: 1, name: 'Test', reasoningEffort: 'high' };
  const service = new AiService({ findOne: async () => stored, create: value => value, save: async value => { saved = value; return value; } });
  await service.updateProvider(1, { reasoningEffort: '' });
  assert.equal(saved.reasoningEffort, null);
  const bodies = [];
  t.mock.method(axios, 'post', async (_url, body) => {
    bodies.push(body);
    return { data: body.output_config ? { content: [{ type: 'text', text: '{"ok":true}' }] } : { choices: [{ message: { content: '{"ok":true}' } }] } };
  });
  const prompts = { systemPrompt: 'system', userPrompt: 'user' };
  await service.requestJsonCompletion({ ...provider, reasoningEffort: 'max' }, { modelConfig: {} }, prompts);
  await service.requestJsonCompletion({ ...provider, providerType: 'anthropic', reasoningEffort: 'xhigh' }, { modelConfig: {} }, prompts);
  assert.equal(bodies[0].reasoning_effort, 'max');
  assert.deepEqual(bodies[1].output_config, { effort: 'xhigh' });
  assert.equal(bodies[1].thinking, undefined);
});
