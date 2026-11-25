'use strict';
// The calendar's keeper in the app (desktop/calendar.js): entries kept as checked, reminders that come once and on time
// with no window, cards to the page when it is in front, a reminder put off, the app kept in the tray while a reminder is
// still to come. Electron is a fixture; the clock is moved by hand.
process.env.TZ = 'Europe/Paris';
const path = require('node:path');
const Module = require('node:module');
const results = [];
const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });

let now = new Date(2026, 10, 24, 9, 40).getTime();
const RealDate = Date;
global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
const handlers = {}, listeners = {}, shown = [], sent = [];
const timers = [];
global.setTimeout = (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; };
global.clearTimeout = () => {};
global.setInterval = () => 0;
const page = { isDestroyed: () => false, send: (channel, data) => sent.push([channel, data]) };
let focused = false;
const win = { isDestroyed: () => false, isVisible: () => focused, isMinimized: () => false, isFocused: () => focused, webContents: page };
const electron = {
 ipcMain: { handle: (name, fn) => { handlers[name] = fn; }, on: (name, fn) => { listeners[name] = fn; } },
 BrowserWindow: { getAllWindows: () => [win] },
 Notification: class { static isSupported() { return true; } constructor(options) { this.options = options; } on() {} show() { shown.push(this.options); } },
 powerMonitor: { on() {} },
 net: { fetch: async () => { throw new Error('offline'); } },
 dialog: {},
};
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'electron' ? electron : load.call(this, request, ...rest); };
const Calendar = require(path.join(__dirname, '..', 'desktop', 'calendar.js'));
const store = {};
const event = { sender: page };
const call = (name, ...args) => handlers[`calendar:${name}`](event, ...args);
const run = async () => { for (;;) { const due = timers.filter(t => t.at <= now); if (!due.length) return; for (const t of due) timers.splice(timers.indexOf(t), 1); for (const t of due) t.fn(); await new Promise(r => setImmediate(r)); } };
const advance = async minutes => { now += minutes * 60000; await run(); };

(async () => {
 Calendar.setup({ store: { read: async key => store[key] || null, write: async (key, value) => { store[key] = JSON.parse(JSON.stringify(value)); } }, fromApp: () => true, window: () => win, icon: '', changed() {}, open() {}, words: card => ({ title: `In · ${card.title}`, body: '' }) });
 listeners['calendar:ready'](event);
 await new Promise(r => setImmediate(r));
 check('Nothing kept, nothing to stay for', Calendar.alive, false);
 check('An entry with no title is no entry', (await call('add', { title: '   ', date: '2026-11-24' })).error, 'title');
 const bad = (await call('add', { title: 'X', kind: 'event', date: '2026-02-31', time: '25:00', rule: { freq: 'hourly' }, priority: 9, tag: 'nope' })).item;
 check('Wrong parts are left out: a day that is not, a time, a rule, a tag', [bad.date !== '2026-02-31', bad.time, bad.rule, bad.priority, bad.tag], [true, null, null, 3, null]);
 await call('remove', bad.id);
 const meeting = (await call('add', { title: 'Дизайн-ревью', kind: 'event', date: '2026-11-24', time: '10:00', dur: 60, remind: 15 })).item;
 check('A reminder still to come keeps the app in the tray', Calendar.alive, true);
 await advance(4);
 check('Not yet at 9:44', shown.length, 0);
 await advance(1);
 check('At 9:45 the system says it (the window is not in front)', shown.map(n => n.title), ['In · Дизайн-ревью']);
 check('The page keeps the card quietly for later', sent.filter(([c]) => c === 'calendar:remind').map(([, card]) => [card.title, !!card.quiet]), [['Дизайн-ревью', true]]);
 await advance(5);
 check('It comes once', shown.length, 1);
 await call('snooze', meeting.id, '2026-11-24T10:00', 5);
 focused = true;
 await advance(5);
 check('Put off by five minutes, it comes again, now as the page\'s card', [shown.length, sent.filter(([c, card]) => c === 'calendar:remind' && !card.quiet).length], [1, 1]);
 // A repeat: each time reminded once; a task ticked off for a day is not reminded that day.
 const pushups = (await call('add', { title: 'Отжимания', kind: 'task', date: '2026-11-24', time: '18:00', remind: 0, rule: { freq: 'daily' } })).item;
 await call('update', pushups.id, { doneKeys: ['2026-11-25T18:00'] });
 focused = false;
 now = new Date(2026, 10, 24, 17, 59).getTime(); await advance(1);
 now = new Date(2026, 10, 25, 17, 59).getTime(); await advance(1);
 now = new Date(2026, 10, 26, 17, 59).getTime(); await advance(1);
 check('Every day once; not on the day it was done', shown.filter(n => n.title.includes('Отжимания')).length, 2);
 // A reminder missed while the computer slept: it still comes if the thing has not begun, never when it is long past.
 const late = (await call('add', { title: 'Позвонить', kind: 'task', date: '2026-11-27', time: '12:00', remind: 30 })).item;
 const old = (await call('add', { title: 'Старое', kind: 'task', date: '2026-11-27', time: '09:00', remind: 0 })).item;
 now = new Date(2026, 10, 27, 11, 50).getTime(); await advance(0.1);
 check('Missed while asleep: comes if still useful, not if long past', [shown.some(n => n.title.includes('Позвонить')), shown.some(n => n.title.includes('Старое'))], [true, false]);
 void late; void old;
 // Tags kept, an entry's tag gone with its tag.
 const tags = (await call('tags', [{ name: 'Работа', tone: 'blue' }, { name: 'Здоровье', tone: 'green' }])).tags;
 const tagged = JSON.parse(JSON.stringify((await call('update', meeting.id, { tag: tags[0].id })).item));
 await call('tags', [tags[1]]);
 check('A tag taken away leaves its entries untagged', [tagged.tag === tags[0].id, Calendar._state().items.find(i => i.id === meeting.id).tag], [true, null]);
 check('Kept to the store as it is', store.calendar.items.length, Calendar._state().items.length);
 // Undo puts an entry back under its own id.
 const before = Calendar._state().items.find(i => i.id === pushups.id);
 await call('remove', pushups.id);
 await call('restore', before);
 check('An entry put back keeps its id and its days done', [Calendar._state().items.some(i => i.id === pushups.id), Calendar._state().items.find(i => i.id === pushups.id).doneKeys], [true, ['2026-11-25T18:00']]);
 check('An address that is not one', (await call('feed', { url: 'ftp://x' })).error, 'address');
 check('A calendar that cannot be read says so', (await call('feed', { url: 'https://calendar.example/x.ics' })).error, 'fetch');
 const failed = results.filter(result => !result.pass);
 for (const result of results) console.log(`${result.pass ? 'ok  ' : 'FAIL'} ${result.name}${result.pass ? '' : `\n     got      ${JSON.stringify(result.actual)}\n     expected ${JSON.stringify(result.expected)}`}`);
 console.log(`${results.length - failed.length}/${results.length} calendar keeper checks passed`);
 process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
