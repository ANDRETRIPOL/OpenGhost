'use strict';

// The line between chat.js (the chat on screen) and agent-runtime.js (the agent behind it). The renderer's scripts run
// here as they do in the page, in one shared global scope, with the globals they reach at run time stubbed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Objects made inside the scripts' context have its own prototypes; compared as plain data.
const plain = value => JSON.parse(JSON.stringify(value));

function load(files, globals = {}) {
 const context = vm.createContext({ ...globals });
 context.window = context;
 for (const file of files) vm.runInContext(source(file), context, { filename: file });
 return context;
}

const STUBS = () => ({
 AgentTools: {
  available: true,
  schemas: [{ type: 'function', function: { name: 'read_file' } }],
  needsApproval: () => false,
  environment: async () => ({ os: 'Linux', user: 'u', home: '/home/u' }),
  run: async (name, args) => `read ${args.path}`,
  cancel() {},
 },
 AgentPrompt: { build: () => 'AGENT', environment: ({ folder }) => `FOLDER ${folder}`, state: ({ mode }) => `MODE ${mode}` },
 UserContext: { ready: Promise.resolve(), prompt: () => '', pictures: () => [] },
 Usage: { parts: () => null },
 FileKinds: { formatSize: size => `${size} B` },
 Providers: {},
});

// A chat with no screen: it keeps what the agent asks of it, in order.
function headless(context, script = {}) {
 const calls = [];
 const note = name => (...args) => { calls.push(name); return script[name]?.(...args); };
 class Headless extends context.AgentRuntime {}
 for (const name of ['openPart', 'takeQueue', 'showGhost', 'dismissGhost', 'approve', 'switchLabels', 'save']) Headless.prototype[name] = note(name);
 Headless.prototype.compactStart = (...args) => { calls.push('compactStart'); return { notice: true }; };
 Headless.prototype.finishNotice = (notice, ok) => calls.push(`finishNotice ${ok}`);
 const agent = new Headless();
 Object.assign(agent, {
  settings: { mode: 'auto', windowOf: () => 1_000_000 },
  library: { cwdOf: () => '/home/u/project', isHome: () => false, chat: () => null },
  nodes: new Map(),
  tools: 0,
  config: () => ({ id: 'model', provider: 'deepseek' }),
  modelOf: () => 'model',
 });
 return { agent, calls };
}

function conversation(messages) {
 const part = { view: {}, entry: { role: 'assistant', content: '', steps: [], turn: 't1', model: 'model' } };
 const conv = { id: 'c1', record: { id: 'c1' }, messages: [...messages, part.entry], tokens: 0, sent: 0 };
 const turn = { controller: new AbortController(), config: { id: 'model', provider: 'deepseek' }, part, parts: [part], queue: [], approvals: new Set(), tool: '' };
 return { conv, turn };
}

