'use strict';
// The language the page speaks before one is picked (i18n.js): the computer's own on the very first start, English
// for a language the app does not know, and nothing changed for someone who used the app before. Real source in VMs.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const results = [];
const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });

// The page as it starts: what the app passed of the computer's languages and what localStorage holds already.
function start({ languages, kept = {}, desktop = true, browser = [] }) {
 const store = new Map(Object.entries(kept));
 const localStorage = {
  get length() { return store.size; },
  getItem: key => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
 };
 const window = desktop ? { openghost: { languages } } : {};
 const context = { window, localStorage, navigator: { languages: browser }, document: { querySelectorAll: () => [], documentElement: {} } };
 vm.createContext(context);
 for (const file of ['i18n-it.js', 'i18n-fr.js', 'i18n-ru.js', 'i18n.js']) vm.runInContext(read(file), context);
 return { lang: context.window.I18n.lang, kept: store.get('openghost.lang') ?? null };
}

check('The first start on a Russian computer speaks Russian and keeps it', start({ languages: ['ru-UA', 'en-US'] }), { lang: 'ru', kept: 'ru' });
check('The first language the app knows wins, in the computer\'s order', start({ languages: ['de-DE', 'fr-CA', 'it-IT'] }), { lang: 'fr', kept: 'fr' });
check('English before a language it knows stays English', start({ languages: ['en-GB', 'ru-RU'] }), { lang: 'en', kept: 'en' });
check('A computer in a language the app lacks gets English', start({ languages: ['de-DE', 'ja-JP'] }), { lang: 'en', kept: 'en' });
check('Someone who used the app before and never picked one keeps English', start({ languages: ['ru-RU'], kept: { 'openghost.theme': 'dark' } }), { lang: 'en', kept: null });
check('A language picked in the settings stands', start({ languages: ['ru-RU'], kept: { 'openghost.lang': 'it' } }), { lang: 'it', kept: 'it' });
check('No languages passed (a harness window) is English', start({ languages: [] }), { lang: 'en', kept: 'en' });
check('Outside the app the browser\'s languages are asked', start({ desktop: false, browser: ['it-IT', 'en'] }), { lang: 'it', kept: 'it' });

const failed = results.filter(item => !item.pass);
for (const item of results) console.log(`${item.pass ? 'ok  ' : 'FAIL'} ${item.name}${item.pass ? '' : `\n     got      ${JSON.stringify(item.actual)}\n     expected ${JSON.stringify(item.expected)}`}`);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
