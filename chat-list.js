(() => {
'use strict';

const GLIDE_SPRING = [520, 40];
const FADE_SPRING = [320, 32];
const FLIP = { duration: 440, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const ENTER = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const REMOVE = { duration: 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
const GHOST = { enter: 420, leave: 220, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' };
const COLLAPSE_TIME = 480;
// The chats without a folder and the routines' chats show this many at first; a row under them shows the rest. The
// rows the rest are shown with come out one after another.
const SHOWN = 5;
const MORE = { step: 32, duration: 380, leave: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// A fork stands a step in under the chat it came from, a fork of a fork another step, and no deeper ones further in:
// they stand under theirs at the last step, and the mark at the start of a fork names its chat.
const FORK_STEPS = 2;
// A fork just made comes out from under its chat.
const FORK_IN = { duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const CHEVRON = '<svg class="glyph glyph-more" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>';
const CONFIRM_TIME = 3000;
const CLOCK = 30000;
const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR, WEEK = 7 * DAY;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const key = path => Library.pathKey(path);
// Where a new chat without a folder waits: among the chats.
const HOME = Symbol('home');
// A title blurs away before its stand-in takes its place.
const VEIL_TIME = 420;
// A new title writes itself in letter by letter, the whole of it within `spread`, like the words typed in the composer.
const WRITE = { duration: 360, step: 18, spread: 420 };
const TITLE_MAX = 60;

// Each letter of a new title rises out of a blur a moment after the one before; then the title is plain text again.
function write(el, text) {
 const letters = [...text], step = Math.min(WRITE.step, WRITE.spread / Math.max(1, letters.length));
 el.replaceChildren(...letters.map((letter, k) => {
  const span = element('span', 'chat-letter', letter);
  span.style.animationDelay = `${Math.round(k * step)}ms`;
  return span;
 }));
 clearTimeout(el.__write);
 el.__write = setTimeout(() => { if (el.textContent === text) el.textContent = text; }, WRITE.duration + WRITE.spread + 60);
}

// A locked chat's title is sealed; in its place stands a blurred line of made-up words, different for every chat.
function veiled(id) {
 let seed = [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
 const next = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
 const word = () => Array.from({ length: 3 + Math.floor(next() * 6) }, () => 'aceimnorsuvwxz'[Math.floor(next() * 14)]).join('');
 return Array.from({ length: 2 + Math.floor(next() * 3) }, word).join(' ');
}

function element(tag, className, text) {
 const el = document.createElement(tag);
 el.className = className;
 if (text !== undefined) el.textContent = text;
 return el;
}

function action(className, name, icon) {
 const button = element('button', className);
 button.type = 'button';
 button.dataset.action = name;
 button.innerHTML = icon;
 return button;
}

// Three dots, one over another: the rest of what can be done with a chat.
const DOTS = '<svg class="glyph glyph-dots" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>';

function label(el, text) {
 el.setAttribute('aria-label', text);
 el.title = text;
}

// When a routine runs next, as short as the time beside a chat: «15:00» within a day, «Fri» within the week, a date
// after that; nothing for one that is paused or has run its only time.
function nextRun(chat) {
 const item = (window.Routines?.of(chat.id) || []).filter(one => Routines.live(one)).sort((a, b) => a.next - b.next)[0];
 if (!item) return '';
 const d = item.next - Date.now();
 if (d < DAY) return new Intl.DateTimeFormat(I18n.lang, { hour: 'numeric', minute: '2-digit' }).format(new Date(item.next));
 if (d < WEEK) return new Intl.DateTimeFormat(I18n.lang, { weekday: 'short' }).format(new Date(item.next));
 return new Date(item.next).toLocaleDateString(I18n.lang, { month: 'short', day: 'numeric' });
}

// A chat's routines as its row shows them: none, on, or all of them paused or done.
function routineState(chat) {
 const items = window.Routines?.of(chat.id) || [];
 if (!items.length) return '';
 return items.some(item => Routines.live(item)) ? 'on' : 'off';
}

const FOLD = 'openghost.routines.collapsed';
const folded = () => { try { return localStorage.getItem(FOLD) === '1'; } catch { return false; } };

function ago(time, now = Date.now()) {
 const d = Math.max(0, now - time);
 if (d < MINUTE) return I18n.t('time.now');
 if (d < HOUR) return I18n.t('time.minutes', { n: Math.floor(d / MINUTE) });
 if (d < DAY) return I18n.t('time.hours', { n: Math.floor(d / HOUR) });
 if (d < WEEK) return I18n.t('time.days', { n: Math.floor(d / DAY) });
 if (d < 5 * WEEK) return `${Math.floor(d / WEEK)}w`;
 return new Date(time).toLocaleDateString(I18n.lang, { month: 'short', day: 'numeric' });
}

function spring(s, goal, [k, c], dt) {
 const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
 for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
 if (Math.abs(goal - s[0]) < 0.01 && Math.abs(s[1]) < 0.05) { s[0] = goal; s[1] = 0; return false; }
 return true;
}

function place(parent, children) {
 children.forEach((child, k) => {
  const at = parent.children[k] || null;
  if (at === child) return;
  if (child.isConnected && parent.moveBefore) parent.moveBefore(child, at);
  else parent.insertBefore(child, at);
 });
 while (parent.children.length > children.length) parent.lastElementChild.remove();
}

class ChatList {
 constructor({ root, library, chat, onNewFolder, onNewChat, onLock, onNewRoutine = null, onSkills = null, onFork = null }) {
  this.root = root;
  this.list = root.querySelector('.chats-list');
  this.library = library;
  this.chat = chat;
  this.onNewFolder = onNewFolder;
  this.onNewChat = onNewChat;
  this.onLock = onLock;
  // The routines' group (routines.js): the chats made for a routine of their own, and its plus sets a new one up.
  this.onNewRoutine = onNewRoutine;
  this.routinesFolded = folded();
  // The Skills row above them: a head like a group's that opens the search for skills (spotlight.js).
  this.onSkills = onSkills;
  // Fork a whole chat (chat.js), from the dots' menu; how far in each chat's row stands, as `tree` put it.
  this.onFork = onFork;
  this.depths = new Map();
  // The groups whose chats all show (see `trim`), and the one whose rest is coming out now.
  this.opened = new Set();
  this.revealing = null;
  // The dots' menu of a row: what the row's own hidden buttons say and allow, as lines.
  this.menu = new RowMenu({
   scroller: root.querySelector('.chats-scroll') || root,
   items: id => {
    const item = this.rows.get(id);
    return item && [
     { name: 'rename', label: I18n.t('chat.rename'), icon: Glyphs.pencil, disabled: item.rename.disabled },
     // A locked chat can't be read, so it can't be forked until it is open.
     ...(this.onFork ? [{ name: 'fork', label: I18n.t('chat.fork'), icon: Glyphs.fork, disabled: this.library.isLocked(id) }] : []),
     { name: 'lock', label: item.lock.getAttribute('aria-label') || I18n.t('chat.lock'), icon: Glyphs.padlock, disabled: item.lock.disabled },
     { name: 'delete', label: I18n.t('chat.delete'), icon: Glyphs.trash },
    ];
   },
   act: (name, id, row) => {
    if (name === 'rename') this.rename(id);
    else if (name === 'fork') this.onFork?.(id);
    else if (name === 'lock') this.onLock?.(id, row);
    else if (name === 'delete') this.remove(id);
   },
  });
  this.query = '';
  this.rows = new Map();
  this.groups = new Map();
  this.glide = element('div', 'chats-glide');
  this.glide.setAttribute('aria-hidden', 'true');
  this.hovered = null;
  this.g = { y: [0, 0], h: [0, 0], o: [0, 0] };
  this.until = 0;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
  this.pinnedHead = this.heading(I18n.t('chats.pinned'));
  this.foldersHead = this.heading(I18n.t('chats.folders'), { action: 'new-folder', label: I18n.t('folder.new'), icon: Glyphs.folderAdd });
  this.hint = element('div', 'chats-empty is-hint');
  this.draft = this.row({ id: '' });
  this.draft.row.classList.add('is-draft', 'is-active');
  this.draft.row.setAttribute('aria-current', 'page');
  this.draft.title.textContent = I18n.t('chat.new');
  this.list.addEventListener('click', event => this.onClick(event));
  this.list.addEventListener('keydown', event => this.onKey(event));
  this.list.addEventListener('pointerover', event => this.hover(event.target.closest('.chat-row, .chats-folder-head, .chats-more')));
  this.list.addEventListener('pointerleave', () => this.hover(null));
  setInterval(() => this.clock(), CLOCK);
  this.render();
 }

 setQuery(query) {
  this.query = query;
  this.render();
 }

 heading(text, button) {
  const head = element('div', 'chats-heading');
  head.append(element('span', 'chats-heading-text', text));
  if (button) {
   const el = action('chats-heading-action', button.action, button.icon);
   label(el, button.label);
   head.append(el);
  }
  return head;
 }

 // A folder of the list, or with `home` the chats without a folder: a speech bubble instead of the folder, and nothing to
 // delete; or with `routines` the routines' own chats: the routine's clock, and its plus sets a routine up.
 group(folder, collapsed, home = false, routines = false) {
  const section = element('section', `chats-folder${home ? ' is-home' : ''}${routines ? ' is-routines' : ''}${collapsed ? ' is-collapsed' : ''}`);
  const head = element('div', 'chats-folder-head');
  head.setAttribute('role', 'button');
  head.tabIndex = 0;
  head.setAttribute('aria-expanded', String(!collapsed));
  const icon = element('span', 'chats-folder-icon');
  icon.innerHTML = routines ? Glyphs.routine : home ? Glyphs.bubble : Glyphs.folder;
  const name = element('span', 'chats-folder-name', folder.name);
  const add = action('chats-folder-action', routines ? 'new-routine' : 'new-chat', Glyphs.plus);
  const remove = home ? null : action('chats-folder-action is-delete', 'delete-folder', Glyphs.trash);
  head.append(icon, name, add, ...(remove ? [remove] : []));
  const body = element('div', 'chats-folder-body');
  const inner = element('div', 'chats-folder-inner');
  body.inert = collapsed;
  body.append(inner);
  section.append(head, body);
  const group = { section, head, name, add, remove, body, inner, empty: null, path: folder.path, home, confirm: false, timer: 0 };
  section.__group = group;
  return group;
 }

 row(chat) {
  const row = element('div', 'chat-row');
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  row.dataset.id = chat.id;
  const mark = element('span', 'chat-mark');
  const guard = element('span', 'chat-guard');
  guard.innerHTML = Glyphs.padlock;
  const bolt = element('span', 'chat-bolt');
  bolt.innerHTML = Glyphs.bolt;
  // A chat with routines wears the routine's clock in the dot's place.
  const clock = element('span', 'chat-routine');
  clock.innerHTML = Glyphs.routine;
  // A fork wears a branch.
  const branch = element('span', 'chat-fork');
  branch.innerHTML = Glyphs.fork;
  mark.append(element('span', 'chat-dot'), bolt, guard, clock, branch);
  // Two lines: the title, and under it the time and the start of the chat's last message; at the end its latest
  // picture, small, which gives way to the buttons under the pointer (chat-preview.js works them out).
  const body = element('span', 'chat-body');
  const title = element('span', 'chat-title');
  const line = element('span', 'chat-line');
  const said = element('span', 'chat-said');
  const photo = element('img', 'chat-photo');
  photo.alt = '';
  photo.hidden = true;
  photo.draggable = false;
  photo.decoding = 'async';
  const meta = element('span', 'chat-meta');
  const time = element('span', 'chat-time');
  const actions = element('span', 'chat-actions');
  const rename = action('chat-action is-rename', 'rename', Glyphs.pencil);
  const lock = action('chat-action is-lock', 'lock', Glyphs.padlock), pin = action('chat-action', 'pin', Glyphs.pin), remove = action('chat-action is-delete', 'delete', Glyphs.trash);
  // The row shows the pin and the dots. Renaming, the password and deleting are lines of the dots' menu; their buttons
  // are kept off the page and only hold what the menu says of them (the padlock's words, what is not to be had now).
  const more = action('chat-action is-more', 'more', DOTS);
  label(rename, I18n.t('chat.rename'));
  label(remove, I18n.t('chat.delete'));
  label(more, I18n.t('chat.more'));
  more.setAttribute('aria-haspopup', 'menu');
  actions.append(pin, more);
  line.append(time, said);
  body.append(title, line);
  meta.append(photo, actions);
  row.append(mark, body, meta);
  return { row, mark, title, time, said, photo, shown: null, rename, lock, pin, remove, ghost: null, pinned: null, guarded: null, locked: null, veil: 0, confirm: false, timer: 0, editing: null };
 }

 paint(item, chat) {
  const active = chat.id === this.chat.activeId, routine = routineState(chat);
  this.guard(item, chat);
  item.time.textContent = this.timeOf(chat);
  this.preview(item, chat);
  item.row.classList.toggle('is-active', active);
  item.row.classList.toggle('is-quick', !!chat.quick);
  item.row.classList.toggle('is-routine', !!routine);
  item.row.classList.toggle('is-routine-off', routine === 'off');
  // A fork whose chat is still there wears the branch; under that chat it stands a step or two in.
  const depth = this.depths.get(chat.id) || 0;
  item.row.classList.toggle('is-forked', !!chat.fork && !!this.library.chat(chat.fork));
  item.row.classList.toggle('is-fork-1', depth === 1);
  item.row.classList.toggle('is-fork-2', depth >= 2);
  item.row.classList.toggle('is-unread', !active && this.chat.isUnread(chat.id));
  if (active) item.row.setAttribute('aria-current', 'page');
  else item.row.removeAttribute('aria-current');
  if (item.pinned !== chat.pinned) {
   item.pinned = chat.pinned;
   item.pin.classList.toggle('is-on', chat.pinned);
   label(item.pin, I18n.t(chat.pinned ? 'chat.unpin' : 'chat.pin'));
  }
  const busy = this.chat.isBusy(chat.id);
  this.busy(item, busy);
  // Locking waits for the reply to finish, the same as changing the model.
  item.lock.disabled = busy;
 }

 // The start of the chat's last message, the user's marked as theirs, and its latest picture. A protected chat shows
 // neither.
 preview(item, chat) {
  const seen = chat.lock ? null : chat.preview, words = seen?.text ? `${seen.mine ? `${I18n.t('chat.you')} ` : ''}${seen.text}` : '';
  if (item.said.textContent !== words) item.said.textContent = words;
  const src = seen?.photo || '';
  if (item.shown === src) return;
  item.shown = src;
  item.row.classList.toggle('has-photo', !!src);
  item.photo.hidden = !src;
  if (src) item.photo.src = src;
  else item.photo.removeAttribute('src');
 }

 // A protected chat wears a small padlock instead of the dot, shut while the chat is locked; its title then hides behind a blur.
 guard(item, chat) {
  const guarded = !!chat.lock, locked = guarded && this.chat.isLocked(chat.id), first = item.guarded === null;
  const text = locked ? veiled(chat.id) : this.library.titleOf(chat) || '';
  item.row.classList.toggle('is-protected', guarded);
  item.row.classList.toggle('is-locked', locked);
  item.row.title = locked ? I18n.t('chat.locked') : text;
  if (locked) item.row.setAttribute('aria-label', I18n.t('chat.locked'));
  else item.row.removeAttribute('aria-label');
  if (item.guarded !== guarded || item.locked !== locked) {
   item.lock.classList.toggle('is-on', guarded);
   label(item.lock, I18n.t(!guarded ? 'chat.lock' : locked ? 'chat.unlock' : 'chat.protected'));
   // A sealed title can't be renamed until the chat is open.
   item.rename.disabled = locked;
  }
  const closing = locked && item.locked === false && !first && !reducedMotion();
  // The same open chat getting a new title, from the user or from the model that names it, writes it in.
  const retitled = !first && !locked && item.locked === false && !!item.title.textContent && !reducedMotion();
  item.guarded = guarded;
  item.locked = locked;
  // A stand-in already on its way is left to arrive; one that is no longer wanted finds the chat open and stays away.
  if ((locked && item.veil) || item.title.textContent === text) return;
  clearTimeout(item.veil);
  item.veil = 0;
  // Opening, the real title takes the stand-in's place while still blurred and comes into focus; closing, it blurs away first.
  if (closing) item.veil = setTimeout(() => { item.veil = 0; if (item.locked) item.title.textContent = veiled(chat.id); }, VEIL_TIME);
  else if (retitled) write(item.title, text);
  else item.title.textContent = text;
 }

 // Renaming happens in the row: the title turns into a field with its words selected, the time and the buttons step aside,
 // and Enter or clicking away keeps the new name while Esc keeps the old one.
 rename(id) {
  const item = this.rows.get(id), chat = this.library.chat(id);
  if (!item || !chat || item.editing || this.library.isLocked(id)) return;
  const input = element('input', 'chat-rename');
  input.type = 'text';
  input.value = this.library.titleOf(chat) || '';
  input.maxLength = TITLE_MAX;
  input.spellcheck = false;
  input.setAttribute('aria-label', I18n.t('chat.rename'));
  item.editing = input;
  item.title.after(input);
  item.row.classList.add('is-renaming');
  input.focus({ preventScroll: true });
  input.select();
  // A press anywhere else keeps the name. Focus leaving counts only inside the window: stepping over to another app
  // to copy a name leaves the field waiting.
  const outside = event => { if (event.target !== input) finish(true); };
  const finish = keep => {
   if (item.editing !== input) return;
   item.editing = null;
   document.removeEventListener('pointerdown', outside, true);
   const title = input.value.replace(/\s+/g, ' ').trim(), focused = document.activeElement === input;
   item.row.classList.remove('is-renaming');
   input.remove();
   if (focused) item.row.focus({ preventScroll: true });
   // Named by hand, the chat keeps its name: the model that names new chats leaves it alone, even with an answer on its way.
   if (keep && title && title !== (this.library.titleOf(chat) || '')) this.library.update(id, { title, named: true, renamed: true });
  };
  input.addEventListener('keydown', event => {
   event.stopPropagation();
   if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); finish(true); }
   else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => { if (document.hasFocus()) finish(true); });
  document.addEventListener('pointerdown', outside, true);
 }

 busy(item, on) {
  item.row.classList.toggle('is-busy', on);
  if (on && !item.ghost) {
   const ghost = item.ghost = document.createElement('ghost-thinking');
   item.mark.append(ghost);
   if (!reducedMotion()) ghost.animate([{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'none' }], { duration: GHOST.enter, easing: GHOST.easing });
  } else if (!on && item.ghost) {
   const ghost = item.ghost;
   item.ghost = null;
   if (reducedMotion()) { ghost.remove(); return; }
   ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.4)' }], { duration: GHOST.leave, easing: 'ease-in', fill: 'forwards' })
    .finished.then(() => ghost.remove(), () => ghost.remove());
  }
 }

 item(chat, seen) {
  let item = this.rows.get(chat.id);
  if (!item) {
   item = this.row(chat);
   item.fresh = true;
   this.rows.set(chat.id, item);
  }
  seen.add(chat.id);
  this.paint(item, chat);
  return item.row;
 }

 render() {
  const lib = this.library, query = this.query.trim().toLowerCase(), seen = new Set();
  this.depths = new Map();
  // A locked chat's title is sealed, so a search never finds it.
  const match = chat => !query || (this.library.titleOf(chat) || '').toLowerCase().includes(query);
  const recent = (a, b) => b.updated - a.updated;
  const live = lib.chats.filter(match);
  const pinned = this.tree(live.filter(chat => chat.pinned));
  // A routine's own chats stand in the routines' group, the one that runs soonest first.
  const soon = chat => Math.min(...(window.Routines?.of(chat.id) || []).filter(item => Routines.live(item)).map(item => item.next), Infinity);
  const routines = this.onNewRoutine ? live.filter(chat => !chat.pinned && chat.routine).sort((a, b) => soon(a) - soon(b) || recent(a, b)) : [];
  const loose = this.tree(live.filter(chat => !chat.pinned && lib.isHome(chat) && !routines.includes(chat)));
  const folders = lib.folders
   .map(folder => ({ folder, chats: this.tree(live.filter(chat => !chat.pinned && lib.within(chat, folder.path))) }))
   .filter(entry => !query || entry.chats.length || entry.folder.name.toLowerCase().includes(query))
   .sort((a, b) => lib.activity(b.folder) - lib.activity(a.folder));
  const primed = this.rows.size > 0, before = this.measure();
  // The stand-in row of a new chat stands where its first message will put it: in its folder, or among the chats.
  const draft = !query && this.chat.isDraft ? this.chat.folder || HOME : null;
  const order = [this.glide];
  if (pinned.length) order.push(this.pinnedHead, ...pinned.map(chat => this.item(chat, seen)));
  if (this.onSkills && !query) order.push(this.skillsRow());
  if (this.onNewRoutine && (!query || routines.length)) order.push(this.routinesGroup(routines, !!query, seen));
  if (!query || loose.length || I18n.t('chats.home').toLowerCase().includes(query)) order.push(this.home(loose, !!query, seen, draft === HOME));
  order.push(this.foldersHead);
  for (const { folder, chats } of folders) order.push(this.folder(folder, chats, !!query, seen, !!draft?.path && key(draft.path) === key(folder.path)));
  for (const [path, group] of this.groups) if (!lib.folders.some(folder => key(folder.path) === path)) { clearTimeout(group.timer); this.groups.delete(path); }
  if (!folders.length && (!query || !pinned.length && !loose.length)) {
   this.hint.textContent = I18n.t(query ? 'chats.nothing' : 'chats.noFolders');
   order.push(this.hint);
  }
  place(this.list, order);
  for (const [id, item] of this.rows) {
   if (seen.has(id)) continue;
   clearTimeout(item.timer);
   item.ghost?.remove();
   this.rows.delete(id);
  }
  this.flip(before);
  for (const item of [...this.rows.values(), this.draft]) {
   if (!item.fresh) continue;
   item.fresh = false;
   if (!primed || !item.row.isConnected || reducedMotion()) continue;
   // A fork comes out from under its chat, behind it; any other new chat comes in from the left.
   if (this.depths.get(item.row.dataset.id)) {
    item.row.style.zIndex = '0';
    const free = () => { item.row.style.zIndex = ''; };
    item.row.animate([{ opacity: 0, transform: 'translateY(-70%)' }, { opacity: 1, transform: 'none' }], FORK_IN).finished.then(free, free);
   } else item.row.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], ENTER);
  }
  if (this.hovered) this.wake(FLIP.duration);
 }

 folder(folder, chats, searching, seen, draft) {
  let group = this.groups.get(key(folder.path));
  if (!group) {
   group = this.group(folder, folder.collapsed);
   this.groups.set(key(folder.path), group);
  }
  group.name.textContent = folder.name;
  group.head.title = folder.path;
  label(group.add, I18n.t('folder.newChat', { name: folder.name }));
  if (!group.confirm) label(group.remove, I18n.t('folder.delete'));
  return this.fill(group, folder.collapsed, chats, searching, seen, draft);
 }

 // The chats without a folder. The group stays even when empty: its plus starts one, and a new chat waits in it.
 home(chats, searching, seen, draft) {
  const home = this.library.home;
  if (!this.homeGroup) {
   this.homeGroup = this.group({ path: null, name: I18n.t('chats.home') }, home.collapsed, true);
   label(this.homeGroup.add, I18n.t('chat.new'));
  }
  this.homeGroup.head.title = home.path;
  return this.fill(this.homeGroup, home.collapsed, chats, searching, seen, draft);
 }

 // The Skills row: the head of a group with nothing under it; a press opens the search for skills.
 skillsRow() {
  if (!this.skillsGroup) {
   const group = this.skillsGroup = this.group({ path: null, name: I18n.t('skills.title') }, true, true);
   group.section.classList.add('is-skills');
   group.skills = true;
   group.head.querySelector('.chats-folder-icon').innerHTML = Glyphs.skill;
   group.head.removeAttribute('aria-expanded');
   group.head.setAttribute('aria-haspopup', 'dialog');
   group.add.remove();
  }
  return this.skillsGroup.section;
 }

 // The routines' group stays even when empty: its plus sets the first one up, and a line says what routines are.
 routinesGroup(chats, searching, seen) {
  if (!this.routinesGroupEl) {
   this.routinesGroupEl = this.group({ path: null, name: I18n.t('routine.title') }, this.routinesFolded, true, true);
   label(this.routinesGroupEl.add, I18n.t('routine.new'));
   this.routinesGroupEl.routines = true;
  }
  const group = this.routinesGroupEl;
  this.collapse(group, !searching && this.routinesFolded);
  const kids = this.trim(group, chats, searching).map(chat => chat === group.moreRow ? chat : this.item(chat, seen));
  place(group.inner, kids.length ? kids : [group.empty ||= element('div', 'chats-empty is-routines-hint', I18n.t('routine.empty'))]);
  return group.section;
 }

 // A group's chats, newest first, each fork right under the chat it came from, newest first too; a chat and its forks
 // stand where the newest of them would. A fork whose chat is not among these (pinned, in another group, gone) stands
 // on its own. Sets how far in each stands (`depths`).
 tree(chats) {
  const ids = new Set(chats.map(chat => chat.id)), kids = new Map(), newest = new Map();
  const parent = chat => chat.fork && chat.fork !== chat.id && ids.has(chat.fork) ? chat.fork : null;
  for (const chat of chats) {
   const of = parent(chat);
   if (of) kids.set(of, [...(kids.get(of) || []), chat]);
  }
  const latest = chat => {
   if (newest.has(chat.id)) return newest.get(chat.id);
   newest.set(chat.id, chat.updated);
   const time = Math.max(chat.updated, ...(kids.get(chat.id) || []).map(latest));
   newest.set(chat.id, time);
   return time;
  };
  const order = (a, b) => latest(b) - latest(a) || b.updated - a.updated;
  const out = [], placed = new Set();
  const walk = (chat, depth) => {
   if (placed.has(chat.id)) return;
   placed.add(chat.id);
   out.push(chat);
   this.depths.set(chat.id, Math.min(depth, FORK_STEPS));
   for (const kid of [...(kids.get(chat.id) || [])].sort(order)) walk(kid, depth + 1);
  };
  for (const chat of chats.filter(one => !parent(one)).sort(order)) walk(chat, 0);
  // Forks that only lead back to each other (never made so, but a list read from disk may say anything) stand on their own.
  for (const chat of [...chats].sort(order)) walk(chat, 0);
  return out;
 }

 // The first `count` chats of a list with their forks, which never stand apart from their chat.
 heads(chats, count, depth = chat => this.depths.get(chat.id) || 0) {
  const out = [];
  let roots = 0;
  for (const chat of chats) {
   if (!depth(chat) && ++roots > count) break;
   out.push(chat);
  }
  return out;
 }

 // A chat with its forks, from a list laid out by `tree`.
 family(chats, chat, depth = one => this.depths.get(one.id) || 0) {
  let at = chats.indexOf(chat);
  if (at < 0) return [];
  while (at > 0 && depth(chats[at])) at--;
  const out = [chats[at]];
  for (let k = at + 1; k < chats.length && depth(chats[k]); k++) out.push(chats[k]);
  return out;
 }

 // A group of more than SHOWN chats shows the first of them and, under them, a row that shows all (or, once all show,
 // one that shows fewer again). A chat counts with its forks, and is never parted from them. The chat on screen always
 // shows, with its own. A search shows all that were found.
 trim(group, chats, searching) {
  if (searching || this.heads(chats, SHOWN).length === chats.length) return chats;
  const open = this.opened.has(group);
  let shown = chats;
  if (!open) {
   shown = this.heads(chats, SHOWN);
   const active = chats.find(chat => chat.id === this.chat.activeId);
   if (active && !shown.includes(active)) shown.push(...this.family(chats, active).filter(chat => !shown.includes(chat)));
  }
  const row = group.moreRow ||= this.moreRow(group);
  row.dataset.open = String(open);
  row.setAttribute('aria-expanded', String(open));
  row.querySelector('.chats-more-text').textContent = I18n.t(open ? 'chats.showLess' : 'chats.showAll');
  row.querySelector('.chats-more-count').textContent = open ? '' : String(chats.length - shown.length);
  return [...shown, row];
 }

 moreRow(group) {
  const row = element('div', 'chats-more');
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  row.__group = group;
  row.innerHTML = `<span class="chats-more-sign">${CHEVRON}</span><span class="chats-more-text"></span><span class="chats-more-count"></span>`;
  return row;
 }

 // Shows the rest of a group's chats, one after another, or folds them away again.
 toggleMore(group) {
  if (!this.opened.has(group)) {
   this.opened.add(group);
   const was = new Set(group.inner.querySelectorAll('.chat-row'));
   this.render();
   if (reducedMotion()) return;
   [...group.inner.querySelectorAll('.chat-row')].filter(row => !was.has(row)).forEach((row, k) => {
    for (const animation of row.getAnimations()) animation.cancel();
    row.animate([{ opacity: 0, transform: 'translateY(-6px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: MORE.duration, delay: k * MORE.step, easing: MORE.easing, fill: 'backwards' });
   });
   return;
  }
  this.opened.delete(group);
  const rows = [...group.inner.querySelectorAll('.chat-row:not(.is-draft)')], depth = row => this.depths.get(row.dataset.id) || 0;
  const keep = new Set(this.heads(rows, SHOWN, depth));
  const active = rows.find(row => row.dataset.id === this.chat.activeId);
  if (active) for (const row of this.family(rows, active, depth)) keep.add(row);
  const going = rows.filter(row => !keep.has(row));
  if (reducedMotion() || !going.length) { this.render(); return; }
  // The rows that go fold away, the last first; then the list closes up.
  const done = () => { if (!this.opened.has(group)) this.render(); };
  const flights = going.reverse().map((row, k) => row.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: MORE.leave, delay: Math.min(k, 6) * 18, easing: 'ease-in', fill: 'forwards' }).finished);
  Promise.all(flights).then(done, done);
 }

 fill(group, collapsed, chats, searching, seen, draft) {
  this.collapse(group, !searching && collapsed && !draft);
  const kids = (group === this.homeGroup ? this.trim(group, chats, searching) : chats).map(chat => chat === group.moreRow ? chat : this.item(chat, seen));
  if (draft) {
   if (!this.draft.row.isConnected || this.draft.row.parentElement !== group.inner) this.draft.fresh = true;
   kids.unshift(this.draft.row);
  }
  place(group.inner, kids.length || group.home ? kids : [group.empty ||= element('div', 'chats-empty', I18n.t('chats.empty'))]);
  return group.section;
 }

 collapse(group, collapsed) {
  group.body.inert = collapsed;
  if (group.section.classList.contains('is-collapsed') === collapsed) return;
  group.section.classList.toggle('is-collapsed', collapsed);
  group.head.setAttribute('aria-expanded', String(!collapsed));
  this.wake(COLLAPSE_TIME);
 }

 measure() {
  const tops = new Map();
  if (reducedMotion()) return tops;
  for (const node of this.list.querySelectorAll('.chat-row, .chats-more, .chats-folder, .chats-heading')) tops.set(node, node.getBoundingClientRect().top);
  return tops;
 }

 flip(before) {
  const moved = new Map();
  for (const [node, top] of before) {
   if (!node.isConnected || node.__removing) continue;
   for (const animation of node.getAnimations()) animation.cancel();
   moved.set(node, top);
  }
  for (const [node, top] of moved) moved.set(node, top - node.getBoundingClientRect().top);
  for (const [node, dy] of moved) {
   const parent = node.matches('.chat-row, .chats-more') ? node.closest('.chats-folder') : null;
   const own = dy - (moved.get(parent) || 0);
   if (Math.abs(own) > 0.5) node.animate([{ transform: `translateY(${own}px)` }, { transform: 'none' }], FLIP);
  }
 }

 // Every half minute the times move on: one pass over the chats, and only the labels whose words changed are touched.
 clock() {
  const chats = new Map(this.library.chats.map(chat => [chat.id, chat]));
  for (const [id, item] of this.rows) {
   const chat = chats.get(id);
   if (!chat) continue;
   const text = this.timeOf(chat);
   if (item.time.textContent !== text) item.time.textContent = text;
  }
 }

 // Beside a chat, how long ago it was written in; beside a routine's own chat, when its routine runs next.
 timeOf(chat) {
  return chat.routine ? nextRun(chat) : ago(chat.updated);
 }

 onClick(event) {
  if (event.target.closest('.chat-rename')) return;
  const button = event.target.closest('[data-action]');
  if (button) {
   const id = button.closest('.chat-row')?.dataset.id, group = button.closest('.chats-folder')?.__group;
   if (button.dataset.action === 'new-folder') this.onNewFolder();
   else if (button.dataset.action === 'new-routine') this.onNewRoutine?.(group.head);
   else if (button.dataset.action === 'new-chat') this.newChat(group);
   else if (button.dataset.action === 'delete-folder') this.askDeleteFolder(group);
   else if (button.dataset.action === 'rename') this.rename(id);
   else if (button.dataset.action === 'pin') this.togglePin(id);
   else if (button.dataset.action === 'delete') this.askDelete(id);
   else if (button.dataset.action === 'lock') this.onLock?.(id, button.closest('.chat-row'));
   else if (button.dataset.action === 'more') this.menu.toggle(id, button.closest('.chat-row'), button);
   return;
  }
  const head = event.target.closest('.chats-folder-head');
  if (head) {
   this.toggleGroup(head.parentElement.__group);
   return;
  }
  const more = event.target.closest('.chats-more');
  if (more) {
   this.toggleMore(more.__group);
   return;
  }
  const row = event.target.closest('.chat-row');
  if (row) this.chat.open(row.dataset.id);
 }

 onKey(event) {
  if (event.key === 'F2' && event.target.classList.contains('chat-row') && !event.target.classList.contains('is-draft')) {
   event.preventDefault();
   this.rename(event.target.dataset.id);
   return;
  }
  if ((event.key !== 'Enter' && event.key !== ' ') || event.target.closest('[data-action]')) return;
  if (event.target.classList.contains('chat-row')) {
   event.preventDefault();
   this.chat.open(event.target.dataset.id);
  } else if (event.target.classList.contains('chats-more')) {
   event.preventDefault();
   this.toggleMore(event.target.__group);
  } else if (event.target.classList.contains('chats-folder-head')) {
   event.preventDefault();
   this.toggleGroup(event.target.parentElement.__group);
  }
 }

 // A folder folds with the index; the routines' group keeps its fold in this window's own storage.
 toggleGroup(group) {
  if (group.skills) { this.onSkills?.(); return; }
  if (!group.routines) { this.library.toggleFolder(group.path); return; }
  this.routinesFolded = !this.routinesFolded;
  try { localStorage.setItem(FOLD, this.routinesFolded ? '1' : '0'); } catch {}
  this.render();
 }

 newChat(group) {
  const folder = group?.home ? this.library.home : group && this.library.folders.find(item => key(item.path) === key(group.path));
  if (!folder) return;
  if (folder.collapsed) this.library.toggleFolder(group.path);
  this.onNewChat(group.home ? null : { path: folder.path, name: folder.name });
 }

 togglePin(id) {
  const chat = this.library.chat(id);
  if (chat) this.library.update(id, { pinned: !chat.pinned });
 }

 askDelete(id) {
  const item = this.rows.get(id);
  if (!item || item.row.__removing) return;
  if (item.confirm) { this.remove(id); return; }
  item.confirm = true;
  item.row.classList.add('is-confirming');
  label(item.remove, I18n.t('chat.deleteConfirm'));
  clearTimeout(item.timer);
  item.timer = setTimeout(() => this.keep(item), CONFIRM_TIME);
 }

 keep(item) {
  clearTimeout(item.timer);
  if (!item.confirm) return;
  item.confirm = false;
  item.row.classList.remove('is-confirming');
  label(item.remove, I18n.t('chat.delete'));
 }

 remove(id) {
  const item = this.rows.get(id);
  clearTimeout(item.timer);
  const done = () => {
   this.chat.remove(id);
   this.library.remove(id);
  };
  if (reducedMotion()) { done(); return; }
  const row = item.row, height = row.offsetHeight;
  row.__removing = true;
  row.inert = true;
  row.style.overflow = 'hidden';
  if (this.hovered === row) this.hover(null);
  row.animate([
   { height: `${height}px`, opacity: 1, transform: 'none' },
   { height: '0px', marginBottom: '0px', opacity: 0, transform: 'translateX(-10px)' },
  ], REMOVE).finished.then(done, done);
  this.wake(REMOVE.duration);
 }

 askDeleteFolder(group) {
  if (!group || group.section.__removing) return;
  if (group.confirm) { this.removeFolder(group); return; }
  const count = this.library.inFolder({ path: group.path }).length;
  group.confirm = true;
  group.section.classList.add('is-confirming');
  label(group.remove, I18n.t(count ? 'folder.deleteConfirm' : 'folder.deleteEmpty', { count }));
  clearTimeout(group.timer);
  group.timer = setTimeout(() => this.keepFolder(group), CONFIRM_TIME);
 }

 keepFolder(group) {
  clearTimeout(group.timer);
  if (!group.confirm) return;
  group.confirm = false;
  group.section.classList.remove('is-confirming');
  label(group.remove, I18n.t('folder.delete'));
 }

 removeFolder(group) {
  clearTimeout(group.timer);
  const done = () => this.chat.removeFolder(group.path, this.library.removeFolder(group.path));
  if (reducedMotion()) { done(); return; }
  const section = group.section;
  section.__removing = true;
  section.inert = true;
  section.style.overflow = 'hidden';
  if (this.hovered && section.contains(this.hovered)) this.hover(null);
  section.animate([
   { height: `${section.offsetHeight}px`, opacity: 1, transform: 'none' },
   { height: '0px', marginTop: '0px', opacity: 0, transform: 'translateX(-10px)' },
  ], REMOVE).finished.then(done, done);
  this.wake(REMOVE.duration);
 }

 hover(target) {
  const next = target && !target.closest('[inert]') ? target : null;
  if (next === this.hovered) return;
  const left = this.hovered && this.rows.get(this.hovered.dataset.id);
  if (left?.confirm) this.keep(left);
  const folder = this.hovered?.classList.contains('chats-folder-head') && this.hovered.parentElement.__group;
  if (folder?.confirm) this.keepFolder(folder);
  this.hovered = next;
  this.wake();
 }

 wake(extra = 0) {
  this.until = Math.max(this.until, performance.now() + extra);
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032), g = this.g;
  this.last = now;
  const target = this.hovered?.isConnected && !this.hovered.closest('[inert]') ? this.hovered : null;
  if (target) {
   const rect = target.getBoundingClientRect(), y = rect.top - this.list.getBoundingClientRect().top, h = rect.height;
   if (g.o[0] < 0.02) { g.y = [y, 0]; g.h = [h, 0]; }
   g.y.goal = y;
   g.h.goal = h;
  }
  let moving = false;
  if (reducedMotion()) {
   if (target) { g.y = [g.y.goal, 0]; g.h = [g.h.goal, 0]; }
   g.o = [target ? 1 : 0, 0];
  } else {
   if (target) {
    moving = spring(g.y, g.y.goal, GLIDE_SPRING, dt) || moving;
    moving = spring(g.h, g.h.goal, GLIDE_SPRING, dt) || moving;
   }
   moving = spring(g.o, target ? 1 : 0, FADE_SPRING, dt) || moving;
  }
  const style = this.glide.style;
  style.transform = `translateY(${g.y[0].toFixed(2)}px)`;
  style.height = `${Math.max(0, g.h[0]).toFixed(2)}px`;
  style.opacity = Math.min(1, Math.max(0, g.o[0])).toFixed(3);
  if (moving || now < this.until) this.raf = requestAnimationFrame(this.tick);
 }
}

window.ChatList = ChatList;
})();
