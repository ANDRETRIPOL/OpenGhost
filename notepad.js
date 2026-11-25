(() => {
'use strict';

// The notes a user keeps beside a chat: things to come back to, to add later, to keep in mind. They live with the chat
// (Chat's pad): the agent reads them in a note from the app and brings one up when its moment has come, and here the
// user writes, formats, pins, ticks off and takes away their own.
//
// The notes' button is a pill of glass of its own at the top of the chat. Pressed, the pill ducks away and a panel of
// glass comes in its place, its corner on the pill's corner: the notes as a gallery of small pages (or as a list), the
// pinned ones first. A page pressed opens in the same panel, which grows or draws in to its new size around its corner
// without moving, the page flying out of its card; there it is written in, with titles, coloured words, lists and
// checklists, and «‹ Notes» takes it back into its card.
const EASE = {
 motion: 'cubic-bezier(0.32, 0.72, 0, 1)',
 out: 'cubic-bezier(0.22, 1, 0.36, 1)',
 pop: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
};
// The panel comes and goes as the search and the usage panel do: in from a little wider and flatter out of a slight
// blur, out a little larger into a deeper one.
const OPEN = { duration: 133, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' };
const CLOSE = { duration: 110, easing: 'ease-out', fill: 'forwards' };
const FROM = { opacity: 0, transform: 'scale(1.09, 0.96)', filter: 'blur(4px)' };
const REST = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
const AWAY = { opacity: 0, transform: 'scale(1.06)', filter: 'blur(12px)' };
// The gallery and an open note are one surface: it changes size as the password card grows out of a row's menu.
const MORPH = { duration: 480, easing: EASE.motion };
// The panel keeps this far from the window's edges; an open note is this tall at most.
const EDGE = 8;
const SHEET = 640;
// A second press on the bin within this time deletes the note.
const CONFIRM_TIME = 3000;
// Typing is kept this long after the last key.
const SAVE_AFTER = 350;
// The format bar comes this long after the words are chosen: never while they are still being chosen (the button held,
// or the keys still moving the choice), only once the choice has rested.
const BAR_AFTER = 350;
// Coloured words take the tones of the agent's headings; subheadings take them in turn, as the agent's do.
const COLOURS = ['lilac', 'pink', 'orange', 'green', 'blue'];
const HEAD_TONES = ['lilac', 'turquoise', 'blue', 'pink', 'yellow', 'orange', 'green'];
const TONES = new Set(HEAD_TONES);
const HTML_MAX = 60000;
// A pill of the notes in the chat, as it comes in: the chat makes room, the pill settles, its sign is drawn and has its
// moment (the pencil writes, or knocks), what it says is written out from the left, and its button comes up last.
const PILL = { room: 460, settle: 520, stroke: 360, strokeStep: 110, signAt: 120, moment: 560, wordsAt: 200, label: 320, words: 620, goAt: 520, go: 360 };

const icon = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
 grid: icon('<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>'),
 list: icon('<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.8" cy="12" r=".9" fill="currentColor"/><circle cx="4.8" cy="17.5" r=".9" fill="currentColor"/>'),
 close: icon('<path d="M7 7l10 10M17 7L7 17"/>'),
 // The marks of the format bar, drawn rather than typed in a font, each with its ink centred on the middle of the box.
 bold: icon('<path stroke-width="2.5" d="M7.25 5h5.5a3.5 3.5 0 0 1 0 7h-5.5zM7.25 12h6a3.5 3.5 0 0 1 0 7h-6z"/>'),
 italic: icon('<path stroke-width="2" d="M10 5h7M7 19h7M13.5 5l-3 14"/>'),
 underline: icon('<path stroke-width="2" d="M7.5 4.5V11a4.5 4.5 0 0 0 9 0V4.5M6.5 19.5h11"/>'),
 strike: icon('<path stroke-width="2" d="M16 6.8C15.2 5.6 13.8 5 12 5 9.6 5 8 6.2 8 8c0 1.4.9 2.3 2.5 3M5 12h14M14.6 13.2c1 .6 1.4 1.3 1.4 2.4 0 2-1.7 3.4-4.2 3.4-1.9 0-3.4-.7-4.3-2"/>'),
 back: icon('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
 checks: icon('<circle cx="6" cy="7" r="2.2"/><path d="M11 7h9"/><circle cx="6" cy="17" r="2.2"/><path d="M11 17h9"/>'),
 done: icon('<circle cx="12" cy="12" r="8.25"/><path d="M8.3 12.3l2.5 2.5 4.9-5.4"/>'),
 tick: icon('<path d="M5.5 12.5l4 4 9-9.5"/>'),
};
const CHECK = '<svg class="glyph glyph-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="1" d="M5.5 12.6l4.2 4.2 8.8-9.6"/></svg>';
// The text styles of the «Aa» menu, each shown in its own look.
const STYLES = [
 { name: 'title', block: 'h1' },
 { name: 'heading', block: 'h2' },
 { name: 'body', block: 'p' },
 { name: 'mono', block: 'pre' },
 null,
 { name: 'bullets', list: 'ul' },
 { name: 'numbers', list: 'ol' },
 { name: 'checks', list: 'checks' },
 { name: 'quote', block: 'blockquote' },
];

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const quiet = animation => animation.finished.catch(() => {});
// The animations the panel started itself: the edges that fade with the scroll are the stylesheet's, and stay.
const scripted = animations => animations.filter(animation => !(animation instanceof CSSAnimation));
const element = (tag, className) => Object.assign(document.createElement(tag), { className });
const t = (key, values) => escapeHtml(I18n.t(key, values));

// A note's page kept as a few plain tags only: whatever the editor or a paste left beyond them is let go, its words kept.
const INLINE = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', BR: 'br', MARK: 'mark' };
const BLOCK = { H1: 'h1', H2: 'h2', H3: 'h2', H4: 'h2', P: 'p', DIV: 'p', PRE: 'pre', BLOCKQUOTE: 'blockquote', UL: 'ul', OL: 'ol', LI: 'li' };
function cleanNode(node, out) {
 for (const child of node.childNodes) {
  if (child.nodeType === 3) { out.append(child.data.replace(/\u200b/g, '')); continue; }
  if (child.nodeType !== 1) continue;
  const tag = INLINE[child.tagName] || BLOCK[child.tagName];
  if (!tag) { cleanNode(child, out); continue; }
  const made = document.createElement(tag);
  if (tag === 'mark') {
   const tone = child.dataset.tone;
   if (!TONES.has(tone)) { cleanNode(child, out); continue; }
   made.dataset.tone = tone;
  }
  if (tag === 'ul' && child.classList.contains('notepad-checks')) made.className = 'notepad-checks';
  if (tag === 'li' && child.dataset.done === 'true') made.dataset.done = 'true';
  if (tag === 'pre') made.textContent = child.textContent;
  else if (tag !== 'br') cleanNode(child, made);
  out.append(made);
 }
 return out;
}
function cleanHtml(html) {
 const from = document.createElement('template');
 from.innerHTML = String(html || '');
 const box = document.createElement('div');
 cleanNode(from.content, box);
 return box.innerHTML.slice(0, HTML_MAX);
}
// A note the agent wrote, or one kept before notes had pages, is its lines as paragraphs.
const htmlOf = note => note.html ? cleanHtml(note.html) : String(note.text || '').split('\n').map(line => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
// What a page says, line by line, as the agent reads it: a checklist's boxes as [ ] and [x], a list's points as dashes.
function textOf(page) {
 const lines = [];
 const walk = node => {
  for (const child of node.children) {
   if (/^(UL|OL|BLOCKQUOTE)$/.test(child.tagName)) { walk(child); continue; }
   const words = child.innerText.replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
   if (!words) continue;
   if (child.tagName === 'LI') {
    const checks = child.parentElement.classList.contains('notepad-checks');
    lines.push(`${checks ? (child.dataset.done === 'true' ? '[x] ' : '[ ] ') : '- '}${words}`);
   } else lines.push(words);
  }
 };
 walk(page);
 return lines.join('\n');
}
// Subheadings take the tones in turn, as the agent's headings in a reply do.
function toneHeads(page) {
 [...page.querySelectorAll('h2')].forEach((head, k) => {
  const tone = `t-${HEAD_TONES[k % HEAD_TONES.length]}`;
  if (head.className !== tone) head.className = tone;
 });
}
const nameOf = note => (String(note.text || '').split('\n').find(line => line.trim()) || '').replace(/^\[[ x]\] |^- /, '').trim() || I18n.t('notes.new');
const firstLine = note => (String(note.text || '').split('\n').filter(line => line.trim())[1] || '').replace(/^\[[ x]\] |^- /, '');
const sameDay = (a, b) => a.toDateString() === b.toDateString();
// When a note was last written: the hour today, the day of the week this week, the date before.
function when(time) {
 const at = new Date(time || Date.now()), now = new Date();
 if (sameDay(at, now)) return at.toLocaleTimeString(I18n.lang, { hour: '2-digit', minute: '2-digit' });
 if (now - at < 6 * 86400000) return at.toLocaleDateString(I18n.lang, { weekday: 'short' });
 return at.toLocaleDateString(I18n.lang, { day: 'numeric', month: 'short', year: at.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
const stamp = time => new Date(time || Date.now()).toLocaleString(I18n.lang, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// The highlight of a list follows the pointer on the springs the list of chats has (chat-list.js, row-menu.js): it
// fades in on its line, keeps its speed from line to line, and fades away.
const GLIDE_SPRING = [520, 40];
const FADE_SPRING = [320, 32];
function spring(s, goal, [k, c], dt) {
 const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
 for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
 if (Math.abs(goal - s[0]) < 0.01 && Math.abs(s[1]) < 0.05) { s[0] = goal; s[1] = 0; return false; }
 return true;
}

class Glide {
 constructor(list, pick) {
  Object.assign(this, { list, pick });
  this.el = element('span', 'notepad-glide');
  this.el.setAttribute('aria-hidden', 'true');
  this.g = { x: [0, 0], y: [0, 0], w: [0, 0], h: [0, 0], o: [0, 0] };
  this.pointed = null;
  this.raf = 0;
  this.tick = this.tick.bind(this);
  this.mount();
  list.addEventListener('pointermove', event => this.point(pick(event.target)));
  list.addEventListener('pointerleave', () => this.point(null));
  list.addEventListener('focusin', event => { if (event.target.matches(':focus-visible')) this.point(pick(event.target)); });
  list.addEventListener('focusout', () => this.point(null));
 }

 // The list was drawn again: the highlight goes back in, unseen until the pointer moves.
 mount() {
  if (this.el.parentElement !== this.list) this.list.prepend(this.el);
  this.pointed = null;
  this.g.o = [0, 0];
  this.el.style.opacity = '0';
 }

 point(line) {
  if (line === this.pointed) return;
  this.pointed = line;
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const line = this.pointed?.isConnected ? this.pointed : null, g = this.g;
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032);
  this.last = now;
  let moving = false;
  if (line) {
   const box = [line.offsetLeft, line.offsetTop, line.offsetWidth, line.offsetHeight];
   // Coming in, it appears on its line and fades up there; it slides only from line to line.
   if (g.o[0] < 0.02 || reducedMotion()) ['x', 'y', 'w', 'h'].forEach((key, i) => { g[key] = [box[i], 0]; });
   else ['x', 'y', 'w', 'h'].forEach((key, i) => { moving = spring(g[key], box[i], GLIDE_SPRING, dt) || moving; });
  }
  if (reducedMotion()) g.o = [line ? 1 : 0, 0];
  else moving = spring(g.o, line ? 1 : 0, FADE_SPRING, dt) || moving;
  const style = this.el.style;
  style.transform = `translate(${g.x[0].toFixed(2)}px, ${g.y[0].toFixed(2)}px)`;
  style.width = `${g.w[0].toFixed(2)}px`;
  style.height = `${g.h[0].toFixed(2)}px`;
  style.opacity = Math.min(1, Math.max(0, g.o[0])).toFixed(3);
  if (moving) this.raf = requestAnimationFrame(this.tick);
 }
}

class Notepad {
 constructor({ chat, thread, button }) {
  Object.assign(this, { chat, button });
  this.conv = null;
  this.state = 'closed';
  this.view = 'shelf';
  this.note = null;
  this.leaving = null;
  this.waiting = 0;
  this.saving = 0;
  this.morph = null;
  try { this.layout = localStorage.getItem('openghost.notes.layout') === 'list' ? 'list' : 'grid'; } catch { this.layout = 'grid'; }
  button.innerHTML = `<span class="notes-pill-label">${t('notes.title')}</span><span class="notes-pill-count" aria-hidden="true" hidden></span>`;
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  this.label = button.querySelector('.notes-pill-label');
  this.count = button.querySelector('.notes-pill-count');
  const root = this.root = element('div', 'notepad glass-lens');
  root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', I18n.t('notes.title'));
  const dots = COLOURS.map(tone => `<button type="button" class="notepad-dot t-${tone}" data-tone="${tone}" aria-label="${t('notes.colour', { name: I18n.t(`notes.colour.${tone}`) })}"></button>`).join('');
  const styles = STYLES.map(style => style ? `<button type="button" class="notepad-style is-${style.name}" data-style="${style.name}" role="menuitemradio"><span class="notepad-style-word">${t(`notes.style.${style.name}`)}</span><span class="notepad-style-tick">${ICON.tick}</span></button>` : '<span class="notepad-style-line" role="separator"></span>').join('');
  root.innerHTML = `
   <section class="notepad-view notepad-shelf">
    <header class="notepad-head">
     <span class="notepad-name">${t('notes.title')}<span class="notepad-total"></span></span>
     <span class="notepad-seg" role="radiogroup" aria-label="${t('notes.view')}">
      <button type="button" class="notepad-tool" data-layout="list" role="radio" aria-label="${t('notes.view.list')}" title="${t('notes.view.list')}">${ICON.list}</button>
      <button type="button" class="notepad-tool" data-layout="grid" role="radio" aria-label="${t('notes.view.grid')}" title="${t('notes.view.grid')}">${ICON.grid}</button>
     </span>
     <button type="button" class="notepad-tool is-accent notepad-compose" aria-label="${t('notes.new')}" title="${t('notes.new')}">${Glyphs.notes}</button>
     <button type="button" class="notepad-tool notepad-close" aria-label="${t('notes.close')}">${ICON.close}</button>
    </header>
    <div class="notepad-pane">
     <div class="notepad-scroll notepad-shelf-scroll">
      <div class="notepad-cards" role="list"></div>
      <div class="notepad-empty"><p class="notepad-empty-name">${t('notes.empty')}</p><p class="notepad-empty-hint">${t('notes.hint')}</p></div>
     </div>
     <div class="scrollbar notepad-scrollbar" aria-hidden="true"><div class="scrollbar-thumb"></div></div>
    </div>
   </section>
   <section class="notepad-view notepad-sheet" hidden>
    <header class="notepad-head">
     <button type="button" class="notepad-back" aria-label="${t('notes.back')}">${ICON.back}<span>${t('notes.title')}</span></button>
     <button type="button" class="notepad-tool notepad-aa" aria-haspopup="menu" aria-expanded="false" aria-label="${t('notes.style')}" title="${t('notes.style')}"><span class="notepad-aa-word">Aa</span></button>
     <button type="button" class="notepad-tool notepad-checks-tool" aria-label="${t('notes.style.checks')}" title="${t('notes.style.checks')}">${ICON.checks}</button>
     <button type="button" class="notepad-tool notepad-pin" aria-pressed="false">${Glyphs.pin}</button>
     <span class="notepad-gap" aria-hidden="true"></span>
     <button type="button" class="notepad-tool notepad-done" aria-pressed="false">${ICON.done}</button>
     <button type="button" class="notepad-tool notepad-bin" aria-label="${t('notes.delete')}" title="${t('notes.delete')}">${Glyphs.trash}</button>
     <button type="button" class="notepad-tool notepad-close" aria-label="${t('notes.close')}">${ICON.close}</button>
    </header>
    <div class="notepad-pane">
     <div class="notepad-scroll notepad-sheet-scroll">
      <p class="notepad-date"></p>
      <div class="notepad-page notepad-doc" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" aria-label="${t('notes.edit')}"></div>
     </div>
     <div class="scrollbar notepad-scrollbar" aria-hidden="true"><div class="scrollbar-thumb"></div></div>
    </div>
    <div class="notepad-bar" role="toolbar" aria-label="${t('notes.format')}" hidden>
     <button type="button" class="notepad-mark" data-command="bold" aria-label="${t('notes.bold')}">${ICON.bold}</button>
     <button type="button" class="notepad-mark" data-command="italic" aria-label="${t('notes.italic')}">${ICON.italic}</button>
     <button type="button" class="notepad-mark" data-command="underline" aria-label="${t('notes.underline')}">${ICON.underline}</button>
     <button type="button" class="notepad-mark" data-command="strikeThrough" aria-label="${t('notes.strike')}">${ICON.strike}</button>
     <span class="notepad-bar-line" aria-hidden="true"></span>
     ${dots}<button type="button" class="notepad-dot is-none" data-tone="" aria-label="${t('notes.colour.none')}"></button>
    </div>
    <div class="notepad-styles" role="menu" aria-label="${t('notes.style')}" hidden>${styles}</div>
   </section>`;
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  this.shelf = $('.notepad-shelf');
  this.sheet = $('.notepad-sheet');
  this.total = $('.notepad-total');
  this.cards = $('.notepad-cards');
  this.shelfScroll = $('.notepad-shelf-scroll');
  this.sheetScroll = $('.notepad-sheet-scroll');
  this.page = $('.notepad-doc');
  this.date = $('.notepad-date');
  this.bar = $('.notepad-bar');
  this.styles = $('.notepad-styles');
  this.aa = $('.notepad-aa');
  this.pin = $('.notepad-pin');
  this.done = $('.notepad-done');
  this.bin = $('.notepad-bin');
  const [shelfBar, sheetBar] = root.querySelectorAll('.notepad-scrollbar');
  this.shelfBar = new Scrollbar(this.shelfScroll, shelfBar, { autoHide: true });
  this.shelfBar.observe(this.cards);
  this.sheetBar = new Scrollbar(this.sheetScroll, sheetBar, { autoHide: true });
  this.sheetBar.observe(this.page);
  this.syncLayout();
  // Rows of the list and lines of the styles menu light up under the pointer as the sidebar's chats do.
  this.rowGlide = new Glide(this.cards, target => this.layout === 'list' ? target.closest?.('.notepad-card') || null : null);
  this.styleGlide = new Glide(this.styles, target => target.closest?.('.notepad-style') || null);
  this.markGlide = new Glide(this.bar, target => target.closest?.('.notepad-mark') || null);

  button.addEventListener('click', event => this.toggle(event.detail === 0));
  for (const cross of root.querySelectorAll('.notepad-close')) cross.addEventListener('click', event => this.close({ focusButton: event.detail === 0 }));
  root.querySelector('.notepad-seg').addEventListener('click', event => {
   const layout = event.target.closest('[data-layout]')?.dataset.layout;
   if (!layout || layout === this.layout) return;
   this.layout = layout;
   try { localStorage.setItem('openghost.notes.layout', layout); } catch {}
   this.syncLayout();
   this.fill();
   this.resize(this.shelfHeight());
  });
  $('.notepad-compose').addEventListener('click', () => this.compose());
  this.cards.addEventListener('click', event => {
   const card = event.target.closest('.notepad-card');
   if (card) this.openNote(card.dataset.id, card);
  });
  $('.notepad-back').addEventListener('click', () => this.back());
  this.aa.addEventListener('click', () => this.menu(this.styles.hidden));
  this.styles.addEventListener('click', event => {
   const item = event.target.closest('[data-style]');
   if (item) { this.applyStyle(item.dataset.style); this.menu(false); }
  });
  $('.notepad-checks-tool').addEventListener('click', () => this.applyStyle('checks'));
  this.pin.addEventListener('click', () => { if (this.note) this.chat.pinNote(this.conv, this.note.id, !this.note.pinned); });
  this.done.addEventListener('click', () => { if (this.note) this.chat.checkNote(this.conv, this.note.id, !this.note.done); });
  this.bin.addEventListener('click', () => this.remove());
  // The bars' buttons never take the keyboard from the page: what is chosen there stays chosen.
  for (const keep of [this.bar, this.styles, $('.notepad-checks-tool'), this.aa]) keep.addEventListener('pointerdown', event => event.preventDefault());
  this.bar.addEventListener('click', event => {
   const mark = event.target.closest('[data-command]'), dot = event.target.closest('[data-tone]');
   if (mark) { document.execCommand(mark.dataset.command); this.changed(); this.syncBar(); }
   else if (dot) this.colour(dot.dataset.tone);
  });
  this.page.addEventListener('beforeinput', event => this.pastMark(event));
  this.page.addEventListener('input', () => this.changed());
  this.page.addEventListener('paste', event => {
   event.preventDefault();
   document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  });
  this.page.addEventListener('click', event => this.tick(event));
  this.page.addEventListener('keydown', event => this.onPageKey(event));
  document.addEventListener('selectionchange', () => { if (this.view === 'sheet' && this.state === 'open') this.settleBar(); });
  // Words chosen with the pointer: nothing comes while the button is held; the bar waits for the button to let go.
  this.page.addEventListener('pointerdown', event => {
   if (event.button !== 0) return;
   this.choosing = true;
   this.hideBar();
  });
  document.addEventListener('pointerup', () => {
   if (!this.choosing) return;
   this.choosing = false;
   this.settleBar();
  }, true);
  this.sheetScroll.addEventListener('scroll', () => this.syncBar(), { passive: true });
  // Escape steps back: from the menu, from an open note to the gallery, and from the gallery out.
  document.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || event.defaultPrevented || this.state !== 'open') return;
   event.preventDefault();
   if (!this.styles.hidden) this.menu(false);
   else if (this.view === 'sheet') this.back();
   else this.close({ focusButton: true });
  });
  // The keyboard walking on past the panel puts it away.
  root.addEventListener('focusout', event => {
   if (this.state === 'open' && event.relatedTarget instanceof Node && !root.contains(event.relatedTarget)) this.close();
  });
  // A press anywhere else puts the notes away; a press in the panel outside the styles menu closes the menu.
  document.addEventListener('pointerdown', event => {
   if (this.state !== 'open') return;
   const path = event.composedPath();
   if (!this.styles.hidden && !path.includes(this.styles) && !path.includes(this.aa)) this.menu(false);
   if (!path.includes(root) && !path.includes(button)) this.close();
  }, true);
  window.addEventListener('resize', () => this.close({ instant: true }));
  // A pill of the notes in the chat opens them at its note.
  thread.addEventListener('click', event => {
   const pill = event.target.closest('.thread-note-pill')?.closest('.thread-note');
   if (pill && !pill.classList.contains('is-memory') && !pill.classList.contains('is-routine')) this.open({ show: pill.dataset.note });
  });
 }

 // What the button shows for the chat on screen: it is there once the chat exists and is open, and counts the notes that
 // still wait in a small disc; with none waiting there is no disc. It comes in softly the first time.
 sync() {
  const conv = this.chat.active, there = !!conv?.record && !conv.locked && !!conv.pad, button = this.button;
  if (there && button.hidden && !reducedMotion()) button.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
  button.hidden = !there;
  const n = this.waiting = there ? conv.pad.items.filter(note => !note.done && String(note.text || '').trim()).length : 0;
  this.count.textContent = n;
  this.count.hidden = !n;
  if (n) Figures.center(this.count);
  button.classList.toggle('has-count', n > 0);
  button.setAttribute('aria-label', I18n.t(n ? 'notes.open.count' : 'notes.open', { n }));
  if (this.state !== 'closed' && (this.conv !== conv || !there)) this.close({ instant: true });
 }

 // The disc gives a small start when the agent brings a note up or writes one down.
 ring() {
  if (reducedMotion() || this.count.hidden) return;
  this.count.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 620, easing: EASE.pop });
 }

 // The notes changed, by the user's hand here or the agent's from the chat.
 onNotes(conv, { kind, note }) {
  if (conv === this.chat.active) {
   this.sync();
   if (kind === 'remind' || kind === 'rewrite' || (kind === 'add' && note.by === 'agent')) this.ring();
  }
  if (this.state !== 'open' || conv !== this.conv || this.busy) return;
  if (this.view === 'sheet' && this.note?.id === note.id) {
   if (kind === 'remove') { this.note = null; this.back(); return; }
   // The note on the page changed somewhere else (in the other half of a split window): it is shown anew unless it is
   // being written here.
   // A note the agent rewrote at the user's word is shown as it now reads, even while the page has the keyboard.
   if (kind === 'rewrite') { clearTimeout(this.saving); this.saving = 0; this.paintPage(); }
   else if (kind !== 'write' && document.activeElement !== this.page) this.paintPage();
   this.paintTools();
  }
  if (this.view === 'shelf') {
   const before = this.root.offsetHeight;
   this.fill();
   const after = this.shelfHeight();
   if (Math.abs(after - before) > 1) this.resize(after);
  }
 }

 toggle(keyboard = false) {
  if (this.state === 'open') this.close({ focusButton: keyboard });
  else this.open();
 }

 notes() {
  const items = [...(this.conv?.pad.items || [])];
  return items.sort((a, b) => (!!b.pinned - !!a.pinned) || ((b.edited || b.at || 0) - (a.edited || a.at || 0)));
 }

 // show: the id of a note to open at once (a pill of the notes in the chat was pressed).
 open({ show = '' } = {}) {
  const conv = this.chat.active;
  if (!conv?.pad || conv.locked || this.button.hidden) return;
  if (this.state === 'closing') this.finish();
  if (this.state === 'open') { if (show) this.openNote(show); return; }
  this.conv = conv;
  this.state = 'open';
  this.view = 'shelf';
  this.shelf.hidden = false;
  this.sheet.hidden = true;
  this.fill();
  this.root.showPopover();
  this.place();
  const note = show && conv.pad.items.find(item => item.id === show);
  if (note) { this.showSheet(note); this.shelf.hidden = true; }
  this.size(note ? this.sheetHeight() : this.shelfHeight());
  this.button.setAttribute('aria-expanded', 'true');
  this.shelfScroll.scrollTop = 0;
  this.shelfBar.update();
  this.root.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [FROM, REST], OPEN);
  this.button.classList.add('is-away');
  if (note) this.page.focus({ preventScroll: true });
  else this.root.querySelector('.notepad-compose').focus({ preventScroll: true });
 }

 // The panel stands where the button stood, its corner on the button's corner; it grows down and to the right from there.
 place() {
  const home = this.button.getBoundingClientRect(), style = this.root.style;
  const width = this.root.offsetWidth;
  this.top = Math.round(home.top);
  style.left = `${Math.round(Math.max(EDGE, Math.min(home.left, innerWidth - width - EDGE)))}px`;
  style.top = `${this.top}px`;
  this.root.style.setProperty('--notepad-cols', width < 470 ? 2 : 3);
 }

 room() {
  return Math.max(240, innerHeight - this.top - EDGE * 2);
 }

 shelfHeight() {
  // Measured by what the gallery holds, not by its scrolling box, which is never shorter than the panel it is in.
  const head = this.shelf.querySelector('.notepad-head').offsetHeight;
  const held = this.cards.offsetHeight + (this.root.classList.contains('is-empty') ? this.shelf.querySelector('.notepad-empty').offsetHeight : 0);
  return Math.min(this.room(), Math.ceil(head + held));
 }

 sheetHeight() {
  return Math.min(this.room(), SHEET);
 }

 // The panel's height, at once: each view keeps the height it is laid out at.
 size(height) {
  this.root.style.height = `${height}px`;
  for (const view of [this.shelf, this.sheet]) view.style.height = `${height}px`;
 }

 // The panel grows or draws in to its new height around its corner, which does not move: what it holds is laid out at
 // once at its final size, and the glass opens over it or closes on it.
 resize(height, { views = [this.shelf, this.sheet] } = {}) {
  const from = this.root.offsetHeight;
  for (const view of views) view.style.height = `${height}px`;
  this.root.style.height = `${height}px`;
  if (reducedMotion() || Math.abs(from - height) < 1) return null;
  this.morph?.cancel();
  const morph = this.morph = this.root.animate([{ height: `${from}px` }, { height: `${height}px` }], MORPH);
  quiet(morph).then(() => { if (this.morph === morph) this.morph = null; });
  return morph;
 }

 syncLayout() {
  this.cards.classList.toggle('is-list', this.layout === 'list');
  for (const button of this.root.querySelectorAll('[data-layout]')) {
   const on = button.dataset.layout === this.layout;
   button.classList.toggle('is-on', on);
   button.setAttribute('aria-checked', String(on));
  }
 }

 // The gallery: a card for each note, the pinned ones first, then the latest written.
 fill() {
  const notes = this.notes();
  this.total.textContent = notes.length || '';
  this.root.classList.toggle('is-empty', !notes.length);
  this.cards.replaceChildren(...notes.map(note => this.card(note)));
  this.rowGlide?.mount();
 }

 card(note) {
  const card = element('button', `notepad-card${note.pinned ? ' is-pinned' : ''}${note.done ? ' is-done' : ''}`);
  card.type = 'button';
  card.dataset.id = note.id;
  card.setAttribute('role', 'listitem');
  const meta = [when(note.edited || note.at), note.by === 'agent' ? I18n.t('notes.meta.agent') : '', note.reminded && !note.done ? I18n.t('notes.meta.reminded') : '', note.done ? I18n.t('notes.reminder.done') : ''].filter(Boolean).join(' · ');
  if (this.layout === 'list') {
   card.innerHTML = `<span class="notepad-row-name">${note.pinned ? `<span class="notepad-row-pin">${Glyphs.pin}</span>` : ''}${escapeHtml(nameOf(note))}</span><span class="notepad-row-line"><b>${escapeHtml(meta)}</b>${escapeHtml(firstLine(note))}</span>`;
  } else {
   card.innerHTML = `<span class="notepad-thumb"><span class="notepad-page notepad-mini"></span>${note.pinned ? `<span class="notepad-thumb-pin">${Glyphs.pin}</span>` : ''}${note.done ? `<span class="notepad-thumb-done">${ICON.tick}</span>` : ''}</span><span class="notepad-card-name">${escapeHtml(nameOf(note))}</span><span class="notepad-card-time">${escapeHtml(meta)}</span>`;
   const mini = card.querySelector('.notepad-mini');
   mini.innerHTML = htmlOf(note);
   // A card shows what fits in it: the first lines of a long page are enough.
   for (const block of [...mini.children].slice(14)) block.remove();
   toneHeads(mini);
  }
  card.setAttribute('aria-label', `${nameOf(note)}, ${meta}`);
  return card;
 }

 // A new note, opened at once with its title to write.
 compose() {
  const note = this.chat.createNote(this.conv);
  if (!note) return;
  this.openNote(note.id, null);
 }

 // The note pressed opens in the panel: the panel takes the open note's height and the page flies out of its card.
 openNote(id, card = this.cards.querySelector(`[data-id="${CSS.escape(id)}"]`)) {
  const note = this.conv?.pad.items.find(item => item.id === id);
  if (!note || this.state !== 'open') return;
  if (this.view === 'sheet') { if (this.note?.id !== id) { this.keepNow(); this.showSheet(note); } return; }
  const from = card?.querySelector('.notepad-thumb')?.getBoundingClientRect() || card?.getBoundingClientRect() || null;
  this.showSheet(note);
  const height = this.sheetHeight();
  const morph = this.resize(height);
  // The caret comes once the window has grown: a caret in a page that moves is placed again on every frame.
  const write = () => {
   if (this.view !== 'sheet' || this.note !== note) return;
   this.page.focus({ preventScroll: true });
   if (!note.text) this.caretToStart();
  };
  if (morph) { document.activeElement?.blur(); quiet(morph).then(write); } else write();
  if (reducedMotion()) { this.shelf.hidden = true; return; }
  this.shelf.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' }).finished.then(() => { if (this.view === 'sheet') this.shelf.hidden = true; }, () => {});
  this.sheet.querySelector('.notepad-head').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 140, easing: EASE.out, fill: 'backwards' });
  this.fly(from, true);
 }

 // The page between its card and the open note: from the card's box to the page's own, a scale and a move only.
 fly(card, out) {
  const scroll = this.sheetScroll, to = scroll.getBoundingClientRect();
  if (!card || !to.width) {
   scroll.animate(out ? [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 1 }, { opacity: 0 }], { duration: out ? 320 : 160, easing: EASE.out, fill: out ? 'backwards' : 'forwards' });
   return;
  }
  const k = card.width / to.width, moved = `translate(${(card.left - to.left).toFixed(1)}px, ${(card.top - to.top).toFixed(1)}px) scale(${k.toFixed(4)})`;
  const frames = out
   ? [{ transform: moved, opacity: 0 }, { opacity: 1, offset: 0.35 }, { transform: 'none', opacity: 1 }]
   : [{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.65 }, { transform: moved, opacity: 0 }];
  scroll.style.transformOrigin = '0 0';
  scroll.animate(frames, { ...MORPH, fill: out ? 'backwards' : 'forwards' });
 }

 // The open note in the panel: its date, its page, its tools as they stand.
 showSheet(note) {
  this.note = note;
  this.view = 'sheet';
  this.sheet.hidden = false;
  this.menu(false);
  this.hideBar();
  for (const animation of scripted(this.sheetScroll.getAnimations())) animation.cancel();
  this.paintPage();
  this.paintTools();
  this.sheetScroll.scrollTop = 0;
  this.sheetBar.update();
  document.execCommand('defaultParagraphSeparator', false, 'p');
 }

 paintPage() {
  const note = this.note;
  this.page.innerHTML = note.html || note.text ? htmlOf(note) : '<h1><br></h1>';
  toneHeads(this.page);
  this.date.textContent = stamp(note.edited || note.at);
 }

 paintTools() {
  const note = this.note;
  if (!note) return;
  this.pin.classList.toggle('is-on', !!note.pinned);
  this.pin.setAttribute('aria-pressed', String(!!note.pinned));
  this.pin.title = I18n.t(note.pinned ? 'notes.unpin' : 'notes.pin');
  this.pin.setAttribute('aria-label', this.pin.title);
  this.done.classList.toggle('is-on', !!note.done);
  this.done.setAttribute('aria-pressed', String(!!note.done));
  this.done.title = I18n.t(note.done ? 'notes.undone' : 'notes.done');
  this.done.setAttribute('aria-label', this.done.title);
  this.disarm();
 }

 caretToStart() {
  const range = document.createRange();
  range.setStart(this.page.firstElementChild || this.page, 0);
  range.collapse(true);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
 }

 // Back to the gallery: the note is kept (one left empty is let go), the panel takes the gallery's height and the page
 // flies back into its card.
 back() {
  if (this.view !== 'sheet') return;
  const note = this.note;
  this.keepNow();
  this.menu(false);
  this.hideBar();
  this.view = 'shelf';
  this.note = null;
  this.forget(note);
  this.fill();
  this.shelf.hidden = false;
  for (const animation of this.shelf.getAnimations()) animation.cancel();
  const card = note && this.cards.querySelector(`[data-id="${CSS.escape(note.id)}"] .notepad-thumb, [data-id="${CSS.escape(note.id)}"]`);
  card?.scrollIntoView({ block: 'nearest' });
  const height = this.shelfHeight();
  this.shelf.style.height = `${height}px`;
  const to = card?.getBoundingClientRect() || null;
  this.root.querySelector('.notepad-compose').focus({ preventScroll: true });
  if (reducedMotion()) { this.sheet.hidden = true; this.resize(height); return; }
  this.shelf.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 160, easing: EASE.out, fill: 'backwards' });
  this.sheet.querySelector('.notepad-head').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-out', fill: 'forwards' });
  this.fly(to, false);
  const morph = this.resize(height, { views: [this.shelf] });
  const done = () => {
   if (this.view !== 'shelf') return;
   this.sheet.hidden = true;
   for (const animation of scripted(this.sheet.getAnimations({ subtree: true }))) animation.cancel();
   this.sheet.style.height = `${height}px`;
  };
  if (morph) quiet(morph).then(done); else done();
 }

 // A note taken away: the bin asks once more, then the note goes and the gallery comes back.
 remove() {
  if (!this.note) return;
  if (!this.bin.classList.contains('is-armed')) {
   this.bin.classList.add('is-armed');
   this.bin.title = I18n.t('notes.deleteConfirm');
   this.bin.setAttribute('aria-label', this.bin.title);
   clearTimeout(this.binTimer);
   this.binTimer = setTimeout(() => this.disarm(), CONFIRM_TIME);
   return;
  }
  this.disarm();
  this.chat.removeNote(this.conv, this.note.id);
 }

 // A note left with nothing written in it is let go, quietly: the panel is already on its way elsewhere.
 forget(note) {
  if (!note || String(note.text || '').trim() || !this.conv?.pad.items.includes(note)) return;
  this.busy = true;
  try { this.chat.removeNote(this.conv, note.id); } finally { this.busy = false; }
 }

 disarm() {
  clearTimeout(this.binTimer);
  this.bin.classList.remove('is-armed');
  this.bin.title = I18n.t('notes.delete');
  this.bin.setAttribute('aria-label', this.bin.title);
 }

 // The page changed under the user's hand: subheadings take their tones, a new checklist point starts unticked, and the
 // note is kept a moment after the last key.
 changed() {
  toneHeads(this.page);
  const at = getSelection().anchorNode, point = (at?.nodeType === 3 ? at.parentElement : at)?.closest?.('li');
  if (point && point.dataset.done && !point.textContent.trim()) delete point.dataset.done;
  clearTimeout(this.saving);
  this.saving = setTimeout(() => this.keepNow(), SAVE_AFTER);
  this.sheetBar.update();
 }

 keepNow() {
  clearTimeout(this.saving);
  this.saving = 0;
  const note = this.note;
  if (!note || this.view !== 'sheet' || !this.conv) return;
  const html = cleanHtml(this.page.innerHTML), text = textOf(this.page);
  if (html === (note.html || '') && text === (note.text || '')) return;
  this.chat.writeNote(this.conv, note.id, { text, html });
  this.date.textContent = stamp(note.edited || note.at);
 }

 // A press on a checklist point's ring ticks it off or back on.
 tick(event) {
  const point = event.target.closest?.('.notepad-checks > li');
  if (!point || !this.page.contains(point)) return;
  const box = point.getBoundingClientRect();
  if (event.clientX > box.left + 26) return;
  event.preventDefault();
  if (point.dataset.done === 'true') delete point.dataset.done; else point.dataset.done = 'true';
  this.changed();
 }

 onPageKey(event) {
  // Enter in the title goes on in body text, as a new note's first line does in the system's own notes.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
   const at = getSelection().anchorNode, block = (at?.nodeType === 3 ? at.parentElement : at)?.closest?.('h1, h2');
   if (block && this.page.contains(block)) {
    requestAnimationFrame(() => {
     const now = getSelection().anchorNode, fresh = (now?.nodeType === 3 ? now.parentElement : now)?.closest?.('h1, h2');
     if (fresh && fresh !== block && !fresh.textContent.trim()) { document.execCommand('formatBlock', false, 'p'); this.changed(); }
    });
   }
  }
 }

 // The text style chosen in the «Aa» menu or with the checklist button, for the lines the caret or the choice is on.
 applyStyle(name) {
  const style = STYLES.find(item => item?.name === name);
  if (!style || this.view !== 'sheet') return;
  this.page.focus({ preventScroll: true });
  const current = this.styleNow();
  if (style.block) {
   if (/^(bullets|numbers|checks)$/.test(current)) document.execCommand(current === 'numbers' ? 'insertOrderedList' : 'insertUnorderedList');
   document.execCommand('formatBlock', false, style.block === 'blockquote' && current === 'quote' ? 'p' : style.block);
  } else {
   const list = style.list === 'ol' ? 'insertOrderedList' : 'insertUnorderedList';
   const wasChecks = current === 'checks';
   if (current === name || (style.list === 'ul' && wasChecks)) {
    // Pressed again, a list is plain lines again; a checklist turned to points loses its rings.
    if (wasChecks && name === 'bullets') { this.listHere()?.classList.remove('notepad-checks'); this.changed(); return; }
    document.execCommand(list);
   } else {
    if (/^(bullets|numbers|checks)$/.test(current) && (current === 'numbers') !== (style.list === 'ol')) document.execCommand(current === 'numbers' ? 'insertOrderedList' : 'insertUnorderedList');
    if (!(current === 'bullets' && name === 'checks')) document.execCommand(list);
    const made = this.listHere();
    if (made) made.classList.toggle('notepad-checks', style.list === 'checks');
   }
  }
  this.changed();
  this.syncBar();
 }

 listHere() {
  const at = getSelection().anchorNode;
  const list = (at?.nodeType === 3 ? at.parentElement : at)?.closest?.('ul, ol');
  return list && this.page.contains(list) ? list : null;
 }

 // The style of the line the caret is on.
 styleNow() {
  const list = this.listHere();
  if (list) return list.tagName === 'OL' ? 'numbers' : list.classList.contains('notepad-checks') ? 'checks' : 'bullets';
  const at = getSelection().anchorNode, block = (at?.nodeType === 3 ? at.parentElement : at)?.closest?.('h1, h2, pre, blockquote, p');
  if (!block || !this.page.contains(block)) return 'body';
  // The page's first line is its title, whatever it was written as.
  if (block === this.page.firstElementChild && block.tagName === 'P') return 'title';
  return { H1: 'title', H2: 'heading', PRE: 'mono', BLOCKQUOTE: 'quote' }[block.tagName] || 'body';
 }

 menu(open) {
  if (open && this.view !== 'sheet') return;
  if (this.styles.hidden === !open) return;
  this.styles.hidden = !open;
  this.aa.classList.toggle('is-on', open);
  this.aa.setAttribute('aria-expanded', String(open));
  if (!open) { this.styleGlide.point(null); return; }
  this.hideBar();
  const now = this.styleNow();
  for (const item of this.styles.querySelectorAll('[data-style]')) {
   const on = item.dataset.style === now;
   item.classList.toggle('is-on', on);
   item.setAttribute('aria-checked', String(on));
  }
  const tool = this.aa.getBoundingClientRect(), frame = this.sheet.getBoundingClientRect();
  this.styles.style.left = `${Math.round(Math.min(tool.left - frame.left - 8, frame.width - this.styles.offsetWidth - 12))}px`;
  this.styles.style.top = `${Math.round(tool.bottom - frame.top + 6)}px`;
  if (!reducedMotion()) this.styles.animate([{ opacity: 0, transform: 'translateY(-4px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: EASE.out });
 }

 // The small bar under words chosen on the page: bold, italic, underline, strikethrough and the colours.
 // The choice of words changed: the bar goes, and comes back once the new choice has rested (BAR_AFTER). A change the
 // bar itself made (a mark, a colour) keeps it where it is.
 settleBar() {
  clearTimeout(this.barWait);
  if (!this.bar.hidden && this.sameChoice()) { this.syncBar(); return; }
  this.hideBar();
  if (this.choosing) return;
  const selection = getSelection(), range = selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || range.collapsed || !this.page.contains(range.commonAncestorContainer)) return;
  this.barWait = setTimeout(() => { this.barWait = 0; if (!this.choosing && this.view === 'sheet' && this.state === 'open') this.syncBar({ show: true }); }, BAR_AFTER);
 }

 hideBar() {
  clearTimeout(this.barWait);
  this.barWait = 0;
  this.bar.hidden = true;
  this.barChoice = null;
 }

 // Whether the words chosen are those the bar stands under.
 sameChoice() {
  const selection = getSelection(), range = selection.rangeCount ? selection.getRangeAt(0) : null, was = this.barChoice;
  return !!range && !!was && range.startContainer === was[0] && range.startOffset === was[1] && range.endContainer === was[2] && range.endOffset === was[3];
 }

 // The bar under the words chosen, with what they already are marked. It only comes when asked to (`show`); one
 // already out follows the words and their marks.
 syncBar({ show = false } = {}) {
  const selection = getSelection(), range = selection.rangeCount ? selection.getRangeAt(0) : null;
  const inside = range && !range.collapsed && this.page.contains(range.commonAncestorContainer) && this.styles.hidden;
  if (!inside || (this.bar.hidden && !show)) { this.hideBar(); return; }
  this.barChoice = [range.startContainer, range.startOffset, range.endContainer, range.endOffset];
  const rects = [...range.getClientRects()].filter(rect => rect.width), last = rects.at(-1) || range.getBoundingClientRect(), first = rects[0] || last;
  const frame = this.sheet.getBoundingClientRect(), scroll = this.sheetScroll.getBoundingClientRect();
  if (last.bottom < scroll.top || first.top > scroll.bottom) { this.hideBar(); return; }
  const was = this.bar.hidden;
  this.bar.hidden = false;
  for (const mark of this.bar.querySelectorAll('[data-command]')) mark.classList.toggle('is-on', document.queryCommandState(mark.dataset.command));
  const tone = (range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer)?.closest?.('mark')?.dataset.tone || '';
  for (const dot of this.bar.querySelectorAll('[data-tone]')) dot.classList.toggle('is-on', !!tone && dot.dataset.tone === tone);
  const width = this.bar.offsetWidth, height = this.bar.offsetHeight, middle = (first.left + last.right) / 2;
  let top = last.bottom - frame.top + 8;
  if (last.bottom + 8 + height > frame.bottom - 8) top = first.top - frame.top - height - 8;
  this.bar.style.left = `${Math.round(Math.max(12, Math.min(frame.width - width - 12, middle - frame.left - width / 2)))}px`;
  this.bar.style.top = `${Math.round(top)}px`;
  if (was && !reducedMotion()) this.bar.animate([{ opacity: 0, transform: 'translateY(-3px) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: EASE.out });
 }

 // The chosen words take a colour (or lose it): the tone of the agent's headings, the words in it on a wash of it.
 colour(tone) {
  const selection = getSelection(), range = selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || range.collapsed || !this.page.contains(range.commonAncestorContainer)) return;
  const pieces = [], walker = document.createTreeWalker(this.page, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (range.intersectsNode(node) && node.data.length) pieces.push(node);
  const { startContainer, startOffset, endContainer, endOffset } = range, chosen = [];
  for (let node of pieces) {
   const from = node === startContainer ? startOffset : 0, to = node === endContainer ? endOffset : node.data.length;
   if (from >= to) continue;
   if (to < node.data.length) node.splitText(to);
   if (from > 0) node = node.splitText(from);
   chosen.push(node);
  }
  for (const node of chosen) {
   // The words leave any colour they were in: the colour is split around them.
   const old = node.parentElement.closest('mark');
   if (old && this.page.contains(old)) {
    const before = document.createRange(), after = document.createRange();
    before.setStart(old, 0);
    before.setEndBefore(this.outermost(node, old));
    after.setStartAfter(this.outermost(node, old));
    after.setEnd(old, old.childNodes.length);
    const head = before.extractContents(), tail = after.extractContents();
    if (head.textContent) { const mark = old.cloneNode(false); mark.append(head); old.before(mark); }
    if (tail.textContent) { const mark = old.cloneNode(false); mark.append(tail); old.after(mark); }
    old.replaceWith(...old.childNodes);
   }
   if (tone) {
    const mark = document.createElement('mark');
    mark.dataset.tone = tone;
    node.replaceWith(mark);
    mark.append(node);
   }
  }
  // Colours side by side of one tone are one.
  for (const mark of [...this.page.querySelectorAll('mark')]) {
   const next = mark.nextSibling;
   if (next?.nodeName === 'MARK' && next.dataset.tone === mark.dataset.tone) { mark.append(...next.childNodes); next.remove(); }
  }
  if (chosen.length) {
   const again = document.createRange();
   again.setStart(chosen[0], 0);
   again.setEnd(chosen.at(-1), chosen.at(-1).data.length);
   selection.removeAllRanges();
   selection.addRange(again);
  }
  this.changed();
  this.syncBar();
 }

 // The child of `root` that holds `node`.
 // A colour is given to the words chosen, not to what is written after them: typing at the end of a coloured word goes
 // on in plain text, as it does at its start (the engine itself would carry the colour on).
 pastMark(event) {
  if (event.inputType !== 'insertText' || !event.data) return;
  const selection = getSelection();
  if (!selection.isCollapsed || !selection.rangeCount) return;
  const caret = selection.getRangeAt(0), at = caret.startContainer;
  let mark = (at.nodeType === 3 ? at.parentElement : at)?.closest?.('mark');
  if (!mark || !this.page.contains(mark)) return;
  while (mark.parentElement?.closest('mark') && this.page.contains(mark.parentElement)) mark = mark.parentElement.closest('mark');
  const rest = document.createRange();
  rest.setStart(caret.startContainer, caret.startOffset);
  rest.setEndAfter(mark);
  if (rest.toString()) return;
  // The engine puts a caret just past a coloured word back inside it, so the words go on past an unseen mark-free
  // character: it is never kept (cleanNode, textOf), and the typing stays one step to undo.
  event.preventDefault();
  let gap = mark.nextSibling;
  if (gap?.nodeType !== 3 || !gap.data.startsWith('\u200b')) { gap = document.createTextNode('\u200b'); mark.after(gap); }
  const after = document.createRange();
  after.setStart(gap, 1);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
  document.execCommand('insertText', false, event.data);
 }

 outermost(node, root) {
  let at = node;
  while (at.parentNode !== root) at = at.parentNode;
  return at;
 }

 // It goes from wherever it is: closed while still coming, it turns back from there. Then the button is there again.
 close({ instant = false, focusButton = false } = {}) {
  if (this.state !== 'open') return;
  if (this.view === 'sheet') {
   this.keepNow();
   this.forget(this.note);
  }
  this.state = 'closing';
  this.button.setAttribute('aria-expanded', 'false');
  this.menu(false);
  this.hideBar();
  if (instant || reducedMotion()) { this.root.classList.add('is-closing'); this.finish(focusButton); return; }
  this.root.classList.add('is-closing');
  const gone = this.leaving = this.root.animate(AWAY, CLOSE);
  quiet(gone).then(() => { if (this.leaving === gone) this.finish(focusButton); });
 }

 finish(focusButton = false) {
  this.state = 'closed';
  this.leaving = null;
  this.morph = null;
  this.button.classList.remove('is-away');
  for (const animation of scripted(this.root.getAnimations({ subtree: true }))) animation.cancel();
  if (this.root.matches(':popover-open')) this.root.hidePopover();
  this.cards.replaceChildren();
  this.page.replaceChildren();
  this.root.classList.remove('is-closing');
  this.view = 'shelf';
  this.note = null;
  this.conv = null;
  if (focusButton) this.button.focus({ preventScroll: true });
 }
}

// What the agent did with the notes, as a black capsule in the chat: the notes' own sign, what happened in bold («Noted»
// for a note it wrote down when asked to, «Reminder» for one it brought up), the note in the user's own words after it,
// and a small white button that opens the notes at that note, as a press anywhere on the capsule does.
const KINDS = {
 reminder: { name: 'remind', label: 'notes.reminder' },
 noted: { name: 'add', label: 'notes.noted' },
 edited: { name: 'add', label: 'notes.edited' },
};
// A note the agent rewrote stands in the chat as one it wrote down, with its own word.
const kindOf = entry => KINDS[entry?.edited ? 'edited' : entry?.role] || KINDS.reminder;
// The pencil's moment: writing a note down it runs along a line and back; bringing one up it knocks on the sheet twice.
const MOMENT = {
 add: { duration: 900, frames: [{ transform: 'none' }, { transform: 'translate(1px, 1px) rotate(-9deg)', offset: 0.22 }, { transform: 'translate(6px, 0) rotate(-5deg)', offset: 0.55 }, { transform: 'translate(2px, 1px) rotate(-8deg)', offset: 0.78 }, { transform: 'none' }] },
 remind: { duration: 820, frames: [{ transform: 'none' }, { transform: 'rotate(-15deg)', offset: 0.2 }, { transform: 'none', offset: 0.4 }, { transform: 'rotate(-10deg)', offset: 0.6 }, { transform: 'none', offset: 0.8 }, { transform: 'none' }] },
};

const NotePill = {
 build(entry) {
  const kind = kindOf(entry);
  const el = element('div', `thread-note is-${kind.name}`);
  el.dataset.note = entry.note || '';
  el.__entry = entry;
  const pill = element('button', 'thread-note-pill');
  pill.type = 'button';
  pill.innerHTML = `<span class="thread-note-sign" aria-hidden="true">${Glyphs.notes}${CHECK}</span><span class="thread-note-label"></span><span class="thread-note-text"></span><span class="thread-note-go"></span>`;
  const text = pill.querySelector('.thread-note-text');
  text.textContent = entry.text || '';
  pill.querySelector('.thread-note-go').textContent = I18n.t('notes.pill.open');
  // A note too long for the pill is told in full under the pointer.
  pill.addEventListener('pointerenter', () => { pill.title = text.scrollWidth > text.clientWidth ? text.textContent : ''; });
  el.append(pill);
  NotePill.mark(el, false);
  return el;
 },

 // Whether the note of a reminder has been ticked off since: the sign gives way to a tick and the pill grows quiet.
 mark(el, done) {
  const kind = kindOf(el.__entry), was = el.classList.contains('is-done');
  el.classList.toggle('is-done', done);
  const label = I18n.t(done ? 'notes.reminder.done' : kind.label);
  el.querySelector('.thread-note-label').textContent = label;
  el.querySelector('.thread-note-pill').setAttribute('aria-label', `${label}: ${el.__entry?.text || ''}`);
  if (done && !was && el.isConnected && !reducedMotion()) {
   el.querySelector('.glyph-done path').animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 420, delay: 120, easing: EASE.motion, fill: 'backwards' });
  }
 },

 // Just come into the chat: the chat makes room for the pill, the pill settles into it from the left, its sign is drawn
 // and the pencil has its moment, what the pill says is written out from the left, and its button comes up last.
 enter(el) {
  if (reducedMotion() || !el.isConnected) return;
  const pill = el.querySelector('.thread-note-pill'), sign = el.querySelector('.thread-note-sign'), kind = el.classList.contains('is-add') ? 'add' : 'remind';
  const height = el.offsetHeight, gap = el.previousElementSibling || el.nextElementSibling ? parseFloat(getComputedStyle(el.parentElement).rowGap) || 0 : 0;
  const free = () => { el.style.overflow = ''; };
  el.style.overflow = 'clip';
  el.animate([{ height: '0px', marginTop: `${-gap}px` }, { height: `${height}px`, marginTop: '0px' }], { duration: PILL.room, easing: EASE.motion }).finished.then(free, free);
  pill.animate([{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, offset: 0.45 }, { opacity: 1, transform: 'none' }], { duration: PILL.settle, easing: EASE.pop });
  const strokes = [...sign.querySelectorAll('.glyph-notes path')];
  strokes.forEach((path, k) => path.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: PILL.stroke, delay: PILL.signAt + k * PILL.strokeStep, easing: EASE.motion, fill: 'backwards' }));
  const moment = MOMENT[kind];
  sign.querySelector('.notes-pen').animate(moment.frames, { duration: moment.duration, delay: PILL.signAt + PILL.moment, easing: 'ease-in-out' });
  // Nothing of a letter is cut above or below the line while it is written out.
  const shut = 'inset(-6px 100% -6px 0)', open = 'inset(-6px -2px -6px 0)';
  el.querySelector('.thread-note-label').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.4 }, { clipPath: open, opacity: 1 }], { duration: PILL.label, delay: PILL.wordsAt, easing: EASE.out, fill: 'backwards' });
  el.querySelector('.thread-note-text').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.3 }, { clipPath: open, opacity: 1 }], { duration: PILL.words, delay: PILL.wordsAt + PILL.label * 0.6, easing: EASE.out, fill: 'backwards' });
  pill.querySelector('.thread-note-go').animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'none' }], { duration: PILL.go, delay: PILL.goAt, easing: EASE.pop, fill: 'backwards' });
 },
};

