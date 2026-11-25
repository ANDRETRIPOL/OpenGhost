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

// The football widgets come from their own file and join the kinds.
vm.runInContext(fs.readFileSync(path.join(root, 'blocks-pitch.js'), 'utf8'), sandbox);
check('the football widgets join the kinds', B.known('pitch') && B.known('players') && B.KINDS.length === 28, String(B.KINDS.length));
// A pitch written by mistake in a mermaid block (seen on GPT Luna): its phases, one after another under "phases",
// come back as a list, not the last one alone.
const slipped = B.fromFields('pitch\n  title ЛЦП\n  formation 3-4-1-2\n  you LCM\n  phases\n    name С мячом\n    say Предлагайся под пас.\n    ball LCM\n    us {"LCM":[48,25]}\n    name Без мяча\n    say Экран перед тройкой.\n    us {"LCM":[30,24]}');
check('a pitch written in a mermaid block keeps all its phases', Array.isArray(slipped?.phases) && slipped.phases.length === 2 && slipped.phases[1].name === 'Без мяча' && slipped.phases[0].us.LCM[0] === 48 && slipped.formation === '3-4-1-2', JSON.stringify(slipped));
const K = window.PitchKit;
const sum = f => Object.keys(K.formation(f).at).length;
check('every formation the app knows has eleven players', K.FORMS.every(f => sum(f) === 11), K.FORMS.filter(f => sum(f) !== 11).join(' '));
check('a formation written loosely is the one meant', K.formation('3 4 1 2').key === '3-4-1-2' && K.formation('4231').key === '4-2-3-1' && K.formation('4–3–3').key === '4-3-3');
const odd = K.formation('4-3-1-2');
check('a formation the table lacks is laid out from its digits, eleven players, no role twice', odd.key === '4-3-1-2' && Object.keys(odd.at).length === 11 && Object.values(odd.at).every(([x, y]) => x >= 0 && x <= 105 && y >= 0 && y <= 68), JSON.stringify(odd.at));
check('a formation that is not ten outfield players falls back to 4-4-2', K.formation('4-3-6-2').key === '4-4-2' && K.formation('').key === '4-4-2');
check('a role written in Russian, as FIFA shows it, is read', K.roleOf('ЛЦП — LCM') === 'LCM' && K.roleOf('ЛЦП') === 'LCM' && K.roleOf('ЦАП') === 'CAM' && K.roleOf('lcm') === 'LCM' && K.roleOf('ПЦЗ') === 'RCB');

// The same board for ice hockey, basketball and rugby: each formation a full team standing on its own ground.
const sports = { hockey: 6, basketball: 5, rugby: 15 };
for (const [name, men] of Object.entries(sports)) {
 const kit = K.sport(name), bad = kit.FORMS.filter(f => { const at = kit.formation(f).at, all = Object.values(at); return all.length !== men || all.some(([x, y]) => x < 0 || x > kit.L || y < 0 || y > kit.H); });
 check(`every ${name} formation has ${men} players on its ground`, kit.id === name && kit.FORMS.length >= 4 && !bad.length, bad.join(' '));
}
check('a sport written in Russian or loosely is the one meant, and an unknown one is football', K.sport('Хоккей').id === 'hockey' && K.sport('ice hockey').id === 'hockey' && K.sport('НБА').id === 'basketball' && K.sport('регби').id === 'rugby' && K.sport('').id === 'football' && K.sport('curling').id === 'football');
check('a formation of another sport written as the chip says it is read', K.sport('hockey').formation('Коробка + 1').key === 'box+1' && K.sport('hockey').formation('1 2 2').key === '1-2-2' && K.sport('basketball').formation('зона 2–3').key === 'zone-2-3' && K.sport('basketball').formation('man to man').key === 'man' && K.sport('rugby').formation('Схватка').key === 'scrum' && K.sport('basketball').formation('что-то').key === '5-out');
check('a pitch with no sport named is the sport of its roles and formations, football otherwise', K.guess({ formation: '5-out', against: 'zone-2-3', phases: [{ us: { PG: [20, 7] } }] }) === 'basketball' && K.guess({ phases: [{ us: { C: [40, 15], LD: [39, 9] } }] }) === 'hockey' && K.guess({ us: { 9: [42, 31], 10: [36, 24] } }) === 'rugby' && K.guess({ formation: '4-3-3', phases: [{ us: { LW: [60, 10], CB: [17, 34] } }] }) === 'football' && K.guess({ formation: '3-4-1-2', you: 'LCM' }) === 'football');
check('roles of other sports are read in Russian, by number and by their short names', K.sport('hockey').roleOf('ЦН') === 'C' && K.sport('hockey').roleOf('ЛЗ') === 'LD' && K.sport('basketball').roleOf('РЗ') === 'PG' && K.sport('basketball').roleOf('1') === 'PG' && K.sport('rugby').roleOf('№10') === '10' && K.sport('rugby').roleOf('FH') === '10' && K.sport('rugby').roleOf('9 (scrum-half)') === '9');

// The agent is told every kind, in the guide drawings are explained in, and that widgets do not replace drawings.
const chat =fs.readFileSync(path.join(root, 'chat.js'), 'utf8');
const guide = chat.slice(chat.indexOf('const FORMAT_GUIDE'), chat.indexOf('const VISUAL_CHECK'));
for (const kind of B.KINDS) check(`the guide tells the agent about ${kind}`, new RegExp(`(^|[\\s(])${kind}( \\(|:)`).test(guide.replace(/\\'/g, "'")));
check('the guide says widgets and drawings work together and never repeat each other', /widgets and drawings work together and never repeat each other/i.test(guide));
check('the guide sends a plain explanation to drawings, with no widget', /only asks to explain[^']*gets drawings and no widget/i.test(guide));
check('the guide keeps bookkeeping and tax for the bookkeeping drawings', /Bookkeeping and tax[^']*the bookkeeping drawings, never a widget/.test(guide.replace(/\\'/g, "'")));
check('the bookkeeping drawings are still told to the agent', /invoice, statement, entries, t-accounts, reconcile, match, trial, report, tax, aging/.test(chat));
check('the markdown draws a widget fence as a live widget', /lang === 'widget'/.test(fs.readFileSync(path.join(root, 'markdown.js'), 'utf8')));

console.log(`\n${passed} checks passed${failed ? `, ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
