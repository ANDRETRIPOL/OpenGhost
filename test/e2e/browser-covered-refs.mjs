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
 await step('covered refs fail without clicking the covering element', async () => {
  const fresh = await call('browser_navigate', { url: url('<script>window.mouseEvents=[]; for (const type of ["mousedown","mouseup","click"]) document.addEventListener(type, () => window.mouseEvents.push(type));</script><button style="width:200px;height:80px">Covered</button><div onclick="window.wrong=true" style="position:fixed;inset:0;background:white">overlay</div>') });
  const ref = Number(Object.keys(fresh.refs).find(key => fresh.refs[key].includes('Covered')));
  const result = await call('browser_click', { tabId: fresh.tabId, pageId: fresh.pageId, ref });
  assert.equal(typeof result.error, 'string');
  assert.equal(result.code, 'element_covered');
  assert.ok(result.error.includes(`Element [${ref}] is covered by`));
  assert.match(result.error, /overlay/);
  assert.match(result.error, /Take a fresh snapshot or explicitly target the covering element/);
  assert.deepEqual(await evaluate('browserPanel.active.view.executeJavaScript("window.mouseEvents")'), []);
  assert.equal(await evaluate('browserPanel.active.view.executeJavaScript("!!window.wrong")'), false);
 });
 await step('coordinate clicks still reach the covering element when no ref is supplied', async () => {
  const fresh = await call('browser_snapshot');
  const result = await call('browser_click', { tabId: fresh.tabId, pageId: fresh.pageId, x: 20, y: 20 });
  assert.ok(!result.error, JSON.stringify(result));
  assert.deepEqual(await evaluate('browserPanel.active.view.executeJavaScript("window.mouseEvents")'), ['mousedown', 'mouseup', 'click']);
  assert.equal(await evaluate('browserPanel.active.view.executeJavaScript("!!window.wrong")'), true);
 });
 await step('normal ref single/double clicks still work', async () => {
  for (const double of [false, true]) {
   const fresh = await call('browser_navigate', { url: url('<button onclick="window.clicks=(window.clicks||0)+1">Save</button>') });
   const ref = Number(Object.keys(fresh.refs)[0]);
   const result = await call('browser_click', { ref, double });
   assert.ok(!result.error, JSON.stringify(result));
   assert.equal(await evaluate('browserPanel.active.view.executeJavaScript("window.clicks")'), double ? 2 : 1);
  }
 });
 console.log(`${count} passed`);
} finally {
 ws?.close(); child.kill();
 await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else child.once('exit', resolve); });
 fs.rmSync(home, { recursive: true, force: true });
}
