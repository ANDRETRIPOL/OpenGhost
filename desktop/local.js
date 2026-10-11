'use strict';

// Models behind an address the user gives. Two providers use this file:
// `local`, a server on the user's own computer (Ollama, LM Studio, llama.cpp), where the address stands in the key's
// place and no key is sent; and `custom`, any service that speaks the OpenAI API, with its base address and a key if it
// asks for one. The app runs no model itself.
//
// Everything said here about a server is from its own documentation, read on 2026-10-11:
//   Ollama      docs.ollama.com/api (tags, ps, show, chat), /api/openai-compatibility, /context-length
//   LM Studio   lmstudio.ai/docs/developer/rest (v1: /api/v1/models; v0: /api/v0/models)
//   llama.cpp   tools/server/README.md (/props, /v1/models)
// Ollama is spoken to in its own API, not the OpenAI one: its documentation says the OpenAI API has no way of setting a
// model's context size, and Ollama starts a model with 4,096 tokens on most computers, far less than the agent's
// instructions take. Every other server is spoken to through Chat Completions, made from the OpenRouter engine.
const http = require('node:http');
const https = require('node:https');

const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';
// A server that does not answer a question about itself is not waited for.
const ASK = 2500;
// The window the app asks Ollama for when the user names none and the model runs with less.
const AUTO = 32768;

const error = (message, status = 0, code = '') => Object.assign(new Error(message), { status, code });

// The address as the user may have typed it: with or without http://, a slash at its end, or the /v1 a guide told
// them to add.
function origin(address) {
 const typed = String(address || '').trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
 if (!typed) throw error('network', 0, 'network');
 return /^https?:\/\//i.test(typed) ? typed : `http://${typed}`;
}

// Where a request goes. A local server's address is its root, and the OpenAI API is under /v1 there. A service's
// address is the base its documentation gives, used as it stands; when nothing answers there and it names no version,
// /v1 is tried after it, and what answered is remembered.
const found = new Map();
function place(request) {
 if (request.provider !== 'custom') {
  const root = origin(request.key);
  return { id: root, bases: [`${root}/v1`], root, token: '' };
 }
 const typed = String(request.address || '').trim().replace(/\/+$/, '');
 if (!typed) throw error('network', 0, 'network');
 const base = /^https?:\/\//i.test(typed) ? typed : `${/^(localhost|127\.|10\.|192\.168\.|\[)/i.test(typed) ? 'http' : 'https'}://${typed}`;
 const bases = /\/v\d+[a-z]*\d*(\/[\w-]+)*$/i.test(base) ? [base] : [base, `${base}/v1`];
 const known = found.get(base);
 return { id: base, bases: known ? [known, ...bases.filter(item => item !== known)] : bases, root: '', token: String(request.key || '').trim() };
}

const auth = token => token ? { Authorization: `Bearer ${token}` } : {};

// A request for an answer that may be long in coming. A model on a slow computer reads the agent's instructions for
// minutes before it sends anything at all, and `fetch` gives up on a server that has sent no headers within five (seen
// with a real Ollama on a machine with no graphics card: the chat failed at 304 seconds). This one waits as long as the
// model takes, and stops only when the user stops it. It answers in the shape of a fetch response: `ok`, `status`,
// `body` to read in pieces, `json()`.
function patient(url, { method = 'POST', headers = {}, body, signal } = {}) {
 return new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })); return; }
  const target = new URL(url);
  const request = (target.protocol === 'https:' ? https : http).request(target, {
   method,
   // A connection of its own for every request: llama.cpp closes one after an answer, and a request sent down a
   // connection kept from the last answer dies with it (seen with a real llama.cpp: the second message failed).
   agent: false,
   headers: { ...headers, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
  }, response => {
   resolve({
    ok: response.statusCode >= 200 && response.statusCode < 300,
    status: response.statusCode,
    body: response,
    json: async () => { const pieces = []; for await (const piece of response) pieces.push(piece); return JSON.parse(Buffer.concat(pieces).toString('utf8')); },
   });
  });
  const stop = () => request.destroy(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  signal?.addEventListener('abort', stop, { once: true });
  request.on('error', cause => reject(cause));
  request.on('close', () => signal?.removeEventListener('abort', stop));
  request.end(body);
 });
}

