'use strict';

// Rules (rules.js in the page): what the app itself does at moments of the agent's work — before a step, after it,
// when the agent wants to finish, and so on — whatever the model thinks. Here, in the main process: where they are kept,
// and the handlers that run outside the page.
//
// Kept as JSON, the user's in ~/OpenGhost/rules.json, a project's in <project>/.openghost/rules.json. A command handler
// is run as Claude Code runs its hooks (code.claude.com/docs/en/hooks): the moment as JSON on its standard input, its
// answer read from the exit code (0 goes on, 2 blocks with standard error as the reason) and from standard output (one
// JSON object, or plain text), CLAUDE_PROJECT_DIR set to the chat's folder; an http handler gets the same JSON posted to
// it. So a hook written for Claude Code runs here as it is. The hooks of Claude Code's own settings files are read too,
// for the user to bring them over (import), never run from there.
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ipcMain, BrowserWindow } = require('electron');

const HOME = () => path.join(os.homedir(), 'OpenGhost');
const FILE = () => path.join(HOME(), 'rules.json');
const LOG = () => path.join(HOME(), 'rules.log');
const PROJECT = path.join('.openghost', 'rules.json');
const CLAUDE = ['settings.json', 'settings.local.json'];
const WINDOWS = process.platform === 'win32';
// A handler's output is kept up to this much of each stream; Claude Code keeps 10 000 characters of a hook's text.
const KEEP = 64 * 1024;
const LOG_MOST = 2 * 1024 * 1024;
const jobs = new Map();
let watcher = null, gitBash;

const ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(ELECTRON_|npm_)/i.test(name)));

function readJson(file) {
 try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (error) { return error.code === 'ENOENT' ? null : { error: error.message }; }
}

function writeJson(file, data) {
 fs.mkdirSync(path.dirname(file), { recursive: true });
 const temp = `${file}.${process.pid}.tmp`;
 fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
 fs.renameSync(temp, file);
}

// The user's rules, and a project's: { rules: [...] }, or { rules: [], error } when the file is there but unreadable.
function read() {
 const data = readJson(FILE());
 if (!data) return { file: FILE(), rules: [] };
 if (data.error) return { file: FILE(), rules: [], error: data.error };
 return { file: FILE(), rules: Array.isArray(data.rules) ? data.rules : [], hooks: data.hooks || null };
}

function write(rules) {
 const data = readJson(FILE());
 writeJson(FILE(), { ...(data && !data.error ? data : {}), version: 1, rules });
 return read();
}

// A project's rules run commands on this computer, and a project may come from anyone (a repository cloned, a folder
// sent): as Claude Code holds a folder's hooks back until the folder is trusted, a project's rules run only once the
// user has trusted them — this very file, as it is. Trust is kept by the file's contents (~/OpenGhost/trusted.json):
// when the file changes, it is asked for again. Rules the user writes here in the app are trusted as they are saved.
const TRUST = () => path.join(HOME(), 'trusted.json');
const hashOf = file => { try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return ''; } };
const trustKey = folder => path.resolve(folder).toLowerCase();
function trustedHash(folder) {
 const data = readJson(TRUST());
 return data && !data.error ? data[trustKey(folder)] || '' : '';
}
function trust(folder) {
 const file = path.join(folder, PROJECT), hash = hashOf(file), data = readJson(TRUST());
 writeJson(TRUST(), { ...(data && !data.error ? data : {}), [trustKey(folder)]: hash });
 return hash;
}

function project(folder) {
 if (!folder || !path.isAbsolute(folder)) return { rules: [] };
 const file = path.join(folder, PROJECT), data = readJson(file);
 if (!data) return { file, rules: [] };
 if (data.error) return { file, rules: [], error: data.error };
 const hash = hashOf(file);
 return { file, rules: Array.isArray(data.rules) ? data.rules : [], hooks: data.hooks || null, trusted: !!hash && trustedHash(folder) === hash };
}

function writeProject(folder, rules) {
 if (!folder || !path.isAbsolute(folder)) return { rules: [] };
 const file = path.join(folder, PROJECT), data = readJson(file);
 // Saving from the app keeps the trust only of a file that was trusted before (or is new): an untrusted file's rules
 // are not made trusted by being edited.
 const was = !data || project(folder).trusted;
 writeJson(file, { ...(data && !data.error ? data : {}), version: 1, rules });
 if (was) trust(folder);
 return project(folder);
}

