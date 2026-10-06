'use strict';

// A PDF, read with the PDF viewer built into Electron, the engine that shows PDFs in Chrome: fonts, encodings and
// compression are its job. The viewer opens the file in a helper window nobody sees and answers the messages of the page
// that embeds it, the way it does on any web page; that gives the text of the whole document.
//
// Text is not all a document holds: photos, charts, formulas and scanned pages are only there to be seen. The same
// viewer shows the pages, so the helper window also says how many pages there are, which of them look like pictures
// (judged on the small pictures the viewer draws for its side panel) and gives a picture of any page, shot off the
// viewer at a size of our own choosing.
const { BrowserWindow, nativeImage } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// How long a step may take (ms): the document to open, the viewer to answer, a page to be drawn. `knock` is how often
// the viewer is knocked at until it answers, `poll` how often a page is looked at while it is being drawn, `settle` how
// long one is given when there is nothing to check it against, `idle` how long the helper window is kept with no work.
const WAIT = { open: 45000, knock: 40, viewer: 20000, paint: 6000, poll: 45, settle: 700, idle: 45000 };
const MAX = 256 * 1024 * 1024;
const VIEWER = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai';
const NAME = /\.pdf$/i;
const HOST = path.join(__dirname, 'pdf.html');
// A page's picture: its longer side in pixels, how it is packed (JPEG: a shot of this size takes a sixth of a second,
// and WebP twice that), the room left round the page in the helper's window (the viewer's toolbar is `bar` tall), and
// how small a shot is made to be checked.
const PICTURE = { side: 1400, quality: 85, room: 48, bar: 56, check: 160 };
// How many pages one call may show, and how many go along with a document by themselves: with one that has text, the
// pages that look like pictures; with one that has none, its first pages.
const SHOW = { call: 6, text: 8, scan: 12 };
// What a page looks like, measured on its thumbnail. `colour` is the share of pixels that are not grey, `dense` the
// share of cells (`cols` by `rows` of them) that are mostly dark; either at its mark or above makes the page one with
// pictures on it: text alone is thin grey lines. A page with less `ink` than `blank` is empty. `pages` is how many pages
// are looked at. What stands in the same cells on most pages says nothing about any one of them: a letterhead, a band
// along the foot, a logo. In a document of at least `common.pages` pages, a cell in colour (`common.cell` of it) or dark
// on `common.share` of the pages is left out of the count, unless such cells make up more than `common.most` of the
// page, as on slides, which are pictures all over. A shot of a page is the page once the colours of its cells are
// within `match` of the thumbnail's; the viewer's ground round the pages is painted `ground` (alpha, red, green, blue),
// a colour no page is likely to be, so a page not drawn yet is never taken for one that is.
const LOOK = {
 pages: 400, cols: 9, rows: 12, tint: 48, colour: 0.02, dark: 0.3, dense: 0.03, blank: 0.0008,
 common: { pages: 4, cell: 0.12, share: 0.6, most: 0.3 },
 ground: 0xff00ff00, match: { mean: 0.06, most: 0.3 },
};
// Formulas come out of a PDF as scattered symbols. A text with at least `count` of them, making up `share` of its
// letters, is taken for one with formulas, which have to be seen.
const MATH = { count: 40, share: 0.012, greek: 0.3 };

// Runs inside the helper page. The viewer hears nothing until its channel is open, and the first message that gets through
// opens it, so that one repeats until the viewer says the document is loaded. Selecting everything and asking for the
// selection go down the same channel one after the other, so the answer is the whole text.
const PAGE = `(() => {
 let embed = null, heard = null, texted = null;
 addEventListener('message', event => heard?.(event));
 window.pdf = {
  open: (url, origin, knock) => new Promise(resolve => {
   embed?.remove();
   embed = document.createElement('embed');
   embed.type = 'application/pdf';
   embed.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
   const mine = embed, say = type => mine.postMessage({ type }, '*');
   const timer = setInterval(() => say('initialize'), knock);
   heard = event => {
    if (event.origin !== origin || embed !== mine) return;
    const data = event.data || {};
    if (data.type === 'documentLoaded') {
     clearInterval(timer);
     resolve(data.load_state === 'success' ? { ok: true } : { failed: true });
    } else if (data.type === 'passwordPrompted') {
     clearInterval(timer);
     resolve({ locked: true });
    } else if (data.type === 'getSelectedTextReply') {
     texted?.(String(data.selectedText || ''));
    }
   };
   embed.src = url;
   document.body.append(embed);
  }),
  // The document is put away: the helper page stands empty until the next one.
  close: () => {
   embed?.remove();
   embed = heard = texted = null;
  },
  text: () => new Promise(resolve => {
   texted = resolve;
   embed.postMessage({ type: 'selectAll' }, '*');
   embed.postMessage({ type: 'getSelectedText' }, '*');
  }),
 };
})()`;

