'use strict';
// Real Settings, Chat, Library, SideChat and EffortSlider methods. Storage and view-only DOM are fixtures.
// No app profile, network, model or agent command is touched.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
let count = 0;
const check = (name, value) => { assert.ok(value, name); count++; console.log('ok  ' + name); };
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
class Node {
 constructor() { this.attributes = {}; this.children = []; this.classList = { add() {}, remove() {}, toggle() {} }; this.isConnected = true; }
 addEventListener() {} querySelector() { return null; } querySelectorAll() { return []; }
 append(...items) { this.children.push(...items); } replaceChildren(...items) { this.children = items; }
 setAttribute(k, v) { this.attributes[k] = String(v); } toggleAttribute() {} setLevel(i) { this.level = i; } setCount() {}
}
async function main() {
 const kept = new Map([['deepseek.effort', 'xhigh']]); let globalWrites = 0, sharedEffortWrites = 0;
 const c = { window: {}, console, setTimeout, clearTimeout, AbortController, TextEncoder, TextDecoder, Uint8Array, btoa, atob,
  crypto: require('node:crypto').webcrypto, localStorage: { getItem: key => kept.get(key) ?? null, setItem: (key, value) => { globalWrites++; if (key === 'deepseek.effort') sharedEffortWrites++; kept.set(key, String(value)); } },
  I18n: { t: (key, p) => p?.name || key }, Skills: { blocks: () => '' }, Usage: { parts: () => null }, Providers: {},
  document: { createElement: () => new Node() }, ResizeObserver: class { observe() {} unobserve() {} }, RowGlide: class {},
  MessageFold: { settle() {} }, EffortStage: { nameOf: value => value }, Glyphs: {},
 };
 vm.createContext(c);
 for (const file of ['settings.js', 'chat-lock.js', 'library.js', 'agent-plan.js', 'plan-proof.js', 'chat.js', 'effort-slider.js']) {
  vm.runInContext(read(file), c); for (const name of ['ChatLock', 'AgentPlan', 'PlanProof']) if (c.window[name]) c[name] = c.window[name];
 }
 const models = [
  { id: 'gpt', provider: 'chatgpt', api: 'gpt-fixture', efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium' },
  { id: 'claude', provider: 'anthropic', api: 'claude-fixture', efforts: ['low', 'medium', 'high', 'max'], defaultEffort: 'high' },
  { id: 'deepseek', provider: 'deepseek', api: 'deepseek-fixture', efforts: ['low', 'high', 'max'], defaultEffort: 'high' },
 ];
 function settings() {
  const s = Object.create(c.window.Settings.prototype);
  Object.assign(s, { models: copy(models), model: 'gpt', shown: '', effort: 'high', legacyEffort: 'xhigh', efforts: ['low', 'medium', 'high', 'xhigh'], keys: {}, hand: { custom: {} }, connected: () => true });
  return s;
 }
 const s = settings();
 check('An explicit chat level is used', s.configFor('gpt', 'low').effort === 'low');
 check('A new chat starts at its model default', s.configFor('gpt').effort === 'medium');
 check('Another model has its own default', s.configFor('claude').effort === 'high');
 s.setEffort('low');
 check('A view-only setting cannot change a new chat’s default', s.configFor('gpt').effort === 'medium');
 check('No shared effort is written', globalWrites === 0 && kept.get('deepseek.effort') === 'xhigh');
 s.show('claude'); s.show('gpt');
 check('Switching provider does not overwrite the legacy preference', globalWrites === 0 && s.legacyEffort === 'xhigh');
 check('An unsupported level falls back only for the requested model', s.configFor('claude', 'xhigh').effort === 'high' && s.configFor('gpt', 'xhigh').effort === 'xhigh');

 const records = [{ id: 'a', model: 'gpt', effort: 'xhigh', title: 'A', folder: 'C:\\fixture', updated: 1 }, { id: 'b', model: 'gpt', effort: 'low', title: 'B', folder: 'C:\\fixture', updated: 1 }, { id: 'c', model: 'claude', effort: 'max', title: 'C', folder: 'C:\\fixture', updated: 1 }, { id: 'legacy', model: 'gpt', title: 'Legacy', folder: 'C:\\fixture', updated: 1 }];
 const disk = new Map([['index', { chats: records, folders: [{ path: 'C:\\fixture', name: 'fixture' }] }]]);
 const store = { read: async key => copy(disk.get(key)), write: async (key, value) => disk.set(key, copy(value)), remove: async key => disk.delete(key) };
 const lib = new c.window.Library(store, () => {}); await lib.ready;
 const conv = (record = null) => ({ record, get id() { return this.record?.id || ''; }, model: '', effort: '', folder: { path: 'C:\\fixture', name: 'fixture' }, messages: [], tokens: 0, list: new Node() });
 const a = conv(lib.chat('a')), b = conv(lib.chat('b')), other = conv(lib.chat('c'));
 const chat = Object.create(c.window.Chat.prototype);
 Object.assign(chat, { settings: s, library: lib, active: a, opening: 0, conversations: new Map(), nodes: new WeakMap(), main: new Node(), onChange() {}, activate(one) { this.active = one; }, restore() {} });
 check('Two chats of the same GPT retain different efforts', chat.config(a).effort === 'xhigh' && chat.config(b).effort === 'low');
 check('Changing A succeeds', chat.setEffort('high'));
 check('Changing A never changes B or the other provider', a.record.effort === 'high' && b.record.effort === 'low' && other.record.effort === 'max');
 chat.active = b; chat.setEffort('medium'); chat.active = a;
 check('Returning to A restores its own level', chat.effort === 'high' && chat.config(b).effort === 'medium');
 s.show('claude'); s.setEffort('max'); s.show('gpt');
 check('Provider UI updates do not alter chat configs', chat.config(a).effort === 'high' && chat.config(b).effort === 'medium');
 check('Invalid levels are refused, not silently saved', !chat.setEffort('invented') && a.record.effort === 'high');
 a.turn = {};
 check('A running chat cannot change its effort', !chat.setEffort('low') && a.record.effort === 'high'); a.turn = null;
 a.locked = true;
 check('A locked chat cannot change its effort', !chat.setEffort('low') && a.record.effort === 'high'); a.locked = false;
 const running = chat.begin(a, chat.config(a)); chat.active = b; chat.setEffort('low');
 check('Another chat never mutates an already captured request', running.config.effort === 'high' && chat.config(b).effort === 'low'); a.turn = null;
 check('A routine without an override uses its own chat', chat.routineConfig(a, {}).effort === 'high');
 check('An explicit routine effort is still respected', chat.routineConfig(a, { effort: 'medium' }).effort === 'medium');
 check('An unsupported routine override falls back to its chat', chat.routineConfig(a, { effort: 'max' }).effort === 'high');

 chat.active = a; chat.hasHistory = () => false; chat.setEffort('xhigh'); chat.setModel('claude');
 check('Switching A’s model uses a compatible level without touching B', chat.config(a).effort === 'high' && chat.config(b).effort === 'low');
 chat.setModel('gpt');
 check('Switching back recovers A’s stored supported level', chat.config(a).effort === 'xhigh');
 chat.draft = conv(); chat.draft.effort = 'low'; chat.newChat();
 check('A new chat uses the last manually selected model', chat.model === 'gpt');
 check('A fresh draft starts at the model default, not another chat’s effort', chat.effort === 'medium');
 check('The draft accepts its own choice', chat.setEffort('low') && chat.active.effort === 'low');
 check('Editing a draft cannot change saved chats', chat.config(a).effort === 'xhigh' && chat.config(b).effort === 'low');
 chat.active = a; chat.setModel('claude'); chat.active = b; chat.newChat();
 check('Opening an old GPT does not replace the last picked Claude default', chat.model === 'claude');
 check('A new provider’s draft starts at that model’s default', chat.effort === 'high');
 chat.setEffort('max'); const draft = chat.active; let sent;
 Object.assign(chat, { forget() {}, userMessage: () => new Node(), run: (one, prompt, config) => { sent = { id: one.id, effort: config.effort }; }, followBottom() {} });
 check('The first real send succeeds', chat.send('fixture message'));
 check('The first send stores model and effort on the chat', draft.record.model === 'claude' && draft.record.effort === 'max' && sent.effort === 'max');
 await lib.persist();
 const restarted = new c.window.Library(store, () => {}); await restarted.ready;
 check('Restart preserves distinct efforts in the actual index', restarted.chat('a').effort === 'xhigh' && restarted.chat('b').effort === 'low' && restarted.chat(sent.id).effort === 'max');
 const legacy = conv(lib.chat('legacy'));
 check('A legacy chat initially uses the frozen pre-update preference', chat.config(legacy).effort === 'xhigh');
 await chat.load(legacy);
 check('Loading a legacy chat migrates its preference to its own record', legacy.record.effort === 'xhigh');
 s.legacyEffort = 'low';
 check('A migrated chat no longer depends on the old default', chat.config(legacy).effort === 'xhigh');
 const reread = settings(); Object.assign(reread, { accepted: new Set(), readKeys: () => ({}), readHand: () => ({ custom: {} }), readCatalog: () => ({}), has: () => false, changed() {}, syncAccount: async () => {} });
 reread.effort = 'medium'; await reread.reread();
 check('Quick-window reread never imports the old shared effort', reread.effort === 'medium' && reread.legacyEffort === 'xhigh');
 vm.runInContext(read('routine-panel.js').replace('window.RoutinePanel = RoutinePanel;', 'window.effortAudit = { draftOf }; window.RoutinePanel = RoutinePanel;'), c);
 const draftRoutine = c.window.effortAudit.draftOf;
 s.effort = 'max';
 check('A routine editor starts from its chat, not the shared view', draftRoutine(null, s, 'gpt', 'low').effort === 'low');
 check('A new standalone routine uses its model default', draftRoutine(null, s, 'gpt').effort === 'medium');
 check('Editing a routine retains its explicit effort', draftRoutine({ effort: 'high' }, s, 'gpt', 'low').effort === 'high');
 const routineCalls = []; c.Routines = { add: async args => { routineCalls.push(args); return { item: { id: 'r-fixture', ...args } }; }, update: async (id, args) => ({ item: { id, ...args } }) };
 const panel = Object.create(c.window.RoutinePanel.prototype);
 Object.assign(panel, { mode: 'chat', conv: a, chat, settings: s, editor: { summary: {} }, list: new Node(), show() {} }); chat.markRoutine = () => {};
 await panel.save({ text: 'fixture routine', rule: { kind: 'daily', time: '09:00' } }, null);
 check('Creating a routine records the actual chat effort', routineCalls[0].effort === chat.config(a).effort);
 const modelBeforeRoutine = a.record.model;
 await panel.save({ text: 'fixture routine', rule: {}, model: 'gpt', effort: 'medium' }, { id: 'r-fixture', own: true });
 check('Editing a dedicated routine updates only its own chat preference', a.record.effort === 'medium' && b.record.effort === 'low');
 lib.update('a', { model: modelBeforeRoutine, effort: 'xhigh' });
 const originalCatalog = s.models; s.models = [];
 const unavailable = conv({ id: 'unavailable', model: 'gpt', folder: 'C:\\fixture' });
 lib.chats.push(unavailable.record); s.legacyEffort = 'xhigh'; await chat.load(unavailable); s.models = originalCatalog;
 check('Migration before a catalog loads does not lose a valid level', unavailable.record.effort === 'xhigh' && chat.config(unavailable).effort === 'xhigh');
 const fork = await lib.fork('a', { messages: [], tokens: 0 });
 check('A fork starts with the source chat’s effort', fork.effort === 'xhigh');
 chat.active = conv(fork); chat.setEffort('low');
 check('A fork’s later effort changes remain independent', fork.effort === 'low' && a.record.effort === 'xhigh');

 await lib.saveSide('a', { messages: [{ role: 'user', content: 'side' }], seen: 999, effort: 'low' });
 check('The mini-chat storage carries its own effort', (await lib.side('a')).effort === 'low');
 const beforeActivate = c.window.Chat.prototype.activate, beforeRestore = c.window.Chat.prototype.restore;
 c.window.Chat.prototype.activate = function (one) { this.active = one; };
 c.window.Chat.prototype.restore = function () {};
 const side = new c.window.SideChat({ library: lib, origin: a, model: 'gpt', effort: 'xhigh', main: new Node(), thread: new Node(), bottom: new Node(), settings: s, onChange() {} });
 await side.open('a');
 check('SideChat restores its stored effort rather than the parent’s new one', side.effort === 'low' && a.record.effort === 'xhigh');
 side.setEffort('medium'); await Promise.all([...lib.writes.values()]);
 check('A mini-chat change saves only the mini-chat effort', (await lib.side('a')).effort === 'medium' && a.record.effort === 'xhigh');
 const sideAgain = new c.window.SideChat({ library: lib, origin: a, model: 'gpt', effort: 'high', main: new Node(), thread: new Node(), bottom: new Node(), settings: s, onChange() {} });
 await sideAgain.open('a');
 check('Reopening a mini-chat retains its own effort', sideAgain.effort === 'medium');
 c.window.Chat.prototype.activate = beforeActivate; c.window.Chat.prototype.restore = beforeRestore;
 const sideFork = await lib.fork('a', { messages: [], tokens: 0 });
 check('A fork also keeps the mini-chat’s initial effort', (await lib.side(sideFork.id)).effort === 'medium');
 check('Password protection still seals mini-chat effort', await lib.protect('a', 'fixture password') && !!disk.get('mini/a').sealed);
 check('Unlocking preserves main and mini-chat preferences', await lib.unlock('a', 'fixture password') && lib.chat('a').effort === 'xhigh' && (await lib.side('a')).effort === 'medium');
 check('Removing the password preserves both efforts', await lib.unprotect('a') && (await lib.side('a')).effort === 'medium');

 chat.active = a; chat.setModel('gpt');
 const slider = Object.create(c.window.EffortSlider.prototype), button = new Node(), track = new Node();
 Object.assign(slider, { chat, settings: s, scope: a, button, slider: track, efforts: models[0].efforts.slice(), opened: false, morph: { setLevels() {} }, fillTicks() {}, close() { this.opened = false; this.closedForSwitch = true; }, syncPaint() {}, wake() {} });
 chat.active = a; let writes = 0;
 const update = lib.update.bind(lib); lib.update = (id, changes) => { if ('effort' in changes) writes++; return update(id, changes); };
 slider.follow();
 check('Follow shows A’s level and accessible label', slider.value === 3 && track.attributes['aria-valuetext'] === 'xhigh' && button.attributes.label === 'xhigh');
 check('Following a chat never persists a choice', writes === 0);
 chat.active = b; slider.follow();
 check('A same-model chat switch restores B’s different value', slider.value === 0 && track.attributes['aria-valuenow'] === '0');
 check('A same-model switch is read-only', writes === 0);
 check('A real slider selection is accepted', slider.commit(1));
 check('A slider selection writes only the owning chat', writes === 1 && b.record.effort === 'medium' && a.record.effort === 'xhigh');
 chat.active = other; slider.follow();
 check('A provider switch changes slider range without writing either chat', slider.value === 3 && track.attributes['aria-valuetext'] === 'max' && writes === 1);
 slider.opened = true; chat.active = a; slider.follow();
 check('An open slider closes when its chat changes', slider.closedForSwitch && slider.value === 3 && writes === 1);
 slider.locked = true; slider.moveTo(0);
 check('Locked slider input cannot change the chat', a.record.effort === 'xhigh' && writes === 1);
 check('The shared legacy storage key was never rewritten', sharedEffortWrites === 0 && kept.get('deepseek.effort') === 'xhigh');
 await lib.persist(); clearTimeout(restarted.timer);
 console.log(`\n${count} checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
