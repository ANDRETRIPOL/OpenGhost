(() => {
'use strict';

// Usage at a glance. The gauge at the foot of the sidebar calls a small panel that stands right over it, inside the
// sidebar: a pane of glass made after the glass of a folder opened on an iPhone (its measures are in styles.css),
// clear enough for what is behind the window to colour it. It comes and goes as the search and the settings do.
//
// The glass has no blur of its own. The window is clear under the sidebar, and a blur laid over a clear window lays the
// window's own tint on a second time, so the glass went dull and let little through. What is behind the app is blurred
// by the system already; all the page draws under the pane is the list of chats, and that steps back instead: it fades
// out as it nears the pane and is out of sight under it for as long as the pane is there.
//
// It is the quick look: for each provider whose account tells something, what matters most about it — the ChatGPT
// plan and its limits, each on a small gauge, the balance on a DeepSeek account, what an OpenRouter key has left or
// has spent. Counts of tokens and the rest are on the whole page, which the line at the foot opens.
//
// What the providers say takes a moment to come, so nothing here waits on it. The panel opens with what they said last
// (kept on this computer), every row already in its place; where nothing is known yet, quiet bars hold the place of the
// words. The answer is then written into the same rows: the words come up, the gauges run to their marks, and a row
// there was no room for opens its own. Pointing at the button asks ahead of the press.
// The providers whose accounts tell something: a plan and limits, a balance, what a key has left. The others have
// only counts of tokens to show, and those are on the whole page.
const ORDER = ['chatgpt', 'deepseek', 'openrouter'];
const PLANS = {
 free: 'Free', go: 'Go', plus: 'Plus', prolite: 'Pro 5x', pro: 'Pro 20x', team: 'Team', business: 'Business',
 self_serve_business_usage_based: 'Business', enterprise: 'Enterprise', enterprise_cbp_usage_based: 'Enterprise', edu: 'Edu',
};
const KEEP = 'openghost.usage.peek';
// The providers are asked again every minute while the panel is open, and not twice within a few seconds.
const REFRESH = 60000;
const FRESH = 15000;
const HOUR = 3600, DAY = 86400;
// No more limits than this are listed here; the page in the settings has them all. While the first answer is on its
// way, this many rows hold the limits' place.
const LIMITS = 4;
const WAITING = 2;
// The panel is as wide as the row its button stands in, within these, and keeps this far from the window's edges and
// above the row. Its corners reach in by this share of its width, as the folder's do, and what it holds keeps in
// from its sides by a share of the width too.
const WIDTH = [220, 340];
const ROUND = 0.127;
const PAD = { share: 0.065, least: 16, most: 20 };
const EDGE = 8;
const LIFT = 6;
// It comes and goes as the search's panel does: in from a little wider and flatter and out of a slight blur, away a
// little larger into a deeper one, quicker.
const OPEN = { duration: 133, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' };
const CLOSE = { duration: 110, easing: 'ease-out', fill: 'forwards' };
const FROM = { opacity: 0, transform: 'scale(1.09, 0.96)', filter: 'blur(4px)' };
const REST = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
const AWAY = { opacity: 0, transform: 'scale(1.06)', filter: 'blur(12px)' };
// Once it is in, the gauges run to their marks.
const FILL = 90;
// A row that comes or goes after the panel is open makes or gives up its own room.
const ROOM = { duration: 460, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' };
const WORDS = { duration: 380, easing: 'ease-out' };
// A limit's gauge: the dial of the button's own, three quarters of a circle, drawn as far as the limit is used.
const DIAL = 'M7.34 20.66A9 9 0 1 1 20.66 20.66';
const GAUGE = `<svg class="peek-gauge" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path class="peek-gauge-track" d="${DIAL}" pathLength="1"/><path class="peek-gauge-mark" d="${DIAL}" pathLength="1"/></svg>`;
const CROSS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
const CHEVRON = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const money = (value, currency) => new Intl.NumberFormat(I18n.lang, { style: 'currency', currency }).format(value);
const element = (tag, className, html = '') => Object.assign(document.createElement(tag), { className, innerHTML: html });

// A limit's window named by how long it runs: 5 hours, week, month.
function windowName(seconds) {
 if (seconds >= 27 * DAY && seconds <= 32 * DAY) return I18n.t('usage.window.month');
 if (seconds === 7 * DAY) return I18n.t('usage.window.week');
 if (seconds === DAY) return I18n.t('usage.window.day');
 if (seconds > DAY && seconds % DAY === 0) return I18n.t('usage.window.days', { n: seconds / DAY });
 if (seconds >= HOUR && seconds % HOUR === 0) return I18n.t('usage.window.hours', { n: seconds / HOUR });
 return I18n.t('usage.window.minutes', { n: Math.max(1, Math.round(seconds / 60)) });
}

// When a limit starts over: in minutes or hours while it is close, then the day and the time.
function resetText(at) {
 if (!at) return '';
 const left = at - Date.now();
 if (left < 60000) return I18n.t('usage.reset.soon');
 const minutes = Math.round(left / 60000);
 if (minutes < 60) return I18n.t('usage.reset.minutes', { m: minutes });
 if (minutes < 24 * 60) return I18n.t('usage.reset.hours', { h: Math.floor(minutes / 60), m: minutes % 60 });
 const near = left < 6 * DAY * 1000;
 const when = new Intl.DateTimeFormat(I18n.lang, near ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(at);
 return I18n.t('usage.reset.at', { when });
}

// What was read from the providers the last time, on this computer or in this sitting: 'asking' while they are asked,
// 'failed' once an answer did not come.
function kept() {
 let saved = {};
 try { saved = JSON.parse(localStorage.getItem(KEEP)) || {}; } catch {}
 const part = data => ({ data: data || null, asking: false, failed: false });
 return { limits: part(saved.limits), balance: part(Array.isArray(saved.balance) ? saved.balance : null), credits: part(saved.credits) };
}

class UsagePeek {
 constructor({ button, settings }) {
  Object.assign(this, { button, settings }, kept());
  this.state = 'closed';
  this.leaving = null;
  this.timer = 0;
  this.asked = 0;
  const t = key => escapeHtml(I18n.t(key));
  const root = this.root = element('div', 'usage-peek glass-lens');
  root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', I18n.t('settings.usage'));
  root.innerHTML = `
   <header class="peek-top">
    <span class="peek-title" aria-hidden="true">${t('settings.usage')}</span>
    <button type="button" class="peek-close" aria-label="${t('usage.peek.close')}">${CROSS}</button>
   </header>
   <div class="peek-body">
    <div class="peek-list"></div>
    <p class="peek-note is-alone" hidden>${t('usage.peek.empty')}</p>
    <div class="peek-foot"><button type="button" class="peek-all"><span>${t('usage.peek.all')}</span>${CHEVRON}</button></div>
   </div>`;
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  this.cross = $('.peek-close');
  this.list = $('.peek-list');
  this.hint = $('.peek-note.is-alone');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');

  button.addEventListener('usage-open', event => this.toggle(!!event.detail?.keyboard));
  // The pointer over the button is a press about to come: the providers are asked now, and their answer is there sooner.
  button.addEventListener('pointerenter', () => this.refresh());
  this.cross.addEventListener('click', event => this.close({ focusButton: event.detail === 0 }));
  $('.peek-all').addEventListener('click', () => {
   this.close({ instant: true });
   settings.open();
   settings.page('usage');
  });
  document.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || event.defaultPrevented || this.state !== 'open') return;
   event.preventDefault();
   this.close({ focusButton: true });
  });
  root.addEventListener('focusout', event => {
   if (this.state === 'open' && event.relatedTarget instanceof Node && !root.contains(event.relatedTarget) && !button.contains(event.relatedTarget)) this.close();
  });
  // A press anywhere else puts the panel away.
  document.addEventListener('pointerdown', event => {
   if (this.state !== 'open') return;
   const path = event.composedPath();
   if (!path.includes(root) && !path.includes(button)) this.close();
  }, true);
  window.addEventListener('resize', () => this.close({ instant: true }));
  // A row that comes after the pane is open makes it taller: the list steps back as far as the pane now reaches.
  new ResizeObserver(() => { if (this.state === 'open') this.cut(); }).observe(root);
 }

 toggle(keyboard = false) {
  if (this.state === 'open') this.close({ focusButton: keyboard });
  else this.open();
 }

 open() {
  if (this.state === 'closing') this.finish();
  if (this.state === 'open') return;
  this.state = 'open';
  // Asked first: what is not known yet is then drawn as on its way.
  this.refresh();
  const still = reducedMotion();
  this.paint(!still);
  this.root.showPopover();
  this.place();
  this.under(true);
  this.button.setAttribute('aria-expanded', 'true');
  this.button.setAttribute('active', '');
  // While the panel is out its button is away, as the magnifier is while the search is open.
  this.button.classList.add('is-away');
  this.cross.focus({ preventScroll: true });
  this.root.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [FROM, REST], OPEN);
  if (!still) setTimeout(() => this.repaint(), FILL);
  this.timer = setInterval(() => this.refresh(true), REFRESH);
 }

 // The list of chats under the pane steps back while the pane is there, and comes back as the pane goes.
 under(on) {
  const list = this.listed = document.querySelector('.chats');
  if (!list) return;
  if (!on) { list.classList.remove('is-under-peek'); return; }
  this.cut();
  list.classList.add('is-peeked');
  // A frame later, so that it fades out, not vanishes.
  requestAnimationFrame(() => { if (this.state === 'open') list.classList.add('is-under-peek'); });
 }

 // How far down the list is seen: to the pane's top, where the pane stands at rest (on its way in it is drawn a
 // little out of its place).
 cut() {
  const list = this.listed, root = this.root;
  if (list) list.style.setProperty('--peek-cut', `${Math.round(innerHeight - parseFloat(root.style.bottom) - root.offsetHeight - list.getBoundingClientRect().top)}px`);
 }

 // The panel stands in the sidebar over the row its button is in, as wide as that row, and never reaches above the
 // list of chats: what stands over the list has nothing to step back.
 place() {
  const row = this.button.parentElement.getBoundingClientRect(), style = this.root.style, above = document.querySelector('.chats')?.getBoundingClientRect().top || 0;
  const width = Math.round(Math.max(WIDTH[0], Math.min(WIDTH[1], row.width, innerWidth - 2 * EDGE)));
  style.width = `${width}px`;
  style.setProperty('--peek-round', `${Math.round(width * ROUND)}px`);
  style.setProperty('--peek-pad', `${Math.round(Math.max(PAD.least, Math.min(PAD.most, width * PAD.share)))}px`);
  style.left = `${Math.round(Math.max(EDGE, Math.min(row.left, innerWidth - width - EDGE)))}px`;
  style.bottom = `${Math.round(innerHeight - row.top + LIFT)}px`;
  style.setProperty('--peek-room', `${Math.round(row.top - LIFT - Math.max(EDGE, above))}px`);
 }

 connected(provider) {
  return provider === 'chatgpt' ? !!this.settings.account.connected : this.settings.connected(provider);
 }

 // Asks the providers, unless they were asked a moment ago.
 refresh(again = false) {
  const now = Date.now();
  if (!again && now - this.asked < FRESH) return;
  this.asked = now;
  this.ask('limits', this.settings.account.connected && window.openghost?.auth?.limits, async () => (await window.openghost.auth.limits())?.limits);
  this.ask('balance', this.settings.keys.deepseek, async () => { const list = await DeepSeek.balance(this.settings.keys.deepseek); return list?.length ? list : null; });
  this.ask('credits', this.settings.keys.openrouter, () => Providers.account('openrouter', this.settings.keys.openrouter));
 }

 // One question to a provider. What it said before stays on screen while it is asked, and stays if no answer comes.
 async ask(name, can, read) {
  const part = this[name];
  if (!can || part.asking) return;
  part.asking = true;
  part.failed = false;
  const data = await read().catch(() => null);
  part.asking = false;
  part.failed = !data;
  if (data) part.data = data;
  try { localStorage.setItem(KEEP, JSON.stringify({ limits: this.limits.data, balance: this.balance.data, credits: this.credits.data })); } catch {}
  this.repaint();
 }

 repaint() {
  if (this.state === 'open') this.paint();
 }

 // What stands at the right of a provider's name: a quiet word and a value. `waiting`: its account is being asked for
 // the first time; a dash, when it told nothing.
 fact(provider, on) {
  const plain = { label: '', value: '—' };
  if (!on) return { label: I18n.t('usage.off'), value: '' };
  if (provider === 'chatgpt') {
   const plan = this.limits.data?.plan;
   if (plan) return { label: '', value: PLANS[plan] || plan.charAt(0).toUpperCase() + plan.slice(1) };
   return this.limits.asking ? { waiting: true } : plain;
  }
  if (provider === 'deepseek') {
   if (this.balance.data) return { label: I18n.t('usage.balance'), value: this.balance.data.map(item => money(item.total, item.currency)).join(' · ') };
   return this.balance.asking ? { waiting: true } : plain;
  }
  if (provider === 'openrouter') {
   const { free = false, left = null, spent = null } = this.credits.data || {};
   if (free) return { label: '', value: I18n.t('usage.freeTier') };
   if (left !== null) return { label: I18n.t('usage.peek.left'), value: money(left, 'USD') };
   if (spent) return { label: I18n.t('usage.spent'), value: money(spent, 'USD') };
   return this.credits.asking && !this.credits.data ? { waiting: true } : plain;
  }
  return plain;
 }

 // Everything the panel says, written into the rows that are there. `opening`: the panel is about to come in; nothing
 // moves yet, and the gauges start empty.
 paint(opening = false) {
  // Every provider that is connected has its row from the start: no answer adds or takes one.
  const providers = ORDER.filter(provider => this.connected(provider));
  const have = new Map([...this.list.children].map(el => [el.dataset.provider, el]));
  providers.forEach((provider, k) => {
   const section = have.get(provider) || this.section(provider);
   have.delete(provider);
   if (this.list.children[k] !== section) this.list.insertBefore(section, this.list.children[k] || null);
   this.paintProvider(section, provider, opening);
  });
  for (const gone of have.values()) gone.remove();
  this.hint.hidden = providers.length > 0;
 }

 section(provider) {
  const section = element('section', 'peek-provider', `
   <header class="peek-head">
    <span class="peek-name">${escapeHtml(I18n.t(`usage.name.${provider}`))}</span>
    <span class="peek-fact"><span class="peek-fact-label"></span><b class="peek-fact-value"></b></span>
   </header>
   ${provider === 'chatgpt' ? '<div class="peek-limits"><p class="peek-note" hidden></p></div>' : ''}`);
  section.dataset.provider = provider;
  return section;
 }

 paintProvider(section, provider, opening) {
  const on = this.connected(provider), fact = this.fact(provider, on), $ = selector => section.querySelector(selector);
  const box = $('.peek-fact'), label = $('.peek-fact-label'), value = $('.peek-fact-value'), was = box.classList.contains('is-waiting');
  section.classList.toggle('is-off', !on);
  box.classList.toggle('is-waiting', !!fact.waiting);
  label.textContent = fact.label || '';
  value.textContent = fact.value || '';
  // The words the bar was holding the place of come up out of it.
  if (was && !fact.waiting && !opening && !reducedMotion()) for (const el of [label, value]) el.animate([{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0px)' }], WORDS);
  const limits = $('.peek-limits');
  if (limits) this.paintLimits(limits, on, opening);
 }

 // The ChatGPT limits, the plan's own first and then those some models have; under them a line for the credits, or for
 // what went wrong. While the first answer is on its way, quiet rows hold their place. A window that has started over
 // since it was read is unknown again until the answer comes.
 paintLimits(box, on, opening) {
  const { data, asking, failed } = this.limits, now = Date.now(), note = box.querySelector('.peek-note');
  let rows = [], words = '';
  if (!on) rows = [];
  else if (data) {
   rows = [
    ...data.windows.map(span => ({ span, name: windowName(span.seconds) })),
    ...(data.models || []).flatMap(model => model.windows.map(span => ({ span, name: `${model.name} · ${windowName(span.seconds)}` }))),
   ].slice(0, LIMITS).map(row => ({ ...row, waiting: asking && !!row.span.resets && row.span.resets <= now }));
   words = data.credits ? (data.credits.unlimited ? I18n.t('usage.credits.unlimited') : I18n.t('usage.credits', { n: data.credits.balance })) : rows.length ? '' : I18n.t('usage.limits.none');
  } else if (asking) rows = Array.from({ length: WAITING }, () => ({ waiting: true }));
  else if (failed) words = I18n.t('usage.limits.error');
  const have = [...box.querySelectorAll('.peek-limit:not(.is-leaving)')];
  rows.forEach((row, k) => {
   let el = have[k];
   if (!el) {
    el = element('div', 'peek-limit is-waiting', `${GAUGE}<span class="peek-limit-name"></span><span class="peek-limit-used"></span><span class="peek-limit-reset"></span>`);
    box.insertBefore(el, note);
    if (!opening) this.room(el, true);
   }
   this.paintLimit(el, row, opening);
  });
  for (const el of have.slice(rows.length)) {
   if (opening) el.remove();
   else { el.classList.add('is-leaving'); this.room(el, false).then(() => el.remove()); }
  }
  if (words) note.textContent = words;
  if (!!words === !note.hidden) return;
  if (words) { note.hidden = false; if (!opening) this.room(note, true); }
  else if (opening) note.hidden = true;
  else this.room(note, false).then(() => { note.hidden = true; });
 }

 paintLimit(el, { span, name, waiting }, opening) {
  const $ = selector => el.querySelector(selector);
  el.classList.toggle('is-waiting', !!waiting);
  if (waiting) {
   el.classList.remove('is-high', 'is-full');
   el.style.setProperty('--used', 0);
   return;
  }
  const used = Math.round(span.used), reset = resetText(span.resets);
  el.classList.toggle('is-full', used >= 100);
  el.classList.toggle('is-high', used >= 80 && used < 100);
  $('.peek-limit-name').textContent = name;
  $('.peek-limit-name').title = name;
  $('.peek-limit-used').textContent = `${used}%`;
  // Used up, the share itself says so: the line under it has room only for when it starts over.
  $('.peek-limit-reset').textContent = reset || (used >= 100 ? I18n.t('usage.reached') : '');
  // The gauge runs to its mark from where it stands: from empty as the panel opens, from the old mark after that.
  el.style.setProperty('--used', opening ? 0 : Math.min(1, Math.max(0, span.used / 100)));
 }

 // A row's own room, opened or given up in one move.
 room(el, open) {
  if (reducedMotion() || this.state !== 'open') return Promise.resolve();
  const style = getComputedStyle(el), frames = [{ height: '0px', marginTop: '0px', opacity: 0 }, { height: `${el.offsetHeight}px`, marginTop: style.marginTop, opacity: 1 }];
  el.style.overflow = 'clip';
  const done = () => { el.style.overflow = ''; };
  return el.animate(open ? frames : frames.reverse(), { ...ROOM, fill: open ? 'none' : 'forwards' }).finished.then(done, done);
 }

 close({ instant = false, focusButton = false } = {}) {
  if (this.state !== 'open') return;
  this.state = 'closing';
  clearInterval(this.timer);
  this.button.setAttribute('aria-expanded', 'false');
  this.button.removeAttribute('active');
  this.under(false);
  if (instant || !this.root.matches(':popover-open')) { this.finish(focusButton); return; }
  this.root.classList.add('is-closing');
  const gone = this.leaving = this.root.animate(reducedMotion() ? { opacity: 0 } : AWAY, CLOSE);
  const done = () => { if (this.leaving === gone) this.finish(focusButton); };
  gone.finished.then(done, done);
 }

 finish(focusButton = false) {
  this.state = 'closed';
  this.leaving = null;
  clearInterval(this.timer);
  for (const animation of this.root.getAnimations({ subtree: true })) animation.cancel();
  this.button.removeAttribute('active');
  this.button.classList.remove('is-away');
  this.listed?.classList.remove('is-peeked', 'is-under-peek');
  if (this.root.matches(':popover-open')) this.root.hidePopover();
  this.root.classList.remove('is-closing');
  if (focusButton) this.button.focus({ preventScroll: true });
 }
}

window.UsagePeek = UsagePeek;
})();
