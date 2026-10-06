'use strict';

// OpenRouter: one key for the models of many companies, through its Chat Completions API. The chat keeps its history in
// that same shape, so little changes on the way out: the system prompt's parts become one message, a picture the model
// can't see becomes a note, and what a model needs back of its own thinking goes back with the reply it belongs to.
const API_URL = 'https://openrouter.ai/api/v1';
// OpenRouter is told which app a request comes from; nothing of the user's goes into these.
const APP = { 'HTTP-Referer': 'https://github.com/ANDRETRIPOL/OpenGhost', 'X-Title': 'OpenGhost' };
const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';
// The effort levels there are, from the least thinking to the most; a level OpenRouter adds later goes after them.
const LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
// What a model that thinks is taken to accept when OpenRouter does not list its levels.
const UNLISTED = ['low', 'medium', 'high'];
// Claude keeps a request in its cache only up to the places marked for it; every other company's models cache by
// themselves, with no marks.
const MARKED = /^~?anthropic\//;
const CACHE = { type: 'ephemeral' };
const THINKING_ROOM = 2048;

const error = (message, status = 0, code = '') => Object.assign(new Error(message), { status, code });
const headers = key => ({ Authorization: `Bearer ${key}`, ...APP });

async function failure(response) {
 let detail = '', code = '';
 try {
  const body = await response.json();
  detail = body.error?.message || body.message || '';
  // What the company behind a model answered is more to the point than OpenRouter's "Provider returned error".
  const raw = body.error?.metadata?.raw;
  if (typeof raw === 'string' && raw && /provider returned error/i.test(detail)) detail = raw.slice(0, 300);
  code = String(body.error?.type || body.error?.code || '');
 } catch {}
 return error(detail || `OpenRouter returned error ${response.status}`, response.status, code);
}

// No model is named in this file. OpenRouter lists every model an account may use and says of each what it takes in,
// what it writes, how large its window is, whether it calls tools and how it thinks. A model added tomorrow is in the
// list the next time it is read.

// Only models that write text and nothing else are for a chat: the list also holds models whose answer is a picture, a
// voice or music. A router is no model of its own: it hands a request to one that fits it, so it says it can write
// anything, and is kept for the text it writes.
function writesText(model) {
 const arch = model.architecture || {};
 const sides = typeof arch.modality === 'string' ? arch.modality.split('->') : [];
 const input = Array.isArray(arch.input_modalities) ? arch.input_modalities : (sides[0] || 'text').split('+');
 const output = Array.isArray(arch.output_modalities) ? arch.output_modalities : (sides[1] || 'text').split('+');
 return input.includes('text') && output.includes('text') && (output.length === 1 || arch.tokenizer === 'Router');
}

// A model's id is author/model; an id that begins with ~ is a name that follows the author's latest model.
const authorOf = id => String(id).replace(/^~/, '').split('/')[0];
const titled = slug => slug.split(/[-_]/).filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

// OpenRouter names a model "Company: Model". Where a name has no company in it, the company is the one the author's
// other models carry, or the author's own id made readable.
function split(model, known) {
 const full = String(model.name || model.id), at = full.indexOf(': ');
 if (at > 0) return { group: full.slice(0, at).trim(), name: full.slice(at + 2).trim() || full };
 const author = authorOf(model.id);
 return { group: known.get(author) || titled(author), name: full };
}

