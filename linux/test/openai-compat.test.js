'use strict';

// The OpenAI-compatible client against a small server that answers the way DeepSeek, Ollama and llama.cpp do.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Compat = require('../openai-compat');
const Engine = require('../desktop/compat');

// Each request the server sees, so a test can check what was sent.
const seen = [];
let server, baseURL;

// The SSE chunks of one streamed reply: thinking, text, a tool call split over two chunks, then usage.
const STREAM = [
 { choices: [{ delta: { role: 'assistant', reasoning_content: 'Let me ' } }] },
 { choices: [{ delta: { reasoning: 'think.' } }] },
 { choices: [{ delta: { content: 'Hello' } }] },
 { choices: [{ delta: { content: ' there' } }] },
 { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":' } }] } }] },
 { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"a.txt"}' } }] } }] },
 { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
 { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
];

function respond(request, response) {
 const body = request.body ? JSON.parse(request.body) : null;
 if (request.url === '/v1/models') {
  if (request.headers.authorization === 'Bearer wrong') {
   response.writeHead(401, { 'Content-Type': 'application/json' });
   return response.end(JSON.stringify({ error: { message: 'Authentication Fails', type: 'authentication_error' } }));
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  return response.end(JSON.stringify({ object: 'list', data: [
   { id: 'qwen2.5-coder:14b', object: 'model', owned_by: 'library' },
   { id: 'llava:13b', object: 'model', owned_by: 'library' },
   { id: 'deepseek-chat', object: 'model', context_window: 128000, input_modalities: ['text'] },
  ] }));
 }
 if (request.url === '/nolist/models') {
  response.writeHead(404, { 'Content-Type': 'text/plain' });
  return response.end('not found');
 }
 if (request.url === '/v1/chat/completions' && body.stream) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  // Windows-style line ends and a keep-alive comment, which a stream may carry.
  const ends = body.model === 'crlf' ? '\r\n\r\n' : '\n\n';
  const lines = [': keep-alive', ...STREAM.map(chunk => `data: ${JSON.stringify(chunk)}`), ...(body.model === 'no-done' ? [] : ['data: [DONE]'])];
  // A slow model sends one chunk at a time, the way a real server does, so a stop can land in the middle.
  if (body.model !== 'slow') {
   for (const line of lines) response.write(line + ends);
   return response.end();
  }
  const drip = () => {
   if (!lines.length) return response.end();
   response.write(lines.shift() + ends);
   setTimeout(drip, 5);
  };
  return drip();
 }
 if (request.url === '/v1/chat/completions') {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  return response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '  A title  ' } }] }));
 }
 response.writeHead(500, { 'Content-Type': 'application/json' });
 response.end(JSON.stringify({ error: { message: 'boom' } }));
}

before(async () => {
 server = http.createServer((request, response) => {
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
   const record = { url: request.url, headers: request.headers, body };
   seen.push(record);
   respond(record, response);
  });
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 baseURL = `http://127.0.0.1:${server.address().port}/v1`;
});

after(() => server.close());

const last = () => seen[seen.length - 1];
const sent = () => JSON.parse(last().body);

describe('addresses', () => {
 test('an address is taken in every shape people paste', () => {
  assert.equal(Compat.normalize(''), 'https://api.deepseek.com/v1');
  assert.equal(Compat.normalize('  https://api.deepseek.com/v1/ '), 'https://api.deepseek.com/v1');
  assert.equal(Compat.normalize('http://127.0.0.1:11434'), 'http://127.0.0.1:11434/v1');
  assert.equal(Compat.normalize('127.0.0.1:8080/v1'), 'http://127.0.0.1:8080/v1');
  assert.equal(Compat.normalize('http://localhost:1234/v1/chat/completions'), 'http://localhost:1234/v1');
  assert.equal(Compat.normalize('https://example.com/openai/v1/'), 'https://example.com/openai/v1');
 });

 test('a server on this computer is told from one elsewhere', () => {
  assert.equal(Compat.isLocal('http://127.0.0.1:11434/v1'), true);
  assert.equal(Compat.isLocal('http://localhost:8080'), true);
  assert.equal(Compat.isLocal('http://[::1]:8080/v1'), true);
  assert.equal(Compat.isLocal('https://api.deepseek.com/v1'), false);
  assert.equal(Compat.isLocal('http://192.168.1.10:11434/v1'), false);
  assert.equal(Compat.hostOf('http://127.0.0.1:11434/v1'), '127.0.0.1:11434');
 });
});

