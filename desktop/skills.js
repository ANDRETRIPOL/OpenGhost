'use strict';

// Skills: folders of instructions for the agent in the open Agent Skills format (agentskills.io), the one Claude,
// Codex and many other agents read. A skill is a folder with a SKILL.md: a head of YAML with its name and a description
// of what it does and when to use it, then the instructions; files beside it (scripts/, references/, assets/) are read
// only when the instructions point at them.
//
// They are looked for where other agents keep them, so whatever the user has set up for those works here too: the
// shared folder ~/.agents/skills, Claude's ~/.claude/skills, and the same two inside the project a chat works in (a
// project's own one wins over the user's of the same name). New ones are put into ~/.agents/skills, where the others
// find them as well. A skill is put in from a link: a folder or a repository on GitHub, a .zip or .skill archive, or a
// lone SKILL.md.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { app, ipcMain } = require('electron');

const FILE = 'SKILL.md';
const MARK = '.openghost.json';
const HOME = path.join(os.homedir(), '.agents', 'skills');
const USER = [{ dir: HOME, from: 'agents' }, { dir: path.join(os.homedir(), '.claude', 'skills'), from: 'claude' }];
const PROJECT = [path.join('.agents', 'skills'), path.join('.claude', 'skills')];
const LIMIT = { files: 400, bytes: 40 * 1024 * 1024, file: 12 * 1024 * 1024, listed: 80, body: 200 * 1024, wait: 30000 };
const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.venv', '.DS_Store']);

const cache = new Map();
const userAgent = () => `OpenGhost/${app.getVersion()}`;

// --- SKILL.md --------------------------------------------------------------------------------------------------------

// The head of YAML as skills write it: `key: value` lines, a value in quotes, a block (| or >) on the lines under its
// key, and a map one level down (metadata). Lenient as the format's own guide asks: a colon inside an unquoted value
// (`description: Use when: …`), which YAML proper refuses, is taken as a part of the value.
function frontmatter(text) {
 const source = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
 const m = source.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
 if (!m) return null;
 const lines = m[1].split('\n'), head = {};
 const unquote = value => {
  const v = value.trim();
  if (v.length > 1 && v[0] === '"' && v.endsWith('"')) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
  if (v.length > 1 && v[0] === "'" && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
 };
 for (let k = 0; k < lines.length; k++) {
  const line = lines[k], top = line.match(/^([A-Za-z0-9_-]+):(?:\s(.*)|$)/);
  if (!top) continue;
  const key = top[1], rest = (top[2] || '').trim();
  const block = rest.match(/^([|>])[+-]?\d*$/);
  if (block || !rest) {
   // The lines under the key, as far as they go in: a block of text, or a map.
   const under = [];
   while (k + 1 < lines.length && (/^\s+\S/.test(lines[k + 1]) || !lines[k + 1].trim())) under.push(lines[++k]);
   while (under.length && !under.at(-1).trim()) under.pop();
   const indent = Math.min(...under.filter(item => item.trim()).map(item => item.match(/^\s*/)[0].length));
   const body = under.map(item => item.slice(Math.min(indent, item.length)));
   if (block) head[key] = block[1] === '|' ? body.join('\n') : body.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1 ');
   else if (body.length && body.every(item => !item.trim() || /^[A-Za-z0-9_.-]+:/.test(item))) {
    head[key] = Object.fromEntries(body.filter(item => item.trim()).map(item => { const at = item.indexOf(':'); return [item.slice(0, at).trim(), unquote(item.slice(at + 1))]; }));
   } else head[key] = body.join(' ').trim();
  } else head[key] = unquote(rest);
 }
 return { head, body: source.slice(m[0].length).trim() };
}

// What is kept of a skill: its name (the folder's when the head has none or a bad one), its description, and what it
// says it needs. A skill without a description is no skill: nothing would tell when to use it.
function describe(text, folder) {
 const parsed = frontmatter(text);
 if (!parsed) return null;
 const { head } = parsed;
 const description = typeof head.description === 'string' ? head.description.replace(/\s+/g, ' ').trim() : '';
 if (!description) return null;
 const named = typeof head.name === 'string' ? head.name.trim() : '';
 const name = (named || folder).slice(0, 64);
 return {
  name,
  description: description.slice(0, 1024),
  compatibility: typeof head.compatibility === 'string' ? head.compatibility.trim().slice(0, 500) : '',
  license: typeof head.license === 'string' ? head.license.trim().slice(0, 200) : '',
 };
}

// --- Finding them ----------------------------------------------------------------------------------------------------

const within = (dir, root) => { const rel = path.relative(root, dir); return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel); };

