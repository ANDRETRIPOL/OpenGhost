'use strict';

// Streaming client for OpenAI Chat Completions-compatible providers (like Kimchi).
const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';

const text = content => typeof content === 'string' ? content : (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');

function parts(content, vision) {
 if (typeof content === 'string') return [{ type: 'text', text: content }];
 return (content || []).map(part => part.type !== 'image_url' ? { type: 'text', text: part.text || '' }
  : vision ? { type: 'image_url', image_url: { url: part.image_url.url } } : { type: 'text', text: NO_VISION });
}

function convert(messages, vision) {
 const out = [];
 for (const message of messages) {
  if (message.role === 'system') out.push({ role: 'system', content: text(message.content) });
  else if (message.role === 'tool') out.push({ role: 'tool', tool_call_id: message.tool_call_id, content: message.content || '' });
  else if (message.role === 'assistant') {
   const entry = { role: 'assistant', content: text(message.content) || '' };
   if (message.reasoning) entry.reasoning_content = message.reasoning;
   if (message.tool_calls?.length) entry.tool_calls = message.tool_calls;
   out.push(entry);
  } else out.push({ role: 'user', content: parts(message.content, vision) });
 }
 return out;
}

const error = (message, status = 0, code = '') => Object.assign(new Error(message), { status, code });

async function failure(response) {
 let raw = '', detail = '', code = '';
 try {
  raw = await response.text();
  try {
   const body = JSON.parse(raw);
   detail = body.error?.message || body.message || '';
   code = body.error?.code || body.error?.type || '';
  } catch {
   detail = raw;
  }
 } catch {}
 console.error(`[LLM Error] HTTP ${response.status} from ${response.url}:`, detail || raw || response.statusText);
 return error(detail || `Provider returned error ${response.status}`, response.status, code);
}

async function models({ provider = 'kimchi', key, apiUrl = 'https://llm.kimchi.dev/openai/v1', headers = {}, preset = [] }) {
 const reqHeaders = { Authorization: `Bearer ${key}`, ...(headers || {}) };
 console.log(`[LLM] Fetching models from: ${apiUrl}/models (headers: ${JSON.stringify(reqHeaders)})`);
 const response = await fetch(`${apiUrl}/models`, { headers: reqHeaders });
 if (!response.ok) {
  console.error(`[LLM] Models fetch failed with HTTP ${response.status} for ${apiUrl}/models`);
  throw await failure(response);
 }
 const body = await response.json();
 const remoteIds = [...new Set((body.data || []).map(item => item.id))].filter(Boolean);
 console.log(`[LLM] Successfully fetched ${remoteIds.length} model IDs from ${apiUrl}/models:`, remoteIds);

 if (Array.isArray(preset) && preset.length > 0) {
  return preset.map(item => ({
   id: item.id.includes(':') ? item.id : `${provider}:${item.id}`,
   api: item.api || item.id,
   provider,
   name: item.name || item.id,
   context: item.context || 1048576,
   vision: item.vision !== false,
  }));
 }

 return remoteIds.map(id => ({
  id: `${provider}:${id}`,
  api: id,
  provider,
  name: id,
  context: 1048576,
  vision: true,
 }));
}

async function* events(body) {
 const decoder = new TextDecoder();
 let buffer = '';
 const parse = block => block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
 for await (const chunk of body) {
  buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
  let at;
  while ((at = buffer.indexOf('\n\n')) >= 0) {
   const data = parse(buffer.slice(0, at));
   buffer = buffer.slice(at + 2);
   if (data && data !== '[DONE]') yield JSON.parse(data);
  }
 }
 const data = parse(buffer);
 if (data && data !== '[DONE]') yield JSON.parse(data);
}

async function stream(request, context) {
 const { model, key, messages, tools, maxTokens, vision = true } = request;
 const { signal, onEvent = () => {}, apiUrl = 'https://llm.kimchi.dev/openai/v1', headers = {}, extraBody = {} } = context;
 const body = {
  model,
  messages: convert(messages, vision),
  stream: true,
  max_tokens: maxTokens,
  stream_options: { include_usage: true },
  ...(extraBody || {}),
 };
 if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }
 const reqHeaders = {
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Accept: 'text/event-stream',
  ...(headers || {}),
 };
 console.log(`[LLM] Streaming chat to: ${apiUrl}/chat/completions (model: ${model}, headers: ${JSON.stringify(reqHeaders)})`);
 let response;
 try {
  response = await fetch(`${apiUrl}/chat/completions`, {
   method: 'POST', signal,
   headers: reqHeaders,
   body: JSON.stringify(body),
  });
 } catch (cause) {
  if (cause.name === 'AbortError') {
   console.log('[LLM] Request aborted by user.');
   throw cause;
  }
  console.error('[LLM Network Error]:', cause);
  throw error('network', 0, 'network');
 }
 if (!response.ok) {
  console.error(`[LLM] Chat stream failed with HTTP ${response.status} for ${apiUrl}/chat/completions`);
  throw await failure(response);
 }
 const result = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null };
 const calls = new Map();
 for await (const event of events(response.body)) {
  const choice = event.choices?.[0];
  if (choice) {
   const delta = choice.delta || {};
   if (delta.content) { result.content += delta.content; onEvent({ type: 'content', delta: delta.content }); }
   const reasoning = delta.reasoning_content ?? delta.reasoning;
   if (reasoning) { result.reasoning += reasoning; onEvent({ type: 'reasoning', delta: reasoning }); }
   for (const call of delta.tool_calls || []) {
    const index = call.index ?? 0;
    const current = calls.get(index) || { id: '', name: '', arguments: '' };
    if (call.id) current.id = call.id;
    if (call.function?.name) current.name = call.function.name;
    if (call.function?.arguments) current.arguments += call.function.arguments;
    calls.set(index, current);
    onEvent({ type: 'tool_call', index, id: call.id, name: call.function?.name, arguments: call.function?.arguments });
   }
   if (choice.finish_reason) result.finishReason = choice.finish_reason;
  }
  if (event.usage) result.usage = { prompt_tokens: event.usage.prompt_tokens || 0, completion_tokens: event.usage.completion_tokens || 0, total_tokens: event.usage.total_tokens || 0 };
 }
 result.toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } }));
 if (!result.finishReason) result.finishReason = result.toolCalls.length ? 'tool_calls' : 'stop';
 return result;
}

module.exports = { models, stream, convert, text, parts };