describe('models', () => {
 test('a local server gets a stand-in key and its models are listed', async () => {
  const models = await Compat.listModels({ baseURL, kind: 'custom' });
  assert.equal(last().headers.authorization, 'Bearer not-needed');
  assert.deepEqual(models.map(model => model.id), ['qwen2.5-coder:14b', 'llava:13b', 'deepseek-chat']);
  // A custom server gets no reasoning field, and a model is taken to see pictures only when its name says so.
  assert.deepEqual(models[0].efforts, ['none']);
  assert.equal(models[0].vision, false);
  assert.equal(models[1].vision, true);
  assert.equal(models[2].vision, false);
  assert.equal(models[2].context, 128000);
 });

 test('a key given is the one sent', async () => {
  await Compat.listModels({ baseURL, key: 'sk-test', kind: 'deepseek' });
  assert.equal(last().headers.authorization, 'Bearer sk-test');
 });

 test('DeepSeek models keep their effort levels', async () => {
  const models = await Compat.listModels({ baseURL, key: 'sk-test', kind: 'deepseek' });
  assert.deepEqual(models[0].efforts, ['none', 'low', 'high', 'max']);
  assert.equal(models[0].vision, true);
 });

 test('a refused key comes back with its status and the server\'s words', async () => {
  await assert.rejects(Compat.listModels({ baseURL, key: 'wrong', kind: 'custom' }), error => {
   assert.equal(error.name, 'CompatError');
   assert.equal(error.status, 401);
   assert.equal(error.code, 'authentication_error');
   assert.equal(error.message, 'Authentication Fails');
   return true;
  });
 });

 test('a server without a model list says so with its status', async () => {
  await assert.rejects(Compat.listModels({ baseURL: baseURL.replace('/v1', '/nolist'), kind: 'custom' }), error => error.status === 404);
 });

 test('a server that is not there is a connection error', async () => {
  await assert.rejects(Compat.listModels({ baseURL: 'http://127.0.0.1:1/v1', kind: 'custom' }), error => {
   assert.equal(error.code, 'network');
   assert.equal(error.message, 'Can\'t connect to 127.0.0.1:1');
   return true;
  });
 });
});

