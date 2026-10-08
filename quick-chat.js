'use strict';

// The quick chat: a chat in a small window of its own that a key combination brings up over whatever is on screen
// (desktop/quick.js makes the window and keeps it). It began as a copy of the mini chat and wears the mini chat's look,
// but it is a chat in its own right, not a side chat of another: what is said in it is a chat of the list like any
// other, marked with a bolt, with its own model and effort, its own compacting and stats. It has no built-in browser.
//
// A chat is written from one window only. It lives here until the main window takes it: opened there from the list, or
// sent there with the arrows in the head. While an agent is at work in it here, the main window brings this one up
// instead of opening it.
(() => {
const bridge = window.openghost, quick = bridge?.quickChat;
if (!quick) return;

if (!bridge.quick) {
 // The main window's part.
 const open = chat.open.bind(chat);
 chat.open = async id => {
  if (library.chat(id)?.quick && await quick.claim(id).catch(() => false)) return;
  return open(id);
 };
 // A chat sent on from the quick window: the list is read anew, and the chat as the disk has it.
 quick.onOpen(async id => {
  await library.reload();
  if (!library.chat(id)) return;
  if (chat.activeId !== id) chat.remove(id);
  await open(id);
  composerInput.focus();
 });
 // What the quick chat has no room for is shown in the settings here.
 quick.onSettings(({ reason = '', provider = '', page = '' } = {}) => {
  settings.open(reason, provider);
  if (page) settings.page(page);
 });
 return;
}

// From here on: the quick window's own page.
// The card comes in two beats. First the message field alone: it swells gently from a small pill at its own middle, out
// of a blur, a warm light wrapped round it. Then, at once and quickly, the rest of the card opens from it, the light
// riding its edge until it lets go, spreads a little and thins away. The card goes into a blur, quickly.
const ARRIVE = { field: 640, card: 440, blur: 10, lift: 320, seed: { x: 0.34, y: 0.3 }, swell: 'cubic-bezier(0.32, 0, 0.12, 1)', open: 'cubic-bezier(0.18, 0.82, 0.2, 1)' };
const LIGHT = { tail: 950, from: 200, turn: 110, spread: 1.03 };
const LEAVE = { duration: 170, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' };
// Once the card is off the page, the empty page is given three frames to reach the screen; on a computer hard at work
// those may be slow, and this is the longest the window waits for them.
const EMPTY = { frames: 3, wait: 600 };
const CONFIRM_TIME = 3000;
const WIPE = { duration: 260, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
// How long the window may be away and still come back with the chat it had; after that it comes with a new one.
const FRESH = 10 * 60 * 1000;
// While the window is sized its words give way to grey bars, as the mini chat's do: how long the two take to change
// places, the most lines one block is drawn with, and how wide the lines of a block are, in turn.
const BONES = { fade: 240, lines: 12, widths: [100, 94, 98, 89, 96, 91], last: 58 };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The arrows that send the chat on into the app: they part a little under the pointer.
class ExpandButton extends IconButton {
 constructor() {
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
     <path class="outer" d="M65 41h14v14M79 41 63 57"/>
     <path class="inner" d="M55 79H41V65M41 79l16-16"/>
    </g>
   </svg>`, { part: [240, 20] }, `button{border-radius:50%}.glyph{stroke-width:var(--icon-stroke,5.5)}`);
  this.outer = this.shadowRoot.querySelector('.outer');
  this.inner = this.shadowRoot.querySelector('.inner');
 }
 defaultLabel() { return I18n.t('quick.expand'); }
 activate() { this.dispatchEvent(new CustomEvent('expand', { bubbles: true, composed: true })); }
 targets(hover, reduced) { return { part: reduced ? 0 : hover }; }
 render(v) {
  this.outer.setAttribute('transform', `translate(${v.part * 2.4} ${-v.part * 2.4})`);
  this.inner.setAttribute('transform', `translate(${-v.part * 2.4} ${v.part * 2.4})`);
 }
}
if (!customElements.get('expand-button')) customElements.define('expand-button', ExpandButton);

// The mini chat's own frame, with a head of its own (a new chat, on into the app, delete, close) and a message field
// that has the model and the effort in it, as a chat's has.
const TEMPLATE = `
 <header class="mini-head">
  <span class="mini-title">${'{ghost}'}<span data-i18n="quick.title"></span></span>
  <span class="mini-tools">
   <add-button class="quick-tool quick-new" data-i18n-attr="label:quick.new"></add-button>
   <expand-button class="quick-tool quick-expand"></expand-button>
   <clear-button class="mini-clear" data-i18n-attr="label:quick.delete"></clear-button>
   <close-button class="mini-close"></close-button>
  </span>
 </header>
 <div class="mini-grip" aria-hidden="true"><svg viewBox="0 0 26 26"><path d="M20.4 8.2A15.5 15.5 0 0 1 8.2 20.4"/></svg></div>
 <div class="mini-main is-empty">
  <div class="thread-view">
   <div class="thread"><div class="thread-list"></div></div>
   <div class="scrollbar thread-scrollbar" aria-hidden="true"><div class="scrollbar-thumb"></div></div>
   <scroll-button class="thread-bottom glass-lens"></scroll-button>
  </div>
  <div class="mini-empty" aria-hidden="true"><ghost-thinking></ghost-thinking><p data-i18n="quick.empty"></p></div>
  <div class="drop-zone" aria-hidden="true">
   <div class="drop-art"></div>
   <div class="drop-title" data-i18n="drop.title"></div>
   <div class="drop-hint" data-i18n="drop.hint"></div>
  </div>
  <div class="composer">
   <div class="composer-attachments"><div class="attachments-row"></div></div>
   <input class="composer-picker" type="file" multiple hidden>
   <div class="composer-field">
    <div class="composer-placeholder" aria-hidden="true" data-i18n="quick.placeholder"></div>
    <div class="composer-mirror" aria-hidden="true"><div class="composer-mirror-lines"></div></div>
    <div class="composer-ghosts" aria-hidden="true"></div>
    <textarea class="composer-input" data-i18n-attr="aria-label:composer.label"></textarea>
    <div class="scrollbar composer-scrollbar" aria-hidden="true"><div class="scrollbar-thumb"></div></div>
   </div>
   <div class="composer-toolbar">
    <div class="composer-tools">
     <add-button class="composer-add" data-i18n-attr="label:attach.add"></add-button>
     <button type="button" class="composer-mode" aria-haspopup="menu" aria-expanded="false" hidden></button>
    </div>
    <div class="composer-actions">
     <model-button class="composer-model"></model-button>
     <effort-button class="composer-effort"></effort-button>
     <send-button class="composer-send" disabled></send-button>
    </div>
   </div>
  </div>
 </div>`;
// The effort's slider, as index.html has it for the app's own message field.
const EFFORT = `
 <div class="effort-slider" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="3" data-i18n-attr="aria-label:effort">
  <div class="effort-track"><span class="effort-fill"></span></div>
  <span class="effort-thumb glass-lens"></span>
 </div>`;

function popover(className, label, html = '') {
 const el = document.createElement('div');
 el.className = className;
 el.setAttribute('popover', 'manual');
 el.setAttribute('role', 'dialog');
 el.setAttribute('aria-label', I18n.t(label));
 el.innerHTML = html;
 I18n.apply(el);
 document.body.append(el);
 return el;
}

// A photo opened in the quick chat stands in a frame in a window of its own (desktop/quick.js, quick-photo.js), so it
// may be larger than the card. Here the card goes soft under a veil while the photo is out, and the stack the photo
// came from turns along as the photos are leafed through.
const VEIL_FADE = { duration: 240, easing: 'ease', fill: 'both' };

class QuickViewer {
 // items: { url, name, href, width, height } in the stack's order; slider: the stack they are shown in.
 static open(options) {
  if (QuickViewer.current) return null;
  return QuickViewer.current = new QuickViewer(options);
 }

 constructor({ items, index = 0, slider = null }) {
  this.slider = slider;
  this.closing = false;
  const veil = this.veil = popover('quick-photo-veil', 'viewer.label');
  veil.addEventListener('click', () => this.close());
  this.onKey = event => {
   if (event.key !== 'Escape') return;
   event.preventDefault();
   event.stopImmediatePropagation();
   this.close();
  };
  document.addEventListener('keydown', this.onKey, true);
  veil.showPopover();
  veil.animate({ opacity: [0, 1] }, VEIL_FADE);
  quick.photo({
   items: items.map(item => ({ url: item.url, name: item.name || '', width: item.width || 0, height: item.height || 0 })), index,
   theme: document.documentElement.dataset.theme, label: I18n.t('viewer.label'), close: I18n.t('viewer.close'), prev: I18n.t('media.prev'), next: I18n.t('media.next'),
  });
 }

 // The photo's window is asked to go; it says when it has.
 close() {
  if (this.closing) return;
  this.closing = true;
  quick.photoClose();
 }

 turned(index) {
  this.slider?.go(index);
 }

 closed(index) {
  document.removeEventListener('keydown', this.onKey, true);
  if (QuickViewer.current === this) QuickViewer.current = null;
  if (Number.isInteger(index)) this.slider?.go(index);
  const veil = this.veil, done = () => { veil.hidePopover(); veil.remove(); };
  veil.animate({ opacity: [1, 0] }, VEIL_FADE).finished.then(done, done);
 }
}
QuickViewer.current = null;
quick.onPhotoTurned(index => QuickViewer.current?.turned(index));
quick.onPhotoClosed(index => QuickViewer.current?.closed(index));
window.PhotoViewer = QuickViewer;

class QuickChat {
 constructor() {
  const dialog = this.dialog = document.createElement('div');
  dialog.className = 'mini quick';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('popover', 'manual');
  dialog.innerHTML = TEMPLATE.replace('{ghost}', Glyphs.ghost);
  // What is selected in the chat and asked about goes to this chat's own message field (see SelectionMenu in script.js).
  dialog.__mini = this;
  I18n.apply(dialog);
  dialog.setAttribute('aria-label', I18n.t('quick.title'));
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  this.main = $('.mini-main');
  this.composer = $('.composer');
  this.field = $('.composer-field');
  this.input = $('.composer-input');
  this.send = $('.composer-send');
  const thread = $('.thread'), bottom = $('.thread-bottom');
  bottom.style.setProperty('--glass-lens', getComputedStyle(document.querySelector('.thread-bottom')).getPropertyValue('--glass-lens'));
  this.height = new SmoothHeight(this.field, this.input);
  new Scrollbar(this.input, $('.composer-scrollbar'));
  const scrollbar = new Scrollbar(thread, $('.thread-scrollbar'));
  this.text = new ComposerText(this.input, $('.composer-mirror'));
  LinkChip.watch($('.composer-mirror'));
  LinkChip.watch(thread);
  new ResizeObserver(() => {
   const gap = parseFloat(getComputedStyle(this.main).getPropertyValue('--composer-bottom-gap')) || 0;
   this.main.style.setProperty('--composer-space', `${Math.ceil(this.composer.offsetHeight + gap)}px`);
  }).observe(this.composer);

  // Out of sight; whether a reply was being written at the last look; a reply that came while out of sight and has
  // not been seen; on its way out.
  this.away = true;
  this.was = false;
  this.unseen = false;
  this.closing = 0;
  this.bones = null;
  this.sizing = false;
  this.moving = false;

  this.chat = new Chat({
   main: this.main, thread, bottom, settings, library, onChange: () => this.sync(), onList: list => scrollbar.observe(list),
   // A waiting message taken back to be rewritten: its words return to the field, its files to the tray.
   onRecall: ({ rest, quotes, attachments }) => {
    this.attachments.give(attachments);
    this.text.restore(rest, quotes);
    this.sync();
   },
  });
  this.attachments = new Attachments({
   tray: $('.composer-attachments'),
   picker: $('.composer-picker'),
   panel: document.querySelector('.note-panel'),
   main: this.main,
   zone: $('.drop-zone'),
   input: this.input,
   onChange: () => this.sync(),
   onText: (text, undo) => this.text.place(text, undo),
   isActive: event => this.open && (!event || dialog.contains(event.target)),
  });
  // The plus has what a chat's has: photos and files, compacting the chat, its stats.
  this.addMenu = new AddMenu({ button: $('.composer-add'), host: dialog, attachments: this.attachments, chat: this.chat, input: this.input, anchor: '--mini-add' });
  if (AgentTools.available) {
   const mode = $('.composer-mode');
   mode.hidden = false;
   this.mode = new ModePicker({ button: mode, host: dialog, anchor: '--mini-mode', settings, onChange: () => this.chat.onModeChange() });
  }
  // The model and the effort are this chat's own. Their stages open in this window, which is the card's size, and so
  // keep to the card.
  this.models = new ModelStage({ button: $('.composer-model'), root: popover('model-stage is-quick', 'model'), chat: this.chat, settings, input: this.input });
  this.models.room = () => dialog.getBoundingClientRect();
  this.effort = new EffortSlider({ button: $('.composer-effort'), panel: popover('effort-panel is-quick', 'effort', EFFORT), settings });

  this.input.addEventListener('input', () => this.sync());
  this.input.addEventListener('keydown', event => this.onKey(event));
  this.send.addEventListener('composer-send', () => this.submit());
  this.composer.addEventListener('mousedown', event => {
   if (event.target === this.composer || event.target.classList.contains('composer-toolbar')) {
    event.preventDefault();
    this.input.focus();
   }
  });
  this.newButton = $('.quick-new');
  this.expandButton = $('.quick-expand');
  this.clearButton = $('.mini-clear');
  this.newButton.addEventListener('add', () => this.renew());
  this.expandButton.addEventListener('expand', () => this.expand());
  this.clearButton.addEventListener('clear', () => this.onClear());
  this.clearButton.addEventListener('pointerleave', () => this.disarm());
  $('.mini-close').addEventListener('dismiss', () => quick.hide());
  // The head drags the window and the arc in the corner sizes it, as in the mini chat. Twice on the head: back to
  // where the window first stood. Twice on the arc: back to the size it first came with.
  this.head = $('.mini-head');
  this.grip = $('.mini-grip');
  this.head.addEventListener('pointerdown', event => this.onHold(event));
  this.grip.addEventListener('pointerdown', event => this.onGrab(event));
  this.head.addEventListener('dblclick', event => { if (!event.target.closest('.mini-tools')) quick.drag('home'); });
  this.grip.addEventListener('dblclick', () => quick.size(null, true));

  // Escape stops the agent, or puts the window away. Whatever is open over the chat (a menu, the models, the effort, a
  // photo) takes it first.
  document.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
   if (document.querySelector('dialog[open]') || [...document.querySelectorAll(':popover-open')].some(el => el !== dialog && el !== this.glow)) return;
   event.preventDefault();
   if (this.chat.busy) this.chat.stop();
   else quick.hide();
  });
  // The page's own search belongs to the app's window.
  window.addEventListener('keydown', event => {
   if (event.code === 'KeyK' && (event.ctrlKey || event.metaKey)) event.stopImmediatePropagation();
  }, true);

  // Clear of the card the window lets the pointer through to what is behind it: the page says where the pointer is.
  this.over = null;
  const within = target => !!target?.closest?.('.mini.quick, :popover-open, dialog[open]');
  window.addEventListener('mousemove', event => this.point(this.sizing || this.moving || within(event.target)), true);

  // The page's own chat is unseen here and stays empty. What it does when the list of chats changes (syncAll in
  // script.js) is left out, so that the model and the effort follow this chat alone.
  library.onChange = () => this.onLibrary();
  chat.onChange = () => {};
  // There is no room here for the settings: they open in the app's window.
  settings.open = (reason = '', provider = '') => quick.settings({ reason, provider });
  MemoryPill.onOpen = () => quick.settings({ page: 'memory' });

  quick.onShown(data => this.onShown(data));
  quick.onAway(() => this.onAway());
  quick.onClaim(id => this.claim(id));
  this.sync();
 }

 get open() {
  return this.dialog.matches(':popover-open');
 }

 // Whether the chat on screen has begun: it is in the list from its first message on.
 get has() {
  return !!this.chat.active?.record;
 }

 point(over) {
  if (over === this.over) return;
  this.over = over;
  quick.over(over);
 }

 // The window has come up. What the app's window changed meanwhile is taken in; after a long while away the chat is a
 // new one, unless an answer came meanwhile that has not been seen.
 onShown({ away = 0 } = {}) {
  const chat = this.chat;
  this.away = false;
  settings.reread?.();
  Theme.sync?.();
  this.effort.follow?.();
  if (chat.active?.record?.unread) library.update(chat.activeId, { unread: false });
  if (this.has && !chat.busy && !this.unseen && away > FRESH) chat.newChat();
  this.unseen = false;
  clearTimeout(this.closing);
  this.closing = 0;
  this.leaving?.cancel();
  this.leaving = null;
  this.parting = null;
  const coming = !this.open;
  if (coming) this.dialog.showPopover();
  this.over = null;
  this.input.focus({ preventScroll: true });
  this.sync();
  // Last, when the field has its words and its height.
  if (coming) this.arrive();
 }

 // The window is going: the card goes first, the way the mini chat closes, and then says so.
 onAway() {
  this.away = true;
  this.disarm();
  // The window goes only once the page has drawn itself empty. What a window shows in its first instant, when it is
  // called again, is the last thing it drew: were that the card, the card would flash before it comes.
  const end = () => {
   this.closing = 0;
   if (this.open) this.dialog.hidePopover();
   this.leaving?.cancel();
   this.leaving = null;
   const parting = this.parting = {};
   const gone = () => {
    if (this.parting !== parting) return;
    this.parting = null;
    quick.gone();
   };
   let left = EMPTY.frames;
   const frame = () => { if (--left > 0) requestAnimationFrame(frame); else gone(); };
   requestAnimationFrame(frame);
   setTimeout(gone, EMPTY.wait);
  };
  this.settle();
  if (reducedMotion() || !this.open) { end(); return; }
  this.leaving = this.dialog.animate({ opacity: [1, 0], filter: ['blur(0px)', `blur(${ARRIVE.blur + 2}px)`], transform: ['none', 'scale(1.02)'] }, LEAVE);
  this.closing = setTimeout(end, LEAVE.duration);
 }

 // The card's coming. It is cut to the message field's shape while the field comes out of its blur, and the cut then
 // opens past the card's edges, so the card's shadow comes last. The light is a ring that keeps to the cut's edge.
 arrive() {
  this.settle();
  if (reducedMotion()) return;
  // Out of sight the field had no height, and would grow to its own over the first frames: it takes it at once.
  this.height.goal = this.input.getBoundingClientRect().height;
  this.height.snap();
  const card = this.dialog, box = card.getBoundingClientRect(), field = card.querySelector('.composer'), at = field.getBoundingClientRect();
  if (!box.width || !at.width) return;
  const side = { top: at.top - box.top, right: box.right - at.right, bottom: box.bottom - at.bottom, left: at.left - box.left };
  const round = getComputedStyle(field).borderTopLeftRadius, style = getComputedStyle(document.documentElement);
  const room = name => parseFloat(style.getPropertyValue(`--quick-${name}`)) || 0;
  const total = ARRIVE.field + ARRIVE.card, f1 = ARRIVE.field / total;
  // The field begins as a small pill at its own middle.
  const dx = at.width * ARRIVE.seed.x, dy = at.height * ARRIVE.seed.y;
  const seed = `inset(${side.top + dy}px ${side.right + dx}px ${side.bottom + dy}px ${side.left + dx}px round ${at.height}px)`;
  const small = `inset(${side.top}px ${side.right}px ${side.bottom}px ${side.left}px round ${round})`;
  // The cut ends a hair outside the card, where the card's fine outer line is; its deep shadow, which a cut would show
  // with square corners, comes in by itself once the cut is gone.
  const whole = 'inset(-2px round 24px)';
  const lift = getComputedStyle(card).boxShadow, at0 = lift.lastIndexOf('rgb');
  const flat = at0 < 0 ? lift : lift.slice(0, at0) + lift.slice(at0).replace(/rgba?\([^)]*\)/, 'rgba(0, 0, 0, 0)');
  const coming = card.animate([
   { clipPath: seed, opacity: 0, easing: ARRIVE.swell },
   { opacity: 1, offset: f1 * 0.62 },
   { clipPath: small, opacity: 1, offset: f1, easing: ARRIVE.open },
   { clipPath: whole, opacity: 1 },
  ], { duration: total });
  const lifting = card.animate({ boxShadow: [flat, lift] }, { duration: ARRIVE.lift, delay: total, easing: 'ease-out', fill: 'backwards' });
  // Only the field is seen while it clears, so only the field is blurred: a small thing to draw on every frame.
  const clearing = field.animate({ filter: [`blur(${ARRIVE.blur}px)`, 'blur(0px)'] }, { duration: ARRIVE.field * 0.8, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' });
  const glow = this.glow ||= popover('quick-glow', 'quick.title', '<i class="quick-glow-halo"><b></b></i>');
  glow.setAttribute('aria-hidden', 'true');
  glow.showPopover();
  const edge = (top, right, bottom, left, radius) => ({ top: `${box.top + top}px`, right: `${innerWidth - box.right + right}px`, bottom: `${innerHeight - box.bottom + bottom}px`, left: `${box.left + left}px`, '--quick-round': radius });
  // The light wraps the field as it swells, rides the card's edge as the card opens, already thinning, and then lets
  // go of it: it spreads a little outward and is gone. It has no hard edge anywhere: a soft band lying over the edge,
  // more of it outside than on the card. It goes by losing its colour as it thins.
  const time = total + LIGHT.tail, g1 = ARRIVE.field / time, g2 = total / time;
  const growing = glow.animate([
   { ...edge(side.top + dy, side.right + dx, side.bottom + dy, side.left + dx, `${at.height / 2}px`), transform: 'none', easing: ARRIVE.swell },
   { ...edge(side.top, side.right, side.bottom, side.left, round), transform: 'none', offset: g1, easing: ARRIVE.open },
   { ...edge(0, 0, 0, 0, '22px'), transform: 'none', offset: g2, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' },
   { ...edge(0, 0, 0, 0, '22px'), transform: `scale(${LIGHT.spread})` },
  ], { duration: time, fill: 'forwards' });
  const light = glow.animate([
   { opacity: 0, filter: 'saturate(1)', '--quick-turn': `${LIGHT.from}deg`, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
   { opacity: 1, filter: 'saturate(1)', offset: g1 * 0.8 },
   { opacity: 1, filter: 'saturate(1)', offset: g1, easing: 'ease-out' },
   { opacity: 0.7, filter: 'saturate(0.9)', offset: g2, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
   { opacity: 0, filter: 'saturate(0.25)', '--quick-turn': `${LIGHT.from + LIGHT.turn}deg` },
  ], { duration: time });
  // What is in the field comes a little after the field itself.
  const words = [...field.children].map(part => part.animate({ opacity: [0, 0, 1], offset: [0, 0.5, 1] }, { duration: ARRIVE.field, easing: 'ease-in-out' }));
  words.push(clearing);
  this.arriving = [coming, growing, light, lifting, ...words];
  light.finished.then(() => { if (this.arriving?.[2] === light) this.settle(); }, () => {});
 }

 // Whatever of the coming is still on its way is dropped, and the light put away.
 settle() {
  for (const motion of this.arriving || []) motion.cancel();
  this.arriving = null;
  if (this.glow?.matches(':popover-open')) this.glow.hidePopover();
 }

 // The main window is about to open this chat. With an agent at work in it here it stays here, and this window comes
 // up with it; otherwise it is the main window's from now on, once all that was said is on the disk.
 async claim(id) {
  const conv = this.chat.conversations.get(id);
  if (!conv) return false;
  if (conv.turn) {
   if (this.chat.active !== conv) await this.chat.open(id);
   return true;
  }
  await library.queue(id, () => {});
  this.chat.remove(id);
  this.sync();
  return false;
 }

 // The list of chats changed, here or in the app's window. A chat deleted there is gone here too.
 onLibrary() {
  for (const conv of [...this.chat.conversations.values()]) if (!library.chat(conv.id)) this.chat.remove(conv.id);
  this.sync();
 }

 quote(text) {
  this.text.insertQuote(text);
  this.sync();
 }

 sync() {
  const chat = this.chat, busy = chat.busy, has = this.has, ended = this.was && !busy;
  this.was = busy;
  this.send.toggleAttribute('disabled', !this.text.text().trim() && !this.attachments?.count);
  this.field.classList.toggle('has-value', this.input.value !== '');
  for (const button of [this.newButton, this.expandButton, this.clearButton]) button.classList.toggle('is-shown', has);
  // The chat goes on into the app whole: with a reply still being written it waits for it.
  this.expandButton.toggleAttribute('disabled', busy);
  this.expandButton.title = busy ? I18n.t('quick.expand.wait') : '';
  if (!has) this.disarm();
  settings.show(chat.model);
  this.models.sync();
  this.effort.lock(busy);
  // A reply that came while the window was out of sight is marked in the list, like one that came to a chat off
  // screen, and is shown first when the window comes back.
  if (ended && this.away && has) {
   this.unseen = true;
   library.update(chat.activeId, { unread: true });
  }
  // A chat left for a new one while its agent worked goes on to its end here; done and saved, it is the list's.
  for (const conv of [...chat.conversations.values()]) if (conv !== chat.active && !conv.turn) chat.remove(conv.id);
  // The window is told whether an agent is at work in it: out of sight it stays awake only for that.
  const working = [...chat.conversations.values()].some(conv => conv.turn);
  if (working !== this.working) quick.working(this.working = working);
 }

 submit() {
  const text = this.text.text().trim();
  if (!text && !this.attachments.count) return;
  if (!this.chat.send(text, this.attachments.items)) return;
  this.attachments.take();
  this.input.value = '';
  this.text.refresh();
  this.sync();
 }

 onKey(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  this.submit();
 }

 // A new, empty chat. The one that was here stays in the list; an agent at work in it goes on.
 renew() {
  if (!this.has) return;
  this.chat.newChat();
  this.sync();
  this.input.focus({ preventScroll: true });
 }

 // On into the app: this window lets go of the chat once all of it is on the disk, and the app's window opens it.
 async expand() {
  const conv = this.chat.active;
  if (!conv?.record || conv.turn) return;
  const id = conv.id;
  await library.queue(id, () => {});
  await library.persist().catch(() => {});
  if (conv.turn) return;
  this.chat.remove(id);
  this.sync();
  quick.expand(id);
 }

 // Deleting asks twice, the way deleting a chat in the list does: the first press opens the lid and turns it red.
 onClear() {
  if (!this.armed) {
   this.armed = true;
   this.clearButton.setAttribute('armed', '');
   this.clearButton.setAttribute('label', I18n.t('quick.deleteConfirm'));
   clearTimeout(this.disarmTimer);
   this.disarmTimer = setTimeout(() => this.disarm(), CONFIRM_TIME);
   return;
  }
  this.disarm();
  this.wipe();
 }

 disarm() {
  clearTimeout(this.disarmTimer);
  if (!this.armed) return;
  this.armed = false;
  this.clearButton.removeAttribute('armed');
  this.clearButton.setAttribute('label', I18n.t('quick.delete'));
 }

 // The messages lift away together, and the chat is gone for good: from the list and from the disk.
 async wipe() {
  const conv = this.chat.active;
  if (!conv?.record) return;
  const id = conv.id, list = conv.list;
  const leave = list.childElementCount && !reducedMotion() ? list.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px) scale(0.985)' }], WIPE) : null;
  await leave?.finished.catch(() => {});
  this.chat.remove(id);
  library.remove(id);
  this.sync();
  this.input.focus({ preventScroll: true });
 }

 // The head drags the window: it holds the pointer until it is let go, and the window goes as far as the pointer has
 // gone on the screen.
 onHold(event) {
  if (event.button !== 0 || event.target.closest('.mini-tools')) return;
  event.preventDefault();
  const head = this.head, from = { x: event.screenX, y: event.screenY };
  let to = null, frame = 0;
  head.setPointerCapture(event.pointerId);
  this.moving = true;
  this.point(true);
  quick.drag('start');
  const tell = () => {
   frame = 0;
   if (to) quick.drag('move', to.x, to.y);
  };
  const onMove = e => {
   to = { x: e.screenX - from.x, y: e.screenY - from.y };
   // Picked up, the card lifts a little, as the mini chat does.
   if (Math.abs(to.x) + Math.abs(to.y) > 2) this.dialog.classList.add('is-moving');
   frame ||= requestAnimationFrame(tell);
  };
  const ends = ['pointerup', 'pointercancel', 'lostpointercapture'];
  const onEnd = () => {
   head.removeEventListener('pointermove', onMove);
   for (const name of ends) head.removeEventListener(name, onEnd);
   cancelAnimationFrame(frame);
   tell();
   quick.drag('end');
   this.moving = false;
   this.dialog.classList.remove('is-moving');
  };
  head.addEventListener('pointermove', onMove);
  for (const name of ends) head.addEventListener(name, onEnd);
 }

 // The arc in the corner sizes the window; the card's upper left corner stays where it is. It holds the pointer until
 // it is let go.
 onGrab(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  const grip = this.grip, from = { x: event.screenX, y: event.screenY }, start = { width: this.dialog.offsetWidth, height: this.dialog.offsetHeight };
  let want = null, frame = 0;
  grip.setPointerCapture(event.pointerId);
  this.sizing = true;
  this.point(true);
  this.dialog.classList.add('is-sizing');
  const tell = done => {
   frame = 0;
   if (want) quick.size(want, done);
  };
  const onMove = e => {
   const dx = e.screenX - from.x, dy = e.screenY - from.y;
   if (Math.abs(dx) + Math.abs(dy) > 2) this.veil(true);
   want = { width: start.width + dx, height: start.height + dy };
   frame ||= requestAnimationFrame(() => tell(false));
  };
  // However the hold ends (let go, taken away by the system), the sizing ends with it.
  const ends = ['pointerup', 'pointercancel', 'lostpointercapture'];
  const onEnd = () => {
   grip.removeEventListener('pointermove', onMove);
   for (const name of ends) grip.removeEventListener(name, onEnd);
   cancelAnimationFrame(frame);
   tell(true);
   this.sizing = false;
   this.dialog.classList.remove('is-sizing');
   // The words come back once the window has its last size.
   setTimeout(() => this.veil(false), 80);
  };
  grip.addEventListener('pointermove', onMove);
  for (const name of ends) grip.addEventListener(name, onEnd);
 }

 // While the size changes, words would jump from line to line on every frame. So they step aside, as in the mini chat:
 // each message on screen is drawn as grey bars where its lines were, which stretch with the window, and the words come
 // back once it is let go.
 veil(on) {
  if (on === !!this.bones) return;
  const view = this.dialog.querySelector('.thread-view');
  if (!on) {
   const bones = this.bones;
   this.bones = null;
   this.dialog.classList.remove('is-veiled');
   setTimeout(() => bones.remove(), BONES.fade);
   return;
  }
  const list = this.chat.active?.list;
  if (!list?.childElementCount) return;
  const frame = view.getBoundingClientRect(), bones = document.createElement('div');
  bones.className = 'mini-bones';
  const inView = r => r.height > 0 && r.bottom > frame.top && r.top < frame.bottom;
  const group = (r, className) => {
   const el = bones.appendChild(document.createElement('div'));
   el.className = className;
   el.style.top = `${(r.top - frame.top).toFixed(1)}px`;
   el.style.height = `${r.height.toFixed(1)}px`;
   return el;
  };
  for (const bubble of list.querySelectorAll('.message.is-user .message-bubble')) {
   const r = bubble.getBoundingClientRect();
   if (!inView(r)) continue;
   const el = group(r, 'mini-bone is-bubble');
   el.style.right = `${(frame.right - r.right).toFixed(1)}px`;
   el.style.width = `min(${r.width.toFixed(1)}px, 100% - ${(frame.right - r.right + 12).toFixed(1)}px)`;
   el.style.borderRadius = getComputedStyle(bubble).borderRadius;
  }
  for (const content of list.querySelectorAll('.message.is-assistant .message-content')) {
   const blocks = content.children.length ? [...content.children] : [content];
   for (const block of blocks) {
    const r = block.getBoundingClientRect();
    if (!inView(r)) continue;
    const pitch = parseFloat(getComputedStyle(block).lineHeight) || 24, lines = clamp(Math.round(r.height / pitch), 1, BONES.lines);
    const el = group(r, 'mini-lines');
    el.style.left = `${(r.left - frame.left).toFixed(1)}px`;
    el.style.right = `${(frame.right - r.right).toFixed(1)}px`;
    for (let k = 0; k < lines; k++) {
     const bar = el.appendChild(document.createElement('span'));
     bar.className = 'mini-bone';
     bar.style.width = `${k === lines - 1 && lines > 1 ? BONES.last : BONES.widths[k % BONES.widths.length]}%`;
    }
   }
  }
  if (!bones.childElementCount) return;
  view.append(bones);
  this.bones = bones;
  // One frame with the bars in place and unseen, so that they fade in.
  bones.getBoundingClientRect();
  this.dialog.classList.add('is-veiled');
 }
}

window.quickChat = new QuickChat();
})();