// One request to the OpenAI API, at the first of the place's addresses that has such a path.
// `patient`: for a chat, whose answer may be long in coming.
async function reach(where, path, init = {}, ask = fetch) {
 let response;
 for (const base of where.bases) {
  response = await ask(`${base}${path}`, { ...init, headers: { ...auth(where.token), ...init.headers } });
  if (response.status !== 404 && response.status !== 405) {
   found.set(where.id, base);
   where.bases = [base, ...where.bases.filter(item => item !== base)];
   break;
  }
 }
 return response;
}

async function failure(response) {
 let detail = '';
 try {
  const body = await response.json();
  detail = typeof body.error === 'string' ? body.error : body.error?.message || body.message || '';
 } catch {}
 return error(detail || `The server returned error ${response.status}`, response.status);
}

async function ask(url, init = {}) {
 const response = await fetch(url, { ...init, signal: AbortSignal.timeout(ASK) });
 if (!response.ok) throw await failure(response);
 return response.json();
}

const number = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0;
const refusedTools = new Set(), refusedPictures = new Set();
// Lists of models also hold ones that are no chat models, and say so only in their names.
const NOT_CHAT = /whisper|tts|embed|rerank|moderation|speech|transcri|dall-e/i;

// What a local server is, found out by which of its own pages answers, and remembered for the address.
// Each kind answers with its models: `id`, and what the server tells of each. `context` is the window the model will
// work in; `limit` the largest it can take; zero where the server does not say.
const kinds = new Map();