// The places to look in for a chat that works in `cwd`, the project's first. A chat's own folder under ~/OpenGhost/Chats is
// no project, and neither is the home folder itself.
function places(cwd, chats) {
 const out = [];
 if (typeof cwd === 'string' && path.isAbsolute(cwd) && path.resolve(cwd) !== path.resolve(os.homedir()) && !(chats && (within(cwd, chats) || path.resolve(cwd) === path.resolve(chats)))) {
  for (const sub of PROJECT) out.push({ dir: path.join(cwd, sub), from: 'project' });
 }
 return [...out, ...USER];
}

async function scripts(dir) {
 try { return (await fs.promises.readdir(path.join(dir, 'scripts'))).some(name => !name.startsWith('.')); } catch { return false; }
}

// One skill folder, read again only once its SKILL.md has changed.
async function load(dir, from) {
 const file = path.join(dir, FILE);
 let stat;
 try { stat = await fs.promises.stat(file); } catch { return null; }
 const had = cache.get(file);
 if (had && had.time === stat.mtimeMs && had.size === stat.size) return had.skill && { ...had.skill, from };
 let skill = null;
 try {
  const info = describe(await fs.promises.readFile(file, 'utf8'), path.basename(dir));
  if (info) {
   let source = '';
   try { source = JSON.parse(await fs.promises.readFile(path.join(dir, MARK), 'utf8')).source || ''; } catch {}
   skill = { ...info, dir, file, scripts: await scripts(dir), source };
  }
 } catch {}
 cache.set(file, { time: stat.mtimeMs, size: stat.size, skill });
 return skill && { ...skill, from };
}

