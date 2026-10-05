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

function mainBrowser({ cap, onTimer } = {}) {
 const session = new EventEmitter();
 session.setUserAgent = session.setPermissionRequestHandler = session.setPermissionCheckHandler = () => {};
 const image = { getSize: () => ({ width: 800, height: 600 }), toJPEG: () => Buffer.from('image') };
 const electron = { app: { getPath: () => '/tmp' }, session: { fromPartition: () => session }, nativeImage: { createFromBuffer: () => image } };
 const module = { exports: {} };
 vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'desktop/browser.js'), 'utf8'), {
  module, require: name => name === 'electron' ? electron : require(name), __dirname: path.join(ROOT, 'desktop'),
  process, Buffer, AbortController, setTimeout: (fn, ms) => { onTimer?.(ms); return timers(cap)(fn, ms); }, clearTimeout, console,
 });
 return { Browser: module.exports, session };
}

function guestPair(Browser, id = 1) {
 const guest = new EventEmitter(), sent = [];
 const host = { isDestroyed: () => false, send() {} };
 Object.assign(guest, { id, hostWebContents: host, isDestroyed: () => false, setWindowOpenHandler() {}, isLoading: () => false,
  getURL: () => 'data:text/html,test', getTitle: () => 'test', stop() {},
  executeJavaScriptInIsolatedWorld: async (world, [{ code }]) => {
   if (code.includes('await (__og.snapshot(')) return { ok: { lines: ['page'], refs: { 1: 'button' }, skipped: 0, truncated: true, scroll: { height: 600, vh: 600, vw: 800, top: 0, below: 0 } } };
   if (code.includes('await (__og.point(')) return { ok: { x: 10, y: 20, covered: '' } };
   if (code.includes('await (__og.has(')) return { ok: false };
   if (code.includes('await (__og.read(')) return { ok: { html: '<html>original</html>', sourceTruncated: false } };
   return { ok: true };
  },
  debugger: { isAttached: () => true, attach() {}, sendCommand: async (method, params) => {
   sent.push({ method, params });
   if (method === 'Page.getLayoutMetrics') return { cssVisualViewport: { clientWidth: 800, clientHeight: 600 }, cssContentSize: { height: 6000 } };
   return { data: '' };
  } },
 });
 Browser.adopt(host, guest);
 const run = (name, args = {}, sig = signal()) => Browser.run(name, { ...args, tab: id }, host, sig);
 return { guest, host, run, sent };
}

test('guest destruction/crash retires stalled work and cannot revive on a late response', async () => {
 for (const event of ['render-process-gone', 'destroyed']) {
  const { Browser } = mainBrowser();
  const { guest, run, sent } = guestPair(Browser);
  const gate = deferred();
  guest.executeJavaScript = () => gate.promise;
  const pending = run('browser_read');
  await tick();
  guest.emit(event);
  await assert.rejects(pending, error => error.code === (event === 'destroyed' ? 'tab_gone' : 'guest_crashed'));
  gate.resolve('late'); await tick();
  await assert.rejects(async () => run('browser_press', { key: 'Enter' }));
  assert.equal(sent.filter(item => item.method.startsWith('Input.')).length, 0);
 }
});

test('tab or page changes during pointer feedback prevent subsequent input', async () => {
 for (const changeTab of [false, true]) {
  const { Browser } = mainBrowser();
  const { guest, host, run, sent } = guestPair(Browser);
  host.send = () => changeTab ? Browser.setShown({ id: 2 }) : guest.emit('did-start-navigation', {}, 'about:blank', false, true);
  await assert.rejects(run('browser_click', { ref: 1 }), error => error.code === (changeTab ? 'stale_tab' : 'stale_page'));
  assert.equal(sent.filter(item => item.method.startsWith('Input.')).length, 0);
 }
});

