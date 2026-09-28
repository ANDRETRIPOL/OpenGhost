(() => {
'use strict';

const STORAGE = { effort: 'deepseek.effort', mode: 'openghost.mode', model: 'openghost.model', catalog: 'openghost.catalog' };
const KEYS = { openai: 'openai.apiKey', anthropic: 'anthropic.apiKey', deepseek: 'deepseek.apiKey' };
// The order providers appear in, in the settings and in the model picker.
const ORDER = ['chatgpt', 'openai', 'anthropic', 'deepseek'];
const DEFAULT_MODEL = 'deepseek-flash';
const EFFORTS = ['none', 'low', 'high', 'max'];
const DEFAULT_EFFORT = 'high';
const DEFAULT_CONTEXT = 1000000;
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
  // Keys saved in an earlier session count as working until a check says otherwise.
  this.accepted = new Set(Object.keys(KEYS).filter(provider => this.keys[provider]));
  this.build();
  this.collect();
  dialog.addEventListener('dismiss', () => dialog.close());
  this.refreshAll();
 }

 readCatalog() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE.catalog)) || {}; } catch {}
  return { chatgpt: [], openai: [], anthropic: [], ...saved, deepseek: saved.deepseek?.length ? saved.deepseek : KNOWN_DEEPSEEK.slice() };
 }

 saveCatalog() {
  try { localStorage.setItem(STORAGE.catalog, JSON.stringify(this.catalog)); } catch {}
 }

 connected(provider) {
  return provider === 'chatgpt' ? !!this.account.connected : !!this.keys[provider];
 }

 // The badge turns green only once the provider has taken the key, so a mistyped key never looks connected.
 working(provider) {
  return this.connected(provider) && (provider === 'chatgpt' || this.accepted.has(provider));
 }

 // The picker offers the models of every connected provider; with none connected it shows DeepSeek, the app's own default.
 collect() {
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
   key: this.keys[provider] || '',
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
  await Promise.all(Object.keys(KEYS).filter(provider => this.keys[provider]).map(provider => this.checkKey(provider)));
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
  const models = await Providers.models(provider, this.keys[provider]);
  if (token !== this.checks[provider]) return false;
  this.catalog[provider] = models.length || provider !== 'deepseek' ? models : KNOWN_DEEPSEEK.slice();
  this.saveCatalog();
  this.changed();
  return true;
 }

 build() {
  this.list.innerHTML = [
   section('openai', 'OpenAI', accountRow() + keyRow('openai')),
   section('anthropic', 'Anthropic', keyRow('anthropic')),
   section('deepseek', 'DeepSeek', keyRow('deepseek')),
  ].join('');
  this.inputs = {};
  for (const input of this.list.querySelectorAll('.settings-key')) {
   const provider = input.dataset.provider;
   this.inputs[provider] = input;
   input.value = this.keys[provider];
   input.addEventListener('input', () => this.onKeyInput(provider));
  }
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
  for (const provider of Object.keys(KEYS)) {
   if (this.keys[provider] && !this.checked.has(provider)) this.checkKey(provider);
  }
 }

 onKeyInput(provider) {
  const key = this.inputs[provider].value.trim();
  this.keys[provider] = key;
  if (key) localStorage.setItem(KEYS[provider], key);
  else localStorage.removeItem(KEYS[provider]);
  clearTimeout(this.timer?.[provider]);
  this.timer = { ...this.timer };
  this.checked.delete(provider);
  this.accepted.delete(provider);
  if (!key) {
   this.setStatus(provider, '');
   this.changed();
   return;
  }
  this.paint();
  this.setStatus(provider, I18n.t('settings.key.checking'));
  this.timer[provider] = setTimeout(() => this.checkKey(provider), CHECK_DELAY);
 }

 // A working key shows only in the badge; the line under the field is for the check in progress and for what went wrong.
 async checkKey(provider) {
  const key = this.keys[provider];
  this.setStatus(provider, I18n.t('settings.key.checking'));
  try {
   const current = await this.refresh(provider);
   if (!current || key !== this.keys[provider]) return;
   this.accepted.add(provider);
   this.checked.add(provider);
   this.setStatus(provider, '');
  } catch (error) {
   if (key !== this.keys[provider]) return;
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
