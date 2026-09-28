(() => {
'use strict';

const INDEX = 'index';
const SAVE_DELAY = 250;
const TITLE_MAX = 60;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const baseName = path => path.split(/[\\/]/).filter(Boolean).pop() || path;
const samePath = (a, b) => a.toLowerCase() === b.toLowerCase();

function titleFrom(text, attachments) {
 const lines = text.split('\n').map(part => part.trim()).filter(Boolean);
 const line = lines.find(part => !part.startsWith('>')) || lines[0]?.replace(/^>\s*/, '') || attachments.map(item => item.name).join(', ');
 if (!line) return I18n.t('chat.new');
 return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

class Library {
 constructor(store, onChange) {
  this.store = store;
  this.onChange = onChange;
  this.folders = [];
  this.chats = [];
  this.timer = 0;
  // Keys and titles of the protected chats that are open right now: they live in memory only.
  this.keys = new Map();
  this.titles = new Map();
  this.writes = new Map();
  this.ready = this.load();
 }

 async load() {
  const index = await this.store.read(INDEX).catch(() => null);
  this.folders = (Array.isArray(index?.folders) ? index.folders : []).filter(folder => typeof folder?.path === 'string');
  this.chats = (Array.isArray(index?.chats) ? index.chats : []).filter(chat => chat?.id && typeof chat.folder === 'string');
  for (const chat of this.chats) {
   delete chat.archived;
   this.folder({ path: chat.folder });
  }
  this.onChange();
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
  return this.store.write(INDEX, { version: 1, folders: this.folders, chats: this.chats });
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
  const folder = this.folder(picked);
  folder.collapsed = false;
  folder.added = Date.now();
  this.changed();
  return { path: folder.path, name: folder.name };
 }

 toggleFolder(path) {
  const folder = this.folders.find(item => samePath(item.path, path));
  if (!folder) return;
  folder.collapsed = !folder.collapsed;
  this.changed();
 }

 activity(folder) {
  return this.chats.reduce((last, chat) => samePath(chat.folder, folder.path) ? Math.max(last, chat.updated) : last, folder.added || 0);
 }

 chat(id) {
  return this.chats.find(chat => chat.id === id) || null;
 }

 inFolder(folder) {
  return this.chats.filter(chat => samePath(chat.folder, folder.path));
 }

 create({ folder, text, attachments }) {
  const now = Date.now(), known = this.folder(folder);
  const chat = { id: uid(), title: titleFrom(text, attachments), folder: known.path, created: now, updated: now, pinned: false, named: false };
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
  this.chats.splice(index, 1);
  this.forget(id);
  this.changed();
  this.store.remove(`chats/${id}`).catch(() => {});
 }

 removeFolder(path) {
  const gone = this.chats.filter(chat => samePath(chat.folder, path));
  this.chats = this.chats.filter(chat => !samePath(chat.folder, path));
  this.folders = this.folders.filter(folder => !samePath(folder.path, path));
  for (const chat of gone) this.forget(chat.id);
  this.changed();
  for (const chat of gone) this.store.remove(`chats/${chat.id}`).catch(() => {});
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

window.Library = Library;
})();
