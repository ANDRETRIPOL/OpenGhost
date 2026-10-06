(() => {
'use strict';

const INDEX = 'index';
const SAVE_DELAY = 250;
const TITLE_MAX = 60;
const SPACE_MAX = 32;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const baseName = path => path.split(/[\\/]/).filter(Boolean).pop() || path;
// Windows and macOS file systems ignore case, so C:\Work and c:\work are one folder there; on Linux Foo and foo are two.
const pathKey = window.openghost?.platform === 'linux' ? path => path : path => path.toLowerCase();
const samePath = (a, b) => pathKey(a) === pathKey(b);

function titleFrom(text, attachments) {
 const lines = text.split('\n').map(part => part.trim()).filter(Boolean);
 const line = lines.find(part => !part.startsWith('>')) || lines[0]?.replace(/^>\s*/, '') || attachments.map(item => item.name).join(', ');
 if (!line) return I18n.t('chat.new');
 return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

// The name of a chat's own folder: its first words, without what file systems refuse, cut at a word.
function spaceName(title) {
 let name = title.replace(/[<>:"/\\|?*\u0000-\u001f…]/g, ' ').replace(/\s+/g, ' ').trim();
 if (name.length > SPACE_MAX) {
  const cut = name.slice(0, SPACE_MAX + 1), space = cut.lastIndexOf(' ');
  name = space > SPACE_MAX / 2 ? cut.slice(0, space) : name.slice(0, SPACE_MAX);
 }
 name = name.replace(/[\s.,;:!?-]+$/, '');
 // Windows keeps a few names for devices, and a folder can't take one of them.
 if (!name || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) name = [I18n.t('chat.new'), name].filter(Boolean).join(' ');
 return name;
}

class Library {
 constructor(store, onChange) {
  this.store = store;
  this.onChange = onChange;
  this.folders = [];
  this.chats = [];
  // Chats started without a project folder: each has a folder of its own in here, named in its `space`.
  this.home = { path: '', collapsed: false };
  this.timer = 0;
  // Keys and titles of the protected chats that are open right now: they live in memory only.
  this.keys = new Map();
  this.titles = new Map();
  this.writes = new Map();
  this.ready = this.load();
 }

 async load() {
  const [index, home] = await Promise.all([
   this.store.read(INDEX).catch(() => null),
   window.openghost?.chatsFolder?.().catch(() => '') ?? '',
  ]);
  this.home = { path: typeof home === 'string' ? home : '', collapsed: !!index?.home?.collapsed };
  this.folders = (Array.isArray(index?.folders) ? index.folders : []).filter(folder => typeof folder?.path === 'string');
  this.chats = (Array.isArray(index?.chats) ? index.chats : []).filter(chat => chat?.id && typeof chat.folder === 'string');
  for (const chat of this.chats) {
   delete chat.archived;
   if (!this.isHome(chat)) this.folder({ path: chat.folder });
  }
  this.onChange();
 }

 // A chat without a project folder. It keeps the chats folder as its folder too, so an older version of the app still
 // finds it, as a folder named Chats.
 isHome(chat) {
  return typeof chat?.space === 'string';
 }

 // Where the agent of a chat works: its project folder, or its own folder among the chats.
 cwdOf(chat) {
  if (!chat) return '';
  if (!this.isHome(chat)) return chat.folder;
  if (!this.home.path) return '';
  return `${this.home.path}${this.home.path.includes('\\') ? '\\' : '/'}${chat.space}`;
 }

 // Whether a chat sits in a folder of the list, and not among the chats without one.
 within(chat, path) {
  return !this.isHome(chat) && samePath(chat.folder, path);
 }

 space(title) {
  const taken = new Set(this.chats.filter(chat => this.isHome(chat)).map(chat => pathKey(chat.space)));
  const base = spaceName(title);
  let name = base;
  for (let n = 2; taken.has(pathKey(name)); n++) name = `${base} ${n}`;
  return name;
 }

 save() {
  clearTimeout(this.timer);
  this.timer = setTimeout(() => this.flush(), SAVE_DELAY);
 }

 flush() {
  if (this.timer) this.persist().catch(() => {});
 }

 // Writes the index at once, for a step that must be on disk before the next one starts.
 persist() {
  clearTimeout(this.timer);
  this.timer = 0;
  return this.store.write(INDEX, { version: 1, folders: this.folders, chats: this.chats, home: { collapsed: this.home.collapsed } });
 }

 changed() {
  this.save();
  this.onChange();
 }

 folder({ path, name }) {
  let folder = this.folders.find(item => samePath(item.path, path));
  if (!folder) {
   folder = { path, name: name || baseName(path), collapsed: false, added: Date.now() };
   this.folders.push(folder);
   this.save();
  }
  return folder;
 }

 async pick() {
  let picked = null;
  if (window.openghost?.pickFolder) {
   picked = await window.openghost.pickFolder();
  } else if (window.showDirectoryPicker) {
   try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    picked = { path: handle.name, name: handle.name };
   } catch {}
  }
  if (!picked) return null;
  // The chats folder itself is where chats without a folder already go.
  if (this.home.path && samePath(picked.path, this.home.path)) return null;
  const folder = this.folder(picked);
  folder.collapsed = false;
  folder.added = Date.now();
  this.changed();
  return { path: folder.path, name: folder.name };
 }

 // The chats without a folder fold like a folder; a null path stands for them.
 toggleFolder(path) {
  const folder = path === null ? this.home : this.folders.find(item => samePath(item.path, path));
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  this.changed();
 }

 activity(folder) {
  return this.chats.reduce((last, chat) => this.within(chat, folder.path) ? Math.max(last, chat.updated) : last, folder.added || 0);
 }

 chat(id) {
  return this.chats.find(chat => chat.id === id) || null;
 }

 inFolder(folder) {
  return this.chats.filter(chat => this.within(chat, folder.path));
 }

 // A chat is made with the first message. Without a folder it goes to the chats, with a folder of its own named after it.
 create({ folder, text, attachments }) {
  const now = Date.now(), title = titleFrom(text, attachments);
  const place = folder ? { folder: this.folder(folder).path } : { folder: this.home.path, space: this.space(title) };
  const chat = { id: uid(), title, ...place, created: now, updated: now, pinned: false, named: false };
  this.chats.push(chat);
  this.changed();
  return chat;
 }

 update(id, changes) {
  const chat = this.chat(id);
  if (!chat) return null;
  if (chat.lock && 'title' in changes) {
   const { title, ...rest } = changes;
   this.retitle(chat, title);
   changes = rest;
  }
  Object.assign(chat, changes);
  this.changed();
  return chat;
 }

 // A protected chat's title is kept sealed. It can change only while the chat is open; locked, it keeps the old one.
 async retitle(chat, title) {
  const key = this.keys.get(chat.id);
  if (!key) return;
  this.titles.set(chat.id, title);
  chat.lock.title = await ChatLock.seal(key, { title });
  this.changed();
 }

 isProtected(id) {
  return !!this.chat(id)?.lock;
 }

 isLocked(id) {
  return this.isProtected(id) && !this.keys.has(id);
 }

 // What the list shows as a chat's title: a protected chat's is known only while it is open.
 titleOf(chat) {
  return chat.lock ? this.titles.get(chat.id) ?? null : chat.title;
 }

 remove(id) {
  const index = this.chats.findIndex(chat => chat.id === id);
  if (index < 0) return;
  const [chat] = this.chats.splice(index, 1);
  this.forget(id);
  this.changed();
  this.store.remove(`chats/${id}`).catch(() => {});
  this.store.remove(`mini/${id}`).catch(() => {});
  this.store.remove(`notes/${id}`).catch(() => {});
  // After any save of them still on its way.
  this.queue(id, () => this.store.remove(`drafts/${id}`));
  if (this.isHome(chat)) window.openghost?.releaseFolder?.(this.cwdOf(chat)).catch(() => {});
 }

 removeFolder(path) {
  const gone = this.chats.filter(chat => this.within(chat, path));
  this.chats = this.chats.filter(chat => !this.within(chat, path));
  this.folders = this.folders.filter(folder => !samePath(folder.path, path));
  for (const chat of gone) this.forget(chat.id);
  this.changed();
  for (const chat of gone) {
   this.store.remove(`chats/${chat.id}`).catch(() => {});
   this.store.remove(`mini/${chat.id}`).catch(() => {});
   this.store.remove(`notes/${chat.id}`).catch(() => {});
   this.queue(chat.id, () => this.store.remove(`drafts/${chat.id}`));
  }
  return gone.map(chat => chat.id);
 }

 forget(id) {
  this.keys.delete(id);
  this.titles.delete(id);
 }

 // A sealed chat opens only with its key; without one this throws rather than hand back an empty chat that could overwrite it.
 async conversation(id) {
  const data = await this.store.read(`chats/${id}`).catch(() => null);
  const body = data?.sealed ? await ChatLock.open(this.keys.get(id), data.sealed) : data;
  return { messages: Array.isArray(body?.messages) ? body.messages : [], tokens: Number(body?.tokens) || 0 };
 }

 // A protected chat is sealed with the key it has when the save is asked for, so locking right after a reply loses nothing.
 saveMessages(id, messages, tokens = 0) {
  const chat = this.chat(id), key = chat?.lock ? this.keys.get(id) : null;
  if (!chat || (chat.lock && !key)) return Promise.resolve();
  const body = { messages, tokens };
  return this.queue(id, async () => this.store.write(`chats/${id}`, key ? { version: 1, sealed: await ChatLock.seal(key, body) } : { version: 1, ...body }));
 }

 // The mini chat over a chat keeps its messages apart from the chat's, next to them, and sealed with the chat's key when it has
 // a password. `seen` is when the chat last changed as of the latest question asked in the mini chat. Reading waits for the
 // writes already on their way, so a mini chat opened again right after closing finds what the last one saved.
 side(id) {
  return this.queue(id, async () => {
   const data = await this.store.read(`mini/${id}`).catch(() => null);
   const body = data?.sealed ? await ChatLock.open(this.keys.get(id), data.sealed) : data;
   return { messages: Array.isArray(body?.messages) ? body.messages : [], tokens: Number(body?.tokens) || 0, seen: Number(body?.seen) || 0 };
  }).then(body => body || { messages: [], tokens: 0, seen: 0 });
 }

 saveSide(id, { messages, tokens = 0, seen = 0 }) {
  const chat = this.chat(id), key = chat?.lock ? this.keys.get(id) : null;
  if (!chat || (chat.lock && !key)) return Promise.resolve();
  const body = { messages, tokens, seen };
  return this.queue(id, async () => this.store.write(`mini/${id}`, key ? { version: 1, sealed: await ChatLock.seal(key, body) } : { version: 1, ...body }));
 }

 clearSide(id) {
  return this.queue(id, () => this.store.remove(`mini/${id}`));
 }

 // The notes kept beside a chat (notepad.js): apart from its messages, next to them, and sealed with the chat's key when it
 // has a password, the way its mini chat is. `next` numbers the notes, so a note's id is never given twice.
 notes(id) {
  return this.queue(id, async () => {
   const data = await this.store.read(`notes/${id}`).catch(() => null);
   const body = data?.sealed ? await ChatLock.open(this.keys.get(id), data.sealed) : data;
   return { items: Array.isArray(body?.items) ? body.items : [], next: Number(body?.next) || 1 };
  }).then(body => body || { items: [], next: 1 });
 }

 saveNotes(id, { items, next }) {
  const chat = this.chat(id), key = chat?.lock ? this.keys.get(id) : null;
  if (!chat || (chat.lock && !key)) return Promise.resolve();
  const body = { items, next };
  return this.queue(id, async () => this.store.write(`notes/${id}`, key ? { version: 1, sealed: await ChatLock.seal(key, body) } : { version: 1, ...body }));
 }

 // The words written in a chat's field and not sent yet (script.js): kept beside the chat so they outlive a restart, and
 // sealed with the chat's key when it has a password. `new` holds those of a chat not started yet. A locked chat gives
 // none: they can't be read without its key.
 draft(id) {
  return this.queue(id, async () => {
   const data = await this.store.read(`drafts/${id}`).catch(() => null);
   if (data?.sealed && !this.keys.has(id)) return '';
   const body = data?.sealed ? await ChatLock.open(this.keys.get(id), data.sealed) : data;
   return typeof body?.text === 'string' ? body.text : '';
  }).then(text => text || '');
 }

 // Sealed with the key the chat has when the save is asked for, so locking right after it loses nothing.
 saveDraft(id, text) {
  const chat = id === 'new' ? null : this.chat(id), key = chat?.lock ? this.keys.get(id) : null;
  if (id !== 'new' && (!chat || (chat.lock && !key))) return Promise.resolve();
  if (!text.trim()) return this.queue(id, () => this.store.remove(`drafts/${id}`));
  const body = { text };
  return this.queue(id, async () => this.store.write(`drafts/${id}`, key ? { version: 1, sealed: await ChatLock.seal(key, body) } : { version: 1, ...body }));
 }

 // Seals a chat's mini chat, its notes and its unsent words along with it, or opens them for good when the password comes
 // off. One that fails to change never holds the chat's own password back.
 async reseal(id, key) {
  const kept = {
   mini: data => ({ messages: data.messages, tokens: data.tokens, seen: data.seen }),
   notes: data => ({ items: data.items, next: data.next }),
   drafts: data => ({ text: data.text }),
  };
  for (const [kind, plain] of Object.entries(kept)) {
   try {
    const data = await this.store.read(`${kind}/${id}`);
    if (!data || !!data.sealed === !!key) continue;
    const body = data.sealed ? await ChatLock.open(this.keys.get(id), data.sealed) : plain(data);
    await this.store.write(`${kind}/${id}`, key ? { version: 1, sealed: await ChatLock.seal(key, body) } : { version: 1, ...body });
   } catch {}
  }
 }

 // Writes of one chat's messages go out one after another, in the order they were asked for.
 queue(id, job) {
  const next = (this.writes.get(id) || Promise.resolve()).then(job).catch(() => {});
  this.writes.set(id, next);
  next.then(() => { if (this.writes.get(id) === next) this.writes.delete(id); });
  return next;
 }

 // Puts a password on a chat. The index takes the lock first and the messages are sealed after it,
 // so a crash in between leaves a protected chat whose messages are still readable, never sealed ones nothing can open.
 async protect(id, password, loaded = null) {
  const chat = this.chat(id);
  if (!chat || chat.lock) return false;
  const salt = ChatLock.salt(), key = await ChatLock.derive(password, salt);
  let done = false;
  await this.queue(id, async () => {
   const body = loaded || await this.conversation(id), title = chat.title;
   chat.lock = { version: 1, iterations: ChatLock.ITERATIONS, salt, title: await ChatLock.seal(key, { title }) };
   chat.title = '';
   try {
    await this.persist();
   } catch (error) {
    delete chat.lock;
    chat.title = title;
    throw error;
   }
   done = true;
   await this.store.write(`chats/${id}`, { version: 1, sealed: await ChatLock.seal(key, { messages: body.messages, tokens: body.tokens }) });
   await this.reseal(id, key);
  });
  this.changed();
  return done;
 }

 // The password is checked against the sealed title, which only the right key opens.
 async unlock(id, password) {
  const chat = this.chat(id);
  if (!chat?.lock) return true;
  try {
   const key = await ChatLock.derive(password, chat.lock.salt, chat.lock.iterations);
   const { title } = await ChatLock.open(key, chat.lock.title);
   if (!this.keys.has(id)) this.keys.set(id, key);
   this.titles.set(id, title);
   this.onChange();
   return true;
  } catch {
   return false;
  }
 }

 relock(id) {
  if (!this.keys.has(id) && !this.titles.has(id)) return;
  this.forget(id);
  this.onChange();
 }

 // Takes the password off an open chat: the messages are written in the clear first, then the index lets go of the lock.
 async unprotect(id, loaded = null) {
  const chat = this.chat(id);
  if (!chat?.lock || !this.keys.has(id)) return false;
  let done = false;
  await this.queue(id, async () => {
   const body = loaded || await this.conversation(id);
   await this.store.write(`chats/${id}`, { version: 1, messages: body.messages, tokens: body.tokens });
   await this.reseal(id, null);
   chat.title = this.titles.get(id) ?? '';
   delete chat.lock;
   this.forget(id);
   await this.persist();
   done = true;
  });
  this.changed();
  return done;
 }
}

Library.pathKey = pathKey;
Library.samePath = samePath;
window.Library = Library;
})();
