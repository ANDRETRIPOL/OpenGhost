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
  { id: 'gpt', provider: 'chatgpt', api: 'gpt-fixture', efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'medium', fast: true },
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
 // Speed is a per-conversation opt-in, not a new effort level or a shared provider default.
 chat.active = a; chat.setModel('gpt');
 const initialEffort = chat.effort;
 check('Legacy chats start at standard speed', chat.speed === 'standard');
 check('A supported chat accepts Fast', chat.setSpeed('fast') && a.record.speed === 'fast');
 check('Fast never changes the selected effort', chat.effort === initialEffort);
 check('Another chat does not inherit Fast', chat.config(b).speed === 'standard');
 chat.active = b; chat.setSpeed('fast'); chat.active = a;
 const speedTurn = chat.begin(a, chat.config(a)); chat.active = b; chat.setSpeed('standard');
 check('Another chat cannot mutate a captured Fast turn', speedTurn.config.speed === 'fast' && chat.config(b).speed === 'standard');
 chat.active = a;
 check('A running chat cannot change speed', !chat.setSpeed('standard') && a.record.speed === 'fast');a.turn = null;
 a.locked = true;check('A locked chat cannot change speed', !chat.setSpeed('standard'));a.locked = false;
 check('Invalid speed choices are refused', !chat.setSpeed('ultrafast') && a.record.speed === 'fast');
 chat.setModel('deepseek');
 check('An unsupported model cannot activate Fast', !chat.setSpeed('fast') && chat.speed === 'standard');
 check('A model switch does not overwrite the saved speed preference', a.record.speed === 'fast');
 chat.setModel('gpt');check('Returning to a supported model restores the opted-in speed', chat.speed === 'fast');
 chat.newChat();check('A new chat starts at Standard, not the previous Fast', chat.speed === 'standard');
 chat.setSpeed('fast');chat.send('Fast fixture message');const fastDraftId = chat.activeId;
 check('The first send stores a draft’s Fast choice', chat.active.record.speed === 'fast');
 const speedFork = await lib.fork('a', { messages: [], tokens: 0 });
 check('A fork inherits its source speed', speedFork.speed === 'fast');
 chat.active = conv(speedFork);chat.setSpeed('standard');
 check('A fork’s later speed changes do not touch its parent', speedFork.speed === 'standard' && a.record.speed === 'fast');
 await lib.saveSide('a', { messages: [{ role: 'user', content: 'speed fixture' }], speed: 'fast', effort: 'medium' });
 c.window.Chat.prototype.activate = function (one) { this.active = one; };c.window.Chat.prototype.restore = function () {};
 const fastSide = new c.window.SideChat({ library: lib, origin: a, model: 'gpt', main: new Node(), thread: new Node(), bottom: new Node(), settings: s, onChange() {} });await fastSide.open('a');
 c.window.Chat.prototype.activate = beforeActivate;c.window.Chat.prototype.restore = beforeRestore;
 check('SideChat restores its own saved Fast preference', fastSide.speed === 'fast');
 fastSide.setSpeed('standard');await Promise.all([...lib.writes.values()]);
 check('Mini speed changes save only the mini preference', (await lib.side('a')).speed === 'standard' && a.record.speed === 'fast');
 check('Password protection seals mini speed metadata', await lib.protect('a', 'speed fixture password') && !!disk.get('mini/a').sealed);
 await lib.unlock('a', 'speed fixture password');
 check('Unlock preserves independent main and mini speeds', lib.chat('a').speed === 'fast' && (await lib.side('a')).speed === 'standard');
 await lib.unprotect('a');await lib.persist();
 const speedReload = new c.window.Library(store, () => {});await speedReload.ready;
 check('Saved Fast and Standard choices survive a fresh library', speedReload.chat('a').speed === 'fast' && speedReload.chat(speedFork.id).speed === 'standard' && speedReload.chat(fastDraftId).speed === 'fast');
 clearTimeout(speedReload.timer);clearTimeout(restarted.timer);
 // Dynamic geometry uses the actual slider methods, independently of storage or the selected effort.
 const geometryWrites = [], resizer = Object.create(c.window.EffortSlider.prototype);
 Object.assign(resizer, { fastSupported: true, efforts: ['none', 'low', 'medium', 'high'], pos: 0, panel: { style: { setProperty: (key, value) => geometryWrites.push([key, value]) } } });
 resizer.updateCompact();check('The approved minimum starts at full capsule size', resizer.compact === 0);
 for (const [pos, expected] of [[.25,.1563],[.5,.5],[.75,.8438],[1,1],[2,1],[3,1]]) {
  resizer.pos = pos;resizer.updateCompact();check('Capsule follows the continuous lens position '+pos, resizer.compact === expected);
 }
 const geometryCount = geometryWrites.length;
 check('A settled capsule does not rewrite layout on every frame', !resizer.updateCompact() && geometryWrites.length === geometryCount);
 for (const [pos, expected] of [[.75,.8438],[.5,.5],[.25,.1563],[0,0]]) {
  resizer.pos = pos;resizer.updateCompact();check('Reversing midway restores the capsule at '+pos, resizer.compact === expected);
 }
 for (let levels = 2; levels <= 10; levels++) {
  resizer.efforts = Array(levels).fill('level');let safe = true;
  for (let n = 0; n <= 300; n++) {resizer.pos = (levels-1)*n/300;resizer.updateCompact();const q=resizer.compact,t=resizer.pos/(levels-1);if(18-14*q+(192-18*q)*t-18 < -.001)safe=false;}
  check(levels+' levels keep the moving lens clear of the bolt',safe);
 }
 resizer.fastSupported=false;resizer.updateCompact();check('Models without Fast keep their original geometry',resizer.compact===0);
 resizer.fastSupported=true;resizer.efforts=['none'];resizer.pos=0;resizer.updateCompact();check('Fast-only controls do not compress a nonexistent track',resizer.compact===0);
 resizer.efforts=['none','low','medium','high'];
 for (const layout of [{left:100,slider:232,inset:18,track:192,scale:1},{left:132,slider:200,inset:4,track:174,scale:1.5}]) {
  resizer.slider={offsetWidth:layout.slider,getBoundingClientRect:()=>({left:layout.left,width:layout.slider*layout.scale})};resizer.geo={left:layout.inset,width:layout.track};resizer.drag={offset:6};
  for(const pos of [0,1,2,3]){const clientX=layout.left+(layout.inset+layout.track*pos/3+6)*layout.scale;check('Pixel grab stays attached at '+layout.track+'px / level '+pos,Math.abs(resizer.pointerPos({clientX})-pos)<1e-9);}
 }
 vm.runInContext(read('effort-paint.js'),c);
 const puffA={x:40,y:12,r:14,phase:[1,2,3]},puffB={x:280,y:36,r:15,phase:[4,5,6]},puffs=[puffA,puffB],paint=Object.create(c.window.EffortPaint.prototype);
 Object.assign(paint,{puffs,geo:{end:288,height:48}});paint.layoutCloud({end:320,height:48});
 check('Resizing keeps existing paint shapes rather than regenerating them',paint.puffs===puffs&&paint.puffs[0]===puffA&&paint.puffs[1]===puffB);
 check('Paint positions follow the new width without resetting phase or radius',Math.abs(puffA.x-36)<1e-9&&Math.abs(puffB.x-252)<1e-9&&puffA.r===14&&puffB.phase[1]===5);
 paint.geo={end:320,height:48};paint.layoutCloud({end:288,height:48});check('Expanding back restores paint positions without flicker',Math.abs(puffA.x-40)<1e-9&&Math.abs(puffB.x-280)<1e-9);
 console.log(`\n${count} checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