describe('streaming', () => {
 const messages = [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi', native: { provider: 'openai' } }];
 const tools = [{ type: 'function', function: { name: 'read_file', description: 'Reads a file', parameters: { type: 'object' } } }];

 test('a reply streams its thinking, its text and a tool call put together from its pieces', async () => {
  const reasoning = [], content = [];
  const result = await Compat.streamChat({
   endpoint: { baseURL, kind: 'custom' }, model: 'qwen2.5-coder:14b', effort: 'none', messages, tools,
   onReasoning: delta => reasoning.push(delta), onContent: delta => content.push(delta),
  });
  assert.equal(result.reasoning, 'Let me think.');
  assert.equal(result.content, 'Hello there');
  assert.deepEqual(reasoning, ['Let me ', 'think.']);
  assert.deepEqual(content, ['Hello', ' there']);
  assert.deepEqual(result.toolCalls, [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }]);
  assert.equal(result.finishReason, 'tool_calls');
  assert.deepEqual(result.usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
 });

 test('a custom server gets the standard fields only', async () => {
  await Compat.streamChat({ endpoint: { baseURL, kind: 'custom' }, model: 'qwen2.5-coder:14b', effort: 'none', messages, tools });
  const body = sent();
  assert.equal(body.model, 'qwen2.5-coder:14b');
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.deepEqual(body.tools, tools);
  assert.equal('thinking' in body, false);
  assert.equal('reasoning_effort' in body, false);
  assert.equal('max_tokens' in body, false);
  // What another provider left on a message doesn't travel.
  assert.deepEqual(body.messages[1], { role: 'user', content: 'Hi' });
 });

 test('a chosen reasoning level travels as reasoning_effort, and a window as max_tokens', async () => {
  await Compat.streamChat({ endpoint: { baseURL, kind: 'custom' }, model: 'm', effort: 'high', messages, maxTokens: 2048 });
  assert.equal(sent().reasoning_effort, 'high');
  assert.equal(sent().max_tokens, 2048);
  assert.equal('tools' in sent(), false);
 });

 test('DeepSeek gets its thinking switch', async () => {
  await Compat.streamChat({ endpoint: { baseURL, key: 'sk-test', kind: 'deepseek' }, model: 'deepseek-chat', effort: 'none', messages });
  assert.deepEqual(sent().thinking, { type: 'disabled' });
  assert.equal(sent().reasoning_effort, 'none');
  await Compat.streamChat({ endpoint: { baseURL, key: 'sk-test', kind: 'deepseek' }, model: 'deepseek-chat', effort: 'max', messages });
  assert.deepEqual(sent().thinking, { type: 'enabled' });
  assert.equal(sent().reasoning_effort, 'max');
 });

 test('pictures become a note for a model that can\'t see', async () => {
  const shown = [{ role: 'user', content: [{ type: 'text', text: 'Look' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }];
  await Compat.streamChat({ endpoint: { baseURL, kind: 'custom' }, model: 'm', vision: false, messages: shown });
  assert.equal(sent().messages[0].content, 'Look\n\n[A picture was here, but the selected model can\'t see pictures]');
  await Compat.streamChat({ endpoint: { baseURL, kind: 'custom' }, model: 'm', vision: true, messages: shown });
  assert.equal(sent().messages[0].content[1].type, 'image_url');
 });

 test('Windows line ends and a missing [DONE] still make a whole reply', async () => {
  for (const model of ['crlf', 'no-done']) {
   const result = await Compat.streamChat({ endpoint: { baseURL, kind: 'custom' }, model, messages });
   assert.equal(result.content, 'Hello there');
   assert.equal(result.toolCalls.length, 1);
  }
 });

 test('a stopped reply keeps what had arrived', async () => {
  const controller = new AbortController();
  await assert.rejects(Compat.streamChat({
   endpoint: { baseURL, kind: 'custom' }, model: 'slow', messages, signal: controller.signal,
   onContent: () => controller.abort(),
  }), error => {
   assert.equal(error.name, 'AbortError');
   assert.equal(error.partial.content, 'Hello');
   return true;
  });
 });
});

describe('completion', () => {
 test('a short answer comes back trimmed, with thinking off where there is a switch', async () => {
  assert.equal(await Compat.complete({ endpoint: { baseURL, key: 'sk-test', kind: 'deepseek' }, model: 'deepseek-chat', messages: [], maxTokens: 40 }), 'A title');
  assert.equal(sent().stream, false);
  assert.equal(sent().max_tokens, 40);
  assert.deepEqual(sent().thinking, { type: 'disabled' });
  assert.equal(await Compat.complete({ endpoint: { baseURL, kind: 'custom' }, model: 'm', messages: [] }), 'A title');
  assert.equal('thinking' in sent(), false);
 });
});

describe('main process engine', () => {
 test('deltas go out as events and the result comes back whole', async () => {
  const events = [];
  const result = await Engine.stream(
   { baseURL, key: '', model: 'qwen2.5-coder:14b', effort: 'none', messages: [{ role: 'user', content: 'Hi' }] },
   { onEvent: event => events.push(event) },
  );
  assert.deepEqual(events, [
   { type: 'reasoning', delta: 'Let me ' }, { type: 'reasoning', delta: 'think.' },
   { type: 'content', delta: 'Hello' }, { type: 'content', delta: ' there' },
  ]);
  assert.equal(result.content, 'Hello there');
  assert.equal(result.finishReason, 'tool_calls');
 });

 test('models are listed the way the page expects them', async () => {
  const models = await Engine.models({ baseURL, key: '' });
  assert.equal(models[0].provider, 'custom');
  assert.equal(models[0].api, 'qwen2.5-coder:14b');
 });
});
