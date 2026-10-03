'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { models, stream, base } = require('../desktop/compatible');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
test('validates endpoints and preserves proxy prefixes', () => {
 assert.equal(base('http://localhost:4000/v1/'), 'http://localhost:4000/v1');
 for (const value of ['file:///tmp/model', 'https://user:pass@host/v1', 'https://host/v1?key=secret']) assert.throws(() => base(value));
});
test('discovers arbitrary models without authentication', async () => {
 global.fetch = async (url, options) => {
  assert.equal(url, 'http://localhost:4000/v1/models');
  assert.equal(options.headers.Authorization, undefined);
  return Response.json({ data: [{ id: 'local-qwen', context_window: 8192 }, { id: 'proxy-model' }] });
 };
 const list = await models({ baseUrl: 'http://localhost:4000/v1' });
 assert.deepEqual(list.map(item => item.api), ['local-qwen', 'proxy-model']);
 assert.equal(list[0].context, 8192);
 assert.deepEqual(list[0].efforts, ['none']);
});
test('streams fragmented tool calls, text, reasoning and usage with a proxy key', async () => {
 let sent;
 const events = [];
 global.fetch = async (url, options) => {
  assert.equal(url, 'https://proxy.example/v1/chat/completions');
  assert.equal(options.headers.Authorization, 'Bearer test-proxy-key');
  sent = JSON.parse(options.body);
  const chunks = [
   { choices: [{ delta: { content: 'Hello', reasoning_content: 'Think', tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read', arguments: '{"' } }] } }] },
   { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'path":"a"}' } }] }, finish_reason: 'tool_calls' }] },
   { choices: [], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } },
  ].map(item => `data: ${JSON.stringify(item)}\r\n\r\n`).join('') + 'data: [DONE]';
  const bytes = new TextEncoder().encode(chunks);
  return new Response(new ReadableStream({ start(controller) {
   for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
   controller.close();
  } }));
 };
 const result = await stream({ baseUrl: 'https://proxy.example/v1', key: 'test-proxy-key', model: 'custom', maxTokens: 20,
  messages: [{ role: 'assistant', content: 'Previous', native: {}, cache: true }, { role: 'tool', tool_call_id: 'old', content: 'OK' }],
  tools: [{ type: 'function', function: { name: 'read', parameters: {} } }],
 }, { onEvent: event => events.push(event) });
 assert.equal(sent.messages[0].native, undefined);
 assert.equal(sent.messages[0].cache, undefined);
 assert.equal(sent.messages[1].tool_call_id, 'old');
 assert.equal(sent.max_tokens, 20);
 assert.equal(sent.reasoning_effort, undefined);
 assert.equal(sent.tools[0].function.name, 'read');
 assert.equal(result.content, 'Hello');
 assert.equal(result.reasoning, 'Think');
 assert.equal(result.toolCalls[0].function.arguments, '{"path":"a"}');
 assert.equal(result.finishReason, 'tool_calls');
 assert.equal(result.usage.total_tokens, 7);
 assert.equal(events.length, 2);
});
test('reports authentication failures', async () => {
 global.fetch = async () => Response.json({ error: { message: 'Invalid proxy key' } }, { status: 401 });
 await assert.rejects(models({ baseUrl: 'https://proxy.example/v1' }), { message: 'Invalid proxy key', status: 401 });
});
test('passes cancellation to the transport', async () => {
 const controller = new AbortController(); controller.abort();
 global.fetch = async (url, { signal }) => { signal.throwIfAborted(); };
 await assert.rejects(stream({ baseUrl: 'http://localhost:4000/v1', messages: [] }, { signal: controller.signal }), { name: 'AbortError' });
});
test('settings enable keyless servers and pass endpoint to model discovery', async () => {
 const vm = require('node:vm'), fs = require('node:fs');
 const window = {};
 let options;
 vm.runInNewContext(fs.readFileSync(require.resolve('../settings.js'), 'utf8'), {
  window, Providers: { models: async (provider, key, value) => { options = value; return [{ id: 'compatible:local', api: 'local', provider, efforts: ['none'], vision: false }]; } },
 });
 const settings = Object.create(window.Settings.prototype);
 Object.assign(settings, { baseUrl: 'http://localhost:4000/v1', keys: { compatible: '' }, checks: {}, catalog: {}, effort: 'high', saveCatalog() {}, changed() {} });
 assert.equal(settings.connected('compatible'), true);
 await settings.refresh('compatible');
 assert.equal(options.baseUrl, settings.baseUrl);
 settings.models = settings.catalog.compatible;
 const config = settings.configFor('compatible:local');
 assert.equal(config.ready, true);
 assert.equal(config.key, '');
 assert.equal(config.baseUrl, settings.baseUrl);
 assert.equal(config.effort, 'none');
});
test('renderer forwards endpoint for agent and side-job requests', async () => {
 const vm = require('node:vm'), fs = require('node:fs');
 let listener, sent;
 const window = { openghost: { llm: {
  onEvent(fn) { listener = fn; },
  start(id, request) { sent = request; listener({ id, type: 'done', result: { content: 'OK' } }); },
 } } };
 vm.runInNewContext(fs.readFileSync(require.resolve('../providers.js'), 'utf8'), { window, Usage: { record() {} }, I18n: { t: key => key } });
 const config = { provider: 'compatible', baseUrl: 'http://localhost:4000/v1', key: '', model: 'local', efforts: ['none'] };
 await window.Providers.stream(config, { messages: [] });
 assert.equal(sent.baseUrl, config.baseUrl);
 assert.equal(sent.model, 'local');
 assert.equal(await window.Providers.complete(config, { messages: [], maxTokens: 12 }), 'OK');
 assert.equal(sent.baseUrl, config.baseUrl);
 assert.equal(sent.maxTokens, 12);
});
