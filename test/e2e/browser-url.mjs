// Issue #21: literal URL rendering in the real app DOM; no provider or external network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'og-url-'));
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
 await step('issue #21: encoded URL markup stays literal in the real address-bar DOM', async () => {
  assert.equal(await evaluate('browserPanel.open'), false);
  const address = 'https://example.invalid/%3Cb%20id=%22injected%22%3Ehello%3C/b%3E';
  const result = await evaluate(`(() => {
   // A closed panel keeps this tab lazy: exercise the actual UI without navigating to the URL.
   const tab = browserPanel.newTab(${JSON.stringify(address)}, { focus: false });
   try {
    const view = browserPanel.urlView;
    return {
     input: browserPanel.url.value, text: view.textContent,
     pieces: [...view.children].map(el => [el.tagName, el.className, el.textContent]),
     textOnly: [...view.children].every(el => el.childNodes.length === 1 && el.firstChild.nodeType === Node.TEXT_NODE),
     injected: !!document.getElementById('injected'),
     guestCreated: !!tab.view,
     staticIcons: ['.browser-new', '.browser-back', '.browser-forward', '.browser-reload', '.browser-external', '.browser-tab-close']
      .every(selector => !!browserPanel.root.querySelector(selector + ' svg path')),
    };
   } finally { browserPanel.close(tab); }
  })()`);
  assert.equal(result.input, address);
  assert.equal(result.text, 'example.invalid/<b id="injected">hello</b>');
  assert.deepEqual(result.pieces, [
   ['SPAN', 'browser-url-host', 'example.invalid'],
   ['SPAN', 'browser-url-dim', '/<b id="injected">hello</b>'],
  ]);
  assert.equal(result.textOnly, true);
  assert.equal(result.injected, false);
  assert.equal(result.guestCreated, false);
  assert.equal(result.staticIcons, true, 'trusted static SVG/UI markup still renders');
  assert.equal(await evaluate('browserPanel.urlView.childNodes.length'), 0, 'closing the tab clears the address');
 });
 console.log(`${count} passed`);
} finally {
 ws?.close(); child.kill();
 await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else child.once('exit', resolve); });
 fs.rmSync(home, { recursive: true, force: true });
}
