'use strict';
// Verify every tracked runtime file inside the built ASAR. Tests, website and workflow helpers must stay outside it.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process'), assert = require('node:assert/strict');
const asar = require('@electron/asar');
const archive = process.argv[2];
assert.ok(archive && fs.existsSync(archive), 'Pass the packaged app.asar');
const root = path.resolve(__dirname, '../..');
const files = cp.execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(name => name && !/^(\.github|site|images|tests)\//.test(name) && (/^(desktop|sounds|brands)\//.test(name) || /\.(js|css|html)$/.test(name) || name === 'LICENSE'));
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const checked = [];
for (const name of files) {
  const expected = fs.readFileSync(path.join(root, name));
  const actual = asar.extractFile(archive, name);
  assert.equal(digest(actual), digest(expected), 'Packaged runtime mismatch: ' + name);
  checked.push({ name, size: actual.length, sha256: digest(actual) });
}
const pkg = JSON.parse(asar.extractFile(archive, 'package.json'));
assert.equal(pkg.version, '1.5.3');
const entries = asar.listPackage(archive).map(name => name.replace(/\\/g, '/').replace(/^\//, ''));
assert.ok(!entries.some(name => /^(tests|site|images|\.github)\//.test(name)), 'Development files must not ship');
assert.ok(!entries.some(name => /^(profile|store|session|\.env)(\/|$)/.test(name)), 'No user data in the package');
const report = { version: pkg.version, archive, checked: checked.length, files: checked, excludedDevelopmentFiles: true, excludedUserData: true };
const out = path.join(root, 'dist', 'package-verification.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`PASS package ${pkg.version}: ${checked.length} runtime files match; no test/site/profile data`);
