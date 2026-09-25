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
  if (!this.timer) return;
  clearTimeout(this.timer);
  this.timer = 0;
  this.store.write(INDEX, { version: 1, folders: this.folders, chats: this.chats }).catch(() => {});
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
  const folder = this.folders.find(item => item.path === path);
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
  Object.assign(chat, changes);
  this.changed();
  return chat;
 }

 remove(id) {
  const index = this.chats.findIndex(chat => chat.id === id);
  if (index < 0) return;
  this.chats.splice(index, 1);
  this.changed();
  this.store.remove(`chats/${id}`).catch(() => {});
 }

 removeFolder(path) {
  const gone = this.chats.filter(chat => samePath(chat.folder, path));
  this.chats = this.chats.filter(chat => !samePath(chat.folder, path));
  this.folders = this.folders.filter(folder => !samePath(folder.path, path));
  this.changed();
  for (const chat of gone) this.store.remove(`chats/${chat.id}`).catch(() => {});
  return gone.map(chat => chat.id);
 }

 async conversation(id) {
  const data = await this.store.read(`chats/${id}`).catch(() => null);
  return { messages: Array.isArray(data?.messages) ? data.messages : [], tokens: Number(data?.tokens) || 0 };
 }

 saveMessages(id, messages, tokens = 0) {
  if (!this.chat(id)) return Promise.resolve();
  return this.store.write(`chats/${id}`, { version: 1, messages, tokens }).catch(() => {});
 }
}

window.Library = Library;
})();