// Ollama. /api/tags lists the models by the names every other call takes. /api/show tells what a model was trained
// for (`model_info["<architecture>.context_length"]`) and what it can do (`capabilities`). /api/ps tells the window a
// running model was started with (`context_length`). The window the app will work in is the one it asks for itself with
// every request (see `chatOllama`): what the model already runs with when that is enough, AUTO otherwise, and never
// more than the model was trained for.
async function ollama(root) {
 const [tags, ps] = await Promise.all([ask(`${root}/api/tags`), ask(`${root}/api/ps`).catch(() => ({}))]);
 if (!Array.isArray(tags.models)) throw error('not Ollama');
 const running = new Map((ps.models || []).map(item => [item.name || item.model, number(item.context_length)]));
 return Promise.all(tags.models.map(item => item?.name || item?.model).filter(name => typeof name === 'string' && name).map(async id => {
  const shown = await ask(`${root}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: id }) }).catch(() => null);
  const limit = number(Object.entries(shown?.model_info || {}).find(([name]) => name.endsWith('.context_length'))?.[1]);
  const can = Array.isArray(shown?.capabilities) ? shown.capabilities : null, runs = running.get(id) || 0;
  const context = runs >= AUTO ? runs : limit ? Math.min(limit, AUTO) : AUTO;
  return { id, context, limit, chat: can ? can.includes('completion') : undefined, vision: can ? can.includes('vision') : undefined, tools: can ? can.includes('tools') : undefined };
 }));
}

// LM Studio, its v1 API: `models[]` with `key`, `type` (llm, embedding, decision), `max_context_length`,
// `loaded_instances[].config.context_length` (the window a loaded model really has) and `capabilities.vision`.
async function lmstudio(root) {
 const list = (await ask(`${root}/api/v1/models`)).models;
 if (!Array.isArray(list)) throw error('not LM Studio');
 return list.filter(item => typeof item?.key === 'string' && item.key).map(item => ({
  id: item.key,
  // The model may be loaded under a name of its own: the chat API takes that name too.
  also: (item.loaded_instances || []).map(instance => instance?.id).filter(Boolean),
  chat: item.type ? item.type === 'llm' : undefined,
  context: number(item.loaded_instances?.[0]?.config?.context_length),
  limit: number(item.max_context_length),
  vision: item.capabilities ? !!item.capabilities.vision : undefined,
 }));
}

// LM Studio before it had v1: `data[]` with `id`, `type` (llm, vlm, embeddings) and `max_context_length`. The window a
// model is loaded with is not told there, so only the largest it takes is known.
async function lmstudioOld(root) {
 const list = (await ask(`${root}/api/v0/models`)).data;
 if (!Array.isArray(list)) throw error('not LM Studio');
 return list.filter(item => typeof item?.id === 'string' && item.id).map(item => ({ id: item.id, chat: item.type ? item.type !== 'embeddings' : undefined, context: 0, limit: number(item.max_context_length), vision: item.type ? item.type === 'vlm' : undefined }));
}

// llama.cpp serves one model: /props tells the window the server was started with (`default_generation_settings.n_ctx`)
// and whether the model sees pictures (`modalities.vision`).
async function llamacpp(root) {
 const props = await ask(`${root}/props`);
 const context = number(props.default_generation_settings?.n_ctx);
 if (!context && !props.modalities) throw error('not llama.cpp');
 return [{ id: '*', context, limit: context, vision: props.modalities ? !!props.modalities.vision : undefined }];
}

async function look(root) {
 for (const [kind, read] of [['ollama', ollama], ['lmstudio', lmstudio], ['lmstudio', lmstudioOld], ['llamacpp', llamacpp]]) {
  const told = await read(root).catch(() => null);
  if (told) return { kind, told };
 }
 return { kind: 'plain', told: [] };
}

// What kind of server stands at a local address: asked once, and again whenever its list of models is read.
function kindOf(root) {
 if (!kinds.has(root)) kinds.set(root, look(root).then(result => result.kind).catch(() => 'plain'));
 return kinds.get(root);
}

// A list that keeps the shape of OpenAI's may add a model's window under one of these names.
const windowOf = item => number(item.context_length ?? item.context_window ?? item.max_context_length ?? item.max_model_len);

// `at`: the server the model lives on. What a model turned down is remembered for that server alone.
const described = (provider, at, { id, name = id, context = 0, limit = 0, vision, tools }) => ({
 id: `${provider}:${id}`,
 provider,
 api: id,
 name,
 // Zero: nobody said, and the settings' own number or the default stands in.
 context,
 // The largest window the model can take, where the server tells it: a number written by hand is held to it.
 limit,
 output: 0,
 // A local server says whether a model sees pictures. A service does not: its model is sent them, and is known not to
 // see them once it has turned one down.
 vision: (provider === 'custom' ? vision !== false : vision === true) && !refusedPictures.has(`${at} ${id}`),
 tools: tools !== false && !refusedTools.has(`${at} ${id}`),
 efforts: ['none'], defaultEffort: 'none', thinking: 'none',
});

// The models the server has. Reading the list is also the check that the address is right, the server is running and
// the key, where there is one, is taken.
async function models(request) {
 const where = place(request), provider = request.provider === 'custom' ? 'custom' : 'local';
 // A server on this computer is asked what it is first: Ollama lists its models itself, by the names its own API takes.
 const seen = where.root ? await look(where.root) : { kind: 'plain', told: [] };
 if (where.root) kinds.set(where.root, Promise.resolve(seen.kind));
 if (seen.kind === 'ollama') return seen.told.filter(model => model.chat !== false && !NOT_CHAT.test(model.id)).map(model => described(provider, where.id, model));
 let list;
 try {
  const response = await reach(where, '/models', { signal: AbortSignal.timeout(provider === 'custom' ? 4 * ASK : ASK) });
  if (!response.ok) throw await failure(response);
  list = (await response.json()).data;
 } catch (cause) {
  if (cause.status) throw cause;
  throw error('network', 0, 'network');
 }
 if (!Array.isArray(list)) throw error('The server sent no list of models');
 const about = id => seen.told.find(model => model.id === id || model.id === '*' || model.also?.includes(id)) || {};
 return list.filter(model => typeof model?.id === 'string' && model.id && !NOT_CHAT.test(model.id) && about(model.id).chat !== false).map(model => {
  const told = about(model.id);
  return described(provider, where.id, {
   id: model.id,
   name: typeof model.display_name === 'string' && model.display_name ? model.display_name : model.id,
   // llama.cpp's own list tells what a model was trained for (`meta.n_ctx_train`), which is its limit, not its window.
   context: told.context || windowOf(model),
   // A service's own number is the most its model takes.
   limit: told.limit || number(model.meta?.n_ctx_train) || (provider === 'custom' ? windowOf(model) : 0),
   vision: told.vision,
   tools: told.tools,
  });
 });
}

const text = content => typeof content === 'string' ? content : (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');

function parts(content, vision) {
 if (!Array.isArray(content)) return content || '';
 // A message of text alone goes as plain text: not every server takes a message in parts.
 if (content.every(part => part.type !== 'image_url')) return text(content);
 return content.map(part => part.type !== 'image_url' ? { type: 'text', text: part.text || '' }
  : vision ? { type: 'image_url', image_url: { url: part.image_url.url } } : { type: 'text', text: NO_VISION });
}

function turn(message, vision) {
 if (message.role === 'tool') return { role: 'tool', tool_call_id: message.tool_call_id, content: message.content || '' };
 if (message.role !== 'assistant') return { role: message.role === 'system' ? 'system' : 'user', content: parts(message.content, vision) };
 const calls = (message.tool_calls || []).map(call => ({ id: call.id, type: 'function', function: { name: call.function.name, arguments: call.function.arguments || '{}' } }));
 const out = { role: 'assistant', content: message.content || '' };
 if (calls.length) out.tool_calls = calls;
 return out;
}

// The system prompt's parts open the request as one message.
function lead(messages) {
 const at = messages.findIndex(message => message.role !== 'system'), count = at < 0 ? messages.length : at;
 return { system: messages.slice(0, count).map(message => text(message.content)).filter(Boolean).join('\n\n'), rest: messages.slice(count) };
}

function convert(messages, { vision = false } = {}) {
 const { system, rest } = lead(messages), out = [];
 if (system) out.push({ role: 'system', content: system });
 for (const message of rest) out.push(turn(message, vision));
 return out;
}

const functions = tools => tools.map(tool => ({ type: 'function', function: { name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters } }));

function build(request, { tools = true } = {}) {
 const body = { model: request.model, messages: convert(request.messages, { vision: request.vision === true }), stream: true, stream_options: { include_usage: true } };
 if (request.maxTokens) body.max_tokens = request.maxTokens;
 if (tools && request.tools?.length) body.tools = functions(request.tools);
 return body;
}

// The lines of a stream: `data:` events of the OpenAI API, or Ollama's own, one JSON object to a line.
async function* lines(body) {
 const decoder = new TextDecoder();
 let buffer = '';
 for await (const chunk of body) {
  buffer += decoder.decode(chunk, { stream: true });
  const got = buffer.split('\n');
  buffer = got.pop();
  for (const line of got) if (line.trim()) yield line.trim();
 }
 if (buffer.trim()) yield buffer.trim();
}

async function* events(body) {
 for await (const line of lines(body)) {
  if (!line.startsWith('data:')) continue;
  const data = line.slice(5).trim();
  if (!data || data === '[DONE]') continue;
  try { yield JSON.parse(data); } catch {}
 }
}

const FINISH = new Set(['stop', 'tool_calls', 'length', 'content_filter']);
const callId = k => `call_${Date.now().toString(36)}_${k}`;

function finished(result, calls, stale) {
 result.toolCalls = calls.filter(call => call?.function.name).map((call, k) => ({ ...call, id: call.id || callId(k) }));
 // A tool call cut off at the length limit is never run.
 if (result.finishReason === 'length') result.toolCalls = [];
 if (!FINISH.has(result.finishReason) || (result.finishReason === 'stop' && result.toolCalls.length)) result.finishReason = result.toolCalls.length ? 'tool_calls' : 'stop';
 if (stale) result.stale = true;
 return result;
}

// A model that calls no tools, or sees no pictures, says so only when it is sent some: it is then asked again without
// them, and the list of models is read anew so the app knows it too. `send(asked)` makes one request.
async function asking(request, at, send) {
 const model = `${at} ${request.model}`;
 const pictured = request.vision === true && request.messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image_url'));
 const asked = { tools: !refusedTools.has(model) && !!request.tools?.length, pictures: pictured && !refusedPictures.has(model) };
 let stale = false;
 for (;;) {
  const response = await send(asked);
  if (response.ok) return { response, stale };
  const problem = await failure(response);
  const turned = problem.status !== 400 ? '' : asked.tools && /tool|function/i.test(problem.message) ? 'tools' : asked.pictures && /image|vision|multimodal|multi-modal/i.test(problem.message) ? 'pictures' : '';
  if (!turned) throw problem;
  (turned === 'tools' ? refusedTools : refusedPictures).add(model);
  asked[turned] = false;
  stale = true;
 }
}

const sent = async (url, body, signal, headers = {}) => {
 try {
  return await patient(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
 } catch (cause) {
  if (cause.name === 'AbortError') throw cause;
  throw error('network', 0, 'network');
 }
};

// Ollama's own chat, POST /api/chat. A message's words are a string; its pictures go beside them as base64 with no
// "data:" before it; a tool call's arguments are an object, and it has no id, so a tool's result names the tool it
// answers (`tool_name`). `options.num_ctx` is the window: sent with every request, so the model works in the window
// the app counts on, whatever Ollama would have started it with.
function ollamaMessages(messages, vision) {
 const { system, rest } = lead(messages), out = [], names = new Map();
 if (system) out.push({ role: 'system', content: system });
 for (const message of rest) {
  if (message.role === 'tool') { out.push({ role: 'tool', tool_name: names.get(message.tool_call_id) || '', content: message.content || '' }); continue; }
  if (message.role === 'assistant') {
   const calls = (message.tool_calls || []).map(call => {
    names.set(call.id, call.function.name);
    let given = {};
    try { given = JSON.parse(call.function.arguments || '{}'); } catch {}
    return { function: { name: call.function.name, arguments: given } };
   });
   out.push({ role: 'assistant', content: message.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
   continue;
  }
  const pictures = Array.isArray(message.content) ? message.content.filter(part => part.type === 'image_url').map(part => String(part.image_url.url)) : [];
  const words = Array.isArray(message.content) ? message.content.map(part => part.type !== 'image_url' ? part.text || '' : vision && part.image_url.url.startsWith('data:') ? '' : NO_VISION).filter(Boolean).join('\n') : message.content || '';
  const images = vision ? pictures.filter(url => url.startsWith('data:')).map(url => url.slice(url.indexOf(',') + 1)) : [];
  out.push({ role: 'user', content: words, ...(images.length ? { images } : {}) });
 }
 return out;
}

function ollamaBody(request, asked) {
 const options = {};
 if (number(request.window)) options.num_ctx = number(request.window);
 if (request.maxTokens) options.num_predict = request.maxTokens;
 const body = { model: request.model, messages: ollamaMessages(request.messages, asked.pictures), stream: true, options };
 if (asked.tools) body.tools = functions(request.tools);
 return body;
}

async function chatOllama(request, root, { signal, onEvent }) {
 const { response, stale } = await asking(request, root, asked => sent(`${root}/api/chat`, ollamaBody(request, asked), signal));
 const calls = [], result = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null };
 try {
  for await (const line of lines(response.body)) {
   let event;
   try { event = JSON.parse(line); } catch { continue; }
   // A model can fail mid-answer: the stream then carries the error instead of an HTTP status.
   if (event.error) throw error(typeof event.error === 'string' ? event.error : event.error.message || 'Ollama stopped the answer', 500);
   const message = event.message || {};
   if (typeof message.thinking === 'string' && message.thinking) {
    result.reasoning += message.thinking;
    onEvent({ type: 'reasoning', delta: message.thinking });
   }
   if (typeof message.content === 'string' && message.content) {
    result.content += message.content;
    onEvent({ type: 'content', delta: message.content });
   }
   for (const call of message.tool_calls || []) {
    if (!call?.function?.name) continue;
    const given = call.function.arguments;
    calls.push({ id: callId(calls.length), type: 'function', function: { name: call.function.name, arguments: typeof given === 'string' ? given : JSON.stringify(given || {}) } });
   }
   if (event.done) {
    if (event.done_reason) result.finishReason = event.done_reason;
    const prompt = number(event.prompt_eval_count), completion = number(event.eval_count);
    if (prompt || completion) result.usage = { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, cached_tokens: 0, written_tokens: 0 };
   }
  }
 } catch (cause) {
  if (cause.name === 'AbortError' || cause.status !== undefined) throw cause;
  throw error('network', 0, 'network');
 }
 return finished(result, calls, stale);
}

async function stream(request, { signal, onEvent = () => {} } = {}) {
 const where = place(request);
 if (where.root && await kindOf(where.root) === 'ollama') return chatOllama(request, where.root, { signal, onEvent });
 const { response, stale } = await asking(request, where.id, async asked => {
  try {
   return await reach(where, '/chat/completions', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(build({ ...request, vision: asked.pictures }, { tools: asked.tools })) }, patient);
  } catch (cause) {
   if (cause.name === 'AbortError') throw cause;
   throw error('network', 0, 'network');
  }
 });
 const calls = [], result = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null };
 try {
  for await (const event of events(response.body)) {
   if (event.error) throw error(typeof event.error === 'string' ? event.error : event.error.message || 'The server stopped the answer', Number(event.error.code) || 500);
   if (event.usage) {
    const usage = event.usage;
    result.usage = {
     prompt_tokens: usage.prompt_tokens || 0,
     completion_tokens: usage.completion_tokens || 0,
     total_tokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
     cached_tokens: usage.prompt_tokens_details?.cached_tokens || 0,
     written_tokens: 0,
    };
   }
   const choice = event.choices?.[0];
   if (!choice) continue;
   const delta = choice.delta || {};
   // LM Studio and llama.cpp name a model's thinking `reasoning_content`; some services name it `reasoning`.
   const thought = typeof delta.reasoning_content === 'string' && delta.reasoning_content ? delta.reasoning_content : typeof delta.reasoning === 'string' ? delta.reasoning : '';
   if (thought) {
    result.reasoning += thought;
    onEvent({ type: 'reasoning', delta: thought });
   }
   if (typeof delta.content === 'string' && delta.content) {
    result.content += delta.content;
    onEvent({ type: 'content', delta: delta.content });
   }
   for (const part of delta.tool_calls || []) {
    const last = calls.length - 1, fresh = part.id && last >= 0 && calls[last].id && calls[last].id !== part.id;
    const call = calls[part.index ?? (fresh ? last + 1 : Math.max(0, last))] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
    if (part.id) call.id = part.id;
    if (part.function?.name) call.function.name += part.function.name;
    // Most servers send a call's arguments as text in pieces; a few send them whole, as an object.
    const given = part.function?.arguments;
    if (typeof given === 'string') call.function.arguments += given;
    else if (given && typeof given === 'object') call.function.arguments = JSON.stringify(given);
   }
   if (choice.finish_reason) result.finishReason = choice.finish_reason;
  }
 } catch (cause) {
  if (cause.name === 'AbortError' || cause.status !== undefined) throw cause;
  throw error('network', 0, 'network');
 }
 return finished(result, calls, stale);
}

module.exports = { models, stream, convert, build, origin, place, ollamaBody, AUTO };
