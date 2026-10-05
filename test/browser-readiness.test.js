'use strict';

// Issue #21: controlled renderer lifecycle and main-process guests, with no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const signal = () => new AbortController().signal;
const timers = cap => (fn, ms) => setTimeout(fn, cap && ms >= 1000 ? cap : ms);

function panelPage({ cap, bridge = { run: async () => ({ text: 'ok' }), shown() {}, cancel() {} } } = {}) {
 const views = [], notices = [];
 const document = { activeElement: null, createElement() {
  const view = new EventTarget();
  Object.assign(view, { classList: { toggle() {} }, setAttribute() {}, getWebContentsId: () => 7 + views.indexOf(view),
   remove() {}, getURL: () => 'about:blank', getTitle: () => '', blur() {}, focus() {} });
  views.push(view);
  return view;
 } };
 const window = { openghost: { browser: bridge, tools: bridge } };
 const context = vm.createContext({ window, document, AbortController, crypto: { randomUUID }, setTimeout: timers(cap), clearTimeout, queueMicrotask, console });
 for (const file of ['browser-panel.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context);
 const panel = Object.assign(Object.create(window.BrowserPanel.prototype), {
  tabs: [], active: null, open: false, control: 'agent', drivers: new Set(), jobs: new Map(), queue: Promise.resolve(), accounts: [], waiters: [],
  stage: { insertBefore() {} }, error: {}, render() {}, syncBar() {}, save() {}, giveBack() {}, sync() {},
 });
 const add = () => { const tab = panel.addTab(''); panel.active = tab; return tab; };
 const emit = (view, name, props = {}) => view.dispatchEvent(Object.assign(new Event(name), props));
 return { panel, add, views, emit, bridge, notices, window };
}

test('first readiness rejects on close, failed load, crash, timeout and cancellation', async () => {
 for (const reason of ['close', 'failed', 'crash', 'timeout', 'cancel']) {
  const { panel, add, views, emit } = panelPage({ cap: 25 });
  const tab = add(), controller = new AbortController();
  const ready = panel.ensure(tab, controller.signal);
  const expected = { close: 'tab_gone', failed: 'navigation_failed', crash: 'guest_crashed', timeout: 'timeout', cancel: 'cancelled' }[reason];
  const rejected = assert.rejects(ready, error => error.code === expected);
  if (reason === 'close') panel.close(tab);
  if (reason === 'failed') emit(views[0], 'did-fail-load', { isMainFrame: true, errorCode: -105, errorDescription: 'failed' });
  if (reason === 'crash') emit(views[0], 'render-process-gone');
  if (reason === 'cancel') controller.abort(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
  await rejected;
  tab.failReady?.(new Error('test cleanup'));
 }
});

test('a crashed guest has explicit gone state and is recreated on the next readiness attempt', async () => {
 const { panel, add, views, emit } = panelPage();
 const tab = add(), first = panel.ensure(tab, signal());
 emit(views[0], 'dom-ready');
 await first;
 emit(views[0], 'render-process-gone');
 assert.equal(tab.state, 'gone');
 const next = panel.ensure(tab, signal());
 assert.equal(views.length, 2);
 emit(views[1], 'dom-ready');
 assert.equal(await next, tab);
 assert.equal(tab.state, 'ready');
});

test('serialized calls pin the receipt tab, and queued cancellation never reaches the bridge', async () => {
 const gate = deferred(), runs = [];
 const { panel, add } = panelPage({ bridge: { shown() {}, cancel() {}, run: (id, name, args) => { runs.push(args); return gate.promise; } } });
 const tab = add(); tab.id = 7; tab.view = {}; tab.ready = Promise.resolve(tab); tab.state = 'ready';
 const first = panel.run('browser_snapshot', {}, { id: 'a', signal: signal() });
 const controller = new AbortController();
 const second = panel.run('browser_snapshot', {}, { id: 'b', signal: controller.signal });
 const third = panel.run('browser_snapshot', {}, { id: 'c', signal: signal() });
 await tick();
 assert.equal(runs.length, 1);
 controller.abort();
 assert.equal((await second).code, 'cancelled');
 add();
 gate.resolve({ text: 'first' });
 await first;
 assert.equal((await third).code, 'stale_tab');
 assert.equal(runs.length, 1);
});

test('abort while readying a new tab cannot dispatch later, and the queue is released', async () => {
 const { panel, views, emit } = panelPage();
 const controller = new AbortController();
 const run = panel.run('browser_tabs', { action: 'new', url: 'data:text/html,x' }, { id: 'new', signal: controller.signal });
 await tick();
 controller.abort();
 assert.equal((await run).code, 'cancelled');
 emit(views[0], 'dom-ready');
 const next = await panel.run('browser_tabs', { action: 'list' }, { id: 'list', signal: signal() });
 assert.match(next.text, /Tabs:/);
 assert.equal(panel.tabs.length, 1);
});

test('destroyed/replaced readiness rejects and old view events cannot mutate its replacement', async () => {
 for (const reason of ['destroyed', 'replaced', 'closed']) {
  const { panel, add, views, emit } = panelPage();
  const tab = add(), ready = panel.ensure(tab, signal());
  const rejected = assert.rejects(ready, error => error.code === 'tab_gone');
  if (reason === 'destroyed') emit(views[0], 'destroyed');
  if (reason === 'replaced') panel.createView(tab, 'about:blank');
  if (reason === 'closed') panel.close(tab);
  await rejected;
  if (reason === 'closed') {
   assert.equal(tab.state, 'gone');
   emit(views[0], 'dom-ready');
   assert.equal(tab.id, 0);
   continue;
  }
  const next = panel.ensure(tab, signal()), replacement = tab.view;
  for (const event of ['dom-ready', 'render-process-gone', 'destroyed', 'page-title-updated']) emit(views[0], event, { title: 'stale' });
  assert.equal(tab.view, replacement);
  assert.equal(tab.state, 'loading');
  assert.equal(tab.title, '');
  emit(replacement, 'dom-ready');
  await next;
  assert.equal(tab.id, 8);
 }
});

test('readiness timeout is terminal for that view, and a fresh attempt has its own readiness', async () => {
 const { panel, add, views, emit } = panelPage({ cap: 25 });
 const tab = add();
 await assert.rejects(panel.ensure(tab, signal()), error => error.code === 'timeout');
 emit(views[0], 'dom-ready');
 assert.equal(tab.state, 'failed');
 assert.equal(tab.id, 0);
 const next = panel.ensure(tab, signal());
 emit(views[0], 'destroyed');
 emit(views[1], 'dom-ready');
 await next;
 assert.equal(tab.state, 'ready');
 assert.equal(tab.id, 8);
});

test('Stop at dom-ready, before desktop registration, never dispatches the old job', async () => {
 for (const readyFirst of [false, true]) for (const name of ['browser_type', 'browser_tabs']) {
  const runs = [], cancels = [];
  const { panel, add, views, emit } = panelPage({ bridge: {
   shown() {}, cancel: id => cancels.push(id), run: async id => { runs.push(id); return { text: 'fresh' }; },
  } });
  const tab = add(), controller = new AbortController();
  const args = name === 'browser_tabs' ? { action: 'new', url: 'about:blank' } : { text: 'old' };
  const pending = panel.run(name, args, { id: 'old', signal: controller.signal });
  await tick();
  if (readyFirst) emit(views[0], 'dom-ready');
  controller.abort();
  if (!readyFirst) emit(views[0], 'dom-ready');
  assert.equal((await pending).code, 'cancelled');
  await tick();
  assert.deepEqual(runs, []);
  assert.deepEqual(cancels, ['old']);
  await panel.run('browser_snapshot', {}, { id: 'fresh', signal: signal() });
  assert.deepEqual(runs, ['fresh']);
  panel.close(tab);
 }
});

test('closing or replacing a tab cancels active and queued jobs bound to it', async () => {
 for (const replace of [false, true]) {
  const runs = [], cancels = [], gate = deferred();
  const { panel, add, emit } = panelPage({ bridge: {
   shown() {}, cancel: id => cancels.push(id), run: id => { runs.push(id); return gate.promise; },
  } });
  const tab = add(), ready = panel.ensure(tab, signal());
  emit(tab.view, 'dom-ready'); await ready;
  const first = panel.run('browser_wait', {}, { id: 'active', signal: signal() });
  const queued = panel.run('browser_type', { text: 'never' }, { id: 'queued', signal: signal() });
  await tick();
  if (replace) panel.createView(tab, 'about:blank'); else panel.close(tab);
  assert.equal((await first).code, 'tab_gone');
  assert.equal((await queued).code, 'tab_gone');
  gate.resolve({ text: 'late' });
  await tick();
  assert.deepEqual(runs, ['active']);
  assert.deepEqual(cancels.sort(), ['active', 'queued']);
  if (replace) panel.close(tab);
 }
});
