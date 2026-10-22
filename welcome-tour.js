(() => {
'use strict';

// The first look at the app, for someone who has just installed it: once the opening has played, five cards over the
// whole window show what the agent does for very different people. Each card's words come first, with the marks of the
// services it works with floating over them; once they could have been read, the mini chat comes in beside them, as it
// opens in the app (mini-chat.js), and the agent does the thing there: the request, its line of steps rolling over as
// in the chat (agent-line.js), the results ticking in and what came of it. A card stays as long as its words take to
// read and its scene to play; bars at the top run like stories and lead on to the next. Next, Skip, the arrows and
// Escape lead too. Seen once, never again; someone with chats already never sees it.
const CARDS = [
 {
  key: 'accounts',
  // Each mark: its name, its height, where it floats (share of the row's width, px from its top).
  logos: [['telegram', 52, 0, 30], ['x', 32, 0.17, 2], ['gmail', 42, 0.29, 56], ['reddit', 38, 0.47, 12], ['youtube', 44, 0.63, 52]],
  items: ['telegram', 'x', 'reddit'], done: 2, result: 'post', mark: 'telegram',
 },
 {
  key: 'data',
  logos: [['sheets', 46, 0, 26], ['powerbi', 36, 0.15, 70], ['notion', 38, 0.27, 6], ['airtable', 48, 0.42, 48], ['analytics', 34, 0.6, 8], ['drive', 40, 0.71, 58]],
  file: 'sheets', items: [], done: 0, result: 'chart',
 },
 {
  key: 'trip',
  logos: [['airbnb', 46, 0, 32], ['maps', 40, 0.16, 2], ['tripadvisor', 50, 0.3, 54], ['whatsapp', 38, 0.5, 14], ['gmail', 32, 0.64, 62]],
  items: ['airbnb', 'whatsapp', 'maps'], done: 2, result: 'reply', mark: 'whatsapp',
 },
 {
  key: 'business',
  logos: [['salesforce', 44, 0, 28], ['stripe', 34, 0.24, 76], ['xero', 40, 0.31, 6], ['slack', 42, 0.52, 44], ['trello', 32, 0.69, 8]],
  items: ['salesforce', 'xero', 'slack'], done: 2, result: 'kpi',
 },
 {
  key: 'skins',
  logos: [['steam', 54, 0, 28], ['counterstrike', 44, 0.22, 2], ['dota2', 48, 0.4, 52]],
  items: ['steam', 'counterstrike', 'counterstrike'], done: 2, result: 'trade', mark: 'counterstrike',
 },
];
// How long a card's words are given before the mini chat comes: a moment to settle, then a time for every word.
const READ = { base: 1100, word: 240, most: 15000 };
// The mini chat's scene, in ms from its coming; and how long the card stays once the scene is over.
const SCENE = { ask: 300, line: 950, step: 1400, item: 1750, gap: 900, result: 650, length: 6600, linger: 3600 };
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
// The mini chat comes and goes as it does in the app (styles.css .mini): opacity apart from its rise.
const MINI = { from: 'translateY(14px) scale(0.96)', to: 'translateY(10px) scale(0.97)', fade: 220, move: 450 };
const ROLL = { duration: 560, easing: EASE };
const IN = { transform: 'translateY(0.8em) rotateX(-62deg)', opacity: 0, filter: 'blur(5px)' };
const REST = { transform: 'none', opacity: 1, filter: 'blur(0px)' };
const OUT = { transform: 'translateY(-0.8em) rotateX(62deg)', opacity: 0, filter: 'blur(5px)' };
const RISE = [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }];
// The words of a title come one after another out of a soft blur; the lines under it follow as one.
const WORD = { duration: 760, stagger: 55, lead: 160 };
const OPEN = { duration: 620, easing: EASE };
const LEAVE = { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' };
const KEY = 'tour';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const t = key => I18n.t(`tour.${key}`);
const count = text => String(text).trim().split(/\s+/).filter(Boolean).length;

function element(tag, className, text) {
 const el = document.createElement(tag);
 if (className) el.className = className;
 if (text != null) el.textContent = text;
 return el;
}

const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg>';
const WAIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18V6M7 11l5-5 5 5"/></svg>';

// A service's mark as it is drawn, its own shape and colours.
function mark(name, className = 'tour-mark') {
 const img = element('img', className);
 img.src = `brands/${name}.svg`;
 img.alt = '';
 img.draggable = false;
 img.dataset.mark = name;
 return img;
}

class WelcomeTour {
 // Shown after the opening to someone with no chats who has not seen it; marked as seen once it shows.
 static async start({ library, onDone } = {}) {
  try {
   if (await ChatStore.read(KEY)) return;
   await library.ready;
   if (library.chats.length) { ChatStore.write(KEY, { seen: Date.now(), skipped: 'chats' }); return; }
   const tour = new WelcomeTour({ onDone });
   if (document.documentElement.classList.contains('is-splash')) {
    tour.mount();
    await new Promise(resolve => window.addEventListener('splashend', resolve, { once: true }));
   }
   ChatStore.write(KEY, { seen: Date.now() });
   tour.open();
  } catch {}
 }

 constructor({ onDone } = {}) {
  this.onDone = onDone;
  this.index = 0;
  this.timers = [];
  const root = this.el = element('div', 'tour');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t('label'));
  root.append(element('div', 'tour-drag'));
  this.bars = element('div', 'tour-bars');
  this.fills = CARDS.map((card, k) => {
   const bar = element('button', 'tour-bar');
   bar.type = 'button';
   bar.setAttribute('aria-label', I18n.t('tour.cardOf', { n: k + 1, count: CARDS.length }));
   const fill = element('i');
   bar.append(fill);
   bar.addEventListener('click', () => this.go(k));
   this.bars.append(bar);
   return fill;
  });
  this.stage = element('div', 'tour-stage');
  this.left = element('div', 'tour-left');
  this.side = element('div', 'tour-side');
  this.side.setAttribute('aria-hidden', 'true');
  this.next = element('button', 'tour-next');
  this.next.type = 'button';
  this.next.addEventListener('click', () => this.forward());
  this.skip = element('button', 'tour-skip', t('skip'));
  this.skip.type = 'button';
  this.skip.addEventListener('click', () => this.close());
  const go = element('div', 'tour-go');
  go.append(this.next, this.skip);
  this.stage.append(this.left, this.side, go);
  root.append(this.bars, this.stage);
  this.onKey = event => {
   if (event.key === 'Escape') { event.preventDefault(); this.close(); }
   else if (event.key === 'ArrowRight') { event.preventDefault(); this.forward(); }
   else if (event.key === 'ArrowLeft') { event.preventDefault(); this.go(Math.max(0, this.index - 1)); }
   else if (event.key === 'Tab') {
    // The keys stay on the cards while they show.
    const keys = [...root.querySelectorAll('button')].filter(button => !button.hidden && button.offsetParent);
    const at = keys.indexOf(document.activeElement);
    event.preventDefault();
    keys[(at + (event.shiftKey ? -1 : 1) + keys.length) % keys.length]?.focus();
   }
  };
  this.onVisible = () => this.pause(document.hidden);
 }

 // Laid under the opening while it still plays: its ground is in place and its words are not yet, so the opening clears
 // to the cards and never to the chat behind them.
 mount() {
  if (this.el.isConnected) return;
  // The app under the cards takes no keys and no clicks while they show: what is typed can't land in the message field.
  this.under = [...document.body.children].filter(el => !el.inert && el.tagName !== 'SCRIPT');
  for (const el of this.under) el.inert = true;
  this.el.classList.add('is-waiting');
  document.body.append(this.el);
 }

 open() {
  const laid = this.el.isConnected;
  this.mount();
  this.el.classList.remove('is-waiting');
  document.addEventListener('keydown', this.onKey, true);
  document.addEventListener('visibilitychange', this.onVisible);
  if (!laid && !reducedMotion()) this.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN.duration, easing: 'ease' });
  this.render(0);
  // The keys are on Next from the start, without the ring a key would show.
  this.next.focus({ preventScroll: true, focusVisible: false });
 }

 forward() {
  if (this.index < CARDS.length - 1) this.go(this.index + 1);
  else this.close();
 }

 go(index) {
  if (index === this.index || this.closing) return;
  const back = index < this.index;
  this.index = index;
  if (reducedMotion()) { this.render(index); return; }
  // The words leave a little up and fade, and the mini chat goes as it goes in the app; then the next card comes.
  const words = [...this.left.children].map(el => el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateY(${back ? 8 : -8}px)` }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {}));
  this.render(index, Promise.all([...words, this.hideMini()]));
 }

 // The card at `index`: its marks and words at once, the mini chat once they could have been read, its bar running.
 async render(index, gone = null) {
  const token = this.token = {};
  this.clear();
  const card = CARDS[index], key = card.key, still = reducedMotion();
  this.fills.forEach((fill, k) => {
   fill.getAnimations().forEach(animation => animation.cancel());
   fill.style.transform = `scaleX(${k < index ? 1 : 0})`;
  });
  this.next.textContent = index === CARDS.length - 1 ? t('start') : t('next');
  this.skip.hidden = index === CARDS.length - 1;
  if (gone) await gone;
  if (token !== this.token) return;
  this.side.replaceChildren();
  const title = element('h2', 'tour-title'), words = [];
  for (const [line, className] of [[t(`${key}.title`), 'tour-title-light'], [t(`${key}.bold`), 'tour-title-bold']]) {
   const row = element('span', className);
   for (const [k, word] of line.split(/\s+/).filter(Boolean).entries()) {
    if (k) row.append(' ');
    const span = element('span', 'tour-word', word);
    row.append(span);
    words.push(span);
   }
   title.append(row);
  }
  const about = element('p', 'tour-about', t(`${key}.about`));
  this.left.replaceChildren(this.orbit(card), title, about);
  const read = Math.min(READ.most, READ.base + READ.word * (count(t(`${key}.title`)) + count(t(`${key}.bold`)) + count(t(`${key}.about`))));
  if (!still) {
   words.forEach((word, k) => word.animate([{ opacity: 0, transform: 'translateY(0.32em)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: WORD.duration, delay: WORD.lead + k * WORD.stagger, easing: EASE, fill: 'backwards' }));
   about.animate([{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 900, delay: WORD.lead + words.length * WORD.stagger + 120, easing: EASE, fill: 'backwards' });
  }
  const mini = this.mini(card);
  if (still) {
   this.side.append(mini.el);
   mini.finish();
   this.fills[index].style.transform = 'scaleX(1)';
   return;
  }
  this.timers.push(setTimeout(() => { if (token === this.token) { this.showMini(mini.el); mini.play(token); } }, read));
  // The bar of this card fills over all of it and leads on to the next; the last one stays.
  const fill = this.fills[index];
  this.run = fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: read + SCENE.length + SCENE.linger, easing: 'linear', fill: 'forwards' });
  if (document.hidden) this.run.pause();
  this.run.finished.then(() => { if (token === this.token && index < CARDS.length - 1) this.go(index + 1); }, () => {});
 }

 // The marks of the card's services, floating over its words, each at its own size and pace.
 orbit(card) {
  const row = element('div', 'tour-orbit');
  card.logos.forEach(([name, size, x, y], k) => {
   const holder = element('span', 'tour-float');
   holder.style.cssText = `left: ${x * 100}%; top: ${y}px; --size: ${size}px; --pace: ${5.2 + (k % 3) * 1.3}s; --delay: ${-k * 1.7}s; --dx: ${(k % 2 ? -1 : 1) * (3 + k % 3)}px; --dy: ${-(5 + (k * 3) % 5)}px; --turn: ${(k % 2 ? 1 : -1) * (2 + k % 3)}deg`;
   holder.append(mark(name, 'tour-logo'));
   row.append(holder);
   if (!reducedMotion()) holder.animate([{ opacity: 0, transform: 'scale(0.7)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 700, delay: k * 70, easing: EASE, fill: 'backwards' });
  });
  return row;
 }

 // The mini chat of the card, as the app draws it: its head, the talk and its field. `play` runs the scene, `finish`
 // shows it done at once.
 mini(card) {
  const key = card.key;
  const el = element('div', 'tour-mini');
  const head = element('div', 'tour-mini-head');
  const name = element('span', 'tour-mini-title');
  name.innerHTML = window.Glyphs?.ghost || '';
  name.append(element('span', '', I18n.t('mini.title')));
  const close = element('span', 'tour-mini-close');
  close.innerHTML = CLOSE;
  head.append(name, close);
  const thread = element('div', 'tour-mini-thread');
  const list = element('div', 'tour-mini-list');
  thread.append(list);
  const field = element('div', 'tour-mini-field');
  const toolbar = element('div', 'tour-mini-tools');
  const plus = element('span', 'tour-mini-plus');
  plus.innerHTML = PLUS;
  const send = element('span', 'tour-mini-send');
  send.innerHTML = SEND;
  toolbar.append(plus, send);
  field.append(element('div', 'tour-mini-placeholder', I18n.t('mini.placeholder')), toolbar);
  el.append(head, thread, field);

  // The user's message, with the file they sent when there is one.
  const ask = element('div', 'tour-mini-ask');
  if (card.file) {
   const chip = element('span', 'tour-mini-file');
   chip.append(mark(card.file), t(`${key}.file`));
   ask.append(chip);
  }
  ask.append(element('div', 'tour-mini-bubble', t(`${key}.ask`)));
  // The agent: its ghost and line of steps, what it found, and what came of it.
  const line = element('div', 'tour-line');
  const ghost = document.createElement('ghost-thinking');
  const drum = element('div', 'tour-drum');
  line.append(ghost, drum);
  const items = element('div', 'tour-items');
  const rows = card.items.map((name, k) => {
   const row = element('div', `tour-item${k < card.done ? '' : ' is-waiting'}`);
   row.append(mark(name, 'tour-item-mark'), element('span', 'tour-item-text', t(`${key}.item${k + 1}`)));
   const sign = element('span', 'tour-sign');
   sign.innerHTML = k < card.done ? TICK : WAIT;
   row.append(sign);
   items.append(row);
   return row;
  });
  const result = this.result(card);
  list.append(ask, line);
  if (rows.length) list.append(items);
  list.append(result);
  const steps = [1, 2, 3].map(n => t(`${key}.step${n}`));
  const parts = [ask, line, ...rows, result];
  for (const part of parts) part.style.opacity = '0';
  const play = token => {
   const at = (ms, then) => this.timers.push(setTimeout(() => { if (token === this.token) then(); }, ms));
   at(SCENE.ask, () => { ask.style.opacity = ''; ask.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: EASE }); });
   at(SCENE.line, () => { line.style.opacity = ''; line.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' }); this.roll(drum, steps[0]); });
   steps.slice(1).forEach((step, k) => at(SCENE.line + SCENE.step * (k + 1), () => this.roll(drum, step)));
   rows.forEach((row, k) => at(SCENE.item + SCENE.gap * k, () => {
    row.style.opacity = '';
    row.animate(RISE, { ...OPEN, duration: 460 });
    row.classList.add('is-in');
   }));
   at(Math.max(SCENE.line + SCENE.step * 2, SCENE.item + SCENE.gap * rows.length) + SCENE.result - SCENE.gap, () => {
    result.style.opacity = '';
    result.animate(RISE, { ...OPEN, duration: 520 });
    result.classList.add('is-in');
   });
  };
  const finish = () => {
   for (const part of parts) part.style.opacity = '';
   for (const row of rows) row.classList.add('is-in');
   result.classList.add('is-in');
   this.roll(drum, steps.at(-1), true);
  };
  return { el, play, finish };
 }

 // What came of the work: the post in the channel, a chart of the year, the owner's answer, the week in figures, the
 // price the skin was bought at.
 result(card) {
  const key = card.key, el = element('div', `tour-result is-${card.result}`);
  const head = element('div', 'tour-result-head');
  if (card.mark) head.append(mark(card.mark));
  head.append(t(`${key}.head`));
  if (card.result === 'post') {
   el.append(head, element('p', 'tour-result-text', t(`${key}.body`)));
  } else if (card.result === 'reply') {
   el.append(head, element('div', 'tour-bubble', t(`${key}.body`)));
  } else if (card.result === 'chart') {
   // The agent's answer, and the year drawn under it: the line draws itself, the ground under it fills, the dip is told.
   const said = element('p', 'tour-reply', t(`${key}.body`));
   const chart = element('div', 'tour-chart-box');
   chart.innerHTML = `<svg class="tour-chart" viewBox="0 0 300 96" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="tour-chart-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity="0.32"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path class="tour-chart-area" d="M0 78 L27 72 L54 66 L82 60 L109 55 L136 47 L163 62 L191 50 L218 40 L245 33 L273 26 L300 18 L300 96 L0 96 Z" fill="url(#tour-chart-ground)"/><path class="tour-chart-line" pathLength="1" d="M0 78 L27 72 L54 66 L82 60 L109 55 L136 47 L163 62 L191 50 L218 40 L245 33 L273 26 L300 18"/><circle class="tour-chart-dip" cx="163" cy="62" r="3.5"/><circle class="tour-chart-end" cx="300" cy="18" r="3.5"/></svg>`;
   const note = element('span', 'tour-chart-note', t(`${key}.dip`));
   const axis = element('div', 'tour-axis');
   axis.append(element('span', '', t(`${key}.jan`)), element('span', '', t(`${key}.jul`)), element('span', '', t(`${key}.dec`)));
   chart.append(note, axis);
   const box = element('div', 'tour-chart-card');
   box.append(head, chart);
   el.append(said, box);
  } else if (card.result === 'kpi') {
   const tiles = element('div', 'tour-kpis');
   for (const n of [1, 2, 3]) {
    const tile = element('div', 'tour-kpi');
    tile.append(element('small', '', t(`${key}.kpi${n}`)), element('b', '', t(`${key}.kpi${n}Value`)));
    if (n === 1) tile.append(element('em', '', t(`${key}.kpi1Note`)));
    tiles.append(tile);
   }
   el.append(head, tiles);
  } else if (card.result === 'trade') {
   // A week of the skin's price: the limit set, and the moment it fell under it and was bought.
   const chart = element('div', 'tour-trade');
   chart.innerHTML = '<svg class="tour-chart" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true"><path class="tour-trade-limit" d="M0 40 L300 40"/><path class="tour-chart-line" pathLength="1" d="M0 22 L30 26 L60 20 L90 30 L120 28 L150 36 L180 33 L210 44 L240 39 L270 31 L300 27"/><circle class="tour-trade-buy" cx="210" cy="44" r="4"/></svg>';
   const labels = element('div', 'tour-trade-labels');
   labels.append(element('span', 'tour-trade-limit-label', t(`${key}.limit`)), element('span', 'tour-trade-bought', t(`${key}.bought`)));
   chart.append(labels);
   el.append(head, chart);
  }
  return el;
 }

 showMini(el) {
  this.side.replaceChildren(el);
  if (reducedMotion()) return;
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MINI.fade, easing: 'ease' });
  el.animate([{ transform: MINI.from }, { transform: 'none' }], { duration: MINI.move, easing: EASE });
 }

 // The mini chat on its way out, as when it is closed in the app; nothing when it has not come yet.
 hideMini() {
  const el = this.side.firstElementChild;
  if (!el || reducedMotion()) return Promise.resolve();
  el.animate([{ transform: 'none' }, { transform: MINI.to }], { duration: MINI.move, easing: EASE, fill: 'forwards' });
  return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MINI.fade, easing: 'ease', fill: 'forwards' }).finished.catch(() => {});
 }

 // The agent's line: the next step rolls in from below as the last rolls away up, with the wave of light along it.
 roll(drum, words, still = false) {
  const now = [...drum.children].filter(el => !el.classList.contains('is-gone'));
  const line = element('div', 'tour-drum-line', words);
  const wave = element('span', 'tour-drum-wave', words);
  wave.setAttribute('aria-hidden', 'true');
  line.append(wave);
  drum.append(line);
  if (still) { now.forEach(old => old.remove()); return; }
  line.animate([IN, REST], ROLL);
  for (const old of now) {
   old.classList.add('is-gone');
   const gone = () => old.remove();
   old.animate([REST, OUT], { ...ROLL, fill: 'forwards' }).finished.then(gone, gone);
  }
 }

 pause(hidden) {
  if (!this.run) return;
  if (hidden) this.run.pause();
  else if (this.run.playState === 'paused') this.run.play();
 }

 clear() {
  for (const timer of this.timers.splice(0)) clearTimeout(timer);
  this.run?.cancel();
  this.run = null;
 }

 async close() {
  if (this.closing) return;
  this.closing = true;
  this.token = {};
  this.clear();
  document.removeEventListener('keydown', this.onKey, true);
  document.removeEventListener('visibilitychange', this.onVisible);
  for (const el of this.under || []) el.inert = false;
  if (!reducedMotion()) await this.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.015)' }], { ...LEAVE, fill: 'forwards' }).finished.catch(() => {});
  this.el.remove();
  this.onDone?.();
 }
}

window.WelcomeTour = WelcomeTour;
})();
