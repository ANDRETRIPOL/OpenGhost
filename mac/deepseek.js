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

async function listModels(key, signal) {
 const body = await (await request('/models', key, { signal })).json();
 return body.data.map(model => model.id);
}

async function streamChat({ key, model, effort, messages, tools, signal, onReasoning, onContent }) {
 const response = await request('/chat/completions', key, {
  method: 'POST',
  signal,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
   model,
   messages,
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
 return body.choices?.[0]?.message?.content?.trim() || '';
}

window.DeepSeek = { listModels, streamChat, complete, DeepSeekError };
})();
