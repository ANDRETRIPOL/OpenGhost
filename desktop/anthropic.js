'use strict';

// Claude through the official Anthropic SDK with an API key. Anthropic doesn't let other apps use Claude Pro or Max subscriptions,
// so there is no sign-in here. The chat's history arrives in the Chat Completions shape and goes out as Messages API blocks.
const SDK = require('@anthropic-ai/sdk');

const Anthropic = SDK.default ?? SDK;
const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const MAX_OUTPUT = 64000;
const BUDGET = { low: 4096, high: 16000 };
// How many of the newest models of one line the picker offers: Opus 5.5 and Opus 5, but not every Opus before them.
const PER_LINE = 2;
// With a policy decline the server hands the turn to another model instead of stopping, where the model takes this.
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
const FINISH = { end_turn: 'stop', tool_use: 'tool_calls', max_tokens: 'length', refusal: 'content_filter', pause_turn: 'stop', stop_sequence: 'stop' };

// No model is named in this file. Which models there are, and what each can do, is the Models API's to say. The two
// things it doesn't say are found out by asking: whether a model hands a declined turn to another one (`fallbacks`), and
// whether it can answer without thinking (`quiet`). A model that turns one of them down is remembered while the app runs.
const refuses = { fallbacks: new Set(), quiet: new Set() };

const client = ({ key, baseURL }) => new Anthropic({ apiKey: key, baseURL, maxRetries: 2 });

// Everything the chat needs about a model comes from the Models API: name, window, vision and the effort levels it takes.
function describe(model) {
 const caps = model.capabilities || {};
 const levels = EFFORT_LEVELS.filter(level => caps.effort?.[level]?.supported);
 const adaptive = !!caps.thinking?.types?.adaptive?.supported;
 const budget = !!caps.thinking?.types?.enabled?.supported;
 let efforts = ['none'], thinking = 'none';
 if (adaptive) {
  thinking = 'adaptive';
  efforts = [...(refuses.quiet.has(model.id) ? [] : ['none']), ...(levels.length ? levels : ['high'])];
 } else if (budget) {
  thinking = 'budget';
  efforts = ['none', 'low', 'high'];
 }
 return {
  id: `anthropic:${model.id}`,
  provider: 'anthropic',
  api: model.id,
  name: model.display_name || model.id,
  context: model.max_input_tokens || 200000,
  output: model.max_tokens || MAX_OUTPUT,
  vision: !!caps.image_input?.supported,
  efforts,
  defaultEffort: efforts.includes('high') ? 'high' : efforts[efforts.length - 1],
  thinking,
 };
}

// The line a model belongs to: its name without the version, so "Claude Opus 5.5" and "Claude Opus 5" are one line.
const lineOf = model => (model.display_name || model.id).replace(/[\d.]+/g, ' ').replace(/[-\s]+/g, ' ').trim().toLowerCase();
const released = model => Date.parse(model.created_at) || 0;

// Every model the key can use, the newest first, as the Models API lists them. A model Anthropic releases tomorrow is in
// the list the next time it is read. Of each line only the newest few stay, or the picker would fill up with models
// their own successors have replaced.
async function models(request) {
 const all = [];
 for await (const model of client(request).models.list({ limit: 1000 })) all.push(model);
 const taken = new Map();
 return all.sort((a, b) => released(b) - released(a)).filter(model => {
  const line = lineOf(model), count = (taken.get(line) || 0) + 1;
  taken.set(line, count);
  return count <= PER_LINE;
 }).map(describe);
}

