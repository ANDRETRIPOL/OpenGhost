'use strict';

// Models behind an address the user gives, spoken to through the Chat Completions API. Two providers use it:
// `local`, a server on the user's own computer (Ollama, LM Studio, llama.cpp), where the address stands in the key's
// place and no key is sent; and `custom`, any service that speaks the OpenAI API, with its base address and a key if it
// asks for one. The app runs no model itself. Made from the OpenRouter engine: the chat keeps its history in that shape.
const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';
// A server that does not answer a question about itself is not waited for.
const ASK = 2500;
// The window a model is taken to have when the server does not say how much it was started with.
const WINDOW = 32768;

const error = (message, status = 0, code = '') => Object.assign(new Error(message), { status, code });

// The address as the user may have typed it: with or without http://, a slash at its end, or the /v1 a guide told
// them to add.
function origin(address) {
 const typed = String(address || '').trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
 if (!typed) throw error('network', 0, 'network');
 return /^https?:\/\//i.test(typed) ? typed : `http://${typed}`;
}

// Where a request goes. A local server's address is its root, and the API is under /v1 there. A service's address is
// the base its documentation gives, used as it stands; when nothing answers there and it names no version, /v1 is tried
// after it, and what answered is remembered.
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

// One request to the API, at the first of the place's addresses that has such a path.
async function reach(where, path, init = {}) {
 let response;
 for (const base of where.bases) {
  response = await fetch(`${base}${path}`, { ...init, headers: { ...auth(where.token), ...init.headers } });
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

// What each kind of server tells about its models beyond their names, where it tells anything. None of it is needed:
// a question that goes unanswered leaves the model with what the user wrote in the settings, or with the defaults.
// Ollama: the window a loaded model runs with, the one it was trained for, and what it can do.
async function ollama(base, ids) {
 const running = new Map();
 const ps = await ask(`${base}/api/ps`);
 for (const item of ps.models || []) running.set(item.name || item.model, number(item.context_length));
 const out = new Map();
 await Promise.all(ids.map(async id => {
  const shown = await ask(`${base}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: id }) }).catch(() => null);
  if (!shown) return;
  const info = shown.model_info || {}, trained = number(Object.entries(info).find(([name]) => name.endsWith('.context_length'))?.[1]);
  const can = Array.isArray(shown.capabilities) ? shown.capabilities : null;
  // A model not loaded yet starts with Ollama's own window, which is rarely the one it was trained for.
  out.set(id, { context: running.get(id) || Math.min(trained || WINDOW, WINDOW), vision: can ? can.includes('vision') : undefined, tools: can ? can.includes('tools') : undefined, thinks: can ? can.includes('thinking') : undefined });
 }));
 return out;
}

// LM Studio: the window a model is loaded with, or the largest it takes, and whether it sees pictures.
async function lmstudio(base) {
 const out = new Map();
 for (const item of (await ask(`${base}/api/v0/models`)).data || []) {
  if (!item?.id) continue;
  out.set(item.id, { chat: item.type ? item.type !== 'embeddings' : undefined, context: number(item.loaded_context_length) || number(item.max_context_length), vision: item.type ? item.type === 'vlm' : undefined });
 }
 return out;
}

// llama.cpp: one model, and the window the server was started with.
async function llamacpp(base, ids) {
 const props = await ask(`${base}/props`);
 const context = number(props.default_generation_settings?.n_ctx), vision = props.modalities ? !!props.modalities.vision : undefined;
 return new Map(ids.map(id => [id, { context, vision }]));
}

async function known(base, ids) {
 for (const kind of [ollama, lmstudio, llamacpp]) {
  const found = await kind(base, ids).catch(() => null);
  if (found?.size) return found;
 }
 return new Map();
}

const refusedTools = new Set(), refusedPictures = new Set();
// Lists of models also hold ones that are no chat models, and say so only in their names.
const NOT_CHAT = /whisper|tts|embed|rerank|moderation|speech|transcri|dall-e/i;
// A list that keeps the same shape as OpenAI's may add a model's window under one of these names.
const windowOf = item => number(item.context_length ?? item.context_window ?? item.max_context_length ?? item.max_model_len ?? item.meta?.n_ctx_train);

// The models the server has. Reading the list is also the check that the address is right, the server is running and
// the key, where there is one, is taken.
async function models(request) {
 const where = place(request), provider = request.provider === 'custom' ? 'custom' : 'local';
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
 const items = list.filter(model => typeof model?.id === 'string' && model.id && !NOT_CHAT.test(model.id));
 // Only a server on this computer is asked more about itself: a service has no such pages.
 const more = where.root ? await known(where.root, items.map(model => model.id)) : new Map();
 return items.filter(model => more.get(model.id)?.chat !== false).map(model => {
  const id = model.id, told = more.get(id) || {};
  return {
   id: `${provider}:${id}`,
   provider,
   api: id,
   name: typeof model.display_name === 'string' && model.display_name ? model.display_name : id,
   // Zero: nobody said, and the settings' own number or the default stands in.
   context: told.context || windowOf(model) || 0,
   output: 0,
   // A local server says whether a model sees pictures. A service does not: its model is sent them, and is known
   // not to see them once it has turned one down.
   vision: (provider === 'custom' ? told.vision !== false : told.vision === true) && !refusedPictures.has(id),
   tools: told.tools !== false && !refusedTools.has(id),
   efforts: ['none'], defaultEffort: 'none', thinking: 'none',
  };
 });
}

const text = content => typeof content === 'string' ? content : (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');

function parts(content, vision) {
 if (!Array.isArray(content)) return content || '';
 // A message of text alone goes as plain text: not every local server takes a message in parts.
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
function convert(messages, { vision = false } = {}) {
 const lead = messages.findIndex(message => message.role !== 'system'), count = lead < 0 ? messages.length : lead;
 const system = messages.slice(0, count).map(message => text(message.content)).filter(Boolean), out = [];
 if (system.length) out.push({ role: 'system', content: system.join('\n\n') });
 for (const message of messages.slice(count)) out.push(turn(message, vision));
 return out;
}

function build(request, { tools = true } = {}) {
 const body = { model: request.model, messages: convert(request.messages, { vision: request.vision === true }), stream: true, stream_options: { include_usage: true } };
 if (request.maxTokens) body.max_tokens = request.maxTokens;
 if (tools && request.tools?.length) {
  body.tools = request.tools.map(tool => ({ type: 'function', function: { name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters } }));
 }
 return body;
}

async function* events(body) {
 const decoder = new TextDecoder();
 let buffer = '';
 for await (const chunk of body) {
  buffer += decoder.decode(chunk, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const raw of lines) {
   const line = raw.trimEnd();
   if (!line.startsWith('data:')) continue;
   const data = line.slice(5).trim();
   if (!data || data === '[DONE]') continue;
   let event;
   try { event = JSON.parse(data); } catch { continue; }
   yield event;
  }
 }
}

const FINISH = new Set(['stop', 'tool_calls', 'length', 'content_filter']);

async function post(where, body, signal) {
 try {
  return await reach(where, '/chat/completions', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body) });
 } catch (cause) {
  if (cause.name === 'AbortError') throw cause;
  throw error('network', 0, 'network');
 }
}

async function stream(request, { signal, onEvent = () => {} } = {}) {
 const where = place(request), model = request.model;
 // A model that calls no tools, or sees no pictures, says so only when it is sent some: it is then asked again without
 // them, and the list of models is read anew so the app knows it too.
 const pictured = request.vision === true && request.messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image_url'));
 const asked = { tools: !refusedTools.has(model) && !!request.tools?.length, pictures: pictured && !refusedPictures.has(model) };
 const body = () => build({ ...request, vision: asked.pictures }, { tools: asked.tools });
 let stale = false, response;
 for (;;) {
  response = await post(where, body(), signal);
  if (response.ok) break;
  const problem = await failure(response);
  const turned = problem.status !== 400 ? '' : asked.tools && /tool|function/i.test(problem.message) ? 'tools' : asked.pictures && /image|vision|multimodal|multi-modal/i.test(problem.message) ? 'pictures' : '';
  if (!turned) throw problem;
  (turned === 'tools' ? refusedTools : refusedPictures).add(model);
  asked[turned] = false;
  stale = true;
 }
 const calls = [];
 const result = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null };
 try {
  for await (const event of events(response.body)) {
   if (event.error) throw error(typeof event.error === 'string' ? event.error : event.error.message || 'The local server stopped the answer', Number(event.error.code) || 500);
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
   // Ollama names a model's thinking `reasoning`, LM Studio and llama.cpp `reasoning_content`.
   const thought = typeof delta.reasoning === 'string' && delta.reasoning ? delta.reasoning : typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
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
 result.toolCalls = calls.filter(call => call?.function.name).map((call, k) => ({ ...call, id: call.id || `call_${Date.now().toString(36)}_${k}` }));
 if (result.finishReason === 'length') result.toolCalls = [];
 if (!FINISH.has(result.finishReason) || (result.finishReason === 'stop' && result.toolCalls.length)) result.finishReason = result.toolCalls.length ? 'tool_calls' : 'stop';
 if (stale) result.stale = true;
 return result;
}

module.exports = { models, stream, convert, build, origin, place };
