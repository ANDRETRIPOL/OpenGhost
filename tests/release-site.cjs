'use strict';
// Run the actual website release selector, including its network fallback, without a browser or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
const code = html.slice(html.indexOf('const FALLBACK ='), html.indexOf('const ua = navigator.userAgent'));
assert.ok(code.includes('function pickRelease('), 'Exercise the actual release selector');
const pkg = require('../package.json');
const lock = require('../package-lock.json');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
let requests = [], replies = [];
const box = vm.createContext({
  REPO: 'ANDRETRIPOL/OpenGhost',
  paintRelease: () => {},
  fetch: async (url, init) => {
    requests.push({ url, init });
    const response = replies.shift();
    if (response instanceof Error) throw response;
    return response || { ok: false };
  },
});
vm.runInContext(`${code}\nglobalThis.api = { readRelease, pickRelease, loadRelease, notes: NOTES, fallback: FALLBACK, current: () => release };`, box);
const api = box.api;
const base = 'https://github.com/ANDRETRIPOL/OpenGhost/releases';
const release = (version, extra = {}) => ({
  tag_name: `v${version}`, draft: false, prerelease: true,
  html_url: `${base}/tag/v${version}`,
  assets: [`OpenGhost-${version}-Setup.exe`, `OpenGhost-${version}-mac.dmg`, `OpenGhost-${version}-linux.tar.gz`].map(name => ({ name, state: 'uploaded', size: 123, browser_download_url: `${base}/download/v${version}/${name}` })),
  body: '- **Fast through ChatGPT is experimental:** server-side application is not confirmed.',
  ...extra,
});
const old = release('1.5.2'), beta = release('1.5.3');
check('Package, lock and site fallback agree', () => assert.deepEqual([pkg.version, lock.version, lock.packages[''].version, api.fallback], ['1.5.3', '1.5.3', '1.5.3', '1.5.3']));
check('Draft is never selected', () => assert.equal(api.pickRelease([release('9.0.0', { draft: true }), beta]).version, '1.5.3'));
check('A beta is selected after a stable release', () => assert.equal(api.pickRelease([old, beta]).version, '1.5.3'));
check('Version order is numeric, not lexical', () => assert.equal(api.pickRelease([release('1.5.9'), release('1.5.10')]).version, '1.5.10'));
check('Major and minor version order is numeric', () => assert.equal(api.pickRelease([release('1.99.0'), release('2.0.0'), release('1.100.0')]).version, '2.0.0'));
check('An object from release.json is accepted', () => assert.equal(api.pickRelease(beta).version, '1.5.3'));
check('Malformed versions are ignored', () => assert.equal(api.pickRelease([release('1.5.4junk'), release('1.5'), release('nightly'), beta]).version, '1.5.3'));
check('Null and empty data are safe', () => assert.equal([null, {}, [], { message: 'rate limit' }, [null, {}]].every(value => api.pickRelease(value) === null), true));
check('A release with missing platform files is skipped', () => assert.equal(api.pickRelease([release('1.5.4', { assets: beta.assets.slice(0, 2) }), beta]).version, '1.5.3'));
check('A file still uploading is not offered', () => assert.equal(api.pickRelease([release('1.5.4', { assets: release('1.5.4').assets.map((a, i) => i ? a : { ...a, state: 'starter' }) }), beta]).version, '1.5.3'));
for (const [kind, suffix] of [['win', 'Setup.exe'], ['mac', 'mac.dmg'], ['linux', 'linux.tar.gz']]) {
  check(`${kind} uses its exact release asset`, () => assert.equal(api.readRelease(beta).assets[kind].url, `${base}/download/v1.5.3/OpenGhost-1.5.3-${suffix}`));
}
check('English notes keep the experimental Fast caveat', () => assert.match(api.notes.en.join(' '), /ChatGPT is experimental.*not confirmed/));
check('Russian notes keep the experimental Fast caveat', () => assert.match(api.notes.ru.join(' '), /ChatGPT.*экспериментальный.*не подтверждены/));
check('Both website languages have five current highlights', () => assert.deepEqual(Object.values(api.notes).map(notes => notes.length), [5, 5]));
check('Release notes retain Fast uncertainty', () => assert.match(api.readRelease(beta).notes.join(' '), /server-side application is not confirmed/));
check('README has the three versioned downloads and Fast caveat', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  for (const asset of beta.assets) assert.ok(readme.includes(asset.browser_download_url));
  assert.match(readme, /Fast through ChatGPT is experimental.*not confirmed/);
});
check('Pages includes prereleases instead of using the stable-only endpoint', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  assert.ok(workflow.includes('/releases?per_page=20'));
  assert.ok(!workflow.includes('/releases/latest'));
  assert.ok(workflow.includes('select(.draft == false'));
  assert.ok(workflow.includes('map(tonumber)'));
});
async function main() {
  requests = []; replies = [{ ok: true, json: async () => [old, beta] }];
  await api.loadRelease();
  check('Live API uses the releases list and no-store', () => {
    assert.equal(requests[0].url, 'https://api.github.com/repos/ANDRETRIPOL/OpenGhost/releases?per_page=20');
    assert.equal(requests[0].init.cache, 'no-store');
    assert.equal(requests.length, 1);
  });
  check('The newest beta is painted', () => assert.equal(api.current().version, '1.5.3'));
  requests = []; replies = [new Error('offline'), { ok: true, json: async () => beta }];
  await api.loadRelease();
  check('Network error falls back to release.json', () => assert.equal(requests[1].url, 'release.json'));
  check('Fallback retains beta version', () => assert.equal(api.current().version, '1.5.3'));
  requests = []; replies = [{ ok: false }, { ok: false }];
  await api.loadRelease();
  check('Both failures leave the current version intact', () => assert.equal(api.current().version, '1.5.3'));
  requests = []; replies = [{ ok: true, json: async () => [] }, { ok: true, json: async () => beta }];
  await api.loadRelease();
  check('An empty list also tries release.json', () => assert.equal(requests[1].url, 'release.json'));
  requests = []; replies = [{ ok: true, json: async () => ({ message: 'limited' }) }, { ok: true, json: async () => beta }];
  await api.loadRelease();
  check('Unexpected API data safely tries release.json', () => assert.equal(requests[1].url, 'release.json'));
  console.log(`${checks}/${checks} release-site checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
