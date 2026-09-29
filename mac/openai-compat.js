(function (root, factory) {
 'use strict';
 // The same file serves the page, where DeepSeek is called straight from the renderer, and the main process,
 // where a local or custom server is called without the browser's cross-origin rules in the way.
 if (typeof module === 'object' && module.exports) module.exports = factory();
 else root.OpenAICompat = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
'use strict';

// Any server that speaks the OpenAI Chat Completions protocol: DeepSeek, Ollama, llama.cpp, LM Studio, vLLM and the like.
// Every call takes an endpoint, { baseURL, key, kind }, so nothing here is tied to one service.
// The kind says which extras the server takes: 'deepseek' gets its thinking switch, anything else gets only the standard fields.
const DEEPSEEK_URL = 'https://api.deepseek.com/v1';
const DUMMY_KEY = 'not-needed';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const DEFAULT_EFFORTS = ['none', 'low', 'high', 'max'];
// Standard reasoning levels; a server that doesn't take reasoning_effort ignores the field.
const STANDARD_EFFORTS = new Set(['low', 'medium', 'high']);
const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';

class CompatError extends Error {
 constructor(message, status = 0, code = '') {
  super(message);
  this.name = 'CompatError';
  this.status = status;
  this.code = code;
 }
}

// A pasted address comes in every shape: with or without /v1, with a trailing slash, even with /chat/completions on the end.
function normalize(baseURL) {
 let url = String(baseURL || '').trim();
 if (!url) return DEEPSEEK_URL;
 if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
 url = url.replace(/\/+$/, '').replace(/\/(chat\/completions|completions|models)$/i, '');
 try {
  const parsed = new URL(url);
  if (parsed.pathname === '' || parsed.pathname === '/') return `${parsed.origin}/v1`;
 } catch {}
 return url;
}

function hostOf(baseURL) {
 try { return new URL(normalize(baseURL)).host; } catch { return String(baseURL || ''); }
}

// A server on this computer usually wants no key at all; a dummy one keeps strict proxies happy.
function isLocal(baseURL) {
 try {
  const { hostname } = new URL(normalize(baseURL));
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
 } catch {
  return false;
 }
}

function keyFor(endpoint) {
 const key = String(endpoint?.key || '').trim();
 if (key) return key;
 return isLocal(endpoint?.baseURL) ? DUMMY_KEY : '';
}

function describe(endpoint = {}) {
 const baseURL = normalize(endpoint.baseURL);
 return { baseURL, key: keyFor({ ...endpoint, baseURL }), kind: endpoint.kind || 'custom', host: hostOf(baseURL), local: isLocal(baseURL) };
}

async function request(endpoint, path, options = {}) {
 const { baseURL, key } = describe(endpoint);
 // A key must be plain ASCII to travel in a header; anything else is a paste gone wrong, not a key.
 if (key && !/^[\x21-\x7e]+$/.test(key)) throw new CompatError('The API key has characters a key can\'t have', 401, 'key');
 const headers = { ...options.headers };
 if (key) headers.Authorization = `Bearer ${key}`;
 let response;
 try {
  response = await fetch(baseURL + path, { ...options, headers });
 } catch (error) {
  if (error.name === 'AbortError') throw error;
  throw new CompatError(`Can't connect to ${hostOf(baseURL)}`, 0, 'network');
 }
 if (response.ok) return response;
 let detail = '', code = '';
 try {
  const body = await response.json();
  detail = body.error?.message || body.message || (typeof body.error === 'string' ? body.error : '') || '';
  code = body.error?.code || body.error?.type || '';
 } catch {}
 throw new CompatError(detail || `${hostOf(baseURL)} returned error ${response.status}`, response.status, typeof code === 'string' ? code : '');
}

function effortsOf(model, kind) {
 // Local and custom servers differ in what reasoning fields they take, and some refuse a thinking switch outright,
 // so those get the server's own default: no reasoning field is sent at all.
 if (kind !== 'deepseek') return ['none'];
 const raw = model.effort?.supported_levels || model.reasoning_efforts || model.supported_reasoning_efforts || model.efforts;
 if (!Array.isArray(raw)) return DEFAULT_EFFORTS.slice();
 const levels = raw.map(item => typeof item === 'string' ? item : item?.id || item?.name).filter(Boolean);
 if (!levels.length) return DEFAULT_EFFORTS.slice();
 // The API lists only thinking levels; none is the app's own step that turns thinking off, which every model allows.
 const known = DEFAULT_EFFORTS.filter(level => level === 'none' || levels.includes(level));
 const extra = levels.filter(level => !DEFAULT_EFFORTS.includes(level));
 return [...known, ...extra];
}

// Names of multimodal local models, for a server that doesn't say what a model can see.
const SEES = /llava|vision|-vl\b|vl-|minicpm-v|moondream|pixtral|bakllava/i;

async function listModels(endpoint, signal) {
 const { kind } = describe(endpoint);
 const body = await (await request(endpoint, '/models', { signal })).json();
 const list = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
 return list.filter(model => model?.id).map(model => ({
  id: model.id,
  name: model.name || '',
  context: Number(model.context_window || model.context_length || model.max_context_length) || 0,
  efforts: effortsOf(model, kind),
  defaultEffort: kind === 'deepseek' ? model.effort?.default_level || '' : 'none',
  vision: Array.isArray(model.input_modalities) ? model.input_modalities.includes('image') : kind === 'deepseek' ? true : SEES.test(model.id),
 }));
}

// A text-only model rejects image parts, so pictures in the history turn into a short note instead.
function textOnly(messages) {
 return messages.map(message => {
  if (!Array.isArray(message.content)) return message;
  const content = message.content.map(part => part.type === 'image_url' ? NO_VISION : part.text || '').filter(Boolean).join('\n\n');
  return { ...message, content };
 });
}

// DeepSeek takes its own thinking switch; everything else gets the standard reasoning_effort, and only when a level is chosen.
function reasoning(kind, effort) {
 if (kind === 'deepseek') return { thinking: { type: effort === 'none' ? 'disabled' : 'enabled' }, reasoning_effort: effort };
 return STANDARD_EFFORTS.has(effort) ? { reasoning_effort: effort } : {};
}

function body({ endpoint, model, effort = 'none', vision = true, messages, tools, maxTokens }) {
 const { kind } = describe(endpoint);
 return {
  model,
  // Blocks another provider left on a message mean nothing here.
  messages: (vision ? messages : textOnly(messages)).map(({ native, ...message }) => message),
  ...(tools?.length ? { tools } : {}),
  ...(maxTokens ? { max_tokens: maxTokens } : {}),
  ...reasoning(kind, effort),
 };
}

async function streamChat(options) {
 const { endpoint, signal, onReasoning, onContent } = options;
 const response = await request(endpoint, '/chat/completions', {
  method: 'POST',
  signal,
  headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
  body: JSON.stringify({ ...body(options), stream: true, stream_options: { include_usage: true } }),
 });
 const calls = [];
 const result = { finishReason: null, usage: null, content: '', reasoning: '', toolCalls: calls };
 const done = () => {
  result.toolCalls = calls.filter(call => call?.function.name);
  return result;
 };
 const take = chunk => {
  if (chunk.error) throw new CompatError(chunk.error.message || `${hostOf(endpoint?.baseURL)} stopped the answer`, Number(chunk.error.status) || 0, chunk.error.code || '');
  if (chunk.usage) result.usage = chunk.usage;
  const choice = chunk.choices && chunk.choices[0];
  if (!choice) return;
  const delta = choice.delta || {};
  // DeepSeek and llama.cpp stream thinking as reasoning_content, Ollama as reasoning.
  const thought = delta.reasoning_content || delta.reasoning;
  if (typeof thought === 'string' && thought) {
   result.reasoning += thought;
   onReasoning?.(thought, result);
  }
  if (delta.content) {
   result.content += delta.content;
   onContent?.(delta.content, result);
  }
  for (const part of delta.tool_calls || []) {
   const call = calls[part.index ?? calls.length] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
   if (part.id) call.id = part.id;
   if (part.function?.name) call.function.name += part.function.name;
   if (part.function?.arguments) call.function.arguments += part.function.arguments;
  }
  if (choice.finish_reason) result.finishReason = choice.finish_reason;
 };
 try {
  for await (const data of events(response.body)) {
   if (data === '[DONE]') return done();
   take(JSON.parse(data));
  }
 } catch (error) {
  if (error.name === 'AbortError') throw Object.assign(error, { partial: done() });
  if (error instanceof CompatError) throw error;
  throw new CompatError(`Connection to ${hostOf(endpoint?.baseURL)} was interrupted`, 0, 'interrupted');
 }
 // A local server sometimes closes the stream without a [DONE] line; a finished stream with an answer still counts.
 return done();
}

// Server-sent events, one data line at a time: every server here puts a whole JSON chunk on one line, with \n or \r\n ends.
async function* events(stream) {
 const reader = stream.getReader();
 const decoder = new TextDecoder();
 let buffer = '';
 const payload = line => line.startsWith('data:') ? line.slice(5).trim() : '';
 try {
  for (;;) {
   const { value, done } = await reader.read();
   if (done) break;
   buffer += decoder.decode(value, { stream: true });
   const lines = buffer.split(/\r?\n/);
   buffer = lines.pop();
   for (const line of lines) {
    const data = payload(line);
    if (data) yield data;
   }
  }
  const rest = payload(buffer + decoder.decode());
  if (rest) yield rest;
 } finally {
  reader.cancel().catch(() => {});
 }
}

// Short side jobs, such as naming a chat, get a plain answer with thinking off where the server has a switch for it.
async function complete(options) {
 const { endpoint, signal, maxTokens = 40 } = options;
 signal?.throwIfAborted();
 const response = await request(endpoint, '/chat/completions', {
  method: 'POST',
  signal,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...body({ ...options, effort: 'none', maxTokens }), stream: false }),
 });
 const reply = await response.json();
 return reply.choices?.[0]?.message?.content?.trim() || '';
}

return { DEEPSEEK_URL, CompatError, normalize, hostOf, isLocal, listModels, streamChat, complete };
});
