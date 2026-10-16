(() => {
'use strict';

// A long chat is not kept in work whole. Only the messages within a screen above and a screen below what is seen are
// live; every other one is left standing as a block of the height it had, which the page neither sets, styles nor
// paints until it comes near again. So a chat of a thousand messages costs a frame what a chat of a few does, whatever
// changes its width. The messages themselves all stay in the page, in their order, and can still be selected and
// scrolled to; coming near, one is live again before it is seen.
//
// A block put aside may have another height when it is live again (the chat was narrower or wider when it was put
// aside), and a live message may change its height by itself: a diagram drawn anew for a new width, a long message
// folding. What is being read must not move for any of it, so this holds the place itself (the page's own holding of
// it is off for the chat, styles.css): it knows the first block on screen and how far down the chat that block lies,
// and whenever that distance has changed without the block having moved by its own doing, the chat is scrolled by as
// much. A chat that stood at its end stays at its end, unless the chat itself is following a reply being written out:
// it then glides after the words on its own (chat.js), and being put at the end at once with every new line would
// jerk the whole chat up a line at a time.
const NEAR = '100% 0px';
const watched = new WeakMap();
const followers = new WeakMap();

function watch(thread) {
 if (watched.has(thread)) return;
 // The page's own holding of the place would move the chat a second time.
 thread.style.overflowAnchor = 'none';
 const lists = new WeakSet();
 const now = () => thread.querySelector('.thread-list:not(.is-parked)');
 const far = (el, on, height) => {
  if (on === el.classList.contains('is-far')) return;
  el.classList.toggle('is-far', on);
  el.style.containIntrinsicBlockSize = on ? `auto ${height.toFixed(2)}px` : '';
 };

 // The first block on screen: a paragraph, a table or a bubble rather than a whole message, for a message may be many
 // screens tall and change above what is seen of it.
 const first = list => {
  const top = thread.getBoundingClientRect().top;
  for (const message of list.children) {
   if (message.getBoundingClientRect().bottom <= top) continue;
   for (const block of message.querySelectorAll('.message-bubble, .message-content > *')) if (block.getBoundingClientRect().bottom > top) return block;
   return message;
  }
  return null;
 };
 const depth = el => el.getBoundingClientRect().top - thread.getBoundingClientRect().top + thread.scrollTop;
 let held = null;
 const note = () => {
  const list = now(), el = list && !list.classList.contains('is-settling') ? first(list) : null;
  held = el && { el, list, depth: depth(el), end: thread.scrollHeight - thread.scrollTop - thread.clientHeight < 2 };
 };
 const hold = () => {
  const was = held;
  if (was?.el.isConnected && was.list === now() && !was.list.classList.contains('is-settling')) {
   if (was.end) { if (!followers.get(thread)?.() && thread.scrollHeight - thread.scrollTop - thread.clientHeight >= 1) thread.scrollTop = thread.scrollHeight; }
   else { const shift = depth(was.el) - was.depth; if (Math.abs(shift) > 0.5) thread.scrollTop += shift; }
  }
  note();
 };
 // Scrolled by hand or by the chat, the place is the new one; only what moved under it since is put right first.
 thread.addEventListener('scroll', () => {
  const was = held;
  if (was?.el.isConnected && was.list === now() && !was.end && !was.list.classList.contains('is-settling')) {
   const shift = depth(was.el) - was.depth;
   if (Math.abs(shift) > 0.5) thread.scrollTop += shift;
  }
  note();
 }, { passive: true });
 const sizes = new ResizeObserver(hold);

 const sight = new IntersectionObserver(entries => {
  for (const entry of entries) {
   const el = entry.target, list = el.parentElement;
   // A chat just opened is still finding its heights: nothing is put aside by a height that is not its own yet.
   if (!list || list.matches('.is-settling, .is-parked')) continue;
   // The newest messages are never put aside: the reply being written is among them.
   const newest = el === list.lastElementChild || el.nextElementSibling === list.lastElementChild;
   const on = !entry.isIntersecting && !newest && entry.boundingClientRect.height > 0;
   // A reply of a chat just opened that has not been drawn yet (chat.js) is drawn as it comes near.
   if (!on) el.__fill?.();
   far(el, on, on ? el.getBoundingClientRect().height : 0);
  }
  hold();
 }, { root: thread, rootMargin: NEAR });
 const again = el => { sight.unobserve(el); sight.observe(el); };
 const take = list => {
  if (lists.has(list)) return;
  lists.add(list);
  for (const el of list.children) { sight.observe(el); sizes.observe(el); }
  new MutationObserver(records => {
   for (const record of records) {
    // The list has found its heights, or has come back on screen: every message is looked at anew.
    if (record.type === 'attributes') { if (!list.matches('.is-settling, .is-parked')) { for (const el of list.children) again(el); note(); } continue; }
    for (const node of record.addedNodes) {
     if (node.nodeType !== 1) continue;
     sight.observe(node);
     sizes.observe(node);
     // What was the newest till now may be put aside from here on: it is looked at again.
     for (let prev = node.previousElementSibling, k = 0; prev && k < 2; prev = prev.previousElementSibling, k++) again(prev);
    }
    for (const node of record.removedNodes) if (node.nodeType === 1) { sight.unobserve(node); sizes.unobserve(node); far(node, false, 0); }
   }
  }).observe(list, { childList: true, attributes: true, attributeFilter: ['class'] });
 };
 for (const list of thread.querySelectorAll('.thread-list')) take(list);
 new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && node.matches('.thread-list')) take(node);
 }).observe(thread, { childList: true });
 watched.set(thread, { note });
}

// Whoever has changed the chat and put it where it should be tells so here: the place is taken as it stands.
function rest(thread) {
 watched.get(thread)?.note();
}

// The chat that keeps itself at its end while a reply is written out says when it does.
function follow(thread, following) {
 followers.set(thread, following);
}

window.ThreadWindow = { watch, rest, follow, has: thread => watched.has(thread) };
})();