// Runs inside the viewer's own page. The viewer is Chromium's and its insides are not ours to rely on: every answer is
// checked, and whatever is missing makes the document one whose pages can't be seen, never an error.
const VIEW = ground => `(() => {
 const GROUND = ${ground};
 const viewer = document.querySelector('pdf-viewer');
 const controller = viewer?.pluginController_, viewport = viewer?.viewport_, sizes = viewer?.documentDimensions?.pageDimensions;
 if (!controller?.requestThumbnail || !viewport?.setZoom || !viewport.goToPage || !viewport.getPageScreenRect || !Array.isArray(sizes) || !sizes.length) return null;
 // The side panel with its small pictures is put away: the page has the window's whole width.
 if ('sidenavCollapsed_' in viewer) viewer.sidenavCollapsed_ = true;
 if (GROUND && controller.setBackgroundColor) controller.setBackgroundColor(GROUND);
 // The small picture of a page the viewer draws for its side panel, measured: how much ink is on it, how much of it is
 // in colour, and how dark each cell of a coarse grid is.
 const measure = async (page, cols, rows, tint) => {
  const thumb = await controller.requestThumbnail(page), data = new Uint8ClampedArray(thumb.imageData), width = thumb.width, height = thumb.height;
  const sum = new Float64Array(cols * rows), count = new Uint32Array(cols * rows), tones = new Float64Array(cols * rows * 3), tinted = new Uint32Array(cols * rows);
  let ink = 0;
  for (let y = 0, i = 0; y < height; y++) {
   const row = Math.min(rows - 1, Math.floor(y * rows / height)) * cols;
   for (let x = 0; x < width; x++, i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], darkness = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    ink += darkness;
    const cell = row + Math.min(cols - 1, Math.floor(x * cols / width));
    if (Math.max(r, g, b) - Math.min(r, g, b) > tint) tinted[cell]++;
    sum[cell] += darkness;
    tones[cell * 3] += r;
    tones[cell * 3 + 1] += g;
    tones[cell * 3 + 2] += b;
    count[cell]++;
   }
  }
  const round = value => Math.round(value * 1000) / 1000, pixels = width * height || 1;
  // For each cell: how dark it is, and how much of it is in colour.
  const darks = Array.from(sum, (value, k) => count[k] ? round(value / count[k]) : 0), tints = Array.from(tinted, (value, k) => count[k] ? round(value / count[k]) : 0);
  // The colour of each cell, red, green and blue from 0 to 1: what a shot of the page is checked against.
  const colours = Array.from(tones, (value, k) => count[Math.floor(k / 3)] ? value / count[Math.floor(k / 3)] / 255 : 1);
  return { ink: ink / pixels, darks, tints, colours };
 };
 window.og = {
  info: () => ({ pages: sizes.length, sizes: sizes.map(size => [size.width, size.height]) }),
  async looks(limit, cols, rows, tint) {
   const out = [];
   for (let page = 0; page < Math.min(limit, sizes.length); page++) {
    const { ink, darks, tints } = await measure(page, cols, rows, tint);
    out.push({ ink, darks, tints });
   }
   return out;
  },
  colours: async (page, cols, rows, tint) => (await measure(page, cols, rows, tint)).colours,
  // Where a page lies in the window.
  place(page) {
   const rect = viewport.getPageScreenRect(page), plugin = viewer.shadowRoot?.querySelector('#plugin')?.getBoundingClientRect();
   return plugin ? { x: plugin.left + rect.x, y: plugin.top + rect.y, width: rect.width, height: rect.height, window: [innerWidth, innerHeight] } : null;
  },
  // Brings a page up whole at a zoom of our choosing and says where it lies. The zoom is first set to another one, so
  // what stands in the window until the page is drawn anew can't be taken for it.
  show(page, zoom) {
   viewport.setZoom(zoom * 0.3);
   viewport.setZoom(zoom);
   viewport.goToPage(page);
   return this.place(page);
  },
 };
 return window.og.info();
})()`;

