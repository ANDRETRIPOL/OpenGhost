'use strict';

// OpenAI through the Responses API: with an API key against api.openai.com, or with a ChatGPT sign-in against the Codex backend.
// The chat keeps its history in the Chat Completions shape; this module turns it into Responses input and the stream back into that shape.
const os = require('node:os');

const API_URL = 'https://api.openai.com/v1';
const CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses';
const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';
const EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh'];

// Models the app offers, newest first; an API key shows the ones its /models lists.
const CATALOG = [
 { api: 'gpt-6-sol', name: 'GPT-6 Sol', context: 1050000, vision: true },
 { api: 'gpt-6-luna', name: 'GPT-6 Luna', context: 1050000, vision: true },
 { api: 'gpt-5.5', name: 'GPT-5.5', context: 1050000, vision: true },
 { api: 'gpt-5.4', name: 'GPT-5.4', context: 1050000, vision: true },
 { api: 'gpt-5.4-mini', name: 'GPT-5.4 mini', context: 400000, vision: true },
];
// Through a ChatGPT subscription the Codex backend serves these, each with a 272K input window.
const SUBSCRIPTION = [
 { api: 'gpt-6-sol', name: 'GPT-6 Sol', vision: true },
 { api: 'gpt-6-luna', name: 'GPT-6 Luna', vision: true },
 { api: 'gpt-5.5', name: 'GPT-5.5', vision: true },
 { api: 'gpt-5.4', name: 'GPT-5.4', vision: true },
 { api: 'gpt-5.4-mini', name: 'GPT-5.4 mini', vision: true },
 { api: 'gpt-5.3-codex-spark', name: 'GPT-5.3-Codex-Spark', vision: false, efforts: ['low', 'medium', 'high', 'xhigh'] },
];

const model = provider => entry => ({
 id: `${provider}:${entry.api}`,
 provider,
 api: entry.api,
 name: entry.name,
 context: entry.context || 272000,
 vision: entry.vision,
 efforts: entry.efforts || EFFORTS,
 defaultEffort: 'medium',
});

const error = (message, status = 0, code = '') => Object.assign(new Error(message), { status, code });

