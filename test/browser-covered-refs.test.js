'use strict';

// Issue #21: covered refs refuse before any mouse input.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const signal = () => new AbortController().signal;
const timers = cap => (fn, ms) => setTimeout(fn, cap && ms >= 1000 ? cap : ms);

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

test('uncovered snapshot refs dispatch normal single and double clicks at the resolved point', async () => {
 for (const double of [false, true]) {
  const { Browser } = mainBrowser();
  const { run, sent } = guestPair(Browser);
  const { pageId } = await run('browser_snapshot');
  const answer = await run('browser_click', { ref: 1, pageId, double });
  const expected = [{ method: 'Input.dispatchMouseEvent', params: { x: 10, y: 20, type: 'mouseMoved' } }];
  for (let clickCount = 1; clickCount <= (double ? 2 : 1); clickCount++) {
   expected.push(
    { method: 'Input.dispatchMouseEvent', params: { x: 10, y: 20, type: 'mousePressed', button: 'left', buttons: 1, clickCount } },
    { method: 'Input.dispatchMouseEvent', params: { x: 10, y: 20, type: 'mouseReleased', button: 'left', buttons: 0, clickCount } },
   );
  }
  assert.deepEqual(plain(sent.filter(item => item.method.startsWith('Input.'))), expected);
 }
});

test('covered snapshot refs identify the obstruction and recovery options without any mouse input', async () => {
 for (const coverAt of [1, 2]) for (const double of [false, true]) {
  const { Browser } = mainBrowser();
  const { guest, run, sent } = guestPair(Browser);
  const { pageId } = await run('browser_snapshot');
  let points = 0;
  guest.executeJavaScriptInIsolatedWorld = async (world, [{ code }]) => {
   assert.ok(code.includes('await (__og.point(1))'));
   return { ok: { x: 10, y: 20, covered: ++points >= coverAt ? 'button "Overlay"' : '' } };
  };
  // Explicit coordinates must not become a fallback when a ref is covered.
  await assert.rejects(run('browser_click', { ref: 1, pageId, double, x: 30, y: 40 }), error => {
   assert.equal(error.code, 'element_covered');
   assert.match(error.message, /Element \[1\] is covered by button "Overlay"/);
   assert.match(error.message, /No click was sent/);
   assert.match(error.message, /Take a fresh snapshot or explicitly target the covering element/);
   return true;
  });
  assert.equal(points, coverAt);
  assert.deepEqual(sent.filter(item => item.method.startsWith('Input.')), []);
 }
});

test('coordinate clicks without a ref dispatch at the supplied point without resolving an element', async () => {
 const { Browser } = mainBrowser();
 const { guest, run, sent } = guestPair(Browser);
 const { pageId } = await run('browser_snapshot');
 const execute = guest.executeJavaScriptInIsolatedWorld;
 let points = 0;
 guest.executeJavaScriptInIsolatedWorld = async (world, scripts) => {
  if (scripts[0].code.includes('await (__og.point(')) {
   points++;
   return { ok: { x: 10, y: 20, covered: 'overlay' } };
  }
  return execute(world, scripts);
 };
 const answer = await run('browser_click', { x: 30, y: 40, pageId });
 assert.equal(points, 0);
 assert.deepEqual(plain(sent.filter(item => item.method.startsWith('Input.'))), [
  { method: 'Input.dispatchMouseEvent', params: { x: 30, y: 40, type: 'mouseMoved' } },
  { method: 'Input.dispatchMouseEvent', params: { x: 30, y: 40, type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1 } },
  { method: 'Input.dispatchMouseEvent', params: { x: 30, y: 40, type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1 } },
 ]);
});

test('covered and moved targets fail before clicking', async () => {
 for (const name of ['browser_click']) for (const moved of [false, true]) {
  const { Browser } = mainBrowser();
  const { guest, run, sent } = guestPair(Browser);
  const { pageId } = await run('browser_snapshot');
  let points = 0;
  guest.executeJavaScriptInIsolatedWorld = async () => ({ ok: { x: moved ? 10 + points++ : 10, y: 20, covered: moved ? '' : 'overlay' } });
  await assert.rejects(run(name, { ref: 1, text: 'secret', pageId }), error => ['element_covered', 'stale_target'].includes(error.code));
  assert.equal(sent.filter(item => item.method.startsWith('Input.')).length, 0);
 }
});