const plain = message => Object.assign(new Error(message), { plain: true });
// An answer about the document itself: the helper window is as good as before and serves the next one.
const told = message => Object.assign(plain(message), { clean: true });
const isPdf = file => NAME.test(file);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// One document at a time: they all go through the same helper window.
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

const tidy = text => text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// Whether a text reads like one with formulas in it: many signs of mathematics, or letters the fonts gave no meaning to.
function mathy(text) {
 let signs = 0, greek = 0, letters = 0;
 for (const char of text) {
  const code = char.codePointAt(0);
  if (code <= 0x20) continue;
  letters++;
  if (code >= 0x370 && code <= 0x3ff) greek++;
  else if ((code >= 0x2200 && code <= 0x22ff) || (code >= 0x2a00 && code <= 0x2aff) || (code >= 0x27c0 && code <= 0x27ef) || (code >= 0x2070 && code <= 0x209f)
   || (code >= 0x1d400 && code <= 0x1d7ff) || (code >= 0xe000 && code <= 0xf8ff) || code === 0xfffd) signs++;
 }
 // A document written in Greek is not one of formulas.
 if (letters && greek / letters < MATH.greek) signs += greek;
 return signs >= MATH.count && signs / letters >= MATH.share;
}

// The colour of each cell of a shot, on the grid a thumbnail is measured on.
function coloursOf(image) {
 const { width, height } = image.getSize(), data = image.toBitmap(), { cols, rows } = LOOK;
 const tones = new Float64Array(cols * rows * 3), count = new Uint32Array(cols * rows);
 for (let y = 0, i = 0; y < height; y++) {
  const row = Math.min(rows - 1, Math.floor(y * rows / height)) * cols;
  for (let x = 0; x < width; x++, i += 4) {
   // The bitmap is blue, green, red.
   const cell = row + Math.min(cols - 1, Math.floor(x * cols / width));
   tones[cell * 3] += data[i + 2];
   tones[cell * 3 + 1] += data[i + 1];
   tones[cell * 3 + 2] += data[i];
   count[cell]++;
  }
 }
 return Array.from(tones, (value, k) => count[Math.floor(k / 3)] ? value / count[Math.floor(k / 3)] / 255 : 1);
}

// Which pages look like pictures, from what `looks` measured of each (counted from 0), and which are not empty.
function pictured(looks) {
 const cells = LOOK.cols * LOOK.rows, { common } = LOOK;
 const marked = (look, cell) => look.tints[cell] >= common.cell || look.darks[cell] >= LOOK.dark;
 // The cells that are the same on most pages: decoration, unless it is most of the page.
 let same = new Array(cells).fill(false);
 if (looks.length >= common.pages) {
  same = same.map((_, cell) => looks.filter(look => marked(look, cell)).length / looks.length >= common.share);
  if (same.filter(Boolean).length / cells > common.most) same.fill(false);
 }
 const filled = [], visual = [];
 looks.forEach((look, page) => {
  if (look.ink < LOOK.blank) return;
  filled.push(page);
  let colour = 0, dense = 0;
  for (let cell = 0; cell < cells; cell++) {
   if (same[cell]) continue;
   colour += look.tints[cell];
   if (look.darks[cell] >= LOOK.dark) dense++;
  }
  if (colour / cells >= LOOK.colour || dense / cells >= LOOK.dense) visual.push(page);
 });
 return { filled, visual };
}

