'use strict';
// A new version of the app (desktop/update.js): which release is taken, the file fetched with its share told as it
// comes, checked against its sum, kept for the next start, let go of for a newer version; putting it in on each system,
// at once or once the agents have finished. GitHub is a fixture serving real Responses; the files go to a temporary
// folder; nothing is started or opened, the host's hands only write down what they were asked.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Update = require('../desktop/update.js');

const results = [];
const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (test, ms = 3000) => { const end = Date.now() + ms; while (!test() && Date.now() < end) await sleep(5); return test(); };
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const REPO = 'https://github.com/ANDRETRIPOL/OpenGhost/releases';

const asset = (name, bytes, extra = {}) => ({ name, size: bytes.length, state: 'uploaded', digest: `sha256:${sha(bytes)}`, browser_download_url: `${REPO}/download/v${extra.version || '9.9.9'}/${name}`, ...extra });
const release = (version, assets, extra = {}) => ({ tag_name: `v${version}`, draft: false, prerelease: true, html_url: `${REPO}/tag/v${version}`, assets, ...extra });

// GitHub: the releases' list, and each file in pieces of 64 KB; a file may be held back until let go.
function github({ releases, files = {}, status = 200, hold = null }) {
 const asked = [];
 const fetch = async (url, init = {}) => {
  asked.push(url);
  if (url.startsWith('https://api.github.com/')) return new Response(JSON.stringify(releases), { status, headers: { 'content-type': 'application/json' } });
  const bytes = files[url];
  if (!bytes) return new Response('Not Found', { status: 404 });
  let at = 0;
  const body = new ReadableStream({
   async pull(controller) {
    if (hold && at >= bytes.length / 2) await hold.promise;
    if (init.signal?.aborted) { controller.error(new Error('aborted')); return; }
    if (at >= bytes.length) { controller.close(); return; }
    controller.enqueue(new Uint8Array(bytes.subarray(at, at + 65536)));
    at += 65536;
   },
  });
  return new Response(body, { status: 200, headers: { 'content-length': String(bytes.length) } });
 };
 return { fetch, asked };
}

function host(platform, server, dir, busy = () => false) {
 const did = { sent: [], ran: [], opened: [], browsed: [], quit: 0, logs: [], open: '' };
 const core = Update.create({
  fetch: server.fetch, dir, platform, version: '1.4.9',
  run: async (file, args) => { did.ran.push([path.basename(file), ...args]); },
  open: async file => { did.opened.push(path.basename(file)); return did.open; },
  browse: url => did.browsed.push(url),
  quit: () => { did.quit++; },
  busy, send: view => did.sent.push(view), log: text => did.logs.push(text), times: { wait: 20 },
 });
 return { core, did };
}

