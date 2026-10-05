// Issue #21: real bounded screenshots and model-facing coverage on local pages, with no backend.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'og-screenshot-'));
const port = 10000 + Math.floor(Math.random() * 500);
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
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 20000);
  pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  ws.send(JSON.stringify({ id, method, params }));
 });
}
async function evaluate(expression) {
 const answer = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
 if (answer.exceptionDetails) throw new Error(answer.exceptionDetails.exception?.description || answer.exceptionDetails.text);
 return answer.result.value;
}
const call = (name, args = {}) => evaluate(`(async () => {
 const args = ${JSON.stringify(args)};
 return AgentTools.run(${JSON.stringify(name)}, args, { id: crypto.randomUUID() });
})()`);
const guest = expression => evaluate(`browserPanel.active.view.executeJavaScript(${JSON.stringify(expression)})`);
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
 for (const [label, height, truncated] of [
  ['short page', '50vh', false],
  ['exactly at the cap', '400vh', false],
  ['one pixel beyond the cap', 'calc(400vh + 1px)', true],
  ['taller than the cap', '600vh', true],
 ]) {
  const html = `<!doctype html><title>Screenshot coverage</title><style>html,body{margin:0;padding:0}main{height:${height};background:linear-gradient(red,blue)}</style><main>Top of page</main>`;
  const page = await call('browser_navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
  assert.ok(!page.isError, JSON.stringify(page));
  // Starting partway down must not change the range of a full_page capture.
  await guest('scrollTo(0, innerHeight)');
  const metrics = await guest('({ width: visualViewport.width, viewportHeight: visualViewport.height, contentHeight: document.documentElement.scrollHeight })');
  const shot = await call('browser_screenshot', { full_page: true });
  assert.ok(!shot.isError, JSON.stringify(shot));
  const capturedHeight = Math.min(metrics.contentHeight, metrics.viewportHeight * 4);
  assert.equal(shot.truncated, truncated, label);
  assert.equal(shot.contentHeight, metrics.contentHeight);
  assert.equal(shot.viewportHeight, metrics.viewportHeight);
  assert.equal(shot.pageHeight, capturedHeight);
  assert.deepEqual(shot.capture, { x: 0, y: 0, width: metrics.width, height: capturedHeight });
  const decoded = await evaluate(`(async () => {
   const image = new Image(); image.src = ${JSON.stringify(shot.images[0].url)}; await image.decode();
   return { width: image.naturalWidth, height: image.naturalHeight };
  })()`);
  assert.equal(decoded.width, shot.width);
  assert.equal(decoded.height, shot.height);
  assert.ok(Math.abs(decoded.height / shot.scale - capturedHeight) <= 1, 'image height agrees with reported CSS capture');
  assert.ok(shot.text.includes(`y=0–${capturedHeight} of ${metrics.contentHeight} CSS pixels`));
  if (truncated) {
   assert.match(shot.text, /truncated full-page capture/);
   assert.ok(shot.text.includes(`Only the top ${capturedHeight} CSS pixels (4 viewport heights)`));
   assert.match(shot.text, /More page content exists below/);
   assert.doesNotMatch(shot.text, /complete vertical capture/);
  } else {
   assert.match(shot.text, /full page \(complete vertical capture\)/);
   assert.doesNotMatch(shot.text, /truncated|More page content|Only the top/);
  }
  console.log(`PASS full-page screenshot: ${label} (${capturedHeight}/${metrics.contentHeight} CSS pixels)`);
  count++;
 }
 const top = await guest('scrollY');
 const viewport = await call('browser_screenshot');
 assert.ok(!viewport.isError, JSON.stringify(viewport));
 assert.equal(viewport.truncated, false);
 assert.equal(viewport.capture.y, top);
 assert.equal(viewport.capture.height, viewport.viewportHeight);
 assert.match(viewport.text, /Screenshot of the viewport/);
 assert.doesNotMatch(viewport.text, /complete vertical capture/);
 console.log('PASS ordinary viewport screenshot is not labelled full-page');
 count++;
 console.log(`${count}/${count} screenshot Electron checks passed`);
} finally {
 ws?.close();
 child.kill('SIGTERM');
 await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(2000)]);
 if (child.exitCode === null) child.kill('SIGKILL');
 fs.rmSync(home, { recursive: true, force: true });
}
