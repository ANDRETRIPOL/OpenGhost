(() => {
'use strict';

// Search, in the manner of Spotlight: at a press on the magnifier in the sidebar (or Ctrl+K) the magnifier ducks out of
// the sidebar and a panel of glass opens in the middle of the chat: the search field, its own magnifier drawn in it
// stroke by stroke. As the user types, the chats that were found come out under the field, in the same panel, which
// grows and shrinks with them on a spring, like the message field with its text. The sidebar's own list stays as it is. A press on a chat that was found, or Enter, opens it.
const SHOWN = 40;
// The field's magnifier is drawn: the ring goes round, then the handle comes out of it. Closing, it is taken back quickly.
const DRAW = { ring: 420, handle: 260, wait: 120, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const OPEN = { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const CLOSE = { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)' };
const ROW = { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const PLACE = { share: 0.2, least: 64, most: 190, width: 620, side: 28 };
const LENS = '<svg viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" aria-hidden="true"><circle pathLength="1" cx="54.5" cy="54.5" r="15.5" transform="rotate(45 54.5 54.5)"/><path pathLength="1" d="M65.5 65.5 81 81"/></svg>';
const FOLDER = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.6 5.6a1.8 1.8 0 0 1 1.8-1.8h2.5l1.7 1.9h5a1.8 1.8 0 0 1 1.8 1.8v5a1.8 1.8 0 0 1-1.8 1.8H4.4a1.8 1.8 0 0 1-1.8-1.8z"/></svg>';
const BAR = 60;
const BUBBLE = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3.2c3.5 0 6.1 2.2 6.1 5.1s-2.6 5.1-6.1 5.1c-.7 0-1.4-.1-2-.3L3.6 14.6l.8-2.6C3.500 11 2.900 9.700 2.900 8.300 2.900 5.400 5.500 3.200 9 3.200z"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR, WEEK = 7 * DAY;
function ago(time, now = Date.now()) {
 const d = Math.max(0, now - time);
 if (d < MINUTE) return I18n.t('time.now');
 if (d < HOUR) return `${Math.floor(d / MINUTE)}m`;
 if (d < DAY) return `${Math.floor(d / HOUR)}h`;
 if (d < WEEK) return `${Math.floor(d / DAY)}d`;
 if (d < 5 * WEEK) return `${Math.floor(d / WEEK)}w`;
 return new Date(time).toLocaleDateString(I18n.lang, { month: 'short', day: 'numeric' });
}

class Spotlight {
 constructor({ button, anchor, library, chat }) {
  Object.assign(this, { button, anchor, library, chat });
  this.open = false;
  this.found = [];
  this.rows = new Map();
  this.at = -1;
  this.back = null;
  const root = this.root = document.createElement('div');
  root.className = 'spotlight';
  root.popover = 'manual';
  root.innerHTML = `
   <div class="spotlight-panel glass-lens" role="dialog">
    <div class="spotlight-bar">
     <input class="spotlight-input" type="text" role="combobox" aria-autocomplete="list" aria-controls="spotlight-list" aria-expanded="false" autocomplete="off" spellcheck="false">
    </div>
    <div class="spotlight-box">
     <div class="spotlight-results">
      <span class="spotlight-glide" aria-hidden="true"></span>
      <ul class="spotlight-list" id="spotlight-list" role="listbox"></ul>
      <p class="spotlight-none" hidden></p>
     </div>
     <div class="scrollbar spotlight-scrollbar" aria-hidden="true"><div class="scrollbar-thumb"></div></div>
    </div>
   </div>
   <span class="spotlight-lens" aria-hidden="true">${LENS}</span>`;
  document.body.append(root);
  this.panel = root.querySelector('.spotlight-panel');
  this.input = root.querySelector('.spotlight-input');
  this.box = root.querySelector('.spotlight-box');
  this.results = root.querySelector('.spotlight-results');
  this.list = root.querySelector('.spotlight-list');
  this.none = root.querySelector('.spotlight-none');
  this.glider = root.querySelector('.spotlight-glide');
  this.lens = root.querySelector('.spotlight-lens');
  const label = I18n.t('search.label');
  this.panel.setAttribute('aria-label', label);
  this.input.setAttribute('aria-label', label);
  this.input.placeholder = label;
  this.none.textContent = I18n.t('search.none');
  // The block under the field follows what it holds on a spring.
  new SmoothHeight(this.box, this.results);
  this.restTimer = 0;
  new ResizeObserver(() => this.settle()).observe(this.panel);
  this.scroll = new Scrollbar(this.results, root.querySelector('.spotlight-scrollbar'));

  button.addEventListener('search-open', () => this.toggle());
  this.input.addEventListener('input', () => this.search());
  this.input.addEventListener('keydown', event => this.onKey(event));
  this.list.addEventListener('pointermove', event => {
   const row = event.target.closest('.spotlight-row');
   if (row) this.select(this.found.findIndex(chat => chat.id === row.dataset.id), false);
  });
  this.list.addEventListener('click', event => {
   const row = event.target.closest('.spotlight-row');
   if (row) this.go(row.dataset.id);
  });
  // The field keeps the caret while a chat is pressed.
  this.panel.addEventListener('pointerdown', event => { if (event.target !== this.input) event.preventDefault(); });
  document.addEventListener('pointerdown', event => {
   if (this.open && !this.panel.contains(event.target) && !event.composedPath().includes(this.button)) this.close();
  }, true);
  window.addEventListener('resize', () => { if (this.open) this.place(); });
  new ResizeObserver(() => { if (this.open) this.place(); }).observe(anchor);
 }

 // Once the panel has come to rest at a new height, its scrollbar is told.
 settle() {
  clearTimeout(this.restTimer);
  this.restTimer = setTimeout(() => this.scroll.update(), 170);
 }

 toggle() {
  if (this.open) this.close();
  else this.show();
 }

 // The field stands in the upper part of the chat, in its middle, with room under it for what is found.
 place() {
  const area = this.anchor.getBoundingClientRect(), style = this.root.style;
  const width = Math.max(260, Math.min(PLACE.width, area.width - 2 * PLACE.side));
  style.setProperty('--spot-x', `${Math.round(area.left + (area.width - width) / 2)}px`);
  style.setProperty('--spot-y', `${Math.round(area.top + Math.min(PLACE.most, Math.max(PLACE.least, area.height * PLACE.share)))}px`);
  style.setProperty('--spot-width', `${Math.round(width)}px`);
  style.setProperty('--spot-room', `${Math.round(Math.max(120, area.bottom - area.top - Math.min(PLACE.most, Math.max(PLACE.least, area.height * PLACE.share)) - BAR - 40))}px`);
 }

 // The field's magnifier, drawn as the field opens: its ring runs round from where the handle will be, then the handle
 // comes out, and the whole settles from a little smaller. Closing, the strokes are taken back.
 draw(on) {
  const [ring, handle] = this.lens.querySelectorAll('circle, path');
  for (const el of [this.lens, ring, handle]) for (const animation of el.getAnimations()) animation.cancel();
  if (reducedMotion()) return this.lens.animate([{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], { duration: 160, fill: 'both' }).finished;
  const dash = { strokeDasharray: '1 1' }, hidden = { ...dash, strokeDashoffset: 1 }, drawn = { ...dash, strokeDashoffset: 0 };
  if (!on) {
   handle.animate([drawn, hidden], { duration: 120, easing: 'ease-in', fill: 'both' });
   ring.animate([drawn, hidden], { duration: 200, delay: 60, easing: 'ease-in', fill: 'both' });
   return this.lens.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 260, fill: 'both' }).finished;
  }
  ring.animate([hidden, drawn], { duration: DRAW.ring, delay: DRAW.wait, easing: DRAW.easing, fill: 'both' });
  handle.animate([hidden, drawn], { duration: DRAW.handle, delay: DRAW.wait + DRAW.ring * 0.72, easing: DRAW.easing, fill: 'both' });
  return this.lens.animate([{ transform: 'scale(0.82) rotate(-18deg)' }, { transform: 'none' }], { duration: DRAW.wait + DRAW.ring + DRAW.handle, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'both' }).finished;
 }

 show() {
  if (this.open) return;
  this.open = true;
  this.back = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  this.input.value = '';
  this.render([]);
  this.place();
  this.root.showPopover();
  this.root.classList.add('is-open');
  this.button.classList.add('is-away');
  this.input.focus({ preventScroll: true });
  for (const animation of this.panel.getAnimations()) animation.cancel();
  this.draw(true).catch(() => {});
  if (reducedMotion()) return;
  this.panel.animate([{ opacity: 0, transform: 'translateY(-8px) scale(0.965)' }, { opacity: 1, transform: 'none' }], OPEN);
 }

 close({ focus = true } = {}) {
  if (!this.open) return;
  this.open = false;
  this.root.classList.remove('is-open');
  this.input.setAttribute('aria-expanded', 'false');
  const done = () => {
   if (this.open) return;
   this.button.classList.remove('is-away');
   this.root.hidePopover();
   for (const el of [this.panel, this.lens]) for (const animation of el.getAnimations()) animation.cancel();
  };
  if (focus) (this.back?.isConnected ? this.back : this.button).focus?.({ preventScroll: true });
  this.back = null;
  if (!reducedMotion()) {
   this.panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(0.975)' }], { ...CLOSE, fill: 'forwards' });
  }
  this.draw(false).then(done, done);
 }

 onKey(event) {
  if (event.isComposing) return;
  const key = event.key, last = this.found.length - 1;
  if (key === 'Escape') {
   event.preventDefault();
   event.stopPropagation();
   if (this.input.value) { this.input.value = ''; this.search(); }
   else this.close();
  } else if (key === 'ArrowDown' || key === 'ArrowUp') {
   event.preventDefault();
   if (last < 0) return;
   const step = key === 'ArrowDown' ? 1 : -1;
   this.select(this.at < 0 ? (step > 0 ? 0 : last) : (this.at + step + last + 1) % (last + 1), true);
  } else if (key === 'Enter') {
   event.preventDefault();
   const chat = this.found[Math.max(0, this.at)];
   if (chat) this.go(chat.id);
  }
 }

 // Every word typed must be in the chat's title, or begin a word of its folder's name. A title that begins with what was typed
 // comes first, then one where a word begins with it, then the rest; among equals the chat used last. A locked chat's
 // title is sealed, so a search never finds it.
 search() {
  const lib = this.library, words = this.input.value.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) { this.render([]); return; }
  const whole = words.join(' '), found = [];
  for (const chat of lib.chats) {
   if (lib.isLocked?.(chat.id)) continue;
   const title = (lib.titleOf(chat) || '').toLowerCase(), folder = this.folderOf(chat).toLowerCase();
   // A folder is found by how a word of its name begins, not by letters in its middle: every chat of a folder comes with it.
   if (!words.every(word => title.includes(word) || folder.split(/[^\p{L}\p{N}]+/u).some(part => part.startsWith(word)))) continue;
   const rank = title.startsWith(whole) ? 0 : new RegExp(`(^|[^\\p{L}\\p{N}])${whole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u').test(title) ? 1 : title.includes(words[0]) ? 2 : 3;
   found.push({ chat, rank });
  }
  found.sort((a, b) => a.rank - b.rank || b.chat.updated - a.chat.updated);
  // Chats of one folder stand together under its name, where the best of them stands; chats with no folder stand alone.
  const groups = new Map();
  for (const { chat } of found.slice(0, SHOWN)) {
   const key = lib.isHome(chat) ? '' : Library.pathKey?.(chat.folder) ?? String(chat.folder).toLowerCase();
   if (!groups.has(key)) groups.set(key, []);
   groups.get(key).push(chat);
  }
  const items = [];
  for (const [key, chats] of groups) {
   if (key) items.push({ folder: key, name: this.folderOf(chats[0]) });
   for (const chat of chats) items.push({ chat, nested: !!key });
  }
  this.render(items, words);
 }

 folderOf(chat) {
  const lib = this.library;
  if (lib.isHome(chat)) return I18n.t('chats.home');
  return lib.folders.find(folder => Library.samePath(folder.path, chat.folder))?.name || String(chat.folder || '').split(/[\\/]/).filter(Boolean).pop() || '';
 }

 // The title with what was typed marked in it.
 title(el, text, words) {
  el.textContent = '';
  const lower = text.toLowerCase(), marks = [];
  for (const word of words) for (let at = lower.indexOf(word); at >= 0; at = lower.indexOf(word, at + word.length)) marks.push([at, at + word.length]);
  marks.sort((a, b) => a[0] - b[0]);
  let pos = 0;
  for (const [from, to] of marks) {
   if (from < pos) continue;
   if (from > pos) el.append(text.slice(pos, from));
   const mark = document.createElement('mark');
   mark.textContent = text.slice(from, to);
   el.append(mark);
   pos = to;
  }
  if (pos < text.length) el.append(text.slice(pos));
 }

 row(chat) {
  const el = document.createElement('li');
  el.className = 'spotlight-row';
  el.setAttribute('role', 'option');
  el.id = `spotlight-${chat.id}`;
  el.dataset.id = chat.id;
  el.innerHTML = `<span class="spotlight-row-sign">${BUBBLE}</span><span class="spotlight-row-title"></span><span class="spotlight-row-time"></span>`;
  return el;
 }

 head(name) {
  const el = document.createElement('li');
  el.className = 'spotlight-folder';
  el.setAttribute('role', 'presentation');
  el.innerHTML = `<span class="spotlight-row-sign">${FOLDER}</span><span></span>`;
  el.lastChild.textContent = name;
  return el;
 }

 // What was found, in order: a folder's name, its chats under it, chats with no folder. A line that was already shown
 // keeps its place in the page; a new one rises into its own.
 render(items, words = []) {
  const asked = words.length > 0, motion = this.open && !reducedMotion();
  const keyOf = item => item.chat ? item.chat.id : `folder ${item.folder}`, keep = new Set(items.map(keyOf));
  this.found = items.filter(item => item.chat).map(item => item.chat);
  for (const [key, el] of this.rows) if (!keep.has(key)) { el.remove(); this.rows.delete(key); }
  let before = this.list.firstElementChild, fresh = 0;
  for (const item of items) {
   const key = keyOf(item);
   let el = this.rows.get(key);
   const isNew = !el;
   if (isNew) this.rows.set(key, el = item.chat ? this.row(item.chat) : this.head(item.name));
   if (item.chat) {
    this.title(el.children[1], this.library.titleOf(item.chat) || I18n.t('chat.new'), words);
    el.children[2].textContent = ago(item.chat.updated);
    el.classList.toggle('is-nested', item.nested);
   }
   if (el !== before) this.list.insertBefore(el, before);
   else before = el.nextElementSibling;
   if (isNew && motion) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { ...ROW, delay: Math.min(fresh++, 8) * 22, fill: 'backwards' });
  }
  this.none.hidden = !asked || items.length > 0;
  this.root.classList.toggle('has-results', asked);
  this.input.setAttribute('aria-expanded', String(asked && items.length > 0));
  this.results.scrollTop = 0;
  this.at = -1;
  this.select(this.found.length ? 0 : -1, false, true);
 }

 // The chat that Enter opens: one plate glides from row to row.
 select(at, reveal, instant = false) {
  if (at === this.at && !instant) return;
  this.at = at;
  const chat = this.found[at], el = chat && this.rows.get(chat.id);
  for (const row of this.rows.values()) if (row.dataset.id) row.setAttribute('aria-selected', String(row === el));
  if (el) this.input.setAttribute('aria-activedescendant', el.id);
  else this.input.removeAttribute('aria-activedescendant');
  const style = this.glider.style;
  // Out of use, the plate takes no room: left where it lay, it would keep the list scrolling past its end.
  if (!el) { style.opacity = '0'; style.transform = 'none'; return; }
  if (instant || style.opacity !== '1') { style.transition = 'none'; requestAnimationFrame(() => { style.transition = ''; }); }
  style.transform = `translateY(${el.offsetTop}px)`;
  style.opacity = '1';
  if (reveal) el.scrollIntoView({ block: 'nearest' });
 }

 go(id) {
  this.close({ focus: false });
  this.chat.open(id);
 }
}

window.Spotlight = Spotlight;
})();