// Claude Code's settings that hold hooks, the user's and the project's: what is found there, as it is written.
function claude(folder) {
 const places = [path.join(os.homedir(), '.claude')];
 if (folder && path.isAbsolute(folder)) places.push(path.join(folder, '.claude'));
 const found = [];
 for (const dir of places) for (const name of CLAUDE) {
  const file = path.join(dir, name), data = readJson(file);
  if (data && !data.error && data.hooks && typeof data.hooks === 'object') found.push({ file, scope: dir === places[0] ? 'user' : 'project', hooks: data.hooks });
 }
 return found;
}

// --- Running a handler --------------------------------------------------------------------------------------------

function kill(child) {
 if (!child?.pid || child.exitCode !== null) return;
 if (WINDOWS) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
 else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}

// Git Bash, where Claude Code would run a hook written for bash on Windows.
function findGitBash() {
 if (gitBash !== undefined) return gitBash;
 const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
 gitBash = roots.map(root => path.join(root, 'Git', 'bin', 'bash.exe')).find(file => fs.existsSync(file)) || null;
 return gitBash;
}

// How a command is started: as a program with its arguments (`args`), or by a shell — bash (Git Bash on Windows when
// it is there), PowerShell (`shell: "powershell"`, or Windows without Git Bash), sh elsewhere.
function launcher(handler) {
 const command = String(handler.command || '');
 if (Array.isArray(handler.args)) return { exe: command, args: handler.args.map(String) };
 if (handler.shell === 'powershell' || (WINDOWS && !findGitBash())) {
  const pwsh = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe');
  const exe = WINDOWS ? (fs.existsSync(pwsh) ? pwsh : 'powershell.exe') : 'pwsh';
  // Run with -Command, PowerShell ends with 1 when a script it called ended with `exit 2`: the script's own code is
  // passed on, as running it with -File would, so a hook's exit 2 blocks here as it does in Claude Code.
  const passed = `${command}\nif ($global:LASTEXITCODE) { exit $global:LASTEXITCODE }`;
  return { exe, args: [...(WINDOWS ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'] : ['-NoLogo', '-NoProfile', '-NonInteractive']), '-Command', passed] };
 }
 if (WINDOWS) return { exe: findGitBash(), args: ['-c', command] };
 return { exe: handler.shell === 'bash' && fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh', args: ['-c', command] };
}

// ${VAR} and $VAR in a command or a header, from the handler's own environment.
const fill = (text, env) => String(text).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (all, name) => env[name] ?? '');

// One handler, with the moment's JSON. → { code, stdout, stderr, timedOut, error, ms }
function runCommand(id, handler, input, { cwd, env: extra = {} }) {
 return new Promise(resolve => {
  const env = { ...ENV, CLAUDE_PROJECT_DIR: cwd || os.homedir(), OPENGHOST_PROJECT_DIR: cwd || os.homedir(), ...extra };
  const how = launcher({ ...handler, command: Array.isArray(handler.args) ? handler.command : fill(handler.command, env) });
  const started = Date.now();
  let child, stdout = '', stderr = '', done = false, timedOut = false;
  const dir = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
  try {
   child = spawn(how.exe, how.args.map(arg => fill(arg, env)), { cwd: dir, env, windowsHide: true, detached: !WINDOWS, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
   resolve({ code: null, stdout: '', stderr: '', error: error.message, ms: 0 });
   return;
  }
  const seconds = Math.max(1, Math.min(3600, Number(handler.timeout) || 600));
  const timer = setTimeout(() => { timedOut = true; kill(child); }, seconds * 1000);
  const finish = result => {
   if (done) return;
   done = true;
   clearTimeout(timer);
   jobs.delete(id);
   resolve({ stdout, stderr, timedOut, ms: Date.now() - started, ...result });
  };
  if (id) jobs.set(id, () => kill(child));
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { if (stdout.length < KEEP) stdout += chunk.slice(0, KEEP - stdout.length); });
  child.stderr.on('data', chunk => { if (stderr.length < KEEP) stderr += chunk.slice(0, KEEP - stderr.length); });
  child.on('error', error => finish({ code: null, error: error.code === 'ENOENT' ? `${how.exe} was not found` : error.message }));
  child.on('close', code => finish({ code: timedOut ? null : code }));
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(input));
 });
}

async function runHttp(id, handler, input, { cwd }) {
 const started = Date.now(), allowed = new Set(Array.isArray(handler.allowedEnvVars) ? handler.allowedEnvVars : []);
 const env = Object.fromEntries(Object.entries({ ...ENV, CLAUDE_PROJECT_DIR: cwd || '' }).filter(([name]) => allowed.has(name)));
 const headers = { 'Content-Type': 'application/json' };
 for (const [name, value] of Object.entries(handler.headers || {})) headers[name] = String(value).replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (all, key) => env[key] ?? '');
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(3600, Number(handler.timeout) || 600)) * 1000);
 if (id) jobs.set(id, () => controller.abort());
 try {
  const response = await fetch(String(handler.url), { method: 'POST', headers, body: JSON.stringify(input), signal: controller.signal });
  const text = (await response.text()).slice(0, KEEP);
  return { http: response.status, stdout: text, stderr: '', code: response.ok ? 0 : 1, ms: Date.now() - started };
 } catch (error) {
  return { code: null, stdout: '', stderr: '', error: error.name === 'AbortError' ? 'timed out' : error.message, timedOut: error.name === 'AbortError', ms: Date.now() - started };
 } finally {
  clearTimeout(timer);
  jobs.delete(id);
 }
}

