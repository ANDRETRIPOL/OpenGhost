'use strict';

const assert = require('node:assert/strict');
const { fit, GAP, MIN } = require('../split-sizing.js');
let passed = 0;
function test(name, run) { run(); passed++; console.log('ok  ' + name); }

test('An undersized window never relaxes the pane minimum', () => {
 for (const width of [0, -1, MIN, 2 * MIN + GAP - 0.01]) assert.equal(fit(width), null);
});
test('The exact minimum window fits two full-sized panes', () => {
 for (const pointer of [-10000, 0, MIN, 10000]) assert.deepEqual(fit(2 * MIN + GAP, pointer), { left: MIN, right: MIN });
});
test('Dragging beyond the left edge stops at the left minimum', () => {
 const size = fit(1200, -10000); assert.equal(size.left, MIN); assert.equal(size.left + size.right + GAP, 1200);
});
test('Dragging beyond the right edge stops at the right minimum', () => {
 const size = fit(1200, 10000); assert.equal(size.right, MIN); assert.equal(size.left + size.right + GAP, 1200);
});
test('A valid requested width is preserved', () => {
 const size = fit(1200, 500); assert.equal(size.left, 500); assert.ok(size.right >= MIN);
});
test('No preference produces equal halves', () => {
 const size = fit(1100); assert.equal(size.left, size.right);
});
test('Non-finite window measurements cannot create an invalid layout', () => {
 for (const width of [NaN, Infinity, -Infinity, undefined]) assert.equal(fit(width), null);
});
test('A non-finite pointer falls back to a valid equal split', () => {
 for (const pointer of [NaN, Infinity, -Infinity]) { const size = fit(1100, pointer); assert.equal(size.left, size.right); }
});
test('Fractional CSS pixels retain the minimum and the exact total', () => {
 const width = 2 * MIN + GAP + 0.5, size = fit(width, MIN + 0.25);
 assert.equal(size.left, MIN + 0.25); assert.equal(size.right, MIN + 0.25); assert.equal(size.left + size.right + GAP, width);
});
test('Across window sizes and drag positions, panes never overlap or shrink below the minimum', () => {
 for (let width = 2 * MIN + GAP; width <= 3000; width += 17.25) {
  for (let ratio = -1; ratio <= 2; ratio += 0.03125) {
   const size = fit(width, width * ratio);
   assert.ok(size.left >= MIN && size.right >= MIN);
   assert.ok(Math.abs(size.left + size.right + GAP - width) < 1e-8);
  }
 }
});
console.log(`\n${passed} of ${passed} passed`);
