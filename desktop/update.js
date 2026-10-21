'use strict';

// A new version of the app, from its releases on GitHub, with no library of updates. The app looks there a while after
// it starts and then every three hours, fetches the newest version's file for this system in the background and checks
// it against the sum GitHub keeps for that file; the button at the top of the chat (update-pill.js) shows how much has
// come and, once all of it has, puts it in when pressed:
// - Windows: the installer is started as an update and the app quits. The installer (electron-builder's NSIS, one
//   click) puts the new version in place of this one and opens it: --updated asks nothing and closes the app if it is
//   still there, --force-run opens it after.
// - macOS: the app is not signed by a developer Apple knows, and such an app has no way to replace itself; the disk
//   image is opened for the app to be dragged into Applications, and the app quits so that it can be replaced.
// - Linux: the archive has no installer; the release's page is opened.
// Nothing is put in while an agent is at work, in the window or in the quick chat: the button waits for it to finish.
// From source the app takes itself for the installed one only to look and fetch (OPENGHOST_UPDATE_AS names the version
// it then takes itself for), and puts nothing in: that would update the installed copy, not the one running.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const REPO = 'ANDRETRIPOL/OpenGhost';
// The newest few: the releases are all marked as previews, and GitHub's "latest" leaves previews out.
const RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=5`;
const DOWNLOADS = `https://github.com/${REPO}/releases/download/`;
const PAGES = `https://github.com/${REPO}/releases/`;
// first: the look after the start; every: the looks after it; wait: how often a button pressed while an agent works
// asks again whether it has finished.
const TIMES = { first: 30 * 1000, every: 3 * 60 * 60 * 1000, wait: 2000 };
const FILES = { win32: /-Setup\.exe$/, darwin: /-mac\.dmg$/, linux: /-linux\.tar\.gz$/ };
const SUM = /^sha256:([0-9a-f]{64})$/i;

const parts = version => String(version || '').replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(part => Number.parseInt(part, 10) || 0);

// Whether version a comes after version b.
function newer(a, b) {
 const x = parts(a), y = parts(b);
 for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
 return false;
}

// The newest release after `current` with a file for this system, uploaded whole, from the app's own releases and with
// its sum. Linux needs only the release's page.
function pick(releases, platform, current) {
 let best = null;
 for (const release of Array.isArray(releases) ? releases : []) {
  const version = String(release?.tag_name || '').replace(/^v/i, '');
  if (!release || release.draft || !/^\d+\.\d+\.\d+$/.test(version) || !newer(version, current) || (best && !newer(version, best.version))) continue;
  const page = String(release.html_url || '');
  const file = (Array.isArray(release.assets) ? release.assets : []).find(asset => FILES[platform]?.test(asset?.name) && asset.state === 'uploaded');
  if (!page.startsWith(PAGES) || !file) continue;
  const url = String(file.browser_download_url || ''), sum = SUM.exec(file.digest || '')?.[1].toLowerCase() || '';
  if (platform !== 'linux' && (!sum || !url.startsWith(DOWNLOADS) || !/^[\w.-]+$/.test(file.name))) continue;
  best = { version, name: file.name, url, size: Number(file.size) || 0, sum, page };
 }
 return best;
}

function sumOf(file) {
 return new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', chunk => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
 });
}

