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
// The picker shows this lineup, in this order, for whatever of it the key can use.
const LINEUP = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'];
// These models always think: their thinking can't be turned off.
const ALWAYS_THINKS = /^claude-(fable|mythos)-|^claude-opus-5-5/;
// On a policy decline these hand the turn to a fallback model on the server instead of stopping.
const FALLBACKS = new Set(['claude-fable-5-1', 'claude-opus-5']);
const FINISH = { end_turn: 'stop', tool_use: 'tool_calls', max_tokens: 'length', refusal: 'content_filter', pause_turn: 'stop', stop_sequence: 'stop' };

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
  efforts = [...(ALWAYS_THINKS.test(model.id) ? [] : ['none']), ...(levels.length ? levels : ['high'])];
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

async function models(request) {
 const found = new Map();
 for await (const model of client(request).models.list()) found.set(model.id, model);
 return LINEUP.filter(id => found.has(id)).map(id => describe(found.get(id)));
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

// Consecutive turns of one role merge, so tool results, pictures from tools and queued messages share one user turn, results first.
function convert(messages, vision) {
 const system = [], out = [];
 const push = (role, blocks) => {
  if (!blocks.length) return;
  const last = out[out.length - 1];
  if (last?.role === role) last.content.push(...blocks);
  else out.push({ role, content: [...blocks] });
 };
 for (const message of messages) {
  if (message.role === 'system') system.push(text(message.content));
  else if (message.role === 'tool') push('user', [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content || '…' }]);
  else if (message.role === 'assistant' && message.native?.provider === 'anthropic') push('assistant', message.native.content);
  else if (message.role === 'assistant') {
   const blocks = message.content?.trim() ? [{ type: 'text', text: message.content }] : [];
   for (const call of message.tool_calls || []) blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input: input(call.function.arguments) });
   push('assistant', blocks);
  } else push('user', user(message.content, vision));
 }
 return { system: system.join('\n\n'), messages: out };
}

function thinking({ thinking: mode, effort }) {
 if (mode === 'adaptive') {
  if (effort === 'none') return { thinking: { type: 'disabled' } };
  return { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort } };
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

async function stream(request, { signal, onEvent = () => {}, baseURL }) {
 const { key, model, vision = true, messages, tools, maxTokens, output } = request;
 const { system, messages: history } = convert(messages, vision);
 const params = {
  model,
  max_tokens: Math.min(maxTokens || MAX_OUTPUT, output || MAX_OUTPUT),
  system,
  messages: history,
  cache_control: { type: 'ephemeral' },
  ...thinking(request),
 };
 if (tools?.length) params.tools = tools.map(tool => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters, eager_input_streaming: true }));
 const api = client({ key, baseURL });
 const live = FALLBACKS.has(model)
  ? api.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
  : api.messages.stream(params, { signal });
 let content = '', blocks = 0;
 live.on('streamEvent', event => {
  // Text blocks after the first one start a new paragraph, the same as they are stored.
  if (event.type === 'content_block_start' && event.content_block?.type === 'text' && blocks++ && content) {
   content += '\n\n';
   onEvent({ type: 'content', delta: '\n\n' });
  }
 });
 live.on('text', delta => { content += delta; onEvent({ type: 'content', delta }); });
 live.on('thinking', delta => onEvent({ type: 'reasoning', delta }));
 let message;
 try {
  message = await live.finalMessage();
 } catch (cause) {
  throw problem(cause);
 }
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
 };
}

module.exports = { models, stream, convert, describe };
