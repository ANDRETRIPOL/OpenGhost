(() => {
'use strict';

// The agent's questions to the user (the ask_user tool). While the agent waits for an answer the composer is not a
// field any more: it turns into a card with the question, its choices and a line for an answer in the user's own
// words. Several questions are a small deck: the one in hand lies on top, those still to come show their edges behind
// it, and each answered card is drawn off the deck as the next one comes up. Once all are answered the composer is
// itself again, and what was asked and answered stays in the chat as a short record.
const LIMITS = { questions: 4, options: 4, header: 24 };
// The composer grows into the card and back; the cards change places; a choice is seen for a moment before its card goes.
const MORPH = { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const RISE = { duration: 520, easing: 'cubic-bezier(0.3, 1.25, 0.5, 1)' };
const LEAVE = { duration: 340, easing: 'cubic-bezier(0.5, 0, 0.75, 0.4)', fill: 'forwards' };
const ROWS = { duration: 300, step: 45, delay: 110, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const BEAT = 260;
// Where a card waits behind the one in hand: a little higher, a little smaller.
const UNDER = [null, { y: -10, scale: 0.955, opacity: 1 }, { y: -19, scale: 0.91, opacity: 0.6 }];
const BACK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.8 3.6 5.4 8l4.4 4.4"/></svg>';
const NEXT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 8H13M9 3.8 13.2 8 9 12.2"/></svg>';
const SEND = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3.4M3.8 7.4 8 3.2l4.2 4.2"/></svg>';
const TICK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.6 8.4l2.9 2.9 5.9-6.4"/></svg>';

// The mark the model ends the label of its own choice with, in whatever language it wrote it: the card shows it as a
// small mark of its own, in the app's language.
const RECOMMENDED = /\s*[(\uFF08]\s*(recommended|рекоменд[а-яё]*|recommand[ée]e?s?|consigliat[oaie])\s*[)\uFF09]\s*$/i;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const element = (tag, className, text) => { const el = Object.assign(document.createElement(tag), { className }); if (text != null) el.textContent = text; return el; };
const words = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const pose = at => at ? `translateY(${at.y}px) scale(${at.scale})` : 'none';

// What the model sent, made safe to show: questions with their text, at least two choices each, nothing longer than
// the card holds. A choice the model called «Other» is dropped: the card has its own line for that.
function clean(raw) {
 const list = Array.isArray(raw) ? raw : [];
 return list.slice(0, LIMITS.questions).map(item => {
  const question = words(item?.question), header = words(item?.header).slice(0, LIMITS.header);
  const options = (Array.isArray(item?.options) ? item.options : []).map(option => typeof option === 'string' ? { label: words(option), description: '' } : { label: words(option?.label), description: words(option?.description) })
   .map(option => RECOMMENDED.test(option.label) ? { ...option, label: option.label.replace(RECOMMENDED, ''), recommended: true } : option)
   .filter(option => option.label && !/^(other|друг(ое|ой|ая|ие)|autres?|altr[oaie])(?!\p{L})/iu.test(option.label)).slice(0, LIMITS.options);
  return { question: question || header, header, options, multi: !!(item?.multiSelect ?? item?.multiple) };
 }).filter(item => item.question && item.options.length >= 2);
}

// One question's answer as the user gave it: the choices taken, and their own words. Nothing of either: skipped.
const given = answer => !!answer && (answer.picks.length > 0 || !!answer.text);
const phrase = (question, answer) => [...answer.picks.map(k => question.options[k].label), answer.text].filter(Boolean).join(', ');

// What the model reads back.
function report(questions, answers) {
 if (!answers.some(given)) return 'The user skipped the question without answering. Don\'t ask it again: choose what is most sensible yourself, say in one sentence what you chose, and go on.';
 const lines = questions.map((question, k) => {
  const answer = answers[k];
  if (!given(answer)) return `${k + 1}. ${question.question}\n   Skipped: the user left this one to you. Choose what is most sensible and say what you chose.`;
  const picked = answer.picks.map(n => `"${question.options[n].label}"`).join(', ');
  return `${k + 1}. ${question.question}\n   ${picked ? `Chose: ${picked}` : ''}${picked && answer.text ? '; and wrote' : answer.text ? 'Wrote in their own words' : ''}${answer.text ? `: "${answer.text}"` : ''}`;
 });
 return `The user answered in the app:\n${lines.join('\n')}\n\nThe user sees their answers in the chat, so don't repeat them back. Go on with the task with these answers.`;
}

// What stays in the chat: each question's short name and the answer to it.
const record = (questions, answers) => questions.map((question, k) => ({ header: question.header, question: question.question, answer: given(answers[k]) ? phrase(question, answers[k]) : '' }));

class AskDeck {
 constructor(host) {
  this.host = host;
  this.ask = null;
  this.root = null;
  this.card = null;
  this.plates = [];
  this.busy = false;
  this.timer = 0;
 }

 // ask: { questions, index, answers: [{ picks, text }], settle(answers) } — kept by the chat, so that a chat left and
 // come back to shows its question where it stood.
 show(ask) {
  if (this.ask === ask) return;
  if (this.ask) this.drop();
  this.ask = ask;
  ask.index ??= 0;
  ask.answers ??= ask.questions.map(() => ({ picks: [], text: '' }));
  const host = this.host, from = host.offsetHeight;
  const root = this.root = element('div', 'ask');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', I18n.t('ask.label'));
  this.deck = element('div', 'ask-deck');
  root.append(this.deck);
  host.classList.add('is-asking');
  host.append(root);
  this.card = this.build(ask.index);
  this.deck.append(this.card);
  this.stack(false);
  this.focus();
  if (reducedMotion()) return;
  // The composer's own box grows into the card; what the card holds comes in line by line.
  const card = this.card, to = card.offsetHeight;
  card.animate([{ height: `${from}px` }, { height: `${to}px` }], MORPH);
  this.reveal(card);
  for (const plate of this.plates) plate.animate([{ opacity: 0, transform: 'translateY(0) scale(0.97)' }, {}], { duration: 420, delay: 200, easing: MORPH.easing, fill: 'backwards' });
 }

 // The chat on screen has no question any more: answered, stopped, or another chat came.
 hide() {
  if (!this.ask) return;
  const root = this.root, card = this.card, host = this.host;
  this.ask = null;
  clearTimeout(this.timer);
  this.busy = false;
  const end = () => {
   root.remove();
   if (this.root === root) { this.root = this.card = null; this.plates = []; }
   if (this.ask) return;
   host.classList.remove('is-asking');
   if (reducedMotion()) return;
   for (const child of host.children) child.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  };
  if (reducedMotion() || !card?.isConnected) { end(); return; }
  // The card draws in to the height the composer has, and the composer is there again.
  host.classList.remove('is-asking');
  root.hidden = true;
  const to = host.offsetHeight;
  root.hidden = false;
  host.classList.add('is-asking');
  for (const plate of this.plates) plate.animate({ opacity: 0, transform: 'translateY(0) scale(0.97)' }, { duration: 160, easing: 'ease-in', fill: 'forwards' });
  for (const row of card.children) row.animate({ opacity: 0 }, { duration: 120, easing: 'ease-in', fill: 'forwards' });
  card.animate([{ height: `${card.offsetHeight}px` }, { height: `${to}px` }], { duration: 300, easing: MORPH.easing, fill: 'forwards' }).finished.then(end, end);
 }

 // At once, with no motion: the deck is shown anew for another question.
 drop() {
  clearTimeout(this.timer);
  this.busy = false;
  this.root?.remove();
  this.root = this.card = null;
  this.plates = [];
  this.ask = null;
  this.host.classList.remove('is-asking');
 }

 focus() {
  if (this.host.closest('[inert]')) return;
  this.card?.querySelector('.ask-own')?.focus({ preventScroll: true });
 }

 // The card of one question.
 build(index) {
  const ask = this.ask, question = ask.questions[index], answer = ask.answers[index], total = ask.questions.length, last = index === total - 1;
  const card = element('div', 'ask-card');
  card.dataset.index = index;
  const head = element('div', 'ask-head');
  if (index > 0) {
   const back = element('button', 'ask-back');
   back.type = 'button';
   back.innerHTML = BACK;
   back.setAttribute('aria-label', I18n.t('ask.back'));
   back.title = I18n.t('ask.back');
   back.addEventListener('click', () => this.go(-1));
   head.append(back);
  }
  head.append(element('span', 'ask-tag', question.header));
  if (total > 1) head.append(element('span', 'ask-count', I18n.t('ask.count', { n: index + 1, total })));
  const title = element('div', 'ask-question', question.question);
  title.id = `ask-q-${index}`;
  const list = element('div', 'ask-options');
  list.setAttribute('role', question.multi ? 'group' : 'radiogroup');
  list.setAttribute('aria-labelledby', title.id);
  question.options.forEach((option, k) => {
   const row = element('button', 'ask-option');
   row.type = 'button';
   row.dataset.option = k;
   row.setAttribute('role', question.multi ? 'checkbox' : 'radio');
   row.append(element('span', 'ask-number', String(k + 1)));
   const text = element('span', 'ask-text');
   const label = element('span', 'ask-option-label', option.label);
   if (option.recommended) label.append(element('span', 'ask-mark', I18n.t('ask.recommended')));
   text.append(label);
   if (option.description) text.append(element('span', 'ask-option-note', option.description));
   row.append(text);
   if (question.multi) { const box = element('span', 'ask-box'); box.innerHTML = TICK; row.append(box); }
   row.addEventListener('click', () => this.pick(k));
   list.append(row);
  });
  const foot = element('div', 'ask-foot');
  const own = element('input', 'ask-own');
  own.type = 'text';
  own.value = answer.text;
  own.placeholder = I18n.t('ask.own');
  own.setAttribute('aria-label', I18n.t('ask.own'));
  own.spellcheck = true;
  own.addEventListener('input', () => this.typed(own.value));
  const skip = element('button', 'ask-skip', I18n.t('ask.skip'));
  skip.type = 'button';
  skip.addEventListener('click', () => this.skip());
  const go = element('button', 'ask-go');
  go.type = 'button';
  go.innerHTML = last ? SEND : NEXT;
  go.setAttribute('aria-label', I18n.t(last ? 'ask.send' : 'ask.next'));
  go.title = I18n.t(last ? 'ask.send' : 'ask.next');
  go.addEventListener('click', () => this.go(1));
  foot.append(own, skip, go);
  card.append(head, title, list, foot);
  card.addEventListener('keydown', event => this.onKey(event));
  this.paint(card);
  return card;
 }

 // The card as its answer stands: the choices taken, and whether there is anything to go on with.
 paint(card = this.card) {
  if (!card || !this.ask) return;
  const answer = this.ask.answers[Number(card.dataset.index)];
  for (const row of card.querySelectorAll('.ask-option')) {
   const on = answer.picks.includes(Number(row.dataset.option));
   row.classList.toggle('is-on', on);
   row.setAttribute('aria-checked', String(on));
  }
  card.querySelector('.ask-go').disabled = !given(answer);
 }

 pick(k) {
  if (this.busy || !this.ask) return;
  const ask = this.ask, question = ask.questions[ask.index], answer = ask.answers[ask.index];
  if (question.multi) {
   answer.picks = answer.picks.includes(k) ? answer.picks.filter(n => n !== k) : [...answer.picks, k].sort((a, b) => a - b);
   this.paint();
   return;
  }
  // One choice is the whole answer: it is seen taken for a moment, and the card goes.
  answer.picks = [k];
  answer.text = '';
  this.card.querySelector('.ask-own').value = '';
  this.paint();
  this.busy = true;
  this.timer = setTimeout(() => { this.busy = false; this.go(1); }, reducedMotion() ? 0 : BEAT);
 }

 // Their own words stand instead of a single choice, and beside several.
 typed(value) {
  if (!this.ask) return;
  const ask = this.ask, answer = ask.answers[ask.index];
  answer.text = words(value);
  if (answer.text && !ask.questions[ask.index].multi) answer.picks = [];
  this.paint();
 }

 skip() {
  if (this.busy || !this.ask) return;
  const ask = this.ask;
  ask.answers[ask.index] = { picks: [], text: '' };
  this.go(1, true);
 }

 onKey(event) {
  if (event.isComposing || !this.ask) return;
  const own = this.card?.querySelector('.ask-own'), typing = event.target === own && own.value !== '';
  if (event.key === 'Enter' && !event.shiftKey) {
   if (event.target.closest('.ask-option, .ask-skip, .ask-back, .ask-go')) return;
   event.preventDefault();
   if (given(this.ask.answers[this.ask.index])) this.go(1);
   return;
  }
  // A number takes the choice it stands at, unless a number is being typed into the line.
  if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && /^[1-9]$/.test(event.key)) {
   const k = Number(event.key) - 1;
   if (k < this.ask.questions[this.ask.index].options.length) { event.preventDefault(); this.pick(k); }
  }
 }

 // On to the next card or back to the one before; past the last, the answers go to the agent.
 go(step, skipped = false) {
  if (this.busy || !this.ask) return;
  const ask = this.ask, next = ask.index + step;
  if (step > 0 && !skipped && !given(ask.answers[ask.index])) return;
  if (next < 0) return;
  if (next >= ask.questions.length) { ask.settle(ask.answers.map(answer => ({ picks: [...answer.picks], text: answer.text }))); return; }
  const old = this.card, deck = this.deck, from = old.offsetHeight;
  ask.index = next;
  const card = this.card = this.build(next);
  if (reducedMotion()) {
   old.replaceWith(card);
   this.stack(false);
   this.focus();
   return;
  }
  this.busy = true;
  old.inert = true;
  old.classList.add('is-leaving');
  deck.append(card);
  const to = card.offsetHeight;
  // The deck is as tall as the card in hand; the two differ, so it glides from one height to the other.
  deck.animate([{ height: `${from}px` }, { height: `${to}px` }], MORPH);
  const done = () => { old.remove(); this.busy = false; };
  if (step > 0) {
   // The answered card is lifted, tips and is drawn off to the side; the next comes up from behind it.
   old.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(-10px, -12px) rotate(-1.6deg)', opacity: 1, offset: 0.3, easing: 'cubic-bezier(0.4, 0, 1, 1)' }, { transform: 'translate(-150px, 34px) rotate(-9deg)', opacity: 0 }], { ...LEAVE, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' }).finished.then(done, done);
   card.animate([{ transform: pose(UNDER[1]), opacity: UNDER[1].opacity }, { transform: 'none', opacity: 1 }], RISE);
  } else {
   // Back: the card in hand sinks behind, and the one before is laid on top again from where it went.
   old.style.zIndex = '0';
   old.animate([{ transform: 'none', opacity: 1 }, { transform: pose(UNDER[1]), opacity: 0 }], { duration: 300, easing: MORPH.easing, fill: 'forwards' }).finished.then(done, done);
   card.animate([{ transform: 'translate(-150px, 34px) rotate(-9deg)', opacity: 0 }, { transform: 'translate(-10px, -12px) rotate(-1.6deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
  this.reveal(card);
  this.stack(true, step);
  this.focus();
 }

 // What a card holds comes in line by line.
 reveal(card) {
  const rows = [card.querySelector('.ask-head'), card.querySelector('.ask-question'), ...card.querySelectorAll('.ask-option'), card.querySelector('.ask-foot')];
  rows.forEach((row, k) => row.animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], { duration: ROWS.duration, delay: ROWS.delay + k * ROWS.step, easing: ROWS.easing, fill: 'backwards' }));
 }

 // The edges of the cards still to come, behind the one in hand: one for the next, one for all after it.
 stack(moving, step = 1) {
  const left = this.ask.questions.length - 1 - this.ask.index, want = Math.min(2, left);
  for (const plate of this.plates.splice(want)) plate.remove();
  while (this.plates.length < want) {
   const plate = element('div', 'ask-plate');
   plate.setAttribute('aria-hidden', 'true');
   this.deck.prepend(plate);
   this.plates.push(plate);
  }
  this.plates.forEach((plate, k) => {
   const at = UNDER[k + 1];
   plate.style.transform = pose(at);
   plate.style.opacity = at.opacity;
   plate.style.zIndex = String(-1 - k);
   if (!moving) return;
   // Going on, each edge comes one place nearer, and a new one shows at the back. Going back, each steps one place
   // away, and the nearest shows where the card that was in hand has sunk.
   if (step > 0) {
    const from = UNDER[k + 2];
    plate.animate([{ transform: pose(from || at), opacity: from ? from.opacity : 0 }, { transform: pose(at), opacity: at.opacity }], RISE);
   } else {
    const from = UNDER[k];
    plate.animate([{ transform: pose(from || at), opacity: from ? from.opacity : 0 }, { transform: pose(at), opacity: at.opacity }], { duration: 360, delay: from ? 0 : 160, easing: MORPH.easing, fill: 'backwards' });
   }
  });
 }
}

// The record in the chat: what was asked, by its short name, and what was answered.
const AskRecord = {
 build(entry) {
  // One quiet line: a tick, and a pill for each answer with the short name of its question. A long answer is cut
  // short in its pill; the whole of it, and the question itself, are told under the pointer.
  const el = element('div', 'thread-asked');
  const tick = element('span', 'thread-asked-tick');
  tick.setAttribute('aria-hidden', 'true');
  tick.innerHTML = TICK;
  el.append(tick);
  for (const item of entry.items || []) {
   const row = element('span', 'thread-asked-row');
   row.title = [item.question, item.answer].filter(Boolean).join('\n');
   row.append(element('span', 'thread-asked-name', item.header || item.question || ''));
   const answer = element('span', item.answer ? 'thread-asked-answer' : 'thread-asked-answer is-skipped', item.answer || I18n.t('ask.skipped'));
   row.append(answer);
   el.append(row);
  }
  return el;
 },

 enter(el) {
  if (reducedMotion() || !el.isConnected) return;
  const height = el.offsetHeight, gap = parseFloat(getComputedStyle(el.parentElement).rowGap) || 0;
  el.style.overflow = 'hidden';
  const free = () => { el.style.overflow = ''; };
  el.animate([{ height: '0px', marginTop: `${-gap}px` }, { height: `${height}px`, marginTop: '0px' }], { duration: 420, easing: MORPH.easing }).finished.then(free, free);
  [...el.children].forEach((row, k) => row.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 140 + k * 60, easing: ROWS.easing, fill: 'backwards' }));
 },
};

window.AskDeck = Object.assign(AskDeck, { clean, report, record });
window.AskRecord = AskRecord;
})();
