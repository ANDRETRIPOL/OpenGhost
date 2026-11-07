(() => {
'use strict';
// Workspace metadata only. Never messages, records, permissions or agent state.
const KEY = 'openghost.split.pairs';
class SplitPairs {
 constructor(storage = localStorage) {
  this.storage = storage;
  this.items = [];
  try {
   const saved = JSON.parse(storage.getItem(KEY) || '[]'), used = new Set();
   for (const pair of Array.isArray(saved) ? saved : []) {
    if (typeof pair?.left !== 'string' || !pair.left || typeof pair.right !== 'string' || !pair.right || pair.left === pair.right || used.has(pair.left) || used.has(pair.right)) continue;
    this.items.push({ left: pair.left, right: pair.right, ratio: this.ratio(pair.ratio) });
    used.add(pair.left); used.add(pair.right);
   }
  } catch {}
 }
 ratio(value) { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5; }
 find(id) { return this.items.find(pair => pair.left === id || pair.right === id) || null; }
 save() { try { this.storage.setItem(KEY, JSON.stringify(this.items)); } catch {} }
 set(left, right, ratio = 0.5) {
  if (!left || !right || left === right) return null;
  const old = this.find(left);
  if (old?.left === left && old.right === right) {
   if (old.ratio !== this.ratio(ratio)) { old.ratio = this.ratio(ratio); this.save(); }
   return old;
  }
  this.items = this.items.filter(pair => ![left, right].includes(pair.left) && ![left, right].includes(pair.right));
  const pair = { left, right, ratio: this.ratio(ratio) };
  this.items.unshift(pair); this.save(); return pair;
 }
 remove(id) {
  const size = this.items.length;
  this.items = this.items.filter(pair => pair.left !== id && pair.right !== id);
  if (size !== this.items.length) this.save();
 }
 prune(exists) {
  const size = this.items.length;
  this.items = this.items.filter(pair => exists(pair.left) && exists(pair.right));
  if (size !== this.items.length) this.save();
  return this.items;
 }
}
window.SplitPairs = SplitPairs;
})();
