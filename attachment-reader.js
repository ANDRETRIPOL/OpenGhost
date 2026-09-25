(() => {
'use strict';

const IMAGE = { side: 2560, bytes: 6e6, quality: 0.9 };
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

async function read(file, info) {
 try {
  if (info.glyph === 'image') {
   const image = await readImage(file);
   if (image) return image;
  }
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

window.AttachmentReader = { read };
})();
