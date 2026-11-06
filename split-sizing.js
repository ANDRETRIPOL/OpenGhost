(() => {
'use strict';

const GAP = 14, MIN = 470;
const SplitSizing = Object.freeze({
 GAP, MIN,
 // An undersized window cannot display two panes. Never relax the per-pane minimum.
 fit(width, desired) {
  const room = width - GAP;
  if (!Number.isFinite(room) || room < 2 * MIN) return null;
  const wanted = Number.isFinite(desired) ? desired : room / 2;
  const left = Math.max(MIN, Math.min(room - MIN, wanted));
  return { left, right: room - left };
 },
});

if (typeof module === 'object' && module.exports) module.exports = SplitSizing;
else window.SplitSizing = SplitSizing;
})();
