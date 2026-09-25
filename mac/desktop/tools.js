'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { net } = require('electron');
const Media = require('./media');
const Browser = require('./browser');

const OUTPUT = { head: 12000, tail: 18000 };
const TIMEOUT = { shell: 120, max: 900, git: 120, fetch: 30, probe: 10 };
const EXIT_GRACE = 800;
const READ = { lines: 2000, chars: 200000, max: 20 * 1024 * 1024 };
const FETCH_BYTES = 5 * 1024 * 1024;
const LIST = { depth: 2, max: 6, entries: 400 };
const HEAVY = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', '.next', '.nuxt', '.cache', '.idea', '.vs', '.gradle', 'target', 'dist', 'build', 'bin', 'obj', 'coverage']);
const IDENTITY = new Set(['commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'tag', 'stash', 'am', 'pull']);
const UA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
const ZSH = { exe: '/bin/zsh', name: 'zsh', version: '' };

const ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(ELECTRON_|npm_)/i.test(name)));
Object.assign(ENV, { NO_COLOR: '1', FORCE_COLOR: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' });

const jobs = new Map();
let shell = null;
let git = null;

const clampSeconds = (value, fallback) => Math.min(TIMEOUT.max, Math.max(1, Number(value) || fallback));
const ansi = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;

function formatSize(bytes) {
 if (bytes < 1024) return `${bytes} B`;
 if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
 return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

class Output {
 constructor() {
  this.head = '';
  this.tail = '';
  this.total = 0;
 }

 add(chunk) {
  let text = chunk.replace(ansi, '');
  this.total += text.length;
  if (this.head.length < OUTPUT.head) {
   const room = OUTPUT.head - this.head.length;
   this.head += text.slice(0, room);
   text = text.slice(room);
  }
  if (text) this.tail = (this.tail + text).slice(-OUTPUT.tail);
 }

 text() {
  const omitted = this.total - this.head.length - this.tail.length;
  const raw = omitted > 0 ? `${this.head}\n\n[… ${omitted} characters omitted …]\n\n${this.tail}` : this.head + this.tail;
  return raw.replace(/\r\n/g, '\n').split('\n').map(line => line.includes('\r') ? line.split('\r').filter(Boolean).pop() || '' : line).join('\n').trimEnd();
 }
}

function kill(child) {
 if (!child.pid || child.exitCode !== null) return;
 try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
}

function run(id, exe, args, { cwd, timeout }) {
 return new Promise(resolve => {
  let child;
  try {
   child = spawn(exe, args, { cwd, env: ENV, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
   resolve({ missing: error.code === 'ENOENT', error: error.message });
   return;
  }
  const output = new Output(), started = Date.now();
  let timedOut = false, cancelled = false, finished = false, grace = 0;
  const timer = setTimeout(() => { timedOut = true; kill(child); }, timeout * 1000);
  const finish = result => {
   if (finished) return;
   finished = true;
   clearTimeout(timer);
   clearTimeout(grace);
   jobs.delete(id);
   resolve({ ...result, output: output.text(), timedOut, cancelled, seconds: (Date.now() - started) / 1000 });
  };
  if (id) jobs.set(id, () => { cancelled = true; kill(child); });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => output.add(chunk));
  child.stderr.on('data', chunk => output.add(chunk));
  child.on('error', error => finish({ missing: error.code === 'ENOENT', error: error.message, code: null }));
  // A process started in the background can keep the pipes open long after the command itself is done.
  child.on('exit', code => { grace = setTimeout(() => finish({ code }), EXIT_GRACE); });
  child.on('close', code => finish({ code }));
 });
}

function detectShell() {
 shell ||= run('', ZSH.exe, ['-c', 'printf %s "$ZSH_VERSION"'], { cwd: os.homedir(), timeout: TIMEOUT.probe })
  .then(result => result.code === 0 && result.output ? { ...ZSH, version: result.output.trim() } : ZSH);
 return shell;
}

function detectGit() {
 git ||= run('', 'git', ['--version'], { cwd: os.homedir(), timeout: TIMEOUT.probe })
  .then(result => result.code === 0 ? result.output.replace(/^git version\s*/, '').trim() : null);
 return git;
}

function resolvePath(cwd, file) {
 if (typeof file !== 'string' || !file.trim()) throw Object.assign(new Error('path is empty'), { plain: true });
 const clean = file.trim().replace(/^~(?=$|[\\/])/, os.homedir());
 return path.resolve(cwd, clean);
}

function explain(error, file = '') {
 if (error.plain) return error.message;
 const where = file ? `: ${file}` : '';
 if (error.code === 'ENOENT') return `No such file or folder${where}`;
 if (error.code === 'EACCES' || error.code === 'EPERM') return `Access denied${where}`;
 if (error.code === 'EBUSY') return `The file is locked by another program${where}`;
 if (error.code === 'EISDIR') return `This is a folder, not a file${where}`;
 if (error.code === 'ENOTDIR') return `This is a file, not a folder${where}`;
 return error.message;
}

const isBinary = buffer => buffer.subarray(0, 8000).includes(0);

function decode(buffer, charset = 'utf-8') {
 let text;
 try { text = new TextDecoder(charset).decode(buffer); } catch { text = buffer.toString('utf8'); }
 if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
 const broken = text.match(/\uFFFD/g)?.length || 0;
 if (charset === 'utf-8' && broken > 8 && broken > text.length / 500) {
  try { return new TextDecoder('windows-1251').decode(buffer); } catch {}
 }
 return text;
}

async function runShell(id, { command, timeout }, cwd) {
 if (typeof command !== 'string' || !command.trim()) return { error: 'command is empty' };
 const { exe } = await detectShell();
 const dir = path.join(os.tmpdir(), 'openghost');
 await fs.promises.mkdir(dir, { recursive: true });
 const file = path.join(dir, `command-${process.pid}-${String(id).replace(/[^\w-]/g, '')}.sh`);
 await fs.promises.writeFile(file, `#!/bin/zsh\nexport LANG=en_US.UTF-8\n${command}\n`, { mode: 0o700 });
 const seconds = clampSeconds(timeout, TIMEOUT.shell);
 const result = await run(id, exe, [file], { cwd, timeout: seconds });
 fs.promises.rm(file, { force: true }).catch(() => {});
 if (result.error && result.code === null) return { error: result.error };
 return { code: result.code, output: result.output, timedOut: result.timedOut, cancelled: result.cancelled, seconds: result.seconds, timeout: seconds };
}

async function cancellable(id, work) {
 const controller = new AbortController();
 if (id) jobs.set(id, () => controller.abort());
 try {
  return await work(controller.signal);
 } finally {
  jobs.delete(id);
 }
}

async function readFile(id, { path: file, offset, limit }, cwd) {
 const full = resolvePath(cwd, file);
 const stat = await fs.promises.stat(full).catch(error => { throw Object.assign(error, { file }); });
 if (stat.isDirectory()) return { error: `${file} is a folder, use list_files` };
 if (Media.isImage(full)) {
  const picture = await cancellable(id, signal => Media.image(full, signal));
  return { path: full, image: picture.url, width: picture.width, height: picture.height, size: formatSize(stat.size) };
 }
 if (stat.size > READ.max) return { error: `${file} is ${formatSize(stat.size)}, too big to read at once. Read parts of it with run_zsh (sed -n, grep).` };
 const buffer = await fs.promises.readFile(full);
 if (isBinary(buffer)) return { binary: true, size: formatSize(stat.size), path: full };
 const lines = decode(buffer).split(/\r?\n/);
 const start = Math.max(1, Math.floor(Number(offset) || 1));
 const count = Math.min(READ.lines, Math.max(1, Math.floor(Number(limit) || READ.lines)));
 const slice = lines.slice(start - 1, start - 1 + count);
 let text = slice.join('\n'), cut = false;
 if (text.length > READ.chars) { text = text.slice(0, READ.chars); cut = true; }
 return { path: full, text, start, end: start - 1 + slice.length, total: lines.length, cut };
}

async function writeFile(id, { path: file, content }, cwd) {
 if (typeof content !== 'string') return { error: 'content must be a string' };
 const full = resolvePath(cwd, file);
 let existed = false, crlf = false, bom = false;
 try {
  const old = await fs.promises.readFile(full);
  existed = true;
  bom = old[0] === 0xef && old[1] === 0xbb && old[2] === 0xbf;
  crlf = old.includes('\r\n');
 } catch (error) {
  if (error.code !== 'ENOENT') throw Object.assign(error, { file });
 }
 const text = crlf ? content.replace(/\r?\n/g, '\r\n') : content;
 await fs.promises.mkdir(path.dirname(full), { recursive: true });
 await fs.promises.writeFile(full, bom ? `\ufeff${text}` : text, 'utf8');
 return { path: full, created: !existed, lines: content.split('\n').length };
}

async function editFile(id, { path: file, old_string: before, new_string: after, replace_all: all }, cwd) {
 if (typeof before !== 'string' || !before) return { error: 'old_string is empty. To create a file or replace all of it use write_file.' };
 if (typeof after !== 'string') return { error: 'new_string must be a string' };
 if (before === after) return { error: 'old_string and new_string are the same' };
 const full = resolvePath(cwd, file);
 const buffer = await fs.promises.readFile(full).catch(error => { throw Object.assign(error, { file }); });
 if (isBinary(buffer)) return { error: `${file} is a binary file` };
 const bom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
 const text = decode(buffer), crlf = text.includes('\r\n');
 let find = before, put = after;
 if (crlf) {
  find = find.replace(/\r?\n/g, '\r\n');
  put = put.replace(/\r?\n/g, '\r\n');
 }
 const count = text.split(find).length - 1;
 if (!count) return { error: `old_string was not found in ${file}. Read the file again and copy the exact text, including spaces and indentation.` };
 if (count > 1 && !all) return { error: `old_string appears ${count} times in ${file}. Include more surrounding lines so it is unique, or set replace_all to true.` };
 const next = all ? text.split(find).join(put) : text.replace(find, () => put);
 await fs.promises.writeFile(full, bom ? `\ufeff${next}` : next, 'utf8');
 return { path: full, replaced: all ? count : 1 };
}

async function listFiles(id, { path: dir = '.', depth }, cwd) {
 const root = resolvePath(cwd, dir || '.');
 const limit = Math.min(LIST.max, Math.max(1, Math.floor(Number(depth) || LIST.depth)));
 const lines = [];
 let count = 0, more = false;
 async function walk(folder, level, indent) {
  const entries = await fs.promises.readdir(folder, { withFileTypes: true });
  entries.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name));
  for (const entry of entries) {
   if (count >= LIST.entries) { more = true; return; }
   count++;
   const full = path.join(folder, entry.name);
   if (entry.isDirectory()) {
    const heavy = HEAVY.has(entry.name.toLowerCase());
    lines.push(`${indent}${entry.name}/${heavy && level < limit ? '  (not expanded)' : ''}`);
    if (!heavy && level < limit) await walk(full, level + 1, `${indent}  `).catch(() => lines.push(`${indent}  (can't be read)`));
   } else {
    const size = await fs.promises.stat(full).then(stat => formatSize(stat.size), () => '');
    lines.push(`${indent}${entry.name}${size ? `  ${size}` : ''}`);
   }
  }
 }
 await walk(root, 1, '').catch(error => { throw Object.assign(error, { file: dir }); });
 return { path: root, text: lines.join('\n'), more, count };
}

async function hasIdentity(cwd) {
 const result = await run('', 'git', ['config', 'user.email'], { cwd, timeout: TIMEOUT.probe });
 return result.code === 0 && !!result.output.trim();
}

async function runGit(id, { args }, cwd) {
 if (typeof args === 'string') args = args.match(/"[^"]*"|'[^']*'|\S+/g)?.map(part => part.replace(/^(["'])(.*)\1$/, '$2')) || [];
 if (!Array.isArray(args) || !args.length || args.some(part => typeof part !== 'string')) return { error: 'args must be a list of strings, for example ["status"]' };
 if (args[0] === 'git') args = args.slice(1);
 if (!(await detectGit())) return { missing: true };
 const flags = ['-c', 'core.quotepath=off', '-c', 'color.ui=never', '-c', 'core.pager=cat'];
 if (IDENTITY.has(args[0]) && !(await hasIdentity(cwd))) flags.push('-c', 'user.name=OpenGhost', '-c', 'user.email=openghost@localhost');
 const result = await run(id, 'git', [...flags, ...args], { cwd, timeout: TIMEOUT.git });
 if (result.missing) return { missing: true };
 if (result.error && result.code === null) return { error: result.error };
 return { code: result.code, output: result.output, timedOut: result.timedOut, cancelled: result.cancelled };
}

async function readBody(response, limit) {
 const reader = response.body?.getReader();
 if (!reader) return { bytes: Buffer.alloc(0), cut: false };
 const chunks = [];
 let size = 0, cut = false;
 for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  chunks.push(value);
  size += value.length;
  if (size >= limit) { cut = true; reader.cancel().catch(() => {}); break; }
 }
 return { bytes: Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).subarray(0, limit), cut };
}

