(() => {
'use strict';

// The card that asks before the agent acts. It leads with what the step is for in plain words, says what it does to the
// computer (worked out by the app, so a harmless-sounding sentence can't hide a deletion) and where, and keeps the
// command or the changes one click away. Opening them once keeps them open on the next cards.
const PREVIEW_LINES = 14;
const LEAVE = { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
const REVEAL = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const ICONS = { command: 'terminal', file: 'file', web: 'globe' };
const PLACES = { folder: 'folder', file: 'file', site: 'globe' };
const MAX_PLACES = 3;
const KEY = 'openghost.approval.details';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const remembered = () => { try { return localStorage.getItem(KEY) === 'open'; } catch { return false; } };
const remember = open => { try { localStorage.setItem(KEY, open ? 'open' : 'closed'); } catch {} };

function element(tag, className, text) {
 const el = document.createElement(tag);
 el.className = className;
 if (text !== undefined) el.textContent = text;
 return el;
}

// Each piece of the card takes its place in the order of its --i, the way the model confirm comes in.
function staged(el, i) {
 el.style.setProperty('--i', i);
 return el;
}

function lines(text, sign, className) {
 const all = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
 const shown = all.slice(0, PREVIEW_LINES).map(line => {
  const row = element('div', `approval-line ${className}`);
  row.append(element('span', 'approval-sign', sign), element('span', 'approval-text', line || ' '));
  return row;
 });
 if (all.length > PREVIEW_LINES) shown.push(element('div', 'approval-more', I18n.t('approve.more', { count: all.length - PREVIEW_LINES })));
 return shown;
}

function headline(text) {
 const title = element('p', 'approval-title');
 text.split(/(\s+)/).forEach((part, k) => title.append(part.trim() ? staged(element('span', 'approval-word', part), k / 2) : part));
 return title;
}

function place({ kind, label, title }) {
 const chip = element('span', `approval-place is-${kind}`);
 chip.innerHTML = Glyphs[PLACES[kind]] || '';
 chip.append(element('span', 'approval-place-name', label));
 chip.title = title;
 return chip;
}

class ApprovalCard {
 constructor(info) {
  this.settled = false;
  this.answer = new Promise(resolve => { this.resolve = resolve; });
  const el = this.el = element('div', `approval is-${info.kind} is-${info.effect || 'run'}`);
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', info.title);

  const icon = element('span', 'approval-icon');
  icon.innerHTML = Glyphs[ICONS[info.kind] || 'terminal'];
  const main = element('div', 'approval-main');
  main.append(headline(info.title));
  const meta = element('div', 'approval-meta');
  let k = 0;
  if (info.badge && info.effect) meta.append(staged(element('span', 'approval-effect', I18n.t(`approve.effect.${info.effect}`)), k++));
  const places = info.places || [];
  for (const item of places.slice(0, MAX_PLACES)) meta.append(staged(place(item), k++));
  if (places.length > MAX_PLACES) meta.append(staged(element('span', 'approval-effect is-count', `+${places.length - MAX_PLACES}`), k++));
  if (info.quote) meta.append(staged(element('span', 'approval-quote', info.quote), k++));
  if (meta.childElementCount) main.append(meta);
  const head = element('div', 'approval-head');
  head.append(icon, main);
  el.append(head);

  const inner = element('div', 'approval-details-inner');
  if (info.code) inner.append(element('pre', 'approval-code', info.code));
  if (info.removed || info.added) {
   const diff = element('div', 'approval-diff');
   if (info.removed) diff.append(...lines(info.removed, '−', 'is-removed'));
   if (info.added) diff.append(...lines(info.added, info.removed ? '+' : '', info.removed ? 'is-added' : 'is-new'));
   inner.append(diff);
  }

  const foot = element('div', 'approval-foot');
  if (inner.childElementCount && info.reveal) {
   this.details = element('div', 'approval-details');
   this.details.append(inner);
   el.append(this.details);
   this.reveal = staged(element('button', 'approval-reveal'), 0);
   this.reveal.type = 'button';
   this.reveal.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.6l3 3 3-3"/></svg>';
   this.reveal.prepend(element('span', 'approval-reveal-label'));
   this.reveal.addEventListener('click', () => this.open(!this.el.classList.contains('is-open'), true));
   this.revealKey = info.reveal;
   foot.append(this.reveal);
   this.open(remembered(), false);
  }
  this.deny = staged(element('button', 'approval-button is-deny', I18n.t('approve.deny')), 1);
  this.allow = staged(element('button', 'approval-button is-allow', I18n.t('approve.allow')), 2);
  this.deny.type = this.allow.type = 'button';
  this.deny.addEventListener('click', () => this.settle('deny'));
  this.allow.addEventListener('click', () => this.settle('allow'));
  foot.append(this.deny, this.allow);
  el.append(foot);
 }

 // The command or the changes unfold under the headline, and the choice is kept for the next cards.
 open(open, animate) {
  const box = this.details, el = this.el;
  el.classList.toggle('is-open', open);
  this.reveal.setAttribute('aria-expanded', String(open));
  this.reveal.firstChild.textContent = I18n.t(`approve.${open ? 'hide' : 'show'}.${this.revealKey}`);
  if (!animate) { box.hidden = !open; return; }
  remember(open);
  if (reducedMotion()) { box.hidden = !open; return; }
  const from = box.hidden ? 0 : box.offsetHeight;
  box.hidden = false;
  const to = open ? box.scrollHeight : 0;
  for (const animation of box.getAnimations({ subtree: true })) animation.cancel();
  box.animate([{ height: `${from}px` }, { height: `${to}px` }], REVEAL).finished.then(() => {
   if (!el.classList.contains('is-open')) box.hidden = true;
  }, () => {});
  box.firstChild.animate(open
   ? [{ opacity: 0, filter: 'blur(4px)', transform: 'translateY(-6px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }]
   : [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(4px)' }], { ...REVEAL, duration: open ? REVEAL.duration : 220 });
 }

 settle(value) {
  if (this.settled) return;
  this.settled = true;
  this.el.classList.add('is-answered');
  this.el.classList.toggle('is-allowed', value === 'allow');
  this.deny.disabled = this.allow.disabled = true;
  if (this.reveal) this.reveal.disabled = true;
  this.resolve(value);
 }

 dismiss() {
  const el = this.el;
  if (!el.isConnected) return;
  if (reducedMotion()) { el.remove(); return; }
  el.style.overflow = 'hidden';
  el.animate([
   { height: `${el.offsetHeight}px`, opacity: 1, transform: 'none', filter: 'blur(0)' },
   { height: '0px', marginTop: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0, transform: 'scale(0.97)', filter: 'blur(4px)' },
  ], LEAVE).finished.then(() => el.remove(), () => el.remove());
 }
}

// The cards that ask before the agent acts stand in the composer's place, as the agent's questions do (ask-card.js):
// the composer grows into the card in hand, the cards waiting after it show their edges behind it, and each answered
// card is drawn off the deck as the next one comes up. With none left the composer is itself again. A chat left and
// come back to shows its cards as they stood.
const MORPH = { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const RISE = { duration: 520, easing: 'cubic-bezier(0.3, 1.25, 0.5, 1)' };
const OFF = { duration: 340, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' };
const UNDER = [null, { y: -10, scale: 0.955, opacity: 1 }, { y: -19, scale: 0.91, opacity: 0.6 }];
const pose = at => at ? `translateY(${at.y}px) scale(${at.scale})` : 'none';
// Asked while the composer is still a question's card, the deck waits for it to be the composer again.
const AFTER_ASK = 340;

class ApprovalDeck {
 constructor(host) {
  this.host = host;
  this.root = null;
  this.deck = null;
  this.card = null;
  this.plates = [];
  this.list = [];
  this.timer = 0;
  // The deck on its way out, while the composer comes back: a card asked for meanwhile takes its place at once.
  this.closing = null;
 }

 // The cards of the chat on screen still waiting, in the order they came; the first is in hand.
 show(cards) {
  const list = cards.filter(card => !card.settled);
  this.list = list;
  clearTimeout(this.timer);
  if (!list.length) { this.hide(); return; }
  if (this.host.classList.contains('is-asking')) { this.timer = setTimeout(() => this.show(this.list), AFTER_ASK); return; }
  if (!this.root) this.open(list[0]);
  else if (this.card !== list[0]) this.next(list[0]);
  this.stack(this.root && this.card === list[0]);
 }

 open(card) {
  const host = this.host, from = host.offsetHeight;
  if (this.closing) {
   this.closing.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
   this.closing.remove();
   this.closing = null;
  }
  const root = this.root = element('div', 'approvals');
  this.deck = element('div', 'approvals-deck');
  root.append(this.deck);
  host.classList.add('is-approving');
  host.append(root);
  this.card = card;
  card.el.classList.remove('is-leaving');
  this.deck.append(card.el);
  this.plates = [];
  if (reducedMotion()) return;
  // The composer's own box grows into the card; the card's pieces come in one after another, by their own motion.
  card.el.animate([{ height: `${from}px` }, { height: `${card.el.offsetHeight}px` }], MORPH);
 }

 // The card in hand was answered (or the chat's cards changed): it is drawn off to the side, and the next comes up
 // from behind it.
 next(card) {
  const old = this.card, deck = this.deck, from = deck.offsetHeight;
  this.card = card;
  card.el.classList.remove('is-leaving');
  if (reducedMotion() || !old) {
   old?.el.remove();
   deck.append(card.el);
   return;
  }
  old.el.classList.add('is-leaving');
  deck.append(card.el);
  deck.animate([{ height: `${from}px` }, { height: `${card.el.offsetHeight}px` }], MORPH);
  const gone = () => { if (this.card !== old) old.el.remove(); };
  old.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(-10px, -12px) rotate(-1.6deg)', opacity: 1, offset: 0.3, easing: 'cubic-bezier(0.4, 0, 1, 1)' }, { transform: 'translate(-150px, 34px) rotate(-9deg)', opacity: 0 }], OFF).finished.then(gone, gone);
  card.el.animate([{ transform: pose(UNDER[1]), opacity: UNDER[1].opacity }, { transform: 'none', opacity: 1 }], RISE);
 }

 // The edges of the cards still waiting, behind the one in hand: one for the next, one for all after it.
 stack(moving) {
  const want = Math.min(2, this.list.length - 1);
  for (const plate of this.plates.splice(want)) plate.remove();
  while (this.plates.length < want) {
   const plate = element('div', 'ask-plate');
   plate.setAttribute('aria-hidden', 'true');
   this.deck.prepend(plate);
   this.plates.push(plate);
   if (!reducedMotion()) plate.animate([{ opacity: 0, transform: 'translateY(0) scale(0.97)' }, {}], { duration: 420, delay: moving ? 0 : 200, easing: MORPH.easing, fill: 'backwards' });
  }
  this.plates.forEach((plate, k) => {
   const at = UNDER[k + 1];
   plate.style.transform = pose(at);
   plate.style.opacity = at.opacity;
   plate.style.zIndex = String(-1 - k);
  });
 }

 // No card waits in the chat on screen: the last one draws in to the composer's height, and the composer is there again.
 hide() {
  const root = this.root, card = this.card, host = this.host;
  if (!root) return;
  this.root = this.deck = this.card = null;
  this.plates = [];
  this.closing = root;
  const end = () => {
   root.remove();
   if (this.closing === root) this.closing = null;
   if (this.root) return;
   host.classList.remove('is-approving');
   if (reducedMotion()) return;
   for (const child of host.children) child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  };
  // A card still waiting (its chat was left) goes with no motion: it is shown again when its chat is back.
  if (reducedMotion() || !card?.settled || !card.el.isConnected) { card?.el.remove(); end(); return; }
  host.classList.remove('is-approving');
  root.hidden = true;
  const to = host.offsetHeight;
  root.hidden = false;
  host.classList.add('is-approving');
  for (const plate of root.querySelectorAll('.ask-plate')) plate.animate({ opacity: 0, transform: 'translateY(0) scale(0.97)' }, { duration: 160, easing: 'ease-in', fill: 'forwards' });
  for (const row of card.el.children) row.animate({ opacity: 0 }, { duration: 120, easing: 'ease-in', fill: 'forwards' });
  card.el.animate([{ height: `${card.el.offsetHeight}px` }, { height: `${to}px` }], { duration: 300, easing: MORPH.easing, fill: 'forwards' }).finished.then(end, end);
 }
}

window.ApprovalCard = ApprovalCard;
window.ApprovalDeck = ApprovalDeck;
})();
