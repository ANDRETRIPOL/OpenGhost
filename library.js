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
  // Chats made and removed here that the index on the disk does not know of yet: another window's index must not undo them.
  this.fresh = new Set();
  this.gone = new Set();
  // With the quick chat the app has two windows over one index: each takes in what the other has written.
  store.onChange?.(key => { if (key === INDEX) this.reload(); });
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

 // The index as another window has just written it. With nothing of its own waiting to be written, this window takes it
 // whole; otherwise a chat keeps the newer of its two records, and what was made or removed here and is not on the disk
 // yet stays as it is here. A chat this window knows keeps its own record either way, as open chats hold on to it.
 async reload() {
  await this.ready;
  const index = await this.store.read(INDEX).catch(() => null);
  if (!index) return;
  const dirty = !!this.timer, mine = new Map(this.chats.map(chat => [chat.id, chat]));
  const theirs = (Array.isArray(index.chats) ? index.chats : []).filter(chat => chat?.id && typeof chat.folder === 'string' && !this.gone.has(chat.id));
  const chats = theirs.map(chat => {
   const own = mine.get(chat.id);
   if (!own) return chat;
   if (!dirty || (chat.updated || 0) > (own.updated || 0)) {
    for (const key of Object.keys(own)) delete own[key];
    Object.assign(own, chat);
   }
   return own;
  });
  const listed = new Set(chats.map(chat => chat.id));
  for (const chat of this.chats) if (!listed.has(chat.id) && this.fresh.has(chat.id)) chats.push(chat);
  this.chats = chats;
  const folders = (Array.isArray(index.folders) ? index.folders : []).filter(folder => typeof folder?.path === 'string');
  if (dirty) {
   for (const folder of folders) if (!this.folders.some(item => samePath(item.path, folder.path))) this.folders.push(folder);
  } else {
   this.folders = folders;
   this.home.collapsed = !!index.home?.collapsed;
  }
  for (const chat of this.chats) if (!this.isHome(chat)) this.folder({ path: chat.folder });
  this.onChange();
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
  this.fresh.clear();
  this.gone.clear();
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
  // A chat started in the quick window says so, and the list marks it.
  if (window.openghost?.quick) chat.quick = true;
  this.fresh.add(chat.id);
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
  this.gone.add(id);
  this.forget(id);
  this.changed();
  this.removeFiles(id);
  // Its routines go with it: they would have nowhere to run.
  window.Routines?.forget(id);
  if (this.isHome(chat)) window.openghost?.releaseFolder?.(this.cwdOf(chat)).catch(() => {});
 }

 removeFolder(path) {
  const gone = this.chats.filter(chat => this.within(chat, path));
  this.chats = this.chats.filter(chat => !this.within(chat, path));
  this.folders = this.folders.filter(folder => !samePath(folder.path, path));
  for (const chat of gone) {
   this.gone.add(chat.id);
   this.forget(chat.id);
  }
  this.changed();
  for (const chat of gone) {
   this.removeFiles(chat.id);
   window.Routines?.forget(chat.id);
  }
  return gone.map(chat => chat.id);
 }

 // A password change or save already in flight finishes before the final deletion of every chat file.
 removeFiles(id) {
  return this.queue(id, () => Promise.all(['chats', 'mini', 'notes', 'record', 'drafts', 'permissions'].map(kind => this.store.remove(`${kind}/${id}`))));
 }

 forget(id) {
  this.keys.delete(id);
  this.titles.delete(id);
  window.openghost?.pictures?.lock(id);
 }

 // The key for the pictures the agent showed in a chat with a password (desktop/pictures.js): 32 random bytes, sealed
 // with the chat's own key in its lock. A chat protected before there was such a key gets one the first time it opens.
 async pictureKey(chat, key) {
  if (chat.lock.pictures) return (await ChatLock.open(key, chat.lock.pictures)).key;
  const raw = Library.pictureKey();
  chat.lock.pictures = await ChatLock.seal(key, { key: raw });
  this.changed();
  return raw;
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
   return { messages: Array.isArray(body?.messages) ? body.messages : [], tokens: Number(body?.tokens) || 0, seen: Number(body?.seen) || 0, ...(typeof body?.effort === 'string' ? { effort: body.effort } : {}) };
  }).then(body => body || { messages: [], tokens: 0, seen: 0 });
 }

 saveSide(id, { messages, tokens = 0, seen = 0, effort = '' }) {
  const chat = this.chat(id), key = chat?.lock ? this.keys.get(id) : null;
  if (!chat || (chat.lock && !key)) return Promise.resolve();
  const body = { messages, tokens, seen, ...(effort ? { effort } : {}) };
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

 // This chat's private record: facts the agent keeps for itself, apart from the project folder so no other chat can
 // read them, and sealed with the chat's key when it has a password. Empty text removes the file.
 record(id) {
  return this.queue(id, async () => {
   const data = await this.store.read(`record/${id}`);
   if (!data) return '';
   if (data.sealed && !this.keys.has(id)) return '';
   const body = data.sealed ? await ChatLock.open(this.keys.get(id), data.sealed) : data;
   return typeof body?.text === 'string' ? body.text : '';
  }, true).then(text => text || '');
 }

 saveRecord(id, text) {
  const body = { text: String(text || '') };
  return this.queue(id, async () => {
   // Recheck after earlier jobs: the chat may have been deleted or locked while this save waited.
   const chat = this.chat(id), key = chat?.lock ? this.keys.get(id) : null;
   if (!chat || (chat.lock && !key)) return false;
   if (!body.text.trim()) await this.store.remove(`record/${id}`);
   else await this.store.write(`record/${id}`, key ? { version: 1, sealed: await ChatLock.seal(key, body) } : { version: 1, ...body });
   return true;
  }, true);
 }

 // ASK exceptions belong to this chat, not to the agent or the global settings. They are sealed with its password,
 // read afresh for each step (also across windows), and deliberately not copied when the chat is forked.
 async readPermissions(id) {
  if (!this.chat(id) || this.isLocked(id)) return [];
  const data = await this.store.read(`permissions/${id}`);
  const body = data?.sealed ? await ChatLock.open(this.keys.get(id), data.sealed) : data;
  return [...new Set((Array.isArray(body?.rules) ? body.rules : []).filter(key => typeof key === 'string' && key.length <= 16000))].slice(0, 128);
 }

 permissions(id) {
  return this.queue(id, () => this.readPermissions(id), true);
 }

 allowPermission(id, rule, signal) {
  return this.queue(id, async () => {
   const chat = this.chat(id), key = chat?.lock ? this.keys.get(id) : null;
   if (!chat || (chat.lock && !key) || typeof rule !== 'string' || !rule || rule.length > 16000) return false;
   const rules = await this.readPermissions(id);
   if (!rules.includes(rule)) {
    if (rules.length >= 128) return false;
    rules.push(rule);
   }
   const body = { rules }, value = key ? { version: 1, sealed: await ChatLock.seal(key, body) } : { version: 1, ...body };
   signal?.throwIfAborted();
   await this.store.write(`permissions/${id}`, value);
   return true;
  }, true);
 }

 resetPermissions(id) {
  return this.queue(id, async () => {
   if (!this.chat(id) || this.isLocked(id)) throw new Error('The chat is locked or gone');
   await this.store.remove(`permissions/${id}`);
   return true;
  }, true);
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

 // A fork of a chat: a chat of its own that goes on from a point of another, apart from it from then on. It takes the
 // chat's messages up to there (`messages`, `tokens`), its notes and its mini chat, its folder, its model and its
 // password: sealed with the same key, the same password opens it. It remembers whose fork it is (`fork`), and asks the
 // models with the key its chat has asked with all along (`session`), so that their caches still serve what they share.
 async fork(id, { messages, tokens }) {
  const chat = this.chat(id), key = chat?.lock ? this.keys.get(id) : null;
  if (!chat || (chat.lock && !key)) return null;
  const now = Date.now(), title = this.titleOf(chat) || I18n.t('chat.new');
  const copy = { id: uid(), title, folder: chat.folder, created: now, updated: now, pinned: false, named: false, fork: id, session: chat.session || id };
  // A chat without a project folder: the fork works in the same folder of its own, with what the agent made there.
  if (chat.space) copy.space = chat.space;
  if (chat.model) copy.model = chat.model;
  if (chat.effort) copy.effort = chat.effort;
  const [notes, side, brief] = await Promise.all([this.notes(id), this.side(id), this.record(id)]);
  const seal = async body => key ? { version: 1, sealed: await ChatLock.seal(key, body) } : { version: 1, ...body };
  // The fork keeps copies of the pictures the agent showed, under its own name, so deleting the chat it came from
  // leaves the fork whole.
  const from = `ogpic://chat/${id}/`, to = `ogpic://chat/${copy.id}/`;
  if (messages.some(entry => typeof entry.content === 'string' && entry.content.includes(from))) {
   await window.openghost?.pictures?.copy(id, copy.id);
   messages = messages.map(entry => typeof entry.content === 'string' && entry.content.includes(from) ? { ...entry, content: entry.content.split(from).join(to) } : entry);
  }
  // What the mini chat spent is its chat's: the fork's count starts with its own.
  const mini = side.messages.map(entry => ({ ...entry, forked: true }));
  await this.queue(copy.id, async () => {
   await this.store.write(`chats/${copy.id}`, await seal({ messages, tokens }));
   if (notes.items.length) await this.store.write(`notes/${copy.id}`, await seal({ items: notes.items, next: notes.next }));
   if (mini.length) await this.store.write(`mini/${copy.id}`, await seal({ messages: mini, tokens: side.tokens, seen: side.seen, ...(side.effort ? { effort: side.effort } : {}) }));
   if (brief) await this.store.write(`record/${copy.id}`, await seal({ text: brief }));
  });
  if (key) {
   copy.lock = { ...chat.lock, title: await ChatLock.seal(key, { title }) };
   copy.title = '';
   this.keys.set(copy.id, key);
   this.titles.set(copy.id, title);
   if (chat.lock.pictures && window.openghost?.pictures) await window.openghost.pictures.unlock(copy.id, (await ChatLock.open(key, chat.lock.pictures)).key);
  }
  this.fresh.add(copy.id);
  this.chats.push(copy);
  this.changed();
  return copy;
 }

 // Sealed with the key the chat has when the save is asked for, so locking right after it loses nothing.
 saveDraft(id, text) {
  const chat = id === 'new' ? null : this.chat(id), key = chat?.lock ? this.keys.get(id) : null;
  if (id !== 'new' && (!chat || (chat.lock && !key))) return Promise.resolve();
  if (!text.trim()) return this.queue(id, () => this.store.remove(`drafts/${id}`));
  const body = { text };
  return this.queue(id, async () => this.store.write(`drafts/${id}`, key ? { version: 1, sealed: await ChatLock.seal(key, body) } : { version: 1, ...body }));
 }

 // Prepare every file before changing the password. Keep originals so a failed write can be rolled back.
 async passwordFiles(id, key, loaded) {
  const files = [];
  for (const kind of ['chats', 'mini', 'notes', 'drafts', 'record', 'permissions']) {
   const name = `${kind}/${id}`, before = await this.store.read(name);
   if (kind !== 'chats' && (!before || !!before.sealed === !!key)) continue;
   const body = kind === 'chats' && loaded ? loaded : before?.sealed ? await ChatLock.open(this.keys.get(id), before.sealed) : before || { messages: [], tokens: 0 };
   const after = key ? { version: 1, sealed: await ChatLock.seal(key, body) } : { version: 1, ...body };
   files.push({ name, before, after });
  }
  return files;
 }

 async restorePasswordFiles(files) {
  const restored = await Promise.allSettled(files.map(({ name, before }) => before ? this.store.write(name, before) : this.store.remove(name)));
  return restored.every(result => result.status === 'fulfilled');
 }

 // Writes of one chat's messages go out one after another, in the order they were asked for.
 // Record operations must report failures; older background saves keep their existing error handling.
 queue(id, job, strict = false) {
  const run = (this.writes.get(id) || Promise.resolve()).then(job), next = run.catch(() => {});
  this.writes.set(id, next);
  next.then(() => { if (this.writes.get(id) === next) this.writes.delete(id); });
  return strict ? run : next;
 }

 // Puts a password on a chat. The index takes the lock first and the messages are sealed after it,
 // so a crash in between leaves a protected chat whose messages are still readable, never sealed ones nothing can open.
 async protect(id, password, loaded = null) {
  const chat = this.chat(id);
  if (!chat || chat.lock) return false;
  const salt = ChatLock.salt(), key = await ChatLock.derive(password, salt);
  let done = false;
  await this.queue(id, async () => {
   const title = chat.title, applied = [];
   let lock = null, published = false;
   try {
    const files = await this.passwordFiles(id, key, loaded);
    if (!this.chat(id)) return;
    const raw = Library.pictureKey();
    lock = { version: 1, iterations: ChatLock.ITERATIONS, salt, title: await ChatLock.seal(key, { title }), pictures: await ChatLock.seal(key, { key: raw }) };
    chat.lock = lock;
    chat.title = '';
    // What the row showed of the chat (its last words and picture) is not kept in the clear either.
    chat.preview = null;
    await this.persist();
    published = true;
    for (const file of files) { await this.store.write(file.name, file.after); applied.push(file); }
    // The pictures the agent showed in the chat are sealed too, with the chat's key for them.
    await window.openghost?.pictures?.reseal(id, raw, true);
    done = true;
   } catch {
    const restored = await this.restorePasswordFiles(applied);
    if (lock && (!published || restored)) {
     delete chat.lock;
     chat.title = title;
     if (published) {
      try { await this.persist(); }
      catch { chat.lock = lock; chat.title = ''; }
     }
    }
    // If rollback itself failed, keep the password and key recoverable instead of orphaning sealed files.
    if (chat.lock) { this.keys.set(id, key); this.titles.set(id, title); }
   }
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
   // While the chat is open its pictures can be drawn and kept, sealed.
   if (window.openghost?.pictures) await window.openghost.pictures.unlock(id, await this.pictureKey(chat, key));
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
   const lock = chat.lock, title = chat.title, applied = [];
   try {
    const files = await this.passwordFiles(id, null, loaded);
    for (const file of files) { await this.store.write(file.name, file.after); applied.push(file); }
    // The pictures are opened back into the clear with the chat, before the lock and its key for them go.
    if (lock.pictures && window.openghost?.pictures) await window.openghost.pictures.reseal(id, (await ChatLock.open(this.keys.get(id), lock.pictures)).key, false);
    chat.title = this.titles.get(id) ?? '';
    delete chat.lock;
    await this.persist();
    this.forget(id);
    done = true;
   } catch {
    chat.lock = lock;
    chat.title = title;
    await this.restorePasswordFiles(applied);
   }
  });
  this.changed();
  return done;
 }
}

Library.pathKey = pathKey;
// A new key for a chat's pictures: 32 random bytes, in base64.
Library.pictureKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
Library.samePath = samePath;
window.Library = Library;
})();
