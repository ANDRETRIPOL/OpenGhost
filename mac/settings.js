(() => {
'use strict';

const STORAGE = { effort: 'deepseek.effort', mode: 'openghost.mode', model: 'openghost.model', catalog: 'openghost.catalog', custom: 'openghost.custom' };
// Where the page kept keys before they moved to the main process, and where they stay on the web, which has no main process.
const KEYS = { openai: 'openai.apiKey', anthropic: 'anthropic.apiKey', deepseek: 'deepseek.apiKey' };
// On the desktop, keys live in the main process, encrypted with the OS keychain.
const vault = window.openghost?.keys || null;
// The order providers appear in, in the settings and in the model picker.
const ORDER = ['chatgpt', 'openai', 'anthropic', 'deepseek', 'custom'];
const DEFAULT_MODEL = 'deepseek-flash';
const EFFORTS = ['none', 'low', 'high', 'max'];
const DEFAULT_EFFORT = 'high';
const DEFAULT_CONTEXT = 1000000;
// A local server rarely says how much its model holds; this is the window assumed until the settings say otherwise.
const CUSTOM_CONTEXT = 32768;
// Shown until a key loads the real list, so the picker works before the first check.
const KNOWN_DEEPSEEK = [
 { id: 'deepseek-flash', api: 'deepseek-flash', provider: 'deepseek', name: 'DeepSeek-V4.1-Flash', context: 1048576, efforts: EFFORTS, defaultEffort: DEFAULT_EFFORT, vision: true },
 { id: 'deepseek-v4-pro', api: 'deepseek-v4-pro', provider: 'deepseek', name: 'DeepSeek-V4-Pro', context: 1048576, efforts: EFFORTS, defaultEffort: DEFAULT_EFFORT, vision: false },
];
const LINKS = {
 openai: ['https://platform.openai.com/api-keys', 'platform.openai.com'],
 anthropic: ['https://console.anthropic.com/settings/keys', 'console.anthropic.com'],
 deepseek: ['https://platform.deepseek.com/api_keys', 'platform.deepseek.com'],
};
// Ready-made settings for the servers people run most. A preset fills the fields in; every field stays free to change.
const PRESETS = [
 { id: 'deepseek', name: 'DeepSeek Cloud', baseURL: OpenAICompat.DEEPSEEK_URL, model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'], context: 128000 },
 { id: 'ollama', name: 'Ollama', baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen2.5-coder:14b', models: [], context: CUSTOM_CONTEXT },
 { id: 'local', name: 'Custom local', baseURL: 'http://127.0.0.1:8080/v1', model: '', models: [], context: CUSTOM_CONTEXT },
];
const MODES = ['ask', 'auto', 'full'];
const DEFAULT_MODE = 'ask';
const CHECK_DELAY = 400;

const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function keyRow(provider) {
 const [href, host] = LINKS[provider];
 const note = I18n.has(`settings.${provider}.note`) ? ` ${escapeHtml(I18n.t(`settings.${provider}.note`))}` : '';
 return `
  <div class="settings-row">
   <div class="settings-text">
    <label class="settings-label" for="settings-key-${provider}">${escapeHtml(I18n.t(`settings.${provider}.key`))}</label>
    <p class="settings-hint"><span>${escapeHtml(I18n.t(`settings.${provider}.hint`))}</span> <a href="${href}" target="_blank" rel="noopener noreferrer">${host}</a>.${note}</p>
   </div>
   <div class="settings-control">
    <input id="settings-key-${provider}" class="settings-key" data-provider="${provider}" type="text" placeholder="${provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}" autocomplete="off" spellcheck="false">
    <p class="settings-status" data-provider="${provider}" role="status"></p>
   </div>
  </div>`;
}

function accountRow() {
 return `
  <div class="settings-row">
   <div class="settings-text">
    <span class="settings-label">${escapeHtml(I18n.t('settings.chatgpt.label'))}</span>
    <p class="settings-hint">${escapeHtml(I18n.t('settings.chatgpt.hint'))}</p>
   </div>
   <div class="settings-control settings-account">
    <div class="settings-account-row">
     <span class="settings-account-who"></span>
     <button type="button" class="settings-button is-primary" data-action="login">${escapeHtml(I18n.t('settings.chatgpt.login'))}</button>
     <button type="button" class="settings-button" data-action="cancel">${escapeHtml(I18n.t('settings.chatgpt.cancel'))}</button>
     <button type="button" class="settings-button" data-action="logout">${escapeHtml(I18n.t('settings.chatgpt.logout'))}</button>
    </div>
    <p class="settings-status" data-provider="chatgpt" role="status"></p>
   </div>
  </div>`;
}

// The custom server: a row of presets, then the address, the key, the model and the context window, each a plain field.
function customRows() {
 const row = (label, hint, control) => `
  <div class="settings-row">
   <div class="settings-text">
    ${label}
    <p class="settings-hint">${escapeHtml(hint)}</p>
   </div>
   <div class="settings-control">${control}</div>
  </div>`;
 const labelFor = name => `<label class="settings-label" for="settings-custom-${name}">${escapeHtml(I18n.t(`settings.custom.${name}`))}</label>`;
 // The key gets the masking the other key fields have; the rest are read back as typed.
 const field = (name, type, attributes = '') => `<input id="settings-custom-${name}" class="settings-field${name === 'key' ? ' settings-key' : ''}" data-field="${name}" type="${type}" autocomplete="off" spellcheck="false" ${attributes}>`;
 const chips = PRESETS.map(preset => `<button type="button" class="settings-chip" data-preset="${preset.id}" aria-pressed="false">${escapeHtml(preset.name)}</button>`).join('');
 return [
  row(`<span class="settings-label">${escapeHtml(I18n.t('settings.custom.preset'))}</span>`, I18n.t('settings.custom.preset.hint'),
   `<div class="settings-chips" role="group" aria-label="${escapeHtml(I18n.t('settings.custom.preset'))}">${chips}</div>`),
  row(labelFor('baseURL'), I18n.t('settings.custom.baseURL.hint'),
   field('baseURL', 'url', `placeholder="${escapeHtml(OpenAICompat.DEEPSEEK_URL)}"`) + '<p class="settings-status" data-provider="custom" role="status"></p>'),
  row(labelFor('key'), I18n.t('settings.custom.key.hint'), field('key', 'text')),
  row(labelFor('model'), I18n.t('settings.custom.model.hint'), field('model', 'text', 'list="settings-custom-models"') + '<datalist id="settings-custom-models"></datalist>'),
  row(labelFor('context'), I18n.t('settings.custom.context.hint'), field('context', 'number', 'min="1024" step="1024"')),
 ].join('');
}

function section(id, name, rows) {
 return `
  <section class="provider" data-provider="${id}" aria-labelledby="provider-${id}">
   <header class="provider-head">
    <h3 class="provider-name" id="provider-${id}">${escapeHtml(name)}</h3>
    <span class="provider-models"></span>
    <span class="provider-state"></span>
   </header>
   ${rows}
  </section>`;
}

class Settings {
 constructor(dialog) {
  this.dialog = dialog;
  this.list = dialog.querySelector('.settings-providers');
  this.keys = Object.fromEntries(Object.entries(KEYS).map(([provider, key]) => [provider, localStorage.getItem(key) || '']));
  this.custom = this.readCustom();
  this.account = { connected: false };
  this.catalog = this.readCatalog();
  this.models = [];
  this.efforts = EFFORTS.slice();
  localStorage.removeItem('deepseek.model');
  this.model = localStorage.getItem(STORAGE.model) || DEFAULT_MODEL;
  this.shown = this.model;
  const effort = localStorage.getItem(STORAGE.effort);
  this.effort = typeof effort === 'string' && effort ? effort : DEFAULT_EFFORT;
  const mode = localStorage.getItem(STORAGE.mode);
  this.mode = MODES.includes(mode) ? mode : DEFAULT_MODE;
  this.checks = {};
  this.checked = new Set();
  // Keys and a server saved in an earlier session count as working until a check says otherwise.
  this.accepted = new Set(this.configured());
  this.build();
  this.collect();
  dialog.addEventListener('dismiss', () => dialog.close());
  this.ready = this.unlock().then(() => this.refreshAll());
 }

 // On the desktop the keys come from the main process. Keys the page kept before this move there and leave the page's storage.
 async unlock() {
  if (!vault) return;
  let stored;
  try { stored = await vault.read(); } catch { return; }
  const moved = [];
  const take = (name, kept) => {
   if (kept && !stored[name]) {
    stored[name] = kept;
    moved.push(name);
   }
  };
  for (const [provider, name] of Object.entries(KEYS)) {
   take(provider, localStorage.getItem(name));
   localStorage.removeItem(name);
  }
  take('custom', this.custom.key);
  for (const provider of Object.keys(KEYS)) {
   this.keys[provider] = stored[provider] || '';
   this.inputs[provider].value = this.keys[provider];
  }
  this.custom.key = stored.custom || '';
  this.fields.key.value = this.custom.key;
  this.saveCustom();
  await Promise.all(moved.map(name => vault.write(name, stored[name]).catch(() => {})));
  this.accepted = new Set(this.configured());
  this.paintCustom();
  this.changed();
 }

 // A key goes to the main process on the desktop; on the web it stays in the page's storage, the custom one inside its settings.
 storeKey(name, key) {
  if (vault) {
   vault.write(name, key).catch(() => {});
   return;
  }
  if (name === 'custom') return;
  if (key) localStorage.setItem(KEYS[name], key);
  else localStorage.removeItem(KEYS[name]);
 }

 readCatalog() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE.catalog)) || {}; } catch {}
  return { chatgpt: [], openai: [], anthropic: [], found: [], ...saved, deepseek: saved.deepseek?.length ? saved.deepseek : KNOWN_DEEPSEEK.slice() };
 }

 saveCatalog() {
  try { localStorage.setItem(STORAGE.catalog, JSON.stringify(this.catalog)); } catch {}
 }

 readCustom() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE.custom)) || {}; } catch {}
  const text = value => typeof value === 'string' ? value.trim() : '';
  return { baseURL: text(saved.baseURL), key: text(saved.key), model: text(saved.model), context: Math.max(0, Math.round(Number(saved.context))) || 0 };
 }

 // The page's storage holds the address, the model and the window; the key too only on the web.
 saveCustom() {
  const { key, ...plain } = this.custom;
  const saved = vault ? plain : this.custom;
  if (Object.values(saved).some(Boolean)) localStorage.setItem(STORAGE.custom, JSON.stringify(saved));
  else localStorage.removeItem(STORAGE.custom);
 }

 // Whether anything at all is filled in for the custom server; with nothing, the section stays out of the picker.
 customSet() {
  return !!(this.custom.baseURL || this.custom.key || this.custom.model);
 }

 // The server as it is called: an empty address means DeepSeek, an empty key on a local address means none is needed.
 get endpoint() {
  return { baseURL: OpenAICompat.normalize(this.custom.baseURL), key: this.custom.key, kind: 'custom' };
 }

 // The preset the address matches, if any.
 preset() {
  const { baseURL } = this.endpoint;
  return PRESETS.find(preset => OpenAICompat.normalize(preset.baseURL) === baseURL) || null;
 }

 // The providers with something to check: every key that is set, and the custom server once it is filled in.
 configured() {
  return [...Object.keys(KEYS).filter(provider => this.keys[provider]), ...(this.customSet() ? ['custom'] : [])];
 }

 // What a provider's model list is asked with.
 auth(provider) {
  return provider === 'custom' ? { key: this.custom.key, baseURL: this.endpoint.baseURL } : { key: this.keys[provider] };
 }

 connected(provider) {
  if (provider === 'chatgpt') return !!this.account.connected;
  if (provider === 'custom') return this.customSet();
  return !!this.keys[provider];
 }

 // The badge turns green only once the provider has taken the key, so a mistyped key never looks connected.
 working(provider) {
  return this.connected(provider) && (provider === 'chatgpt' || this.accepted.has(provider));
 }

 // The custom server's rows: the model named in the settings first, then whatever the server listed, then the preset's own.
 customModels() {
  const preset = this.preset(), host = OpenAICompat.hostOf(this.endpoint.baseURL);
  const rows = new Map();
  const add = (api, found = {}) => {
   if (!api || rows.has(api)) return;
   rows.set(api, {
    id: `custom:${api}`,
    provider: 'custom',
    api,
    name: found.name || api,
    host,
    context: this.custom.context || found.context || preset?.context || CUSTOM_CONTEXT,
    efforts: ['none'],
    defaultEffort: 'none',
    vision: found.vision === true,
   });
  };
  add(this.custom.model);
  for (const found of this.catalog.found) add(found.id, found);
  if (!rows.size) for (const api of preset?.models || []) add(api);
  return [...rows.values()];
 }

 // The picker offers the models of every connected provider; with none connected it shows DeepSeek, the app's own default.
 collect() {
  this.catalog.custom = this.customModels();
  const models = ORDER.filter(provider => this.connected(provider)).flatMap(provider => this.catalog[provider] || []);
  this.models = models.length ? models : KNOWN_DEEPSEEK.slice();
  this.paint();
 }

 find(id) {
  return this.models.find(item => item.id === id) || null;
 }

 // A chat keeps its own model; one that is no longer offered falls back to the model new chats get.
 // Chats started before this was fixed kept the provider's model name rather than the picker's id, so that name is looked up too.
 resolve(id) {
  if (id && this.find(id)) return id;
  const named = id && this.models.find(item => item.api === id);
  if (named) return named.id;
  return this.find(this.model) ? this.model : this.models[0]?.id || DEFAULT_MODEL;
 }

 configFor(id) {
  const model = this.find(id) || KNOWN_DEEPSEEK.find(item => item.id === id) || null;
  const provider = model?.provider || 'deepseek';
  const efforts = model?.efforts?.length ? model.efforts : EFFORTS;
  const effort = efforts.includes(this.effort) ? this.effort : [model?.defaultEffort, DEFAULT_EFFORT].find(level => efforts.includes(level)) || efforts[efforts.length - 1];
  return {
   provider,
   model: model?.api || id,
   name: model?.name || id,
   host: model?.host || '',
   key: provider === 'custom' ? this.custom.key : this.keys[provider] || '',
   endpoint: provider === 'custom' ? this.endpoint : null,
   ready: this.connected(provider),
   effort,
   efforts,
   vision: model?.vision !== false,
   thinking: model?.thinking,
   output: model?.output,
  };
 }

 get config() {
  return this.configFor(this.resolve(this.model));
 }

 windowOf(id) {
  return this.find(id)?.context || DEFAULT_CONTEXT;
 }

 // The effort steps follow the model of the chat on screen.
 show(id) {
  if (id === this.shown) return;
  this.shown = id;
  this.applyEfforts();
 }

 applyEfforts() {
  const model = this.find(this.shown);
  const efforts = model?.efforts?.length ? model.efforts : EFFORTS;
  const same = efforts.length === this.efforts.length && efforts.every((level, i) => level === this.efforts[i]);
  this.efforts = efforts.slice();
  if (!efforts.includes(this.effort)) {
   const fallback = [model?.defaultEffort, DEFAULT_EFFORT].find(level => efforts.includes(level));
   this.effort = fallback || efforts[Math.min(efforts.length - 1, 2)];
   localStorage.setItem(STORAGE.effort, this.effort);
  }
  if (!same) this.onEfforts?.(this.efforts);
 }

 setModel(id) {
  if (id === this.model || !this.find(id)) return;
  this.model = id;
  localStorage.setItem(STORAGE.model, id);
 }

 setEffort(value) {
  this.effort = value;
  localStorage.setItem(STORAGE.effort, value);
 }

 setMode(value) {
  if (!MODES.includes(value)) return;
  this.mode = value;
  localStorage.setItem(STORAGE.mode, value);
 }

 changed() {
  this.collect();
  this.applyEfforts();
  this.onModels?.();
 }

 async refreshAll() {
  await this.syncAccount();
  await Promise.all(this.configured().map(provider => this.check(provider)));
 }

 // A sign-in can lapse while the app runs, so the settings ask how it stands each time they open.
 async syncAccount() {
  const auth = window.openghost?.auth;
  if (!auth || this.account.waiting) return;
  const account = await auth.status().catch(() => null);
  if (account && !this.account.waiting) this.setAccount(account);
 }

 // Loads a provider's models into the catalog; the last request for a provider wins.
 async refresh(provider) {
  const token = (this.checks[provider] = (this.checks[provider] || 0) + 1);
  const models = await Providers.models(provider, this.auth(provider));
  if (token !== this.checks[provider]) return false;
  if (provider === 'custom') this.catalog.found = models;
  else this.catalog[provider] = models.length || provider !== 'deepseek' ? models : KNOWN_DEEPSEEK.slice();
  this.saveCatalog();
  this.changed();
  return true;
 }

 build() {
  this.list.innerHTML = [
   section('openai', 'OpenAI', accountRow() + keyRow('openai')),
   section('anthropic', 'Anthropic', keyRow('anthropic')),
   section('deepseek', 'DeepSeek', keyRow('deepseek')),
   section('custom', I18n.t('settings.custom.name'), customRows()),
  ].join('');
  this.inputs = {};
  for (const input of this.list.querySelectorAll('.settings-key[data-provider]')) {
   const provider = input.dataset.provider;
   this.inputs[provider] = input;
   input.value = this.keys[provider];
   input.addEventListener('input', () => this.onKeyInput(provider));
  }
  this.fields = {};
  for (const input of this.list.querySelectorAll('.settings-field')) {
   const name = input.dataset.field;
   this.fields[name] = input;
   input.value = this.custom[name] || '';
   input.addEventListener('input', () => this.onCustomInput());
  }
  // A problem with the server is pointed at its address.
  this.inputs.custom = this.fields.baseURL;
  this.datalist = this.list.querySelector('#settings-custom-models');
  this.chips = [...this.list.querySelectorAll('.settings-chip')];
  for (const chip of this.chips) chip.addEventListener('click', () => this.applyPreset(PRESETS.find(preset => preset.id === chip.dataset.preset)));
  this.paintCustom();
  this.statuses = Object.fromEntries([...this.list.querySelectorAll('.settings-status')].map(node => [node.dataset.provider, node]));
  this.accountBox = this.list.querySelector('.settings-account');
  this.accountBox.addEventListener('click', event => {
   const action = event.target.closest('[data-action]')?.dataset.action;
   if (action === 'login') this.login();
   else if (action === 'cancel') window.openghost?.auth?.cancel();
   else if (action === 'logout') this.logout();
  });
  if (!window.openghost?.auth) this.accountBox.closest('.settings-row').hidden = true;
 }

 paint() {
  if (!this.list) return;
  for (const node of this.list.querySelectorAll('.provider')) {
   const id = node.dataset.provider;
   // OpenAI is connected through either the ChatGPT sign-in or a key; a model both offer counts once.
   const live = (id === 'openai' ? ['chatgpt', 'openai'] : [id]).filter(source => this.working(source));
   const on = live.length > 0, count = new Set(live.flatMap(source => this.catalog[source] || []).map(model => model.api)).size;
   const state = node.querySelector('.provider-state');
   state.textContent = I18n.t(on ? 'settings.connected' : 'settings.off');
   state.classList.toggle('is-on', on);
   node.querySelector('.provider-models').textContent = on && count ? I18n.t('settings.models', { count }) : '';
  }
  const box = this.accountBox;
  if (!box) return;
  box.dataset.state = this.account.waiting ? 'waiting' : this.account.connected ? 'connected' : 'idle';
  const who = [this.account.email, this.account.plan && I18n.t('settings.chatgpt.plan', { plan: this.account.plan.charAt(0).toUpperCase() + this.account.plan.slice(1) })].filter(Boolean).join(' · ');
  box.querySelector('.settings-account-who').textContent = this.account.waiting ? I18n.t('settings.chatgpt.waiting') : who;
 }

 // The preset chips show which server the address is, and the placeholders say what that server usually takes.
 paintCustom() {
  const preset = this.custom.baseURL ? this.preset() : null;
  for (const chip of this.chips) chip.setAttribute('aria-pressed', String(chip.dataset.preset === preset?.id));
  this.fields.key.placeholder = OpenAICompat.isLocal(this.endpoint.baseURL) ? I18n.t('settings.custom.key.none') : 'sk-…';
  this.fields.model.placeholder = preset?.model || I18n.t('settings.custom.model.any');
  this.fields.context.placeholder = String(preset?.context || CUSTOM_CONTEXT);
  const known = new Set([...this.catalog.found.map(found => found.id), ...(preset?.models || [])]);
  this.datalist.replaceChildren(...[...known].map(api => Object.assign(document.createElement('option'), { value: api })));
 }

 // A preset fills in the address and offers its model; a model typed by hand is left alone.
 applyPreset(preset) {
  const before = this.preset(), model = this.fields.model.value.trim();
  this.fields.baseURL.value = preset.baseURL;
  if (!model || model === before?.model) this.fields.model.value = preset.model;
  this.onCustomInput();
  this.fields.model.focus();
 }

 setAccount(account) {
  const was = this.account.connected;
  this.account = { connected: !!account?.connected, email: account?.email || '', plan: account?.plan || '' };
  if (account?.error) this.setStatus('chatgpt', account.error, 'error');
  if (this.account.connected && !this.catalog.chatgpt.length) this.refresh('chatgpt').catch(() => {});
  if (was !== this.account.connected) this.changed();
  else this.paint();
 }

 async login() {
  const auth = window.openghost?.auth;
  if (!auth || this.account.waiting) return;
  this.setStatus('chatgpt', '');
  this.account = { ...this.account, waiting: true };
  this.paint();
  const account = await auth.login();
  this.setAccount(account);
  // The badge turning green and the account line say it all; a "signed in" line under them would only repeat it.
  if (account?.connected) await this.refresh('chatgpt').catch(() => {});
 }

 async logout() {
  const auth = window.openghost?.auth;
  if (!auth) return;
  this.setAccount(await auth.logout());
  this.setStatus('chatgpt', '');
 }

 open(reason = '', provider = '') {
  if (!this.dialog.open) {
   this.dialog.showModal();
   this.dialog.focus();
   this.syncAccount();
  }
  if (reason) {
   const target = provider || 'deepseek';
   this.setStatus(target, reason, 'error');
   const field = target === 'chatgpt' ? this.accountBox.querySelector('[data-action="login"]') : this.inputs[target];
   field?.scrollIntoView({ block: 'center' });
   field?.focus();
   return;
  }
  for (const provider of this.configured()) {
   if (!this.checked.has(provider)) this.check(provider);
  }
 }

 onKeyInput(provider) {
  const key = this.inputs[provider].value.trim();
  this.keys[provider] = key;
  this.storeKey(provider, key);
  this.forget(provider);
  if (!key) {
   this.setStatus(provider, '');
   this.changed();
   return;
  }
  this.paint();
  this.setStatus(provider, I18n.t('settings.key.checking'));
  this.timer[provider] = setTimeout(() => this.check(provider), CHECK_DELAY);
 }

 // A new address or key is checked afresh; a new model name or window only changes what the picker shows.
 onCustomInput() {
  const was = this.customSet(), server = this.stamp('custom');
  const text = name => this.fields[name].value.trim();
  const key = text('key');
  if (key !== this.custom.key) this.storeKey('custom', key);
  this.custom = { baseURL: text('baseURL'), key, model: text('model'), context: Math.max(0, Math.round(Number(text('context')))) || 0 };
  this.saveCustom();
  const moved = this.stamp('custom') !== server;
  // A model list belongs to the server it came from.
  if (moved) this.catalog.found = [];
  this.paintCustom();
  if (!this.customSet()) {
   this.forget('custom');
   this.setStatus('custom', '');
   this.changed();
   return;
  }
  if (was && !moved) { this.changed(); return; }
  this.forget('custom');
  this.changed();
  this.setStatus('custom', I18n.t('settings.custom.checking'));
  this.timer.custom = setTimeout(() => this.check('custom'), CHECK_DELAY);
 }

 // What a check was made with, so a result that arrives after another change is dropped.
 stamp(provider) {
  return provider === 'custom' ? `${this.endpoint.baseURL}\n${this.custom.key}` : this.keys[provider];
 }

 // A provider whose settings changed is unchecked again until its next check comes back.
 forget(provider) {
  clearTimeout(this.timer?.[provider]);
  this.timer = { ...this.timer };
  this.checked.delete(provider);
  this.accepted.delete(provider);
 }

 // A working key or server shows only in the badge; the line under the field is for the check in progress and for what went wrong.
 async check(provider) {
  const stamp = this.stamp(provider);
  this.setStatus(provider, I18n.t(provider === 'custom' ? 'settings.custom.checking' : 'settings.key.checking'));
  try {
   const current = await this.refresh(provider);
   if (!current || stamp !== this.stamp(provider)) return;
   this.accepted.add(provider);
   this.checked.add(provider);
   this.setStatus(provider, '');
  } catch (error) {
   if (stamp !== this.stamp(provider)) return;
   this.accepted.delete(provider);
   this.setStatus(provider, error.message, 'error');
  }
  this.paint();
 }

 setStatus(provider, text, tone = '') {
  const node = this.statuses?.[provider];
  if (!node) return;
  node.textContent = text;
  node.dataset.tone = tone;
 }
}

window.Settings = Settings;
})();
