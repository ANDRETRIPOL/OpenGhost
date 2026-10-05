'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const pictures = [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,eA==' } }] }];
function openai(entries, fallback = false) {
 const requests = [], module = { exports: {} };
 const fetch = async (url, options = {}) => {
  if (options.method === 'POST') { requests.push(JSON.parse(options.body)); return new Response('data: {"type":"response.completed","response":{}}\n\n'); }
  if (url.includes('client_version')) return fallback ? new Response('', { status: 500 }) : Response.json({ models: entries });
  return Response.json({ data: entries.map(entry => ({ id: entry.slug })) });
 };
 vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'desktop/openai.js'), 'utf8'), { module, require, fetch, TextDecoder });
 return { api: module.exports, requests };
}
function anthropic() {
 const requests = [], listed = [];
 class SDK {
  constructor() { this.models = { list: async function* () { yield* listed; } }; this.messages = this.beta = { messages: null, stream: params => {
   requests.push(params); return { on() {}, finalMessage: async () => ({ content: [], stop_reason: 'end_turn' }) };
  } }; this.beta.messages = this.messages; }
 }
 SDK.APIUserAbortError = SDK.APIConnectionError = SDK.APIError = class extends Error {};
 const module = { exports: {} };
 vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'desktop/anthropic.js'), 'utf8'), { module, require: () => SDK });
 return { api: module.exports, requests, listed };
}
function deepseek(entries = []) {
 const requests = [], window = {};
 const context = vm.createContext({ window, TextDecoderStream, I18n: { has: () => false, t: key => key }, fetch: async (url, options) => {
  if (url.endsWith('/models')) return Response.json({ data: entries });
  const body = JSON.parse(options.body); requests.push(body);
  return body.stream ? new Response('data: [DONE]\n') : Response.json({ choices: [{ message: { content: 'done' } }] });
 } });
 vm.runInContext(fs.readFileSync(path.join(ROOT, 'deepseek.js'), 'utf8'), context);
 return { api: window.DeepSeek, requests };
}

test('OpenAI and ChatGPT catalogs preserve missing, malformed and explicit capabilities', async () => {
 const entries = [undefined, null, [], 'high', {}, [null, 1, '', '  '], ['brief', { effort: 'deep' }, { effort: false }]].map((levels, i) => ({
  slug: `gpt-${i + 1}`, visibility: 'list', supported_reasoning_levels: levels,
  ...(i === 6 ? { input_modalities: ['image'], context_window: 128000, default_reasoning_level: 'deep' } : {}),
 }));
 for (const provider of ['openai', 'chatgpt']) {
  const { api } = openai(entries);
  const models = await api.models({ provider, key: 'fixture' }, { chatgpt: async () => ({ access: 'fixture' }) });
  for (const model of models.slice(0, 6)) {
   assert.equal(model.context, 0); assert.equal(model.vision, null);
   assert.deepEqual(plain(model.efforts), []); assert.equal(model.defaultEffort, '');
  }
  assert.deepEqual(plain(models[6].efforts), ['brief', 'deep']);
  assert.equal(models[6].vision, true); assert.equal(models[6].context, 128000); assert.equal(models[6].defaultEffort, 'deep');
 }
 const { api } = openai([{ slug: 'gpt-5', visibility: 'list' }], true);
 const [named] = await api.models({ provider: 'openai', key: 'fixture' });
 assert.equal(named.api, 'gpt-5'); assert.equal(named.context, 0); assert.equal(named.vision, null); assert.deepEqual(plain(named.efforts), []);
});

