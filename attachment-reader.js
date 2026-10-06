(() => {
'use strict';

const IMAGE = { side: 2560, bytes: 6e6, quality: 0.9 };
// The frame on a video's card: sharp enough for the photo stack of a sent message. `flat` is how little a frame's
// brightness may vary before it counts as one colour, like the black a video fades in from; `tries` and `retry` give a
// frame still on its way after a seek that long to arrive.
const VIDEO = { side: 768, quality: 0.82, wait: 8000, probe: 24, flat: 6, tries: 15, retry: 40 };
const TEXT = { bytes: 20e6, chars: 400000, sniff: 8192, control: 0.01 };
const OFFICE = new Set(['docx', 'docm', 'pptx', 'xlsx', 'xlsm', 'odt', 'ods', 'odp']);
const SHEET_ROWS = 5000;
const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const unxml = s => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => e[0] !== '#' ? XML_ENTITIES[e] ?? m
 : String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)));
const strip = xml => unxml(xml.replace(/<[^>]+>/g, ''));
const tidy = text => text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const byNumber = (a, b) => +a.match(/(\d+)\.xml$/)[1] - +b.match(/(\d+)\.xml$/)[1];

function sniffImage(bytes) {
 if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
 if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
 if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
 if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
 return '';
}

function dataUrl(blob, type) {
 return new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(type && blob.type !== type ? new Blob([blob], { type }) : blob);
 });
}

