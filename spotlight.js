(() => {
'use strict';

// Search, in the manner of Spotlight: at a press on the magnifier in the sidebar (or Ctrl+K) the magnifier ducks out of
// the sidebar and a panel of glass comes out of a blur in the middle of the chat: the search field with a magnifier of
// its own. As the user types, the chats that were found come out under the field, in the same panel, which
// grows and shrinks with them on a spring, like the message field with its text. The sidebar's own list stays as it is. A press on a chat that was found, or Enter, opens it.
//
// Under the field stand grey plates, as in the search of Apple's apps: Skills, while there are any. A press on it sets it
// in the field as a blue capsule, and the chats under the field give way to the skills; what is typed then looks for a
// skill, and the ones that fit glide to the top, the rest wait under a fine line. A skill that is pressed, or taken with
// Enter, goes into the message field as a chip. Backspace in the empty field takes the capsule out again. Opened from
// the Skills button of the sidebar, the search is for skills alone: the capsule stays.
const SHOWN = 40;
// With nothing typed, the chats used last stand under the field.
const RECENT = 6;
// The panel comes as Spotlight's does: quickly out of a blur, a little wider and flatter than it will stand. Closed, it
// grows a little and goes into a deeper blur, quicker still.
const OPEN = { duration: 133, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' };
const CLOSE = { duration: 110, easing: 'ease-out', fill: 'forwards' };
const FROM = { opacity: 0, transform: 'scale(1.09, 0.96)', filter: 'blur(4px)' };
const REST = { opacity: 1, transform: 'none', filter: 'blur(0px)' };
const AWAY = { opacity: 0, transform: 'scale(1.06)', filter: 'blur(12px)' };
const ROW = { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
// Skills that fit what is typed come forward one after another, as the colours that suit a pick do in the settings.
const GLIDE = { duration: 560, step: 28, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// The plate flying into the field as its capsule, and the row of plates folding away under it.
const TOKEN = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const PLACE = { share: 0.2, least: 64, most: 190, width: 540, side: 28 };
const LENS = '<svg viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" aria-hidden="true"><circle cx="54.5" cy="54.5" r="15.5"/><path d="M65.5 65.5 81 81"/></svg>';
const FOLDER = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.6 5.6a1.8 1.8 0 0 1 1.8-1.8h2.5l1.7 1.9h5a1.8 1.8 0 0 1 1.8 1.8v5a1.8 1.8 0 0 1-1.8 1.8H4.4a1.8 1.8 0 0 1-1.8-1.8z"/></svg>';
const BAR = 52;
const BUBBLE = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3.2c3.5 0 6.1 2.2 6.1 5.1s-2.6 5.1-6.1 5.1c-.7 0-1.4-.1-2-.3L3.6 14.6l.8-2.6C3.500 11 2.900 9.700 2.900 8.300 2.900 5.400 5.500 3.200 9 3.200z"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR, WEEK = 7 * DAY;
function ago(time, now = Date.now()) {
 const d = Math.max(0, now - time);
 if (d < MINUTE) return I18n.t('time.now');
 if (d < HOUR) return I18n.t('time.minutes', { n: Math.floor(d / MINUTE) });
 if (d < DAY) return I18n.t('time.hours', { n: Math.floor(d / HOUR) });
 if (d < WEEK) return I18n.t('time.days', { n: Math.floor(d / DAY) });
 if (d < 5 * WEEK) return `${Math.floor(d / WEEK)}w`;
 return new Date(time).toLocaleDateString(I18n.lang, { month: 'short', day: 'numeric' });
}

class Spotlight {
 constructor({ button, anchor, library, chat, onSkill = null }) {
  Object.assign(this, { button, anchor, library, chat, onSkill });
  this.open = false;
  // 'chats', or 'skills' once the Skills plate is in the field; `locked`: opened for skills alone, from the sidebar.
  this.mode = 'chats';
  this.locked = false;
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
     <span class="spotlight-lens" aria-hidden="true">${LENS}</span>
     <span class="spotlight-token" hidden><span class="spotlight-token-sign" aria-hidden="true">${Glyphs.skill}</span><span class="spotlight-token-text"></span></span>
     <input class="spotlight-input" type="text" role="combobox" aria-autocomplete="list" aria-controls="spotlight-list" aria-expanded="false" autocomplete="off" spellcheck="false">
    </div>
    <div class="spotlight-chips" hidden>
     <button type="button" class="spotlight-chip" data-mode="skills" tabindex="-1"><span class="spotlight-chip-sign" aria-hidden="true">${Glyphs.skill}</span><span class="spotlight-chip-text"></span></button>
    </div>
    <div class="spotlight-box">
     <div class="spotlight-results">
      <span class="spotlight-glide" aria-hidden="true"></span>
      <ul class="spotlight-list" id="spotlight-list" role="listbox"></ul>
      <p class="spotlight-none" hidden></p>
     </div>
     <div class="scrollbar spotlight-scrollbar" aria-hidden="true"><div class="scrollbar-thumb"></div></div>
    </div>
   </div>`;
  document.body.append(root);
  this.panel = root.querySelector('.spotlight-panel');
  this.input = root.querySelector('.spotlight-input');
  this.box = root.querySelector('.spotlight-box');
  this.results = root.querySelector('.spotlight-results');
  this.list = root.querySelector('.spotlight-list');
  this.none = root.querySelector('.spotlight-none');
  this.glider = root.querySelector('.spotlight-glide');
  this.bar = root.querySelector('.spotlight-bar');
  this.token = root.querySelector('.spotlight-token');
  this.chips = root.querySelector('.spotlight-chips');
  this.skillChip = root.querySelector('.spotlight-chip');
  this.token.querySelector('.spotlight-token-text').textContent = I18n.t('skills.title');
  this.skillChip.querySelector('.spotlight-chip-text').textContent = I18n.t('skills.title');
  // The line between the skills that fit what is typed and the rest.
  this.gap = Object.assign(document.createElement('li'), { className: 'spotlight-gap' });
  this.gap.setAttribute('role', 'presentation');
  const label = I18n.t('search.label');
  this.panel.setAttribute('aria-label', label);
  this.input.setAttribute('aria-label', label);
  this.input.placeholder = label;
  this.none.textContent = I18n.t('search.none');
  // The block under the field follows what it holds on a spring.
  this.height = new SmoothHeight(this.box, this.results);
  this.restTimer = 0;
  new ResizeObserver(() => this.settle()).observe(this.panel);
  this.scroll = new Scrollbar(this.results, root.querySelector('.spotlight-scrollbar'));

  button.addEventListener('search-open', () => this.toggle());
  this.input.addEventListener('input', () => this.search());
  this.input.addEventListener('keydown', event => this.onKey(event));
  this.list.addEventListener('pointermove', event => {
   const row = event.target.closest('.spotlight-row');
   const at = row ? this.found.findIndex(chat => chat.id === row.dataset.id) : -1;
   if (at >= 0) this.select(at, false);
  });
  this.skillChip.addEventListener('click', () => this.setMode('skills', { from: this.skillChip }));
  // Skills put in or taken out while the search is open show at once.
  window.Skills?.watch(() => { this.syncChips(); if (this.open && this.mode === 'skills') this.search(); });
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

 // The search for skills alone, from the sidebar's Skills button: opened so, or turned so if it is open.
 showSkills() {
  if (!this.open) { this.show({ skills: true }); return; }
  if (this.mode === 'skills' && this.locked) { this.close(); return; }
  this.locked = true;
  this.setMode('skills');
 }

 show({ skills = false } = {}) {
  if (this.open) return;
  this.back = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  this.input.value = '';
  this.locked = skills;
  this.setMode(skills ? 'skills' : 'chats', { quiet: true });
  this.place();
  this.root.showPopover();
  // The chats used last are a part of the panel as it comes: they stand in it at once, and the panel is its full height.
  this.search();
  this.height.snap();
  this.height.h = null;
  this.open = true;
  this.root.classList.add('is-open');
  this.button.classList.add('is-away');
  this.input.focus({ preventScroll: true });
  for (const animation of this.panel.getAnimations()) animation.cancel();
  this.panel.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [FROM, REST], OPEN);
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
   for (const animation of this.panel.getAnimations()) animation.cancel();
  };
  if (focus) (this.back?.isConnected ? this.back : this.button).focus?.({ preventScroll: true });
  this.back = null;
  // From wherever the panel is: closed while still coming, it turns back from there.
  this.panel.animate(reducedMotion() ? { opacity: 0 } : AWAY, CLOSE).finished.then(done, done);
 }

 onKey(event) {
  if (event.isComposing) return;
  const key = event.key, last = this.found.length - 1;
  if (key === 'Backspace' && this.mode === 'skills' && !this.locked && !this.input.value) {
   event.preventDefault();
   this.setMode('chats');
   return;
  }
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
  if (this.mode === 'skills') { this.searchSkills(); return; }
  this.gap.remove();
  const lib = this.library, words = this.input.value.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) { this.render(this.grouped(lib.chats.filter(chat => !lib.isLocked?.(chat.id)).sort((a, b) => b.updated - a.updated).slice(0, RECENT))); return; }
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
  this.render(this.grouped(found.slice(0, SHOWN).map(item => item.chat)), words);
 }

 // Chats of one folder stand together under its name, where the best of them stands; chats with no folder stand alone.
 grouped(chats) {
  const lib = this.library, groups = new Map();
  for (const chat of chats) {
   const key = lib.isHome(chat) ? '' : Library.pathKey?.(chat.folder) ?? String(chat.folder).toLowerCase();
   if (!groups.has(key)) groups.set(key, []);
   groups.get(key).push(chat);
  }
  const items = [];
  for (const [key, chats] of groups) {
   if (key) items.push({ folder: key, name: this.folderOf(chats[0]) });
   for (const chat of chats) items.push({ chat, nested: !!key });
  }
  return items;
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
  this.none.textContent = I18n.t('search.none');
  this.none.hidden = !asked || items.length > 0;
  this.root.classList.toggle('has-results', asked || items.length > 0);
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
  if (id.startsWith('skill:')) this.onSkill?.(id.slice(6));
  else this.chat.open(id);
 }

 // The plates under the field: Skills, while there are any and the field holds no capsule yet.
 syncChips() {
  const shown = this.mode === 'chats' && (window.Skills?.items.length || 0) > 0;
  if (this.chips.hidden === !shown) return;
  this.chips.hidden = !shown;
 }

 // The field looks for chats, or for skills with the Skills capsule in it. From a press on the plate, the plate flies
 // into the field as the capsule and the row of plates folds away; going back, the capsule fades where it stood and
 // the plates come back.
 setMode(mode, { from = null, quiet = false } = {}) {
  const skills = mode === 'skills', was = this.mode, motion = this.open && !quiet && !reducedMotion();
  const start = from?.getBoundingClientRect(), chipsHeight = this.chips.hidden ? 0 : this.chips.offsetHeight;
  this.mode = mode;
  this.root.classList.toggle('is-skills', skills);
  this.token.hidden = !skills;
  this.input.placeholder = I18n.t(skills ? 'skills.search' : 'search.label');
  this.syncChips();
  this.input.value = '';
  this.search();
  if (this.open) this.input.focus({ preventScroll: true });
  if (!motion || was === mode) return;
  if (skills) {
   const end = this.token.getBoundingClientRect();
   if (start) this.token.animate([{ transform: `translate(${start.left - end.left}px, ${start.top - end.top}px)`, backgroundColor: 'rgba(var(--fg-rgb), 0.08)', color: 'rgba(var(--fg-rgb), 0.7)' }, { transform: 'none' }], TOKEN);
   else this.token.animate([{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'none' }], TOKEN);
   if (chipsHeight) {
    // The row of plates is gone from the page; a stand-in of its height folds away, so the panel closes in smoothly.
    const stand = Object.assign(document.createElement('div'), { className: 'spotlight-chips-gone' });
    this.chips.after(stand);
    stand.animate([{ height: `${chipsHeight}px` }, { height: '0px' }], TOKEN).finished.then(() => stand.remove(), () => stand.remove());
   }
  } else {
   const height = this.chips.hidden ? 0 : this.chips.offsetHeight;
   if (height) {
    this.chips.animate([{ height: '0px', opacity: 0 }, { height: `${height}px`, opacity: 1 }], TOKEN);
    this.skillChip.animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'none' }], { ...TOKEN, delay: 60, fill: 'backwards' });
   }
  }
 }

 // Every skill is there, in order of its name. With words typed, those whose name has them, then those whose
 // description has them, come forward; the rest stay below a fine line, dimmed.
 searchSkills() {
  const words = this.input.value.toLowerCase().split(/\s+/).filter(Boolean), whole = words.join(' ');
  const all = (window.Skills?.items || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const rank = item => {
   if (!words.length) return 0;
   const name = item.name.toLowerCase(), text = `${name} ${item.description.toLowerCase()}`;
   if (name.startsWith(whole)) return 0;
   if (words.every(word => name.includes(word))) return 1;
   if (words.every(word => text.includes(word))) return 2;
   return -1;
  };
  const ranked = all.map(item => ({ item, rank: rank(item) }));
  const first = ranked.filter(entry => entry.rank >= 0).sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name)).map(entry => entry.item);
  const rest = ranked.filter(entry => entry.rank < 0).map(entry => entry.item);
  this.renderSkills(first, rest, words);
 }

 skillRow(item) {
  const el = document.createElement('li');
  el.className = 'spotlight-row is-skill';
  el.setAttribute('role', 'option');
  el.id = `spotlight-skill-${item.name}`;
  el.dataset.id = `skill:${item.name}`;
  el.innerHTML = `<span class="spotlight-row-sign">${Glyphs.skill}</span><span class="spotlight-row-title"><span class="spotlight-skill-name"></span><span class="spotlight-skill-about"></span></span><span class="spotlight-row-time"></span>`;
  return el;
 }

 renderSkills(first, rest, words) {
  const asked = words.length > 0, motion = this.open && !reducedMotion(), items = [...first, ...rest];
  const keys = new Set(items.map(item => `skill:${item.name}`));
  const before = new Map();
  if (motion) for (const [key, el] of this.rows) if (key.startsWith('skill:') && keys.has(key)) before.set(el, el.getBoundingClientRect().top);
  for (const [key, el] of this.rows) if (!keys.has(key)) { el.remove(); this.rows.delete(key); }
  this.list.querySelectorAll('.spotlight-folder').forEach(el => el.remove());
  const order = [];
  let fresh = 0;
  for (const item of items) {
   const key = `skill:${item.name}`;
   let el = this.rows.get(key);
   if (!el) { this.rows.set(key, el = this.skillRow(item)); el.__fresh = true; }
   this.title(el.querySelector('.spotlight-skill-name'), item.name, words);
   el.querySelector('.spotlight-skill-about').textContent = item.description;
   el.querySelector('.spotlight-row-time').textContent = item.from === 'project' ? I18n.t('skills.from.project') : item.from === 'claude' ? 'Claude' : '';
   el.title = item.description;
   el.classList.toggle('is-dim', asked && !first.includes(item));
   order.push(el);
  }
  if (asked && first.length && rest.length) order.splice(first.length, 0, this.gap);
  else this.gap.remove();
  this.list.append(...order);
  for (const el of order) {
   if (!el.__fresh) continue;
   el.__fresh = false;
   if (motion) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { ...ROW, delay: Math.min(fresh++, 8) * 22, fill: 'backwards' });
  }
  // Those that come forward set out first, one after another; the rest make room.
  for (const [el, top] of before) {
   const dy = top - el.getBoundingClientRect().top;
   if (Math.abs(dy) < 0.5) continue;
   el.getAnimations().forEach(animation => animation.id === 'skill-glide' && animation.cancel());
   const k = first.findIndex(item => `skill:${item.name}` === el.dataset.id);
   el.classList.toggle('is-forward', k >= 0);
   const flight = el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: GLIDE.duration, delay: k >= 0 ? k * GLIDE.step : first.length * GLIDE.step, easing: GLIDE.easing, fill: 'backwards', id: 'skill-glide' });
   const land = () => el.classList.remove('is-forward');
   flight.finished.then(land, land);
  }
  this.found = (asked ? first : items).map(item => ({ id: `skill:${item.name}`, skill: item }));
  this.none.textContent = I18n.t(items.length ? 'search.none' : 'skills.none');
  this.none.hidden = items.length > 0 && (!asked || first.length > 0);
  this.root.classList.add('has-results');
  this.input.setAttribute('aria-expanded', String(this.found.length > 0));
  this.results.scrollTop = 0;
  this.at = -1;
  this.select(this.found.length ? 0 : -1, false, true);
 }
}

window.Spotlight = Spotlight;
})();
