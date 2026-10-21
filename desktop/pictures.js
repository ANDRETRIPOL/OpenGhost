'use strict';

// Pictures the agent shows in a chat (the show_pictures tool): what it sees in the built-in browser, a picture from
// the internet, an image file on this computer. They are kept under the app's data, a folder for each chat, and the
// chat draws them from there by an address of their own, ogpic://chat/<chat>/<name>. A chat deleted for good takes
// its pictures with it.
//
// A chat with a password keeps its pictures sealed: each such chat has a key of its own for them, itself sealed with
// the chat's password in the index (library.js). While the chat is open the page hands that key here, and the pictures
// are sealed as they are kept and opened as they are drawn; locked, the key is forgotten and nothing of them is shown.
// No picture of such a chat is ever written in the clear.
const { app, nativeImage, net, protocol, session } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Media = require('./media');

const SCHEME = 'ogpic';
// The longest side a picture is kept at, and its quality: large enough to look closer at in the photo viewer.
const PICTURE = { side: 2048, quality: 88 };
const WAIT = { fetch: 20000 };
const MOST = 40 * 1024 * 1024;
const CHAT = /^[\w-]{1,100}$/;
const NAME = /^[a-f0-9]{20}\.(jpg|webp)$/;
const IMAGE_FILE = /\.(png|jpe?g|jfif|webp|gif|bmp|avif|tiff?)$/i;

const plain = message => Object.assign(new Error(message), { plain: true });
const folder = chat => path.join(app.getPath('userData'), 'pictures', chat);
// Sealed: this mark, the IV, the tag, then the picture under AES-256-GCM with the chat's key for pictures.
const SEALED = Buffer.from('OGPS1');
const keys = new Map();
const TYPES = { jpg: 'image/jpeg', webp: 'image/webp' };

function seal(key, data) {
 const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
 const body = Buffer.concat([cipher.update(data), cipher.final()]);
 return Buffer.concat([SEALED, iv, cipher.getAuthTag(), body]);
}

function open(key, data) {
 const at = SEALED.length, decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(at, at + 12));
 decipher.setAuthTag(data.subarray(at + 12, at + 28));
 return Buffer.concat([decipher.update(data.subarray(at + 28)), decipher.final()]);
}

const isSealed = data => data.length > SEALED.length && data.subarray(0, SEALED.length).equals(SEALED);
const keyOf = raw => {
 const key = Buffer.from(String(raw || ''), 'base64');
 if (key.length !== 32) throw plain('A key for pictures is 32 bytes');
 return key;
};

// Before the app is ready: the address is one the page can draw pictures from and fetch.
function register() {
 protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
}

function serve() {
 protocol.handle(SCHEME, async request => {
  const url = new URL(request.url), [, chat, name] = url.pathname.split('/');
  if (url.host !== 'chat' || !CHAT.test(chat || '') || !NAME.test(name || '')) return new Response('', { status: 404 });
  const file = path.join(folder(chat), name);
  const data = await fs.promises.readFile(file).catch(() => null);
  if (!data) return new Response('', { status: 404 });
  if (!isSealed(data)) return net.fetch(pathToFileURL(file).href);
  // A sealed picture is drawn only while its chat is open.
  const key = keys.get(chat);
  if (!key) return new Response('', { status: 404 });
  try {
   return new Response(open(key, data), { headers: { 'Content-Type': TYPES[name.split('.').pop()] || 'application/octet-stream' } });
  } catch {
   return new Response('', { status: 404 });
  }
 });
}

// The key for the pictures of a chat with a password, handed over while the chat is open, and forgotten once it is
// locked again.
function unlock(chat, raw) {
 if (CHAT.test(String(chat || ''))) keys.set(chat, keyOf(raw));
}

function lock(chat) {
 keys.delete(String(chat || ''));
}

// Every picture of a chat sealed with a key (a password put on), or opened with it (the password taken off).
async function reseal(chat, raw, sealing) {
 if (!CHAT.test(String(chat || ''))) return;
 const key = keyOf(raw), dir = folder(chat);
 const names = await fs.promises.readdir(dir).catch(() => []);
 for (const name of names.filter(name => NAME.test(name))) {
  const file = path.join(dir, name), data = await fs.promises.readFile(file);
  if (isSealed(data) === sealing) continue;
  const temp = `${file}.tmp`;
  await fs.promises.writeFile(temp, sealing ? seal(key, data) : open(key, data));
  await fs.promises.rename(temp, file);
 }
}

