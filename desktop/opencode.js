'use strict';

// OpenCode Go (opencode.ai/zen/go): one key in front of models from many vendors. Most of them answer OpenAI's
// Chat Completions shape; a handful answer the Responses shape instead, and one only Anthropic's Messages shape, which
// this app does not use. Which is which is not in the catalogue, so it is told from a fixed list and corrected at
// runtime: a model that turns the Chat Completions shape down is served the Responses shape from then on, while the
// app runs. The gateway wants a session id on every request and turns down a made-up client name at Cloudflare.
const os = require('node:os');
const OpenAI = require('./openai');

const BASE = 'https://opencode.ai/zen/go/v1';
// Models.dev holds what OpenAI's own /models does not: the name, the window, the price and what a model takes in.
const CATALOG = 'https://models.dev/api.json';
const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';
// What is taken of a model nothing more is known about; the gateway says nothing about windows.
const DEFAULT_CONTEXT = 128000;
const LEVELS = ['none', 'low', 'medium', 'high'];
// The models the gateway serves through the Responses API, as it stood when this was written.
const RESPONSES = new Set(['grok-4.6', 'grok-4.7', 'muse-spark-1.2-contributor', 'muse-spark-1.3-contributor', 'gpt-5.6-luna', 'gpt-6-luna']);
// A model that turned the Chat Completions shape down is remembered while the app runs, so it is asked once.
const learned = new Set();
// A model that turned the "no thinking" word down (GLM refuses it) is remembered the same way, and asked plainly after.
const refuses = new Set();

const error = (message, status = 0, code = '') => Object.assign(new Error(message), { status, code });

// The gateway turns down a made-up client name (Cloudflare, 1010), so the app's own is sent, and it answers 400
// MissingSessionID to a request with no session. The app's short side jobs (naming a chat, compacting it) carry no
// session of their own, so one stands in for them and holds for as long as the app runs.
const SESSIONLESS = `openghost-${Math.random().toString(36).slice(2, 10)}`;
const headersFor = (key, version, session) => ({
 Authorization: `Bearer ${key}`,
 'User-Agent': `OpenGhost/${version} (${os.platform()} ${os.release()}; ${os.arch()})`,
 'x-opencode-session': session || SESSIONLESS,
});

// Prices and windows change rarely: the catalogue is read once and kept while the app runs. A catalogue that will not
// load is not fatal: the models are still listed, only less is known about each.
let catalog = null;
function metadata() {
 if (!catalog) catalog = fetch(CATALOG).then(response => response.ok ? response.json() : null).then(body => body?.['opencode-go']?.models || {}).catch(() => ({}));
 return catalog;
}

const isResponses = api => RESPONSES.has(api) || learned.has(api);

async function models({ provider, key }, { version = '' } = {}) {
 const who = provider || 'opencode';
 const response = await fetch(`${BASE}/models`, { headers: headersFor(key, version) });
 if (!response.ok) throw await failure(response);
 const list = (await response.json()).data;
 if (!Array.isArray(list)) throw error('OpenCode Go sent no list of models', response.status);
 const known = await metadata();
 const out = [];
 for (const item of list) {
  const api = item?.id;
  if (!api) continue;
  const info = known[api] || {};
  const input = Array.isArray(info.modalities?.input) ? info.modalities.input : [];
  out.push({
   id: `${who}:${api}`,
   provider: who,
   api,
   name: info.name || api,
   context: Number(info.limit?.context) || DEFAULT_CONTEXT,
   output: Number(info.limit?.output) || undefined,
   // Nothing known about what a model takes in means the picture is sent: a text-only model says so itself.
   vision: input.length ? input.includes('image') || input.includes('pdf') : true,
   efforts: info.reasoning ? LEVELS.slice() : [],
   defaultEffort: 'none',
  });
 }
 return out;
}

async function failure(response) {
 let detail = '', code = '';
 try {
  const body = await response.json();
  detail = body.error?.message || body.message || '';
  code = body.error?.code || body.error?.type || body.type || '';
 } catch {}
 return error(detail || `OpenCode Go returned error ${response.status}`, response.status, code);
}

// The SSE frames of a stream: an event's data may come over several `data:` lines, and the blank line ends it.
async function* events(body) {
 const decoder = new TextDecoder();
 let buffer = '';
 for await (const chunk of body) {
  buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
  let at;
  while ((at = buffer.indexOf('\n\n')) >= 0) {
   const block = buffer.slice(0, at);
   buffer = buffer.slice(at + 2);
   const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
   if (data && data !== '[DONE]') yield data;
  }
 }
}

// A text-only model rejects image parts, so pictures in the history turn into a short note instead.
function textOnly(messages) {
 return messages.map(message => {
  if (!Array.isArray(message.content)) return message;
  const content = message.content.map(part => part.type === 'image_url' ? NO_VISION : part.text || '').filter(Boolean).join('\n\n');
  return { ...message, content };
 });
}

// The messages as the gateway takes them: the system parts as one message, and nothing on a message that is meant for
// another provider (its own blocks, a cache mark). This gateway replays nothing foreign, so all of it is dropped.
function plain(messages) {
 const lead = messages.findIndex(message => message.role !== 'system'), count = lead < 0 ? messages.length : lead;
 const rest = messages.slice(count).map(({ native, cache, ...message }) => message);
 return count ? [{ role: 'system', content: messages.slice(0, count).map(message => message.content).join('\n\n') }, ...rest] : rest;
}

