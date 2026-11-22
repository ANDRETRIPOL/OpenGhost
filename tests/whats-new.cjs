'use strict';
// "What's new" (whats-new.js): shown once on the first start of a version that has an entry, never to someone who has
// just installed the app, never again for the same version; every entry's words are there in every language, and every
// picture it names is in the app. The store, the DOM and the dialog are stand-ins.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
let count = 0;
const check = (name, ok, detail = '') => { assert.ok(ok, `${name}${detail ? ` — ${detail}` : ''}`); count++; console.log(`ok  ${name}`); };

function world({ version, seen = null, tour = null, chats = 0, tourDuringLoad = false }) {
 const store = new Map([['news', seen], ['tour', tour]]), opened = [];
 const el = () => ({ append() {}, setAttribute() {}, addEventListener() {}, querySelector: () => ({ focus() {} }), animate() {}, remove() {}, showModal() { opened.push(true); }, close() {}, style: {}, dataset: {} });
 const c = {
  window: { openghost: { about: async () => ({ version }) }, matchMedia: () => ({ matches: true }) },
  document: { createElement: el, documentElement: { classList: { contains: () => false }, dataset: {} }, body: { append() {} } },
  ChatStore: { read: async key => store.get(key) ?? null, write: async (key, value) => { store.set(key, value); } },
  I18n: { t: key => key, lang: 'en' }, ChangeIcons: { of: () => '' }, setTimeout,
 };
 c.window.window = c.window;
 vm.createContext(c);
 vm.runInContext(read('change-icons.js'), c);
 vm.runInContext(read('whats-new.js'), c);
 // The welcome cards count themselves seen while the app loads, as they do once the opening has played.
 const ready = tourDuringLoad ? new Promise(resolve => setTimeout(() => { store.set('tour', { seen: Date.now() }); resolve(); }, 10)) : Promise.resolve();
 return { WhatsNew: c.window.WhatsNew, store, opened, library: { ready, chats: Array.from({ length: chats }) } };
}

(async () => {
 const version = '1.5.7';
 let w = world({ version, seen: { version: '1.5.5' }, tour: { seen: 1 }, chats: 3 });
 await w.WhatsNew.start({ library: w.library });
 check('After an update to a version with an entry, it is shown', w.opened.length === 1);
 check('...and the version counts as seen', w.store.get('news').version === version);
 await w.WhatsNew.start({ library: w.library });
 check('...once: the next start does not show it again', w.opened.length === 1);
 w = world({ version, seen: null, tour: { seen: 1 }, chats: 5 });
 await w.WhatsNew.start({ library: w.library });
 check('Someone updating from a version before it shows it too', w.opened.length === 1);
 w = world({ version, seen: null, tour: null, chats: 0 });
 await w.WhatsNew.start({ library: w.library });
 check('Someone who has just installed the app is not shown it: the welcome cards are theirs', w.opened.length === 0 && w.store.get('news').version === version);
 w = world({ version, seen: null, tour: null, chats: 0, tourDuringLoad: true });
 await w.WhatsNew.start({ library: w.library });
 check('...also when the welcome cards count themselves seen while the app loads', w.opened.length === 0);
 w = world({ version: '9.9.9', seen: { version: '1.5.7' }, tour: { seen: 1 }, chats: 2 });
 await w.WhatsNew.start({ library: w.library });
 check('A version with no entry shows nothing, and counts as seen', w.opened.length === 0 && w.store.get('news').version === '9.9.9');

 // Every word and picture of every entry is there.
 const source = read('whats-new.js'), entries = [...source.matchAll(/'(\d+\.\d+\.\d+)': \{([\s\S]*?)\n \},/g)];
 check('There is an entry', entries.length > 0);
 for (const [, v, body] of entries) {
  const keys = [...body.matchAll(/key: '([\w-]+)'/g)].map(m => m[1]), pictures = [...body.matchAll(/picture: '([\w-]+)'/g)].map(m => m[1]);
  for (const file of ['i18n.js', 'i18n-ru.js', 'i18n-it.js', 'i18n-fr.js']) {
   const text = read(file), missing = keys.flatMap(k => ['title', 'text'].map(p => `news.${v}.${k}.${p}`)).filter(k => !text.includes(`'${k}':`));
   check(`${v}: every word in ${file}`, !missing.length && ['news.title', 'news.version', 'news.more', 'news.all', 'news.ok'].every(k => text.includes(`'${k}':`)), missing.join(', '));
  }
  const lost = pictures.flatMap(p => ['dark', 'light'].flatMap(theme => ['ru', 'en', 'it', 'fr'].map(lang => `whats-new/${v}/${p}-${theme}-${lang}.png`))).filter(f => !fs.existsSync(path.join(root, f)));
  check(`${v}: every picture in both themes, in all four languages`, !lost.length, lost.join(', '));
  const icons = [...body.matchAll(/icon: '([\w-]+)'/g)].map(m => m[1]), names = world({ version: v }).WhatsNew && vm.runInNewContext(`${read('change-icons.js')}; window.ChangeIcons.names`, { window: {} });
  check(`${v}: every sign is one of the set`, icons.every(i => names.includes(i)), icons.filter(i => !names.includes(i)).join(', '));
 }
 console.log(`\n${count} checks passed`);
})().catch(error => { console.error(error); process.exit(1); });