test('cancelled queue entries do not dispatch even while an earlier guest command is stalled', async () => {
 const { Browser } = mainBrowser();
 const { guest, run, sent } = guestPair(Browser);
 const gate = deferred();
 guest.debugger.sendCommand = () => gate.promise;
 const first = new AbortController(), second = new AbortController();
 const running = run('browser_snapshot', {}, first.signal);
 const queued = run('browser_press', { key: 'Enter', pageId: 'old' }, second.signal);
 const stopped = assert.rejects(queued, error => error.code === 'cancelled');
 second.abort();
 await stopped;
 first.abort();
 await assert.rejects(running, error => error.code === 'cancelled');
 gate.resolve({});
 await tick();
 assert.deepEqual(sent, []);
});

test('CDP and navigation deadlines retire continuations and stop the load', async () => {
 {
  const { Browser } = mainBrowser({ cap: 25 });
  const { guest, run, sent } = guestPair(Browser);
  const { pageId } = await run('browser_snapshot');
  const gate = deferred();
  guest.debugger.sendCommand = () => gate.promise;
  await assert.rejects(run('browser_press', { pageId, key: 'Enter' }), error => error.code === 'timeout');
  gate.resolve({});
  await tick();
  assert.equal(sent.filter(item => item.method.startsWith('Input.')).length, 0);
 }
 {
  const { Browser } = mainBrowser({ cap: 25 });
  const { guest, run } = guestPair(Browser);
  let stopped = 0;
  guest.loadURL = () => new Promise(() => {});
  guest.stop = () => stopped++;
  await assert.rejects(run('browser_navigate', { url: 'data:text/html,x' }), error => error.code === 'timeout');
  assert.equal(stopped, 1);
 }
});

test('Stop interrupts each click/type command boundary and ignores late acknowledgements', { timeout: 5000 }, async () => {
 const cases = [
  ['browser_click', { x: 10, y: 20, double: true }, 5],
  ['browser_type', { ref: 1, text: 'secret', submit: true }, 8],
  ['browser_type', { text: '', submit: true }, 6],
 ];
 for (const [name, args, stages] of cases) for (let stage = 1; stage <= stages; stage++) {
  const { Browser } = mainBrowser();
  const { guest, run, sent } = guestPair(Browser);
  const { pageId } = await run('browser_snapshot');
  const gate = deferred(), reached = deferred(), controller = new AbortController();
  let inputs = 0;
  guest.debugger.sendCommand = (method, params) => {
   sent.push({ method, params });
   if (method.startsWith('Input.') && ++inputs === stage) { reached.resolve(); return gate.promise; }
   return Promise.resolve({});
  };
  const pending = run(name, { ...args, pageId }, controller.signal);
  const rejected = assert.rejects(pending, error => error.code === 'cancelled');
  await reached.promise;
  controller.abort();
  await rejected;
  assert.equal(inputs, stage, `${name} stopped at stage ${stage}`);
  gate.resolve({});
  await tick();
  assert.equal(inputs, stage, 'late CDP completion must not continue the operation');
 }
});

test('plain wait, pointer, post-click and pre-submit delays are cancellation-aware', { timeout: 2000 }, async () => {
 for (const [name, args, delay] of [
  ['browser_wait', { seconds: 60 }, 60000],
  ['browser_click', { ref: 1 }, 420],
  ['browser_type', { ref: 1, text: 'secret', submit: true }, 80],
  ['browser_type', { text: 'secret', submit: true }, 60],
 ]) {
  const reached = deferred(), controller = new AbortController();
  let armed = false;
  const { Browser } = mainBrowser({ onTimer: ms => { if (armed && ms === delay) reached.resolve(); } });
  const { run, sent } = guestPair(Browser);
  Browser.setShown({ open: delay === 420, id: 1 });
  const { pageId } = await run('browser_snapshot');
  armed = true;
  const pending = run(name, { ...args, pageId }, controller.signal);
  const rejected = assert.rejects(pending, error => error.code === 'cancelled');
  await reached.promise;
  const before = sent.length;
  controller.abort();
  await rejected;
  await tick();
  assert.equal(sent.length, before);
  assert.equal(sent.some(item => item.params.key === 'Enter'), false);
 }
});

