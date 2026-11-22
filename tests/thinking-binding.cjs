'use strict';
// A signed thinking block bound to a history that has since changed (Claude Haiku 5.5 after a summary in economy): the
// API turns the request down with "bound to a different conversation", and the app sends it once more with the thinking
// taken out of every earlier reply, its text and tool calls kept. Actual Anthropic SDK against a loopback server only.
const http = require('node:http'), assert = require('node:assert/strict');
const Claude = require('../desktop/anthropic.js');
let count = 0;
const check = (name, ok, detail = '') => { assert.ok(ok, `${name}${detail ? ` — ${detail}` : ''}`); count++; console.log(`ok  ${name}`); };
const requests = [];
const BOUND = 'messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation. Remove the block, or set `thinking.block_binding.prefix_mismatch_behavior` to "drop_block".';
const send = (res, value, name) => { res.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`); };
const server = http.createServer(async (req, res) => {
 let text = '';
 for await (const chunk of req) text += chunk;
 const body = JSON.parse(text);
 requests.push(body);
 const thought = body.messages.some(message => Array.isArray(message.content) && message.content.some(block => block.type === 'thinking' || block.type === 'redacted_thinking'));
 if (thought && !body.model.includes('plain')) {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: BOUND } }));
  return;
 }
 if (body.model.includes('other-400')) {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'messages: something else is wrong' } }));
  return;
 }
 res.writeHead(200, { 'Content-Type': 'text/event-stream' });
 send(res, { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } }, 'message_start');
 send(res, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, 'content_block_start');
 send(res, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } }, 'content_block_delta');
 send(res, { type: 'content_block_stop', index: 0 }, 'content_block_stop');
 send(res, { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }, 'message_delta');
 send(res, { type: 'message_stop' }, 'message_stop');
 res.end();
});

(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const baseURL = `http://127.0.0.1:${server.address().port}/anthropic`;
 const step = { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{}' } }], native: { provider: 'anthropic', content: [{ type: 'thinking', thinking: 'plan', signature: 'sig' }, { type: 'tool_use', id: 'c1', name: 'read_file', input: {} }] } };
 const messages = [{ role: 'user', content: 'summary of the chat' }, step, { role: 'tool', tool_call_id: 'c1', content: 'file' }];
 const base = { key: 'fixture-only', messages, effort: 'medium', thinking: 'adaptive', once: true };
 try {
  const got = await Claude.stream({ ...base, model: 'claude-haiku-5-5' }, { baseURL });
  check('Turned down for a bound thinking block, the request goes once more and is answered', got.content === 'OK' && requests.length === 2, String(requests.length));
  const again = requests[1].messages.find(message => message.role === 'assistant');
  check('...without the thinking, its tool call kept', !again.content.some(block => block.type === 'thinking') && again.content.some(block => block.type === 'tool_use' && block.id === 'c1'));
  check('...and the first request had sent the thinking as it was', requests[0].messages.find(message => message.role === 'assistant').content[0].type === 'thinking');
  requests.length = 0;
  await Claude.stream({ ...base, model: 'claude-plain-model' }, { baseURL });
  check('A request not turned down goes once, with its thinking', requests.length === 1 && requests[0].messages.find(message => message.role === 'assistant').content[0].type === 'thinking');
  requests.length = 0;
  const other = await Claude.stream({ ...base, model: 'claude-other-400', messages: [{ role: 'user', content: 'hi' }] }, { baseURL }).then(() => null, error => error);
  check('Another refusal is not retried for this', !!other && requests.length === 1, String(requests.length));
 } finally { server.close(); }
 console.log(`\n${count} checks passed`);
})().catch(error => { console.error(error); process.exit(1); });