// Every skill a chat in `cwd` can use, by name: the first place a name is found in wins.
async function list(cwd, chats) {
 const found = new Map();
 for (const place of places(cwd, chats)) {
  let names = [];
  try { names = await fs.promises.readdir(place.dir, { withFileTypes: true }); } catch { continue; }
  const dirs = names.filter(entry => (entry.isDirectory() || entry.isSymbolicLink()) && !entry.name.startsWith('.')).map(entry => entry.name).sort();
  const skills = await Promise.all(dirs.map(name => load(path.join(place.dir, name), place.from)));
  for (const skill of skills) if (skill && !found.has(skill.name)) found.set(skill.name, skill);
 }
 return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The files of a skill beside its SKILL.md, as paths from its folder, to say what there is without reading it.
async function files(dir) {
 const out = [];
 const walk = async (at, depth) => {
  if (out.length >= LIMIT.listed || depth > 4) return;
  let entries = [];
  try { entries = await fs.promises.readdir(at, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
   if (out.length >= LIMIT.listed) return;
   if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
   const full = path.join(at, entry.name);
   if (entry.isDirectory()) await walk(full, depth + 1);
   else if (full !== path.join(dir, FILE)) out.push(path.relative(dir, full).split(path.sep).join('/'));
  }
 };
 await walk(dir, 0);
 return out;
}

// A skill's instructions, as the agent gets them when it is used.
async function read(name, cwd, chats) {
 const skill = (await list(cwd, chats)).find(item => item.name === name);
 if (!skill) return null;
 let text = '';
 try { text = await fs.promises.readFile(skill.file, 'utf8'); } catch { return null; }
 let body = frontmatter(text)?.body ?? text;
 const cut = body.length > LIMIT.body;
 if (cut) body = `${body.slice(0, LIMIT.body)}\n[… the rest of SKILL.md was cut: read it from the file itself]`;
 return { ...skill, body, files: await files(skill.dir) };
}

// --- Putting one in --------------------------------------------------------------------------------------------------

class Refusal extends Error {}

async function get(url, kind = 'text') {
 const response = await fetch(url, { headers: { 'User-Agent': userAgent(), Accept: kind === 'json' ? 'application/vnd.github+json' : '*/*' }, signal: AbortSignal.timeout(LIMIT.wait), redirect: 'follow' });
 if (!response.ok) {
  const error = new Error(`${response.status} ${response.statusText}`.trim());
  error.status = response.status;
  error.limited = response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
  throw error;
 }
 if (kind === 'json') return response.json();
 const size = Number(response.headers.get('content-length') || 0);
 if (size > LIMIT.bytes) throw new Refusal(`The file is too large (${Math.round(size / 1048576)} MB).`);
 const buffer = Buffer.from(await response.arrayBuffer());
 if (buffer.length > LIMIT.bytes) throw new Refusal(`The file is too large (${Math.round(buffer.length / 1048576)} MB).`);
 return kind === 'text' ? buffer.toString('utf8') : buffer;
}

// Where a GitHub link points: its repository, and the branch and the path in it when the link names them.
function github(url) {
 const m = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/(tree|blob)\/([^?#\s]+))?/i);
 if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, ''), rest: m[4] ? decodeURIComponent(m[4]).replace(/\/+$/, '') : '' };
 const raw = url.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/\s]+)\/([^/\s]+)\/([^?#\s]+)/i);
 if (raw) return { owner: raw[1], repo: raw[2], rest: decodeURIComponent(raw[3]).replace(/\/+$/, '') };
 return null;
}

// The files of a skill in a GitHub repository: the whole tree in one call, then each file from the raw host, which
// counts against no limit. `rest` is the branch and the path after it; a branch with slashes in its name is found by
// trying the longer names in turn.
async function fromGithub({ owner, repo, rest }, want) {
 const api = `https://api.github.com/repos/${owner}/${repo}`;
 const parts = rest ? rest.split('/') : [];
 const tries = [];
 if (parts.length) for (let k = 1; k <= parts.length; k++) tries.push({ ref: parts.slice(0, k).join('/'), sub: parts.slice(k).join('/') });
 else tries.push({ ref: (await get(api, 'json')).default_branch, sub: '' });
 let tree = null, ref = '', sub = '';
 for (const attempt of tries) {
  try {
   tree = await get(`${api}/git/trees/${encodeURIComponent(attempt.ref)}?recursive=1`, 'json');
   ({ ref, sub } = attempt);
   break;
  } catch (error) {
   if (error.limited) throw new Refusal('GitHub allows only a few requests an hour without signing in, and they are used up. Try again in a while.');
   if (error.status !== 404 && error.status !== 422) throw error;
  }
 }
 if (!tree) throw new Refusal(`Nothing was found at this link on GitHub: is the repository public, and the branch and the path right?`);
 const blobs = tree.tree.filter(item => item.type === 'blob');
 // A link to the SKILL.md itself, or to a file in the skill's folder, stands for the folder.
 if (sub && blobs.some(item => item.path === sub)) sub = sub.endsWith(`/${FILE}`) || sub === FILE ? path.posix.dirname(sub) : path.posix.dirname(sub);
 if (sub === '.') sub = '';
 const inside = item => !sub || item.path === sub || item.path.startsWith(`${sub}/`);
 const skills = blobs.filter(item => inside(item) && path.posix.basename(item.path) === FILE).map(item => path.posix.dirname(item.path)).map(dir => dir === '.' ? '' : dir);
 if (!skills.length) throw new Refusal('There is no skill at this link: no SKILL.md was found there.');
 let dir = skills.includes(sub) ? sub : null;
 if (dir === null) {
  // A repository or a folder of several skills: the one asked for by name, or the only one.
  const named = want ? skills.filter(item => path.posix.basename(item) === want) : [];
  if (named.length === 1) dir = named[0];
  else if (skills.length === 1) dir = skills[0];
  else {
   const names = skills.map(item => path.posix.basename(item) || repo);
   const error = new Refusal(`This link holds ${skills.length} skills${want ? `, and none of them is called ${want}` : ''}. Say which one to add by its name: ${names.slice(0, 60).join(', ')}${names.length > 60 ? ', …' : ''}.`);
   error.choices = names;
   throw error;
  }
 }
 const prefix = dir ? `${dir}/` : '';
 const own = blobs.filter(item => (!dir || item.path.startsWith(prefix)) && !item.path.slice(prefix.length).split('/').some(part => SKIP.has(part)));
 // A skill at the top of a repository: the repository's other skills, if any, are not a part of it.
 const others = skills.filter(item => item !== dir && (!dir || item.startsWith(prefix))).map(item => `${item}/`);
 const mine = own.filter(item => !others.some(other => item.path.startsWith(other)));
 if (mine.length > LIMIT.files) throw new Refusal(`This skill has ${mine.length} files, more than the ${LIMIT.files} a skill may have here.`);
 const total = mine.reduce((sum, item) => sum + (item.size || 0), 0);
 if (total > LIMIT.bytes) throw new Refusal(`This skill takes ${Math.round(total / 1048576)} MB, more than the ${LIMIT.bytes / 1048576} MB a skill may take here.`);
 const out = new Map();
 const queue = mine.slice();
 const worker = async () => {
  for (let item; (item = queue.shift());) {
   const url = `https://raw.githubusercontent.com/${owner}/${repo}/${tree.sha}/${item.path.split('/').map(encodeURIComponent).join('/')}`;
   out.set(item.path.slice(prefix.length), await get(url, 'buffer'));
  }
 };
 await Promise.all(Array.from({ length: 6 }, worker));
 return { files: out, folder: path.posix.basename(dir) || repo, source: `https://github.com/${owner}/${repo}/tree/${ref}${dir ? `/${dir}` : ''}` };
}

// A .zip (a .skill file is one too): its central directory read straight from the bytes; stored and deflated entries.
function unzip(buffer) {
 let end = -1;
 for (let k = buffer.length - 22; k >= Math.max(0, buffer.length - 65557); k--) if (buffer.readUInt32LE(k) === 0x06054b50) { end = k; break; }
 if (end < 0) throw new Refusal('This file is not a zip archive.');
 const count = buffer.readUInt16LE(end + 10);
 let at = buffer.readUInt32LE(end + 16);
 const out = new Map();
 let total = 0;
 for (let n = 0; n < count; n++) {
  if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Refusal('This zip archive is damaged.');
  const method = buffer.readUInt16LE(at + 10), packed = buffer.readUInt32LE(at + 20), size = buffer.readUInt32LE(at + 24);
  const nameLength = buffer.readUInt16LE(at + 28), extra = buffer.readUInt16LE(at + 30), note = buffer.readUInt16LE(at + 32), local = buffer.readUInt32LE(at + 42);
  const name = buffer.toString('utf8', at + 46, at + 46 + nameLength).replace(/\\/g, '/');
  at += 46 + nameLength + extra + note;
  if (name.endsWith('/')) continue;
  if (out.size >= LIMIT.files) throw new Refusal(`This archive has more than the ${LIMIT.files} files a skill may have here.`);
  total += size;
  if (size > LIMIT.file || total > LIMIT.bytes) throw new Refusal('This archive is too large for a skill.');
  const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
  const data = buffer.subarray(start, start + packed);
  if (method === 0) out.set(name, Buffer.from(data));
  else if (method === 8) out.set(name, zlib.inflateRawSync(data, { maxOutputLength: LIMIT.file }));
  else throw new Refusal('This archive is packed in a way the app cannot open.');
 }
 return out;
}

// The skill in an archive: the folder of the SKILL.md nearest its top.
function fromZip(entries, fallback, want) {
 const skills = [...entries.keys()].filter(name => path.posix.basename(name) === FILE).map(name => path.posix.dirname(name)).map(dir => dir === '.' ? '' : dir);
 if (!skills.length) throw new Refusal('There is no SKILL.md in this archive.');
 const named = want ? skills.filter(item => path.posix.basename(item) === want) : [];
 // Several skills side by side at the top: one has to be named.
 const top = Math.min(...skills.map(item => item ? item.split('/').length : 0));
 const shallow = skills.filter(item => (item ? item.split('/').length : 0) === top);
 const dir = named.length === 1 ? named[0] : shallow.length === 1 ? shallow[0] : null;
 if (dir === null) {
  const names = shallow.map(item => path.posix.basename(item));
  const error = new Refusal(`This archive holds ${shallow.length} skills. Say which one to add by its name: ${names.join(', ')}.`);
  error.choices = names;
  throw error;
 }
 const prefix = dir ? `${dir}/` : '';
 const files = new Map();
 for (const [name, data] of entries) if (name.startsWith(prefix) && !name.slice(prefix.length).split('/').some(part => SKIP.has(part) || part === '__MACOSX')) files.set(name.slice(prefix.length), data);
 return { files, folder: path.posix.basename(dir) || fallback };
}

const safeName = name => String(name || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);

// Programs a skill may bring along: what runs, as opposed to what is read.
const RUNS = /\.(py|sh|bash|zsh|js|mjs|cjs|ts|ps1|psm1|bat|cmd|exe|rb|pl|php|jar)$/i;
// A skill fetched and waiting for the user's word (prepare), by its token; let go after a while if no word comes.
const staged = new Map();
const STAGED_FOR = 30 * 60 * 1000;

// The skill's own pages for the card to fan out: SKILL.md, flanked by a document and a program of the skill when it
// has them, each as its name and the start of its text. A file read as text only; a licence is no page.
const PAGE = { text: /\.(md|markdown|txt|py|js|mjs|cjs|ts|sh|ps1|rb|json|ya?ml|html|css)$/i, chars: 420, docs: /\.(md|markdown|txt)$/i };
function pages(files, list, body) {
 const readable = list.filter(name => PAGE.text.test(name) && !/^licen[cs]e/i.test(path.posix.basename(name)));
 const docs = readable.filter(name => PAGE.docs.test(name)), program = readable.find(name => RUNS.test(name));
 const names = [docs[0], FILE, program, docs[1]].filter(Boolean);
 return names.map(name => ({ name, text: (name === FILE ? body : files.get(name)?.toString('utf8') || '').replace(/\r\n?/g, '\n').slice(0, PAGE.chars) }));
}

// Fetches a skill from `url` and writes it beside ~/.agents/skills, not yet among the skills: the user is shown what it
// is first (the chat's card), and it goes in with commit or away with discard. `name`: which one, when the link holds
// several. A skill of that name that the app put in before is replaced on commit (an update); one the user put there
// some other way is left alone.
async function prepare(url, name = '') {
 try {
  const link = String(url || '').trim();
  if (!/^https?:\/\//i.test(link)) throw new Refusal('This is not a link: a skill is added from a web address (GitHub, a .zip or .skill file, or a SKILL.md).');
  const want = safeName(name);
  let found;
  const hub = github(link);
  const archive = /\.(zip|skill)(?:[?#]|$)/i.test(link);
  if (hub && !archive) found = await fromGithub(hub, want);
  else {
   const data = await get(link, 'buffer');
   if (archive || data.readUInt32LE(0) === 0x04034b50) found = fromZip(unzip(data), path.basename(new URL(link).pathname).replace(/\.(zip|skill)$/i, ''), want);
   else found = { files: new Map([[FILE, data]]), folder: path.posix.basename(path.posix.dirname(new URL(link).pathname)) || 'skill' };
   found.source = link;
  }
  const text = found.files.get(FILE)?.toString('utf8');
  const info = text && describe(text, found.folder);
  if (!info) throw new Refusal('The SKILL.md found there is not a skill: it has no head with a name and a description.');
  const folder = safeName(info.name) || safeName(found.folder);
  if (!folder) throw new Refusal('This skill has no name the app can use for its folder.');
  const target = path.join(HOME, folder);
  let had = false;
  try {
   await fs.promises.access(target);
   had = true;
   const mark = JSON.parse(await fs.promises.readFile(path.join(target, MARK), 'utf8').catch(() => 'null'));
   if (!mark) throw new Refusal(`A skill called ${folder} is already there, in ${target}, and the app did not put it there, so it is left as it is.`);
  } catch (error) {
   if (error instanceof Refusal) throw error;
  }
  // Written beside the place first, then moved in: a skill is never half there.
  await fs.promises.mkdir(HOME, { recursive: true });
  const fresh = path.join(HOME, `.${folder}.${process.pid}.${Date.now()}`);
  let bytes = 0;
  for (const [name, data] of found.files) {
   const to = path.resolve(fresh, name);
   if (!within(to, fresh)) continue;
   await fs.promises.mkdir(path.dirname(to), { recursive: true });
   await fs.promises.writeFile(to, data);
   bytes += data.length;
  }
  await fs.promises.writeFile(path.join(fresh, MARK), JSON.stringify({ source: found.source, added: Date.now() }, null, 1));
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const timer = setTimeout(() => discard(token), STAGED_FOR);
  staged.set(token, { fresh, target, folder, had, timer });
  const list = [...found.files.keys()].filter(item => item !== FILE).sort();
  const hubbed = github(found.source || link);
  return {
   token,
   skill: {
    ...info, folder, updated: had, bytes, files: list.slice(0, LIMIT.listed), count: list.length,
    scripts: list.filter(item => RUNS.test(item) || item.startsWith('scripts/')),
    source: found.source || link, from: hubbed ? `${hubbed.owner}/${hubbed.repo}` : (() => { try { return new URL(link).host; } catch { return ''; } })(),
    body: (frontmatter(text)?.body || '').slice(0, 1600),
    pages: pages(found.files, list, frontmatter(text)?.body || ''),
   },
  };
 } catch (error) {
  if (error instanceof Refusal) return { error: error.message, choices: error.choices };
  return { error: `The skill could not be downloaded: ${error.message}` };
 }
}

// The user said yes: the skill fetched by prepare goes in among the skills.
async function commit(token) {
 const entry = staged.get(token);
 if (!entry) return { error: 'This skill is no longer waiting to be added: add it again.' };
 staged.delete(token);
 clearTimeout(entry.timer);
 const { fresh, target, folder, had } = entry;
 try {
  if (had) {
   const old = path.join(HOME, `.${folder}.old.${Date.now()}`);
   await fs.promises.rename(target, old);
   await fs.promises.rename(fresh, target);
   await fs.promises.rm(old, { recursive: true, force: true });
  } else await fs.promises.rename(fresh, target);
  const skill = await load(target, 'agents');
  return { skill: { ...skill, files: await files(target) }, updated: had };
 } catch (error) {
  return { error: `The skill could not be put in place: ${error.message}` };
 }
}

// The user said no, or never answered: what prepare fetched goes away.
async function discard(token) {
 const entry = staged.get(token);
 if (!entry) return false;
 staged.delete(token);
 clearTimeout(entry.timer);
 await fs.promises.rm(entry.fresh, { recursive: true, force: true }).catch(() => {});
 return true;
}

// Fetched and put in at once, with nobody asked: for the harnesses.
async function install(url, name = '') {
 const ready = await prepare(url, name);
 return ready.token ? commit(ready.token) : ready;
}

function setup({ fromApp, chats, changed }) {
 ipcMain.handle('skills:list', (event, cwd) => fromApp(event) ? list(cwd, chats).then(items => items.map(({ file, ...item }) => item)) : []);
 ipcMain.handle('skills:read', (event, name, cwd) => fromApp(event) ? read(String(name || ''), cwd, chats) : null);
 ipcMain.handle('skills:prepare', (event, url, name) => fromApp(event) ? prepare(url, name) : { error: 'Not allowed' });
 ipcMain.handle('skills:commit', async (event, token) => {
  if (!fromApp(event)) return { error: 'Not allowed' };
  const result = await commit(String(token || ''));
  if (result.skill) changed?.();
  return result;
 });
 ipcMain.handle('skills:discard', (event, token) => fromApp(event) ? discard(String(token || '')) : false);
}

// What was fetched and never answered goes away with the app.
app.on('will-quit', () => { for (const { fresh } of staged.values()) { try { fs.rmSync(fresh, { recursive: true, force: true }); } catch {} } });

module.exports = { setup, list, read, prepare, commit, discard, install, frontmatter, describe, unzip, HOME };