test('Take Control during type retires clear/insert/submit stages before granting UI ownership', { timeout: 2000 }, async () => {
 for (const boundary of ['mouseReleased', 'keyUp', 'insert']) {
  const { Browser } = mainBrowser();
  const { guest, host, run, sent } = guestPair(Browser, 7);
  const { pageId } = await run('browser_snapshot');
  const gate = deferred(), reached = deferred(), acknowledgement = deferred();
  const controller = new AbortController();
  let desktop, settled = false, focused = false;
  const { panel, add } = panelPage({ bridge: {
   shown() {},
   run: (id, name, args) => desktop = Browser.run(name, args, host, controller.signal).catch(error => ({ error: error.message, code: error.code })).finally(() => { settled = true; }),
   cancel: async () => { controller.abort(); await desktop; await acknowledgement.promise; },
  } });
  const tab = add();
  tab.id = 7; tab.state = 'ready'; tab.view = { focus() { assert.ok(settled); focused = true; }, blur() {} }; tab.ready = Promise.resolve(tab);
  guest.debugger.sendCommand = (method, params) => {
   sent.push({ method, params });
   if (params.type === boundary || (boundary === 'insert' && method === 'Input.insertText')) { reached.resolve(); return gate.promise; }
   return Promise.resolve({});
  };
  const active = panel.run('browser_type', { ref: 1, pageId, text: 'secret', submit: true }, { id: 'type', signal: signal() });
  const queued = panel.run('browser_type', { pageId, text: 'never' }, { id: 'queued', signal: signal() });
  await reached.promise;
  const before = sent.length, taking = panel.take();
  assert.equal(panel.control, 'taking');
  assert.equal(focused, false);
  panel.handBack();
  assert.equal(panel.control, 'taking', 'Hand Back cannot skip the cancellation acknowledgement');
  assert.equal((await active).taken, true);
  assert.equal((await queued).taken, true);
  acknowledgement.resolve();
  await taking;
  assert.equal(panel.control, 'user');
  assert.ok(focused);
  panel.handBack();
  gate.resolve({});
  await tick();
  assert.equal(sent.length, before, 'Hand Back and late CDP completion cannot revive the old type');
  assert.equal(sent.some(item => item.params.key === 'Enter'), false);
 }
});

test('Stop interrupts navigation, read, snapshot, scroll, select and screenshot stages', { timeout: 2000 }, async () => {
 for (const name of ['browser_navigate', 'browser_read', 'browser_snapshot', 'browser_scroll', 'browser_select', 'browser_screenshot']) {
  const { Browser } = mainBrowser();
  const { guest, run, sent } = guestPair(Browser);
  const { pageId } = await run('browser_snapshot');
  const gate = deferred(), reached = deferred(), controller = new AbortController();
  let stopped = 0, dispatched = 0;
  const stall = () => { dispatched++; reached.resolve(); return gate.promise; };
  guest.stop = () => stopped++;
  guest.loadURL = guest.executeJavaScript = guest.executeJavaScriptInIsolatedWorld = stall;
  guest.debugger.sendCommand = stall;
  const pending = run(name, { pageId, ref: 1, option: 'x', url: 'about:blank' }, controller.signal);
  const rejected = assert.rejects(pending, error => error.code === 'cancelled');
  await reached.promise;
  controller.abort(); await rejected;
  const before = sent.length;
  gate.resolve({}); await tick();
  assert.equal(dispatched, 1);
  assert.equal(sent.length, before);
  assert.equal(stopped, name === 'browser_navigate' ? 1 : 0);
 }
});

test('cancelling a queued main job never releases or bypasses its predecessor', async () => {
 const { Browser } = mainBrowser();
 const { guest, run } = guestPair(Browser);
 const { pageId } = await run('browser_snapshot');
 const gate = deferred(), second = new AbortController();
 let reads = 0;
 guest.executeJavaScript = () => { reads++; return reads === 1 ? gate.promise : Promise.resolve('fresh'); };
 const first = run('browser_read');
 const cancelled = run('browser_type', { pageId, text: 'never' }, second.signal);
 const rejected = assert.rejects(cancelled, error => error.code === 'cancelled');
 const third = run('browser_read');
 second.abort(); await rejected; await tick();
 assert.equal(reads, 1);
 gate.resolve('first'); await first; await third;
 assert.equal(reads, 2);
});