async function models({ provider, key, apiUrl = API_URL }) {
 if (provider === 'chatgpt') return SUBSCRIPTION.map(model('chatgpt'));
 const response = await fetch(`${apiUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
 if (!response.ok) throw await failure(response);
 const ids = new Set(((await response.json()).data || []).map(item => item.id));
 return CATALOG.filter(entry => ids.has(entry.api)).map(model('openai'));
}

const text = content => typeof content === 'string' ? content : (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');

function parts(content, vision) {
 if (typeof content === 'string') return [{ type: 'input_text', text: content }];
 return (content || []).map(part => part.type !== 'image_url' ? { type: 'input_text', text: part.text || '' }
  : vision ? { type: 'input_image', image_url: part.image_url.url, detail: 'auto' } : { type: 'input_text', text: NO_VISION });
}

// System messages become the instructions; a reply that came from OpenAI goes back as its own items, reasoning included.
function convert(messages, vision) {
 const instructions = [], input = [];
 for (const message of messages) {
  if (message.role === 'system') instructions.push(text(message.content));
  else if (message.role === 'tool') input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: message.content || '' });
  else if (message.role === 'assistant' && message.native?.provider === 'openai') input.push(...message.native.items);
  else if (message.role === 'assistant') {
   if (message.content) input.push({ role: 'assistant', content: [{ type: 'output_text', text: message.content }] });
   for (const call of message.tool_calls || []) input.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments || '{}' });
  } else input.push({ role: 'user', content: parts(message.content, vision) });
 }
 return { instructions: instructions.join('\n\n'), input };
}

// Items go back without their ids: with store off there is nothing on the server for an id to point at.
function keep(item) {
 if (item.type === 'reasoning') return { type: 'reasoning', summary: item.summary || [], encrypted_content: item.encrypted_content };
 if (item.type === 'function_call') return { type: 'function_call', call_id: item.call_id, name: item.name, arguments: item.arguments || '{}' };
 if (item.type === 'message') return { type: 'message', role: item.role || 'assistant', content: (item.content || []).filter(part => part.type === 'output_text').map(part => ({ type: 'output_text', text: part.text })) };
 return null;
}

async function failure(response) {
 let detail = '', code = '';
 try {
  const body = await response.json();
  detail = body.error?.message || body.detail?.message || (typeof body.detail === 'string' ? body.detail : '') || body.message || '';
  code = body.error?.code || body.error?.type || body.detail?.code || '';
 } catch {}
 return error(detail || `OpenAI returned error ${response.status}`, response.status, code);
}

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
   if (data && data !== '[DONE]') yield JSON.parse(data);
  }
 }
}

async function target({ provider, key, session }, { chatgpt, version, apiUrl = API_URL, codexUrl = CODEX_URL }) {
 if (provider !== 'chatgpt') return { url: `${apiUrl}/responses`, headers: { Authorization: `Bearer ${key}` } };
 const account = await chatgpt();
 const headers = {
  Authorization: `Bearer ${account.access}`,
  originator: 'openghost',
  'User-Agent': `OpenGhost/${version} (${os.platform()} ${os.release()}; ${os.arch()})`,
 };
 if (account.account) headers['ChatGPT-Account-Id'] = account.account;
 if (account.residency) headers['x-openai-internal-codex-residency'] = account.residency;
 if (session) headers['session-id'] = session;
 return { url: codexUrl, headers };
}

async function stream(request, context) {
 const { model: api, effort, vision = true, messages, tools } = request;
 const { signal, onEvent = () => {} } = context;
 const { instructions, input } = convert(messages, vision);
 const body = {
  model: api,
  instructions,
  input,
  store: false,
  stream: true,
  include: ['reasoning.encrypted_content'],
  reasoning: effort && effort !== 'none' ? { effort, summary: 'auto' } : { effort: 'none' },
 };
 if (tools?.length) {
  body.tools = tools.map(tool => ({ type: 'function', name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters, strict: false }));
  body.tool_choice = 'auto';
  body.parallel_tool_calls = true;
 }
 const { url, headers } = await target(request, context);
 let response;
 try {
  response = await fetch(url, { method: 'POST', signal, headers: { ...headers, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body) });
 } catch (cause) {
  if (cause.name === 'AbortError') throw cause;
  throw error('network', 0, 'network');
 }
 if (!response.ok) throw await failure(response);
 const result = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null, native: { provider: 'openai', items: [] } };
 let textItem = '';
 const say = delta => { result.content += delta; onEvent({ type: 'content', delta }); };
 for await (const event of events(response.body)) {
  if (event.type === 'response.output_text.delta') {
   // Separate message items read as separate paragraphs.
   if (textItem && event.item_id !== textItem && result.content) say('\n\n');
   textItem = event.item_id;
   say(event.delta);
  } else if (event.type === 'response.reasoning_summary_text.delta') {
   result.reasoning += event.delta;
   onEvent({ type: 'reasoning', delta: event.delta });
  } else if (event.type === 'response.output_item.done') {
   const item = keep(event.item);
   if (item) result.native.items.push(item);
   if (item?.type === 'function_call') result.toolCalls.push({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } });
  } else if (event.type === 'response.completed' || event.type === 'response.incomplete') {
   const done = event.response || {};
   const usage = done.usage || {};
   result.usage = { prompt_tokens: usage.input_tokens || 0, completion_tokens: usage.output_tokens || 0, total_tokens: usage.total_tokens || 0 };
   const reason = done.incomplete_details?.reason;
   result.finishReason = reason === 'max_output_tokens' ? 'length' : reason === 'content_filter' ? 'content_filter' : result.toolCalls.length ? 'tool_calls' : 'stop';
  } else if (event.type === 'response.failed' || event.type === 'error') {
   const problem = event.response?.error || event.error || event;
   throw error(problem.message || 'OpenAI stopped the answer', Number(problem.status) || 0, problem.code || '');
  }
 }
 return result;
}

module.exports = { models, stream, convert };
