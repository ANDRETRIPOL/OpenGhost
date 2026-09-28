'use strict';
// Regression: quotes and lists render recursively, so a reply nested a few thousand levels deep,
// such as Markdown.render('>'.repeat(2000) + ' deep text'), threw "RangeError: Maximum call stack size exceeded".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const COPIES = ['.', 'linux', 'mac'].filter(dir => fs.existsSync(path.join(ROOT, dir, 'markdown.js')));
const DEEP = 2000;

function loadMarkdown(dir) {
 const window = {};
 const context = vm.createContext({ window, I18n: { t: key => key }, Tex: { render: text => text }, Highlight: { code: text => text } });
 vm.runInContext(fs.readFileSync(path.join(ROOT, dir, 'markdown.js'), 'utf8'), context);
 return window.Markdown;
}

const count = (html, tag) => html.split(`<${tag}`).length - 1;
// How deeply quotes and lists sit inside one another in the output.
function depthOf(html) {
 let depth = 0, max = 0;
 for (const [, close] of html.matchAll(/<(\/?)(?:blockquote|ul|ol)\b/g)) max = Math.max(max, depth += close ? -1 : 1);
 return max;
}
const nestedList = (depth, text) => Array.from({ length: depth }, (_, k) => `${'  '.repeat(k)}- ${k === depth - 1 ? text : `level ${k}`}`).join('\n');

for (const dir of COPIES) {
 test(`${dir}/markdown.js: normal nesting renders as before`, () => {
  const { render } = loadMarkdown(dir);
  assert.strictEqual(render('> outer\n>> middle\n>>> inner'),
   '<blockquote class="md-quote t-lilac"><p>outer</p><blockquote><p>middle</p><blockquote><p>inner</p></blockquote></blockquote></blockquote>');
  assert.strictEqual(render('- one\n  - two\n    - three'),
   '<ul><li><p>one</p><ul><li><p>two</p><ul><li><p>three</p></li></ul></li></ul></li></ul>');
  assert.strictEqual(render('> [!NOTE]\n> > nested *note*'),
   '<blockquote class="md-callout is-note t-blue"><div class="md-callout-title">callout.note</div><blockquote><p>nested <em>note</em></p></blockquote></blockquote>');
 });

 test(`${dir}/markdown.js: 30 levels of nesting still render in full`, () => {
  const { render } = loadMarkdown(dir);
  const quote = render(`${'>'.repeat(30)} deep text`);
  assert.strictEqual(count(quote, 'blockquote'), 30);
  assert.strictEqual(depthOf(quote), 30);
  assert.ok(quote.includes('<p>deep text</p>'));
  const list = render(nestedList(30, 'deep text'));
  assert.strictEqual(count(list, 'ul'), 30);
  assert.ok(list.includes('<p>deep text</p>'));
 });

 for (const [label, source] of [
  ['quotes', `${'>'.repeat(DEEP)} deep text`],
  ['spaced quotes', `${'> '.repeat(DEEP)}deep text`],
  ['callout quotes', `> [!NOTE]\n${'> '.repeat(DEEP)}deep text`],
  ['lists', nestedList(DEEP, 'deep text')],
  ['lists holding quotes', Array.from({ length: DEEP }, (_, k) => `${'   '.repeat(k)}1. ${k === DEEP - 1 ? 'deep text' : '> step'}`).join('\n')],
 ]) {
  test(`${dir}/markdown.js: ${DEEP} levels of ${label} degrade without throwing`, () => {
   const { render, blocks } = loadMarkdown(dir);
   let html;
   assert.doesNotThrow(() => { html = render(source); });
   assert.ok(html.includes('deep text'));
   assert.ok(depthOf(html) <= 32, `nesting is capped, got ${depthOf(html)}`);
   assert.doesNotThrow(() => blocks(source, { live: true }));
  });
 }
}