async function fetchUrl(id, { url }) {
 let address;
 try { address = new URL(String(url || '').trim()); } catch { return { error: `Not a valid address: ${url}` }; }
 if (address.protocol !== 'http:' && address.protocol !== 'https:') return { error: 'Only http and https addresses can be opened' };
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), TIMEOUT.fetch * 1000);
 if (id) jobs.set(id, () => controller.abort());
 try {
  const response = await net.fetch(address.href, {
   headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8' },
   signal: controller.signal,
   redirect: 'follow',
  });
  const type = response.headers.get('content-type') || '';
  const { bytes, cut } = await readBody(response, FETCH_BYTES);
  const textual = !type || /^(text\/|application\/([\w.+-]*\+)?(json|xml|javascript|x-javascript|ecmascript))/i.test(type);
  const charset = /charset=["']?([\w-]+)/i.exec(type)?.[1]?.toLowerCase() || 'utf-8';
  return { status: response.status, url: response.url || address.href, type, size: formatSize(bytes.length), cut, text: textual ? decode(bytes, charset) : null };
 } catch (error) {
  return { error: controller.signal.aborted ? 'The page did not respond in time or loading was stopped' : `Could not open the page: ${error.message}` };
 } finally {
  clearTimeout(timer);
  jobs.delete(id);
 }
}