test('OpenAI/ChatGPT requests omit missing effort and images with unknown support; explicit support remains', async () => {
 for (const provider of ['openai', 'chatgpt']) for (const vision of [undefined, null, false, 'true', true]) for (const effort of [undefined, '', 'none', 'custom']) {
  const { api, requests } = openai([]);
  await api.stream({ provider, key: 'fixture', model: 'm', vision, effort, messages: pictures }, { chatgpt: async () => ({ access: 'fixture' }) });
  const body = requests[0], part = body.input[0].content[0];
  assert.equal(part.type, vision === true ? 'input_image' : 'input_text');
  if (vision !== true) assert.match(part.text, vision === false ? /can't see/ : /unknown/);
  assert.equal(body.reasoning?.effort, effort || undefined);
  assert.equal(Object.hasOwn(body, 'reasoning'), !!effort);
 }
});

test('DeepSeek catalogs do not add none, context, vision or defaults, and retain custom levels', async () => {
 const entries = [{ id: 'missing' }, { id: 'empty', efforts: [] }, { id: 'malformed', efforts: [null, 3, false, '', ' '], context_window: -1 },
  { id: 'custom', effort: { supported_levels: ['brief', { id: 'deep' }], default_level: 'deep' }, input_modalities: ['text'], context_window: 2000000 }];
 const { api } = deepseek(entries); const models = await api.listModels('fixture');
 for (const model of models.slice(0, 3)) { assert.deepEqual(plain(model.efforts), []); assert.equal(model.vision, null); assert.equal(model.context, 0); assert.equal(model.defaultEffort, ''); }
 assert.deepEqual(plain(models[3].efforts), ['brief', 'deep']); assert.equal(models[3].defaultEffort, 'deep'); assert.equal(models[3].vision, false);
});

test('DeepSeek stream and auxiliary calls omit unknown thinking and use strict image support', async () => {
 for (const method of ['streamChat', 'complete']) for (const vision of [undefined, false, true]) for (const effort of [undefined, '', 'none', 'deep']) {
  const { api, requests } = deepseek();
  await api[method]({ key: 'fixture', model: 'm', messages: pictures, vision, effort });
  const body = requests[0];
  assert.equal(body.thinking?.type, effort ? effort === 'none' ? 'disabled' : 'enabled' : undefined);
  assert.equal(body.reasoning_effort, effort || undefined);
  assert.equal(Array.isArray(body.messages[0].content), vision === true);
  if (vision !== true) assert.match(body.messages[0].content, vision === false ? /can't see/ : /unknown/);
 }
});

test('Anthropic absent capabilities remain unknown; explicit adaptive levels and budget presets survive', async () => {
 const { api, listed } = anthropic(); listed.push({ id: 'missing' });
 const [missing] = await api.models({ key: 'fixture' });
 assert.equal(missing.context, 0); assert.equal(missing.output, 0); assert.equal(missing.vision, null); assert.deepEqual(plain(missing.efforts), []); assert.equal(missing.defaultEffort, '');
 const adaptive = api.describe({ id: 'adaptive', max_input_tokens: 100000, max_tokens: 8000, capabilities: { image_input: { supported: false }, thinking: { types: { adaptive: { supported: true } } }, effort: { brief: { supported: true }, deep: { supported: true }, invalid: { supported: 'yes' } } } });
 assert.deepEqual(plain(adaptive.efforts), ['brief', 'deep']); assert.equal(adaptive.defaultEffort, ''); assert.equal(adaptive.vision, false);
 const empty = api.describe({ id: 'empty', capabilities: { thinking: { types: { adaptive: { supported: true } } } } });
 assert.deepEqual(plain(empty.efforts), []);
 const budget = api.describe({ id: 'budget', capabilities: { thinking: { types: { enabled: { supported: true }, disabled: { supported: true } } } } });
 assert.deepEqual(plain(budget.efforts), ['none', 'low', 'high']); assert.equal(budget.effortSource, 'application-budget-presets');
});

test('Anthropic request allowance is not catalog metadata and absent effort never enables thinking', async () => {
 const { api, requests } = anthropic();
 for (const vision of [undefined, false, true]) for (const thinking of [undefined, 'adaptive', 'budget']) {
  const body = api.build({ model: 'm', vision, thinking, messages: pictures });
  assert.ok(body.max_tokens > 0); assert.equal(body.thinking, undefined); assert.equal(body.output_config, undefined);
  assert.equal(body.messages[0].content[0].type, vision === true ? 'image' : 'text');
  if (vision !== true) assert.match(body.messages[0].content[0].text, vision === false ? /can't see/ : /unknown/);
 }
 const body = api.build({ model: 'm', messages: [], thinking: 'adaptive', effort: 'custom', maxTokens: 100, output: 50 });
 assert.equal(body.output_config.effort, 'custom'); assert.equal(body.max_tokens, 50);
 assert.equal(api.build({ messages: [], thinking: 'budget', effort: 'low' }).thinking.budget_tokens, 4096);
 const auxiliary = api.build({ messages: [], thinking: 'budget', effort: 'low', maxTokens: 2048, once: true });
 assert.equal(auxiliary.max_tokens, 4097, 'short auxiliary requests must leave room above an explicitly supported budget');
 assert.throws(() => api.build({ messages: [], thinking: 'budget', effort: 'low', output: 4096 }), /does not fit/);
 await api.stream({ key: 'fixture', model: 'm', messages: pictures }, {});
 assert.equal(requests[0].thinking, undefined);
});

test('provider catalogs reject malformed windows without losing valid numeric metadata', async () => {
 for (const value of [undefined, null, -1, 0, '200000', true, {}, [], 128000]) {
  const expected = value === 128000 ? value : 0;
  const oa = openai([{ slug: 'gpt-5', visibility: 'list', context_window: value, input_modalities: ['text'] }]);
  const [one] = await oa.api.models({ provider: 'openai', key: 'fixture' });
  assert.equal(one.context, expected); assert.equal(one.vision, false);
  const [two] = await deepseek([{ id: 'm', context_window: value, input_modalities: ['image'] }]).api.listModels('fixture');
  assert.equal(two.context, expected); assert.equal(two.vision, true);
  const three = anthropic().api.describe({ id: 'm', max_input_tokens: value, max_tokens: value });
  assert.equal(three.context, expected); assert.equal(three.output, expected);
 }
 const { api } = anthropic();
 assert.deepEqual(plain(api.describe({ id: 'm', capabilities: { effort: [{ supported: true }], thinking: { types: { adaptive: { supported: true } } } } }).efforts), []);
});

test('Providers auxiliary routing selects only known levels, including the DeepSeek path', async () => {
 for (const provider of ['openai', 'chatgpt', 'deepseek', 'anthropic']) for (const efforts of [undefined, [], ['brief', 'deep'], ['high', 'none']]) {
  let listener, captured;
  const window = { openghost: { llm: { onEvent: fn => { listener = fn; }, start: (id, request) => { captured = request; listener({ id, type: 'done', result: { content: 'done' } }); } } } };
  const context = vm.createContext({ window, Usage: { record() {} }, DeepSeek: { complete: async request => { captured = request; return { content: 'done' }; } } });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'providers.js'), 'utf8'), context);
  await window.Providers.complete({ provider, model: 'm', efforts }, { messages: [] });
  assert.equal(captured.effort, efforts?.includes('none') ? 'none' : efforts?.[0]);
  assert.equal(captured.vision, undefined);
 }
});
