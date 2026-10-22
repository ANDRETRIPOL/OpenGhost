'use strict';

// What the app looks at itself before a step of the agent's plan is closed (plan-proof.js), so that a step stands on
// what is there and not on what the agent says of it: what a document holds now, which checks a project has, and how a
// page of the user's own project loads and looks. Nothing here runs a command or changes a file.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { fileURLToPath } = require('node:url');
const { BrowserWindow } = require('electron');
const Pdf = require('./pdf');

const LIMIT = {
 // A document is read whole up to this size; a bigger one is only named.
 bytes: 30 * 1024 * 1024,
 // One part of a zipped document unpacked at most.
 part: 20 * 1024 * 1024,
 // What a document's facts carry of its words: a start to look at, and more for a judge to weigh.
 excerpt: 1200,
 text: 12000,
 headings: 12,
 // How deep and how wide a project is looked through for test files.
 depth: 4,
 entries: 3000,
};
const HEAVY = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', '.next', '.nuxt', 'target', 'vendor', '.venv', 'venv', '__pycache__', '.cache', 'coverage']);
const TEST = /(^|[\\/])(tests?|__tests__|specs?)[\\/]|[.-](test|spec)\.\w+$|_test\.(go|py)$|(^|[\\/])test_[\w-]+\.py$/i;

const words = text => (String(text).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
const tidy = text => String(text).replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, code) => code[0] === '#'
 ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
 : ENTITY[code.toLowerCase()] ?? all);

// The parts of a zip file (docx, xlsx, pptx are zips), from its central directory: their names, and each one's text.
// Null for what is no zip.
function zipParts(buffer) {
 let end = -1;
 for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 65557); at--) if (buffer.readUInt32LE(at) === 0x06054b50) { end = at; break; }
 if (end < 0) return null;
 const count = buffer.readUInt16LE(end + 10), parts = new Map();
 let at = buffer.readUInt32LE(end + 16);
 for (let k = 0; k < count && at + 46 <= buffer.length && buffer.readUInt32LE(at) === 0x02014b50; k++) {
  const method = buffer.readUInt16LE(at + 10), size = buffer.readUInt32LE(at + 20), full = buffer.readUInt32LE(at + 24);
  const nameLength = buffer.readUInt16LE(at + 28), extra = buffer.readUInt16LE(at + 30), note = buffer.readUInt16LE(at + 32);
  const local = buffer.readUInt32LE(at + 42), name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
  parts.set(name, { method, size, full, local });
  at += 46 + nameLength + extra + note;
 }
 const read = name => {
  const part = parts.get(name);
  if (!part || part.full > LIMIT.part || part.local + 30 > buffer.length || buffer.readUInt32LE(part.local) !== 0x04034b50) return null;
  const start = part.local + 30 + buffer.readUInt16LE(part.local + 26) + buffer.readUInt16LE(part.local + 28);
  const data = buffer.subarray(start, start + part.size);
  try {
   if (part.method === 0) return data.toString('utf8');
   if (part.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: LIMIT.part }).toString('utf8');
  } catch {}
  return null;
 };
 return { names: [...parts.keys()], read };
}

// The words of a Word document, a paragraph a line, and its headings: the paragraphs in a Title or Heading style.
function docx(buffer) {
 const zip = zipParts(buffer), read = zip?.read, xml = read && read('word/document.xml');
 if (!xml) return null;
 const headings = [], lines = [];
 for (const paragraph of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
  const line = decode((paragraph.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map(run => run.replace(/<[^>]+>/g, '')).join('')).trim();
  if (!line) continue;
  lines.push(line);
  if (/<w:pStyle w:val="(Title|Heading\d|\w*[Hh]eading\w*|Заголовок\d*)"/.test(paragraph)) headings.push(line);
 }
 const pages = Number(/<Pages>(\d+)<\/Pages>/.exec(read('docProps/app.xml') || '')?.[1] || 0);
 return { kind: 'Word document', text: lines.join('\n'), headings, pages };
}

// A slide deck: how many slides, and the words of each.
function pptx(buffer) {
 const zip = zipParts(buffer), read = zip?.read;
 if (!read) return null;
 const slides = zip.names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(/\d+/.exec(a.slice(16))) - Number(/\d+/.exec(b.slice(16))));
 const headings = [], lines = [];
 for (const name of slides) {
  const said = (read(name) || '').match(/<a:t>[^<]*<\/a:t>/g) || [];
  const words = said.map(run => decode(run.replace(/<[^>]+>/g, '')).trim()).filter(Boolean);
  if (words[0]) headings.push(words[0]);
  lines.push(words.join(' '));
 }
 return { kind: 'slide deck', text: lines.join('\n'), headings, slides: slides.length };
}