async function main() {
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-update-'));
 const setup = Buffer.alloc(300 * 1024 + 123, 7), dmg = Buffer.alloc(200 * 1024, 9);

 // Which release.
 const list = [
  release('1.5.1', [asset('OpenGhost-1.5.1-Setup.exe', setup, { version: '1.5.1' })], { draft: true }),
  release('1.5.0', [asset('OpenGhost-1.5.0-Setup.exe', setup, { version: '1.5.0' }), asset('OpenGhost-1.5.0-mac.dmg', dmg, { version: '1.5.0' }), { name: 'OpenGhost-1.5.0-linux.tar.gz', state: 'uploaded', size: 5, html_url: '' }]),
  release('1.4.10', [asset('OpenGhost-1.4.10-Setup.exe', setup, { version: '1.4.10' })]),
  release('1.4.9', [asset('OpenGhost-1.4.9-Setup.exe', setup, { version: '1.4.9' })]),
 ];
 check('The newest release after this one, a draft left out', Update.pick(list, 'win32', '1.4.9')?.version, '1.5.0');
 check('1.4.10 comes after 1.4.9', [Update.newer('1.4.10', '1.4.9'), Update.newer('v1.5.0', '1.4.9'), Update.newer('1.4.9', '1.4.9'), Update.newer('1.4.8', '1.4.9')], [true, true, false, false]);
 check('Each system takes its own file', ['win32', 'darwin', 'linux'].map(p => Update.pick(list, p, '1.4.9')?.name), ['OpenGhost-1.5.0-Setup.exe', 'OpenGhost-1.5.0-mac.dmg', 'OpenGhost-1.5.0-linux.tar.gz']);
 check('Nothing when this version is the newest', Update.pick(list.slice(3), 'win32', '1.4.9'), null);
 const without = (change) => Update.pick([release('1.5.0', [{ ...asset('OpenGhost-1.5.0-Setup.exe', setup, { version: '1.5.0' }), ...change }])], 'win32', '1.4.9');
 check('A file still uploading, without a sum, or from elsewhere is not taken', [without({ state: 'starter' }), without({ digest: null }), without({ digest: 'md5:abc' }), without({ browser_download_url: 'https://example.com/OpenGhost-1.5.0-Setup.exe' })], [null, null, null, null]);
 check('A release whose page is elsewhere is not taken', Update.pick([release('1.5.0', [asset('OpenGhost-1.5.0-Setup.exe', setup, { version: '1.5.0' })], { html_url: 'https://example.com/x' })], 'win32', '1.4.9'), null);
 check('Odd answers are nothing', [Update.pick(null, 'win32', '1.4.9'), Update.pick([null, {}, { tag_name: 'nightly' }], 'win32', '1.4.9'), Update.pick(list, 'freebsd', '1.4.9')], [null, null, null]);

 // Windows: fetched, told, checked, put in.
 const one = release('1.5.0', [asset('OpenGhost-1.5.0-Setup.exe', setup, { version: '1.5.0' })]);
 const url = one.assets[0].browser_download_url;
 let dir = path.join(temp, 'win');
 fs.mkdirSync(dir);
 fs.writeFileSync(path.join(dir, 'OpenGhost-1.4.8-Setup.exe'), 'old');
 let server = github({ releases: [one], files: { [url]: setup } });
 let { core, did } = host('win32', server, dir);
 check('Before a look there is nothing', core.view(), { phase: 'none' });
 await core.check();
 await until(() => core.view().phase === 'ready');
 const downs = did.sent.filter(v => v.phase === 'down').map(v => Math.floor(v.share * 100));
 check('The share is told from nothing, each percent once, rising to the whole', [downs[0], downs.at(-1), downs.every((p, i) => i === 0 || p > downs[i - 1]), downs.length > 3], [0, 100, true, true]);
 check('Then it is ready, with its version', did.sent.at(-1), { phase: 'ready', version: '1.5.0', platform: 'win32', share: 1 });
 check('The file is there whole, nothing half-made, and an earlier version\'s file is gone', [fs.readdirSync(dir), sha(fs.readFileSync(path.join(dir, 'OpenGhost-1.5.0-Setup.exe'))) === sha(setup)], [['OpenGhost-1.5.0-Setup.exe'], true]);
 await core.check();
 check('Another look at the same version fetches nothing again', server.asked.filter(u => u === url).length, 1);
 core.install();
 await until(() => did.quit);
 check('Pressed with no agent at work: the installer runs as an update and the app quits', [did.ran, did.quit, core.view().phase], [[['OpenGhost-1.5.0-Setup.exe', '--updated', '--force-run']], 1, 'going']);

 // At the next start the file is there: it is only checked.
 server = github({ releases: [one], files: { [url]: setup } });
 ({ core, did } = host('win32', server, dir));
 await core.check();
 await until(() => core.view().phase === 'ready');
 check('Fetched at an earlier start, it is ready at once, not fetched again', [server.asked.includes(url), did.sent.map(v => v.phase)], [false, ['ready']]);

 // A file that does not match its sum.
 dir = path.join(temp, 'bad');
 server = github({ releases: [one], files: { [url]: Buffer.concat([setup.subarray(1), Buffer.from([1])]) } });
 ({ core, did } = host('win32', server, dir));
 await core.check();
 await until(() => did.logs.length);
 check('A file that does not match its sum is not offered, and is not kept', [core.view().phase, fs.readdirSync(dir), /does not match its sum/.test(did.logs[0])], ['none', [], true]);
 const good = github({ releases: [one], files: { [url]: setup } });
 ({ core, did } = host('win32', good, dir));
 await core.check();
 await until(() => core.view().phase === 'ready');
 check('The next look fetches it again', core.view().phase, 'ready');

 // GitHub saying no.
 ({ core, did } = host('win32', github({ releases: { message: 'API rate limit exceeded' }, status: 403 }), path.join(temp, 'limit')));
 await core.check();
 check('GitHub refusing leaves nothing on screen', [core.view(), /403/.test(did.logs[0])], [{ phase: 'none' }, true]);

 // A newer version found while one comes: the one coming is let go of for it.
 const next = release('1.5.1', [asset('OpenGhost-1.5.1-Setup.exe', dmg, { version: '1.5.1' })]);
 const files = { [url]: setup, [next.assets[0].browser_download_url]: dmg };

 dir = path.join(temp, 'newer2');
 const hold2 = {};
 hold2.promise = new Promise(resolve => { hold2.go = resolve; });
 let answer = [one];
 const shifting = github({ releases: [], files, hold: hold2 });
 const sent2 = [];
 const self = Update.create({ fetch: async (u, init) => u.startsWith('https://api.github.com/') ? new Response(JSON.stringify(answer)) : shifting.fetch(u, init), dir, platform: 'win32', version: '1.4.9', run: async () => {}, open: async () => '', browse: () => {}, quit: () => {}, busy: () => false, send: view => sent2.push(view), log: () => {} });
 self.check();
 await until(() => sent2.some(v => v.phase === 'down' && v.share >= 0.4));
 const halfway = self.view();
 answer = [next, one];
 await self.check();
 hold2.go();
 await until(() => self.view().phase === 'ready' && self.view().version === '1.5.1');
 await sleep(50);
 // Held from the middle on: what has come by then is three pieces of 64 KB or two, as the stream reads ahead.
 check('Held halfway, the share is told partway', [halfway.phase, halfway.share >= 0.4 && halfway.share < 0.7], ['down', true]);
 check('Its own download is let go of for the newer one, which comes whole', [self.view().phase, self.view().version, fs.readdirSync(dir).sort(), sent2.some(v => v.phase === 'none')], ['ready', '1.5.1', ['OpenGhost-1.5.1-Setup.exe'], false]);

 // Pressed while an agent works.
 dir = path.join(temp, 'busy');
 let working = true;
 ({ core, did } = host('win32', github({ releases: [one], files: { [url]: setup } }), dir, () => working));
 await core.check();
 await until(() => core.view().phase === 'ready');
 core.install();
 check('Pressed while an agent works, it waits', [core.view().phase, did.ran.length, did.quit], ['after', 0, 0]);
 core.install();
 await sleep(60);
 check('Pressed again, it does not wait any more', [core.view().phase, did.ran.length], ['ready', 0]);
 core.install();
 await sleep(60);
 working = false;
 await until(() => did.quit);
 check('Once the agents have finished, it is put in', [did.ran.length, did.quit], [1, 1]);

 // The file changed on the disk after it came.
 dir = path.join(temp, 'changed');
 ({ core, did } = host('win32', github({ releases: [one], files: { [url]: setup } }), dir));
 await core.check();
 await until(() => core.view().phase === 'ready');
 fs.appendFileSync(path.join(dir, 'OpenGhost-1.5.0-Setup.exe'), 'x');
 core.install();
 await until(() => core.view().phase === 'none');
 check('A file changed since it came is not run, and goes', [did.ran.length, did.quit, fs.readdirSync(dir)], [0, 0, []]);

 // macOS: the disk image is opened and the app quits; if it cannot be opened, the app stays.
 const mac = release('1.5.0', [asset('OpenGhost-1.5.0-mac.dmg', dmg, { version: '1.5.0' })]);
 dir = path.join(temp, 'mac');
 ({ core, did } = host('darwin', github({ releases: [mac], files: { [mac.assets[0].browser_download_url]: dmg } }), dir));
 await core.check();
 await until(() => core.view().phase === 'ready');
 core.install();
 await until(() => did.quit);
 check('macOS: the disk image is opened and the app quits', [did.opened, did.ran.length, did.quit], [['OpenGhost-1.5.0-mac.dmg'], 0, 1]);
 dir = path.join(temp, 'mac2');
 ({ core, did } = host('darwin', github({ releases: [mac], files: { [mac.assets[0].browser_download_url]: dmg } }), dir));
 did.open = 'Failed to open';
 await core.check();
 await until(() => core.view().phase === 'ready');
 core.install();
 await until(() => core.view().phase === 'none');
 check('macOS: an image that does not open leaves the app as it is', [did.quit, /Failed to open/.test(did.logs.at(-1))], [0, true]);

 // Linux: nothing is fetched; the release's page is opened.
 const linux = release('1.5.0', [{ name: 'OpenGhost-1.5.0-linux.tar.gz', state: 'uploaded', size: 5, browser_download_url: `${REPO}/download/v1.5.0/OpenGhost-1.5.0-linux.tar.gz` }]);
 server = github({ releases: [linux] });
 ({ core, did } = host('linux', server, path.join(temp, 'linux')));
 await core.check();
 core.install();
 check('Linux: ready at once with nothing fetched; pressed, the release\'s page opens and the app stays', [did.sent.map(v => v.phase), server.asked.length, did.browsed, did.quit, core.view().phase], [['ready', 'ready'], 1, [`${REPO}/tag/v1.5.0`], 0, 'ready']);

 fs.rmSync(temp, { recursive: true, force: true });
 const report = { count: results.length, passed: results.filter(r => r.pass).length, results };
 if (report.passed !== report.count) process.exitCode = 1;
 console.log(JSON.stringify({ ...report, results: results.filter(r => !r.pass) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