async function readImage(file) {
 let bitmap;
 try { bitmap = await createImageBitmap(file); } catch { return null; }
 const { width, height } = bitmap;
 const type = sniffImage(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
 const scale = Math.min(1, IMAGE.side / Math.max(width, height));
 if (type && scale === 1 && file.size <= IMAGE.bytes) {
  bitmap.close();
  return { type: 'image', url: await dataUrl(file, type), width, height };
 }
 const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
 const canvas = new OffscreenCanvas(w, h);
 const ctx = canvas.getContext('2d');
 ctx.imageSmoothingQuality = 'high';
 ctx.drawImage(bitmap, 0, 0, w, h);
 bitmap.close();
 const blob = await canvas.convertToBlob({ type: 'image/webp', quality: IMAGE.quality });
 return { type: 'image', url: await dataUrl(blob, 'image/webp'), width, height };
}

// Waits for one event of a video after starting what fires it; an error or a stall ends the wait.
function once(video, name, start) {
 return new Promise((resolve, reject) => {
  const ok = () => done(), fail = () => done(new Error('media'));
  const timer = setTimeout(() => done(new Error('stalled')), VIDEO.wait);
  const done = error => {
   clearTimeout(timer);
   video.removeEventListener(name, ok);
   video.removeEventListener('error', fail);
   if (error) reject(error);
   else resolve();
  };
  video.addEventListener(name, ok);
  video.addEventListener('error', fail);
  start();
 });
}

const seek = (video, time) => once(video, 'seeked', () => { video.currentTime = time; });

// How a drawn frame looks: whether anything was painted at all, and whether it is one colour.
function look(canvas) {
 const probe = new OffscreenCanvas(VIDEO.probe, VIDEO.probe), ctx = probe.getContext('2d', { willReadFrequently: true });
 ctx.drawImage(canvas, 0, 0, VIDEO.probe, VIDEO.probe);
 const data = ctx.getImageData(0, 0, VIDEO.probe, VIDEO.probe).data;
 let sum = 0, square = 0, alpha = 0;
 for (let i = 0; i < data.length; i += 4) {
  const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  sum += y;
  square += y * y;
  alpha = Math.max(alpha, data[i + 3]);
 }
 const n = data.length / 4, mean = sum / n;
 return { painted: alpha > 0, flat: Math.sqrt(Math.max(0, square / n - mean * mean)) < VIDEO.flat };
}

// Draws the frame at `time`. Right after a seek the frame can still be on its way, and a draw then paints nothing, so it
// is tried again for a moment.
async function draw(video, time, ctx) {
 await seek(video, time);
 const { canvas } = ctx;
 for (let k = 0; k < VIDEO.tries; k++) {
  if (video.readyState >= video.HAVE_CURRENT_DATA) {
   ctx.clearRect(0, 0, canvas.width, canvas.height);
   ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
   const seen = look(canvas);
   if (seen.painted) return seen;
  }
  await new Promise(resolve => setTimeout(resolve, VIDEO.retry));
 }
 return { painted: false, flat: true };
}

const encode = async canvas => dataUrl(await canvas.convertToBlob({ type: 'image/webp', quality: VIDEO.quality }));

// A frame a little way in, past a fade from black: while the frame is one colour, the next try goes further, and a video
// that stays one colour shows the last of them. With no frame drawn at all, the card has none.
async function poster(video, duration) {
 const { videoWidth: width, videoHeight: height } = video, scale = Math.min(1, VIDEO.side / Math.max(width, height));
 const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
 const ctx = canvas.getContext('2d');
 ctx.imageSmoothingQuality = 'high';
 let kept = null;
 for (const time of duration > 0 ? [Math.min(1, duration * 0.25), duration * 0.33, duration * 0.5] : [0]) {
  const seen = await draw(video, time, ctx);
  if (!seen.painted) continue;
  if (!seen.flat) return encode(canvas);
  kept ||= new OffscreenCanvas(canvas.width, canvas.height);
  kept.getContext('2d').drawImage(canvas, 0, 0);
 }
 return kept ? encode(kept) : '';
}

// A video comes as its place on the disk, for the agent to watch, with its length, its size and a frame for its card.
// One the built-in decoder can't read still comes with its place; only its card has no frame then.
async function readVideo(file) {
 const out = { type: 'video', path: window.openghost?.pathOf?.(file) || '', duration: 0, width: 0, height: 0, poster: '' };
 const url = URL.createObjectURL(file), video = document.createElement('video');
 video.muted = true;
 video.preload = 'auto';
 try {
  await once(video, 'loadedmetadata', () => { video.src = url; });
  // Recorded WebM often has no length in its header until its end is reached once.
  if (!Number.isFinite(video.duration)) await seek(video, 1e9);
  out.duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (video.videoWidth && video.videoHeight) {
   Object.assign(out, { width: video.videoWidth, height: video.videoHeight });
   out.poster = await poster(video, out.duration);
  }
 } catch {}
 video.removeAttribute('src');
 video.load();
 URL.revokeObjectURL(url);
 return out;
}

function looksBinary(bytes) {
 const head = bytes.subarray(0, TEXT.sniff);
 let control = 0;
 for (const b of head) {
  if (b === 0) return true;
  if (b < 9 || (b > 13 && b < 32 && b !== 27)) control++;
 }
 return control > head.length * TEXT.control;
}

function decodeText(bytes) {
 if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
 if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
 if (looksBinary(bytes)) return null;
 try {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
 } catch {
  return new TextDecoder('windows-1251').decode(bytes);
 }
}

async function inflate(data) {
 const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(bytes, wanted) {
 const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), names = new TextDecoder();
 let end = -1;
 for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
 if (end < 0) return null;
 const files = new Map();
 let at = view.getUint32(end + 16, true);
 for (let k = view.getUint16(end + 10, true); k > 0 && at + 46 <= bytes.length && view.getUint32(at, true) === 0x02014b50; k--) {
  const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true), local = view.getUint32(at + 42, true);
  const nameLength = view.getUint16(at + 28, true), skip = nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLength));
  at += 46 + skip;
  if (!wanted(name) || (method !== 0 && method !== 8)) continue;
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const raw = bytes.subarray(start, start + size);
  files.set(name, new TextDecoder().decode(method === 8 ? await inflate(raw) : raw));
 }
 return files;
}

function columnIndex(ref) {
 let n = 0;
 for (const c of ref.replace(/\d+$/, '')) n = n * 26 + c.charCodeAt(0) - 64;
 return n - 1;
}

function sheetText(xml, shared) {
 const rows = [];
 for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
  if (rows.length >= SHEET_ROWS) break;
  const cells = [];
  for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
   const attrs = cell[1], body = cell[2] || '';
   const ref = attrs.match(/\br="([A-Z]+\d+)"/), kind = attrs.match(/\bt="(\w+)"/)?.[1];
   const value = kind === 'inlineStr' ? strip(body) : unxml(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
   const text = kind === 's' ? shared[+value] ?? '' : kind === 'b' ? (value === '1' ? 'TRUE' : 'FALSE') : value;
   cells[ref ? columnIndex(ref[1]) : cells.length] = text.replace(/[\t\n]+/g, ' ');
  }
  if (cells.length) rows.push(Array.from(cells, c => c ?? '').join('\t'));
 }
 return rows.join('\n');
}

