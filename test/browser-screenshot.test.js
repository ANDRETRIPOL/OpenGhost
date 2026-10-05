'use strict';

// Issue #21: exercise the main-process capture and model-facing adapter without a backend or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ROOT = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function browser({ width = 800, viewportHeight = 600, contentHeight = 6000, top = 100 } = {}) {
 const sent = [];
 let rawSize;
 const electron = { nativeImage: { createFromBuffer() {
  let size = { ...rawSize };
  return { getSize: () => size, toJPEG: () => Buffer.from('image'), resize({ width }) {
   size = { width, height: Math.round(size.height * width / size.width) };
   return this;
  } };
 } } };
 const module = { exports: {} };
 vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'desktop/browser.js'), 'utf8'), {
  module, require: name => name === 'electron' ? electron : require(name), __dirname: path.join(ROOT, 'desktop'),
  process, Buffer, AbortController, setTimeout, clearTimeout, console,
 });
 const Browser = module.exports, guest = new EventEmitter();
 const host = { isDestroyed: () => false, send() {} };
 Object.assign(guest, { id: 1, isDestroyed: () => false, setWindowOpenHandler() {},
  getURL: () => 'about:blank', getTitle: () => 'Screenshot test',
  debugger: { isAttached: () => true, sendCommand: async (method, params) => {
   sent.push({ method, params });
   if (method === 'Page.getLayoutMetrics') return {
    cssVisualViewport: { clientWidth: width, clientHeight: viewportHeight, pageX: 0, pageY: top },
    cssContentSize: { height: contentHeight },
   };
   // HiDPI bitmap; the production code must keep CSS coverage separate from image resizing.
   if (method === 'Page.captureScreenshot') rawSize = {
    width: width * 2, height: Math.round((params.clip?.height ?? viewportHeight) * 2),
   };
   return { data: '' };
  } },
 });
 Browser.adopt(host, guest);
 const window = { openghost: { tools: {} } };
 vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'agent-tools.js'), 'utf8'), { window });
 const AgentTools = window.AgentTools;
 const format = async (args, answer) => { window.browserPanel = { run: async () => answer }; return AgentTools.run('browser_screenshot', args, { id: 'shot' }); };
 const run = args => Browser.run('browser_screenshot', { ...args, tab: 1 }, host, new AbortController().signal);
 return { sent, run, AgentTools, format };
}

for (const [label, contentHeight, viewportHeight] of [
 ['short page', 600, 600],
 ['within the cap', 1800, 600],
 ['fractional page height within the cap', 1800.25, 600],
 ['exactly at the cap', 2400, 600],
 ['one pixel beyond the cap', 2401, 600],
 ['well beyond the cap', 6000, 600],
 ['fractional viewport exactly at the cap', 2401, 600.25],
 ['fractional viewport beyond the cap', 2401.25, 600.25],
]) for (const width of [800, 1600]) test(`full-page screenshot: ${label}, viewport width ${width}`, async () => {
 const capturedHeight = Math.min(contentHeight, viewportHeight * 4), truncated = contentHeight > viewportHeight * 4;
 const { sent, run, AgentTools, format } = browser({ width, viewportHeight, contentHeight });
 const args = { full_page: true }, answer = await run(args), result = await format(args, answer);
 assert.equal(result.isError, undefined);
 assert.equal(answer.truncated, truncated);
 assert.equal(result.truncated, truncated);
 assert.equal(result.contentHeight, contentHeight);
 assert.equal(result.viewportHeight, viewportHeight);
 assert.equal(result.pageHeight, capturedHeight);
 assert.equal(result.pageWidth, width);
 assert.deepEqual(plain(result.capture), { x: 0, y: 0, width, height: capturedHeight });
 const captures = sent.filter(item => item.method === 'Page.captureScreenshot');
 assert.equal(captures.length, 1, 'no extra captures or stitching beyond the cap');
 assert.deepEqual(plain(captures[0].params), { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: capturedHeight, scale: 1 } });
 assert.equal(result.width, Math.min(width, 1280));
 assert.equal(result.scale, Math.min(width, 1280) / width);
 assert.equal(result.height, Math.round(Math.round(capturedHeight * 2) * result.scale / 2));
 assert.match(result.images[0].url, /^data:image\/jpeg;base64,/);
 assert.equal(result.text, answer.text);
 assert.ok(result.text.includes(`y=0–${capturedHeight} of ${contentHeight} CSS pixels`));
 if (truncated) {
  assert.match(result.text, /truncated full-page capture/);
  assert.ok(result.text.includes(`Only the top ${capturedHeight} CSS pixels (4 viewport heights) were captured`));
  assert.match(result.text, /More page content exists below; scroll down and take viewport screenshots/);
  assert.doesNotMatch(result.text, /complete vertical capture|entire page height/);
 } else {
  assert.match(result.text, /Screenshot of the full page \(complete vertical capture\)/);
  assert.match(result.text, /Captured the entire page height/);
  assert.doesNotMatch(result.text, /truncated|More page content|Only the top/);
 }
});

test('viewport screenshots remain viewport-only, not truncated full-page results', async () => {
 const { sent, run, AgentTools, format } = browser({ top: 1200 });
 for (const args of [{}, { full_page: false }]) {
  const result = await format(args, await run(args));
  assert.equal(result.truncated, false);
  assert.equal(result.pageHeight, 600);
  assert.equal(result.contentHeight, 6000);
  assert.equal(result.viewportHeight, 600);
  assert.deepEqual(plain(result.capture), { x: 0, y: 1200, width: 800, height: 600 });
  assert.match(result.text, /Screenshot of the viewport/);
  assert.doesNotMatch(result.text, /full page|full-page|entire page height|Only the top/);
 }
 for (const capture of sent.filter(item => item.method === 'Page.captureScreenshot')) assert.deepEqual(plain(capture.params), { format: 'png' });
});

test('advertised screenshot schema explains the cap and explicit completeness metadata', () => {
 const { AgentTools, format } = browser();
 const schema = AgentTools.schemas.find(tool => tool.function.name === 'browser_screenshot').function;
 assert.match(schema.description, /capped at four viewport heights/);
 assert.match(schema.description, /truncated: true/);
 assert.match(schema.parameters.properties.full_page.description, /truncated: false/);
});
