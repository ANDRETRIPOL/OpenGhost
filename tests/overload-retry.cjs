'use strict';
// Actual OpenAI stream parser -> provider retry policy -> Chat.request, with fixture transports only.
// No network, application profile, live key, model or agent command is used.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const OVERLOAD = 'Our servers are currently overloaded. Please try again later.';
const codes = ['server_error', 'internal_server_error', 'server_overloaded', 'server_is_overloaded', 'overloaded_error', 'service_unavailable', 'service_unavailable_error', 'temporarily_unavailable', 'rate_limit_exceeded', 'rate_limit_error', 'slow_down'];
const permanent = ['insufficient_quota', 'billing_error', 'content_filter', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'];
const config = { provider: 'openai', id: 'fixture', model: 'fixture', key: 'fixture', effort: 'high', efforts: ['none', 'low', 'high'], ready: true };
const request = { messages: [{ role: 'user', content: 'Continue the fixture task' }], session: 'fixture-session' };
let count = 0;
function check(name, value) { assert.ok(value, name); count++; console.log('ok  ' + name); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const eventText = events => events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('');
const failed = error => ({ type: 'response.failed', response: { error } });
const success = [{ type: 'response.output_text.delta', item_id: 'm1', delta: 'RECOVERED' }, { type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 2 } } }];
function renderer(run, { manual = false, real = false, deepseek = {} } = {}) {
 let listener, attempts = 0, next = 0;
 const waits = [], requests = [], usage = [], timers = new Map();
 const bridge = { onEvent: fn => listener = fn, abort: id => listener({ id, type: 'error', aborted: true }), start: (id, asked) => {
  const attempt = ++attempts; requests.push(JSON.parse(JSON.stringify(asked)));
  queueMicrotask(async () => { try { await run({ id, request: asked, attempt, emit: event => listener({ id, ...event }) }); } catch (error) { listener({ id, type: 'error', status: error.status || 0, code: error.code || '', message: error.message }); } });
 } };
 const c = { window: { openghost: { llm: bridge } }, console, I18n: { t: key => key }, Usage: { record: (...args) => usage.push(args), parts: () => null }, DeepSeek: deepseek,
  UserContext: { pictures: () => [] }, Skills: { blocks: () => '' }, AbortController, DOMException, CustomEvent: class {},
  setTimeout: (fn, ms) => { waits.push(ms); if (real) return setTimeout(fn, ms); const id = ++next; timers.set(id, fn); if (!manual) queueMicrotask(() => { if (timers.delete(id)) fn(); }); return id; },
  clearTimeout: id => real ? clearTimeout(id) : timers.delete(id),
 };
 vm.createContext(c); vm.runInContext(read('providers.js'), c); c.Providers = c.window.Providers;
 return { api: c.Providers, context: c, waits, requests, usage, timers, get attempts() { return attempts; } };
}
function integrated(first, { provider = 'openai', prefixes = [], forever = false, real = false, result = success, status = 200 } = {}) {
 let posts = 0; const bodies = [];
 const engine = { module: { exports: {} }, exports: {}, require, TextDecoder, fetch: async (_url, init) => {
  posts++; bodies.push(JSON.parse(init.body));
  if (status !== 200 && (posts === 1 || forever)) return { ok: false, status, json: async () => ({ error: first }) };
  const packets = posts === 1 || forever ? [...prefixes, first.type === 'error' || first.type === 'response.failed' ? first : failed(first)] : result;
  return { ok: true, body: (async function* () { yield Buffer.from(eventText(packets)); })() };
 } };
 vm.createContext(engine); vm.runInContext(read('desktop/openai.js'), engine);
 const h = renderer(async ({ request: asked, emit }) => {
  const value = await engine.module.exports.stream(asked, { onEvent: emit, chatgpt: async () => ({ access: 'fixture', account: 'fixture' }), version: 'fixture' });
  emit({ type: 'done', result: value });
 }, { real });
 return { ...h, api: h.api, context: h.context, waits: h.waits, bodies, usage: h.usage, requests: h.requests, get posts() { return posts; }, provider };
}
async function rejected(work) { try { await work; return null; } catch (error) { return error; } }
async function main() {
 // This is the exact previously failing case: HTTP 200, then a stream error without status.
 const screenshot = integrated({ code: 'server_error', message: OVERLOAD });
 let value, problem;
 try { value = await screenshot.api.stream(config, request); } catch (error) { problem = error; }
 check('Exact screenshot overload recovers automatically without a manual Retry', !problem && value?.content === 'RECOVERED' && screenshot.posts === 2);
 check('The first retry waits one second and reports usage only once', same(screenshot.waits, [1000]) && screenshot.usage.length === 1);
 for (const code of codes) {
  const h = integrated({ code, message: OVERLOAD });
  const result = await h.api.stream(config, request);
  check('Known transient stream code retries: ' + code, result.content === 'RECOVERED' && h.posts === 2);
 }
 for (const provider of ['openai', 'chatgpt']) {
  const h = integrated({ message: OVERLOAD }, { provider });
  const result = await h.api.stream({ ...config, provider }, request);
  check(provider + ': exact statusless screenshot message is recognized even without a code', h.posts === 2 && result.content === 'RECOVERED');
 }
 for (const error of [{ type: 'server_error', message: OVERLOAD }, { type: 'service_unavailable_error', code: null, message: OVERLOAD }]) {
  const h = integrated(error);
  check('Error type is retained when code is absent: ' + error.type, (await h.api.stream(config, request)).content === 'RECOVERED' && h.posts === 2);
 }
 for (const provider of ['openai', 'chatgpt']) {
  const h = integrated({ type: 'error', message: OVERLOAD }, { provider });
  check(provider + ': an envelope type is not mistaken for a provider code', (await h.api.stream({ ...config, provider }, request)).content === 'RECOVERED' && h.posts === 2);
 }
 const whitespace = integrated({ message: '  OUR SERVERS ARE CURRENTLY OVERLOADED.  Please try again later.  ' });
 check('The exact known message tolerates casing and spacing only', (await whitespace.api.stream(config, request)).content === 'RECOVERED' && whitespace.posts === 2);
 const flat = integrated({ type: 'error', code: 'server_overloaded', message: OVERLOAD });
 check('Flat top-level stream errors also recover', (await flat.api.stream(config, request)).content === 'RECOVERED' && flat.posts === 2);
 const upper = integrated({ code: ' SERVER_ERROR ', message: OVERLOAD });
 check('Code normalization tolerates casing and surrounding whitespace', (await upper.api.stream(config, request)).content === 'RECOVERED');
 const statusCode = integrated({ status_code: 503, code: 'unlisted', message: OVERLOAD });
 check('An explicit stream status_code is honored', (await statusCode.api.stream(config, request)).content === 'RECOVERED' && statusCode.posts === 2);
 for (const code of permanent) {
  const h = integrated({ code, message: OVERLOAD }, { status: 429 });
  check('Billing, quota and content refusals never loop: ' + code, !!await rejected(h.api.stream(config, request)) && h.posts === 1 && h.waits.length === 0);
 }
 for (const status of [400, 401, 402, 403, 404, 422]) {
  const h = integrated({ code: 'server_error', message: OVERLOAD }, { status });
  check('An explicit permanent HTTP status overrides a transient-looking code: ' + status, !!await rejected(h.api.stream(config, request)) && h.posts === 1);
 }
 for (const error of [{ code: 'unknown_error', message: OVERLOAD }, { code: 'invalid_api_key', message: OVERLOAD }, { message: 'Something overloaded while the request was invalid' }, { message: OVERLOAD + ' Invalid key.' }]) {
  const h = integrated(error);
  check('Unknown errors and arbitrary message wording do not cause blind retries', !!await rejected(h.api.stream(config, request)) && h.posts === 1);
 }
 for (const provider of ['anthropic', 'openrouter', 'custom']) {
  const h = renderer(({ emit, attempt }) => emit(attempt === 1 ? { type: 'error', code: 'server_error', message: OVERLOAD } : { type: 'done', result: { content: 'OK' } }));
  check(provider + ': the shared policy accepts a structured overload code', (await h.api.stream({ ...config, provider }, request)).content === 'OK' && h.attempts === 2);
 }
 for (const error of [{ code: 'server_error' }, { status: 500, code: 'server_error' }, { message: OVERLOAD }]) {
  const h = renderer(({ emit }) => emit({ type: 'error', ...error }));
  check('Local model failures are not treated as a remote-service overload', !!await rejected(h.api.stream({ ...config, provider: 'local' }, request)) && h.attempts === 1);
 }
 const authNetwork = renderer(({ emit }) => emit({ type: 'error', status: 401, code: 'network', message: OVERLOAD }));
 check('A real auth status is not retried even if the code says network', (await rejected(authNetwork.api.stream(config, request)))?.status === 401 && authNetwork.attempts === 1);
 const upperQuota = integrated({ code: ' CREDIT_BALANCE_EXHAUSTED ', message: OVERLOAD }, { status: 429 });
 const quotaError = await rejected(upperQuota.api.stream(config, request));
 check('Quota normalization keeps a useful billing message without retrying', upperQuota.posts === 1 && quotaError?.message === 'error.quota');
 const badStatus = integrated({ code: 'server_error', status: 400, message: OVERLOAD });
 check('Permanent numeric statuses inside a stream are respected too', !!await rejected(badStatus.api.stream(config, request)) && badStatus.posts === 1);
 const transportOK = renderer(({ emit, attempt }) => emit(attempt === 1 ? { type: 'error', status: 200, code: 'server_error', message: OVERLOAD } : { type: 'done', result: { content: 'OK' } }));
 check('Transport HTTP 200 cannot hide a structured stream overload', (await transportOK.api.stream(config, request)).content === 'OK' && transportOK.attempts === 2);
 const unknownService = renderer(({ emit }) => emit({ type: 'error', message: OVERLOAD }));
 check('Message-only compatibility is not guessed for arbitrary custom services', !!await rejected(unknownService.api.stream({ ...config, provider: 'custom' }, request)) && unknownService.attempts === 1);
 const perModel = {};
 const parallel = renderer(({ request: asked, emit }) => {
  const n = perModel[asked.model] = (perModel[asked.model] || 0) + 1;
  emit(asked.model === 'A' && n === 1 ? { type: 'error', code: 'server_error', message: OVERLOAD } : { type: 'done', result: { content: asked.model } });
 });
 const both = await Promise.all([parallel.api.stream({ ...config, model: 'A' }, request), parallel.api.stream({ ...config, model: 'B' }, request)]);
 check('Concurrent chats have independent requests and retry budgets', both[0].content === 'A' && both[1].content === 'B' && perModel.A === 2 && perModel.B === 1 && parallel.usage.length === 2);
 const prefixes = [
  { name: 'content', event: { type: 'response.output_text.delta', item_id: 'm', delta: 'PARTIAL' } },
  { name: 'reasoning', event: { type: 'response.reasoning_summary_text.delta', delta: 'THOUGHT' } },
  { name: 'reasoning item', event: { type: 'response.output_item.added', item: { type: 'reasoning' } } },
  { name: 'tool item', event: { type: 'response.output_item.added', item: { type: 'function_call', call_id: 't', name: 'write_file' } } },
  { name: 'tool arguments', event: { type: 'response.function_call_arguments.delta', delta: '{' } },
 ];
 for (const prefix of prefixes) {
  const h = integrated({ code: 'server_error', message: OVERLOAD }, { prefixes: [prefix.event] });
  const error = await rejected(h.api.stream(config, request));
  check('No automatic request replay after ' + prefix.name, !!error && h.posts === 1 && h.waits.length === 0);
  if (prefix.name === 'content') check('An interrupted partial answer stays available', error.partial?.content === 'PARTIAL');
 }
 const keepalive = integrated({ code: 'server_error', message: OVERLOAD }, { prefixes: [{ type: 'response.created', response: { id: 'fixture' } }, { type: 'response.output_text.delta', delta: '' }] });
 check('Metadata and empty text alone do not block a safe retry', (await keepalive.api.stream(config, request)).content === 'RECOVERED' && keepalive.posts === 2);
 const exhausted = integrated({ code: 'server_error', message: OVERLOAD }, { forever: true });
 const end = await rejected(exhausted.api.stream(config, request));
 check('A persistent outage stops after seven requests, not an infinite loop', !!end && exhausted.posts === 7 && same(exhausted.waits, [1000, 2000, 4000, 8000, 16000, 32000]));
 check('Exhaustion preserves the provider’s error and does not invent usage', end.code === 'server_error' && end.message === OVERLOAD && exhausted.usage.length === 0);
 const stop = new AbortController(); const stopped = renderer(({ emit }) => emit({ type: 'error', code: 'server_error', message: OVERLOAD }), { manual: true });
 const waiting = rejected(stopped.api.stream(config, { ...request, signal: stop.signal }));
 for (let i = 0; i < 10 && !stopped.timers.size; i++) await new Promise(setImmediate);
 check('A backoff can wait for cancellation without starting another request', stopped.timers.size === 1 && stopped.attempts === 1);
 stop.abort(); const stoppedError = await waiting;
 check('Stop cancels backoff immediately and prevents another attempt', stoppedError?.name === 'AbortError' && stopped.attempts === 1 && stopped.timers.size === 0);
 const before = new AbortController(); before.abort(); const never = renderer(() => { throw Error('must not start'); });
 check('An already stopped turn sends no request', (await rejected(never.api.stream(config, { ...request, signal: before.signal })))?.name === 'AbortError' && never.attempts === 0);
 const summary = integrated({ code: 'server_error', message: OVERLOAD });
 check('Short jobs such as summaries use the same safe overload retry', await summary.api.complete(config, request) === 'RECOVERED' && summary.posts === 2);
 const prediction = integrated({ code: 'server_error', message: OVERLOAD });
 check('Predictions also recover before any activity', await prediction.api.predict(config, request) === 'RECOVERED' && prediction.posts === 2);
 for (const kind of ['complete', 'predict']) {
  const h = integrated({ code: 'server_error', message: OVERLOAD }, { prefixes: [{ type: 'response.output_text.delta', item_id: 'm', delta: 'PARTIAL' }] });
  check(kind + ': partial output still prevents replay', !!await rejected(h.api[kind](config, request)) && h.posts === 1);
 }
 const toolResult = [{ type: 'response.output_item.done', item: { type: 'function_call', call_id: 'one', name: 'read_file', arguments: '{"path":"fixture.txt"}' } }, { type: 'response.completed', response: { usage: {} } }];
 const tools = integrated({ code: 'server_error', message: OVERLOAD }, { result: toolResult });
 const completed = await tools.api.stream(config, { ...request, tools: [{ type: 'function', function: { name: 'read_file', parameters: {} } }] });
 let executions = 0; for (const call of completed.toolCalls) if (call.function.name === 'read_file') executions++;
 check('A tool returned after recovery is handed to the agent exactly once', executions === 1 && tools.posts === 2);
 check('Retry preserves messages, session, effort and tool schema unchanged', same(tools.bodies[0], tools.bodies[1]) && tools.bodies[1].reasoning.effort === 'high' && tools.bodies[1].prompt_cache_key === 'fixture-session');
 const history = [...request.messages, { role: 'assistant', content: '', tool_calls: [{ id: 'already-done', type: 'function', function: { name: 'read_file', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'already-done', content: 'ALREADY_DONE' }, { role: 'user', content: 'Continue after that completed step' }];
 const continued = integrated({ code: 'server_error', message: OVERLOAD });
 await continued.api.stream(config, { ...request, messages: history });
 check('Earlier completed tool results remain in the retry context exactly once', continued.bodies[1].input.filter(item => item.type === 'function_call_output' && item.call_id === 'already-done' && item.output === 'ALREADY_DONE').length === 1);
 check('Recovery resends context rather than rebuilding or duplicating prior work', same(continued.bodies[0], continued.bodies[1]));
 // Direct DeepSeek streaming uses the shared policy without the Electron LLM bridge.
 let deepPosts = 0;
 const dc = { window: {}, I18n: { t: key => key, has: () => false }, TextDecoderStream, fetch: async () => { deepPosts++; const chunk = deepPosts === 1 ? { error: { code: 'server_error', message: OVERLOAD } } : { choices: [{ delta: { content: 'DEEP RECOVERED' }, finish_reason: 'stop' }] }; return new Response('data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n'); } };
 vm.createContext(dc); vm.runInContext(read('deepseek.js'), dc);
 const deep = renderer(() => {}, { deepseek: dc.window.DeepSeek });
 check('The direct DeepSeek stream also recovers from a structured overload', (await deep.api.stream({ ...config, provider: 'deepseek' }, request)).content === 'DEEP RECOVERED' && deepPosts === 2);
 // The real Chat.request no longer surfaces the screenshot error when recovery succeeds.
 const chatRun = integrated({ code: 'server_error', message: OVERLOAD }); const c = chatRun.context;
 vm.runInContext(read('chat.js'), c);
 const entry = { content: '', steps: [] }, shown = [], conv = { id: 'fixture', record: { id: 'fixture' }, tokens: 0 };
 const turn = { config, controller: new AbortController(), part: { entry, view: { stream: { push: text => shown.push(text) } } } };
 const chat = Object.create(c.window.Chat.prototype);
 Object.assign(chat, { agent: () => false, system: async () => [], history: () => request.messages, notes: () => [], seam: () => 0, session: () => 'fixture-session', dismissGhost() {}, showRetry() { this.retryShown = true; } });
 const response = await chat.request(conv, turn);
 check('Chat.request continues after overload without exposing a fatal error', response.finish === 'stop' && chatRun.posts === 2 && entry.content === 'RECOVERED');
 check('Only the recovered answer is kept in chat history and shown once', entry.steps.length === 1 && same(shown, ['RECOVERED']) && chat.retryShown);
 // One real-timer smoke test verifies that backoff is not merely a fixture shortcut.
 const clock = integrated({ code: 'server_error', message: OVERLOAD }, { real: true }); const started = Date.now();
 await clock.api.stream(config, request);
 check('Actual runtime waits before retrying rather than hammering the provider', clock.posts === 2 && Date.now() - started >= 900 && same(clock.waits, [1000]));
 console.log(`\n${count} checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
