'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ROOT = path.resolve(__dirname, '..');
const MAX = 4 * 1024 * 1024;
const HTML = 'http://www.w3.org/1999/xhtml';

function element(tag, children = [], attributes = {}) {
 const node = { nodeType: 1, localName: tag, tagName: tag.toUpperCase(), namespaceURI: HTML,
  attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })), firstChild: children[0] || null };
 Object.defineProperty(node, 'outerHTML', { get() { assert.fail('must not serialize a whole subtree'); } });
 children.forEach((child, i) => { child.parentNode = node; child.nextSibling = children[i + 1] || null; });
 return node;
}
function text(value, reads = []) {
 return { nodeType: 3, length: value.length,
  get data() { assert.fail('must not materialize an entire Text.data string'); },
  substringData(offset, size) { assert.ok(size <= 4096); reads.push([offset, size]); return value.slice(offset, offset + size); },
 };
}
function fixture(root) {
 const document = { documentElement: root };
 const renderer = vm.createContext({ document });
 vm.runInContext('window = globalThis', renderer);
 const module = { exports: {} }, transferred = [];
 vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'desktop/browser.js'), 'utf8'), {
  module, require: name => name === 'electron' ? {} : require(name), __dirname: path.join(ROOT, 'desktop'),
  process, Buffer, AbortController, setTimeout, clearTimeout,
 });
 const Browser = module.exports, host = { isDestroyed: () => false, send() {} }, guest = new EventEmitter();
 Object.assign(guest, { id: 1, isDestroyed: () => false, setWindowOpenHandler() {},
  getURL: () => 'https://example.invalid/read', getTitle: () => 'Read test',
  debugger: { isAttached: () => true, sendCommand: async () => ({}) },
  executeJavaScript() { assert.fail('read must not evaluate in the page main world'); },
  async executeJavaScriptInIsolatedWorld(world, [{ code }]) {
   assert.equal(world, 1077);
   // Execute the actual production injection, not a canned serialization result.
   const answer = await vm.runInContext(code, renderer);
   assert.equal(answer.error, undefined);
   assert.ok(answer.ok.html.length <= MAX, 'bound holds BEFORE resolving the renderer/IPC call to main handling');
   assert.equal(typeof answer.ok.sourceTruncated, 'boolean');
   transferred.push(answer.ok);
   return answer;
  },
 });
 Browser.adopt(host, guest);
 const read = (args = {}) => Browser.run('browser_read', { tab: 1, ...args }, host, new AbortController().signal);
 return { read, document, transferred, guest };
}

test('read bounds a single 32 Mi-character text node inside the isolated evaluation', async () => {
 const reads = [], huge = 'x'.repeat(MAX * 8), f = fixture(element('html', [element('body', [text(huge, reads)])]));
 const result = await f.read();
 assert.equal(result.html, '<html><body>' + 'x'.repeat(MAX - 12));
 assert.equal(result.sourceTruncated, true);
 assert.ok(reads.at(-1)[0] + reads.at(-1)[1] <= MAX + 1, 'does not scan the remainder of the huge node');
 assert.equal(f.transferred.length, 1);
 assert.equal(result.html, f.transferred[0].html);
 assert.equal(result.url, 'https://example.invalid/read');
 assert.equal(result.title, 'Read test');
});

test('read stops before visiting the remainder of a broad DOM much larger than READ_MAX', async () => {
 const nodes = Array.from({ length: 512 }, () => element('p', [text('x'.repeat(65536))]));
 Object.defineProperty(nodes[100], 'attributes', { get() { assert.fail('must not visit nodes beyond the bounded prefix'); } });
 const f = fixture(element('html', [element('body', nodes)]));
 const result = await f.read();
 const unit = '<p>' + 'x'.repeat(65536) + '</p>';
 assert.equal(result.html, ('<html><body>' + unit.repeat(65)).slice(0, MAX));
 assert.equal(result.sourceTruncated, true);
});

test('huge attributes, escaped text, raw text and comments are bounded before transfer', async () => {
 for (const kind of ['attribute', 'text', 'script', 'comment']) {
  const huge = '&<>"\u00a0'.repeat(MAX), reads = [];
  let node = text(huge, reads), prefix = '<html>';
  if (kind === 'attribute') { node = element('div', [], { title: huge }); prefix += '<div title="'; }
  if (kind === 'script') { node = element('script', [node]); prefix += '<script>'; }
  if (kind === 'comment') { node.nodeType = 8; prefix += '<!--'; }
  const f = fixture(element('html', [node])), result = await f.read();
  const unit = kind === 'attribute' ? '&amp;&lt;&gt;&quot;&nbsp;' : kind === 'text' ? '&amp;&lt;&gt;"&nbsp;' : '&<>"\u00a0';
  assert.equal(result.html, (prefix + unit.repeat(Math.ceil(MAX / unit.length))).slice(0, MAX), kind);
  assert.equal(result.sourceTruncated, true, kind);
  if (reads.length) assert.ok(reads.at(-1)[0] + reads.at(-1)[1] <= MAX + 1);
 }
});

test('below, at and above the exact UTF-16 source limit report truncation truthfully', async () => {
 for (const extra of [-1, 0, 1]) {
  const value = 'x'.repeat(MAX - '<html></html>'.length + extra);
  const f = fixture(element('html', [text(value)])), result = await f.read();
  assert.equal(result.html, (`<html>${value}</html>`).slice(0, MAX));
  assert.equal(result.sourceTruncated, extra > 0);
 }
 const f = fixture(element('html', [text('😀'.repeat(MAX))]));
 assert.equal((await f.read()).html, ('<html>' + '😀'.repeat(MAX / 2)).slice(0, MAX), 'limit counts UTF-16 units, not code points or UTF-8 bytes');
});

test('missing documentElement is empty and continuation re-reads the live page', async () => {
 const f = fixture(null), first = await f.read();
 assert.equal(first.html, ''); assert.equal(first.sourceTruncated, false);
 f.document.documentElement = element('html', [text('new document')]);
 const next = await f.read({ start: 1 });
 assert.equal(next.html, '<html>new document</html>');
 assert.equal(f.transferred.length, 2);
});

test('read uses an iterative depth-first cursor instead of recursive or whole-tree serialization', async () => {
 let root = text('deep');
 for (let i = 0; i < 20000; i++) root = element('div', [root]);
 const result = await fixture(root).read();
 assert.equal(result.html, '<div>'.repeat(20000) + 'deep' + '</div>'.repeat(20000));
 assert.equal(result.sourceTruncated, false);
});