function videoFrames(id, { path: file, count, start, end, times, save_to: saveTo }, cwd) {
 const full = resolvePath(cwd, file);
 const folder = typeof saveTo === 'string' && saveTo.trim() ? resolvePath(cwd, saveTo) : '';
 return cancellable(id, signal => Media.frames(full, { count, start, end, times, saveTo: folder }, signal));
}

const TOOLS = {
 run_zsh: runShell,
 read_file: readFile,
 video_frames: videoFrames,
 write_file: writeFile,
 edit_file: editFile,
 list_files: listFiles,
 git: runGit,
 fetch_url: fetchUrl,
};

async function runTool(id, name, args, cwd, sender) {
 if (name.startsWith('browser_')) {
  try {
   return await cancellable(String(id || ''), signal => Browser.run(name, args && typeof args === 'object' ? args : {}, sender, signal));
  } catch (error) {
   return { error: explain(error) };
  }
 }
 const tool = TOOLS[name];
 if (!tool) return { error: `Unknown tool ${name}` };
 if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return { error: 'This chat has no project folder' };
 const stat = await fs.promises.stat(cwd).catch(() => null);
 if (!stat?.isDirectory()) return { error: `The project folder ${cwd} doesn't exist anymore` };
 try {
  return await tool(String(id || ''), args && typeof args === 'object' ? args : {}, cwd);
 } catch (error) {
  return { error: explain(error, error.file) };
 }
}

function cancel(id) {
 const stop = jobs.get(String(id));
 if (stop) stop();
}

function cancelAll() {
 for (const stop of jobs.values()) stop();
}

async function environment() {
 const [found, gitVersion] = await Promise.all([detectShell(), detectGit()]);
 return {
  os: `macOS ${os.release()}`,
  shell: `${found.name} ${found.version}`,
  git: gitVersion,
  home: os.homedir(),
  user: os.userInfo().username,
 };
}

module.exports = { runTool, cancel, cancelAll, environment };