// How far two rows of numbers are from one another: on average, and where they differ most.
function apart(a, b) {
 let total = 0, most = 0;
 for (let k = 0; k < a.length; k++) {
  const d = Math.abs(a[k] - (b[k] ?? 0));
  total += d;
  if (d > most) most = d;
 }
 return { mean: total / (a.length || 1), most };
}

// One helper window serves every document, one after another. A window made for each document took half a second to
// make and, one time in ten, five seconds more; a document opens in a standing one in a fifth of a second. The window
// draws off the screen, where its size is ours to choose and it draws whether anybody sees it or not. It is let go after
// WAIT.idle with no work, when a document went wrong in it, and when the app closes.
let helper = null, resting = 0;

function drop() {
 clearTimeout(resting);
 const gone = helper;
 helper = null;
 if (gone && !gone.win.isDestroyed()) gone.win.destroy();
}

async function room() {
 clearTimeout(resting);
 if (helper && !helper.win.isDestroyed()) return helper;
 const win = new BrowserWindow({
  show: false,
  width: 480,
  height: 640,
  skipTaskbar: true,
  focusable: false,
  webPreferences: { sandbox: true, contextIsolation: true, plugins: true, backgroundThrottling: false, spellcheck: false, offscreen: true },
 });
 const contents = win.webContents, mine = helper = { win, contents, attached: false, size: null };
 win.on('closed', () => { if (helper === mine) helper = null; });
 contents.on('render-process-gone', () => { if (helper === mine) drop(); });
 contents.setAudioMuted(true);
 contents.setWindowOpenHandler(() => ({ action: 'deny' }));
 contents.on('will-navigate', event => event.preventDefault());
 contents.setFrameRate(20);
 try {
  // The viewer opens a file from the disk only for a page that came from the disk itself, so the helper page is a file too.
  await win.loadFile(HOST);
  await contents.executeJavaScript(PAGE);
 } catch (error) {
  if (helper === mine) drop();
  throw error;
 }
 return mine;
}

