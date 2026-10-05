'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function page() {
 const window = vm.createContext({ console, setTimeout, clearTimeout });
 window.window = window;
 for (const file of ['i18n.js', 'file-kinds.js', 'settings-general.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), window);
 return window;
}
test('text metadata explicitly labels the heuristic estimate, including zero; other metadata is unchanged', () => {
 const window = page(), general = Object.create(window.GeneralSettings.prototype);
 for (const [chars, count] of [[0, '0'], [32, '10'], [3200, '1k'], [3840, '1.2k'], [200000, '63k']]) {
  assert.equal(general.meta({ name: 'notes.txt', size: 100, kind: 'text', chars }), `Text · 100 B · ≈${count} estimated tokens`);
 }
 assert.equal(general.meta({ name: 'photo.png', size: 100, kind: 'image', width: 640, height: 480 }), 'Image · 100 B · 640×480');
 assert.equal(general.meta({ name: 'data.bin', size: 100, kind: 'none' }), 'App · 100 B · read from disk when needed');
});
test('actual file row uses the localized estimate wording and approximation marker', () => {
 const window = page(), general = Object.create(window.GeneralSettings.prototype);
 window.document = { createElement: () => {
  const nodes = new Map();
  return { dataset: {}, querySelector: selector => {
   if (!nodes.has(selector)) nodes.set(selector, { setAttribute() {} });
   return nodes.get(selector);
  } };
 } };
 const row = general.row({ id: 'fixture', name: 'notes.txt', size: 100, kind: 'text', chars: 3840 });
 assert.equal(row.querySelector('.general-file-meta').textContent, 'Text · 100 B · ≈1.2k estimated tokens');
});
