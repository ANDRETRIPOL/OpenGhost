(() => {
'use strict';

const PARTITION = 'persist:browser';
const STORE = 'openghost.browser';
const ACCOUNTS = 'openghost.browser.accounts';
const TABS_MAX = 12;
const WIDTH = { share: 0.44, min: 360, chat: 400 };
const CURSOR = { duration: 380, hide: 2600 };
const TOAST_TIME = 4200;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const bridge = window.openghost?.browser || null;
const tools = window.openghost?.tools || null;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const svg = body => `<svg viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
 back: svg('<path d="M65 42 47 60l18 18"/>'),
 forward: svg('<path d="m55 42 18 18-18 18"/>'),
 reload: svg('<path d="M77.5 51A19 19 0 1 0 79 60"/><path d="M79 38v13.5H65.5"/>'),
 stop: svg('<path d="M46 46l28 28M74 46 46 74"/>'),
 plus: svg('<path d="M60 44v32M44 60h32"/>'),
 close: svg('<path d="M50 50l20 20M70 50 50 70"/>'),
 external: svg('<path d="M65 40h15v15M80 40 58 62"/><path d="M73 67v8a5 5 0 0 1-5 5H45a5 5 0 0 1-5-5V52a5 5 0 0 1 5-5h8"/>'),
};
const CURSOR_ART = '<svg class="browser-cursor-arrow" viewBox="0 0 20 22" aria-hidden="true"><path d="M2.5 1.8 17 12.2l-6.3 1.1 3.6 6.4-2.7 1.5-3.6-6.4L3.6 19z" fill="currentColor" stroke="rgba(0,0,0,.55)" stroke-width="1.2" stroke-linejoin="round"/></svg>';

const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

function element(tag, className, html) {
 const el = document.createElement(tag);
 if (className) el.className = className;
 if (html !== undefined) el.innerHTML = html;
 return el;
}

function hostOf(url) {
 try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function normalize(value) {
 const text = String(value || '').trim();
 if (!text) return '';
 if (/^(https?|file|about|data):/i.test(text)) return text;
 if (text.startsWith('/')) return `file://${text}`;
 if (/^[a-zA-Z]:[\\/]/.test(text)) return `file:///${text.replace(/\\/g, '/')}`;
 if (/^(localhost|127\.0\.0\.1|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(text)) return `http://${text}`;
 if (!/\s/.test(text) && /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/|$|\?|#)/i.test(text)) return `https://${text}`;
 return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

const blank = url => !url || url === 'about:blank';
const shortDate = time => new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

class BrowserPanel {
 constructor({ app, main, toggle }) {
  this.app = app;
  this.main = main;
  this.toggle = toggle;
  this.tabs = [];
  this.active = null;
  this.open = false;
  this.drivers = new Set();
  this.control = 'agent';
  this.waiters = [];
  this.cursorAt = null;
  this.accounts = read(ACCOUNTS) || [];
  const saved = read(STORE) || {};
  this.width = saved.width || 0;
  this.build();
  for (const item of (saved.tabs || []).slice(0, TABS_MAX)) this.addTab(item.url || '', { title: item.title || '' });
  this.select(this.tabs[saved.active] || this.tabs[0] || null, { lazy: true });
  this.fit();
  bridge?.onEvent(data => this.onEvent(data));
  toggle.addEventListener('browser-toggle', () => this.setOpen(!this.open));
  window.addEventListener('resize', () => this.fit());
  if (saved.open) this.setOpen(true);
  this.render();
 }

 build() {
  const root = this.root = element('aside', 'browser');
  root.setAttribute('aria-label', I18n.t('browser.label'));
  root.inert = true;
  root.innerHTML = `
   <div class="browser-resize" aria-hidden="true"></div>
   <div class="browser-card">
    <div class="browser-tabs">
     <div class="browser-tab-list" role="tablist"></div>
     <button type="button" class="browser-icon browser-new" aria-label="${I18n.t('browser.newTab')}">${ICONS.plus}</button>
    </div>
    <div class="browser-bar">
     <button type="button" class="browser-icon browser-back" aria-label="${I18n.t('browser.back')}">${ICONS.back}</button>
     <button type="button" class="browser-icon browser-forward" aria-label="${I18n.t('browser.forward')}">${ICONS.forward}</button>
     <button type="button" class="browser-icon browser-reload" aria-label="${I18n.t('browser.reload')}">${ICONS.reload}</button>
     <label class="browser-address">
      <input class="browser-url" type="text" spellcheck="false" autocomplete="off" placeholder="${I18n.t('browser.address')}" aria-label="${I18n.t('browser.address')}">
      <span class="browser-url-view" aria-hidden="true"></span>
     </label>
     <button type="button" class="browser-icon browser-external" aria-label="${I18n.t('browser.external')}">${ICONS.external}</button>
    </div>
    <div class="browser-stage">
     <div class="browser-progress" aria-hidden="true"></div>
     <div class="browser-empty">${Glyphs.ghost}<p>${I18n.t('browser.empty')}</p></div>
     <div class="browser-error" hidden><p class="browser-error-title">${I18n.t('browser.failed')}</p><p class="browser-error-code"></p><button type="button" class="browser-pill">${I18n.t('browser.retry')}</button></div>
     <div class="browser-agent" aria-hidden="true">
      <div class="browser-badge">${Glyphs.ghost}<span>${I18n.t('browser.driving')}</span></div>
      <button type="button" class="browser-take browser-pill">${I18n.t('browser.take')}</button>
     </div>
     <div class="browser-cursor" aria-hidden="true">${CURSOR_ART}<span>OpenGhost</span></div>
     <div class="browser-user"><span>${I18n.t('browser.user')}</span><button type="button" class="browser-pill">${I18n.t('browser.handBack')}</button></div>
     <div class="browser-toast" hidden></div>
    </div>
   </div>`;
  this.app.append(root);
  const $ = selector => root.querySelector(selector);
  this.list = $('.browser-tab-list');
  this.stage = $('.browser-stage');
  this.url = $('.browser-url');
  this.urlView = $('.browser-url-view');
  this.backButton = $('.browser-back');
  this.forwardButton = $('.browser-forward');
  this.reloadButton = $('.browser-reload');
  this.error = $('.browser-error');
  this.overlay = $('.browser-agent');
  this.cursor = $('.browser-cursor');
  this.toast = $('.browser-toast');
  $('.browser-new').addEventListener('click', () => this.newTab());
  this.backButton.addEventListener('click', () => this.active?.view?.goBack());
  this.forwardButton.addEventListener('click', () => this.active?.view?.goForward());
  this.reloadButton.addEventListener('click', () => {
   const view = this.active?.view;
   if (!view) return;
   if (view.isLoading()) view.stop(); else view.reload();
  });
  $('.browser-external').addEventListener('click', () => { if (!blank(this.active?.url)) window.open(this.active.url, '_blank'); });
  $('.browser-error .browser-pill').addEventListener('click', () => { this.active.error = ''; this.active.view?.reload(); this.render(); });
  $('.browser-take').addEventListener('click', () => this.take());
  $('.browser-user .browser-pill').addEventListener('click', () => this.handBack());
  this.url.addEventListener('focus', () => { this.root.classList.add('is-editing'); this.url.select(); });
  this.url.addEventListener('blur', () => { this.root.classList.remove('is-editing'); this.syncBar(); });
  this.url.addEventListener('keydown', event => {
   if (event.key === 'Enter') { event.preventDefault(); this.go(this.url.value); this.url.blur(); }
   else if (event.key === 'Escape') { event.preventDefault(); this.syncBar(true); this.url.blur(); }
  });
  this.list.addEventListener('click', event => {
   const tab = this.tabs.find(item => item.el.contains(event.target));
   if (!tab) return;
   if (event.target.closest('.browser-tab-close')) this.close(tab);
   else this.select(tab);
  });
  this.list.addEventListener('auxclick', event => {
   const tab = this.tabs.find(item => item.el.contains(event.target));
   if (tab && event.button === 1) this.close(tab);
  });
  this.resizer($('.browser-resize'));
 }

 resizer(handle) {
  handle.addEventListener('pointerdown', event => {
   if (event.button !== 0) return;
   event.preventDefault();
   handle.setPointerCapture(event.pointerId);
   this.app.classList.add('is-browser-resizing');
   const startX = event.clientX, startWidth = this.root.offsetWidth;
   const move = e => this.fit(startWidth + startX - e.clientX);
   const up = () => {
    handle.removeEventListener('pointermove', move);
    this.app.classList.remove('is-browser-resizing');
    this.save();
   };
   handle.addEventListener('pointermove', move);
   handle.addEventListener('pointerup', up, { once: true });
   handle.addEventListener('pointercancel', up, { once: true });
  });
 }

 fit(wanted = this.width) {
  const gap = parseFloat(getComputedStyle(this.app).getPropertyValue('--chat-gap')) || 8;
  const side = this.app.classList.contains('is-sidebar-collapsed') ? 0 : document.querySelector('.sidebar')?.offsetWidth || 0;
  const room = innerWidth - side - gap * 3;
  const max = Math.max(WIDTH.min, room - WIDTH.chat);
  const width = Math.round(Math.min(max, Math.max(WIDTH.min, wanted || room * WIDTH.share)));
  if (wanted) this.width = width;
  this.app.style.setProperty('--browser-width', `${width}px`);
 }

 setOpen(open) {
  if (this.open === open) return;
  this.open = open;
  this.root.inert = !open;
  this.app.classList.toggle('is-browser-open', open);
  this.toggle.toggleAttribute('open', open);
  if (open) {
   this.fit();
   if (this.active && !this.active.view && !blank(this.active.url)) this.createView(this.active, this.active.url);
   if (!this.tabs.length || blank(this.active?.url)) requestAnimationFrame(() => this.url.focus());
  }
  this.save();
  this.report();
 }

 addTab(url, { title = '', after = null } = {}) {
  const tab = { url, title, icon: '', loading: false, error: '', view: null, id: 0, ready: null, el: null };
  const at = after ? this.tabs.indexOf(after) + 1 : this.tabs.length;
  this.tabs.splice(at, 0, tab);
  while (this.tabs.length > TABS_MAX) this.close(this.tabs.find(item => item !== tab && item !== this.active) || this.tabs[0], { quiet: true });
  return tab;
 }

 newTab(url = '', { after = null, background = false, focus = true } = {}) {
  const tab = this.addTab(url, { after });
  if (!blank(url) && (this.open || background)) this.createView(tab, url);
  if (!background) this.select(tab);
  this.render();
  this.save();
  if (!background && focus && blank(url) && this.open) requestAnimationFrame(() => this.url.focus());
  return tab;
 }

 createView(tab, url) {
  const view = document.createElement('webview');
  view.className = 'browser-view';
  view.setAttribute('partition', PARTITION);
  view.setAttribute('allowpopups', '');
  view.setAttribute('src', url || 'about:blank');
  tab.view = view;
  tab.url = blank(url) ? tab.url : url;
  tab.ready = new Promise(resolve => {
   view.addEventListener('dom-ready', () => {
    tab.id = view.getWebContentsId();
    this.report();
    resolve(tab);
   }, { once: true });
  });
  const update = () => { this.render(); if (tab === this.active) this.syncBar(); };
  view.addEventListener('did-start-loading', () => { tab.loading = true; tab.error = ''; update(); });
  view.addEventListener('did-stop-loading', () => {
   tab.loading = false;
   const now = view.getURL();
   if (!blank(now)) tab.url = now;
   tab.title = view.getTitle() || tab.title;
   update();
   this.save();
  });
  view.addEventListener('page-title-updated', event => { tab.title = event.title; update(); });
  view.addEventListener('page-favicon-updated', event => { tab.icon = event.favicons?.[0] || ''; update(); });
  view.addEventListener('did-navigate', event => { if (hostOf(event.url) !== hostOf(tab.url)) tab.icon = ''; if (!blank(event.url)) tab.url = event.url; update(); });
  view.addEventListener('did-navigate-in-page', event => { if (event.isMainFrame && !blank(event.url)) { tab.url = event.url; update(); } });
  view.addEventListener('did-fail-load', event => {
   if (!event.isMainFrame || event.errorCode === -3) return;
   tab.error = event.errorDescription || `Error ${event.errorCode}`;
   tab.loading = false;
   update();
  });
  view.addEventListener('ipc-message', event => { if (event.channel === 'signin') this.signedIn(String(event.args[0] || '')); });
  view.classList.toggle('is-active', tab === this.active);
  this.stage.insertBefore(view, this.error);
  return view;
 }

 select(tab, { lazy = false } = {}) {
  this.active = tab;
  for (const item of this.tabs) item.view?.classList.toggle('is-active', item === tab);
  if (tab && !tab.view && !blank(tab.url) && !lazy && this.open) this.createView(tab, tab.url);
  this.render();
  this.syncBar();
  if (!lazy) this.save();
  this.report();
 }

 close(tab, { quiet = false } = {}) {
  const at = this.tabs.indexOf(tab);
  if (at < 0) return;
  this.tabs.splice(at, 1);
  tab.view?.remove();
  tab.el?.remove();
  if (this.active === tab) this.select(this.tabs[Math.min(at, this.tabs.length - 1)] || null);
  if (!quiet) { this.render(); this.save(); }
 }

 go(text) {
  const url = normalize(text);
  if (!url) return;
  const tab = this.active || this.newTab('', { focus: false });
  tab.error = '';
  if (tab.view) tab.view.loadURL(url).catch(() => {});
  else this.createView(tab, url);
  tab.url = url;
  this.render();
  this.syncBar();
  this.save();
 }

 render() {
  const list = this.list;
  for (const tab of this.tabs) {
   if (!tab.el) {
    tab.el = element('div', 'browser-tab', `<span class="browser-tab-icon"></span><span class="browser-tab-title"></span><button type="button" class="browser-tab-close" tabindex="-1" aria-label="${I18n.t('browser.closeTab')}">${ICONS.close}</button>`);
    tab.el.setAttribute('role', 'tab');
    if (!reducedMotion()) tab.el.animate([{ opacity: 0, transform: 'translateY(4px) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE });
   }
   const title = tab.title || (blank(tab.url) ? I18n.t('browser.newTab') : hostOf(tab.url) || tab.url);
   tab.el.querySelector('.browser-tab-title').textContent = title;
   tab.el.title = blank(tab.url) ? title : `${title}\n${tab.url}`;
   tab.el.classList.toggle('is-active', tab === this.active);
   tab.el.classList.toggle('is-loading', tab.loading);
   tab.el.setAttribute('aria-selected', String(tab === this.active));
   const icon = tab.el.querySelector('.browser-tab-icon');
   const key = tab.loading ? 'loading' : tab.icon || 'globe';
   if (icon.dataset.key !== key) {
    icon.dataset.key = key;
    icon.innerHTML = tab.loading ? '<span class="browser-spinner"></span>' : tab.icon ? '' : Glyphs.globe;
    if (tab.icon && !tab.loading) {
     const img = new Image();
     img.alt = '';
     img.onerror = () => { icon.dataset.key = 'globe'; icon.innerHTML = Glyphs.globe; };
     img.src = tab.icon;
     icon.append(img);
    }
   }
   if (tab.el.parentElement !== list || tab.el !== list.children[this.tabs.indexOf(tab)]) list.insertBefore(tab.el, list.children[this.tabs.indexOf(tab)] || null);
  }
  const tab = this.active;
  this.root.classList.toggle('is-blank', !tab || !tab.view);
  this.root.classList.toggle('is-loading', !!tab?.loading);
  this.error.hidden = !tab?.error;
  if (tab?.error) this.error.querySelector('.browser-error-code').textContent = `${hostOf(tab.url) || tab.url} · ${tab.error}`;
 }

 syncBar(force = false) {
  const tab = this.active, view = tab?.view;
  const ready = !!(view && tab.id);
  this.backButton.disabled = !ready || !view.canGoBack();
  this.forwardButton.disabled = !ready || !view.canGoForward();
  this.reloadButton.disabled = !ready;
  this.reloadButton.innerHTML = tab?.loading ? ICONS.stop : ICONS.reload;
  this.reloadButton.setAttribute('aria-label', I18n.t(tab?.loading ? 'browser.stop' : 'browser.reload'));
  const url = blank(tab?.url) ? '' : tab.url;
  if (force || !this.root.classList.contains('is-editing')) this.url.value = url;
  this.urlView.textContent = '';
  if (!url) return;
  try {
   const parsed = new URL(url);
   const lead = parsed.protocol === 'https:' ? '' : `${parsed.protocol}//`;
   const hostName = parsed.host.replace(/^www\./, '');
   const rest = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`;
   if (lead) this.urlView.append(element('span', 'browser-url-dim', lead));
   this.urlView.append(element('span', 'browser-url-host', hostName), element('span', 'browser-url-dim', decodeURI(rest)));
  } catch {
   this.urlView.textContent = url;
  }
 }

 save() {
  write(STORE, {
   open: this.open,
   width: this.width,
   tabs: this.tabs.filter(tab => !blank(tab.url)).map(tab => ({ url: tab.url, title: tab.title })),
   active: Math.max(0, this.tabs.filter(tab => !blank(tab.url)).indexOf(this.active)),
  });
 }

 report() {
  bridge?.shown({ open: this.open, id: this.active?.id || 0 });
 }

 onEvent(data) {
  const from = this.tabs.find(tab => tab.id === data.id);
  if (data.type === 'open') this.newTab(data.url, { after: from, background: data.background });
  else if (data.type === 'key') {
   if (data.action === 'address') this.url.focus();
   else if (data.action === 'new') this.newTab();
   else if (data.action === 'close' && from) this.close(from);
  } else if (data.type === 'pointer') {
   if (from && from === this.active && this.open) this.point(data.x, data.y);
  } else if (data.type === 'download') {
   this.notify(I18n.t('browser.downloaded', { name: data.name }));
  }
 }

 notify(text) {
  const toast = this.toast;
  toast.textContent = text;
  toast.hidden = false;
  toast.classList.remove('is-shown');
  void toast.offsetWidth;
  toast.classList.add('is-shown');
  clearTimeout(this.toastTimer);
  this.toastTimer = setTimeout(() => toast.classList.remove('is-shown'), TOAST_TIME);
 }

 point(x, y) {
  const cursor = this.cursor, from = this.cursorAt || { x: this.stage.clientWidth / 2, y: this.stage.clientHeight * 0.62 };
  this.cursorAt = { x, y };
  cursor.classList.add('is-shown');
  clearTimeout(this.cursorTimer);
  this.cursorTimer = setTimeout(() => { cursor.classList.remove('is-shown'); this.cursorAt = null; }, CURSOR.hide);
  const ripple = () => {
   const ring = element('span', 'browser-ripple');
   ring.style.translate = `${x}px ${y}px`;
   this.stage.append(ring);
   ring.addEventListener('animationend', () => ring.remove());
  };
  if (reducedMotion()) {
   cursor.style.translate = `${x}px ${y}px`;
   ripple();
   return;
  }
  cursor.getAnimations().forEach(animation => animation.cancel());
  cursor.style.translate = `${x}px ${y}px`;
  cursor.animate([{ translate: `${from.x}px ${from.y}px` }, { translate: `${x}px ${y}px` }], { duration: CURSOR.duration, easing: EASE })
   .finished.then(ripple, () => {});
 }

 signedIn(host) {
  const name = host.replace(/^www\./, '');
  if (!name) return;
  this.accounts = [{ host: name, at: Date.now() }, ...this.accounts.filter(item => item.host !== name)].slice(0, 30);
  write(ACCOUNTS, this.accounts);
 }

 drive(key, on) {
  const had = this.drivers.size > 0;
  if (on) this.drivers.add(key);
  else this.drivers.delete(key);
  if (!this.drivers.size) { this.control = 'agent'; this.release(); }
  if (on && !had && this.control === 'agent') this.active?.view?.blur();
  this.sync();
 }

 get userHas() {
  return this.control === 'user' && this.drivers.size > 0;
 }

 take() {
  this.control = 'user';
  this.sync();
  this.active?.view?.focus();
 }

 handBack() {
  this.control = 'agent';
  this.active?.view?.blur();
  this.sync();
  this.release();
 }

 waitForAgent() {
  return new Promise(resolve => this.waiters.push(resolve));
 }

 release() {
  for (const resolve of this.waiters.splice(0)) resolve();
 }

 sync() {
  const driving = this.drivers.size > 0;
  this.root.classList.toggle('is-agent', driving);
  this.root.classList.toggle('is-driving', driving && this.control === 'agent');
  this.root.classList.toggle('is-user', driving && this.control === 'user');
  this.toggle.toggleAttribute('live', driving);
 }

 async ensure() {
  let tab = this.active;
  if (!tab) tab = this.newTab('', { focus: false });
  if (!tab.view) this.createView(tab, blank(tab.url) ? 'about:blank' : tab.url);
  await tab.ready;
  return tab;
 }

 tabsText() {
  if (!this.tabs.length) return 'No tabs are open.';
  return this.tabs.map((tab, k) => `${k + 1}. ${tab.title || (blank(tab.url) ? 'New tab' : hostOf(tab.url))}${blank(tab.url) ? '' : ` (${tab.url})`}${tab === this.active ? ' active' : ''}`).join('\n');
 }

 async run(name, args, { id, cwd }) {
  if (!tools) return { error: 'The browser is only available in the desktop app' };
  if (name === 'browser_tabs') return this.tabsTool(args, { id, cwd });
  const tab = await this.ensure();
  return tools.run(id, name, { ...args, tab: tab.id }, cwd);
 }

 async tabsTool(args, { id, cwd }) {
  const action = String(args.action || 'list').toLowerCase();
  const pick = () => {
   const tab = this.tabs[Math.round(Number(args.tab)) - 1];
   if (!tab) throw new Error(`There is no tab ${args.tab}. Tabs:\n${this.tabsText()}`);
   return tab;
  };
  try {
   if (action === 'new') {
    const tab = this.newTab('', { focus: false });
    if (!args.url) return { text: `Opened a new empty tab.\n\nTabs:\n${this.tabsText()}` };
    await this.ensure();
    const result = await tools.run(id, 'browser_navigate', { url: args.url, tab: tab.id }, cwd);
    return result.error ? result : { ...result, text: `Tabs:\n${this.tabsText()}\n\n${result.text}` };
   }
   if (action === 'switch') {
    this.select(pick());
    const tab = await this.ensure();
    return tools.run(id, 'browser_snapshot', { tab: tab.id }, cwd);
   }
   if (action === 'close') {
    this.close(pick());
    return { text: `Closed. Tabs:\n${this.tabsText()}` };
   }
   return { text: `Tabs:\n${this.tabsText()}` };
  } catch (error) {
   return { error: error.message };
  }
 }

 tabsLine() {
  return this.tabs.length > 1 ? `Tabs: ${this.tabs.map((tab, k) => `${k + 1}. ${tab.title || hostOf(tab.url) || 'New tab'}${tab === this.active ? ' (this one)' : ''}`).join(' · ')}` : '';
 }

 context() {
  const lines = [`- The browser panel is ${this.open ? 'open, the user sees the page' : 'closed; the browser still works, the user can open it with the globe button'}.`];
  const tabs = this.tabs.filter(tab => !blank(tab.url));
  if (tabs.length) lines.push(`- Open tabs:\n${this.tabsText().split('\n').map(line => `  ${line}`).join('\n')}`);
  else lines.push('- No pages are open in it yet.');
  if (this.accounts.length) lines.push(`- The user signed in with this browser to: ${this.accounts.map(item => `${item.host} (${shortDate(item.at)})`).join(', ')}. Logins stay between chats but can expire; check before relying on one.`);
  return lines.join('\n');
 }
}

window.BrowserPanel = BrowserPanel;
})();
