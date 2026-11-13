(() => {
'use strict';

// Pictures of the user's own under the chat (Settings → Appearance → Chat picture, settings-appearance.js). The user
// adds as many as LIMIT.most, picks one for each theme, or none; until one is picked the chat looks as it always did.
// A picture is kept made fit for a screen (its longer side at most LIMIT.side) in the app's store on the disk, with a
// small square of it for the list in the settings. Under the chat it lies behind a veil of the chat's own ground, so
// the agent's words read on any photo; a picture comes in out of the ground and goes back into it.
const KEY = 'openghost.backdrop';
const INDEX = 'backdrops/index';
const LIMIT = { most: 12, side: 2560, thumb: 120, quality: 0.86, thumbQuality: 0.82 };
// How long a picture takes to go back into the ground before the next one comes out of it (styles.css has the time).
const SWAP = 360;

const root = document.documentElement;
const store = () => window.ChatStore;
const listeners = new Set();
let items = [];
let ready = null;
const urls = new Map();

function readPicks() {
 let saved = null;
 try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
 return { dark: typeof saved?.dark === 'string' ? saved.dark : '', light: typeof saved?.light === 'string' ? saved.light : '' };
}
let picks = readPicks();
const theme = () => root.dataset.theme === 'light' ? 'light' : 'dark';
const picked = (name = theme()) => items.some(item => item.id === picks[name]) ? picks[name] : '';

function tell() {
 for (const listener of listeners) listener();
}

async function load() {
 const data = await store()?.read(INDEX).catch(() => null);
 items = Array.isArray(data?.items) ? data.items.filter(item => item?.id && item.thumb) : [];
}

function save() {
 return store()?.write(INDEX, { version: 1, items });
}

// The picture itself, once read, as an address the page can show without copying it again.
async function urlOf(id) {
 if (urls.has(id)) return urls.get(id);
 const data = await store()?.read(`backdrops/${id}`).catch(() => null);
 const [head, body] = String(data?.data || '').split(',');
 if (!body) return '';
 const type = /data:([^;]+)/.exec(head)?.[1] || 'image/webp';
 const bytes = Uint8Array.from(atob(body), char => char.charCodeAt(0));
 const url = URL.createObjectURL(new Blob([bytes], { type }));
 urls.set(id, url);
 return url;
}

// What the chat shows: the picture picked for the theme on screen, or none. A change of picture goes through the ground.
let shown = '', turn = 0;
async function paint() {
 const id = picked(), mine = ++turn;
 if (id === shown) return;
 const had = shown;
 shown = id;
 if (had && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  root.dataset.picture = 'hidden';
  await new Promise(resolve => setTimeout(resolve, SWAP));
  if (mine !== turn) return;
 }
 if (!id) {
  delete root.dataset.picture;
  root.style.removeProperty('--chat-picture');
  return;
 }
 const url = await urlOf(id).catch(() => '');
 if (mine !== turn) return;
 if (!url) { shown = ''; delete root.dataset.picture; root.style.removeProperty('--chat-picture'); return; }
 // Laid in hidden first, under the whole veil, so the picture comes out of the ground and does not flash in.
 root.style.setProperty('--chat-picture', `url("${url}")`);
 root.dataset.picture = 'hidden';
 await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
 if (mine === turn) root.dataset.picture = 'shown';
}

// A file the user chose, made fit: the picture at most LIMIT.side on its longer side, and a square of it for the list.
async function fit(file) {
 const bitmap = await createImageBitmap(file);
 try {
  const scale = Math.min(1, LIMIT.side / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
  const big = Object.assign(document.createElement('canvas'), { width, height });
  big.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  const side = Math.min(bitmap.width, bitmap.height), small = Object.assign(document.createElement('canvas'), { width: LIMIT.thumb, height: LIMIT.thumb });
  small.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, LIMIT.thumb, LIMIT.thumb);
  return { data: big.toDataURL('image/webp', LIMIT.quality), thumb: small.toDataURL('image/webp', LIMIT.thumbQuality), width, height };
 } finally {
  bitmap.close?.();
 }
}

const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

window.Backdrops = {
 LIMIT,
 ready: () => ready,
 get items() { return items.map(item => ({ ...item })); },
 get theme() { return theme(); },
 get: (name = theme()) => picked(name),
 // Adds the pictures among `files`, as many as there is room for; tells how many were added and how many could not be read.
 async add(files) {
  await ready;
  let added = 0, bad = 0, fresh = '';
  for (const file of [...files]) {
   if (items.length >= LIMIT.most) break;
   if (!/^image\//.test(file.type || '')) { bad++; continue; }
   try {
    const made = await fit(file), key = id();
    await store().write(`backdrops/${key}`, { version: 1, data: made.data });
    items.push({ id: key, thumb: made.thumb, width: made.width, height: made.height, at: Date.now() });
    fresh = key;
    added++;
   } catch {
    bad++;
   }
  }
  if (added) await save();
  // The last one added is the one on the chat now.
  if (fresh) this.pick(fresh);
  else tell();
  return { added, bad, left: [...files].length - added - bad };
 },
 async remove(key) {
  await ready;
  if (!items.some(item => item.id === key)) return;
  items = items.filter(item => item.id !== key);
  let changed = false;
  for (const name of ['dark', 'light']) if (picks[name] === key) { picks[name] = ''; changed = true; }
  if (changed) { try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch {} }
  await save();
  await store()?.remove(`backdrops/${key}`).catch(() => {});
  const url = urls.get(key);
  urls.delete(key);
  await paint();
  if (url) URL.revokeObjectURL(url);
  tell();
 },
 // The picture for the theme on screen; '' for none.
 pick(key, name = theme()) {
  if (key && !items.some(item => item.id === key)) return;
  if (picks[name] === key) { tell(); return; }
  picks[name] = key;
  try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch {}
  paint();
  tell();
 },
 onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
 },
};

ready = load().then(paint, () => {});
window.Theme?.onChange(() => { paint(); tell(); });
// Another window of the app picked a picture, or added or removed one.
window.addEventListener('storage', event => {
 if (event.key !== KEY) return;
 picks = readPicks();
 paint();
 tell();
});
window.ChatStore?.onChange?.(key => {
 if (key !== INDEX) return;
 load().then(() => { paint(); tell(); });
});
})();
