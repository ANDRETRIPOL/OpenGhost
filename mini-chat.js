(() => {
'use strict';

const CLOSE_TIME = 360;
const CONFIRM_TIME = 3000;
const WIPE = { duration: 260, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
const FRAME = 'openghost.mini.frame';
// The size it opens with and the smallest it shrinks to, how near the window's edge it may come, and how fast its
// frame follows the pointer that resizes it (ms to cover about two thirds of the way).
const SIZE = { width: 330, height: 490, minWidth: 280, minHeight: 340, edge: 10, follow: 60 };

// While the mini chat is resized its words give way to grey bars: how long the two take to change places, the most lines
// one block is drawn with, and how wide the lines of a block are, in turn (the last one is always short).
const BONES = { fade: 240, lines: 12, widths: [100, 94, 98, 89, 96, 91], last: 58 };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const stored = () => { try { return JSON.parse(localStorage.getItem(FRAME) || 'null') || {}; } catch { return {}; } };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TEMPLATE = `
 <header class="mini-head">
  <span class="mini-title">${'{ghost}'}<span data-i18n="mini.title"></span></span>
  <span class="mini-tools">
   <clear-button class="mini-clear"></clear-button>
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
  <div class="mini-empty" aria-hidden="true"><ghost-thinking></ghost-thinking><p data-i18n="mini.empty"></p></div>
  <div class="drop-zone" aria-hidden="true">
   <div class="drop-art"></div>
   <div class="drop-title" data-i18n="drop.title"></div>
   <div class="drop-hint" data-i18n="drop.hint"></div>
  </div>
  <div class="composer">
   <div class="composer-attachments"><div class="attachments-row"></div></div>
   <input class="composer-picker" type="file" multiple hidden>
   <div class="composer-field">
    <div class="composer-placeholder" aria-hidden="true" data-i18n="mini.placeholder"></div>
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
    <div class="composer-actions"><send-button class="composer-send" disabled></send-button></div>
   </div>
  </div>
 </div>`;

// The mini chat of the chat on screen. Closed, it keeps its messages with that chat; opened again, it shows them and reads the
// chat as it is by then. It floats over the app without closing it off: the chat behind it can be read and written in.
// It is dragged by its head and resized by the arc in its corner, and opens next time where and as large as it was left.
// Closed while its agent is at work, it is only put out of sight: the agent goes on, and the ghost at the top of the chat
// brings the mini chat back, with whatever was written meanwhile.
class MiniChat {
 static open(options) {
  const origin = options.source.active, now = MiniChat.current, away = MiniChat.away.get(origin);
  if (now?.origin === origin && !now.closing) {
   if (options.quote) now.quote(options.quote);
   else now.input.focus();
   return now;
  }
  now?.close();
  if (away) return away.show(options.quote);
  MiniChat.current = new MiniChat(options);
  MiniChat.signal();
  return MiniChat.current;
 }

 // The mini chat put out of sight for the chat on screen, and what it is doing: working, waiting for the user's answer
 // to a question of its agent's, or done.
 static state(origin) {
  const mini = MiniChat.away.get(origin);
  if (!mini) return '';
  if (!mini.chat.busy) return 'ready';
  return mini.chat.active?.turn?.approvals.size ? 'waiting' : 'working';
 }

 static signal() {
  MiniChat.onSignal?.();
 }

 // A mini chat belongs to one chat. The one on screen closes when another chat comes there, and stops when its chat is
 // locked. One out of sight goes on while its agent works; done, it waits only while its chat is on screen.
 static check() {
  const now = MiniChat.current;
  if (now && (now.source.active !== now.origin || now.origin.locked)) now.close({ stop: !!now.origin.locked });
  for (const mini of [...MiniChat.away.values()]) {
   const gone = !mini.source.library.chat(mini.origin.id);
   if (gone || mini.origin.locked || (!mini.chat.busy && mini.source.active !== mini.origin)) mini.destroy();
  }
  MiniChat.signal();
 }

 constructor({ settings, source, library, quote = '' }) {
  const dialog = this.dialog = document.createElement('div');
  dialog.className = 'mini';
  dialog.setAttribute('role', 'dialog');
  // In the top layer, over everything in the window, yet nothing behind it is closed off.
  dialog.setAttribute('popover', 'manual');
  dialog.innerHTML = TEMPLATE.replace('{ghost}', Glyphs.ghost);
  dialog.__mini = this;
  I18n.apply(dialog);
  dialog.setAttribute('aria-label', I18n.t('mini.title'));
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  this.main = $('.mini-main');
  this.composer = $('.composer');
  this.field = $('.composer-field');
  this.input = $('.composer-input');
  this.send = $('.composer-send');
  const thread = $('.thread'), bottom = $('.thread-bottom');
  bottom.style.setProperty('--glass-lens', getComputedStyle(document.querySelector('.thread-bottom')).getPropertyValue('--glass-lens'));
  new SmoothHeight(this.field, this.input);
  new Scrollbar(this.input, $('.composer-scrollbar'));
  const scrollbar = new Scrollbar(thread, $('.thread-scrollbar'));
  this.text = new ComposerText(this.input, $('.composer-mirror'));
  this.unwatch = [LinkChip.watch($('.composer-mirror')), LinkChip.watch(thread)];
  this.space = new ResizeObserver(() => {
   const gap = parseFloat(getComputedStyle(this.main).getPropertyValue('--composer-bottom-gap')) || 0;
   this.main.style.setProperty('--composer-space', `${Math.ceil(this.composer.offsetHeight + gap)}px`);
  });
  this.space.observe(this.composer);
  const origin = this.origin = source.active;
  this.source = source;
  this.clearButton = $('.mini-clear');
  this.chat = new SideChat({
   main: this.main, thread, bottom, settings, library, origin, model: source.modelOf(origin), onChange: () => this.sync(), onList: list => scrollbar.observe(list),
   // A waiting message taken back to be rewritten: its words return to the field, its files to the tray.
   onRecall: ({ rest, quotes, attachments }) => {
    this.attachments.give(attachments);
    this.text.restore(rest, quotes);
    this.sync();
   },
  });
  // Until its messages are read the mini chat shows neither them nor the words of an empty one.
  this.main.classList.add('is-loading');
  // A mini chat closed a moment ago may still be saving its last words: this one opens once they are on disk.
  Promise.resolve(MiniChat.settling).then(() => this.chat.start()).catch(() => {}).then(() => {
   this.main.classList.remove('is-loading');
   this.sync();
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
   // Files dropped on the mini chat are its own; dropped anywhere else they go to the chat behind it.
   isActive: event => this.open && (!event || dialog.contains(event.target)),
  });
  // The mini chat's plus and mode have their own menus, inside it.
  this.addMenu = new AddMenu({ button: $('.composer-add'), host: dialog, attachments: this.attachments, input: this.input, anchor: '--mini-add' });
  if (AgentTools.available) {
   const mode = $('.composer-mode');
   mode.hidden = false;
   this.mode = new ModePicker({ button: mode, host: dialog, anchor: '--mini-mode', settings, onChange: () => this.chat.onModeChange() });
  }
  this.input.addEventListener('input', () => this.sync());
  this.input.addEventListener('keydown', event => this.onKey(event));
  this.send.addEventListener('composer-send', () => this.submit());
  this.composer.addEventListener('mousedown', event => {
   if (event.target === this.composer || event.target.classList.contains('composer-toolbar')) {
    event.preventDefault();
    this.input.focus();
   }
  });
  dialog.addEventListener('dismiss', () => this.close());
  this.clearButton.addEventListener('clear', () => this.onClear());
  this.clearButton.addEventListener('pointerleave', () => this.disarm());
  // Escape with the keyboard in the mini chat is its own: it stops its agent, or closes it. A menu open in it goes first.
  dialog.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || dialog.querySelector(':popover-open')) return;
   event.preventDefault();
   event.stopPropagation();
   if (this.chat.busy) this.chat.stop();
   else this.close();
  });
  this.room = document.querySelector('.main');
  this.frame = stored();
  this.place = () => this.apply(this.target());
  this.place();
  this.follow = new ResizeObserver(this.place);
  this.follow.observe(this.room);
  window.addEventListener('resize', this.place);
  this.head = $('.mini-head');
  this.grip = $('.mini-grip');
  this.head.addEventListener('pointerdown', event => this.onGrab(event, 'move'));
  this.grip.addEventListener('pointerdown', event => this.onGrab(event, 'size'));
  // Twice on the head: back to the middle. Twice on the arc: back to the size it comes with.
  this.head.addEventListener('dblclick', event => { if (!event.target.closest('.mini-tools')) this.reset({ ox: 0, oy: 0 }); });
  this.grip.addEventListener('dblclick', () => this.reset({ w: null, h: null }));
  dialog.showPopover();
  if (quote) this.quote(quote);
  else this.input.focus();
  this.sync();
 }

 get open() {
  return this.dialog.matches(':popover-open');
 }

 // Where the window may be: anywhere in the app's window, clear of its edges and of the bar the window is dragged by.
 bounds() {
  const bar = document.querySelector('.titlebar')?.getBoundingClientRect().bottom || 0;
  return { left: SIZE.edge, top: Math.max(0, bar) + SIZE.edge, right: innerWidth - SIZE.edge, bottom: innerHeight - SIZE.edge };
 }

 // The frame asked for: the size the user gave it, or the one it comes with, and its place counted from the middle of
 // the chat's room, so it keeps to the chat when the sidebar or the browser move the room.
 target() {
  const room = this.room.getBoundingClientRect(), b = this.bounds(), { frame } = this;
  const wide = Math.max(0, b.right - b.left), tall = Math.max(0, b.bottom - b.top);
  const w = clamp(frame.w ?? Math.min(SIZE.width, room.width - 32), Math.min(SIZE.minWidth, wide), wide);
  const h = clamp(frame.h ?? Math.min(SIZE.height, room.height - 32), Math.min(SIZE.minHeight, tall), tall);
  const x = clamp(room.left + (room.width - w) / 2 + (frame.ox || 0), b.left, b.right - w);
  const y = clamp(room.top + (room.height - h) / 2 + (frame.oy || 0), b.top, b.bottom - h);
  return { x, y, w, h };
 }

 apply(box) {
  this.box = box;
  const style = this.dialog.style;
  style.setProperty('--mini-x', `${box.x.toFixed(2)}px`);
  style.setProperty('--mini-y', `${box.y.toFixed(2)}px`);
  style.setProperty('--mini-width', `${box.w.toFixed(2)}px`);
  style.setProperty('--mini-height', `${box.h.toFixed(2)}px`);
 }

 // Keeps the frame's corner at x, y whatever its size becomes.
 pin(x, y, w, h) {
  const room = this.room.getBoundingClientRect();
  this.frame.ox = x - (room.left + (room.width - w) / 2);
  this.frame.oy = y - (room.top + (room.height - h) / 2);
 }

 // The frame eases to what is asked of it, so the window and all in it grow and shrink smoothly.
 glide() {
  if (reducedMotion()) { this.place(); return; }
  if (this.raf) return;
  let last = performance.now();
  const step = now => {
   const to = this.target(), box = { ...this.box }, part = 1 - Math.exp(-Math.min(64, now - last) / SIZE.follow);
   last = now;
   let far = false;
   for (const key of ['x', 'y', 'w', 'h']) {
    const gap = to[key] - box[key];
    if (Math.abs(gap) > 0.4) { box[key] += gap * part; far = true; } else box[key] = to[key];
   }
   this.apply(box);
   this.raf = far && this.open ? requestAnimationFrame(step) : 0;
   if (!this.raf && !this.held) this.veil(false);
  };
  this.raf = requestAnimationFrame(step);
 }

 // While the size changes, words would jump from line to line on every frame. So they step aside: each message on screen
 // is drawn as grey bars where its lines were, which stretch with the window, and the words come back once it is let go.
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
   // The user's words keep the shape of their bubble, by the right edge.
   const el = group(r, 'mini-bone is-bubble');
   el.style.right = `${(frame.right - r.right).toFixed(1)}px`;
   el.style.width = `min(${r.width.toFixed(1)}px, 100% - ${(frame.right - r.right + 12).toFixed(1)}px)`;
   el.style.borderRadius = getComputedStyle(bubble).borderRadius;
  }
  for (const content of list.querySelectorAll('.message.is-assistant .message-content')) {
   // A reply is drawn paragraph by paragraph, a bar for a line.
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

 // The head drags the window, the arc in the corner resizes it; both hold the pointer until it is let go.
 onGrab(event, kind) {
  if (event.button !== 0 || (kind === 'move' && event.target.closest('.mini-tools'))) return;
  event.preventDefault();
  const el = kind === 'move' ? this.head : this.grip, from = { x: event.clientX, y: event.clientY }, start = this.target();
  el.setPointerCapture(event.pointerId);
  this.held = true;
  this.dialog.classList.add(kind === 'move' ? 'is-moving' : 'is-sizing');
  const onMove = e => {
   const dx = e.clientX - from.x, dy = e.clientY - from.y, b = this.bounds();
   if (kind === 'move') {
    this.pin(clamp(start.x + dx, b.left, b.right - start.w), clamp(start.y + dy, b.top, b.bottom - start.h), start.w, start.h);
    this.place();
    return;
   }
   const w = clamp(start.w + dx, SIZE.minWidth, b.right - start.x), h = clamp(start.h + dy, SIZE.minHeight, b.bottom - start.y);
   if (Math.abs(dx) + Math.abs(dy) > 2) this.veil(true);
   this.frame.w = w;
   this.frame.h = h;
   this.pin(start.x, start.y, w, h);
   this.glide();
  };
  const onEnd = () => {
   el.removeEventListener('pointermove', onMove);
   el.removeEventListener('pointerup', onEnd);
   el.removeEventListener('pointercancel', onEnd);
   this.dialog.classList.remove('is-moving', 'is-sizing');
   this.held = false;
   if (!this.raf) this.veil(false);
   this.keep();
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onEnd);
  el.addEventListener('pointercancel', onEnd);
 }

 reset(change) {
  const now = this.target();
  Object.assign(this.frame, change);
  // A size given back leaves the window where it stands, by its middle.
  if ('w' in change) {
   const next = this.target();
   this.pin(now.x + (now.w - next.w) / 2, now.y + (now.h - next.h) / 2, next.w, next.h);
   if (!reducedMotion() && (Math.abs(next.w - now.w) > 1 || Math.abs(next.h - now.h) > 1)) this.veil(true);
  }
  this.glide();
  this.keep();
 }

 keep() {
  try { localStorage.setItem(FRAME, JSON.stringify(this.frame)); } catch {}
 }

 quote(text) {
  this.text.insertQuote(text);
  this.sync();
 }

 sync() {
  MiniChat.signal();
  this.send.toggleAttribute('disabled', !this.text.text().trim() && !this.attachments?.count);
  this.field.classList.toggle('has-value', this.input.value !== '');
  const kept = !!this.chat?.hasMessages;
  this.clearButton.classList.toggle('is-shown', kept);
  if (!kept) this.disarm();
 }

 // Clearing asks twice, the way deleting a chat does: the first press opens the lid and turns it red for a moment.
 onClear() {
  if (!this.armed) {
   this.armed = true;
   this.clearButton.setAttribute('armed', '');
   this.clearButton.setAttribute('label', I18n.t('mini.clearConfirm'));
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
  this.clearButton.setAttribute('label', I18n.t('mini.clear'));
 }

 // The messages lift away together; then the mini chat is empty and says so again.
 async wipe() {
  const list = this.chat.active?.list;
  const leave = list?.childElementCount && !reducedMotion() ? list.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px) scale(0.985)' }], WIPE) : null;
  await leave?.finished.catch(() => {});
  await this.chat.clear();
  leave?.cancel();
  this.sync();
  this.input.focus();
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

 // Closing does not stop an agent at work: the mini chat goes out of sight and the agent goes on. `stop` ends it for good.
 close({ stop = false } = {}) {
  if (!this.open || this.closing) return;
  this.closing = true;
  const keep = !stop && this.chat.busy;
  if (!keep) this.chat.stop();
  // The keyboard goes back to the chat behind, if it was in here.
  const back = this.dialog.contains(document.activeElement);
  const end = () => {
   if (keep) this.park();
   else this.destroy();
   if (back) document.querySelector('.main .composer-input')?.focus({ preventScroll: true });
  };
  if (reducedMotion()) { end(); return; }
  this.dialog.classList.add('is-closing');
  setTimeout(end, CLOSE_TIME);
 }

 park() {
  this.closing = false;
  if (this.open) this.dialog.hidePopover();
  this.dialog.classList.remove('is-closing');
  if (MiniChat.current === this) MiniChat.current = null;
  MiniChat.away.set(this.origin, this);
  MiniChat.signal();
 }

 show(quote = '') {
  MiniChat.away.delete(this.origin);
  MiniChat.current = this;
  this.dialog.showPopover();
  this.place();
  if (quote) this.quote(quote);
  else this.input.focus();
  this.sync();
  return this;
 }

 destroy() {
  if (this.destroyed) return;
  this.destroyed = true;
  this.chat.stop();
  // The tab its agent worked in stays in the browser, the user's own from here on.
  if (this.chat.active) window.browserPanel?.vacate(this.chat.active);
  MiniChat.settling = this.chat.idle();
  clearTimeout(this.disarmTimer);
  this.text.destroy();
  this.addMenu.destroy();
  this.attachments.destroy();
  this.mode?.destroy();
  this.space.disconnect();
  this.follow.disconnect();
  window.removeEventListener('resize', this.place);
  for (const stop of this.unwatch) stop();
  cancelAnimationFrame(this.raf);
  const menu = this.dialog.querySelector('.select-menu');
  if (menu) {
   if (menu.matches(':popover-open')) menu.hidePopover();
   document.body.append(menu);
  }
  if (MiniChat.current === this) MiniChat.current = null;
  if (MiniChat.away.get(this.origin) === this) MiniChat.away.delete(this.origin);
  this.dialog.remove();
  MiniChat.signal();
 }
}

MiniChat.away = new Map();
window.MiniChat = MiniChat;
})();
