// Issue #21: pinned-file estimate in the real DOM, no provider calls.
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
async function step(name, work) { await work(); console.log(`PASS ${name}`); count++; }
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
 await step('pinned-file DOM row explicitly labels the token estimate', async () => {
  const text = await evaluate(`(() => {
   const view = Object.create(GeneralSettings.prototype);
   const row = view.row({ id: 'fixture', name: 'notes.txt', size: 100, kind: 'text', chars: 3840 });
   return row.querySelector('.general-file-meta').textContent;
  })()`);
  assert.equal(text, 'Text · 100 B · ≈1.2k estimated tokens');
 });
 console.log(`${count} passed`);
} finally {
 ws?.close(); child.kill();
 await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else child.once('exit', resolve); });
 fs.rmSync(home, { recursive: true, force: true });
}