function runHandler(id, handler, input, options) {
 if (handler?.type === 'http') return runHttp(id, handler, input, options);
 if (handler?.type === 'command' && handler.command) return runCommand(id, handler, input, options);
 return Promise.resolve({ code: null, stdout: '', stderr: '', error: `A ${handler?.type || 'handler'} is not run here` });
}

// The rules' journal: one line of JSON for each time a rule acted, kept short.
function log(line) {
 try {
  fs.mkdirSync(HOME(), { recursive: true });
  const file = LOG();
  try { if (fs.statSync(file).size > LOG_MOST) fs.renameSync(file, `${file}.1`); } catch {}
  fs.appendFileSync(file, `${JSON.stringify({ at: Date.now(), ...line })}\n`);
 } catch {}
}

function journal(since = 0) {
 const out = [];
 for (const file of [`${LOG()}.1`, LOG()]) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const line of text.split('\n')) {
   if (!line) continue;
   try { const item = JSON.parse(line); if (item.at >= since) out.push(item); } catch {}
  }
 }
 return out.slice(-2000);
}

function watch(changed) {
 try {
  fs.mkdirSync(HOME(), { recursive: true });
  watcher?.close();
  let timer = 0;
  watcher = fs.watch(HOME(), (kind, name) => {
   if (name !== 'rules.json') return;
   clearTimeout(timer);
   timer = setTimeout(changed, 150);
  });
 } catch {}
}

function setup(fromApp) {
 const tell = () => { for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('rules:changed'); };
 watch(tell);
 ipcMain.handle('rules:read', event => fromApp(event) ? read() : { rules: [] });
 ipcMain.handle('rules:write', (event, rules) => fromApp(event) && Array.isArray(rules) ? write(rules) : null);
 ipcMain.handle('rules:project', (event, folder) => fromApp(event) ? project(folder) : { rules: [] });
 ipcMain.handle('rules:write-project', (event, folder, rules) => fromApp(event) && Array.isArray(rules) ? writeProject(folder, rules) : null);
 ipcMain.handle('rules:trust', (event, folder) => fromApp(event) && folder && path.isAbsolute(folder) ? (trust(folder), project(folder)) : null);
 ipcMain.handle('rules:claude', (event, folder) => fromApp(event) ? claude(folder) : []);
 ipcMain.handle('rules:run', (event, id, handler, input, options) => fromApp(event) ? runHandler(String(id || ''), handler, input, options || {}) : { code: null, error: 'Not allowed' });
 ipcMain.handle('rules:cancel', (event, id) => { if (fromApp(event)) jobs.get(id)?.(); });
 ipcMain.handle('rules:log', (event, line) => { if (fromApp(event) && line && typeof line === 'object') log(line); });
 ipcMain.handle('rules:journal', (event, since) => fromApp(event) ? journal(Number(since) || 0) : []);
 ipcMain.handle('rules:file', event => fromApp(event) ? FILE() : '');
}

module.exports = { setup, read, write, project, claude, runHandler, launcher, FILE };
