(() => {
'use strict';

// The agent's plan at the top of the chat (agent-plan.js), as the island at the top of an iPhone: a small black capsule
// with a ring of how much is done and the step under way. Pressed, it grows into a black panel with every step and the
// proof it was closed with; pressed beside, or with Escape, it shrinks back. While the agent waits for the user (for the
// plan, an answer or an approval) a light runs round its edge and breathes, as the browser's does while the agent drives
// it. A plan that is all done says so, and stays until the user writes again. A proof longer than two lines is cut
// there; a press on its step opens it whole, and another shuts it.
// least: below this room the capsule is the ring alone; it opens back to its words only with `again` more, so that a
// window dragged slowly about that width does not have it go back and forth.
// ring: the least room for the ring alone; with less the island steps out of sight. settle: how long the room has to
// hold before the capsule changes to the ring or back, or goes.
const ROOM = { gap: 12, least: 150, again: 12, ring: 30, settle: 160 };
// The capsule shrinking to the ring alone or growing back to its words.
const TIGHT = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// The capsule grows into the panel and back as one thing, with a little spring; what it holds comes up once it has room.
const MORPH = { duration: 520, easing: 'cubic-bezier(0.32, 1.18, 0.5, 1)' };
const SHRINK = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const SHOW = { duration: 300, delay: 110, easing: 'ease-out', fill: 'backwards' };
// A new step's name comes in as the mode's name does when it changes: the old one goes up into a blur, the new one
// comes up out of one.
const WORD = { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const POP = { duration: 480, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' };
const AWAY = { duration: 240, easing: 'ease-in', fill: 'forwards' };
const FOLD = { duration: 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// A round end of the arc reaches half the stroke beyond it at either end: the arc is drawn shorter by the stroke
// (--plan-cap, a share of the ring) and started half a stroke on, so that what is seen is the share done itself, and
// the ring is not closed while a step is left.
const RING = (size, stroke) => {
 const middle = size / 2, r = middle - stroke / 2 - 0.4, cap = stroke / (2 * Math.PI * r);
 return `<svg class="plan-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="plan-ring-track" cx="${middle}" cy="${middle}" r="${r}" stroke-width="${stroke}"/><circle class="plan-ring-arc" cx="${middle}" cy="${middle}" r="${r}" stroke-width="${stroke}" pathLength="1" stroke-dashoffset="${-cap / 2}" style="--plan-cap: ${cap}" transform="rotate(-90 ${middle} ${middle})"/></svg>`;
};
const TICK = '<svg class="plan-tick" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5"/><path d="M4.8 8.2l2.1 2.1 4.3-4.6"/></svg>';
const MARKS = {
 done: TICK,
 now: '<svg class="plan-mark" viewBox="0 0 16 16" aria-hidden="true"><circle class="plan-mark-rim" cx="8" cy="8" r="6.9"/><circle class="plan-mark-dot" cx="8" cy="8" r="3.2"/></svg>',
 open: '<svg class="plan-mark" viewBox="0 0 16 16" aria-hidden="true"><circle class="plan-mark-rim" cx="8" cy="8" r="6.9"/></svg>',
 dropped: '<svg class="plan-mark" viewBox="0 0 16 16" aria-hidden="true"><circle class="plan-mark-rim" cx="8" cy="8" r="6.9"/><path class="plan-mark-dash" d="M5.2 8h5.6"/></svg>',
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const element = (tag, className, text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
const quiet = animation => animation.finished.catch(() => {});

class PlanIsland {
 constructor({ main, chat }) {
  this.main = main;
  this.chat = chat;
  this.conv = null;
  this.view = null;
  this.state = 'shut';
  // The steps whose proof the user opened whole, by place and name: they stay open as the plan moves on.
  this.unfolded = new Set();
  const root = this.root = element('div', 'plan-island');
  root.hidden = true;
  this.cap = element('button', 'plan-cap');
  this.cap.type = 'button';
  this.cap.setAttribute('aria-expanded', 'false');
  this.cap.innerHTML = `<span class="plan-sign">${RING(16, 2.2)}${TICK}</span>`;
  this.label = element('span', 'plan-label');
  this.cap.append(this.label);
  this.sheet = element('div', 'plan-sheet');
  this.sheet.setAttribute('role', 'dialog');
  this.sheet.setAttribute('aria-label', I18n.t('plan.label'));
  this.head = element('button', 'plan-head');
  this.head.type = 'button';
  this.head.setAttribute('aria-label', I18n.t('plan.close'));
  this.head.innerHTML = `<span class="plan-sign">${RING(22, 2.4)}${TICK}</span>`;
  this.count = element('span', 'plan-count');
  this.head.append(this.count);
  this.wait = element('p', 'plan-wait');
  this.list = element('ol', 'plan-steps');
  this.sheet.append(this.head, this.wait, this.list);
  root.append(this.cap, this.sheet);
  main.append(root);

  this.cap.addEventListener('click', () => this.open());
  this.head.addEventListener('click', event => this.close({ focus: event.detail === 0 }));
  this.list.addEventListener('click', event => {
   const row = event.target.closest('.plan-step.is-long');
   if (row) this.unfold(row);
  });
  this.list.addEventListener('keydown', event => {
   const row = event.target.closest('.plan-step.is-long');
   if (!row || (event.key !== 'Enter' && event.key !== ' ')) return;
   event.preventDefault();
   this.unfold(row);
  });
  document.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || event.defaultPrevented || this.state !== 'open') return;
   event.preventDefault();
   this.close({ focus: true });
  });
  // A press anywhere else puts the panel away.
  document.addEventListener('pointerdown', event => {
   if (this.state === 'open' && !event.composedPath().includes(root)) this.close();
  }, true);
  new ResizeObserver(() => this.fit()).observe(main);
  // The buttons beside it come and go and change their width (a count, a name): its room follows them.
  const sides = new ResizeObserver(() => this.fit()), shown = new MutationObserver(() => this.fit());
  for (const el of main.querySelectorAll(':scope > .top-tools, :scope > .notes-pill, :scope > .routines-pill, :scope > .update-pill, :scope > .browser-tools')) {
   sides.observe(el);
   shown.observe(el, { attributes: true, attributeFilter: ['hidden'] });
  }
 }

 // What the chat on screen has to show: its plan, or nothing.
 sync() {
  const conv = this.chat.active, view = conv && !conv.locked ? this.chat.planView(conv) : null;
  const same = conv === this.conv, plan = view?.plan, was = this.view;
  this.conv = conv;
  this.view = view;
  if (!view) { this.hide(same && !!was); return; }
  const fresh = !was || !same || was.plan.id !== plan.id;
  if (fresh) this.unfolded.clear();
  if (this.root.hidden) this.show(same && fresh);
  this.fit();
  const { done, total } = AgentPlan.tally(plan);
  this.root.classList.toggle('is-waiting', view.waiting);
  this.root.classList.toggle('is-finished', view.finished);
  this.root.style.setProperty('--plan-share', total ? done / total : 0);
  this.root.classList.toggle('is-empty', !done);
  const step = AgentPlan.current(plan);
  const text = view.waiting ? I18n.t('plan.waiting') : view.finished ? I18n.t('plan.done') : step?.text || '';
  this.say(text, same && !fresh && !this.root.hidden);
  this.cap.setAttribute('aria-label', `${I18n.t('plan.label')}: ${text}`);
  if (this.state === 'open') this.paint(same);
 }

 // How wide the capsule may be: as far as the buttons on either side of it leave room, the same on both sides.
 fit() {
  if (this.root.hidden) return;
  const box = this.main.getBoundingClientRect(), middle = box.left + box.width / 2;
  const seen = el => el && !el.hidden && el.getClientRects().length > 0;
  let left = box.left, right = box.right;
  for (const el of this.main.querySelectorAll(':scope > .top-tools, :scope > .notes-pill')) if (seen(el)) left = Math.max(left, el.getBoundingClientRect().right);
  for (const el of this.main.querySelectorAll(':scope > .routines-pill, :scope > .update-pill, :scope > .browser-tools')) if (seen(el)) right = Math.min(right, el.getBoundingClientRect().left);
  const room = Math.floor(2 * Math.min(middle - left, right - middle) - 2 * ROOM.gap);
  // Never narrower than the ring: while a panel slides in or out the room shrinks and swells for a few frames, and
  // the capsule went down to nothing and back.
  this.root.style.setProperty('--plan-room', `${Math.max(ROOM.ring, room)}px`);
  this.room = room;
  // What the room means for the capsule, the ring alone or out of sight, is decided once the room has held a moment.
  // The first time it is decided at once, with no move.
  clearTimeout(this.fitting);
  if (this.tight === undefined) this.settle(false);
  else this.fitting = setTimeout(() => this.settle(true), ROOM.settle);
 }

 settle(move) {
  const room = this.room;
  this.root.classList.toggle('is-crowded', room < ROOM.ring);
  const tight = this.tight ? room < ROOM.least + ROOM.again : room < ROOM.least;
  if (!move) { this.tight = tight; this.root.classList.toggle('is-tight', tight); return; }
  if (tight !== !!this.tight) this.tighten(tight);
 }

 // The capsule gives way to the ring alone when the buttons beside it leave it little room, and opens back to its words
 // when they leave more: it shrinks or grows from the one width to the other, cut by its own edge, the words going out
 // or coming in with it. It used to change from the one to the other at once.
 tighten(tight) {
  const root = this.root, from = root.offsetWidth;
  this.tight = tight;
  for (const animation of [...root.getAnimations(), ...this.label.getAnimations()]) if (animation.id === 'tight') animation.cancel();
  if (reducedMotion() || this.state !== 'shut' || !from) {
   root.classList.toggle('is-tight', tight);
   return;
  }
  root.classList.toggle('is-tight', tight);
  // Growing, it goes to the width its words take as far as its room, not to the one it is held to this moment while
  // its room is still gliding wider: it stopped short of that and leapt the rest at the end.
  const to = tight ? root.offsetWidth : Math.min(this.natural(), parseFloat(root.style.getPropertyValue('--plan-room')) || Infinity);
  // Shrinking, the words stay in place until the capsule has closed over them; growing, they are there at once.
  if (tight) root.classList.remove('is-tight');
  root.classList.add('is-moving');
  const move = root.animate([{ width: `${from}px` }, { width: `${to}px` }], TIGHT);
  move.id = 'tight';
  const words = this.label.animate(tight ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }],
   tight ? { duration: TIGHT.duration * 0.6, easing: 'ease-out', fill: 'forwards' } : { duration: TIGHT.duration, delay: 80, easing: 'ease-out', fill: 'backwards' });
  words.id = 'tight';
  quiet(move).then(() => {
   if (this.tight !== tight) return;
   root.classList.remove('is-moving');
   root.classList.toggle('is-tight', tight);
   words.cancel();
  });
 }

 // How wide the capsule is with all its words, whatever room it has now: a copy of it laid out out of sight.
 natural() {
  const probe = this.cap.cloneNode(true);
  probe.style.cssText = 'position:absolute;visibility:hidden;max-width:none;width:max-content';
  this.root.append(probe);
  const width = probe.offsetWidth;
  probe.remove();
  return width;
 }

 // The words on the capsule. A new step's name takes the old one's place with a little flight, and the capsule grows or
 // shrinks to it at the same time.
 say(text, move) {
  const old = this.label.querySelector('.plan-word:not(.is-leaving)');
  if (old?.textContent === text) return;
  const word = element('span', 'plan-word', text);
  if (!old || !move || reducedMotion() || this.state !== 'shut') {
   this.label.replaceChildren(word);
   return;
  }
  const from = this.root.offsetWidth;
  old.classList.add('is-leaving');
  this.label.append(word);
  const to = this.root.offsetWidth;
  // While the capsule grows to the new name, the name is cut by its edge, not ended with dots.
  if (from !== to) {
   this.root.classList.add('is-moving');
   const done = () => this.root.classList.remove('is-moving');
   quiet(this.root.animate([{ width: `${from}px` }, { width: `${to}px` }], WORD)).then(done);
  }
  quiet(old.animate([{ opacity: 1, filter: 'blur(0)', transform: 'none' }, { opacity: 0, filter: 'blur(4px)', transform: 'translateY(-7px)' }], { ...WORD, fill: 'forwards' })).then(() => old.remove());
  word.animate([{ opacity: 0, filter: 'blur(4px)', transform: 'translateY(7px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], WORD);
 }

 // A plan that has just been made springs out of a dot; one of a chat just opened is simply there.
 show(pop) {
  this.root.hidden = false;
  for (const animation of this.root.getAnimations()) animation.cancel();
  if (pop && !reducedMotion()) this.root.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], POP);
 }

 hide(fade) {
  if (this.root.hidden) return;
  if (this.state === 'open') this.close({ instant: true });
  if (!fade || reducedMotion()) { this.root.hidden = true; return; }
  const gone = this.leaving = this.root.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.6)' }], AWAY);
  quiet(gone).then(() => {
   if (this.leaving !== gone) return;
   this.leaving = null;
   if (!this.view) this.root.hidden = true;
   gone.cancel();
  });
 }

 // Every step of the plan, with the proof it was closed with or the reason it was dropped.
 paint(move = false) {
  const plan = this.view.plan, now = AgentPlan.current(plan), { done, total } = AgentPlan.tally(plan);
  const from = move ? this.root.offsetHeight : 0;
  this.count.textContent = I18n.t('plan.count', { done, total });
  this.wait.textContent = this.view.waiting && plan.wait ? plan.wait : '';
  this.wait.hidden = !this.wait.textContent;
  const rows = plan.steps.map((step, k) => {
   const state = step.state === 'open' ? (step === now ? 'now' : 'open') : step.state;
   const row = element('li', `plan-step is-${state}`);
   row.innerHTML = MARKS[state];
   row.append(element('span', 'plan-step-name', step.text));
   const under = step.state === 'done' ? step.proof : step.state === 'dropped' ? step.reason : '';
   if (under) {
    row.append(element('span', 'plan-step-proof', under));
    row.dataset.key = `${k}:${step.text}`;
    row.classList.toggle('is-unfolded', this.unfolded.has(row.dataset.key));
   }
   // What the app saw of a closed step itself, or that it rests on the agent's word (plan-proof.js). A step closed
   // before the app looked says nothing.
   const seen = step.state === 'done' && step.by ? PlanIsland.seen(step) : '';
   if (seen) {
    row.classList.add(`is-by-${step.by}`);
    row.append(element('span', 'plan-step-seen', seen));
   }
   return row;
  });
  this.list.replaceChildren(...rows);
  // A proof that does not fit its two lines can be opened whole; one that fits has nothing more to show.
  for (const row of rows) {
   const proof = row.querySelector('.plan-step-proof');
   if (!proof || !(row.classList.contains('is-unfolded') || proof.scrollHeight > proof.clientHeight + 1)) continue;
   row.classList.add('is-long');
   row.tabIndex = 0;
   row.setAttribute('role', 'button');
   row.setAttribute('aria-expanded', String(row.classList.contains('is-unfolded')));
  }
  const to = this.root.offsetHeight;
  if (move && from && from !== to && !reducedMotion()) this.root.animate([{ height: `${from}px` }, { height: `${to}px` }], SHRINK);
 }

 // The capsule grows into the panel: its size and its corners go over in one move, and the steps come up in it.
 open() {
  if (this.state !== 'shut' || !this.view || this.root.hidden) return;
  const from = this.root.getBoundingClientRect();
  this.state = 'open';
  // Laid out first, so that what does not fit can be measured.
  this.root.classList.add('is-open');
  this.paint();
  this.cap.setAttribute('aria-expanded', 'true');
  this.head.focus({ preventScroll: true });
  if (reducedMotion()) { this.sheet.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); return; }
  const to = this.root.getBoundingClientRect(), round = getComputedStyle(this.root).borderRadius;
  this.root.animate([{ width: `${from.width}px`, height: `${from.height}px`, borderRadius: `${from.height / 2}px` }, { width: `${to.width}px`, height: `${to.height}px`, borderRadius: round }], MORPH);
  this.sheet.animate([{ opacity: 0, filter: 'blur(6px)', transform: 'scale(0.97)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], SHOW);
 }

 close({ instant = false, focus = false } = {}) {
  if (this.state !== 'open') return;
  const from = this.root.getBoundingClientRect(), round = getComputedStyle(this.root).borderRadius;
  this.state = 'shut';
  this.root.classList.remove('is-open');
  this.cap.setAttribute('aria-expanded', 'false');
  if (focus) this.cap.focus({ preventScroll: true });
  if (instant || reducedMotion()) return;
  const to = this.root.getBoundingClientRect();
  this.root.animate([{ width: `${from.width}px`, height: `${from.height}px`, borderRadius: round }, { width: `${to.width}px`, height: `${to.height}px`, borderRadius: `${to.height / 2}px` }], SHRINK);
  this.cap.animate([{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0)' }], { ...SHOW, delay: 160 });
 }

 // A step's proof opens whole under it, and shuts back to two lines, in one soft move. Shutting, it stays whole until
 // its room has closed, so its words don't jump to the cut before the move does; pressed again on the way, it turns
 // back from where it is.
 unfold(row) {
  const proof = row.querySelector('.plan-step-proof'), from = proof.getBoundingClientRect().height;
  row.__fold?.cancel();
  row.__fold = null;
  if (row.classList.contains('is-folding')) row.classList.remove('is-unfolded', 'is-folding');
  const open = !row.classList.contains('is-unfolded');
  row.classList.toggle('is-unfolded', open);
  const to = proof.offsetHeight;
  row.setAttribute('aria-expanded', String(open));
  if (open) this.unfolded.add(row.dataset.key);
  else this.unfolded.delete(row.dataset.key);
  if (reducedMotion() || Math.abs(from - to) < 1) return;
  if (!open) row.classList.add('is-unfolded', 'is-folding');
  const move = row.__fold = proof.animate([{ height: `${from}px` }, { height: `${to}px` }], FOLD);
  quiet(move).then(() => {
   if (row.__fold !== move) return;
   row.__fold = null;
   if (!open) row.classList.remove('is-unfolded', 'is-folding');
  });
 }

 // A closed step's line of what the app saw, in the user's language: one or two things, or the agent's word alone.
 static seen(step) {
  const said = (step.saw || []).map(item => {
   if (item.k === 'check') return I18n.t('proof.check', { command: item.command });
   if (item.k === 'judged') return I18n.t('proof.judged');
   if (item.k === 'site') return I18n.t(item.errors ? 'proof.siteErrors' : 'proof.site', { count: item.errors });
   if (item.k === 'read') return I18n.t('proof.read', { file: item.file });
   if (item.k === 'shown') return I18n.t('proof.shown', { file: item.file });
   if (item.k === 'page') return I18n.t('proof.page', { title: item.title });
   if (item.k === 'opened') return I18n.t('proof.opened', { count: item.count });
   if (item.k === 'files') {
    const parts = [['added', 'proof.filesNew'], ['moved', 'proof.filesMoved'], ['changed', 'proof.filesChanged'], ['removed', 'proof.filesRemoved']].filter(([key]) => item[key] > 0).map(([key, word]) => I18n.t(word, { count: item[key] }));
    return parts.length ? I18n.t('proof.files', { list: parts.join(', ') }) : '';
   }
   if (item.k === 'ran') return I18n.t('proof.ran');
   return '';
  }).filter(Boolean);
  return said.length ? said.join(' · ') : step.by === 'word' ? I18n.t('proof.word') : '';
 }
}

window.PlanIsland = PlanIsland;
})();
