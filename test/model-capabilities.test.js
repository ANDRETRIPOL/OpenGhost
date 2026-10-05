'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function node() {
 const queries = new Map();
 return { attributes: {}, dataset: {}, children: [], style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} },
  setAttribute(k, v) { this.attributes[k] = String(v); }, removeAttribute(k) { delete this.attributes[k]; },
  querySelector(k) { if (!queries.has(k)) queries.set(k, node()); return queries.get(k); }, querySelectorAll: () => [], addEventListener() {},
  append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
  remove() {}, focus() {}, matches: () => false, setLevel(v) { this.level = v; }, setCount(v) { this.count = v; },
 };
}
async function page(models, saved = {}) {
 const storage = new Map(Object.entries(saved));
 const provider = { models: async () => models };
 const window = vm.createContext({ console, setTimeout, clearTimeout, AbortController, navigator: { language: 'en' },
  document: { createElement: node, addEventListener() {} },
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
  Providers: provider, matchMedia: () => ({ matches: true }), addEventListener() {}, ResizeObserver: class { observe() {} },
  LiquidGlass: class {}, EffortPaint: class {}, EffortMorph: class { setLevels() {} }, EffortStage: class { static nameOf(v) { return v; } }, Glyphs: { bars: '' },
 });
 window.window = window;
 for (const file of ['i18n.js', 'settings.js', 'chat.js', 'effort-slider.js', 'model-stage.js', 'stats-card.js', 'add-menu.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), window);
 window.Settings.prototype.build = function() {};
 window.Settings.prototype.pager = function() {};
 window.Settings.prototype.refreshAll = function() {};
 const settings = new window.Settings(node());
 settings.keys.deepseek = 'fixture'; await settings.refresh('deepseek'); settings.show(settings.resolve());
 const slider = new window.EffortSlider({ button: node(), panel: node(), settings });
 const stage = Object.assign(Object.create(window.ModelStage.prototype), { settings, list: node() });
 const conv = { record: { model: settings.resolve() }, messages: [], tokens: 250 };
 const chat = Object.assign(Object.create(window.Chat.prototype), { active: conv, settings });
 return { window, settings, storage, provider, slider, stage, conv, chat };
}
const model = (id = 'm', extra = {}) => ({ id, api: id, provider: 'deepseek', name: id, ...extra });

test('missing/empty/malformed effort metadata never invents choices, defaults or saved preference', async () => {
 for (const efforts of [undefined, null, [], '', 'high', true, {}, [null, false, 1, '', ' ']]) {
  const f = await page([model('m', { efforts, defaultEffort: 'high' })], { 'deepseek.effort': 'high' });
  assert.deepEqual(plain(f.settings.config.efforts), []); assert.equal(f.settings.config.effort, undefined);
  assert.equal(f.slider.button.hidden, true); f.slider.open(); assert.equal(f.slider.opened, false);
  assert.equal(f.slider.slider.attributes['aria-valuenow'], undefined);
  assert.equal(f.storage.get('deepseek.effort'), 'high');
 }
});

test('strict vision tri-state survives cache, settings and picker labels', async () => {
 const values = [undefined, null, '', 'true', 'false', 0, 1, [], {}, false, true];
 const f = await page(values.map((vision, i) => model(`m${i}`, { vision }))); f.stage.build();
 const cached = f.settings.readCatalog().deepseek;
 values.forEach((vision, i) => {
  const expected = typeof vision === 'boolean' ? vision : null, id = `m${i}`;
  assert.equal(f.settings.configFor(id).vision, expected); assert.equal(cached[i].vision, expected);
  const label = f.stage.rows[i].attributes['aria-label'];
  assert.equal(label, expected === null ? id : `${id}, ${f.window.I18n.t(expected ? 'model.vision' : 'model.text')}`);
 });
});

test('missing/invalid windows give no fullness, invented capacity, or automatic main/mini compaction', async () => {
 for (const context of [undefined, null, 0, -1, NaN, Infinity, '', '1000000', true, {}]) {
  const f = await page([model('m', { context })]);
  assert.equal(f.settings.windowOf('m'), 0); assert.equal(f.chat.fill, null); f.stage.build();
  assert.doesNotMatch(f.stage.rows[0].attributes['aria-label'], /context|1M|NaN|Infinity/i);
  const card = f.window.StatsCard.build({ context: { used: 250, window: f.settings.windowOf('m') } });
  assert.match(card.innerHTML, />—<\/span>/); assert.doesNotMatch(card.innerHTML, /NaN|Infinity|% full/);
  const compact = () => assert.fail('unknown window must not trigger automatic compaction');
  f.chat.compact = compact; await f.chat.compactIfNeeded(f.conv, { config: { id: 'm' } });
  const mini = Object.assign(Object.create(f.window.SideChat.prototype), { settings: f.settings, compact });
  await mini.compactIfNeeded(f.conv, { config: { id: 'm' } });
  const hints = {}; Object.defineProperty(f.chat, 'canCompact', { value: true });
  Object.assign(Object.create(f.window.AddMenu.prototype), { chat: f.chat, dock: { set: (id, value) => { hints[id] = value; } } }).sync();
  assert.equal(hints.compact.hint, f.window.I18n.t('add.compact'));
 }
 const f = await page([model('m', { context: 500 })]); assert.equal(f.chat.fill, 0.5);
 f.conv.tokens = 1000; let compacted = false; f.chat.compact = async () => { compacted = true; };
 await f.chat.compactIfNeeded(f.conv, { config: { id: 'm' } }); assert.ok(compacted);
});

test('explicit/default/custom efforts are preserved without silently saving a choice', async () => {
 const f = await page([model('a', { efforts: ['brief', 'deep'], defaultEffort: 'deep', context: 2000000 }), model('b', { efforts: ['brief', 'deep'] })]);
 assert.equal(f.settings.config.effort, 'deep'); assert.equal(f.settings.windowOf('a'), 2000000);
 assert.equal(f.storage.has('deepseek.effort'), false);
 f.settings.setModel('b'); f.settings.show('b');
 assert.equal(f.settings.config.effort, undefined); assert.equal(f.slider.button.hidden, false);
 assert.equal(f.slider.slider.attributes['aria-valuenow'], undefined);
 f.slider.commit(0); assert.equal(f.settings.config.effort, 'brief'); assert.equal(f.storage.get('deepseek.effort'), 'brief');
 f.settings.show('a'); assert.equal(f.settings.configFor('a').effort, 'brief');
 f.provider.models = async () => [model('a')]; await f.settings.refresh('deepseek');
 assert.equal(f.settings.configFor('a').effort, undefined); assert.equal(f.settings.configFor('a').vision, null);
 assert.equal(f.settings.windowOf('a'), 0); assert.equal(f.slider.button.hidden, true);
});

test('old inferred provider catalogs are invalidated, versioned catalogs round-trip', async () => {
 const f = await page([model('m')]);
 for (const saved of [{ deepseek: [model('old', { context: 1000000, vision: true })] }, { version: 3, providers: { deepseek: [model('old')] } }]) {
  f.storage.set('openghost.catalog', JSON.stringify(saved));
  assert.deepEqual(plain(f.settings.readCatalog().deepseek), []);
 }
 f.settings.saveCatalog(); assert.equal(JSON.parse(f.storage.get('openghost.catalog')).version, 4);
 assert.deepEqual(plain(f.settings.readCatalog()), plain(f.settings.catalog));
});