// How a model thinks, as the request has to say it: 'none' is a model that doesn't, 'levels' one whose own levels are
// all there is to choose from, 'switch' one that may also answer without thinking although no level of its own says so.
function effortsOf(model) {
 const reasoning = model.reasoning, params = Array.isArray(model.supported_parameters) ? model.supported_parameters : [];
 if (!reasoning && !params.includes('reasoning')) return { efforts: ['none'], defaultEffort: 'none', thinking: 'none' };
 const listed = Array.isArray(reasoning?.supported_efforts) ? reasoning.supported_efforts.filter(level => typeof level === 'string' && level) : [];
 const levels = listed.length ? listed : UNLISTED;
 const ordered = [...LEVELS.filter(level => levels.includes(level)), ...levels.filter(level => !LEVELS.includes(level))];
 // A model that may answer without thinking gets the app's own first step, which turns thinking off.
 const own = !reasoning?.mandatory && !ordered.includes('none');
 const efforts = own ? ['none', ...ordered] : ordered;
 const wanted = reasoning?.default_enabled === false ? 'none' : reasoning?.default_effort;
 const defaultEffort = efforts.includes(wanted) ? wanted : efforts.includes('medium') ? 'medium' : efforts[efforts.length - 1];
 return { efforts, defaultEffort, thinking: own ? 'switch' : 'levels' };
}

function described(list) {
 const usable = list.filter(model => model?.id && writesText(model));
 const known = new Map();
 for (const model of usable) {
  const full = String(model.name || ''), at = full.indexOf(': '), author = authorOf(model.id);
  if (at > 0 && !known.has(author)) known.set(author, full.slice(0, at).trim());
 }
 return usable.map(model => {
  const { group, name } = split(model, known), arch = model.architecture || {};
  const input = Array.isArray(arch.input_modalities) ? arch.input_modalities : String(arch.modality || '').split('->')[0].split('+');
  const params = Array.isArray(model.supported_parameters) ? model.supported_parameters : null;
  return {
   id: `openrouter:${model.id}`,
   provider: 'openrouter',
   api: model.id,
   name,
   group,
   context: Number(model.context_length) || Number(model.top_provider?.context_length) || 0,
   output: Number(model.top_provider?.max_completion_tokens) || 0,
   vision: input.includes('image'),
   // A model that calls no tools is talked to as a plain chat.
   tools: !params || params.includes('tools'),
   ...effortsOf(model),
  };
 });
}

// The models an account may use: OpenRouter leaves out the ones its privacy settings rule out. This list answers only
// a key that works, so reading it is also the check of the key.
async function models({ key }, { apiUrl = API_URL } = {}) {
 let response;
 try {
  response = await fetch(`${apiUrl}/models/user`, { headers: headers(key) });
 } catch {
  throw error('network', 0, 'network');
 }
 if (!response.ok) throw await failure(response);
 const list = (await response.json()).data;
 if (!Array.isArray(list)) throw error('OpenRouter sent no list of models');
 return described(list);
}

// What OpenRouter tells a key of itself: whether its account has ever bought credits (one that hasn't can use the free
// models only), how much the key has spent, and how much it may still spend where a limit is set on it. The account's
// own balance is told only to a management key, which can't be used to chat.
async function account({ key }, { apiUrl = API_URL } = {}) {
 const response = await fetch(`${apiUrl}/key`, { headers: headers(key) });
 if (!response.ok) throw await failure(response);
 const data = (await response.json()).data || {};
 const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
 return { free: data.is_free_tier === true, left: number(data.limit_remaining), spent: number(data.usage) };
}

