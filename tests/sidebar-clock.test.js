'use strict';
// Regression: every 30 s the sidebar clock called library.chat(id) for each row, and library.chat()
// scans the whole chat list, so one tick cost about n²/2 comparisons (~2 million for 2000 chats).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const COPIES = ['.', 'linux', 'mac'].filter(dir => fs.existsSync(path.join(ROOT, dir, 'chat-list.js')));
const MINUTE = 60000, NOW = Date.UTC(2026, 0, 31, 12);

function load(dir) {
 const window = {};
 const context = vm.createContext({ window, setTimeout, clearTimeout, Date: class extends Date { static now() { return NOW; } }, I18n: { t: key => key, lang: 'en' } });
 for (const file of ['library.js', 'chat-list.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, dir, file), 'utf8'), context);
 return window;
}

// A time label that counts how often it is rewritten.
function label(text = '') {
 return { writes: 0, value: text, get textContent() { return this.value; }, set textContent(next) { this.writes++; this.value = next; } };
}

// A real Library whose chat list counts element reads, and a ChatList with one row per chat.
async function setup(dir, n) {
 const { Library, ChatList } = load(dir);
 const chats = Array.from({ length: n }, (_, k) => ({ id: `c${k}`, folder: '/work', updated: NOW - k * MINUTE, title: `${k}` }));
 const lib = new Library({ read: async () => ({ folders: [], chats }), write: async () => {}, remove: async () => {} }, () => {});
 await lib.ready;
 clearTimeout(lib.timer);
 const reads = { count: 0 };
 lib.chats = new Proxy(lib.chats, { get(target, key, receiver) { if (/^\d+$/.test(String(key))) reads.count++; return Reflect.get(target, key, receiver); } });
 const rows = new Map(chats.map(chat => [chat.id, { time: label() }]));
 const list = Object.assign(Object.create(ChatList.prototype), { library: lib, rows });
 return { list, rows, reads };
}

for (const dir of COPIES) {
 test(`${dir}/chat-list.js: a clock tick reads each chat a bounded number of times`, async () => {
  const counts = {};
  for (const n of [1000, 2000]) {
   const { list, reads } = await setup(dir, n);
   list.clock();
   counts[n] = reads.count;
   assert.ok(reads.count <= 2 * n, `${n} rows took ${reads.count} chat reads`);
  }
  assert.ok(counts[2000] <= 2.2 * counts[1000], `reads grew from ${counts[1000]} to ${counts[2000]} when the rows doubled`);
 });

 test(`${dir}/chat-list.js: clock labels are unchanged and only rewritten when they change`, async () => {
  const { list, rows } = await setup(dir, 3);
  const extra = { time: label('old') };
  rows.set('gone', extra);
  list.clock();
  assert.deepStrictEqual([...rows.values()].map(row => row.time.textContent), ['time.now', '1m', '2m', 'old']);
  assert.strictEqual(extra.time.writes, 0, 'a row without a chat keeps its label');
  for (const row of rows.values()) row.time.writes = 0;
  list.clock();
  assert.deepStrictEqual([...rows.values()].map(row => row.time.writes), [0, 0, 0, 0]);
  list.library.update('c2', { updated: NOW - 3 * 60 * MINUTE });
  list.clock();
  assert.deepStrictEqual([...rows.values()].map(row => row.time.writes), [0, 0, 1, 0]);
  assert.strictEqual(rows.get('c2').time.textContent, '3h');
 });
}