const text = content => typeof content === 'string' ? content : (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');

function image(url, vision) {
 const match = /^data:([^;,]+);base64,(.*)$/s.exec(url || '');
 if (!vision || !match || !IMAGE_TYPES.has(match[1])) return { type: 'text', text: NO_VISION };
 return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
}

function user(content, vision) {
 const blocks = typeof content === 'string' ? [{ type: 'text', text: content }]
  : (content || []).map(part => part.type === 'image_url' ? image(part.image_url.url, vision) : { type: 'text', text: part.text || '' });
 const kept = blocks.filter(block => block.type !== 'text' || block.text.trim());
 return kept.length ? kept : [{ type: 'text', text: '…' }];
}

function input(value) {
 try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}

// Claude keeps a request in its cache up to the places marked for it, and reads the cache only at a place an earlier
// request marked. Three places are marked by hand: the end of the system prompt's first part, which every chat shares,
// the end of the whole system prompt, and the message the request before ended with (`cache` on it). The end of the
// request itself is marked by the API, see `stream`. Thinking blocks and empty text can't carry a mark.
const CACHE = { type: 'ephemeral' };
const MARKABLE = new Set(['text', 'image', 'tool_use', 'tool_result', 'document']);

function marked(blocks) {
 const at = blocks.findLastIndex(block => MARKABLE.has(block.type) && (block.type !== 'text' || block.text));
 return at < 0 ? blocks : blocks.with(at, { ...blocks[at], cache_control: CACHE });
}

function blocksOf(message, vision) {
 if (message.role === 'tool') return [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content || '…' }];
 if (message.role !== 'assistant') return user(message.content, vision);
 if (message.native?.provider === 'anthropic') return message.native.content;
 const blocks = message.content?.trim() ? [{ type: 'text', text: message.content }] : [];
 for (const call of message.tool_calls || []) blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input: input(call.function.arguments) });
 return blocks;
}

// Consecutive turns of one role merge, so tool results, pictures from tools and queued messages share one user turn, results first.
// The system prompt comes back as its parts, in order.
function convert(messages, vision) {
 const system = [], out = [];
 for (const message of messages) {
  if (message.role === 'system') { system.push(text(message.content)); continue; }
  const role = message.role === 'assistant' ? 'assistant' : 'user';
  const blocks = message.cache ? marked(blocksOf(message, vision)) : blocksOf(message, vision);
  if (!blocks.length) continue;
  const last = out[out.length - 1];
  if (last?.role === role) last.content.push(...blocks);
  else out.push({ role, content: [...blocks] });
 }
 return { system: system.filter(Boolean), messages: out };
}

// `quiet`: the model may be asked to answer without thinking. One that can't thinks as little as it is able to instead.
function thinking({ thinking: mode, effort }, quiet = true) {
 if (mode === 'adaptive') {
  if (effort === 'none' && quiet) return { thinking: { type: 'disabled' } };
  return { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: effort === 'none' ? 'low' : effort } };
 }
 if (mode === 'budget' && BUDGET[effort]) return { thinking: { type: 'enabled', budget_tokens: BUDGET[effort] } };
 return {};
}

// After a fallback mid-answer only the text before the last switch point is echoed back, together with everything after it.
function echo(content) {
 const last = content.map(block => block.type).lastIndexOf('fallback');
 if (last < 0) return content;
 return [...content.slice(0, last).filter(block => block.type === 'text'), ...content.slice(last + 1)];
}

function problem(cause) {
 if (cause instanceof SDK.APIUserAbortError || cause?.name === 'AbortError') return Object.assign(new Error('Aborted'), { name: 'AbortError' });
 if (cause instanceof SDK.APIConnectionError) return Object.assign(new Error('network'), { status: 0, code: 'network' });
 if (cause instanceof SDK.APIError) {
  const detail = cause.error?.error?.message || cause.message || '';
  return Object.assign(new Error(detail || `Anthropic returned error ${cause.status}`), { status: cause.status || 0, code: cause.error?.error?.type || '' });
 }
 return cause instanceof Error ? cause : new Error(String(cause));
}

