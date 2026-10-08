(() => {
'use strict';

// A photo opened from the quick chat (quick-chat.js) stands in a window of its own, so it may be larger than the chat's
// card. This page is told the stack of photos and how large the frame may be; it works out the frame for the photo
// shown, asks the window to take that size, and comes in once the window stands ready.
const view = window.photoView;
if (!view) return;

// The frame round the photo: its sides, the name's line above, the gap and the line below. A small picture grows, but
// not past this many times its own size.
const FRAME = { pad: 14, head: 44, gap: 14, foot: 52, min: 236, grow: 2.5 };
const OUT = 150;
// The picture store the agent's previews come from gives the same picture sharper when asked for it wider.
const STORE = /^https:\/\/[\w-]+\.mm\.bing\.net\/th\?/;
const SHARP = 1600;

const frame = document.querySelector('.frame'), title = document.querySelector('.title'), photo = document.querySelector('.photo');
const leaf = document.querySelector('.leaf'), count = document.querySelector('.count'), close = document.querySelector('.close');
const prev = document.querySelector('.is-prev'), next = document.querySelector('.is-next');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let items = [], index = 0, max = { width: 600, height: 600 }, label = '', asked = 0, leaving = false;

function sharper(url) {
 return STORE.test(url) && /[?&]w=\d+/.test(url) ? url.replace(/([?&])w=\d+/, `$1w=${SHARP}`) : '';
}

// The picture itself, once it can tell its size; one that will not load keeps the size it was said to have.
function load(item) {
 return new Promise(resolve => {
  const image = new Image();
  image.onload = () => resolve({ url: item.url, width: image.naturalWidth, height: image.naturalHeight });
  image.onerror = () => resolve({ url: item.url, width: item.width || 400, height: item.height || 300 });
  image.src = item.url;
 });
}

// The frame for a picture of this size: as large as it may be, the picture whole inside it.
function box(natural) {
 const roomW = Math.max(80, max.width - 2 * FRAME.pad), roomH = Math.max(80, max.height - FRAME.head - FRAME.gap - FRAME.foot);
 const scale = Math.min(roomW / natural.width, roomH / natural.height, FRAME.grow);
 const width = natural.width * scale, height = natural.height * scale;
 return { width: Math.ceil(Math.max(width + 2 * FRAME.pad, Math.min(FRAME.min, max.width))), height: Math.ceil(FRAME.head + height + FRAME.gap + FRAME.foot) };
}

async function show(k, first = false) {
 if (k < 0 || k >= items.length || (!first && k === index) || leaving) return;
 const turn = ++asked, item = items[k];
 index = k;
 frame.classList.remove('is-in');
 if (!first) view.turned(k);
 const [natural] = await Promise.all([load(item), first ? null : sleep(OUT)]);
 if (turn !== asked) return;
 photo.src = natural.url;
 photo.alt = item.name || '';
 title.textContent = item.name || label;
 count.textContent = `${k + 1} / ${items.length}`;
 leaf.classList.toggle('is-single', items.length < 2);
 prev.disabled = k === 0;
 next.disabled = k === items.length - 1;
 const size = box(natural);
 view.size(size.width, size.height);
 const sharp = sharper(item.url);
 if (sharp) {
  const better = new Image();
  better.onload = () => { if (turn === asked && better.naturalWidth > natural.width) photo.src = sharp; };
  better.src = sharp;
 }
}

function leave() {
 if (leaving) return;
 leaving = true;
 asked++;
 frame.classList.remove('is-in');
 setTimeout(() => view.close(index), OUT);
}

view.onShow(data => {
 items = Array.isArray(data.items) ? data.items : [];
 if (!items.length) { view.close(0); return; }
 max = data.max;
 label = data.label || '';
 leaving = false;
 close.textContent = data.close || 'Close';
 prev.setAttribute('aria-label', data.prev || '');
 next.setAttribute('aria-label', data.next || '');
 document.documentElement.dataset.theme = data.theme === 'dark' ? 'dark' : 'light';
 for (const side of ['top', 'side', 'bottom']) document.documentElement.style.setProperty(`--shade-${side}`, `${data.shade[side]}px`);
 show(Math.min(Math.max(0, data.index | 0), items.length - 1), true);
});

// The window has taken the frame's size: once the page has drawn at it, the frame comes in.
view.onPlaced(() => {
 const turn = asked;
 setTimeout(() => { if (turn === asked && !leaving) frame.classList.add('is-in'); }, 40);
});
view.onLeave(leave);

close.addEventListener('click', leave);
prev.addEventListener('click', () => show(index - 1));
next.addEventListener('click', () => show(index + 1));
// A press on the clear room round the frame closes it.
document.addEventListener('mousedown', event => { if (!event.target.closest('.frame')) leave(); });
document.addEventListener('keydown', event => {
 if (event.key === 'Escape') { event.preventDefault(); leave(); return; }
 const to = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: items.length - 1 }[event.key];
 if (to === undefined) return;
 event.preventDefault();
 show(to);
});
})();
