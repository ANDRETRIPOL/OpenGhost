(() => {
'use strict';

// A long message the user sent takes much of the chat. So one longer than a full message field is shown folded to its
// first lines, with a button in its corner that opens it whole and folds it again. Whether a message is long depends on
// how its lines break, so it is asked again whenever the bubble's width changes.
const LINES = 12;
const MOVE = { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// The arrow is one line bent in the middle. Its ends stay where they are and the middle goes down or up, so it turns
// over by straightening out and bending the other way (the style sheet moves it).
const CHEVRON = '<svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const kept = new WeakMap();

// How tall the words are, without the bubble's own padding, and how tall one line of them is.
function measure(bubble) {
 const style = getComputedStyle(bubble), line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.65;
 return { text: bubble.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom), line };
}

function label(bubble) {
 const state = kept.get(bubble), open = bubble.classList.contains('is-open');
 state.button.dataset.label = I18n.t(open ? 'message.collapse' : 'message.expand');
 state.button.setAttribute('aria-expanded', String(open));
}

function check(bubble) {
 const state = kept.get(bubble);
 if (!state || !bubble.clientWidth) return;
 const { text, line } = measure(bubble), long = text > (LINES + 1.5) * line;
 if (long === bubble.classList.contains('is-long')) return;
 bubble.classList.toggle('is-long', long);
 if (!long) bubble.classList.remove('is-open');
 state.button.hidden = !long;
 if (long) label(bubble);
}

// The bubble grows to its whole height or shrinks back to its first lines; the chat keeps the bubble's top where it was.
function toggle(bubble) {
 const open = !bubble.classList.contains('is-open'), from = bubble.getBoundingClientRect().height;
 bubble.classList.toggle('is-open', open);
 label(bubble);
 const to = bubble.getBoundingClientRect().height;
 if (!open) bubble.scrollIntoView({ block: 'nearest' });
 if (reducedMotion() || Math.abs(to - from) < 1) return;
 bubble.classList.add('is-folding');
 bubble.animate({ height: [`${from}px`, `${to}px`], maxHeight: ['none', 'none'] }, MOVE).finished.catch(() => {}).then(() => bubble.classList.remove('is-folding'));
}

const sizes = new ResizeObserver(entries => { for (const entry of entries) check(entry.target); });

// Takes a message's bubble into care. The button's word is drawn by the style sheet from its label, so the bubble's own
// text stays the message and nothing else.
function watch(bubble) {
 if (kept.has(bubble)) return;
 const button = document.createElement('button');
 button.type = 'button';
 button.className = 'message-fold';
 button.hidden = true;
 button.innerHTML = CHEVRON;
 button.addEventListener('click', () => toggle(bubble));
 bubble.append(button);
 kept.set(bubble, { button });
 sizes.observe(bubble);
}

// Folds what is long inside `root` now, before anything is drawn or measured. Left to the observer, a long message would
// stand at its whole height for a frame and then fold: whatever was aimed at the chat in that frame (the welcome's ghost
// flying to its place, the scroll to the bottom) would be aimed at a place that is about to move.
function settle(root) {
 for (const bubble of root.matches?.('.message-bubble') ? [root] : root.querySelectorAll('.message-bubble')) check(bubble);
}

window.MessageFold = { watch, settle, LINES };
})();
