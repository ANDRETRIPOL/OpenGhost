(() => {
'use strict';

// The agent's helpers at the top of the chat (helpers.js), as a second island beside the plan's: two black capsules side
// by side, as an iPhone shows two things under way at once, each opening only into its own panel. The helpers' capsule
// shows their ghosts, each in its own tone, and how many are at work; pressed, it grows into a black panel with a row
// for each helper: its part, how long it has worked and what it does now. A row opens to the helper's last steps, a
// field to write to it and a button to stop it. While one island is open the other steps out of sight, so the two
// never read as one. With no plan, the helpers' capsule stands alone in the middle.
//
// The island is drawn after the plan island, which keeps its own layout: this one tells it how much room it takes beside
// it (PlanIsland.beside) and shifts it aside by half of that, so the pair stays in the middle.

const GAP = 8;
const PANEL = { width: 440, gutter: 32 };
const MORPH = { duration: 520, easing: 'cubic-bezier(0.32, 1.18, 0.5, 1)' };
const SHRINK = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const SHOW = { duration: 300, delay: 110, easing: 'ease-out', fill: 'backwards' };
const POP = { duration: 480, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' };
const AWAY = { duration: 240, easing: 'ease-in', fill: 'forwards' };
// The least width of the chat for the island to stand in; below it the helpers are still at work, only not shown.
const LEAST = 300;
const STACK = 3;
const TICK = '<svg class="helper-tick" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5"/><path d="M4.8 8.2l2.1 2.1 4.3-4.6"/></svg>';
// A ring drawn as the plan's capsule draws its own (plan-island.js), a size up to hold a number: it fills as the helpers
// finish, and the number inside is how many are still at work. Its middle is the middle of the capsule's round end.
const RING = (() => {
 const size = 20, stroke = 2.2, middle = size / 2, r = middle - stroke / 2 - 0.4, cap = stroke / (2 * Math.PI * r);
 return `<svg class="helper-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="helper-ring-track" cx="${middle}" cy="${middle}" r="${r}" stroke-width="${stroke}"/><circle class="helper-ring-arc" cx="${middle}" cy="${middle}" r="${r}" stroke-width="${stroke}" pathLength="1" stroke-dashoffset="${-cap / 2}" style="--helper-cap: ${cap}" transform="rotate(-90 ${middle} ${middle})"/></svg>`;
})();
const CUT = '<svg class="helper-cut" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.9"/><path d="M5.2 8h5.6"/></svg>';
const SEND = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3.5M4 7.5l4-4 4 4"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const element = (tag, className, text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
const quiet = animation => animation.finished.catch(() => {});
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// A class set only when it changes: a change to the plan island's classes is watched, and Chromium tells of a class
// removed that was not there as of a change, so a plain remove would be heard again, without end.
const flag = (el, name, on) => { if (el.classList.contains(name) !== on) el.classList.toggle(name, on); };
const ghost = tone => { const g = document.createElement('ghost-thinking'); g.style.setProperty('--ghost-rgb', tone); return g; };

class HelperIsland {
 constructor({ main, chat, plan = null }) {
  this.main = main;
  this.chat = chat;
  this.plan = plan;
  this.conv = null;
  this.state = 'shut';
  this.opened = new Set();
  chat.helpersOn = true;
  const root = this.root = element('div', 'helper-island');
  root.hidden = true;
  this.cap = element('button', 'helper-cap');
  this.cap.type = 'button';
  this.cap.setAttribute('aria-expanded', 'false');
  this.stack = element('span', 'helper-stack');
  this.sign = element('span', 'helper-sign');
  this.sign.innerHTML = RING;
  this.number = element('span', 'helper-number');
  this.end = element('span', 'helper-end');
  this.sign.append(this.number, this.end);
  this.cap.append(this.sign, this.stack);
  this.sheet = element('div', 'helper-sheet');
  this.sheet.setAttribute('role', 'dialog');
  this.head = element('button', 'helper-head');
  this.head.type = 'button';
  this.title = element('span', 'helper-title');
  this.sub = element('span', 'helper-sub');
  this.head.append(this.title, this.sub);
  this.list = element('ol', 'helper-lanes');
  this.sheet.append(this.head, this.list);
  root.append(this.cap, this.sheet);
  main.append(root);

  this.cap.addEventListener('click', () => this.open());
  this.head.addEventListener('click', event => this.close({ focus: event.detail === 0 }));
  this.list.addEventListener('click', event => this.onList(event));
  this.list.addEventListener('keydown', event => this.onKey(event));
  document.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || event.defaultPrevented || this.state !== 'open') return;
   event.preventDefault();
   this.close({ focus: true });
  });
  document.addEventListener('pointerdown', event => {
   if (this.state === 'open' && !event.composedPath().includes(root)) this.close();
  }, true);
  window.addEventListener('helpers-change', event => { if (!event.detail?.conv || event.detail.conv === this.chat.active) this.sync(); });
  new ResizeObserver(() => this.place()).observe(main);
  if (plan) {
   // The plan's capsule changes its width (a new step, the ring alone) and comes and goes; this one follows it.
   new ResizeObserver(() => this.place()).observe(plan.root);
   new MutationObserver(() => { this.syncBehind(); this.place(); }).observe(plan.root, { attributes: true, attributeFilter: ['hidden', 'class'] });
  }
  this.ticker = 0;
 }

 // What the chat on screen has to show: its helpers, or nothing.
 sync() {
  const conv = this.chat.active && !this.chat.active.locked ? this.chat.active : null;
  const helpers = conv ? this.chat.helpersOf(conv) : [];
  const same = conv === this.conv;
  this.conv = conv;
  this.helpers = helpers;
  if (!helpers.length) { this.hide(same); return; }
  if (!same) this.opened.clear();
  if (this.root.hidden) this.show(same);
  this.paintCap();
  if (this.state === 'open') this.paint(same);
  this.place();
  this.tick();
 }

 show(pop) {
  this.root.hidden = false;
  for (const animation of this.root.getAnimations()) animation.cancel();
  this.place();
  if (pop && !reducedMotion()) this.root.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], POP);
 }

 hide(fade) {
  clearInterval(this.ticker);
  this.ticker = 0;
  if (this.root.hidden) { this.release(); return; }
  if (this.state === 'open') this.close({ instant: true });
  const done = () => { this.root.hidden = true; this.release(); };
  if (!fade || reducedMotion()) { done(); return; }
  const gone = this.leaving = this.root.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.6)' }], AWAY);
  quiet(gone).then(() => {
   if (this.leaving !== gone) return;
   this.leaving = null;
   if (!this.helpers?.length) done();
   gone.cancel();
  });
 }

 // The plan's island has its whole room again.
 release() {
  if (!this.plan) return;
  if (this.plan.beside) { this.plan.beside = 0; this.plan.fit(); }
  if (this.plan.root.style.translate) this.plan.root.style.translate = '';
  flag(this.plan.root, 'is-behind', false);
 }

 // The capsule: the ghosts of the helpers (those at work first) and how many are at work; all done, a tick.
 paintCap() {
  const at = this.helpers.filter(helper => helper.state === 'working'), shown = [...at, ...this.helpers.filter(helper => helper.state !== 'working')].slice(0, STACK);
  const key = shown.map(helper => `${helper.id}:${helper.state}`).join(',');
  if (key !== this.stackKey) {
   this.stackKey = key;
   this.stack.replaceChildren(...shown.map(helper => { const g = ghost(helper.tone); g.classList.toggle('is-resting', helper.state !== 'working'); return g; }));
  }
  // At work: the ring, filled by the share that has finished, round the number still at work. All at an end: the tick
  // only when every one finished its work; one stopped or failed, a plain mark, never the tick.
  const all = !at.length, done = all && this.helpers.every(helper => helper.state === 'done');
  this.root.classList.toggle('is-finished', all);
  this.root.classList.toggle('is-cut', all && !done);
  this.sign.style.setProperty('--helper-share', String((this.helpers.length - at.length) / this.helpers.length));
  this.sign.classList.toggle('is-none', at.length === this.helpers.length);
  const mark = all ? (done ? 'tick' : 'cut') : '';
  if (this.end.dataset.mark !== mark) { this.end.dataset.mark = mark; this.end.innerHTML = all ? (done ? TICK : CUT) : ''; }
  const count = all ? '' : String(at.length);
  if (this.number.textContent !== count) this.number.textContent = count;
  const label = done ? I18n.t('helpers.allDone') : all ? I18n.t('helpers.allStopped') : I18n.t('helpers.atWork', { count: at.length });
  this.cap.setAttribute('aria-label', `${I18n.t('helpers.title')}: ${label}`);
  this.title.textContent = I18n.t('helpers.title');
  this.sub.textContent = label;
  this.head.setAttribute('aria-label', I18n.t('helpers.close'));
  this.sheet.setAttribute('aria-label', I18n.t('helpers.title'));
 }

 // A row for each helper. Rows already there keep their nodes, so a field being written in keeps its words and focus.
 paint(move = false) {
  const from = move ? this.root.offsetHeight : 0;
  const rows = new Map([...this.list.children].map(row => [row.dataset.id, row]));
  const next = this.helpers.map(helper => {
   let row = rows.get(helper.id);
   if (!row) row = this.row(helper);
   this.fill(row, helper);
   return row;
  });
  const same = next.length === this.list.children.length && next.every((row, k) => this.list.children[k] === row);
  if (!same) this.list.replaceChildren(...next);
  const to = this.root.offsetHeight;
  if (move && from && from !== to && !reducedMotion() && !this.morph) this.root.animate([{ height: `${from}px` }, { height: `${to}px` }], SHRINK);
 }

 row(helper) {
  const row = element('li', 'helper-lane');
  row.dataset.id = helper.id;
  const top = element('button', 'helper-row');
  top.type = 'button';
  top.append(ghost(helper.tone), element('span', 'helper-name'), element('span', 'helper-time'), element('span', 'helper-deed'));
  const more = element('div', 'helper-more');
  const log = element('ol', 'helper-log');
  const form = element('form', 'helper-form');
  const input = element('input', 'helper-input');
  input.type = 'text';
  input.autocomplete = 'off';
  const stop = element('button', 'helper-stop');
  stop.type = 'button';
  const send = element('button', 'helper-send');
  send.type = 'submit';
  send.innerHTML = SEND;
  form.append(input, stop, send);
  const told = element('p', 'helper-told');
  more.append(log, form, told);
  row.append(top, more);
  return row;
 }

 fill(row, helper) {
  const working = helper.state === 'working';
  row.className = `helper-lane is-${helper.asking ? 'asking' : helper.state}${this.opened.has(helper.id) ? ' is-opened' : ''}`;
  const top = row.querySelector('.helper-row');
  top.setAttribute('aria-expanded', String(this.opened.has(helper.id)));
  top.querySelector('ghost-thinking').classList.toggle('is-resting', !working);
  top.querySelector('.helper-name').textContent = helper.title;
  top.querySelector('.helper-time').textContent = clock((helper.ended || Date.now()) - helper.started);
  const deed = top.querySelector('.helper-deed');
  // Done, the first line of its report says what it made.
  const said = helper.state === 'done' ? String(helper.final || '').split(/\r?\n/).map(text => text.replace(/[#*_`>]/g, '').trim()).find(Boolean) || '' : '';
  const words = helper.asking ? [I18n.t('helpers.asking'), ''] : working ? helper.deed ? [helper.deed.verb, helper.deed.what] : [I18n.t('helpers.starting'), ''] : [I18n.t(`helpers.${helper.state}`), said];
  const key = words.join('\u0000');
  if (deed.dataset.key !== key) {
   deed.dataset.key = key;
   deed.replaceChildren(element('span', 'helper-verb', words[0]), ...(words[1] ? [document.createTextNode(' '), element('span', 'helper-what', words[1])] : []));
  }
  const log = row.querySelector('.helper-log');
  // Its steps before the one under way (all of them once it is done), the same step twice in a row told once.
  const lines = (working ? helper.log.slice(0, -1) : helper.log).map(item => `${item.verb}${item.what ? ` ${item.what}` : ''}`).filter((text, k, all) => text !== all[k - 1]);
  if (log.dataset.key !== lines.join('\n')) {
   log.dataset.key = lines.join('\n');
   log.replaceChildren(...lines.map(text => element('li', '', text)));
  }
  const input = row.querySelector('.helper-input'), stop = row.querySelector('.helper-stop');
  input.placeholder = I18n.t('helpers.tell');
  input.setAttribute('aria-label', I18n.t('helpers.tell'));
  stop.textContent = I18n.t('helpers.stop');
  row.querySelector('.helper-send').setAttribute('aria-label', I18n.t('helpers.send'));
  row.querySelector('.helper-form').hidden = !working;
 }

 onList(event) {
  const row = event.target.closest('.helper-lane');
  if (!row) return;
  const id = row.dataset.id;
  if (event.target.closest('.helper-row')) {
   if (this.opened.has(id)) this.opened.delete(id);
   else this.opened.add(id);
   this.paint(true);
   if (this.opened.has(id)) row.querySelector('.helper-input')?.focus({ preventScroll: true });
   return;
  }
  if (event.target.closest('.helper-stop')) {
   this.chat.haltHelper(this.conv, id);
   return;
  }
  if (event.target.closest('.helper-send')) {
   event.preventDefault();
   this.send(row);
  }
 }

 onKey(event) {
  if (event.key !== 'Enter' || !event.target.matches('.helper-input')) return;
  event.preventDefault();
  this.send(event.target.closest('.helper-lane'));
 }

 send(row) {
  const input = row.querySelector('.helper-input'), text = input.value.trim();
  if (!text) return;
  if (!this.chat.tellHelper(this.conv, row.dataset.id, text)) return;
  input.value = '';
  const told = row.querySelector('.helper-told');
  told.textContent = I18n.t('helpers.told');
  told.classList.add('is-on');
  clearTimeout(told.timer);
  told.timer = setTimeout(() => told.classList.remove('is-on'), 2400);
 }

 // While the island shows, the time of each helper at work goes on.
 tick() {
  const any = this.helpers?.some(helper => helper.state === 'working');
  if (any && !this.ticker) this.ticker = setInterval(() => { if (this.state === 'open') this.paint(); }, 1000);
  if (!any && this.ticker) { clearInterval(this.ticker); this.ticker = 0; }
 }

 // Where the island stands: beside the plan's capsule, the pair in the middle, or alone in the middle; open, the panel in
 // the middle. The plan is told of the room taken beside it.
 place() {
  if (this.root.hidden) return;
  const width = this.main.clientWidth;
  this.root.classList.toggle('is-crowded', width < LEAST);
  this.root.style.setProperty('--helper-sheet', `${Math.max(0, Math.min(PANEL.width, width - PANEL.gutter))}px`);
  if (this.state === 'open' || this.morph) {
   if (!this.morph) this.root.style.left = `${Math.round((width - this.root.offsetWidth) / 2)}px`;
   return;
  }
  const own = this.cap.offsetWidth || this.root.offsetWidth;
  const plan = this.plan, beside = plan && !plan.root.hidden && !plan.root.classList.contains('is-crowded');
  if (beside) {
   const room = own + GAP;
   if (plan.beside !== room) { plan.beside = room; plan.fit(); }
   // Open (and while it shuts), the plan's panel stands in the middle of the chat as ever: the shift is only the capsule's.
   const shift = plan.state === 'open' || plan.root.classList.contains('is-open') ? '' : `${-room / 2}px 0px`;
   if (plan.root.style.translate !== shift) plan.root.style.translate = shift;
   this.root.style.left = `${Math.round(plan.root.offsetLeft + plan.root.offsetWidth - room / 2 + GAP)}px`;
  } else {
   if (plan) this.release();
   this.root.style.left = `${Math.round((width - own) / 2)}px`;
  }
 }

 // One island open at a time: the other steps out of sight while it is.
 syncBehind() {
  if (!this.plan) return;
  const planOpen = this.plan.state === 'open';
  // The plan opened while the helpers' panel was: the helpers' panel gives way.
  if (planOpen && this.state === 'open') this.close({ instant: true });
  flag(this.root, 'is-behind', planOpen && this.state !== 'open');
  flag(this.plan.root, 'is-behind', this.state === 'open');
 }

 open() {
  if (this.state !== 'shut' || this.root.hidden || !this.helpers?.length) return;
  if (this.plan?.state === 'open') this.plan.close({ instant: true });
  const from = this.root.getBoundingClientRect(), main = this.main.getBoundingClientRect(), round = getComputedStyle(this.root).borderRadius;
  this.stopMorph();
  this.state = 'open';
  this.syncBehind();
  this.root.classList.add('is-open');
  this.paint();
  this.cap.setAttribute('aria-expanded', 'true');
  this.head.focus({ preventScroll: true });
  const toLeft = Math.round((this.main.clientWidth - this.root.offsetWidth) / 2);
  this.root.style.left = `${toLeft}px`;
  if (reducedMotion()) { this.sheet.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
  const to = this.root.getBoundingClientRect(), toRound = getComputedStyle(this.root).borderRadius;
  const fromLeft = from.left - main.left - this.main.clientLeft;
  const move = this.morph = this.root.animate([
   { left: `${fromLeft}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: round },
   { left: `${toLeft}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: toRound },
  ], MORPH);
  this.panelAnimations = [move, this.sheet.animate([{ opacity: 0, filter: 'blur(6px)', transform: 'scale(0.97)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], SHOW)];
  quiet(move).then(() => { if (this.morph === move) this.stopMorph(); });
 }

 close({ instant = false, focus = false } = {}) {
  if (this.state !== 'open') return;
  const from = this.root.getBoundingClientRect(), main = this.main.getBoundingClientRect(), round = getComputedStyle(this.root).borderRadius;
  this.stopMorph();
  this.state = 'shut';
  this.root.classList.remove('is-open');
  this.cap.setAttribute('aria-expanded', 'false');
  this.syncBehind();
  this.place();
  if (focus) this.cap.focus({ preventScroll: true });
  if (instant || reducedMotion()) return;
  const to = this.root.getBoundingClientRect();
  const fromLeft = from.left - main.left - this.main.clientLeft, toLeft = parseFloat(this.root.style.left) || 0;
  const move = this.morph = this.root.animate([
   { left: `${fromLeft}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: round },
   { left: `${toLeft}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: `${to.height / 2}px` },
  ], { ...MORPH, easing: SHRINK.easing, duration: SHRINK.duration });
  this.panelAnimations = [move, this.cap.animate([{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0)' }], SHOW)];
  quiet(move).then(() => { if (this.morph === move) this.stopMorph(); });
 }

 stopMorph() {
  this.morph = null;
  for (const animation of this.panelAnimations || []) animation.cancel();
  this.panelAnimations = [];
 }
}

window.HelperIsland = HelperIsland;
})();
