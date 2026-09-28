'use strict';
// Regression: Linux folder identity compared paths lower-cased, so /workspace/Foo and /workspace/foo
// collapsed into one folder and choosing one could store or act on the other.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const UPPER = '/workspace/Foo', LOWER = '/workspace/foo';

function load(dir, files, extra = {}) {
 const window = { matchMedia: () => ({ matches: true }), ...extra.window };
 const context = vm.createContext({ window, setTimeout, clearTimeout, I18n: { t: key => key }, ...extra.globals });
 for (const file of files) vm.runInContext(fs.readFileSync(path.join(ROOT, dir, file), 'utf8'), context);
 return window;
}

async function library(dir, index = null, picked = null) {
 const writes = [];
 const store = { read: async () => index, write: async (name, data) => { writes.push([name, data]); }, remove: async () => {} };
 const { Library } = load(dir, ['library.js'], { window: { openghost: { pickFolder: async () => picked } } });
 const lib = new Library(store, () => {});
 await lib.ready;
 return lib;
}

// Values made inside the sandbox have its own prototypes; copy them out before deep comparisons.
const plain = value => JSON.parse(JSON.stringify(value));
const paths = lib => plain(lib.folders.map(folder => folder.path).sort());

test('linux: folders that differ only by case stay separate', async () => {
 const lib = await library('linux');
 lib.folder({ path: UPPER });
 lib.folder({ path: LOWER });
 assert.deepStrictEqual(paths(lib), [UPPER, LOWER].sort());
 assert.strictEqual(lib.folders.find(folder => folder.path === LOWER).name, 'foo');
});

test('linux: a saved index keeps both folders and their chats apart', async () => {
 const lib = await library('linux', {
  folders: [{ path: UPPER, name: 'Foo' }],
  chats: [{ id: 'a', folder: UPPER, updated: 1 }, { id: 'b', folder: LOWER, updated: 2 }],
 });
 assert.deepStrictEqual(paths(lib), [UPPER, LOWER].sort());
 const [upper, lower] = [UPPER, LOWER].map(p => lib.folders.find(folder => folder.path === p));
 assert.deepStrictEqual(plain(lib.inFolder(upper).map(chat => chat.id)), ['a']);
 assert.deepStrictEqual(plain(lib.inFolder(lower).map(chat => chat.id)), ['b']);
});

test('linux: picking the lower-case folder stores the lower-case path', async () => {
 const lib = await library('linux', null, { path: LOWER, name: 'foo' });
 lib.folder({ path: UPPER });
 const picked = await lib.pick();
 assert.deepStrictEqual(plain(picked), { path: LOWER, name: 'foo' });
 const chat = lib.create({ folder: picked, text: 'hello', attachments: [] });
 assert.strictEqual(chat.folder, LOWER);
 assert.deepStrictEqual(paths(lib), [UPPER, LOWER].sort());
});

test('linux: toggling or removing one folder leaves its case twin alone', async () => {
 const lib = await library('linux');
 lib.folder({ path: UPPER });
 const keep = lib.create({ folder: { path: UPPER }, text: 'keep', attachments: [] });
 lib.create({ folder: { path: LOWER }, text: 'drop', attachments: [] });
 lib.toggleFolder(LOWER);
 assert.strictEqual(lib.folders.find(folder => folder.path === UPPER).collapsed, false);
 assert.strictEqual(lib.folders.find(folder => folder.path === LOWER).collapsed, true);
 lib.removeFolder(LOWER);
 assert.deepStrictEqual(paths(lib), [UPPER]);
 assert.deepStrictEqual(plain(lib.chats.map(chat => chat.id)), [keep.id]);
});

test('linux: a new chat from the sidebar opens in the folder that was chosen', () => {
 const { ChatList } = load('linux', ['chat-list.js']);
 const opened = [];
 const fake = { library: { folders: [{ path: UPPER, name: 'Foo' }, { path: LOWER, name: 'foo' }], toggleFolder() {} }, onNewChat: folder => opened.push(folder) };
 ChatList.prototype.newChat.call(fake, { path: LOWER });
 ChatList.prototype.newChat.call(fake, { path: UPPER });
 assert.deepStrictEqual(plain(opened), [{ path: LOWER, name: 'foo' }, { path: UPPER, name: 'Foo' }]);
});

test('linux: removing a folder keeps a draft in its case twin', () => {
 const { Chat } = load('linux', ['chat.js']);
 const draft = { folder: { path: UPPER, name: 'Foo' } };
 const fake = { active: { record: null, folder: draft.folder }, draft, remove() {}, newChat() { throw new Error('draft reset'); } };
 Chat.prototype.removeFolder.call(fake, LOWER, []);
 assert.deepStrictEqual(plain(draft.folder), { path: UPPER, name: 'Foo' });
});

for (const dir of ['.', 'mac'].filter(dir => fs.existsSync(path.join(ROOT, dir, 'library.js')))) {
 test(`${dir}: case-insensitive platforms still treat case twins as one folder`, async () => {
  const lib = await library(dir);
  lib.folder({ path: UPPER });
  lib.folder({ path: LOWER });
  assert.deepStrictEqual(paths(lib), [UPPER]);
 });
}
