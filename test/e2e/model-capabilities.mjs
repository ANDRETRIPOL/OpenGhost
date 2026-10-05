// Issue #21: real model capability presentation, with a stubbed upstream catalog.
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
 await step('unknown, false and true metadata remain distinct in the real picker and effort UI', async () => {
  const result = await evaluate(`(async () => {
   Providers.models = async () => [
    { id: 'm1', api: 'm1', provider: 'deepseek', name: 'Unknown', efforts: [], defaultEffort: 'high' },
    { id: 'text', api: 'text', provider: 'deepseek', name: 'Text', vision: false },
    { id: 'image', api: 'image', provider: 'deepseek', name: 'Image', vision: true, context: 128000, efforts: ['medium', 'high'], defaultEffort: 'medium' },
   ];
   settings.keys.deepseek = 'offline-fixture';
   await settings.refresh('deepseek'); settings.setModel('m1'); settings.show('m1'); modelStage.build();
   return {
    labels: modelStage.rows.map(row => row.getAttribute('aria-label')),
    meta: modelStage.rows.map(row => row.querySelector('.model-meta').textContent),
    vision: settings.models.map(model => settings.configFor(model.id).vision),
    efforts: settings.config.efforts, omitted: settings.config.effort === undefined,
    hidden: document.querySelector('.composer-effort').hidden, context: settings.windowOf('m1'),
    reported: settings.configFor('image').efforts,
   };
  })()`);
  assert.deepEqual(result, {
   labels: ['Unknown', 'Text, No photos', 'Image, 128K context · Sees photos'],
   meta: ['', 'No photos', '128K context · Sees photos'], vision: [null, false, true],
   efforts: [], omitted: true, hidden: true, context: 0, reported: ['medium', 'high'],
  });
 });
 await step('defaults are display-only; refresh removes capabilities without saving inferred preferences', async () => {
  const result = await evaluate(`(async () => {
   settings.setModel('image'); settings.show('image');
   const before = { effort: settings.config.effort, hidden: effortSlider.button.hidden, saved: localStorage.getItem('deepseek.effort') };
   Providers.models = async () => [{ id: 'image', api: 'image', provider: 'deepseek', name: 'Image' }];
   await settings.refresh('deepseek'); modelStage.build();
   return { before, after: { hidden: effortSlider.button.hidden, label: modelStage.rows[0].getAttribute('aria-label'),
    context: settings.windowOf('image'), saved: localStorage.getItem('deepseek.effort'), omitted: settings.config.effort === undefined } };
  })()`);
  assert.deepEqual(result, { before: { effort: 'medium', hidden: false, saved: null }, after: { hidden: true, label: 'Image', context: 0, saved: null, omitted: true } });
 });
 console.log(`${count} passed`);
} finally {
 ws?.close(); child.kill();
 await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else child.once('exit', resolve); });
 fs.rmSync(home, { recursive: true, force: true });
}