// A document open in the helper window for as long as `work` takes. `see`: its pages are to be shot, so the window takes
// orders from the debugger. The clock is wound again at every step: a long document has the time it needs, a stuck one
// is let go.
function session(file, signal, see, work) {
 return new Promise((resolve, reject) => {
  const name = path.basename(file);
  let timer = 0, over = false, mine = null;
  const done = (error, value) => {
   if (over) return;
   over = true;
   clearTimeout(timer);
   signal.removeEventListener('abort', abort);
   // A window in which something went wrong, or was stopped midway, is not used again; one that is gone already, or
   // has been replaced, is left alone. Otherwise the document is put away and the window waits for the next.
   const gone = !!mine && helper !== mine;
   if ((error && !error.clean) || !mine) { if (!gone) drop(); }
   else if (!gone) {
    mine.contents.executeJavaScript('pdf.close()').catch(() => {});
    resting = setTimeout(drop, WAIT.idle);
   }
   if (error) reject(error);
   else resolve(value);
  };
  const abort = () => done(plain('Stopped by the user'));
  const wind = (ms = WAIT.open) => {
   clearTimeout(timer);
   timer = setTimeout(() => done(plain(`${name} took too long to open`)), ms);
  };
  if (signal.aborted) { abort(); return; }
  signal.addEventListener('abort', abort, { once: true });
  wind();
  let contents = null;
  const cdp = (method, params) => contents.debugger.sendCommand(method, params);
  let frame = null;

  const doc = {
   name,
   get over() { return over; },
   // Opens the document, or opens it anew: a fresh one has nothing selected in it.
   async open() {
    wind();
    frame = null;
    const answer = await contents.executeJavaScript(`pdf.open(${JSON.stringify(pathToFileURL(file).href)}, ${JSON.stringify(VIEWER)}, ${WAIT.knock})`);
    if (answer.locked) throw told(`${name} is protected with a password, so it can't be read`);
    if (answer.failed) throw told(`${name} can't be opened as a PDF, the file may be damaged`);
   },
   // The viewer's own page, with our helpers in it: how many pages the document has and how large each is. Null when the
   // viewer is not the one we know.
   async view() {
    wind(WAIT.viewer);
    try {
     frame = contents.mainFrame.framesInSubtree.find(item => item.url.startsWith(VIEWER)) || null;
     const info = frame ? await frame.executeJavaScript(VIEW(see ? LOOK.ground : 0)) : null;
     if (!info?.pages) frame = null;
     return frame ? info : null;
    } catch {
     frame = null;
     return null;
    } finally {
     if (!over) wind();
    }
   },
   async ask(code) {
    if (!frame) return null;
    try { return await frame.executeJavaScript(code); } catch { return null; }
   },
   async text() {
    wind();
    return tidy(await contents.executeJavaScript('pdf.text()'));
   },
   // What each page looks like, the first LOOK.pages of them.
   async looks() {
    wind();
    const { pages, cols, rows, tint } = LOOK;
    return await this.ask(`og.looks(${pages}, ${cols}, ${rows}, ${tint})`) || [];
   },
   // A picture of one page (counted from 0), `[width, height]` being its size as the viewer gives it. Null when the
   // page can't be brought up whole.
   async picture(page, [width, height]) {
    wind();
    const zoom = PICTURE.side / Math.max(width, height);
    const want = { width: Math.ceil(width * zoom) + PICTURE.room * 2, height: Math.ceil(height * zoom) + PICTURE.bar + PICTURE.room * 2 };
    if (!mine.size || mine.size.width !== want.width || mine.size.height !== want.height) {
     await cdp('Emulation.setDeviceMetricsOverride', { ...want, deviceScaleFactor: 1, mobile: false });
     mine.size = want;
    }
    const { cols, rows, tint } = LOOK, started = Date.now();
    const late = () => Date.now() - started > WAIT.paint;
    const whole = rect => rect.width > 8 && rect.height > 8 && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= rect.window[0] + 1 && rect.y + rect.height <= rect.window[1] + 1;
    const cells = await this.ask(`og.colours(${page}, ${cols}, ${rows}, ${tint})`);
    // The window may still be taking its new size: the page is brought up again until it lies whole in it.
    let rect = await this.ask(`og.show(${page}, ${zoom})`);
    while (rect && !whole(rect) && !late()) {
     await sleep(WAIT.poll);
     if (over) throw plain('Stopped by the user');
     rect = await this.ask(`og.show(${page}, ${zoom})`);
    }
    if (!rect || !whole(rect)) return null;
    // A hair inside the page's edge, so nothing of what lies round the page gets into the picture.
    const clip = { x: Math.ceil(rect.x) + 1, y: Math.ceil(rect.y) + 1, width: Math.floor(rect.width) - 2, height: Math.floor(rect.height) - 2, scale: 1 };
    // The viewer draws a page a moment after it is told to. A shot is the page once it looks like the page's own small
    // picture; with none to check against, the page is given a moment and taken as it is.
    if (!cells) await sleep(WAIT.settle);
    let shot = null;
    for (;;) {
     if (over) throw plain('Stopped by the user');
     shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: PICTURE.quality, clip });
     if (!cells) break;
     const seen = apart(cells, coloursOf(nativeImage.createFromBuffer(Buffer.from(shot.data, 'base64')).resize({ width: PICTURE.check })));
     if ((seen.mean <= LOOK.match.mean && seen.most <= LOOK.match.most) || late()) break;
     await sleep(WAIT.poll);
    }
    return { page: page + 1, url: `data:image/jpeg;base64,${shot.data}`, width: clip.width, height: clip.height };
   },
  };

  room()
   .then(found => {
    if (over) return null;
    mine = found;
    contents = found.contents;
    if (!see || found.attached) return null;
    contents.debugger.attach('1.3');
    found.attached = true;
    return cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1400, deviceScaleFactor: 1, mobile: false });
   })
   .then(() => over ? null : doc.open())
   .then(() => over ? null : work(doc))
   .then(value => done(null, value), error => done(error));
 });
}