// What goes to the Messages API. A request nothing follows (`once`: a summary, a chat's name) asks for no cache at all:
// writing one costs more than plain input, and nobody would read it.
function build(request, quiet = true) {
 const { model, vision = true, messages, tools, maxTokens, output, once = false } = request;
 const { system, messages: history } = convert(once ? messages.map(({ cache, ...message }) => message) : messages, vision);
 const params = {
  model,
  max_tokens: Math.min(maxTokens || MAX_OUTPUT, output || MAX_OUTPUT),
  messages: history,
  ...thinking(request, quiet),
 };
 if (system.length) params.system = system.map((part, k) => ({ type: 'text', text: part, ...(!once && (k === 0 || k === system.length - 1) ? { cache_control: CACHE } : {}) }));
 // The mark at the end of the request: the API puts it on the last block and moves it on as the chat grows.
 if (!once) params.cache_control = CACHE;
 if (tools?.length) params.tools = tools.map(tool => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters, eager_input_streaming: true }));
 return params;
}

// A request the API turned down before it answered anything, for something in the request itself rather than the key,
// the account or the load: the same request without an extra may still go through.
const declined = cause => cause instanceof SDK.APIError && cause.status >= 400 && cause.status < 500 && ![401, 403, 408, 409, 429].includes(cause.status);

async function stream(request, { signal, onEvent = () => {}, baseURL }) {
 const { key, model } = request;
 const api = client({ key, baseURL });
 let content = '', blocks = 0, began = false;
 const send = ({ fallbacks, quiet }) => {
  const params = build(request, quiet);
  const live = fallbacks ? api.beta.messages.stream({ ...params, ...FALLBACK }, { signal }) : api.messages.stream(params, { signal });
  live.on('streamEvent', event => {
   began = true;
   // Text blocks after the first one start a new paragraph, the same as they are stored.
   if (event.type === 'content_block_start' && event.content_block?.type === 'text' && blocks++ && content) {
    content += '\n\n';
    onEvent({ type: 'content', delta: '\n\n' });
   }
  });
  live.on('text', delta => { content += delta; onEvent({ type: 'content', delta }); });
  live.on('thinking', delta => onEvent({ type: 'reasoning', delta }));
  return live.finalMessage();
 };
 // The request goes with the extras the model is not known to turn down. Turned down, it goes again without one of them,
 // the fallback first; the extra dropped last before it went through is the one the model doesn't take.
 const extras = { fallbacks: !request.once && !refuses.fallbacks.has(model), quiet: !refuses.quiet.has(model) };
 const asksQuiet = request.thinking === 'adaptive' && request.effort === 'none';
 let message, dropped = '';
 for (;;) {
  try {
   message = await send(extras);
   break;
  } catch (cause) {
   const extra = began || !declined(cause) ? '' : extras.fallbacks ? 'fallbacks' : extras.quiet && asksQuiet ? 'quiet' : '';
   if (!extra) throw problem(cause);
   extras[extra] = false;
   dropped = extra;
  }
 }
 if (dropped) refuses[dropped].add(model);
 let kept = echo(message.content || []);
 // A tool input cut off at max_tokens or by a refusal is never run, and never echoed back.
 if (message.stop_reason === 'max_tokens' || message.stop_reason === 'refusal') kept = kept.filter(block => block.type !== 'tool_use');
 const usage = message.usage || {};
 const prompt = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
 return {
  content,
  reasoning: kept.filter(block => block.type === 'thinking').map(block => block.thinking).join('\n\n'),
  toolCalls: kept.filter(block => block.type === 'tool_use').map(block => ({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } })),
  finishReason: FINISH[message.stop_reason] || message.stop_reason || 'stop',
  usage: { prompt_tokens: prompt, completion_tokens: usage.output_tokens || 0, total_tokens: prompt + (usage.output_tokens || 0), cached_tokens: usage.cache_read_input_tokens || 0, written_tokens: usage.cache_creation_input_tokens || 0 },
  native: { provider: 'anthropic', content: kept.filter(block => block.type !== 'fallback') },
  // The model turned out unable to answer without thinking: its list of effort levels is to be read again.
  ...(dropped === 'quiet' ? { stale: true } : {}),
 };
}

module.exports = { models, stream, convert, build, describe };
