(() => {
'use strict';

// The sidebar on the left and the browser on the right as the window narrows: the chat between them keeps at least
// the room its top bar and its composer need. The sidebar steps out first; then the browser narrows to its least
// width, and steps out too. A panel that stepped out can still be looked at: its button brings it over the chat, below
// the chat's top bar, and a press beside it or Escape puts it away again (the globe pressed again closes the browser).
// Each comes back by itself once the window is wide enough, unless the user had put it away. The sidebar's width is
// the user's to drag by its edge, as the browser's is; a double click on the edge gives it back its own width.
const SIDE = { min: 200, max: 420, share: 0.173, least: 240 };
// The edge dragged in past `shut` folds the sidebar away under the pointer, as Finder's does; dragged back out past
// `open` without letting go, it comes back. The fold and the return take the sidebar's own move (`move` ms).
const SNAP = { shut: 100, open: 130, move: 650 };
const STORE = 'openghost.sidebar';
// The least room the chat keeps. More when its composer needs it, to hold its buttons side by side with the whole name
// of the chat's model among them (the send button was pushed out before), or its top bar does, to hold its buttons
// with the plan's island at its smallest between them (`island`, with the room round it).
const CHAT = { least: 440, island: 60, between: 12 };
// Over the chat a panel stands below the chat's top bar and keeps this much of the chat in sight beside it.
const PEEK = { top: 48, inset: 6, keep: 96 };
const IN = { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// The sidebar's bars while its edge is held: how fast its words go and come back, and which of its parts keep to its
// right edge (within `edge` of it, in its right half).
const BONES = { fade: 140, back: 220, edge: 64 };
const OUT = { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)' };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || 'null') || {}; } catch { return {}; } };
const write = value => { try { localStorage.setItem(STORE, JSON.stringify(value)); } catch {} };
const quiet = animation => animation.finished.catch(() => {});

class SidePanels {
 constructor({ app, sidebar, toggle, browser = null }) {
  Object.assign(this, { app, sidebar, toggle, browser });
  // The user's own wish for the sidebar, kept apart from whether the window has room for it.
  this.wanted = true;
  this.docked = true;
  this.peek = false;
  this.width = Number(read().width) || 0;
  this.main = app.querySelector('.main');
  this.frame = 0;
  // The browser keeps the chat's least too when it is dragged wider.
  if (browser) browser.chatRoom = () => this.least();
  const handle = this.handle = document.createElement('div');
  handle.className = 'sidebar-resize';
  handle.setAttribute('aria-hidden', 'true');
  app.append(handle);
  this.resizer(handle);
  toggle.addEventListener('sidebar-toggle', () => this.press());
  // The browser opened or closed, or dragged to another width: the sidebar may have room now, or none.
  if (browser) browser.onLayout = () => this.layout();
  window.addEventListener('resize', () => this.layout());
  // What the chat needs changes with the model's name, the mode's, and the buttons that come and go at its top.
  this.watch = new ResizeObserver(() => this.later());
  this.seen = new MutationObserver(() => this.later());
  this.observe();
  // A press beside a panel that is over the chat puts it away; its own button does that itself.
  document.addEventListener('pointerdown', event => {
   const path = event.composedPath();
   if (this.peek && !path.includes(sidebar) && !path.includes(toggle)) this.setPeek(false);
   if (browser?.peek && !path.includes(browser.root) && !path.includes(browser.toggle)) browser.setPeek(false);
  }, true);
  document.addEventListener('keydown', event => {
   if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
   if (this.peek) this.setPeek(false);
   else if (browser?.peek) browser.setPeek(false);
  });
  this.layout();
 }

 // Watches what decides the chat's least: the composer's mode and the model's name, and the buttons of the top bar.
 observe() {
  const main = this.main, model = main.querySelector('.composer-model');
  const parts = [main.querySelector('.composer-mode'), model?.shadowRoot?.querySelector('.name'), ...main.querySelectorAll(':scope > .notes-pill, :scope > .routines-pill, :scope > .update-pill, :scope > .top-tools')].filter(Boolean);
  for (const el of parts) {
   this.watch.observe(el);
   this.seen.observe(el, { attributes: true, attributeFilter: ['hidden'] });
  }
  const island = main.querySelector(':scope > .plan-island');
  if (island) this.seen.observe(island, { attributes: true, attributeFilter: ['hidden'] });
 }

 later() {
  if (this.frame) return;
  this.frame = requestAnimationFrame(() => {
   this.frame = 0;
   this.observe();
   this.layout();
  });
 }

 // The least room for the chat (see CHAT), from the widths its parts would take, not the ones they are pressed to now.
 least() {
  const main = this.main;
  if (!main) return CHAT.least;
  const seen = el => el && !el.hidden && el.getClientRects().length > 0;
  let composer = 0;
  const box = main.querySelector(':scope > .composer'), bar = box?.querySelector('.composer-toolbar');
  if (bar) {
   const style = getComputedStyle(box), side = parseFloat(getComputedStyle(main).getPropertyValue('--composer-side-gap')) || 24;
   composer = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2 * side + CHAT.between;
   for (const group of bar.children) {
    const items = [...group.children].filter(seen), gap = parseFloat(getComputedStyle(group).columnGap) || 0;
    composer += items.reduce((sum, el) => sum + (el.naturalWidth ? el.naturalWidth() : Math.max(el.offsetWidth, el.scrollWidth)), 0) + gap * Math.max(0, items.length - 1);
   }
  }
  // The plan's island stands in the middle: with it, each half of the top bar needs room for the buttons of its side.
  const inset = parseFloat(getComputedStyle(this.app).getPropertyValue('--toggle-inset')) || 10;
  const sum = selector => inset + [...main.querySelectorAll(selector)].filter(seen).reduce((total, el) => total + el.offsetWidth + 8, 0);
  const left = sum(':scope > .top-tools, :scope > .notes-pill'), right = sum(':scope > .routines-pill, :scope > .update-pill, :scope > .browser-tools');
  const top = seen(main.querySelector(':scope > .plan-island')) ? 2 * Math.max(left, right) + CHAT.island : left + right + CHAT.between;
  return Math.ceil(Math.max(CHAT.least, composer, top));
 }

 // The sidebar's width now: the one the user dragged it to, or its own (a share of the window, never less than 240).
 side() {
  return this.width ? Math.min(SIDE.max, Math.max(SIDE.min, this.width)) : Math.max(SIDE.least, Math.round(innerWidth * SIDE.share));
 }

 gap() {
  return parseFloat(getComputedStyle(this.app).getPropertyValue('--chat-gap')) || 8;
 }

 // Where each panel stands for the window's width now. The browser stays beside the chat while, with the sidebar out,
 // the chat keeps its least beside the browser's least; the sidebar stays while the chat keeps its least beside the
 // browser at the width the browser would have.
 layout() {
  const width = innerWidth, gap = this.gap(), side = this.side(), browser = this.browser, least = this.least();
  this.app.style.setProperty('--sidebar-size', `${side}px`);
  let dockBrowser = true, room = width - side;
  if (browser) {
   dockBrowser = width - 3 * gap - browser.least >= least;
   browser.setDocked(dockBrowser);
   // An open browser keeps its room even while out of sight: the sidebar does not come back in its place as the
   // window narrows, only once the browser is closed.
   if (browser.open) room -= 2 * gap + browser.natural(width - side - 3 * gap);
   else room -= gap;
  } else room -= gap;
  this.docked = room >= least;
  this.apply();
  if (browser) {
   browser.fit();
   // Over the chat the browser keeps a strip of the chat in sight.
   const most = width - 2 * gap - PEEK.inset - PEEK.keep;
   this.app.style.setProperty('--browser-peek-width', `${Math.round(Math.max(Math.min(browser.least, most), Math.min(browser.natural(width - 3 * gap), most)))}px`);
  }
  this.app.style.setProperty('--sidebar-peek-width', `${Math.round(Math.min(side, width - 2 * gap - PEEK.inset - PEEK.keep))}px`);
 }

 // The classes the layout reads, the sidebar's reach and its button.
 apply() {
  if (this.docked && this.peek) this.peek = false;
  const shown = this.wanted && this.docked;
  this.app.classList.toggle('is-sidebar-collapsed', !shown);
  this.app.classList.toggle('is-sidebar-peek', this.peek);
  this.sidebar.inert = !shown && !this.peek;
  this.toggle.toggleAttribute('collapsed', !shown && !this.peek);
 }

 // The sidebar's button: beside the chat it shows and hides the sidebar; with no room for it, it brings it over the chat.
 press() {
  if (this.docked) {
   this.wanted = !this.wanted;
   this.layout();
  } else this.setPeek(!this.peek);
 }

 setPeek(peek) {
  if (this.docked || this.peek === peek) return;
  const sidebar = this.sidebar;
  sidebar.getAnimations().forEach(animation => animation.cancel());
  if (peek) {
   this.peek = true;
   this.apply();
   if (!reducedMotion()) sidebar.animate([{ opacity: 0, transform: 'translateX(-20px)' }, { opacity: 1, transform: 'none' }], IN);
   return;
  }
  this.peek = false;
  const away = () => { if (!this.peek) this.apply(); };
  if (reducedMotion()) away();
  else quiet(sidebar.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-20px)' }], { ...OUT, fill: 'forwards' })).then(() => {
   sidebar.getAnimations().forEach(animation => animation.cancel());
   away();
  });
 }

 // Another chat opened: the sidebar over the chat has done its work.
 sync(id) {
  if (id !== this.chatId && this.peek) this.setPeek(false);
  this.chatId = id;
 }

 // While its edge is dragged the sidebar's words were set anew at every step: names were cut shorter and longer and a
 // line that broke anew moved everything under it. It shows grey bars where its words and signs are instead, as the
 // chat does while a panel moves (thread-bones.js): those by its right edge keep to it, the others are cut by it, and
 // its words come back, set once, when the edge is let go.
 bone() {
  const sidebar = this.sidebar, frame = sidebar.getBoundingClientRect(), pieces = [];
  // Seen: laid out, not hidden, its ink not clear (a row's buttons and its time give way by their ink), and not faded
  // out by itself or by any part it stands in, up to the sidebar, across the shadows of the buttons drawn in them.
  const alpha = color => { const parts = color.match(/[\d.]+/g) || []; return parts.length > 3 ? Number(parts[3]) : 1; };
  const visible = el => {
   if (!el?.getClientRects().length) return false;
   const style = getComputedStyle(el);
   if (style.visibility === 'hidden' || (alpha(style.color) < 0.05 && alpha(style.backgroundColor) < 0.05)) return false;
   let shown = 1;
   for (let at = el; at && at !== sidebar; at = at.parentElement || at.getRootNode().host) shown *= Number(getComputedStyle(at).opacity);
   return shown > 0.05;
  };
  const clipOf = el => el.closest('.chats-scroll')?.getBoundingClientRect() || frame;
  const add = (rect, kind, clip) => {
   if (rect.width < 1 || rect.height < 1 || rect.bottom <= clip.top || rect.top >= clip.bottom) return;
   const left = rect.left - frame.left, right = frame.right - rect.right;
   pieces.push({ kind, left, right, top: rect.top - frame.top, width: rect.width, height: rect.height, end: right < BONES.edge && left > frame.width / 2 });
  };
  const range = document.createRange(), walker = document.createTreeWalker(sidebar, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
   if (!node.textContent.trim() || !visible(node.parentElement)) continue;
   range.selectNodeContents(node);
   const clip = clipOf(node.parentElement);
   for (const rect of range.getClientRects()) add(rect, 'word', clip);
  }
  // Signs: drawings in the page, and those of the buttons drawn in a shadow of their own.
  const signs = [...sidebar.querySelectorAll('svg, .chat-dot')].filter(el => !el.parentElement.closest('svg'));
  for (const host of sidebar.querySelectorAll('*')) if (host.shadowRoot) signs.push(...host.shadowRoot.querySelectorAll('svg'));
  for (const svg of signs) if (visible(svg)) add(svg.getBoundingClientRect(), 'sign', clipOf(svg.getRootNode().host || svg));
  // A chat's picture at the end of its row stands as a plate of its own size and roundness.
  for (const photo of sidebar.querySelectorAll('.chat-photo:not([hidden])')) if (visible(photo)) add(photo.getBoundingClientRect(), 'photo', clipOf(photo));
  if (!pieces.length) return;
  const layer = document.createElement('div');
  layer.className = 'sidebar-bones';
  for (const piece of pieces) {
   const bone = layer.appendChild(document.createElement('span')), word = piece.kind === 'word', photo = piece.kind === 'photo';
   bone.className = `sidebar-bone is-${piece.kind}`;
   const size = word ? Math.min(9, Math.max(6, Math.round(piece.height * 0.45))) : photo ? piece.height : Math.round(Math.min(piece.width, piece.height, 18));
   bone.style.top = `${(piece.top + (piece.height - size) / 2).toFixed(1)}px`;
   bone.style.height = `${size}px`;
   const inset = word || photo ? 0 : (piece.width - size) / 2, width = word || photo ? piece.width : size;
   if (piece.end) {
    bone.style.right = `${(piece.right + inset).toFixed(1)}px`;
    bone.style.width = `${width.toFixed(1)}px`;
    continue;
   }
   bone.style.left = `${(piece.left + inset).toFixed(1)}px`;
   // A name keeps clear of what stands by the right edge on its own line, and is cut short as the sidebar narrows.
   const beside = pieces.filter(other => other.end && Math.min(other.top + other.height, piece.top + piece.height) - Math.max(other.top, piece.top) > 2);
   const reserve = beside.length ? Math.max(...beside.map(other => other.right + other.width)) + 8 : 14;
   bone.style.width = word ? `max(0px, min(${width.toFixed(1)}px, calc(100% - ${(piece.left + reserve).toFixed(1)}px)))` : `${width.toFixed(1)}px`;
  }
  sidebar.append(layer);
  const parts = [...sidebar.children].filter(el => el !== layer);
  this.bones = { layer, parts, fades: parts.map(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: BONES.fade, easing: 'ease', fill: 'forwards' })) };
  layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: BONES.fade, easing: 'ease' });
 }

 unbone() {
  const bones = this.bones;
  if (!bones) return;
  this.bones = null;
  for (const fade of bones.fades) fade.cancel();
  for (const el of bones.parts) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: BONES.back, easing: 'ease' });
  const gone = () => bones.layer.remove();
  bones.layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: BONES.back, easing: 'ease', fill: 'forwards' }).finished.then(gone, gone);
 }

 // The sidebar folds away or comes back while its edge is held: it takes its own move, which a drag otherwise stills.
 snap(open) {
  this.wanted = open;
  this.app.classList.add('is-sidebar-snapping');
  clearTimeout(this.snapping);
  this.snapping = setTimeout(() => this.app.classList.remove('is-sidebar-snapping'), SNAP.move);
  this.layout();
 }

 // The edge between the sidebar and the chat: dragged, the sidebar takes that width, as far as the chat keeps its
 // least, and folds away when dragged far in; double-clicked, it has its own width again.
 resizer(handle) {
  handle.addEventListener('pointerdown', event => {
   if (event.button !== 0 || !this.docked || !this.wanted) return;
   event.preventDefault();
   handle.setPointerCapture(event.pointerId);
   // The chat turns to bars as soon as the edge is taken, and so does the sidebar.
   this.app.classList.add('is-sidebar-resizing');
   this.bone();
   const startX = event.clientX, start = this.side(), was = this.width, gap = this.gap(), browser = this.browser;
   const beside = browser?.open && browser.docked ? 2 * gap + browser.root.offsetWidth : gap;
   const most = Math.min(SIDE.max, innerWidth - beside - this.least());
   const move = e => {
    const want = start + e.clientX - startX;
    if (this.wanted && want < SNAP.shut) {
     // Folded away, it keeps the width it had before the drag for when it comes back.
     this.width = was;
     this.snap(false);
     return;
    }
    if (!this.wanted) {
     if (want <= SNAP.open) return;
     this.snap(true);
    }
    this.width = Math.round(Math.max(SIDE.min, Math.min(most, want)));
    this.app.style.setProperty('--sidebar-size', `${this.width}px`);
    browser?.fit();
   };
   const up = () => {
    handle.removeEventListener('pointermove', move);
    this.app.classList.remove('is-sidebar-resizing');
    this.unbone();
    if (this.wanted) write({ width: this.width });
    this.layout();
   };
   handle.addEventListener('pointermove', move);
   handle.addEventListener('pointerup', up, { once: true });
   handle.addEventListener('pointercancel', up, { once: true });
  });
  handle.addEventListener('dblclick', () => {
   if (!this.wanted) return;
   this.width = 0;
   write({});
   this.layout();
  });
 }
}

window.SidePanels = SidePanels;
})();
