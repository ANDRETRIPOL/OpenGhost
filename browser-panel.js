(() => {
'use strict';

const PARTITION = 'persist:browser';
const STORE = 'openghost.browser';
const ACCOUNTS = 'openghost.browser.accounts';
const TABS_MAX = 12;
const WIDTH = { share: 0.44, min: 360, chat: 400 };
const CURSOR = { hide: 2600 };
const TOAST_TIME = 4200;
const READY_MS = 15000;
const OPERATION_MS = 90000;
const fault = (code, message) => Object.assign(new Error(message), { code });

function interruptible(promise, signal, ms, message) {
 let timer, stop;
 return new Promise((resolve, reject) => {
  promise.then(resolve, reject);
  if (signal?.aborted) { reject(signal.reason); return; }
  stop = () => queueMicrotask(() => reject(signal.reason));
  signal?.addEventListener('abort', stop, { once: true });
  timer = setTimeout(() => reject(fault('timeout', message)), ms);
 }).finally(() => {
  clearTimeout(timer);
  signal?.removeEventListener('abort', stop);
 });
}
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
  this.lent = null;
  this.waiters = [];
  this.jobs = new Map();
  this.cancelling = new Map();
  this.taking = null;
  this.takeToken = null;
  this.queue = Promise.resolve();
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
  const yieldKeys = event => {
   const target = event.target;
   if (target instanceof Element && this.root.contains(target)) return;
   for (const tab of this.tabs) tab.view?.blur();
  };
  document.addEventListener('pointerdown', yieldKeys, true);
  document.addEventListener('focusin', yieldKeys, true);
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
     <div class="browser-cursor" aria-hidden="true"><img class="browser-cursor-arrow" src="desktop/cursor.png" alt=""></div>
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
  const tab = { url, title, icon: '', loading: false, error: '', view: null, id: 0, ready: null, el: null, revision: 0, state: 'lazy' };
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

 discardView(tab, reason, exceptJob) {
  for (const [id, job] of this.jobs) if (job.tab === tab && id !== exceptJob) this.cancel(id, reason);
  tab.disposeView?.(reason);
  const view = tab.view;
  tab.view = null;
  tab.id = 0;
  tab.state = 'gone';
  tab.revision++;
  view?.remove();
 }

 createView(tab, url, exceptJob) {
  if (tab.view) this.discardView(tab, fault('tab_gone', 'This browser view was replaced'), exceptJob);
  const view = document.createElement('webview');
  view.className = 'browser-view';
  view.setAttribute('partition', PARTITION);
  view.setAttribute('allowpopups', '');
  view.setAttribute('src', url || 'about:blank');
  tab.view = view;
  tab.url = blank(url) ? tab.url : url;
  tab.state = 'loading';
  const listeners = [];
  const listen = (name, callback) => {
   const guarded = event => { if (tab.view === view && this.tabs.includes(tab)) callback(event); };
   listeners.push([name, guarded]);
   view.addEventListener(name, guarded);
  };
  let failReady;
  tab.ready = new Promise((resolve, reject) => {
   let settled = false;
   const finish = error => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    tab.failReady = null;
    if (error) { tab.state = 'failed'; tab.error = error.message; reject(error); }
    else { tab.state = 'ready'; resolve(tab); }
    this.report();
   };
   const timer = setTimeout(() => finish(fault('timeout', 'The browser did not become ready in time')), READY_MS);
   tab.failReady = failReady = finish;
   listen('dom-ready', () => {
    if (settled) return;
    try {
     const id = view.getWebContentsId();
     if (!id) throw fault('tab_gone', 'This browser tab is gone');
     tab.id = id;
     finish();
    } catch (error) { finish(fault('tab_gone', error.message)); }
   });
  });
  tab.disposeView = error => {
   failReady(error);
   for (const [name, callback] of listeners) view.removeEventListener(name, callback);
   tab.disposeView = null;
  };
  tab.ready.catch(() => {});
  const update = () => { this.render(); if (tab === this.active) this.syncBar(); };
  listen('did-start-navigation', event => { if (event.isMainFrame) tab.revision++; });
  listen('did-start-loading', () => { tab.loading = true; tab.error = ''; update(); });
  listen('did-stop-loading', () => {
   tab.loading = false;
   const now = view.getURL();
   if (!blank(now)) tab.url = now;
   tab.title = view.getTitle() || tab.title;
   update();
   this.save();
  });
  listen('page-title-updated', event => { tab.title = event.title; update(); });
  listen('page-favicon-updated', event => { tab.icon = event.favicons?.[0] || ''; update(); });
  listen('did-navigate', event => { if (hostOf(event.url) !== hostOf(tab.url)) tab.icon = ''; if (!blank(event.url)) tab.url = event.url; update(); });
  listen('did-navigate-in-page', event => { if (event.isMainFrame && !blank(event.url)) { tab.url = event.url; update(); } });
  listen('did-fail-load', event => {
   if (!event.isMainFrame || event.errorCode === -3) return;
   tab.error = event.errorDescription || `Error ${event.errorCode}`;
   tab.failReady?.(fault('navigation_failed', tab.error));
   tab.loading = false;
   update();
  });
  const gone = error => {
   this.discardView(tab, error);
   tab.error = error.message;
   tab.loading = false;
   update();
  };
  listen('render-process-gone', () => gone(fault('guest_crashed', 'The browser page crashed. Open the page again.')));
  listen('destroyed', () => gone(fault('tab_gone', 'This browser tab is gone')));
  listen('ipc-message', event => { if (event.channel === 'signin') this.signedIn(String(event.args[0] || '')); });
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

 close(tab, { quiet = false, exceptJob } = {}) {
  const at = this.tabs.indexOf(tab);
  if (at < 0) return;
  this.tabs.splice(at, 1);
  this.discardView(tab, fault('tab_gone', 'This browser tab was closed'), exceptJob);
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
   if (this.control === 'agent' && from && from === this.active && this.open) this.point(data.x, data.y);
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
  const dx = x - from.x, dy = y - from.y, dist = Math.hypot(dx, dy);
  if (reducedMotion() || dist < 3) {
   cursor.style.translate = `${x}px ${y}px`;
   ripple();
   return;
  }
  const nx = -dy / dist, ny = dx / dist;
  const bend = Math.min(32, dist * 0.14) * (Math.random() < 0.5 ? -1 : 1);
  const steps = dist < 90 ? 10 : 16;
  const frames = [];
  for (let i = 0; i <= steps; i++) {
   const t = i / steps;
   const s = (10 * t ** 3) - (15 * t ** 4) + (6 * t ** 5);
   const arc = Math.sin(Math.PI * t) * bend;
   frames.push({ translate: `${from.x + dx * s + nx * arc}px ${from.y + dy * s + ny * arc}px`, offset: t });
  }
  const duration = Math.round(Math.min(400, Math.max(170, 60 + 90 * Math.log2(dist / 26 + 1))));
  cursor.getAnimations().forEach(animation => animation.cancel());
  cursor.style.translate = `${x}px ${y}px`;
  cursor.animate(frames, { duration, easing: 'linear' }).finished.then(ripple, () => {});
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
  if (!this.drivers.size) { this.takeToken = null; this.taking = null; this.control = 'agent'; this.release(); }
  if (on && !had && this.control === 'agent') this.active?.view?.blur();
  this.sync();
 }

 get userHas() {
  return this.control !== 'agent' && this.drivers.size > 0;
 }

 take() {
  if (this.taking) return this.taking;
  const token = this.takeToken = {};
  this.control = 'taking';
  for (const id of this.jobs.keys()) this.cancel(id, fault('taken', 'The user took control'));
  this.sync();
  this.taking = Promise.all(this.cancelling?.values() || []).then(() => {
   if (this.takeToken !== token) return;
   this.control = 'user';
   this.sync();
   this.active?.view?.focus();
  }, error => {
   if (this.takeToken === token) this.notify(`Could not confirm browser cancellation: ${error.message}`);
  }).finally(() => { if (this.takeToken === token) this.taking = null; });
  return this.taking;
 }

 handBack() {
  if (this.control === 'taking') return;
  this.control = 'agent';
  // The keyboard leaves the page with the user, and comes back to it for the agent's next step that types.
  this.lent = this.active?.view || null;
  this.active?.view?.blur();
  this.sync();
  this.release();
 }

 waitForAgent(signal) {
  return new Promise(resolve => {
   const done = () => {
    const at = this.waiters.indexOf(done);
    if (at >= 0) this.waiters.splice(at, 1);
    signal?.removeEventListener('abort', done);
    resolve();
   };
   if (!this.userHas || signal?.aborted) { resolve(); return; }
   this.waiters.push(done);
   signal?.addEventListener('abort', done, { once: true });
  });
 }

 release() {
  for (const resolve of this.waiters.splice(0)) resolve();
 }

 sync() {
  const driving = this.drivers.size > 0;
  this.root.classList.toggle('is-agent', driving);
  this.root.classList.toggle('is-driving', driving && this.control !== 'user');
  this.root.classList.toggle('is-user', driving && this.control === 'user');
  this.toggle.toggleAttribute('live', driving);
 }

 async ensure(tab = this.active, signal, jobId) {
  if (signal?.aborted) throw signal.reason;
  if (!tab) tab = this.newTab('', { focus: false });
  if (!this.tabs.includes(tab)) throw fault('tab_gone', 'This browser tab was closed');
  if (tab.state === 'failed') this.discardView(tab, fault('tab_gone', 'This browser view was replaced'), jobId);
  if (!tab.view) this.createView(tab, blank(tab.url) ? 'about:blank' : tab.url, jobId);
  const job = this.jobs.get(jobId);
  if (job) job.tab = tab;
  const view = tab.view;
  await interruptible(tab.ready, signal, READY_MS, 'The browser did not become ready in time');
  if (signal?.aborted) throw signal.reason;
  if (!this.tabs.includes(tab) || tab.view !== view || tab.state !== 'ready') throw fault('tab_gone', 'This browser view is no longer available');
  return tab;
 }

 tabsText() {
  if (!this.tabs.length) return 'No tabs are open.';
  return this.tabs.map((tab, k) => `${k + 1}. ${tab.title || (blank(tab.url) ? 'New tab' : hostOf(tab.url))}${blank(tab.url) ? '' : ` (${tab.url})`}${tab === this.active ? ' active' : ''}`).join('\n');
 }

 // A click of the agent's moves the keyboard into the page, as any click would, and the user's typing in the chat would
 // then land in the page. So between the agent's steps the keyboard is back where the user was, and a step that types or
 // presses keys where the page's focus is gets the keyboard back first, exactly as it would have had it without the user:
 // what the agent does and sees stays the same, and Escape reaches the app during every other step.
 async run(name, args, { id, cwd, signal }) {
  if (!tools) return { error: 'The browser is only available in the desktop app' };
  if (!id || this.jobs.has(id)) return { error: 'Invalid or duplicate browser job id', code: 'invalid_request' };
  const controller = new AbortController(), back = document.activeElement;
  const stop = () => { this.cancel(id); };
  this.jobs.set(id, controller);
  if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop, { once: true });
  // Resolve numeric selection at receipt, not after waiting behind another chat.
  const target = name === 'browser_tabs' ? this.tabs[Math.round(Number(args.tab)) - 1] : this.active;
  controller.tab = target;
  const revision = target?.revision;
  const previous = this.queue || Promise.resolve();
  const check = () => {
   if (controller.signal.aborted) throw controller.signal.reason;
   if (this.control !== 'agent') throw fault('taken', 'The user took control');
   if (target && !this.tabs.includes(target)) throw fault('tab_gone', 'This browser tab was closed');
   if (target && revision !== target.revision) throw fault('stale_page', 'The page changed while this call was waiting. Take a new snapshot.');
   if (name !== 'browser_tabs' && this.active !== target) throw fault('stale_tab', 'The active tab changed. Take a new snapshot.');
  };
  const work = (async () => {
   await interruptible(previous, controller.signal, OPERATION_MS, 'Browser queue timed out');
   check();
   if (name === 'browser_tabs') return this.tabsTool(args, { id, cwd, check, target, signal: controller.signal });
   const tab = await this.ensure(target, controller.signal, id);
   const keys = name === 'browser_press' || (name === 'browser_type' && (args.ref == null || args.ref === ''));
   if (keys && this.lent === tab.view) tab.view.focus();
   return this.dispatch(id, name, args, tab, controller.signal, cwd);
  })();
  this.queue = Promise.allSettled([previous, work]).then(() => {});
  try {
   return await interruptible(work, null, OPERATION_MS, 'Browser operation timed out');
  } catch (error) {
   if (error.code === 'timeout') this.cancel(id, error);
   if (error.code === 'taken' && !signal?.aborted) return { taken: true };
   return { error: error.message, code: error.code || 'browser_error', stopped: error.code === 'cancelled' };
  } finally {
   signal?.removeEventListener('abort', stop);
   this.jobs.delete(id);
   this.giveBack(back);
  }
 }

 dispatch(id, name, args, tab, signal, cwd) {
  if (signal.aborted) throw signal.reason;
  if (this.control !== 'agent') throw fault('taken', 'The user took control');
  if (!this.tabs.includes(tab) || !tab.id) throw fault('tab_gone', 'This browser tab is gone');
  if (this.active !== tab) throw fault('stale_tab', 'The active tab changed during readiness');
  return interruptible(tools.run(id, name, { ...args, tab: tab.id }, cwd), signal, OPERATION_MS, 'Browser operation timed out');
 }

 cancel(id, reason = fault('cancelled', 'Stopped by the user')) {
  this.cancelling ||= new Map();
  if (this.cancelling.has(id)) return this.cancelling.get(id);
  const job = this.jobs.get(id);
  if (!job) return Promise.resolve();
  job.abort(reason);
  let reply;
  try {
   if (!tools?.cancel) throw fault('unavailable', 'Browser cancellation is not available');
   reply = Promise.resolve(tools.cancel(id));
  } catch (error) { reply = Promise.reject(error); }
  const pending = interruptible(reply, null, OPERATION_MS, 'Browser cancellation was not acknowledged');
  this.cancelling.set(id, pending);
  // Keep failed acknowledgements: Take Control must not falsely grant ownership.
  pending.then(() => this.cancelling.delete(id), () => {});
  return pending;
 }

 giveBack(back) {
  const view = document.activeElement;
  if (this.control !== 'agent' || !this.tabs.some(tab => tab.view === view)) return;
  if (!(back instanceof HTMLElement) || !back.isConnected || back === view || this.tabs.some(tab => tab.view === back)) return;
  this.lent = view;
  view.blur();
  back.focus({ preventScroll: true });
 }

 async tabsTool(args, { id, cwd, check, target, signal }) {
  const action = String(args.action || 'list').toLowerCase();
  const pick = () => {
   if (!target) throw fault('tab_gone', `There is no tab ${args.tab}. Tabs:\n${this.tabsText()}`);
   return target;
  };
  check();
  if (action === 'new') {
   const tab = this.newTab('', { focus: false });
   if (!args.url) return { text: `Opened a new empty tab.\n\nTabs:\n${this.tabsText()}` };
   await this.ensure(tab, signal, id);
   const result = await this.dispatch(id, 'browser_navigate', { url: args.url }, tab, signal, cwd);
   return result.error ? result : { ...result, text: `Tabs:\n${this.tabsText()}\n\n${result.text}` };
  }
  if (action === 'switch') {
   this.select(pick());
   const tab = await this.ensure(target, signal, id);
   return this.dispatch(id, 'browser_snapshot', {}, tab, signal, cwd);
  }
  if (action === 'close') {
   this.close(pick(), { exceptJob: id });
   return { text: `Closed. Tabs:\n${this.tabsText()}` };
  }
  return { text: `Tabs:\n${this.tabsText()}` };
 }

 tabsLine() {
  return this.tabs.length > 1 ? `Tabs: ${this.tabs.map((tab, k) => `${k + 1}. ${tab.title || hostOf(tab.url) || 'New tab'}${tab === this.active ? ' (this one)' : ''}`).join(' · ')}` : '';
 }

 // What the browser holds, for the note at the end of each request; a closed browser with nothing in it says nothing.
 context() {
  const tabs = this.tabs.filter(tab => !blank(tab.url));
  if (!this.open && !tabs.length && !this.accounts.length) return '';
  const lines = [`- The browser panel is ${this.open ? 'open, the user sees the page' : 'closed; the browser still works, the user can open it with the globe button'}.`];
  if (tabs.length) lines.push(`- Open tabs:\n${this.tabsText().split('\n').map(line => `  ${line}`).join('\n')}`);
  else lines.push('- No pages are open in it yet.');
  if (this.accounts.length) lines.push(`- The user signed in with this browser to: ${this.accounts.map(item => `${item.host} (${shortDate(item.at)})`).join(', ')}. Logins stay between chats but can expire; check before relying on one.`);
  return lines.join('\n');
 }
}

window.BrowserPanel = BrowserPanel;
})();