// host: { fetch(url, init), dir (where the files are kept), platform, version (this one), run(file, args) (starts the
// installer; resolves once it has started), open(file) (resolves to '' once opened, or to what went wrong), browse(url),
// quit(), busy() (an agent at work), send(view) (to the page), log(text), times }.
// phase: none, down (coming), ready, after (pressed, waiting for the agents), going (being put in).
function create(host) {
 const times = { ...TIMES, ...host.times };
 const log = host.log || (() => {});
 let phase = 'none', offer = null, got = 0, size = 0, shown = -1, job = null, waiting = null, timers = [];

 const view = () => phase === 'none' ? { phase } : { phase, version: offer.version, platform: host.platform, share: phase === 'down' ? (size ? Math.min(1, got / size) : 0) : 1 };
 const go = next => {
  phase = next;
  shown = -1;
  host.send(view());
 };
 const headers = { 'User-Agent': `OpenGhost/${host.version}` };

 async function check() {
  if (phase === 'after' || phase === 'going') return;
  let found = null;
  try {
   const response = await host.fetch(RELEASES, { headers: { ...headers, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
   if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
   found = pick(await response.json(), host.platform, host.version);
  } catch (error) {
   log(`Update: no look at the releases: ${error.message}`);
   return;
  }
  // The same version on its way or there already is let be; a newer one takes its place, and one that failed to come
  // is fetched again.
  if (!found || phase === 'after' || phase === 'going' || (phase !== 'none' && !newer(found.version, offer.version))) return;
  job?.abort();
  job = null;
  offer = found;
  if (host.platform === 'linux') go('ready');
  else fetchFile(found);
 }

 async function fetchFile(found) {
  const controller = new AbortController(), own = { abort: () => controller.abort() };
  job = own;
  const file = path.join(host.dir, found.name), part = `${file}.part`;
  try {
   await fs.promises.mkdir(host.dir, { recursive: true });
   // What an earlier version left here goes.
   for (const name of await fs.promises.readdir(host.dir)) if (name !== found.name) await fs.promises.rm(path.join(host.dir, name), { force: true, recursive: true });
   // Fetched whole before, at an earlier start: it only has to match.
   if (fs.existsSync(file) && await sumOf(file) === found.sum) {
    if (job === own) { job = null; go('ready'); }
    return;
   }
   await fs.promises.rm(file, { force: true });
   got = 0;
   size = found.size;
   go('down');
   const response = await host.fetch(found.url, { headers, redirect: 'follow', signal: controller.signal });
   if (!response.ok || !response.body) throw new Error(`the file answered ${response.status}`);
   size = Number(response.headers.get('content-length')) || found.size;
   const hash = crypto.createHash('sha256');
   const count = new Transform({
    transform(chunk, encoding, done) {
     hash.update(chunk);
     got += chunk.length;
     // The page is told each new whole percent, not each piece.
     const percent = size ? Math.floor(Math.min(1, got / size) * 100) : 0;
     if (percent !== shown && job === own) { shown = percent; host.send(view()); }
     done(null, chunk);
    },
   });
   await pipeline(Readable.fromWeb(response.body), count, fs.createWriteStream(part), { signal: controller.signal });
   if (hash.digest('hex') !== found.sum) throw new Error('the file does not match its sum');
   await fs.promises.rename(part, file);
   if (job === own) { job = null; go('ready'); }
  } catch (error) {
   await fs.promises.rm(part, { force: true }).catch(() => {});
   // Let go of for a newer version, it is not the one that failed.
   if (job !== own) return;
   job = null;
   go('none');
   log(`Update: ${found.name} did not come: ${error.message}`);
  }
 }

 // Pressed: put in now, or once the agents have finished; pressed again while it waits, it does not.
 function install() {
  if (phase === 'after') {
   clearInterval(waiting);
   waiting = null;
   go('ready');
  } else if (phase === 'ready') {
   if (host.busy()) {
    go('after');
    waiting = setInterval(() => {
     if (host.busy()) return;
     clearInterval(waiting);
     waiting = null;
     put();
    }, times.wait);
   } else put();
  }
  return view();
 }

 async function put() {
  if (host.platform === 'linux') {
   host.browse(offer.page);
   go('ready');
   return;
  }
  go('going');
  const file = path.join(host.dir, offer.name);
  try {
   // Checked again: the file has lain on the disk since it came.
   if (await sumOf(file) !== offer.sum) throw new Error('the file has changed since it came');
   if (host.platform === 'win32') await host.run(file, ['--updated', '--force-run']);
   else {
    const failed = await host.open(file);
    if (failed) throw new Error(failed);
   }
   host.quit();
  } catch (error) {
   log(`Update: ${offer.name} was not put in: ${error.message}`);
   await fs.promises.rm(file, { force: true }).catch(() => {});
   go('none');
  }
 }

 return {
  view,
  install,
  check,
  start() {
   timers = [setTimeout(check, times.first), setInterval(check, times.every)];
  },
  stop() {
   for (const timer of timers) { clearTimeout(timer); clearInterval(timer); }
   clearInterval(waiting);
   job?.abort();
  },
 };
}

// host: { fromApp, window() (the main window, if there is one), busy() (an agent at work), dir (for tests) }.
function setup(host) {
 const { app, ipcMain, net, shell } = require('electron');
 const { spawn } = require('node:child_process');
 const as = app.isPackaged ? '' : process.env.OPENGHOST_UPDATE_AS || '';
 const dry = !app.isPackaged;
 // On Windows the installer is kept with the computer's own data, not the user's roaming one, as installers are.
 const dir = host.dir || (process.platform === 'win32' && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'OpenGhost Updates') : path.join(app.getPath('temp'), 'OpenGhost Updates'));
 const core = create({
  fetch: (url, init) => net.fetch(url, init),
  dir,
  platform: process.platform,
  version: as || app.getVersion(),
  run: (file, args) => dry ? (console.log(`Update (from source, nothing put in): would run ${file} ${args.join(' ')}`), Promise.resolve())
   : new Promise((resolve, reject) => {
    const child = spawn(file, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
   }),
  open: file => dry ? (console.log(`Update (from source, nothing put in): would open ${file}`), Promise.resolve('')) : shell.openPath(file),
  browse: url => shell.openExternal(url),
  quit: () => dry ? console.log('Update (from source): would quit') : app.quit(),
  busy: host.busy,
  send: view => {
   const win = host.window();
   if (win && !win.isDestroyed()) win.webContents.send('update:state', view);
  },
  log: text => console.log(text),
 });
 ipcMain.handle('update:state', event => host.fromApp(event) ? core.view() : null);
 ipcMain.handle('update:install', event => host.fromApp(event) ? core.install() : null);
 if (app.isPackaged || as) core.start();
 return core;
}

module.exports = { setup, create, pick, newer, TIMES };
