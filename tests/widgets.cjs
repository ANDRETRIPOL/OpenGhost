'use strict';
// Live widgets (blocks.js): their fences found in a message and written back, a change made while a reply was still
// being written kept through the next save, and every kind told to the agent.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`); };

class HTMLElement {}
const window = { I18n: { lang: 'ru' }, matchMedia: () => ({ matches: false }), dispatchEvent: () => true };
const sandbox = { window, HTMLElement, customElements: { get: () => null, define: () => {} }, matchMedia: window.matchMedia, setTimeout, clearTimeout, setInterval, clearInterval, Intl, Date, Math, JSON, Map, WeakMap, Set, Number, String, Object, Array, Promise, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, Audio: class { play() { return Promise.resolve(); } }, I18n: window.I18n, performance: { now: () => Date.now() }, requestAnimationFrame: fn => setTimeout(fn, 0) };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'blocks.js'), 'utf8'), sandbox);
const B = window.Blocks;
check('Blocks loads with its kinds', !!B && B.KINDS.length === 26, String(B?.KINDS.length));

const message = 'Вот таймер:\n\n```widget\n{"kind":"timer","label":"Паста","seconds":600}\n```\n\nИ код:\n\n```widget\nnot json\n```\n\n```widget\n{"kind":"weather","place":"Бургас","days":[{"name":"Завтра","hours":[20,21]}],"now":{"day":0,"hour":1}}\n```';
const found = B.scan(message);
check('three fences are found, one of them not a widget', found.length === 3 && found[0].kind === 'timer' && found[1].data === null && found[2].kind === 'weather');
check('the second widget drawn is the third fence', B.fenceOf(message, 1) === 2 && B.fenceOf(message, 0) === 0 && B.fenceOf(message, 2) === -1);
const pinned = B.rewrite(message, 2, { ...found[2].data, pinned: true });
check('a rewrite changes only its own fence', B.scan(pinned)[2].data.pinned === true && B.scan(pinned)[0].data.pinned === undefined && pinned.includes('not json') && pinned.startsWith('Вот таймер:'));

// A reply still being written: the stream puts the message together again from its words, then the chat is saved.
const entry = { role: 'assistant', content: message };
B.keep(entry, 0, { kind: 'timer', label: 'Паста', seconds: 600, started: 1700000000000, id: 't1' });
entry.content = message + '\n\nЕщё слова.';
B.settle([entry]);
check('a widget change made while the reply was written survives the next save', B.scan(entry.content)[0].data.started === 1700000000000 && entry.content.endsWith('Ещё слова.'));

// The slips a model makes in a widget's JSON (seen on GPT Luna) are mended; what is no JSON stays unread.
const slip = B.parse('{"kind":"currency","base":"USD","amount":250,"rates":{"EUR":0.912","RUB":81.929},}');
check('a quote left after a number and a trailing comma are mended', slip?.rates?.EUR === 0.912 && slip.rates.RUB === 81.929, JSON.stringify(slip));
check('a fence with that slip is drawn as its widget', B.scan('```widget\n{"kind":"currency","base":"USD","amount":250,"rates":{"EUR":0.912"}}\n```')[0].kind === 'currency');
check('a string ending in a digit keeps its quote', B.parse('{"kind":"flight","number":"W6 4321"}')?.number === 'W6 4321' && B.parse('not json') === null);

// A source written as Markdown links is shown as their names (seen on GPT Luna), opening in the built-in browser.
const src = fs.readFileSync(path.join(root, 'blocks.js'), 'utf8');
check('a widget source turns Markdown links into named links', /function source\(text\)/.test(src) && /bk-src-link[^\n]*data-link/.test(src) && !/<div class="bk-src">\$\{esc\(src\)\}/.test(src));
check('a fuel price of nought shows the litres, not nought money', /Number\(fuel\.price\) > 0 \? say\('fuel'/.test(src) && /fuelL: 'бензин ≈ \{l\} л'/.test(src));

// A widget written by mistake as a mermaid block (seen on GPT Luna) is read as the widget; a real drawing is not.
const asFields = B.fromFields('route\n  from Москва\n  to Казань\n  depart "7:00"\n  minutes 420\n  km 810\n  roundTrip false\n  fuel\n    per100 8\n    currency RUB');
check('a widget\'s fields in a mermaid block are read as the widget', asFields?.kind === 'route' && asFields.from === 'Москва' && asFields.minutes === 420 && asFields.depart === '7:00' && asFields.roundTrip === false && asFields.fuel?.per100 === 8 && asFields.fuel.currency === 'RUB', JSON.stringify(asFields));
check('a route drawing stays a drawing', B.fromFields('route\n  Day 1\n  Москва | 9:00 | Кремль\n    поезд | 2 ч | 200 км\n  Тверь | 12:00 | набережная') === null);
check('a recipe drawing stays a drawing', B.fromFields('recipe\n  30 min | 4\n  Ingredients\n    Творог | 500 г |') === null);
check('a drawing kind that is no widget stays a drawing', B.fromFields('metrics\n  title Итог\n  total 5') === null);

// Pinning above the chat is gone: a widget has no pin of its own any more.
check('no widget carries a pin', !/bk-pin|block-pin/.test(fs.readFileSync(path.join(root, 'blocks.js'), 'utf8')) && !fs.existsSync(path.join(root, 'pin-island.js')));

// The agent is told every kind, in the guide drawings are explained in, and that widgets do not replace drawings.
const chat = fs.readFileSync(path.join(root, 'chat.js'), 'utf8');
const guide = chat.slice(chat.indexOf('const FORMAT_GUIDE'), chat.indexOf('const VISUAL_CHECK'));
for (const kind of B.KINDS) check(`the guide tells the agent about ${kind}`, new RegExp(`(^|[\\s(])${kind}( \\(|:)`).test(guide.replace(/\\'/g, "'")));
check('the guide says widgets and drawings work together and never repeat each other', /widgets and drawings work together and never repeat each other/i.test(guide));
check('the guide sends a plain explanation to drawings, with no widget', /only asks to explain[^']*gets drawings and no widget/i.test(guide));
check('the guide keeps bookkeeping and tax for the bookkeeping drawings', /Bookkeeping and tax[^']*the bookkeeping drawings, never a widget/.test(guide.replace(/\\'/g, "'")));
check('the bookkeeping drawings are still told to the agent', /invoice, statement, entries, t-accounts, reconcile, match, trial, report, tax, aging/.test(chat));
check('the markdown draws a widget fence as a live widget', /lang === 'widget'/.test(fs.readFileSync(path.join(root, 'markdown.js'), 'utf8')));

console.log(`\n${passed} checks passed${failed ? `, ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
