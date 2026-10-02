'use strict';

// The text of a PDF, read with the PDF viewer built into Electron, the engine that shows PDFs in Chrome: fonts, encodings
// and compression are its job. The viewer opens the file in a hidden helper window and answers the messages of the page
// that embeds it, the way it does on any web page.
const { BrowserWindow } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WAIT = { open: 45000, knock: 200 };
const MAX = 256 * 1024 * 1024;
const VIEWER = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai';
const NAME = /\.pdf$/i;
const HOST = path.join(__dirname, 'pdf.html');

// Runs inside the helper page. The viewer hears nothing until its channel is open, and the first message that gets through
// opens it, so that one repeats until the viewer says the document is loaded. Selecting everything and asking for the
// selection go down the same channel one after the other, so the answer is the whole text.
const PAGE = `(() => {
 window.pdf = (url, origin, knock) => new Promise(resolve => {
  const embed = document.createElement('embed');
  embed.type = 'application/pdf';
  embed.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  const say = type => embed.postMessage({ type }, '*');
  const timer = setInterval(() => say('initialize'), knock);
  addEventListener('message', event => {
   if (event.origin !== origin) return;
   const data = event.data || {};
   if (data.type === 'documentLoaded') {
    clearInterval(timer);
    if (data.load_state !== 'success') { resolve({ failed: true }); return; }
    say('selectAll');
    say('getSelectedText');
   } else if (data.type === 'getSelectedTextReply') {
    resolve({ text: String(data.selectedText || '') });
   } else if (data.type === 'passwordPrompted') {
    clearInterval(timer);
    resolve({ locked: true });
   }
  });
  embed.src = url;
  document.body.append(embed);
 });
})()`;

const plain = message => Object.assign(new Error(message), { plain: true });
const isPdf = file => NAME.test(file);

// One document at a time: each takes a window of its own with the viewer in it.
let last = Promise.resolve();
function queued(work) {
 const next = last.catch(() => {}).then(work);
 last = next;
 return next;
}

// Whether the file is a PDF at all, before a window is opened for it.
async function check(file) {
 const info = await fs.promises.stat(file).catch(error => { throw Object.assign(error, { file }); });
 const name = path.basename(file);
 if (info.isDirectory()) throw plain(`${file} is a folder`);
 if (info.size > MAX) throw plain(`${name} is too big to read`);
 const handle = await fs.promises.open(file, 'r');
 try {
  const head = Buffer.alloc(1024), { bytesRead } = await handle.read(head, 0, head.length, 0);
  if (!head.subarray(0, bytesRead).includes('%PDF-')) throw plain(`${name} is not a PDF, whatever its name says`);
 } finally {
  await handle.close();
 }
}

function open(file, signal) {
 return new Promise((resolve, reject) => {
  const win = new BrowserWindow({
   show: false,
   width: 480,
   height: 640,
   skipTaskbar: true,
   focusable: false,
   webPreferences: { sandbox: true, contextIsolation: true, plugins: true, backgroundThrottling: false, spellcheck: false },
  });
  const contents = win.webContents;
  const done = (error, value) => {
   clearTimeout(timer);
   signal.removeEventListener('abort', abort);
   if (!win.isDestroyed()) win.destroy();
   if (error) reject(error);
   else resolve(value);
  };
  const abort = () => done(plain('Stopped by the user'));
  const timer = setTimeout(() => done(plain(`${path.basename(file)} took too long to open`)), WAIT.open);
  if (signal.aborted) { abort(); return; }
  signal.addEventListener('abort', abort, { once: true });
  contents.setAudioMuted(true);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', event => event.preventDefault());
  // The viewer opens a file from the disk only for a page that came from the disk itself, so the helper page is a file too.
  win.loadFile(HOST)
   .then(() => contents.executeJavaScript(PAGE))
   .then(() => contents.executeJavaScript(`pdf(${JSON.stringify(pathToFileURL(file).href)}, ${JSON.stringify(VIEWER)}, ${WAIT.knock})`))
   .then(answer => done(null, answer), error => done(error));
 });
}

const tidy = text => text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// The text of every page, in reading order. Empty for a PDF with no text in it, such as scanned pages.
function text(file, signal = new AbortController().signal) {
 return queued(async () => {
  await check(file);
  const name = path.basename(file), answer = await open(file, signal);
  if (answer.locked) throw plain(`${name} is protected with a password, so it can't be read`);
  if (answer.failed) throw plain(`${name} can't be opened as a PDF, the file may be damaged`);
  return tidy(answer.text);
 });
}

// Readings the page asked for and nobody can stop but the app closing.
const reading = new Set();

// For the page: a PDF by its place on the disk, or by its bytes when it has none (pasted, or dragged from another app).
// Answers with the text, or with why there is none.
async function read(source) {
 let file = typeof source?.path === 'string' && path.isAbsolute(source.path) ? source.path : '', temp = '';
 const controller = new AbortController();
 reading.add(controller);
 try {
  if (!file) {
   if (!(source?.data instanceof ArrayBuffer) || source.data.byteLength > MAX) return { text: '', reason: 'unreadable' };
   temp = file = path.join(os.tmpdir(), `openghost-${crypto.randomUUID()}.pdf`);
   await fs.promises.writeFile(temp, Buffer.from(source.data));
  }
  const found = await text(file, controller.signal);
  return found ? { text: found } : { text: '', reason: 'empty' };
 } catch (error) {
  return { text: '', reason: 'unreadable', error: error.plain ? error.message : '' };
 } finally {
  reading.delete(controller);
  if (temp) await fs.promises.rm(temp, { force: true }).catch(() => {});
 }
}

// The app is closing: no helper window stays behind to keep it open.
function cancelAll() {
 for (const controller of reading) controller.abort();
}

module.exports = { text, read, isPdf, cancelAll };
