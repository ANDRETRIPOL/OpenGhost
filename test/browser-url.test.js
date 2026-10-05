'use strict';

// Untrusted URLs are drawn as text, never parsed as HTML (issue #21). The page is a fake DOM that keeps every string handed to innerHTML, so a test can tell
// markup the app wrote itself from hostile text that reached the parser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');

const HOSTILE = ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '"><b id="injected">x</b>'];
const MARKUP = /<img|<script|<b id|onerror/i;

class FakeElement {
 constructor(doc, tag) {
  this.doc = doc;
  this.tagName = tag.toUpperCase();
  this.children = [];
  this.attributes = {};
  this.className = '';
  this.style = { setProperty() {} };
  const classes = new Set();
  this.classList = {
   add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
   toggle: (name, on = !classes.has(name)) => { if (on) classes.add(name); else classes.delete(name); return on; },
  };
 }
 set innerHTML(html) { this.doc.html.push(html); this.children = [{ html }]; }
 set textContent(text) { this.children = text === '' ? [] : [String(text)]; }
 get textContent() { return this.children.map(child => typeof child === 'string' ? child : child.html ?? child.textContent).join(''); }
 get childElementCount() { return this.children.filter(child => child instanceof FakeElement).length; }
 get firstChild() { return this.children[0]; }
 append(...nodes) { this.children.push(...nodes); }
 prepend(...nodes) { this.children.unshift(...nodes); }
 setAttribute(name, value) { this.attributes[name] = String(value); }
 addEventListener() {}
 // Every element below this one, depth first.
 *walk() { for (const child of this.children) if (child instanceof FakeElement) { yield child; yield* child.walk(); } }
}

function page() {
 const doc = { html: [], activeElement: null };
 doc.createElement = tag => new FakeElement(doc, tag);
 const window = {
  console, setTimeout, clearTimeout, setImmediate, queueMicrotask, AbortController, DOMException, URL,
  document: doc, navigator: { language: 'en-US' },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: true }),
  Glyphs: { terminal: '<svg data-glyph="terminal"></svg>', file: '<svg></svg>', folder: '<svg></svg>', globe: '<svg></svg>' },
 };
 window.window = window;
 const context = vm.createContext(window);
 for (const file of ['i18n.js', 'browser-panel.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
 }
 return { window, doc };
}

// No markup but the app's own reached innerHTML.
function noHostileHtml(doc) {
 for (const html of doc.html) assert.doesNotMatch(html, MARKUP, `hostile text was parsed as HTML: ${html}`);
}

// The browser's address bar as syncBar draws it for the active tab's URL.
function addressBar(window, url) {
 const doc = window.document;
 const panel = Object.create(window.BrowserPanel.prototype);
 const button = () => doc.createElement('button');
 Object.assign(panel, {
  root: doc.createElement('aside'), url: { value: '' }, urlView: doc.createElement('div'),
  backButton: button(), forwardButton: button(), reloadButton: button(),
  active: { id: 1, url, view: { canGoBack: () => false, canGoForward: () => false } },
 });
 const before = doc.html.length;
 panel.syncBar();
 const parsed = doc.html.slice(before);
 assert.equal(parsed.length, 1, 'only the trusted reload/stop SVG may reach innerHTML, never URL text');
 assert.match(parsed[0], /^<svg\b/);
 return panel.urlView;
}

test('a hostile URL in the address bar is shown as text, in the same host and path pieces as before', () => {
 const { window, doc } = page();
 for (const hostile of HOSTILE) {
  const url = `https://example.invalid/${encodeURIComponent(hostile)}?q=${encodeURIComponent('<script>')}`;
  const view = addressBar(window, url);
  noHostileHtml(doc);
  const pieces = [...view.walk()].map(el => [el.className, el.textContent]);
  assert.deepEqual(pieces, [['browser-url-host', 'example.invalid'], ['browser-url-dim', decodeURI(new URL(url).pathname + new URL(url).search)]]);
  assert.match(view.textContent, /<(img|script|b)\b/);
 }
 // A URL that is not https keeps its scheme as a dim lead, as text too.
 const view = addressBar(window, 'http://example.invalid/%3Cimg%20src=x%20onerror=alert(1)%3E');
 noHostileHtml(doc);
 assert.deepEqual([...view.walk()].map(el => el.textContent), ['http://', 'example.invalid', '/<img src=x onerror=alert(1)>']);
});

test('issue #21: the encoded address-bar URL renders literal markup, not an element', () => {
 const { window } = page();
 const view = addressBar(window, 'https://example.invalid/%3Cb%20id=%22injected%22%3Ehello%3C/b%3E');
 assert.equal(view.textContent, 'example.invalid/<b id="injected">hello</b>');
 assert.deepEqual([...view.walk()].map(el => [el.tagName, el.className, el.textContent]), [
  ['SPAN', 'browser-url-host', 'example.invalid'],
  ['SPAN', 'browser-url-dim', '/<b id="injected">hello</b>'],
 ]);
});

test('address-bar protocol, host, path, query and hash retain text-only formatting', () => {
 const { window } = page();
 const markup = '%3Cb%20id=%22injected%22%3Ehello%3C/b%3E';
 const cases = [
  ['http://www.example.invalid:8080/', ['http://', 'example.invalid:8080', '']],
  [`https://example.invalid/?q=${markup}`, ['example.invalid', '?q=<b id="injected">hello</b>']],
  [`https://example.invalid/#${markup}`, ['example.invalid', '#<b id="injected">hello</b>']],
  ['https://example.invalid/&lt;b&gt;%20%E2%9C%93', ['example.invalid', '/&lt;b&gt; ✓']],
  [`file:///tmp/${markup}`, ['file://', '', '/tmp/<b id="injected">hello</b>']],
  [`data:text/html,${markup}`, ['data://', '', 'text/html,<b id="injected">hello</b>']],
 ];
 for (const [url, pieces] of cases) {
  const view = addressBar(window, url);
  assert.deepEqual([...view.walk()].map(el => el.textContent), pieces, url);
  assert.ok([...view.walk()].every(el => el.tagName === 'SPAN' && el.childElementCount === 0), url);
 }
});

test('invalid URLs and malformed escapes fall back to literal text; blank URLs stay empty', () => {
 const { window } = page();
 for (const url of ['not a URL <b id="injected">hello</b>', 'http://example.invalid/%ZZ%3Cb%3E']) {
  const view = addressBar(window, url);
  assert.equal(view.textContent, url);
  assert.equal(view.childElementCount, 0, 'fallback must replace any partial protocol/host display');
 }
 for (const url of ['', 'about:blank']) {
  const view = addressBar(window, url);
  assert.equal(view.textContent, '');
  assert.equal(view.childElementCount, 0);
 }
});
