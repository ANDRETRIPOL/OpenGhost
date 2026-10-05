'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function page() {
 const bridge = { runs: [], cancels: [], shown() {} };
 bridge.run = (id, name, args) => { const job = { id, name, args, ...deferred() }; bridge.runs.push(job); return job.promise; };
 bridge.cancel = id => { bridge.cancels.push(id); };
 const window = { document: { activeElement: null }, openghost: { tools: bridge, browser: bridge },
  console, setTimeout, clearTimeout, queueMicrotask, AbortController };
 window.window = window;
 const context = vm.createContext(window);
 for (const file of ['agent-tools.js', 'browser-panel.js', 'chat.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
 const tab = { id: 7, view: { focus() {}, blur() {} } };
 const panel = window.browserPanel = Object.assign(Object.create(window.BrowserPanel.prototype), {
  drivers: new Set(), control: 'agent', waiters: [], jobs: new Map(), tabs: [tab], active: tab, lent: null,
  sync() {}, giveBack() {}, tabsLine: () => '', ensure: async () => tab,
 });
 const owner = Object.assign(Object.create(window.Chat.prototype), { settings: { mode: 'full' }, cwd: () => '/tmp', attachedVideos: () => [], showGhost() {} });
 const conv = { id: 'main' }; owner.begin(conv, {});
 const call = (name, args = {}, chat = owner, conversation = conv) => chat.useTool(conversation, conversation.turn, {}, { function: { name, arguments: JSON.stringify(args) } });
 return { bridge, panel, owner, conv, call, window };
}

test('Stop retires every active/queued main and mini-chat step; late results cannot revive input', async () => {
 const { bridge, panel, owner, conv, call, window } = page();
 const mini = Object.assign(Object.create(window.SideChat.prototype), { settings: owner.settings, cwd: owner.cwd, attachedVideos: owner.attachedVideos, showGhost() {} });
 const other = { id: conv.id }; mini.begin(other, {});
 const a = call('browser_wait'), b = call('browser_type', { text: 'old' }, mini, other);
 await tick(); assert.equal(panel.jobs.size, 2); assert.equal(bridge.runs.length, 1);
 owner.abort(conv); mini.abort(other);
 assert.match(await a, /stop|cancel/i); assert.match(await b, /stop|cancel/i);
 assert.equal(new Set(bridge.cancels).size, 2);
 bridge.runs[0].resolve({ text: 'late' }); await tick(); assert.equal(bridge.runs.length, 1);
});

test('Take Control plus rapid Hand Back observes the page instead of retrying old input', async () => {
 const { bridge, panel, call } = page();
 const gate = deferred(), run = panel.run.bind(panel);
 panel.run = async (...args) => { const result = await run(...args); if (result.taken) await gate.promise; return result; };
 const pending = call('browser_type', { text: 'old', submit: true }); await tick();
 await panel.take(); panel.handBack(); gate.resolve(); await tick();
 assert.deepEqual(bridge.runs.map(job => job.name), ['browser_type', 'browser_snapshot']);
 bridge.runs[1].resolve({ text: 'fresh page' }); assert.match(await pending, /fresh page/);
 bridge.runs[0].resolve({ text: 'late' });
});

test('Stop releases Hand Back waiters without a later Hand Back', async () => {
 const { bridge, panel, owner, conv, call } = page();
 panel.drive(conv, true); await panel.take();
 const a = call('browser_click', { ref: 1 }), b = call('browser_type', { text: 'x' }); await tick();
 owner.abort(conv); await Promise.all([a, b]);
 assert.equal(panel.waiters.length, 0); assert.equal(bridge.runs.length, 0);
});

test('Take Control awaits an earlier Stop acknowledgement, and failed acknowledgements fail closed', async () => {
 for (const fail of [false, true]) {
  const { bridge, panel, owner, conv, call } = page(); const ack = deferred(), notices = [];
  const pending = call('browser_wait'); await tick();
  bridge.cancel = () => fail ? Promise.reject(new Error('IPC lost')) : ack.promise;
  panel.notify = text => notices.push(text);
  owner.abort(conv); await pending; await tick();
  const taking = panel.take(); assert.equal(panel.control, 'taking'); panel.handBack(); assert.equal(panel.control, 'taking');
  ack.resolve(); await taking;
  assert.equal(panel.control, fail ? 'taking' : 'user');
  if (fail) assert.match(notices[0], /IPC lost/);
  bridge.runs[0].resolve({ text: 'late' });
 }
});

test('Stop from readiness or focus cannot dispatch to desktop', async () => {
 for (const focus of [false, true]) {
  const { bridge, panel, owner, conv, call } = page();
  if (focus) { panel.lent = panel.active.view; panel.active.view.focus = () => owner.abort(conv); }
  else panel.ensure = async () => { owner.abort(conv); return panel.active; };
  await call('browser_type', { text: 'never' }); await tick(); assert.equal(bridge.runs.length, 0);
 }
});

test('a result delivered before takeover remains the actual result', async () => {
 const { bridge, panel, call } = page(); const pending = call('browser_click', { ref: 1 }); await tick();
 bridge.runs[0].resolve({ text: 'clicked' }); panel.take(); assert.equal(await pending, 'clicked');
});

test('non-browser cancellation keeps generic IPC and does not use BrowserPanel', async () => {
 const { bridge, owner, conv, call } = page(); const pending = call('run_bash', { command: 'fixture' }); await tick();
 owner.abort(conv); assert.match(await pending, /stop|cancel/i); assert.ok(bridge.cancels.includes(bridge.runs[0].id));
 bridge.runs[0].resolve({ output: 'late', code: 0, seconds: 0 });
});

test('generic tool:cancel awaits registered browser settlement, preserving other tool owners', async () => {
 const gate = deferred(); let signal;
 const module = { exports: {} };
 vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'desktop/tools.js'), 'utf8'), {
  module, __dirname: path.join(ROOT, 'desktop'), process, Buffer, AbortController, setTimeout, clearTimeout,
  require: name => name === './browser' ? { run: (...args) => { signal = args[3]; return gate.promise; } } :
   ['electron', './media', './pdf'].includes(name) ? {} : require(name),
 });
 const tools = module.exports;
 const running = tools.runTool('job', 'browser_wait', {}, '', {});
 assert.equal((await tools.runTool('job', 'browser_wait', {}, '', {})).code, 'invalid_request');
 assert.equal((await tools.runTool('', 'browser_wait', {}, '', {})).code, 'invalid_request');
 let acknowledged = false; const ack = tools.cancel('job').then(() => { acknowledged = true; });
 await tick(); assert.equal(signal.aborted, true); assert.equal(acknowledged, false);
 gate.resolve({ text: 'settled' }); await running; await ack; assert.ok(acknowledged);
 // Execute the actual guarded IPC registration, not a mock handler.
 const line = fs.readFileSync(path.join(ROOT, 'desktop/main.js'), 'utf8').split('\n').find(line => line.startsWith("ipcMain.handle('tool:cancel'"));
 let handler;
 vm.runInNewContext(line, { ipcMain: { handle: (name, fn) => { handler = fn; } }, fromApp: event => event.allowed, Tools: { cancel: () => gate.promise } });
 assert.equal(handler({ allowed: true }, 'job'), gate.promise);
 assert.equal(handler({ allowed: false }, 'job'), undefined);
});
