(() => {
'use strict';

const GLIDE_SPRING = [520, 40];
const FADE_SPRING = [320, 32];
const FLIP = { duration: 440, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const ENTER = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const REMOVE = { duration: 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
const GHOST = { enter: 420, leave: 220, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' };
const COLLAPSE_TIME = 480;
const CONFIRM_TIME = 3000;
const CLOCK = 30000;
const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR, WEEK = 7 * DAY;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const key = path => path.toLowerCase();

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

function label(el, text) {
 el.setAttribute('aria-label', text);
 el.title = text;
}

function ago(time, now = Date.now()) {
 const d = Math.max(0, now - time);
 if (d < MINUTE) return I18n.t('time.now');
 if (d < HOUR) return `${Math.floor(d / MINUTE)}m`;
 if (d < DAY) return `${Math.floor(d / HOUR)}h`;
 if (d < WEEK) return `${Math.floor(d / DAY)}d`;
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
 constructor({ root, library, chat, onNewFolder, onNewChat }) {
  this.root = root;
  this.list = root.querySelector('.chats-list');
  this.library = library;
  this.chat = chat;
  this.onNewFolder = onNewFolder;
  this.onNewChat = onNewChat;
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
  this.list.addEventListener('pointerover', event => this.hover(event.target.closest('.chat-row, .chats-folder-head')));
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

 group(folder, collapsed) {
  const section = element('section', `chats-folder${collapsed ? ' is-collapsed' : ''}`);
  const head = element('div', 'chats-folder-head');
  head.setAttribute('role', 'button');
  head.tabIndex = 0;
  head.setAttribute('aria-expanded', String(!collapsed));
  const icon = element('span', 'chats-folder-icon');
  icon.innerHTML = Glyphs.folder;
  const name = element('span', 'chats-folder-name', folder.name);
  const add = action('chats-folder-action', 'new-chat', Glyphs.plus);
  const remove = action('chats-folder-action is-delete', 'delete-folder', Glyphs.trash);
  head.append(icon, name, add, remove);
  const body = element('div', 'chats-folder-body');
  const inner = element('div', 'chats-folder-inner');
  body.inert = collapsed;
  body.append(inner);
  section.append(head, body);
  const group = { section, head, name, add, remove, body, inner, empty: null, path: folder.path, confirm: false, timer: 0 };
  section.__group = group;
  return group;
 }

 row(chat) {
  const row = element('div', 'chat-row');
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  row.dataset.id = chat.id;
  const mark = element('span', 'chat-mark');
  mark.append(element('span', 'chat-dot'));
  const title = element('span', 'chat-title');
  const meta = element('span', 'chat-meta');
  const time = element('span', 'chat-time');
  const actions = element('span', 'chat-actions');
  const pin = action('chat-action', 'pin', Glyphs.pin), remove = action('chat-action is-delete', 'delete', Glyphs.trash);
  label(remove, I18n.t('chat.delete'));
  actions.append(pin, remove);
  meta.append(time, actions);
  row.append(mark, title, meta);
  return { row, mark, title, time, pin, remove, ghost: null, pinned: null, confirm: false, timer: 0 };
 }

 paint(item, chat) {
  const active = chat.id === this.chat.activeId;
  if (item.title.textContent !== chat.title) item.title.textContent = chat.title;
  item.row.title = chat.title;
  item.time.textContent = ago(chat.updated);
  item.row.classList.toggle('is-active', active);
  item.row.classList.toggle('is-unread', !active && this.chat.isUnread(chat.id));
  if (active) item.row.setAttribute('aria-current', 'page');
  else item.row.removeAttribute('aria-current');
  if (item.pinned !== chat.pinned) {
   item.pinned = chat.pinned;
   item.pin.classList.toggle('is-on', chat.pinned);
   label(item.pin, I18n.t(chat.pinned ? 'chat.unpin' : 'chat.pin'));
  }
  this.busy(item, this.chat.isBusy(chat.id));
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
  const match = chat => !query || chat.title.toLowerCase().includes(query);
  const recent = (a, b) => b.updated - a.updated;
  const live = lib.chats.filter(match);
  const pinned = live.filter(chat => chat.pinned).sort(recent);
  const folders = lib.folders
   .map(folder => ({ folder, chats: live.filter(chat => !chat.pinned && key(chat.folder) === key(folder.path)).sort(recent) }))
   .filter(entry => !query || entry.chats.length || entry.folder.name.toLowerCase().includes(query))
   .sort((a, b) => lib.activity(b.folder) - lib.activity(a.folder));
  const primed = this.rows.size > 0, before = this.measure();
  const draft = !query && this.chat.folder;
  const order = [this.glide];
  if (pinned.length) order.push(this.pinnedHead, ...pinned.map(chat => this.item(chat, seen)));
  order.push(this.foldersHead);
  for (const { folder, chats } of folders) order.push(this.folder(folder, chats, !!query, seen, !!draft && key(draft.path) === key(folder.path)));
  for (const [path, group] of this.groups) if (!lib.folders.some(folder => key(folder.path) === path)) { clearTimeout(group.timer); this.groups.delete(path); }
  if (!folders.length && !pinned.length) {
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
   if (primed && item.row.isConnected && !reducedMotion()) item.row.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], ENTER);
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
  this.collapse(group, !searching && folder.collapsed && !draft);
  const kids = chats.map(chat => this.item(chat, seen));
  if (draft) {
   if (!this.draft.row.isConnected || this.draft.row.parentElement !== group.inner) this.draft.fresh = true;
   kids.unshift(this.draft.row);
  }
  place(group.inner, kids.length ? kids : [group.empty ||= element('div', 'chats-empty', I18n.t('chats.empty'))]);
  return group.section;
 }

 collapse(group, collapsed) {
  if (group.section.classList.contains('is-collapsed') === collapsed) return;
  group.section.classList.toggle('is-collapsed', collapsed);
  group.head.setAttribute('aria-expanded', String(!collapsed));
  group.body.inert = collapsed;
  this.wake(COLLAPSE_TIME);
 }

 measure() {
  const tops = new Map();
  if (reducedMotion()) return tops;
  for (const node of this.list.querySelectorAll('.chat-row, .chats-folder, .chats-heading')) tops.set(node, node.getBoundingClientRect().top);
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
   const parent = node.classList.contains('chat-row') ? node.closest('.chats-folder') : null;
   const own = dy - (moved.get(parent) || 0);
   if (Math.abs(own) > 0.5) node.animate([{ transform: `translateY(${own}px)` }, { transform: 'none' }], FLIP);
  }
 }

 clock() {
  for (const [id, item] of this.rows) {
   const chat = this.library.chat(id);
   if (chat) item.time.textContent = ago(chat.updated);
  }
 }

 onClick(event) {
  const button = event.target.closest('[data-action]');
  if (button) {
   const id = button.closest('.chat-row')?.dataset.id, group = button.closest('.chats-folder')?.__group;
   if (button.dataset.action === 'new-folder') this.onNewFolder();
   else if (button.dataset.action === 'new-chat') this.newChat(group);
   else if (button.dataset.action === 'delete-folder') this.askDeleteFolder(group);
   else if (button.dataset.action === 'pin') this.togglePin(id);
   else if (button.dataset.action === 'delete') this.askDelete(id);
   return;
  }
  const head = event.target.closest('.chats-folder-head');
  if (head) {
   this.library.toggleFolder(head.parentElement.__group.path);
   return;
  }
  const row = event.target.closest('.chat-row');
  if (row) this.chat.open(row.dataset.id);
 }

 onKey(event) {
  if ((event.key !== 'Enter' && event.key !== ' ') || event.target.closest('[data-action]')) return;
  if (event.target.classList.contains('chat-row')) {
   event.preventDefault();
   this.chat.open(event.target.dataset.id);
  } else if (event.target.classList.contains('chats-folder-head')) {
   event.preventDefault();
   this.library.toggleFolder(event.target.parentElement.__group.path);
  }
 }

 newChat(group) {
  const folder = group && this.library.folders.find(item => key(item.path) === key(group.path));
  if (!folder) return;
  if (folder.collapsed) this.library.toggleFolder(folder.path);
  this.onNewChat({ path: folder.path, name: folder.name });
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
  const count = this.library.chats.filter(chat => key(chat.folder) === key(group.path)).length;
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