// The gateway streams its rate limits inside the stream rather than as an HTTP status, so a status is worked out here.
function streamed(event) {
 const problem = event.error || event;
 if (!problem || typeof problem !== 'object') return null;
 if (!problem.type && !problem.code && !problem.message) return null;
 if (event.choices || event.usage) return null;
 const kind = String(problem.type || problem.code || '');
 const status = problem.status === 429 || /rate|too_many|429/i.test(kind) ? 429 : Number(problem.status) || 0;
 return error(problem.message || 'OpenCode Go stopped the answer', status, problem.code || problem.type || '');
}

// `quiet`: a short side job, whose few tokens must not be spent on thinking.
// `again`: the second try of a quiet job, with room for a model that would not turn its thinking down.
async function chat(request, context, quiet = request.once === true, again = false) {
 const { model: api, effort, vision = true, messages, tools, maxTokens } = request;
 const { signal, onEvent = () => {} } = context;
 const info = (await metadata())[api];
 const body = {
  model: api,
  messages: plain(vision ? messages : textOnly(messages)),
  stream: true,
  stream_options: { include_usage: true },
 };
 // Tools are already in the shape the gateway wants; the effort is only sent to a model that reasons.
 if (tools?.length) body.tools = tools;
 if (maxTokens) body.max_tokens = maxTokens;
 if (effort && effort !== 'none' && info?.reasoning === true) body.reasoning_effort = effort;
 // A short side job asks for a few words in as many tokens, and a model that reasons spends all of them on its
 // thinking before it reaches the words: the thinking is turned down for those jobs, where the gateway takes a word
 // on it. One that turns that word down is remembered, and asked plainly from there on.
 if (quiet && !refuses.has(api)) {
  body.thinking = { type: 'disabled' };
  body.reasoning_effort = 'none';
 }
 let response;
 try {
  response = await fetch(`${BASE}/chat/completions`, {
   method: 'POST',
   signal,
   headers: { ...headersFor(request.key, context.version, request.session), 'Content-Type': 'application/json', Accept: 'text/event-stream' },
   body: JSON.stringify(body),
  });
 } catch (cause) {
  if (cause.name === 'AbortError') throw cause;
  throw error('network', 0, 'network');
 }
 if (!response.ok) throw await failure(response);
 const result = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null, native: { provider: 'opencode', items: [] } };
 const calls = new Map();
 const say = delta => { result.content += delta; onEvent({ type: 'content', delta }); };
 const think = delta => { result.reasoning += delta; onEvent({ type: 'reasoning', delta }); };
 for await (const data of events(response.body)) {
  let event;
  try { event = JSON.parse(data); } catch { continue; }
  const problem = streamed(event);
  if (problem) throw problem;
  const choice = event.choices?.[0];
  if (choice) {
   const delta = choice.delta || {};
   const reasoning = delta.reasoning_content ?? delta.reasoning;
   if (reasoning) think(reasoning);
   if (delta.content) say(delta.content);
   // Tool calls arrive in pieces, each piece marked with the place its call holds in the list.
   for (const call of delta.tool_calls || []) {
    const at = call.index ?? 0;
    let held = calls.get(at);
    if (!held) { held = { id: '', type: 'function', function: { name: '', arguments: '' } }; calls.set(at, held); }
    if (call.id) held.id = call.id;
    if (call.function?.name) held.function.name = call.function.name;
    if (call.function?.arguments) held.function.arguments += call.function.arguments;
   }
   if (choice.finish_reason) result.finishReason = choice.finish_reason;
  }
  if (event.usage) {
   const usage = event.usage, details = usage.prompt_tokens_details || {};
   result.usage = {
    prompt_tokens: usage.prompt_tokens || 0,
    completion_tokens: usage.completion_tokens || 0,
    total_tokens: usage.total_tokens || 0,
    cached_tokens: details.cached_tokens ?? usage.prompt_cache_hit_tokens ?? 0,
   };
  }
 }
 result.toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call).filter(call => call.id || call.function.name);
 if (!result.finishReason) result.finishReason = result.toolCalls.length ? 'tool_calls' : 'stop';
 // A model that would not turn its thinking down can spend a short job's whole room on it, and the words never come:
 // one more try, with room for both.
 if (quiet && !again && !result.content && result.finishReason === 'length') {
  return chat({ ...request, maxTokens: Math.max(maxTokens || 0, 2048) }, context, quiet, true);
 }
 return result;
}

// The Responses shape is OpenAI's, so its own module builds it: the gateway's address and headers stand in for OpenAI's.
function responses(request, context) {
 const { version = '' } = context;
 // The gateway's Responses models take a real reasoning level and turn down OpenAI's "no reasoning" step, so the
 // lowest level stands in when the picker offered none.
 const effort = request.effort && request.effort !== 'none' ? request.effort : 'low';
 return OpenAI.stream({ ...request, effort }, {
  ...context,
  apiUrl: BASE,
  nativeProvider: 'opencode',
  headers: headersFor(request.key, version, request.session),
 });
}

async function stream(request, context) {
 const { model: api } = request;
 if (isResponses(api)) return responses(request, context);
 try {
  return await chat(request, context);
 } catch (problem) {
  // The gateway moved a model to the other shape: it is served there from now on, while the app runs.
  if (problem.status === 400 && problem.code === 'ModelProtocolUnsupported') {
   learned.add(api);
   return responses(request, context);
  }
  // Some models (GLM) are always thinking and turn the "no thinking" word down: the job is asked again without it.
  if (problem.status === 400 && !refuses.has(api) && /thinking|reasoning/i.test(problem.message || '')) {
   refuses.add(api);
   return chat(request, context);
  }
  throw problem;
 }
}

module.exports = { models, stream };