test('Chat builds on AgentRuntime and has every method the agent calls on it', () => {
 const { AgentRuntime, Chat, SideChat } = load(['agent-runtime.js', 'chat.js']);
 assert.equal(Object.getPrototypeOf(Chat.prototype), AgentRuntime.prototype);
 assert.equal(Object.getPrototypeOf(SideChat.prototype), Chat.prototype);
 const own = new Set(Object.getOwnPropertyNames(AgentRuntime.prototype));
 const called = new Set([...source('agent-runtime.js').matchAll(/this\.(\w+)\(/g)].map(m => m[1]));
 for (const name of called) {
  if (own.has(name)) continue;
  assert.equal(typeof Chat.prototype[name], 'function', `chat.js lacks ${name}, which the agent calls`);
 }
 // The agent's own methods stay its own: the chat doesn't redefine them, the mini chat changes only what it reads.
 for (const name of own) if (name !== 'constructor') assert.ok(!Object.hasOwn(Chat.prototype, name), `Chat redefines ${name}`);
 for (const name of ['history', 'seam', 'compactIfNeeded', 'attachedVideos']) assert.ok(Object.hasOwn(SideChat.prototype, name));
});

test('userContent hands attachments over as the model reads them', async () => {
 const { AgentRuntime } = load(['agent-runtime.js'], STUBS());
 const ready = payload => Promise.resolve(payload);
 assert.equal(await AgentRuntime.userContent({ text: 'hi', attachments: [] }, true), 'hi');
 const text = { name: 'a "b".txt', note: 'my note', size: 5, ready: ready({ type: 'text', text: 'hello', path: '/x/a.txt', truncated: true }) };
 assert.equal(await AgentRuntime.userContent({ text: 'see', attachments: [text] }, true),
  '<file name="a &quot;b&quot;.txt" note="my note" path="/x/a.txt" truncated="true">\nhello\n</file>\n\nsee');
 // Without the agent's tools the model gets no path it could not open.
 assert.equal(await AgentRuntime.userContent({ text: '', attachments: [text] }, false), '<file name="a &quot;b&quot;.txt" note="my note" truncated="true">\nhello\n</file>');
 const video = { name: 'v.mp4', size: 9, ready: ready({ type: 'video', path: '/v.mp4', duration: 2, width: 4, height: 3 }) };
 assert.equal(await AgentRuntime.userContent({ text: '', attachments: [video] }, true),
  '<file name="v.mp4" path="/v.mp4" size="9 B" duration="2.0 s" resolution="4×3">A video. Watch it with video_frames at this path.</file>');
 const image = { name: 'p.png', size: 1, ready: ready({ type: 'image', url: 'data:p' }) };
 assert.deepEqual(plain(await AgentRuntime.userContent({ text: 'look', attachments: [image] }, true)), [
  { type: 'text', text: 'Image p.png' }, { type: 'image_url', image_url: { url: 'data:p' } }, { type: 'text', text: 'look' },
 ]);
});

test('history starts from the latest summary', () => {
 const { AgentRuntime } = load(['agent-runtime.js'], STUBS());
 const history = AgentRuntime.prototype.history.call(null, { messages: [
  { role: 'user', content: 'old' },
  { role: 'compact', summary: 'S', resume: true },
  { role: 'user', text: 'new' },
  { role: 'assistant', steps: [{ role: 'assistant', content: 'a' }], content: 'a' },
  { role: 'assistant', content: 'restored' },
  { role: 'stats', stats: {} },
 ] });
 assert.equal(history.length, 5);
 assert.equal(history[0].role, 'system');
 assert.match(history[0].content, /compacted.*\n\nS$/s);
 assert.deepEqual(plain(history.slice(1).map(m => [m.role, m.content])), [['user', 'Go on with the task from where you stopped, using the summary above.'], ['user', 'new'], ['assistant', 'a'], ['assistant', 'restored']]);
});

test('a turn runs the tools the model calls and gives it their results', async () => {
 const stubs = STUBS(), requests = [];
 const replies = [
  { content: 'Reading.', toolCalls: [{ id: 'r1', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }], finishReason: 'tool_calls' },
  { content: 'Done.', toolCalls: [], finishReason: 'stop', usage: { total_tokens: 42 } },
 ];
 stubs.Providers.stream = async (config, { messages, tools, onContent }) => {
  requests.push({ messages, tools });
  const reply = replies[requests.length - 1];
  onContent(reply.content, { content: reply.content });
  return reply;
 };
 const context = load(['agent-runtime.js'], stubs);
 const { agent, calls } = headless(context);
 const { conv, turn } = conversation([{ role: 'user', content: 'read a.txt' }]);
 turn.part.view.stream = { push() {} };
 assert.equal(await agent.loop(conv, turn), 'stop');
 const steps = turn.part.entry.steps;
 assert.deepEqual(steps.map(s => s.role), ['user', 'assistant', 'tool', 'assistant']);
 assert.equal(steps[0].content, `${context.AgentRuntime.TOOL_NOTES.state}\nMODE auto`);
 assert.equal(steps[2].content, 'read a.txt');
 assert.equal(steps[2].tool_call_id, 'r1');
 assert.equal(turn.part.entry.content, 'Reading.\n\nDone.');
 assert.equal(conv.tokens, 42);
 // The second request repeats the first word for word and marks where it ended, so a provider can serve it from its cache.
 const [first, second] = requests.map(r => r.messages);
 assert.deepEqual(plain(second.slice(0, first.length - 1)), plain(first.slice(0, -1)));
 assert.equal(second.findIndex(m => m.cache), first.length - 1);
 assert.ok(first[0].content.startsWith('AGENT\n\n# Formatting\nFormat replies in Markdown'));
 assert.equal(first[1].content, 'FOLDER /home/u/project');
 assert.equal(requests[0].tools, stubs.AgentTools.schemas);
 assert.deepEqual(calls, ['dismissGhost', 'showGhost', 'showGhost', 'save', 'dismissGhost', 'save']);
});

test('compaction puts a summary in the history and leaves the notice to the chat', async () => {
 const stubs = STUBS();
 let asked;
 stubs.Providers.complete = async (config, request) => { asked = request; return 'SUMMARY'; };
 const { agent, calls } = headless(load(['agent-runtime.js'], stubs));
 const { conv, turn } = conversation([{ role: 'user', content: 'one' }, { role: 'assistant', content: 'two' }, { role: 'user', content: 'three' }]);
 conv.sent = 9;
 assert.equal(await agent.compact(conv, turn), true);
 assert.match(asked.messages[1].content, /^User: one\n\nOpenGhost: two$/);
 assert.deepEqual(conv.messages.map(m => m.role), ['user', 'assistant', 'compact', 'user', 'assistant']);
 assert.equal(conv.messages[2].summary, 'SUMMARY');
 assert.equal(conv.messages[2].resume, false);
 assert.equal(conv.sent, 0);
 assert.deepEqual(calls, ['compactStart', 'finishNotice true', 'save']);
});

test('a stopped compaction tells the chat it failed and stops the turn', async () => {
 const stubs = STUBS();
 stubs.Providers.complete = async () => { throw Object.assign(new Error('stopped'), { name: 'AbortError' }); };
 const { agent, calls } = headless(load(['agent-runtime.js'], stubs));
 const { conv, turn } = conversation([{ role: 'user', content: 'one' }, { role: 'assistant', content: 'two' }]);
 await assert.rejects(agent.compact(conv, turn), { name: 'AbortError' });
 assert.deepEqual(calls, ['compactStart', 'finishNotice false']);
 assert.ok(!conv.messages.some(m => m.role === 'compact'));
});
