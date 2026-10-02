(() => {
'use strict';

const BASE_URL = 'https://api.deepseek.com';

const statusMessage = status => I18n.has(`error.${status}`) ? I18n.t(`error.${status}`) : '';

class DeepSeekError extends Error {
 constructor(message, status = 0) {
  super(message);
  this.name = 'DeepSeekError';
  this.status = status;
 }
}

async function request(path, key, options = {}) {
 if (!/^[\x21-\x7e]+$/.test(key)) throw new DeepSeekError(statusMessage(401), 401);
 let response;
 try {
  response = await fetch(BASE_URL + path, { ...options, headers: { Authorization: `Bearer ${key}`, ...options.headers } });
 } catch (error) {
  if (error.name === 'AbortError') throw error;
  throw new DeepSeekError(I18n.t('error.network'));
 }
 if (response.ok) return response;
 let detail = '';
 try { detail = (await response.json()).error?.message || ''; } catch {}
 throw new DeepSeekError(statusMessage(response.status) || detail || I18n.t('error.status', { status: response.status }), response.status);
}

const DEFAULT_EFFORTS = ['none', 'low', 'high', 'max'];

const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';

function effortsOf(model) {
 const raw = model.effort?.supported_levels || model.reasoning_efforts || model.supported_reasoning_efforts || model.efforts;
 if (!Array.isArray(raw)) return DEFAULT_EFFORTS.slice();
 const levels = raw.map(item => typeof item === 'string' ? item : item?.id || item?.name).filter(Boolean);
 if (!levels.length) return DEFAULT_EFFORTS.slice();
 // The API lists only thinking levels; none is the app's own step that turns thinking off, which every model allows.
 const known = DEFAULT_EFFORTS.filter(level => level === 'none' || levels.includes(level));
 const extra = levels.filter(level => !DEFAULT_EFFORTS.includes(level));
 return [...known, ...extra];
}

async function listModels(key, signal) {
 const body = await (await request('/models', key, { signal })).json();
 return (body.data || []).filter(model => model?.id).map(model => ({
  id: model.id,
  name: model.name || '',
  context: Number(model.context_window) || 0,
  efforts: effortsOf(model),
  defaultEffort: model.effort?.default_level || '',
  vision: Array.isArray(model.input_modalities) ? model.input_modalities.includes('image') : true,
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

// The messages as DeepSeek takes them: the system prompt's parts as one message, and nothing on a message that is meant
// for another provider (its own blocks, a cache mark). DeepSeek matches a request against its cache from the first word
// on, by itself, so the order of the parts is all it needs.
function plain(messages) {
 const lead = messages.findIndex(message => message.role !== 'system'), count = lead < 0 ? messages.length : lead;
 const rest = messages.slice(count).map(({ native, cache, ...message }) => message);
 return count ? [{ role: 'system', content: messages.slice(0, count).map(message => message.content).join('\n\n') }, ...rest] : rest;
}

async function streamChat({ key, model, effort, vision = true, messages, tools, signal, onReasoning, onContent }) {
 const response = await request('/chat/completions', key, {
  method: 'POST',
  signal,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
   model,
   messages: plain(vision ? messages : textOnly(messages)),
   ...(tools?.length ? { tools } : {}),
   stream: true,
   stream_options: { include_usage: true },
   thinking: { type: effort === 'none' ? 'disabled' : 'enabled' },
   reasoning_effort: effort,
  }),
 });
 const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
 const calls = [];
 const result = { finishReason: null, usage: null, content: '', reasoning: '', toolCalls: calls };
 let buffer = '';
 const done = () => {
  result.toolCalls = calls.filter(call => call?.function.name);
  return result;
 };
 try {
  for (;;) {
   const { value, done: ended } = await reader.read();
   if (ended) break;
   buffer += value;
   const lines = buffer.split('\n');
   buffer = lines.pop();
   for (const line of lines) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return done();
    const chunk = JSON.parse(data);
    if (chunk.error) throw new DeepSeekError(chunk.error.message || I18n.t('error.generic'));
    if (chunk.usage) result.usage = chunk.usage;
    const choice = chunk.choices && chunk.choices[0];
    if (!choice) continue;
    const delta = choice.delta || {};
    if (delta.reasoning_content) {
     result.reasoning += delta.reasoning_content;
     onReasoning?.(delta.reasoning_content, result);
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
   }
  }
 } catch (error) {
  if (error.name === 'AbortError') throw Object.assign(error, { partial: done() });
  if (error instanceof DeepSeekError) throw error;
  throw new DeepSeekError(I18n.t('error.interrupted'));
 } finally {
  reader.cancel().catch(() => {});
 }
 return done();
}

async function complete({ key, model, messages, signal, maxTokens = 40 }) {
 signal?.throwIfAborted();
 const response = await request('/chat/completions', key, {
  method: 'POST',
  signal,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, messages, stream: false, max_tokens: maxTokens, thinking: { type: 'disabled' }, reasoning_effort: 'none' }),
 });
 const body = await response.json();
 return { content: body.choices?.[0]?.message?.content?.trim() || '', usage: body.usage || null };
}

// What is left on the DeepSeek account, in each currency it holds: DeepSeek's own figure, nothing worked out here.
async function balance(key, signal) {
 const body = await (await request('/user/balance', key, { signal })).json();
 return (body.balance_infos || []).filter(item => item?.currency).map(item => ({ currency: item.currency, total: Number(item.total_balance) || 0 }));
}

window.DeepSeek = { listModels, streamChat, complete, balance, DeepSeekError };
})();
