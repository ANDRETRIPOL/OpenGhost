'use strict';
// Regression: the Chat constructor stored its extra system-prompt text as `this.note`,
// which hid the note(view, text) method, so end() threw instead of showing "Stopped" and the other terminal notes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const COPIES = ['.', 'linux', 'mac'].filter(dir => fs.existsSync(path.join(ROOT, dir, 'chat.js')));

class FakeElement {
 constructor(tag) {
  this.tagName = tag.toUpperCase();
  this.className = '';
  this.textContent = '';
  this.children = [];
  this.classList = { add() {}, remove() {}, contains: () => false };
 }
 append(...nodes) { this.children.push(...nodes); }
 querySelector() { return null; }
}

function loadChat(dir) {
 const window = { matchMedia: () => ({ matches: true }) };
 const context = vm.createContext({
  window,
  document: { createElement: tag => new FakeElement(tag) },
  I18n: { t: key => `t:${key}` },
  AgentTools: { available: false },
  RowGlide: class {},
  ResizeObserver: class { observe() {} },
 });
 vm.runInContext(fs.readFileSync(path.join(ROOT, dir, 'chat.js'), 'utf8'), context);
 return window.Chat;
}

// Only the constructor's first-draft DOM setup is stubbed; end(), note() and system() run as shipped.
function makeChat(Chat, note) {
 const proto = Chat.prototype, saved = { newDraft: proto.newDraft, activate: proto.activate };
 proto.newDraft = () => ({});
 proto.activate = () => {};
 const target = { addEventListener() {}, querySelector: () => null };
 try {
  return new Chat({ main: target, thread: target, bottom: target, settings: {}, library: { chat: () => null }, onChange() {}, onList() {}, note });
 } finally {
  Object.assign(proto, saved);
 }
}

const CASES = [
 ['stopped', { name: 'AbortError' }, undefined, 't:chat.stopped'],
 ['length limit', null, 'length', 't:finish.length'],
 ['content filter', null, 'content_filter', 't:finish.content_filter'],
 ['empty response', null, 'stop', 't:chat.empty'],
];

for (const dir of COPIES) {
 test(`${dir}/chat.js: note() stays a method`, () => {
  const Chat = loadChat(dir);
  assert.strictEqual(typeof Chat.prototype.note, 'function');
  for (const note of ['', 'Extra prompt']) assert.strictEqual(typeof makeChat(Chat, note).note, 'function');
 });

 test(`${dir}/chat.js: the note option still reaches the system prompt`, async () => {
  const Chat = loadChat(dir);
  const plain = await makeChat(Chat, '').system({ record: null });
  const extra = await makeChat(Chat, 'Extra prompt').system({ record: null });
  assert.ok(!plain.endsWith('Extra prompt'));
  assert.strictEqual(extra, `${plain}\n\nExtra prompt`);
 });

 for (const note of ['', 'Extra prompt']) {
  for (const [label, error, finish, text] of CASES) {
   test(`${dir}/chat.js: end() shows the ${label} note (note option ${JSON.stringify(note)})`, async () => {
    const chat = makeChat(loadChat(dir), note);
    const view = { el: new FakeElement('div'), stream: { finish: async () => {} }, status: null };
    const entry = { steps: [{}], content: '' };
    const turn = { part: { view, entry }, approvals: [], queue: [], parts: [], text: '', quiet: false };
    const conv = { turn, id: '', record: null, messages: [entry], locked: false };
    await chat.end(conv, turn, error, finish);
    const notes = view.el.children.filter(child => child.className === 'message-note');
    assert.deepStrictEqual(notes.map(child => child.textContent), [text]);
   });
  }
 }
}