async function readOffice(bytes, ext) {
 if (ext.startsWith('od')) {
  const files = await unzip(bytes, name => name === 'content.xml');
  const xml = files?.get('content.xml');
  if (!xml) return null;
  return tidy(strip(xml.replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n')
   .replace(/<\/text:(?:p|h)>/g, '\n').replace(/<\/table:table-cell>/g, '\t').replace(/<\/table:table-row>/g, '\n')));
 }
 if (ext.startsWith('doc')) {
  const xml = (await unzip(bytes, name => name === 'word/document.xml'))?.get('word/document.xml');
  if (!xml) return null;
  return tidy(strip(xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n')));
 }
 if (ext === 'pptx') {
  const files = await unzip(bytes, name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  if (!files?.size) return null;
  return [...files.keys()].sort(byNumber).map((name, k) => `Slide ${k + 1}\n${tidy(strip(files.get(name).replace(/<\/a:p>/g, '\n')))}`).join('\n\n');
 }
 const files = await unzip(bytes, name => name === 'xl/sharedStrings.xml' || name === 'xl/workbook.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
 if (!files) return null;
 const shared = [...(files.get('xl/sharedStrings.xml') || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => strip(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')));
 const titles = [...(files.get('xl/workbook.xml') || '').matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map(m => unxml(m[1]));
 const sheets = [...files.keys()].filter(name => name.startsWith('xl/worksheets/')).sort(byNumber);
 if (!sheets.length) return null;
 return sheets.map((name, k) => `Sheet ${titles[k] || k + 1}\n${sheetText(files.get(name), shared)}`).join('\n\n');
}

function limit(text) {
 return text.length > TEXT.chars ? { type: 'text', text: text.slice(0, TEXT.chars), truncated: true } : { type: 'text', text, truncated: false };
}

// A PDF's text comes from the viewer built into the app, which lives in the main process. A file with a place on the
// disk is read from there; one without, such as a pasted one, goes over as its bytes. The answer also says how many
// pages there are and, with `pictures`, brings the pages that have to be seen as pictures: those that look like
// pictures (`seen` names them all), the first ones of a document with formulas, or of one with no text at all.
async function readPdf(file, path, pictures) {
 const bridge = window.openghost?.readPdf;
 if (!bridge) return { type: 'none' };
 const answer = await bridge(path ? { path, pictures } : { data: await file.arrayBuffer(), pictures });
 const text = tidy(answer?.text || '');
 const seen = { pdf: true, pages: answer?.pages || 0, pictures: answer?.pictures || [], seen: answer?.seen || [], formulas: !!answer?.formulas };
 return text ? { ...limit(text), ...seen } : { type: 'none', ...seen };
}

// What a file holds, without its place on the disk.
async function contents(file, info, video, path, pictures) {
 try {
  if (info.glyph === 'image') {
   const image = await readImage(file);
   if (image) return image;
  }
  if (video && info.glyph === 'video') return await readVideo(file);
  if (info.ext === 'pdf') return await readPdf(file, path, pictures);
  if (file.size > TEXT.bytes) return { type: 'none' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (OFFICE.has(info.ext)) {
   const text = await readOffice(bytes, info.ext).catch(() => null);
   return text ? limit(text) : { type: 'none' };
  }
  const text = decodeText(bytes);
  return text === null ? { type: 'none' } : limit(text.replace(/^\ufeff/, ''));
 } catch {
  return { type: 'none' };
 }
}

// `video`: a video comes as a video, as it does for a chat's attachments; elsewhere it is a file whose contents can't be read.
// `pictures`: a PDF brings the pages that have to be seen as pictures, as it does for a chat's attachments.
// A file read as text, or not read at all, also says where it lives, so an agent can open it itself.
async function read(file, info, { video = false, pictures = false } = {}) {
 const path = window.openghost?.pathOf?.(file) || '';
 const payload = await contents(file, info, video, path, pictures);
 return payload.type === 'text' || payload.type === 'none' ? { ...payload, path } : payload;
}

window.AttachmentReader = { read };
})();
