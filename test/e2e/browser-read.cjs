'use strict';

// Real isolated-renderer/IPC regression, no backend, profile or network access.
// Run with node test/e2e/browser-read.cjs. If headless Ozone is unavailable,
// OPENGHOST_E2E_OZONE=x11 uses the local display with a hidden window.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const MAX = 4 * 1024 * 1024;

if (!process.versions.electron) {
 const home = fs.mkdtempSync(path.join(os.tmpdir(), 'og-read-'));
 try {
  const result = spawnSync(require('electron'), [__filename, `--ozone-platform=${process.env.OPENGHOST_E2E_OZONE || 'headless'}`, '--disable-gpu'], {
   cwd: ROOT, timeout: 60000, encoding: 'utf8', maxBuffer: 1024 * 1024,
   env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, 'config'), XDG_CACHE_HOME: path.join(home, 'cache'), OPENGHOST_E2E_PROFILE: home },
  });
  assert.equal(result.status, 0, `${result.error || result.signal || ''}\n${result.stdout}\n${result.stderr}`);
  process.stdout.write(result.stdout);
 } finally { fs.rmSync(home, { recursive: true, force: true }); }
} else {
 const { app, BrowserWindow, session } = require('electron');
 if (!process.env.OPENGHOST_E2E_PROFILE) throw new Error('Run this test with node.');
 const profile = path.join(process.env.OPENGHOST_E2E_PROFILE, 'electron');
 fs.mkdirSync(profile, { recursive: true });
 app.setPath('userData', profile);
 app.setPath('sessionData', profile);
 const deadline = setTimeout(() => app.exit(1), 55000);
 app.whenReady().then(async () => {
  const Browser = require('../../desktop/browser');
  session.fromPartition(Browser.PARTITION).webRequest.onBeforeRequest((details, done) => done({ cancel: /^https?:/.test(details.url) }));
  const win = new BrowserWindow({ show: false, webPreferences: { partition: Browser.PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const guest = win.webContents, host = { isDestroyed: () => false, send() {} };
  Browser.adopt(host, guest);
  const execute = guest.executeJavaScriptInIsolatedWorld.bind(guest);
  let transfers = 0;
  guest.executeJavaScriptInIsolatedWorld = async (world, scripts) => {
   assert.equal(world, 1077, 'production read uses the private world');
   const answer = await execute(world, scripts);
   assert.equal(answer.error, undefined);
   // This assertion runs at the IPC return seam, before Browser.world/act/run can
   // inspect or slice the result. Main-process truncation cannot make it pass.
   assert.ok(answer.ok.html.length <= MAX, 'renderer return value is already bounded');
   transfers++;
   return answer;
  };
  const isolated = expression => execute(1077, [{ code: expression }]);
  const read = (args = {}) => Browser.run('browser_read', { tab: guest.id, ...args }, host, new AbortController().signal);
  const load = async html => {
   await guest.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  };
  const noOuterHTML = () => isolated(`Object.defineProperty(Element.prototype, 'outerHTML', { get() { throw new Error('whole subtree serialization forbidden'); } }); true`);

  // Chromium is the compatibility oracle for small HTML, not a hand-written fake.
  await load(`<!doctype html><html lang=en><head><title>Read &amp; test</title><style>p > b { color:red }</style></head><body>
   <main><h1>Heading</h1><p title='&amp;&lt;&gt;&quot;&nbsp;'>Text &amp; &lt; &gt; &nbsp; 😀 <b>bold</b></p>
   <pre>line one\nline two</pre><a href='/path?q=1&amp;x=2'>link</a><input value='field'><br><wbr><hr>
   <template><p>inert template</p><template>nested</template></template><!-- comment -->
   <svg viewBox='0 0 10 10'><use href='#x'></use><foreignObject><p>foreign HTML</p></foreignObject></svg>
   <math><mi>x</mi></math><div id=shadow>light</div><iframe srcdoc='frame content'></iframe></main>
   <noscript>inert &amp; text</noscript><script>window.raw = '<>&';</script></body></html>`);
  await guest.executeJavaScript(`(() => {
   document.getElementById('shadow').attachShadow({mode:'open'}).innerHTML = '<p>secret shadow</p>';
   for (const tag of ['area', 'base', 'basefont', 'bgsound', 'br', 'col', 'embed', 'frame', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr']) {
    const el = document.createElement(tag); el.append('child of ' + tag); document.body.append(el);
   }
   const foreign = document.createElementNS('urn:example', 'p:foreign');
   foreign.setAttributeNS('http://www.w3.org/1999/xlink', 'other:href', '#target');
   foreign.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', 'en');
   foreign.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:p', 'urn:example');
   document.body.append(foreign, document.createProcessingInstruction('read', 'test'));
   const xml = new DOMParser().parseFromString('<root><![CDATA[a<&b]]></root>', 'application/xml');
   document.body.append(document.importNode(xml.documentElement.firstChild, true));
  })()`);
  const expected = await isolated('document.documentElement.outerHTML');
  await noOuterHTML();
  const small = await read();
  assert.equal(small.html, expected);
  assert.equal(small.sourceTruncated, false);
  assert.ok(!small.html.includes('secret shadow'));
  await isolated(`(() => {
   const expected = ${JSON.stringify(expected)};
   for (let max = 0; max <= expected.length + 1; max++) {
    const answer = __og.read(max);
    if (answer.html !== expected.slice(0, max) || answer.sourceTruncated !== (expected.length > max)) throw new Error('incorrect HTML prefix at ' + max);
   }
  })()`);
  console.log('PASS every prefix matches native HTML: escaping, templates, raw text, void/foreign elements; no shadow/iframe traversal');

  for (const extra of [-1, 0, 1]) {
   await load('<!doctype html><body></body>');
   const shell = await isolated('document.documentElement.outerHTML.length');
   await guest.executeJavaScript(`document.body.textContent = 'x'.repeat(${MAX - shell + extra}); true`);
   await noOuterHTML();
   const answer = await read();
   assert.equal(answer.html.length, Math.min(MAX, MAX + extra));
   assert.equal(answer.sourceTruncated, extra > 0);
  }
  console.log('PASS READ_MAX - 1 / READ_MAX / READ_MAX + 1 truncation metadata');

  let huge;
  for (const kind of ['text', 'siblings', 'attribute', 'comment']) {
   await load('<!doctype html><body></body>');
   await guest.executeJavaScript(`(() => {
    const max = ${MAX};
    if (${JSON.stringify(kind)} === 'siblings') {
     const fragment = document.createDocumentFragment();
     for (let i = 0; i < 512; i++) { const p = document.createElement('p'); p.textContent = 'x'.repeat(65536); fragment.append(p); }
     document.body.append(fragment);
    } else if (${JSON.stringify(kind)} === 'attribute') document.body.setAttribute('data-large', '&'.repeat(max * 8));
    else if (${JSON.stringify(kind)} === 'comment') document.body.append(document.createComment('x'.repeat(max * 8)));
    else document.body.textContent = 'x'.repeat(max * 8);
    // Page-owned JS must neither intercept the read nor supply its own result.
    window.__og = { read() { throw new Error('main-world reader must not run'); } };
    Object.defineProperty(Document.prototype, 'documentElement', { get() { throw new Error('main-world DOM getter must not run'); } });
    Object.defineProperty(Element.prototype, 'outerHTML', { get() { throw new Error('main-world outerHTML must not run'); } });
   })()`);
   await noOuterHTML();
   // Huge character data must be accessed in bounded slices, not via .data.
   await isolated(`Object.defineProperty(CharacterData.prototype, 'data', { get() { throw new Error('full character data forbidden'); } }); true`);
   const answer = await read();
   assert.equal(answer.html.length, MAX);
   assert.equal(answer.sourceTruncated, true);
   const prefix = '<html><head></head><body';
   if (kind === 'text') {
    assert.equal(answer.html, prefix + '>' + 'x'.repeat(MAX - prefix.length - 1));
    huge = answer;
   } else if (kind === 'attribute') {
    const start = prefix + ' data-large="';
    assert.equal(answer.html, (start + '&amp;'.repeat(Math.ceil(MAX / 5))).slice(0, MAX));
   } else if (kind === 'comment') {
    const start = prefix + '><!--';
    assert.equal(answer.html, start + 'x'.repeat(MAX - start.length));
   } else {
    const unit = '<p>' + 'x'.repeat(65536) + '</p>';
    assert.equal(answer.html, (prefix + '>' + unit.repeat(65)).slice(0, MAX));
   }
   const before = transfers;
   const continued = await read({ start: 40000 });
   assert.equal(continued.html, answer.html);
   assert.equal(continued.sourceTruncated, true);
   assert.equal(transfers, before + 1, 'upstream continuation re-reads the current bounded source');
   console.log(`PASS 32 Mi-character ${kind}: bounded IPC result, no full outerHTML, isolated from hostile page getters`);
  }

  // Exercise the real upstream AgentTools readable-text paging and cap notice.
  const agentTools = fs.readFileSync(path.join(ROOT, 'agent-tools.js'), 'utf8');
  const formatted = await execute(2077, [{ code: `window.openghost = { tools: {} }; window.browserPanel = { run: async () => (${JSON.stringify(huge)}) }; ${agentTools}
AgentTools.run('browser_read', {}, {id:'read'})` }]);
  assert.match(formatted, /Source HTML truncated at 4 Mi UTF-16 code units/);
  assert.match(formatted, /Characters 0–40000/);
  assert.match(formatted, /Call browser_read with start=40000/);
  const next = await execute(2077, [{ code: `AgentTools.run('browser_read', {start:40000}, {id:'next'})` }]);
  assert.match(next, /Characters 40000–80000/);
  assert.match(next, /Source HTML truncated/);
  console.log('PASS existing model-facing pagination and source-truncation warning');

  await load('<!doctype html><body>removed</body>');
  await guest.executeJavaScript('document.documentElement.remove(); true');
  const empty = await read();
  assert.equal(empty.html, '');
  assert.equal(empty.sourceTruncated, false);
  console.log('PASS missing documentElement returns an empty untruncated read');
  clearTimeout(deadline);
  win.destroy();
  app.exit(0);
 }).catch(error => { console.error(error); clearTimeout(deadline); app.exit(1); });
}