// Pictures of the pages asked for (counted from 0), in their order, of a document just opened anew.
async function shoot(doc, info, pages) {
 const out = [];
 for (const page of pages) {
  const picture = await doc.picture(page, info.sizes[page]);
  if (picture) out.push(picture);
 }
 return out;
}

// The text of every page, in reading order. Empty for a PDF with no text in it, such as scanned pages.
function text(file, signal = new AbortController().signal) {
 return queued(async () => {
  await check(file);
  return session(file, signal, false, doc => doc.text());
 });
}

// The text and how many pages there are; with `pictures`, also pictures of the pages that have to be seen: those that
// look like pictures, the first ones of a document with formulas, or the first ones of a document with no text at all.
// `seen` names every page that looks like a picture, shown or not (pages are counted from 1 in what is given back).
function study(file, signal = new AbortController().signal, { pictures = false } = {}) {
 return queued(async () => {
  await check(file);
  return session(file, signal, pictures, async doc => {
   const info = await doc.view();
   const looks = pictures && info ? await doc.looks() : [];
   const found = await doc.text();
   const out = { text: found, pages: info?.pages || 0, pictures: [], seen: [], formulas: false };
   if (!pictures || !info) return out;
   const { filled, visual } = pictured(looks);
   out.seen = visual.map(page => page + 1);
   out.formulas = !!found && mathy(found);
   let chosen = visual.slice(0, SHOW.text);
   if (!found) chosen = filled.slice(0, SHOW.scan);
   else if (out.formulas) chosen = [...new Set([...filled.slice(0, SHOW.text), ...visual])].sort((a, b) => a - b).slice(0, SHOW.text);
   if (!chosen.length) return out;
   // The text was got by selecting everything, and a selection shows; the pages are shot from the document opened anew.
   await doc.open();
   if (await doc.view()) out.pictures = await shoot(doc, info, chosen);
   return out;
  });
 });
}

// Which pages a request names: "3", "1-4, 9", [2, 5]. Counted from 1 there, from 0 here.
function wanted(pages, count) {
 const out = new Set();
 const add = (from, to = from) => {
  for (let page = Math.max(1, Math.min(from, to)); page <= Math.min(count, Math.max(from, to)); page++) out.add(page - 1);
 };
 for (const part of Array.isArray(pages) ? pages : String(pages ?? '').split(/[,;\s]+/)) {
  const range = /^(\d+)\s*(?:-|–|\.\.)\s*(\d+)$/.exec(String(part).trim());
  if (range) add(+range[1], +range[2]);
  else if (/^\d+$/.test(String(part).trim())) add(+String(part).trim());
 }
 return [...out].sort((a, b) => a - b);
}

// Pages of a document as pictures, for whoever asks to see them.
function look(file, pages, signal = new AbortController().signal) {
 return queued(async () => {
  await check(file);
  return session(file, signal, true, async doc => {
   const info = await doc.view();
   if (!info) throw told(`The pages of ${doc.name} can't be shown as pictures on this computer`);
   const all = wanted(pages, info.pages);
   if (!all.length) throw told(`${doc.name} has ${info.pages} ${info.pages === 1 ? 'page' : 'pages'}. Name the pages to see, counted from 1, like "3" or "1-4, 9"`);
   const shown = await shoot(doc, info, all.slice(0, SHOW.call));
   if (!shown.length) throw plain(`The pages of ${doc.name} could not be drawn`);
   return { count: info.pages, pages: shown, limited: all.length > SHOW.call ? SHOW.call : 0 };
  });
 });
}

// Readings the page asked for and nobody can stop but the app closing.
const reading = new Set();

// For the page: a PDF by its place on the disk, or by its bytes when it has none (pasted, or dragged from another app).
// Answers with the text, or with why there is none; with `pictures`, also with what `study` finds to be seen.
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
  const found = await study(file, controller.signal, { pictures: !!source?.pictures });
  const seen = { pages: found.pages, pictures: found.pictures, seen: found.seen, formulas: found.formulas };
  return found.text ? { text: found.text, ...seen } : { text: '', reason: 'empty', ...seen };
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
 drop();
}

module.exports = { text, study, look, read, isPdf, cancelAll, SHOW };
