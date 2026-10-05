// Issue #21: real generic-tool IPC, cancellation and readiness; no provider/network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'og-f16-'));
const port = 9400 + Math.floor(Math.random() * 500);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const child = spawn(require('electron'), ['.', '--ozone-platform=headless', '--disable-gpu', `--remote-debugging-port=${port}`], {
 cwd: ROOT, env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') }, stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '', ws, next = 0, count = 0;
child.stdout.on('data', data => { output += data; });
child.stderr.on('data', data => { output += data; });
const pending = new Map();
async function until(check, ms = 20000) {
 const end = Date.now() + ms;
 while (Date.now() < end) { try { const value = await check(); if (value) return value; } catch {} await sleep(50); }
 throw new Error(`Timed out\n${output}`);
}
function send(method, params) {
 const id = ++next;
 return new Promise((resolve, reject) => {
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 45000);
  pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  ws.send(JSON.stringify({ id, method, params }));
 });
}
async function evaluate(expression) {
 const answer = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
 if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description || answer.exceptionDetails.text);
 return answer.result.value;
}
const call = (name, args = {}) => evaluate(`browserPanel.run(${JSON.stringify(name)}, ${JSON.stringify(args)}, { id: crypto.randomUUID(), signal: new AbortController().signal })`);
async function step(name, work) { await work(); console.log(`PASS ${name}`); count++; }
const url = html => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
try {
 const target = await until(async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.url.endsWith('index.html')));
 ws = new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
 ws.onmessage = ({ data }) => {
  const answer = JSON.parse(data), waiter = pending.get(answer.id);
  if (!waiter) return;
  pending.delete(answer.id);
  if (answer.error) waiter.reject(new Error(answer.error.message)); else waiter.resolve(answer.result);
 };
 await until(() => evaluate('document.readyState === "complete" && !!window.browserPanel'));
 await evaluate('browserPanel.setOpen(true)');
 await step('Take Control cancels real typing before clear/insert/submit and waits for desktop acknowledgement', async () => {
  const fresh = await call('browser_navigate', { url: url('<form onsubmit="window.submits=(window.submits||0)+1;event.preventDefault()"><input id="field" aria-label="Name" value="user value"><button>Send</button></form>') });
  const ref = Number(Object.keys(fresh.refs).find(key => fresh.refs[key].includes('Name')));
  await evaluate(`browserPanel.drive('lifecycle-test', true);
   window.savedPoint = browserPanel.point;
   browserPanel.point = function(x, y) {
    savedPoint.call(this, x, y);
    window.takeAck = this.take();
    window.controlBeforeAck = this.control;
    window.userBeforeAck = this.root.classList.contains('is-user');
   };`);
  const result = await evaluate(`browserPanel.run('browser_type', ${JSON.stringify({ ref, pageId: fresh.pageId, text: 'old agent input', submit: true })}, { id: 'real-taken-type', signal: new AbortController().signal })`);
  assert.equal(result.taken, true);
  await evaluate('takeAck');
  assert.deepEqual(await evaluate('[controlBeforeAck, userBeforeAck, browserPanel.control, browserPanel.root.classList.contains("is-user")]'), ['taking', false, 'user', true]);
  await evaluate('browserPanel.point = savedPoint; browserPanel.handBack()');
  await sleep(600); // Past pointer and type delays: the retired request must stay retired.
  assert.deepEqual(await evaluate('browserPanel.active.view.executeJavaScript("[document.getElementById(\\"field\\").value, window.submits || 0]")'), ['user value', 0]);
  const snapshot = await call('browser_snapshot');
  const typed = await call('browser_type', { ref: Number(Object.keys(snapshot.refs).find(key => snapshot.refs[key].includes('Name'))), pageId: snapshot.pageId, text: 'fresh agent input', submit: true });
  assert.ok(!typed.error, JSON.stringify(typed));
  assert.deepEqual(await evaluate('browserPanel.active.view.executeJavaScript("[document.getElementById(\\"field\\").value, window.submits || 0]")'), ['fresh agent input', 1]);
  await evaluate('browserPanel.drive("lifecycle-test", false)');
 });
 await step('Stop interrupts a real plain wait and a cancelled queued type never starts', async () => {
  const result = await evaluate(`(async () => {
   const first = new AbortController(), second = new AbortController();
   const active = browserPanel.run('browser_wait', { seconds: 60 }, { id: 'real-wait', signal: first.signal });
   const queued = browserPanel.run('browser_type', { text: 'must not type', submit: true }, { id: 'real-queued', signal: second.signal });
   await new Promise(resolve => setTimeout(resolve, 100));
   const at = performance.now();
   second.abort(); first.abort();
   const answers = await Promise.all([active, queued]);
   await Promise.all(browserPanel.cancelling.values());
   return { codes: answers.map(answer => answer.code), elapsed: performance.now() - at };
  })()`);
  assert.deepEqual(result.codes, ['cancelled', 'cancelled']);
  assert.ok(result.elapsed < 5000, JSON.stringify(result));
  assert.deepEqual(await evaluate('browserPanel.active.view.executeJavaScript("[document.getElementById(\\"field\\").value, window.submits || 0]")'), ['fresh agent input', 1]);
 });
 await step('Stop before real dom-ready registration cannot revive the job later', async () => {
  const result = await evaluate(`(async () => {
   const tab = browserPanel.newTab('', { focus: false });
   const controller = new AbortController();
   const original = browserPanel.createView;
   // Stop synchronously after the real webview is inserted, before its first dom-ready.
   browserPanel.createView = function(...args) { const view = original.apply(this, args); controller.abort(); return view; };
   try {
    const answer = await browserPanel.run('browser_navigate', { url: 'data:text/html,SHOULD-NOT-LOAD' }, { id: 'real-before-ready', signal: controller.signal });
    await tab.ready;
    await new Promise(resolve => setTimeout(resolve, 100));
    return { code: answer.code, url: tab.view.getURL() };
   } finally { browserPanel.createView = original; browserPanel.close(tab); }
  })()`);
  assert.equal(result.code, 'cancelled');
  assert.equal(result.url, 'about:blank');
 });
 await step('replacing a real pending webview rejects the old readiness and readies only the replacement', async () => {
  const result = await evaluate(`(async () => {
   const tab = browserPanel.newTab('', { focus: false });
   try {
    const old = browserPanel.ensure(tab).then(() => 'unexpected success', error => error.code);
    browserPanel.createView(tab, 'about:blank');
    const replacement = tab.view;
    await browserPanel.ensure(tab);
    return { old: await old, ready: tab.state, same: tab.view === replacement };
   } finally { browserPanel.close(tab); }
  })()`);
  assert.deepEqual(result, { old: 'tab_gone', ready: 'ready', same: true });
 });
 console.log(`${count} passed`);
} finally {
 ws?.close(); child.kill();
 await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else child.once('exit', resolve); });
 fs.rmSync(home, { recursive: true, force: true });
}