// A workbook: its sheets by name, how many rows each has, and the words in its cells.
function xlsx(buffer) {
 const read = zipParts(buffer)?.read, book = read && read('xl/workbook.xml');
 if (!book) return null;
 const names = [...book.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(match => decode(match[1]));
 const sheets = names.map((name, k) => ({ name, rows: ((read(`xl/worksheets/sheet${k + 1}.xml`) || '').match(/<row[ >]/g) || []).length }));
 const strings = ((read('xl/sharedStrings.xml') || '').match(/<t(?: [^>]*)?>[^<]*<\/t>/g) || []).map(cell => decode(cell.replace(/<[^>]+>/g, '')));
 return { kind: 'spreadsheet', text: strings.join('\n'), headings: [], sheets };
}

// Headings of a text the app can read: Markdown's # lines, a web page's h1 to h3.
function headingsOf(file, text) {
 if (/\.(md|markdown)$/i.test(file)) return [...text.matchAll(/^#{1,3}\s+(.+?)\s*#*\s*$/gm)].map(match => match[1].trim());
 if (/\.html?$/i.test(file)) return [...text.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(match => decode(match[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()).filter(Boolean);
 return [];
}

// What a document holds now, as the app reads it itself: whether it is there, how big, its pages, slides or sheets,
// its words and headings, the start of it, and more of its words for a judge.
async function facts(file) {
 if (typeof file !== 'string' || !path.isAbsolute(file)) return { exists: false };
 const stat = await fs.promises.stat(file).catch(() => null);
 if (!stat) return { exists: false };
 if (stat.isDirectory()) return { exists: true, folder: true, entries: (await fs.promises.readdir(file).catch(() => [])).length };
 const out = { exists: true, size: stat.size };
 if (stat.size > LIMIT.bytes) return out;
 let found = null;
 try {
  if (/\.pdf$/i.test(file)) {
   const study = await Pdf.study(file);
   found = { kind: 'PDF', text: study.text || '', headings: [], pages: study.pages || 0 };
  } else if (/\.(docx|docm)$/i.test(file)) found = docx(await fs.promises.readFile(file));
  else if (/\.(pptx|pptm)$/i.test(file)) found = pptx(await fs.promises.readFile(file));
  else if (/\.(xlsx|xlsm)$/i.test(file)) found = xlsx(await fs.promises.readFile(file));
  else {
   const raw = await fs.promises.readFile(file);
   if (raw.subarray(0, 8000).includes(0)) return { ...out, binary: true };
   const text = raw.toString('utf8');
   const shown = /\.html?$/i.test(file) ? decode(text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')) : text;
   found = { kind: /\.csv$/i.test(file) ? 'table' : 'text', text: shown, headings: headingsOf(file, text) };
   if (/\.csv$/i.test(file)) found.rows = text.split(/\r?\n/).filter(line => line.trim()).length;
  }
 } catch {}
 if (!found) return { ...out, unreadable: true };
 const text = tidy(found.text);
 return {
  ...out, kind: found.kind, words: words(text), headings: found.headings.slice(0, LIMIT.headings),
  pages: found.pages || 0, slides: found.slides || 0, sheets: found.sheets || null, rows: found.rows || 0,
  excerpt: text.slice(0, LIMIT.excerpt), text: text.slice(0, LIMIT.text),
 };
}

// The checks a project gives itself, as the agent would run them, and whether it has tests at all.
async function project(cwd) {
 const out = { checks: [], tests: false };
 if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return out;
 const has = name => fs.existsSync(path.join(cwd, name));
 const read = name => fs.promises.readFile(path.join(cwd, name), 'utf8').catch(() => '');
 const pkg = await read('package.json');
 if (pkg) {
  let scripts = {};
  try { scripts = JSON.parse(pkg).scripts || {}; } catch {}
  const runner = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : 'npm';
  // npm init leaves a test that only fails: it is no check.
  if (scripts.test && !/no test specified/i.test(scripts.test)) out.checks.push(`${runner} test`);
  for (const name of ['build', 'typecheck', 'lint', 'check']) if (scripts[name]) out.checks.push(`${runner} run ${name}`);
 }
 const python = `${await read('pyproject.toml')}\n${await read('setup.cfg')}\n${await read('tox.ini')}`;
 if (has('pytest.ini') || /\[tool\.pytest|\[pytest\]|\[tool:pytest\]/.test(python)) out.checks.push('python -m pytest');
 if (has('Cargo.toml')) out.checks.push('cargo test');
 if (has('go.mod')) out.checks.push('go test ./...');
 if (/^test:/m.test(await read('Makefile'))) out.checks.push('make test');
 // Test files anywhere near the top of the project, read through briefly.
 let seen = 0;
 const walk = async (rel, depth) => {
  if (out.tests || depth > LIMIT.depth || seen > LIMIT.entries) return;
  const entries = await fs.promises.readdir(path.join(cwd, rel), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
   if (out.tests || ++seen > LIMIT.entries) return;
   const child = rel ? `${rel}/${entry.name}` : entry.name;
   if (entry.isDirectory()) { if (!HEAVY.has(entry.name) && !entry.name.startsWith('.')) await walk(child, depth + 1); }
   else if (TEST.test(child)) out.tests = true;
  }
 };
 await walk('', 0);
 return out;
}

// A page of the user's own project, opened apart from the built-in browser: a file of the project or a server on this
// computer, nothing else. It tells whether the page loads, the errors its console shows, and, with `shots`, how it looks
// at a phone's and at a desktop's width, light and dark. The browser the agent and the user work in is not touched.
const LOOK = {
 sizes: [{ width: 390, height: 844, mobile: true }, { width: 1440, height: 900, mobile: false }],
 // A shot is made no wider than this.
 side: 720,
 quality: 72,
 load: 15000,
 settle: 900,
 turn: 350,
 errors: 8,
};
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const looking = new Set();
let guarded = null;

function allowed(url, cwd) {
 let parsed;
 try { parsed = new URL(url); } catch { return ''; }
 if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return LOCAL.has(parsed.hostname) ? parsed.href : '';
 if (parsed.protocol !== 'file:' || typeof cwd !== 'string' || !path.isAbsolute(cwd)) return '';
 let file;
 try { file = fileURLToPath(parsed); } catch { return ''; }
 const inside = path.relative(cwd, file);
 return inside && !inside.startsWith('..') && !path.isAbsolute(inside) && /\.html?$/i.test(file) && fs.existsSync(file) ? parsed.href : '';
}

async function glimpse({ url, cwd, shots = false } = {}) {
 const address = allowed(url, cwd);
 if (!address) return { ok: false, error: 'not a page of the project' };
 const win = new BrowserWindow({
  show: false, width: LOOK.sizes[1].width, height: LOOK.sizes[1].height, skipTaskbar: true, focusable: false,
  webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'openghost-glimpse', backgroundThrottling: false, spellcheck: false, offscreen: true },
 });
 looking.add(win);
 const contents = win.webContents, errors = [];
 let status = -1, failed = '';
 contents.setAudioMuted(true);
 contents.setWindowOpenHandler(() => ({ action: 'deny' }));
 // The page may move within the project, never out of it.
 contents.on('will-navigate', (event, next) => { if (!allowed(next, cwd)) event.preventDefault(); });
 // Nothing a page offers is downloaded: the session of these windows says so once.
 if (guarded !== contents.session) {
  guarded = contents.session;
  guarded.on('will-download', event => event.preventDefault());
 }
 contents.on('console-message', details => {
  if (details.level === 'error' && errors.length < LOOK.errors) errors.push(`${String(details.message).slice(0, 300)}${details.sourceId ? ` (${String(details.sourceId).split(/[\\/]/).pop()}:${details.lineNumber})` : ''}`);
 });
 contents.on('did-navigate', (event, where, code) => { status = code; });
 contents.on('did-fail-load', (event, code, description, where, main) => { if (main && code !== -3) failed = description || `error ${code}`; });
 const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
 const cdp = (method, params) => contents.debugger.sendCommand(method, params);
 const out = { ok: false, status: -1, title: '', errors, shots: [] };
 try {
  await Promise.race([contents.loadURL(address).catch(error => { failed ||= error.message; }), sleep(LOOK.load).then(() => { failed ||= 'the page did not load in 15 seconds'; })]);
  out.status = status;
  if (failed || status >= 500) return { ...out, error: failed || `the server answered ${status}` };
  await sleep(LOOK.settle);
  out.ok = true;
  out.title = contents.getTitle();
  if (shots) {
   // Taken by the debugger only once a page is in the window: told a screen size before any page, the app went down.
   contents.debugger.attach('1.3');
   for (const size of LOOK.sizes) {
    for (const dark of [false, true]) {
     await cdp('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
     await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
     await sleep(LOOK.turn);
     const zoom = Math.min(1, LOOK.side / size.width);
     const shot = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: LOOK.quality, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: zoom } });
     out.shots.push({ label: `${size.width} px wide, ${dark ? 'dark' : 'light'}`, url: `data:image/jpeg;base64,${shot.data}` });
    }
   }
  }
  return out;
 } catch (error) {
  return { ...out, ok: false, error: `the page could not be looked at: ${error.message}` };
 } finally {
  looking.delete(win);
  if (!win.isDestroyed()) win.destroy();
 }
}

// The app is closing: no window of these stays behind.
function cancelAll() {
 for (const win of looking) if (!win.isDestroyed()) win.destroy();
 looking.clear();
}

module.exports = { facts, project, glimpse, cancelAll, allowed, zipParts, docx, pptx, xlsx, TEST };