// A note the agent writes down comes as a few lines of plain marks, the way it writes its replies, and is made into a page:
// the first line its title; "## " a subheading in a tone; "- " points, "- [ ] " and "- [x] " a checklist, "1. " numbered
// points, "> " a quote; **bold**, *italic*, ~~struck out~~ and ==words== in a colour (==green:words== for a given one).
// The colours by their names, as a model may write them in the user's language.
const TONE_NAMES = Object.fromEntries(Object.entries({
 lilac: 'lilac purple violet сиреневый фиолетовый лиловый viola lilla violet mauve',
 pink: 'pink rose red розовый красный rosa rosso rouge',
 orange: 'orange yellow оранжевый желтый arancione giallo jaune',
 green: 'green зеленый verde vert',
 blue: 'blue синий голубой blu azzurro bleu',
}).flatMap(([tone, names]) => names.split(' ').map(name => [name, tone])));
const NoteFormat = {
 inline(line) {
  return escapeHtml(line)
   .replace(/==(.+?)==/g, (_, inside) => {
    // A colour named before the words, in English or in the user's language ("==зелёный:words=="); words that only
    // hold a colon are words.
    const named = inside.match(/^\s*([\p{L}]+)\s*:\s*(.+)$/u), tone = named && TONE_NAMES[named[1].toLowerCase().replace('ё', 'е')];
    return `<mark data-tone="${tone || 'orange'}">${tone ? named[2] : inside}</mark>`;
   })
   .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
   .replace(/~~(.+?)~~/g, '<s>$1</s>')
   .replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1<i>$2</i>');
 },

 // A page as the agent reads it and rewrites it: in the same marks fromText reads, so a note it rewrites keeps its
 // title, subheadings, points, checklists, bold and colours.
 toText(html) {
  const page = document.createElement('div');
  page.innerHTML = cleanHtml(html);
  const wrap = { B: words => `**${words}**`, I: words => `*${words}*`, S: words => `~~${words}~~` };
  const inline = node => [...node.childNodes].map(child => {
   if (child.nodeType === 3) return child.data.replace(/​/g, '').replace(/\s*\n\s*/g, ' ');
   if (child.nodeType !== 1) return '';
   if (child.tagName === 'BR') return ' ';
   const words = inline(child), core = words.trim();
   const mark = child.tagName === 'MARK' ? core => `==${child.dataset.tone}:${core}==` : wrap[child.tagName];
   if (!core || !mark) return words;
   return `${words.match(/^\s*/)[0]}${mark(core)}${words.match(/\s*$/)[0]}`;
  }).join('');
  const lines = [];
  for (const block of page.children) {
   const tag = block.tagName;
   if (tag === 'UL' || tag === 'OL') {
    const checks = block.classList.contains('notepad-checks');
    [...block.children].forEach((point, i) => {
     const words = inline(point).trim();
     if (words) lines.push(`${checks ? (point.dataset.done === 'true' ? '- [x] ' : '- [ ] ') : tag === 'OL' ? `${i + 1}. ` : '- '}${words}`);
    });
    lines.push('');
    continue;
   }
   const words = (tag === 'PRE' ? block.textContent.replace(/\s*\n\s*/g, ' ') : inline(block)).trim();
   if (!words) continue;
   if (tag === 'H1') lines.push(lines.some(Boolean) ? `# ${words}` : words);
   else if (tag === 'H2') lines.push(`## ${words}`);
   else if (tag === 'BLOCKQUOTE') lines.push(`> ${words}`);
   else lines.push(words);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
 },

 fromText(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = '', titled = false;
  const close = () => { if (list) { out.push(list === 'ol' ? '</ol>' : '</ul>'); list = ''; } };
  const open = kind => {
   if (list === kind) return;
   close();
   out.push(kind === 'ol' ? '<ol>' : kind === 'checks' ? '<ul class="notepad-checks">' : '<ul>');
   list = kind;
  };
  for (const raw of lines) {
   const line = raw.trim();
   if (!line) { close(); continue; }
   let m;
   if ((m = line.match(/^[-*•]\s+\[( |x|X)\]\s+(.*)$/))) { open('checks'); out.push(`<li${m[1] === ' ' ? '' : ' data-done="true"'}>${this.inline(m[2])}</li>`); titled = true; continue; }
   if ((m = line.match(/^[-*•]\s+(.*)$/))) { open('ul'); out.push(`<li>${this.inline(m[1])}</li>`); titled = true; continue; }
   if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { open('ol'); out.push(`<li>${this.inline(m[1])}</li>`); titled = true; continue; }
   close();
   if ((m = line.match(/^#\s+(.*)$/)) || (!titled && !/^(#{2,}|>)/.test(line))) {
    out.push(`<h1>${this.inline(m ? m[1] : line).replace(/<\/?b>/g, '')}</h1>`);
   } else if ((m = line.match(/^#{2,}\s+(.*)$/))) out.push(`<h2>${this.inline(m[1])}</h2>`);
   else if ((m = line.match(/^>\s?(.*)$/))) out.push(`<blockquote><p>${this.inline(m[1])}</p></blockquote>`);
   else out.push(`<p>${this.inline(line)}</p>`);
   titled = true;
  }
  close();
  const html = cleanHtml(out.join(''));
  const page = document.createElement('div');
  page.innerHTML = html;
  return { html, text: textOf(page) };
 },
};

window.Notepad = Notepad;
window.NotePill = NotePill;
window.NoteFormat = NoteFormat;
})();