const text = content => typeof content === 'string' ? content : (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');

function parts(content, vision) {
 if (!Array.isArray(content)) return content || '';
 return content.map(part => part.type !== 'image_url' ? { type: 'text', text: part.text || '' }
  : vision ? { type: 'image_url', image_url: { url: part.image_url.url } } : { type: 'text', text: NO_VISION });
}

function turn(message, { vision, model }) {
 if (message.role === 'tool') return { role: 'tool', tool_call_id: message.tool_call_id, content: message.content || '' };
 if (message.role !== 'assistant') return { role: message.role === 'system' ? 'system' : 'user', content: parts(message.content, vision) };
 const calls = (message.tool_calls || []).map(call => ({ id: call.id, type: 'function', function: { name: call.function.name, arguments: call.function.arguments || '{}' } }));
 const out = { role: 'assistant', content: message.content || (calls.length ? null : '') };
 if (calls.length) out.tool_calls = calls;
 // A model's thinking goes back to it as it came, and only to the model it came from: some refuse to go on with their
 // tool calls without it.
 const native = message.native;
 if (native?.provider === 'openrouter' && native.model === model && native.details?.length) out.reasoning_details = native.details;
 return out;
}

// The system prompt's parts open the request as one message. For Claude each part ends with a mark: the first part is
// the same in every chat, the second in every request of one chat.
function convert(messages, { vision = true, model = '', marks = false } = {}) {
 const lead = messages.findIndex(message => message.role !== 'system'), count = lead < 0 ? messages.length : lead;
 const system = messages.slice(0, count).map(message => text(message.content)).filter(Boolean), out = [];
 if (system.length) out.push({ role: 'system', content: marks ? system.map(part => ({ type: 'text', text: part, cache_control: CACHE })) : system.join('\n\n') });
 for (const message of messages.slice(count)) out.push(turn(message, { vision, model }));
 return out;
}

function thinking({ thinking: mode, effort }) {
 if (mode !== 'levels' && mode !== 'switch') return {};
 if (!effort || effort === 'none') return { reasoning: mode === 'levels' ? { effort: 'none' } : { enabled: false } };
 return { reasoning: { effort } };
}

// A request nothing follows (`once`: a summary, a chat's name) asks for no cache: writing one costs more than plain
// input, and nobody would read it. `extras`: what the request asks for beyond the chat itself, Claude's cache marks and
// a word about thinking; either can be left out. The tokens used, the cached ones among them, come with the answer's
// last event by themselves.
function build(request, extras = { marks: true, thinking: true }) {
 const { model, vision = true, messages, tools, maxTokens, output, once = false } = request;
 const marks = extras.marks && !once && MARKED.test(model);
 const body = {
  // A chat's side request goes to the model that answered the chat, where a router chose it: left to choose again for a
  // request with no tools in it, a router may hand it to a model that is no chat model at all.
  model: once ? routes.get(model) || model : model,
  messages: convert(messages, { vision, model, marks }),
  stream: true,
  ...(extras.thinking ? thinking(request) : {}),
 };
 // The mark at the end of the request: OpenRouter puts it on the last block and moves it on as the chat grows.
 if (marks) body.cache_control = CACHE;
 // A model that could not be told not to think spends its room on thinking first, so a side request gets room for both.
 const room = maxTokens && once && !extras.thinking ? Math.max(maxTokens, THINKING_ROOM) : maxTokens;
 if (room) body.max_tokens = output ? Math.min(room, output) : room;
 // Which tool to call is the model's to choose, which is what a request says by itself: a few models take tools but not
 // a word about how to choose among them.
 if (tools?.length) {
  body.tools = tools.map(tool => ({ type: 'function', function: { name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters } }));
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
   // Lines that begin with a colon only keep the connection open.
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

// A reply's thinking comes in pieces. Pieces of plain thinking that follow each other are one block, with the signature
// that closes it; everything else (a summary, an encrypted block) is kept piece by piece, as it came.
function gather(details, piece) {
 if (!piece || typeof piece !== 'object') return;
 const last = details[details.length - 1];
 if (piece.type === 'reasoning.text' && last?.type === 'reasoning.text' && (piece.index ?? last.index) === last.index) {
  last.text = (last.text || '') + (piece.text || '');
  if (piece.signature) last.signature = piece.signature;
  if (piece.id && !last.id) last.id = piece.id;
  if (piece.format && !last.format) last.format = piece.format;
  return;
 }
 details.push({ ...piece });
}

const FINISH = new Set(['stop', 'tool_calls', 'length', 'content_filter']);

// Which model a router last handed a chat's request to, by the router's id.
const routes = new Map();

// The extras a model turned down, remembered while the app runs, and the words a refusal names each by.
const refused = { marks: new Set(), thinking: new Set() };
const NAMED = { marks: /cache/i, thinking: /reason|think|effort/i };

async function post(request, body, { signal, apiUrl }) {
 try {
  return await fetch(`${apiUrl}/chat/completions`, {
   method: 'POST', signal,
   headers: { ...headers(request.key), 'Content-Type': 'application/json', Accept: 'text/event-stream' },
   body: JSON.stringify(body),
  });
 } catch (cause) {
  if (cause.name === 'AbortError') throw cause;
  throw error('network', 0, 'network');
 }
}

async function stream(request, { signal, onEvent = () => {}, apiUrl = API_URL } = {}) {
 // The request goes with the extras the model is not known to turn down. Turned down for one of them before anything
 // was answered, it goes again without that one; the extra dropped last before it went through is the one the model
 // doesn't take.
 const model = request.model, extras = { marks: !refused.marks.has(model), thinking: !refused.thinking.has(model) };
 let response, dropped = '';
 for (;;) {
  const body = build(request, extras);
  response = await post(request, body, { signal, apiUrl });
  if (response.ok) break;
  const problem = await failure(response);
  const asked = { marks: !!body.cache_control, thinking: !!body.reasoning };
  const extra = problem.status !== 400 ? '' : ['marks', 'thinking'].find(name => asked[name] && NAMED[name].test(problem.message)) || '';
  if (!extra) throw problem;
  extras[extra] = false;
  dropped = extra;
 }
 if (dropped) refused[dropped].add(model);
 const calls = [], details = [];
 const result = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null };
 let answered = '';
 try {
  for await (const event of events(response.body)) {
   if (typeof event.model === 'string' && event.model) answered = event.model;
   // A model can fail mid-answer: the stream then carries the error instead of an HTTP status.
   if (event.error) throw error(event.error.message || 'OpenRouter stopped the answer', Number(event.error.code) || 0, String(event.error.code || ''));
   if (event.usage) {
    const usage = event.usage, sent = usage.prompt_tokens_details || {};
    result.usage = {
     prompt_tokens: usage.prompt_tokens || 0,
     completion_tokens: usage.completion_tokens || 0,
     total_tokens: usage.total_tokens || (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
     cached_tokens: sent.cached_tokens || 0,
     written_tokens: sent.cache_write_tokens || 0,
    };
   }
   const choice = event.choices?.[0];
   if (!choice) continue;
   const delta = choice.delta || {};
   if (typeof delta.reasoning === 'string' && delta.reasoning) {
    result.reasoning += delta.reasoning;
    onEvent({ type: 'reasoning', delta: delta.reasoning });
   }
   for (const piece of delta.reasoning_details || []) gather(details, piece);
   if (typeof delta.content === 'string' && delta.content) {
    result.content += delta.content;
    onEvent({ type: 'content', delta: delta.content });
   }
   for (const part of delta.tool_calls || []) {
    // A piece says which call it belongs to by its index; one that doesn't belongs to the last call, unless it brings
    // a new id.
    const last = calls.length - 1, fresh = part.id && last >= 0 && calls[last].id && calls[last].id !== part.id;
    const call = calls[part.index ?? (fresh ? last + 1 : Math.max(0, last))] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
    if (part.id) call.id = part.id;
    if (part.function?.name) call.function.name += part.function.name;
    if (part.function?.arguments) call.function.arguments += part.function.arguments;
   }
   if (choice.finish_reason) result.finishReason = choice.finish_reason;
  }
 } catch (cause) {
  if (cause.name === 'AbortError' || cause.status !== undefined) throw cause;
  throw error('network', 0, 'network');
 }
 result.toolCalls = calls.filter(call => call?.function.name);
 // A tool call cut off at the length limit is never run.
 if (result.finishReason === 'length') result.toolCalls = [];
 if (!FINISH.has(result.finishReason)) result.finishReason = result.toolCalls.length ? 'tool_calls' : 'stop';
 if (details.length) result.native = { provider: 'openrouter', model: request.model, details };
 if (!request.once && answered && answered !== model) routes.set(model, answered);
 return result;
}

module.exports = { models, account, stream, convert, build, described };
