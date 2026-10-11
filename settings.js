(() => {
'use strict';

const STORAGE = { effort: 'deepseek.effort', mode: 'openghost.mode', model: 'openghost.model', catalog: 'openghost.catalog' };
const KEYS = { openai: 'openai.apiKey', anthropic: 'anthropic.apiKey', deepseek: 'deepseek.apiKey', openrouter: 'openrouter.apiKey', local: 'local.address', custom: 'custom.apiKey' };
// The order providers appear in, in the settings and in the model picker.
const ORDER = ['chatgpt', 'openai', 'anthropic', 'deepseek', 'openrouter', 'local', 'custom'];
// The provider the app starts with: the settings ask for its key when nothing is connected, and new chats take its first
// model until the user picks another.
const FIRST_PROVIDER = 'deepseek';
const EFFORTS = ['none', 'low', 'high', 'max'];
const DEFAULT_EFFORT = 'high';
const DEFAULT_CONTEXT = 1000000;
// How long a provider's list of models counts as fresh. Opening the model picker after that reads the lists again.
const FRESH = 10 * 60 * 1000;
const LINKS = {
 openai: ['https://platform.openai.com/api-keys', 'platform.openai.com'],
 anthropic: ['https://console.anthropic.com/settings/keys', 'console.anthropic.com'],
 deepseek: ['https://platform.deepseek.com/api_keys', 'platform.deepseek.com'],
 openrouter: ['https://openrouter.ai/keys', 'openrouter.ai'],
};
// What the user may write in by hand where a provider's own word is not enough. `models`: names of models its list
// does not hold. `context`: the size of the window, for the providers whose servers may not tell it. `address`: where a
// service lives, for the one that is reached by address and not only by key.
const HAND = {
 openai: { models: 'openai.models' },
 anthropic: { models: 'anthropic.models' },
 local: { models: 'local.models', context: 'local.context' },
 custom: { models: 'custom.models', context: 'custom.context', address: 'custom.address' },
};
// A local server stands where a key would: its address is kept as one. `window`: the window a model is taken to have
// when neither the server nor the user says.
const LOCAL = { window: 32768, presets: [['Ollama', 'http://localhost:11434'], ['LM Studio', 'http://localhost:1234']] };
// The providers reached by an address the user gives.
const SERVED = new Set(['local', 'custom']);
const PLACEHOLDERS = { anthropic: 'sk-ant-…', openrouter: 'sk-or-…' };
const MODES = ['ask', 'auto', 'full'];
const DEFAULT_MODE = 'ask';
const CHECK_DELAY = 400;
const PAGE = { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const checking = provider => I18n.t(I18n.has(`settings.${provider}.checking`) ? `settings.${provider}.checking` : 'settings.key.checking');

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
    <div class="settings-key-box">
     <input id="settings-key-${provider}" class="settings-key" data-provider="${provider}" type="password" placeholder="${PLACEHOLDERS[provider] || 'sk-…'}" autocomplete="off" spellcheck="false">
     <button type="button" class="settings-key-eye" aria-label="${escapeHtml(I18n.t('settings.key.show'))}" aria-pressed="false">${Glyphs.eye}</button>
    </div>
    <p class="settings-status" data-provider="${provider}" role="status"></p>
   </div>
  </div>`;
}

// A field for what is written by hand: a model's name, the size of a window, an address.
function handRow(provider, name, placeholder, extra = '') {
 const t = key => escapeHtml(I18n.t(`settings.${provider}.${key}`));
 return `
  <div class="settings-row">
   <div class="settings-text">
    <label class="settings-label" for="settings-${provider}-${name}">${t(name)}</label>
    <p class="settings-hint">${t(`${name}.hint`)}</p>
   </div>
   <div class="settings-control">
    <input id="settings-${provider}-${name}" class="settings-key settings-field" data-hand="${provider}.${name}" type="text" placeholder="${placeholder}" autocomplete="off" spellcheck="false">${extra}
   </div>
  </div>`;
}

function localRows() {
 const t = name => escapeHtml(I18n.t(`settings.local.${name}`));
 return `
  <div class="settings-row">
   <div class="settings-text">
    <label class="settings-label" for="settings-key-local">${t('key')}</label>
    <p class="settings-hint">${t('hint')}</p>
   </div>
   <div class="settings-control">
    <div class="settings-key-box">
     <input id="settings-key-local" class="settings-key settings-field" data-provider="local" type="text" placeholder="${LOCAL.presets[0][1]}" autocomplete="off" spellcheck="false">
    </div>
    <div class="settings-presets">${LOCAL.presets.map(([name, address]) => `<button type="button" class="settings-preset" data-address="${address}">${name}</button>`).join('')}</div>
    <p class="settings-status" data-provider="local" role="status"></p>
   </div>
  </div>${handRow('local', 'models', 'my-model')}${handRow('local', 'context', String(LOCAL.window))}`;
}

// A service that speaks the OpenAI API: where it lives, the key it asks for if it asks for one, and by hand what it
// does not tell.
function customRows() {
 const t = name => escapeHtml(I18n.t(`settings.custom.${name}`));
 return `${handRow('custom', 'address', 'https://api.example.com/v1', '\n    <p class="settings-status" data-provider="custom" role="status"></p>')}
  <div class="settings-row">
   <div class="settings-text">
    <label class="settings-label" for="settings-key-custom">${t('key')}</label>
    <p class="settings-hint">${t('hint')}</p>
   </div>
   <div class="settings-control">
    <div class="settings-key-box">
     <input id="settings-key-custom" class="settings-key" data-provider="custom" type="password" placeholder="sk-…" autocomplete="off" spellcheck="false">
     <button type="button" class="settings-key-eye" aria-label="${escapeHtml(I18n.t('settings.key.show'))}" aria-pressed="false">${Glyphs.eye}</button>
    </div>
   </div>
  </div>${handRow('custom', 'models', 'model-id')}${handRow('custom', 'context', String(LOCAL.window))}`;
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
  this.unsaved = new Set();
  this.keys = this.readKeys();
  this.hand = this.readHand();
  this.account = { connected: false };
  this.catalog = this.readCatalog();
  this.models = [];
  this.efforts = EFFORTS.slice();
  localStorage.removeItem('deepseek.model');
  this.model = localStorage.getItem(STORAGE.model) || '';
  this.shown = this.model;
  this.read = 0;
  const effort = localStorage.getItem(STORAGE.effort);
  this.effort = typeof effort === 'string' && effort ? effort : DEFAULT_EFFORT;
  const mode = localStorage.getItem(STORAGE.mode);
  this.mode = MODES.includes(mode) ? mode : DEFAULT_MODE;
  this.checks = {};
  this.checked = new Set();
  // Keys saved in an earlier session count as working until a check says otherwise.
  this.accepted = new Set(Object.keys(KEYS).filter(provider => this.has(provider)));
  this.build();
  this.pager();
  this.collect();
  dialog.addEventListener('dismiss', () => dialog.close());
  dialog.addEventListener('close', () => this.conceal());
  // Mid-transition of the theme a click lands on <html>, outside the dialog, and must not close it.
  dialog.addEventListener('cancel', event => {
   if (window.Theme?.moving) event.preventDefault();
  });
  // A provider that found out something about one of its models asks for its list to be read again.
  window.addEventListener('models-stale', event => { if (this.connected(event.detail)) this.refresh(event.detail).catch(() => {}); });
  this.refreshAll();
 }

 // The sections on the left: one highlight glides to the chosen section, and its page rises into view.
 pager() {
  const dialog = this.dialog;
  this.tabs = [...dialog.querySelectorAll('.settings-tab')];
  this.panels = Object.fromEntries([...dialog.querySelectorAll('.settings-panel')].map(panel => [panel.dataset.page, panel]));
  this.glider = dialog.querySelector('.settings-glide');
  this.title = dialog.querySelector('.settings-page-title');
  this.scroller = dialog.querySelector('.settings-page');
  this.current = 'general';
  // As in the chat, the page fades into an edge while more of it lies scrolled out past that edge.
  const edges = () => {
   const page = this.scroller;
   dialog.classList.toggle('can-up', page.scrollTop > 1);
   dialog.classList.toggle('can-down', page.scrollTop + page.clientHeight < page.scrollHeight - 1);
  };
  this.scroller.addEventListener('scroll', edges, { passive: true });
  const sizes = new ResizeObserver(edges);
  sizes.observe(this.scroller);
  for (const panel of dialog.querySelectorAll('.settings-panel')) sizes.observe(panel);
  for (const tab of this.tabs) tab.addEventListener('click', () => this.page(tab.dataset.page));
  dialog.querySelector('.settings-tabs').addEventListener('keydown', event => {
   const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
   if (!step) return;
   event.preventDefault();
   const at = this.tabs.findIndex(tab => tab.dataset.page === this.current);
   const next = this.tabs[(at + step + this.tabs.length) % this.tabs.length];
   this.page(next.dataset.page);
   next.focus();
  });
 }

 page(name, instant = false) {
  const panel = this.panels[name];
  if (!panel) return;
  const moved = name !== this.current;
  this.current = name;
  for (const tab of this.tabs) {
   const on = tab.dataset.page === name;
   tab.setAttribute('aria-selected', String(on));
   tab.tabIndex = on ? 0 : -1;
  }
  this.glide(instant || !moved);
  if (!moved) return;
  for (const item of Object.values(this.panels)) item.hidden = item !== panel;
  this.title.textContent = I18n.t(`settings.${name}`);
  this.scroller.scrollTop = 0;
  if (instant || reducedMotion()) return;
  panel.animate([{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], PAGE);
  this.title.animate([{ opacity: 0, transform: 'translateY(3px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { ...PAGE, duration: 320 });
 }

 glide(instant) {
  const tab = this.tabs.find(item => item.dataset.page === this.current);
  if (!tab || !this.dialog.open) return;
  const style = this.glider.style;
  if (instant) style.transition = 'none';
  style.transform = `translateY(${tab.offsetTop}px)`;
  style.height = `${tab.offsetHeight}px`;
  style.opacity = '1';
  if (!instant) return;
  void this.glider.offsetHeight;
  style.transition = '';
 }

 readCatalog() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE.catalog)) || {}; } catch {}
  return { ...Object.fromEntries(ORDER.map(provider => [provider, []])), ...saved };
 }

 // What the user wrote by hand for each provider that takes it.
 readHand() {
  const read = name => name ? String(localStorage.getItem(name) || '').trim() : '';
  return Object.fromEntries(Object.entries(HAND).map(([provider, at]) => {
   const context = Math.round(Number(read(at.context).replace(/[\s,._]/g, ''))) || 0;
   return [provider, { names: [...new Set(read(at.models).split(',').map(name => name.trim()).filter(Boolean))], context: context > 0 ? context : 0, address: read(at.address) }];
  }));
 }

 // The models of a server whose window is too small for the agent's own instructions, said under the address so the
 // user learns it in the settings and not from a chat that goes wrong.
 cramped(provider) {
  if (!SERVED.has(provider)) return '';
  const small = (this.catalog[provider] || []).filter(model => model.context < Providers.NEED);
  if (!small.length) return '';
  return I18n.t('settings.window.small', { models: small.slice(0, 3).map(model => `${model.name} (${model.context.toLocaleString('en-US')})`).join(', '), need: Providers.NEED.toLocaleString('en-US') });
 }

 // Whether a provider has been given what it is reached by: its key, or for a service at an address, the address.
 has(provider) {
  return provider === 'custom' ? !!this.hand.custom.address : !!this.keys[provider];
 }

 // What goes to a provider's list of models besides its key.
 extra(provider) {
  if (provider === 'custom') return { address: this.hand.custom.address };
  if (HAND[provider]) return { names: this.hand[provider].names };
  return undefined;
 }

 // A server's list with the user's own word laid over it: a name written by hand is a model even if the server did
 // not list it, and a window written by hand is the window of every model of that provider.
 byHand(provider, models) {
  const hand = this.hand[provider], listed = new Set(models.map(model => model.api));
  const own = hand.names.filter(name => !listed.has(name)).map(name => ({ id: `${provider}:${name}`, provider, api: name, name, context: 0, output: 0, vision: provider === 'custom', tools: true, efforts: ['none'], defaultEffort: 'none', thinking: 'none' }));
  // A window written by hand is held to the largest the model can take, where the server tells that.
  const sized = model => hand.context ? (model.limit ? Math.min(hand.context, model.limit) : hand.context) : model.context || (model.limit ? Math.min(model.limit, LOCAL.window) : LOCAL.window);
  return [...models, ...own].map(model => ({ ...model, context: sized(model) }));
 }

 saveCatalog() {
  try { localStorage.setItem(STORAGE.catalog, JSON.stringify(this.catalog)); } catch {}
 }

 // The keys live in the OS keychain through the main process. Ones an earlier version kept in localStorage are the newest word,
 // so they move into the keychain once and leave localStorage only after it has them. Outside the desktop app they stay where they were.
 readKeys() {
  const vault = window.openghost?.keys, keys = { ...(vault?.read() || {}) };
  for (const [provider, name] of Object.entries(KEYS)) {
   const old = localStorage.getItem(name);
   if (!vault) { keys[provider] = old || ''; continue; }
   if (!old) continue;
   keys[provider] = old;
   vault.write(provider, old).then(saved => { if (saved) localStorage.removeItem(name); }).catch(() => {});
  }
  return Object.fromEntries(Object.keys(KEYS).map(provider => [provider, keys[provider] || '']));
 }

 // A key that could not be saved still works until the app closes; the line under its field says so rather than lose it quietly.
 saveKey(provider, key) {
  const vault = window.openghost?.keys;
  if (!vault) {
   if (key) localStorage.setItem(KEYS[provider], key);
   else localStorage.removeItem(KEYS[provider]);
   return;
  }
  vault.write(provider, key).then(saved => {
   if (key !== this.keys[provider]) return;
   if (saved) this.unsaved.delete(provider);
   else throw new Error('not saved');
  }).catch(() => {
   if (key !== this.keys[provider]) return;
   this.unsaved.add(provider);
   this.setStatus(provider, I18n.t('settings.key.unsaved'), 'error');
  });
 }

 // The eye beside a key shows it for a moment's check; closing the settings hides every key again.
 reveal(provider, shown) {
  const input = this.inputs[provider], eye = input.nextElementSibling;
  if (!eye) return;
  input.type = shown ? 'text' : 'password';
  input.parentElement.classList.toggle('is-revealed', shown);
  eye.setAttribute('aria-pressed', String(shown));
  eye.setAttribute('aria-label', I18n.t(shown ? 'settings.key.hide' : 'settings.key.show'));
 }

 conceal() {
  for (const provider of Object.keys(this.inputs || {})) this.reveal(provider, false);
 }

 connected(provider) {
  return provider === 'chatgpt' ? !!this.account.connected : this.has(provider);
 }

 // The badge turns green only once the provider has taken the key, so a mistyped key never looks connected.
 working(provider) {
  return this.connected(provider) && (provider === 'chatgpt' || this.accepted.has(provider));
 }

 // The picker offers the models of every connected provider, as each provider lists them. No model is known to the app
 // by itself: with nothing connected there is none, and the picker leads to the settings instead.
 collect() {
  this.models = ORDER.filter(provider => this.connected(provider)).flatMap(provider => this.catalog[provider] || []);
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
  if (this.find(this.model)) return this.model;
  // Before the user has picked one, new chats get the first model the app's first provider lists, or the first there is.
  return (this.models.find(item => item.provider === FIRST_PROVIDER) || this.models[0])?.id || '';
 }

 configFor(id) {
  const model = this.find(id);
  const provider = model?.provider || FIRST_PROVIDER;
  const efforts = model?.efforts?.length ? model.efforts : EFFORTS;
  const effort = efforts.includes(this.effort) ? this.effort : [model?.defaultEffort, DEFAULT_EFFORT].find(level => efforts.includes(level)) || efforts[efforts.length - 1];
  return {
   id: model?.id || id,
   provider,
   model: model?.api || id,
   name: model?.name || id,
   key: this.keys[provider] || '',
   address: provider === 'custom' ? this.hand.custom.address : undefined,
   // The window a model on a server of the user's works in: Ollama is asked for it with every request.
   window: SERVED.has(provider) ? model?.context || LOCAL.window : undefined,
   ready: !!model && this.connected(provider),
   effort,
   efforts,
   vision: model?.vision !== false,
   // A model that calls no tools is talked to as a plain chat.
   tools: model?.tools !== false,
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

 // What another window of the app has changed since this one read it: the keys, the sign-in, the providers' lists of
 // models, and the model, effort and mode last chosen. The quick chat's window takes them in each time it is called.
 async reread() {
  this.keys = this.readKeys();
  this.hand = this.readHand();
  for (const provider of Object.keys(KEYS)) {
   if (this.has(provider)) this.accepted.add(provider);
   else this.accepted.delete(provider);
  }
  this.catalog = this.readCatalog();
  this.model = localStorage.getItem(STORAGE.model) || '';
  const effort = localStorage.getItem(STORAGE.effort), mode = localStorage.getItem(STORAGE.mode);
  if (effort) this.effort = effort;
  if (MODES.includes(mode)) this.mode = mode;
  this.changed();
  await this.syncAccount();
 }

 async refreshAll() {
  this.read = Date.now();
  await this.syncAccount();
  await Promise.all([
   ...Object.keys(KEYS).filter(provider => this.has(provider)).map(provider => this.checkKey(provider)),
   this.account.connected ? this.refresh('chatgpt').catch(() => {}) : null,
  ]);
 }

 // Reads the providers' lists again once they are no longer fresh, quietly: a model a provider has added since shows up
 // the next time the picker opens, with no restart. A list that can't be read now leaves the last one in place.
 freshen() {
  if (Date.now() - this.read < FRESH) return;
  this.read = Date.now();
  for (const provider of ORDER) if (this.connected(provider)) this.refresh(provider).catch(() => {});
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
  let models;
  try {
   models = await Providers.models(provider, this.keys[provider], this.extra(provider));
  } catch (error) {
   // A server that gives no list still serves the models the user named by hand. A key it does not take is another
   // matter: nothing would answer.
   if (!SERVED.has(provider) || !this.hand[provider].names.length || error.status === 401 || error.status === 403) throw error;
   models = [];
  }
  if (token !== this.checks[provider]) return false;
  this.catalog[provider] = SERVED.has(provider) ? this.byHand(provider, models) : models;
  this.saveCatalog();
  this.changed();
  return true;
 }

 build() {
  this.list.innerHTML = [
   section('openai', 'OpenAI', accountRow() + keyRow('openai') + handRow('openai', 'models', 'gpt-…')),
   section('anthropic', 'Anthropic', keyRow('anthropic') + handRow('anthropic', 'models', 'claude-…')),
   section('deepseek', 'DeepSeek', keyRow('deepseek')),
   section('openrouter', 'OpenRouter', keyRow('openrouter')),
   section('local', I18n.t('settings.local.name'), localRows()),
   section('custom', I18n.t('settings.custom.name'), customRows()),
  ].join('');
  this.inputs = {};
  for (const input of this.list.querySelectorAll('.settings-key[data-provider]')) {
   const provider = input.dataset.provider;
   this.inputs[provider] = input;
   input.value = this.keys[provider];
   input.addEventListener('input', () => this.onKeyInput(provider));
   input.nextElementSibling?.addEventListener('click', () => this.reveal(provider, input.type === 'password'));
  }
  for (const button of this.list.querySelectorAll('.settings-preset')) {
   button.addEventListener('click', () => { this.inputs.local.value = button.dataset.address; this.onKeyInput('local'); });
  }
  // What is written by hand is kept as it is typed, and the provider's list is read again with it.
  for (const input of this.list.querySelectorAll('[data-hand]')) {
   const [provider, name] = input.dataset.hand.split('.'), at = HAND[provider][name];
   input.value = localStorage.getItem(at) || '';
   input.addEventListener('input', () => {
    const value = input.value.trim();
    if (value) localStorage.setItem(at, value);
    else localStorage.removeItem(at);
    this.hand = this.readHand();
    if (this.has(provider) || name === 'address') this.onKeyInput(provider);
   });
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
  const opening = !this.dialog.open;
  if (opening) {
   this.dialog.showModal();
   this.dialog.focus();
   this.syncAccount();
  }
  // A missing key opens straight on Providers; otherwise the settings always open on General.
  if (reason) this.page('providers', opening);
  else if (opening) this.page('general', true);
  if (reason) {
   const target = provider || FIRST_PROVIDER;
   this.setStatus(target, reason, 'error');
   const field = target === 'chatgpt' ? this.accountBox.querySelector('[data-action="login"]') : this.inputs[target];
   field?.scrollIntoView({ block: 'center' });
   field?.focus();
   return;
  }
  for (const provider of Object.keys(KEYS)) {
   if (this.has(provider) && !this.checked.has(provider)) this.checkKey(provider);
  }
 }

 onKeyInput(provider) {
  const key = this.inputs[provider].value.trim();
  this.keys[provider] = key;
  this.saveKey(provider, key);
  clearTimeout(this.timer?.[provider]);
  this.timer = { ...this.timer };
  this.checked.delete(provider);
  this.accepted.delete(provider);
  if (!this.has(provider)) {
   this.setStatus(provider, '');
   this.changed();
   return;
  }
  this.paint();
  this.setStatus(provider, checking(provider));
  this.timer[provider] = setTimeout(() => this.checkKey(provider), CHECK_DELAY);
 }

 // A working key shows only in the badge; the line under the field is for the check in progress and for what went wrong.
 async checkKey(provider) {
  const key = this.keys[provider];
  this.setStatus(provider, checking(provider));
  try {
   const current = await this.refresh(provider);
   if (!current || key !== this.keys[provider]) return;
   this.accepted.add(provider);
   this.checked.add(provider);
   if (this.unsaved.has(provider)) this.setStatus(provider, I18n.t('settings.key.unsaved'), 'error');
   else {
    const small = this.cramped(provider);
    this.setStatus(provider, small, small ? 'error' : '');
   }
  } catch (error) {
   if (key !== this.keys[provider]) return;
   this.accepted.delete(provider);
   // A service that wants a key and was given none is not one that turned a key down.
   const keyless = provider === 'custom' && !key && error.status === 401;
   this.setStatus(provider, keyless ? I18n.t('settings.custom.needsKey') : error.message, 'error');
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
