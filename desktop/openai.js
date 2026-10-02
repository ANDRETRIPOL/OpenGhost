'use strict';

// OpenAI through the Responses API: with an API key against api.openai.com, or with a ChatGPT sign-in against the Codex backend.
// The chat keeps its history in the Chat Completions shape; this module turns it into Responses input and the stream back into that shape.
const os = require('node:os');

const API_URL = 'https://api.openai.com/v1';
const CODEX_URL = 'https://chatgpt.com/backend-api/codex';
const NO_VISION = '[A picture was here, but the selected model can\'t see pictures]';
// The catalogue asks which version of Codex is asking and leaves out models too new for it. The app is not Codex and
// takes every model there is.
const CLIENT_VERSION = '99.0.0';
// What is taken of a model nothing more is known about: the window Codex itself works in, and the effort levels every
// reasoning model has.
const UNKNOWN = { context: 272000, efforts: ['low', 'medium', 'high'] };
// With names alone to go by: which of them are chat models, and how many of the newest the picker gets.
const NAMED = { chat: /^gpt-\d[\w.-]*$/, other: /audio|realtime|image|tts|transcribe|search|embedding|moderation|instruct|-\d{4}-\d{2}-\d{2}$/, max: 12 };

const error = (message, status = 0, code = '') => Object.assign(new Error(message), { status, code });

// No model is named in this file. OpenAI serves its own Codex a catalogue of the models an account can use, each with
// its name, its window, its effort levels and what it takes in, already picked and ordered for a model picker, and the
// same catalogue answers an API key. A model OpenAI adds, or takes away from a plan, is in or out of the list the next
// time it is read. The public /models only names models, so it says which of the catalogue's a key may use.
const levelsOf = entry => (entry.supported_reasoning_levels || []).map(level => typeof level === 'string' ? level : level?.effort).filter(Boolean);
const offered = list => list.filter(entry => entry?.slug && entry.visibility === 'list').sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));

const describe = provider => entry => {
 const levels = levelsOf(entry), efforts = levels.length ? levels : UNKNOWN.efforts;
 return {
  id: `${provider}:${entry.slug}`,
  provider,
  api: entry.slug,
  name: entry.display_name || entry.slug,
  context: Number(entry.context_window) || UNKNOWN.context,
  vision: !Array.isArray(entry.input_modalities) || entry.input_modalities.includes('image'),
  efforts,
  defaultEffort: efforts.includes(entry.default_reasoning_level) ? entry.default_reasoning_level : efforts.includes('medium') ? 'medium' : efforts[0],
 };
};

const client = version => ({ originator: 'openghost', 'User-Agent': `OpenGhost/${version} (${os.platform()} ${os.release()}; ${os.arch()})` });

// What the Codex backend wants of a signed-in ChatGPT account.
function signed(account, version) {
 const headers = { Authorization: `Bearer ${account.access}`, ...client(version) };
 if (account.account) headers['ChatGPT-Account-Id'] = account.account;
 if (account.residency) headers['x-openai-internal-codex-residency'] = account.residency;
 return headers;
}

// The catalogue is big and changes rarely: an unchanged one answers "not modified", and the copy kept here is used.
const catalogs = new Map();

async function catalog(who, headers, codexUrl) {
 const had = catalogs.get(who);
 const response = await fetch(`${codexUrl}/models?client_version=${CLIENT_VERSION}`, { headers: { ...headers, ...(had ? { 'If-None-Match': had.etag } : {}) } });
 if (response.status === 304 && had) return had.models;
 if (!response.ok) throw await failure(response);
 const list = (await response.json()).models;
 if (!Array.isArray(list)) throw error('OpenAI sent no list of models');
 const etag = response.headers.get('etag');
 if (etag) catalogs.set(who, { etag, models: list });
 return list;
}

// Without the catalogue only names are known: the chat models among them, the newest first.
const title = id => id.replace(/^gpt/, 'GPT').replace(/-([a-z])/g, (match, letter) => `-${letter.toUpperCase()}`);
const named = list => list.filter(item => NAMED.chat.test(item.id) && !NAMED.other.test(item.id)).sort((a, b) => (b.created || 0) - (a.created || 0))
 .slice(0, NAMED.max).map(item => describe('openai')({ slug: item.id, display_name: title(item.id) }));

async function models({ provider, key }, { chatgpt, version = '', apiUrl = API_URL, codexUrl = CODEX_URL } = {}) {
 if (provider === 'chatgpt') {
  const account = await chatgpt();
  return offered(await catalog(`chatgpt ${account.account || ''}`, signed(account, version), codexUrl)).map(describe('chatgpt'));
 }
 const response = await fetch(`${apiUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
 if (!response.ok) throw await failure(response);
 const usable = new Map(((await response.json()).data || []).map(item => [item.id, item]));
 const listed = await catalog(`key ${key}`, { Authorization: `Bearer ${key}`, ...client(version) }, codexUrl).catch(() => null);
 if (!listed) return named([...usable.values()]);
 return offered(listed).filter(entry => entry.supported_in_api !== false && usable.has(entry.slug)).map(describe('openai'));
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
 const headers = signed(await chatgpt(), version);
 if (session) headers['session-id'] = session;
 return { url: `${codexUrl}/responses`, headers };
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
 // One key for all of a chat's requests keeps them on the servers that already hold the chat's cache. OpenAI's own Codex
 // sends the same key; the ChatGPT backend also reads it from the session-id header.
 if (request.session) body.prompt_cache_key = request.session;
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
   const details = usage.input_tokens_details || {};
   result.usage = { prompt_tokens: usage.input_tokens || 0, completion_tokens: usage.output_tokens || 0, total_tokens: usage.total_tokens || 0, cached_tokens: details.cached_tokens || 0, written_tokens: details.cache_write_tokens || 0 };
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
