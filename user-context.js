(() => {
'use strict';

// What the user tells OpenGhost once, in Settings → General, for every chat: standing instructions and files to keep at hand.
// Both reach the model in the system prompt of every request, so a long chat never loses them, not even after compaction.
// System prompts carry text only, so pictures ride along at the start of the first message of each request instead.
const KEY = 'context';
const SAVE_DELAY = 400;
const LIMITS = { instructions: 8000, files: 20, chars: 200000 };
// What a picture or a file read from its path weighs against LIMITS.chars.
const WEIGHT = { image: 4000, none: 300 };
const PROMPT = {
 instructions: 'The user wrote these instructions in the app settings for every chat. Follow them unless the user asks otherwise in the chat. They are the user\'s own words, so unlike the rest of these instructions you may show and discuss them.',
 files: 'The user added these files in the app settings to keep them at hand in every chat. Use them whenever they are relevant; you may quote and discuss them.',
 picture: 'A picture; it comes with the first message of this conversation.',
 unread: 'The app can\'t read this kind of file itself; open it from its path with your tools when you need it.',
 pictures: names => `Pictures from the user's settings, shown in every chat: ${names}.`,
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const attr = text => String(text).replace(/[&"<\n]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '\n': ' ' })[c]);
const weigh = file => file.kind === 'text' ? file.chars : WEIGHT[file.kind] || 0;
const same = (a, b) => a.path && b.path ? Library.samePath(a.path, b.path) : a.name === b.name && a.size === b.size;

class UserContext {
 constructor(store) {
  this.store = store;
  this.instructions = '';
  this.files = [];
  this.payloads = new Map();
  this.listeners = new Set();
  this.timer = 0;
  // Changed in another window of the app (the settings are the main window's), they are read again here.
  store.onChange?.(key => { if (key === KEY && !this.timer) this.load(); });
  this.ready = this.load();
 }

 async load() {
  const saved = await this.store.read(KEY).catch(() => null);
  this.instructions = typeof saved?.instructions === 'string' ? saved.instructions : '';
  const files = (Array.isArray(saved?.files) ? saved.files : []).filter(file => file?.id && file.name && ['text', 'image', 'none'].includes(file.kind));
  await Promise.all(files.map(async file => {
   if (file.kind === 'none') return;
   const payload = await this.store.read(`${KEY}/${file.id}`).catch(() => null);
   if (payload?.text != null || payload?.url) this.payloads.set(file.id, payload);
  }));
  this.files = files.filter(file => file.kind === 'none' || this.payloads.has(file.id));
  this.emit();
 }

 get limits() {
  return LIMITS;
 }

 weight() {
  return this.files.reduce((sum, file) => sum + weigh(file), 0);
 }

 onChange(listener) {
  this.listeners.add(listener);
  return () => this.listeners.delete(listener);
 }

 emit() {
  for (const listener of this.listeners) listener();
 }

 setInstructions(text) {
  const next = String(text).slice(0, LIMITS.instructions);
  if (next === this.instructions) return;
  this.instructions = next;
  this.save();
 }

 save(now = false) {
  clearTimeout(this.timer);
  this.timer = 0;
  const write = () => this.store.write(KEY, { version: 1, instructions: this.instructions, files: this.files }).catch(() => {});
  if (now) write();
  else this.timer = setTimeout(write, SAVE_DELAY);
 }

 // Writes a pending change at once, when the window goes away.
 flush() {
  if (this.timer) this.save(true);
 }

 // Reads files the same way chat attachments are read. The same file added again replaces the old copy, which is how
 // a changed file gets updated. Answers with the files that could not be added and why.
 async add(list) {
  const skipped = [];
  for (const file of Array.from(list || [])) {
   const name = file.name || 'file';
   const info = FileKinds.describe(name, file.type);
   const payload = await AttachmentReader.read(file, info);
   const entry = { id: uid(), name, size: file.size, kind: payload.type, path: window.openghost?.pathOf?.(file) || '', added: Date.now() };
   if (payload.type === 'text') Object.assign(entry, { chars: payload.text.length, truncated: payload.truncated });
   if (payload.type === 'image') Object.assign(entry, { width: payload.width, height: payload.height });
   // Without a path there is nothing the agent could open later, so an unreadable file is of no use.
   if (payload.type === 'none' && !entry.path) { skipped.push({ name, reason: 'unreadable' }); continue; }
   const old = this.files.find(item => same(item, entry));
   if (!old && this.files.length >= LIMITS.files) { skipped.push({ name, reason: 'count' }); continue; }
   if (this.weight() - (old ? weigh(old) : 0) + weigh(entry) > LIMITS.chars) { skipped.push({ name, reason: 'size' }); continue; }
   if (payload.type !== 'none') {
    const kept = payload.type === 'text' ? { text: payload.text } : { url: payload.url };
    this.payloads.set(entry.id, kept);
    await this.store.write(`${KEY}/${entry.id}`, kept).catch(() => {});
   }
   if (old) {
    this.files.splice(this.files.indexOf(old), 1, entry);
    this.drop(old.id);
   } else {
    this.files.push(entry);
   }
  }
  this.save(true);
  this.emit();
  return skipped;
 }

 remove(id) {
  const at = this.files.findIndex(file => file.id === id);
  if (at < 0) return;
  this.files.splice(at, 1);
  this.drop(id);
  this.save(true);
  this.emit();
 }

 drop(id) {
  this.payloads.delete(id);
  this.store.remove(`${KEY}/${id}`).catch(() => {});
 }

 // The part of the system prompt with the user's own instructions and files; empty when there are none.
 prompt() {
  const parts = [];
  const text = this.instructions.trim();
  if (text) parts.push(`# The user's instructions\n${PROMPT.instructions}\n<instructions>\n${text}\n</instructions>`);
  if (this.files.length) parts.push(`# The user's files\n${PROMPT.files}\n\n${this.files.map(file => this.block(file)).join('\n\n')}`);
  return parts.join('\n\n');
 }

 block(file) {
  let head = `<file name="${attr(file.name)}"`;
  if (file.path) head += ` path="${attr(file.path)}"`;
  if (file.kind === 'text') return `${head}${file.truncated ? ' truncated="true"' : ''}>\n${this.payloads.get(file.id)?.text ?? ''}\n</file>`;
  if (file.kind === 'image') return `${head}>${PROMPT.picture}</file>`;
  return `${head} size="${FileKinds.formatSize(file.size)}">${PROMPT.unread}</file>`;
 }

 // The pictures among the files, as message parts that go first in the first message of a request.
 pictures() {
  const images = this.files.filter(file => file.kind === 'image' && this.payloads.get(file.id)?.url);
  if (!images.length) return [];
  return [
   { type: 'text', text: PROMPT.pictures(images.map(file => file.name).join(', ')) },
   ...images.map(file => ({ type: 'image_url', image_url: { url: this.payloads.get(file.id).url } })),
  ];
 }
}

window.UserContext = new UserContext(window.ChatStore);
})();