// A fork takes copies of the pictures of the chat it came from, so that deleting that chat leaves its own whole.
async function copy(from, to) {
 if (!CHAT.test(String(from || '')) || !CHAT.test(String(to || ''))) return;
 const names = (await fs.promises.readdir(folder(from)).catch(() => [])).filter(name => NAME.test(name));
 if (!names.length) return;
 await fs.promises.mkdir(folder(to), { recursive: true });
 for (const name of names) await fs.promises.copyFile(path.join(folder(from), name), path.join(folder(to), name));
}

// Keeps a picture for a chat: a native image (made smaller when it is larger than PICTURE.side) as JPEG, or a WebP
// already made by the decoder; sealed, for a chat with a password. Gives back its address and size.
async function keep(chat, picture, sealed = false) {
 if (!CHAT.test(String(chat || ''))) throw plain('This chat cannot keep pictures');
 if (sealed && !keys.has(chat)) throw plain('The chat is locked: its pictures cannot be kept now');
 let data, ext = 'jpg', { width, height } = picture;
 if (picture.image) {
  let image = picture.image;
  const size = image.getSize(), k = Math.min(1, PICTURE.side / Math.max(size.width, size.height));
  if (k < 1) image = image.resize({ width: Math.round(size.width * k), height: Math.round(size.height * k), quality: 'good' });
  ({ width, height } = image.getSize());
  data = image.toJPEG(PICTURE.quality);
 } else {
  data = Buffer.from(String(picture.webp).replace(/^data:image\/webp;base64,/, ''), 'base64');
  ext = 'webp';
 }
 const name = `${crypto.randomBytes(10).toString('hex')}.${ext}`;
 await fs.promises.mkdir(folder(chat), { recursive: true });
 await fs.promises.writeFile(path.join(folder(chat), name), sealed ? seal(keys.get(chat), data) : data);
 return { url: `${SCHEME}://chat/${chat}/${name}`, width, height };
}

// Bytes of an image: PNG and JPEG are read at once; the rest (WebP, AVIF, GIF…) through the app's own decoder.
async function decode(bytes, signal) {
 const image = nativeImage.createFromBuffer(bytes);
 if (!image.isEmpty()) return { image };
 const temp = path.join(app.getPath('temp'), `og-picture-${crypto.randomBytes(6).toString('hex')}`);
 await fs.promises.writeFile(temp, bytes);
 try {
  const seen = await Media.picture(temp, PICTURE.side, signal);
  return { webp: seen.url, width: seen.width, height: seen.height };
 } finally {
  fs.promises.rm(temp, { force: true }).catch(() => {});
 }
}

// A picture on the internet, fetched as the built-in browser would (with the user's sign-ins there), from the page it
// is on when that is known.
async function fromWeb(chat, address, page = '', signal, sealed = false) {
 const url = String(address || '').trim();
 if (!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) throw plain('Pass the full http or https address of the picture');
 let bytes;
 if (/^data:/i.test(url)) bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
 else {
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), WAIT.fetch);
  signal?.addEventListener('abort', () => stop.abort(), { once: true });
  try {
   const headers = page && /^https?:/i.test(page) ? { Referer: page } : {};
   const response = await session.fromPartition('persist:browser').fetch(url, { headers, signal: stop.signal });
   if (!response.ok) throw plain(`The picture could not be fetched: ${response.status}`);
   const type = response.headers.get('content-type') || '';
   if (type && !/^image\//i.test(type) && !/octet-stream/i.test(type)) throw plain(`That address is not a picture but ${type.split(';')[0]}`);
   bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
   if (error.plain) throw error;
   throw plain(stop.signal.aborted ? 'The picture took too long to come' : `The picture could not be fetched: ${error.message}`);
  } finally {
   clearTimeout(timer);
  }
 }
 if (bytes.length > MOST) throw plain('The picture is too big');
 return keep(chat, await decode(bytes, signal).catch(() => { throw plain('That is not a picture the app can show'); }), sealed);
}

// An image file on this computer.
async function fromFile(chat, file, signal, sealed = false) {
 const full = path.resolve(String(file || ''));
 if (!IMAGE_FILE.test(full)) throw plain('Only image files can be shown: png, jpg, webp, gif, bmp, avif, tiff');
 const stat = await fs.promises.stat(full).catch(() => null);
 if (!stat?.isFile()) throw plain(`There is no file ${full}`);
 if (stat.size > MOST) throw plain('The picture is too big');
 return keep(chat, await decode(await fs.promises.readFile(full), signal).catch(() => { throw plain('That file is not a picture the app can show'); }), sealed);
}

// Deleting a chat for good: its pictures go too.
function forget(chat) {
 lock(chat);
 if (CHAT.test(String(chat || ''))) return fs.promises.rm(folder(chat), { recursive: true, force: true }).catch(() => {});
 return Promise.resolve();
}

module.exports = { SCHEME, register, serve, keep, decode, fromWeb, fromFile, forget, unlock, lock, reseal, copy };
