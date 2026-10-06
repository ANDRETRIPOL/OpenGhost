(() => {
'use strict';

// A message sent while the agent is busy waits for it to finish its step. Until the agent takes the message, its bubble is
// an outline of dashes walking round it; once taken, the bubble's colour runs across it and it is a message like any other.
// While it waits the agent has not read it, so it is still the user's to rewrite or take away: two small buttons stand
// before it for that, and go the moment the agent takes it.
const DASH = { step: 13, share: 0.42, width: 2 };
const FILL = { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
const FADE = { duration: 260, easing: 'ease', fill: 'forwards' };
// The running colour ends in a soft edge that leans by ten degrees: the room the edge takes past the bubble, and how far
// it leans for each pixel of the bubble's height (the mask in styles.css is cut to the same lean).
const EDGE = { width: 24, lean: 0.1737 };
// A message thrown away crumbles to dust (dust.js); one taken back to be rewritten fades as it sinks toward the field.
// Then the chat closes the room the message held, a tall message's a little longer: `roomAt` ms after it began to fade,
// or `dustAt` ms after it began to crumble, by when most of it has come loose.
const PULL = { fade: 200, scale: 0.94, sink: 12, roomAt: 80, dustAt: 300, room: [360, 0.9, 620], easing: 'cubic-bezier(0.5, 0, 0.18, 1)' };
const SVG = 'http://www.w3.org/2000/svg';
const ICON = body => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const TOOLS = [
 ['edit', 'queued.edit', ICON('<path d="M3.1 12.9l.75-3 6.7-6.7a1.6 1.6 0 0 1 2.25 0 1.6 1.6 0 0 1 0 2.25l-6.7 6.7z"/><path d="M9.5 4.25l2.25 2.25"/>')],
 ['remove', 'queued.remove', ICON('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>')],
];

const rings = new WeakMap();
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function element(name) {
 const el = document.createElement('div');
 el.className = name;
 return el;
}

// Whole dashes only: the step stretches a little, so the last dash meets the first whatever the size of the bubble.
function fit(svg, box, size) {
 const rect = svg.firstChild, inset = DASH.width / 2;
 const width = size.inlineSize - DASH.width, height = size.blockSize - DASH.width;
 if (width <= 0 || height <= 0) return;
 const radius = Math.max(0, Math.min(parseFloat(getComputedStyle(box).borderTopLeftRadius) - inset, width / 2, height / 2));
 for (const [name, value] of Object.entries({ x: inset, y: inset, width, height, rx: radius })) rect.setAttribute(name, value);
 const length = rect.getTotalLength(), step = length / Math.max(4, Math.round(length / DASH.step));
 rect.style.setProperty('--step', `${step}px`);
 rect.style.strokeDasharray = `${step * DASH.share} ${step * (1 - DASH.share)}`;
}

function tools(message, actions) {
 const row = element('queued-tools');
 for (const [name, label, icon] of TOOLS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `queued-tool is-${name}`;
  button.innerHTML = icon;
  button.title = I18n.t(label);
  button.setAttribute('aria-label', I18n.t(label));
  button.addEventListener('click', () => actions[name]?.());
  row.append(button);
 }
 message.append(row);
 return row;
}

// actions: { edit, remove }, what the buttons before a waiting message do; without them it has none.
function put(message, actions = null) {
 const box = message.querySelector('.message-bubble');
 message.classList.add('is-queued');
 const ring = { box, svg: null, size: null, watch: null, tools: actions ? tools(message, actions) : null };
 rings.set(message, ring);
 if (!box) return;
 const svg = ring.svg = document.createElementNS(SVG, 'svg');
 svg.setAttribute('class', 'queued-ring');
 svg.setAttribute('aria-hidden', 'true');
 svg.append(document.createElementNS(SVG, 'rect'));
 box.append(svg);
 ring.watch = new ResizeObserver(entries => fit(svg, box, ring.size = entries.at(-1).borderBoxSize[0]));
 ring.watch.observe(box);
}

// The message stops waiting, whichever way: its buttons go at once, so nothing can be asked of it any more.
function release(message) {
 const ring = rings.get(message) || {};
 rings.delete(message);
 ring.watch?.disconnect();
 const row = ring.tools;
 if (row) {
  row.inert = true;
  const gone = () => row.remove();
  if (reducedMotion() || !row.isConnected) gone();
  else row.animate({ opacity: [getComputedStyle(row).opacity, 0] }, { ...FADE, duration: 160 }).finished.then(gone, gone);
 }
 return ring;
}

// The plain bubble comes as a copy of the waiting one in its own colours, seen through a pane that slides open over it:
// the pane goes one way and the copy inside it the other, so the words stand still and only the colour runs. Both moves
// are the compositor's, so they stay even while the page is busy with the agent's next step.
function lift(message) {
 if (!message.classList.contains('is-queued')) return;
 // The size as laid out, to the fraction: a copy a hair narrower would break its lines elsewhere.
 const { box, svg, size } = release(message), width = size?.inlineSize || 0, height = size?.blockSize || 0;
 const done = () => {
  message.classList.remove('is-queued', 'is-taken');
  svg?.remove();
  box?.querySelector('.queued-ink')?.remove();
 };
 if (!width || reducedMotion() || !message.isConnected) { done(); return; }
 const ink = element('queued-ink'), pane = element('queued-ink-pane'), face = element('queued-ink-face');
 const lean = height * EDGE.lean, run = Math.ceil(width + EDGE.width + lean);
 for (const node of box.childNodes) if (node !== svg) face.append(node.cloneNode(true));
 face.style.width = `${width}px`;
 face.style.padding = getComputedStyle(box).padding;
 pane.style.width = `${run}px`;
 pane.style.setProperty('--lean', `${lean}px`);
 pane.append(face);
 message.classList.add('is-taken');
 ink.setAttribute('aria-hidden', 'true');
 ink.append(pane);
 box.append(ink);
 svg.animate({ opacity: [1, 0] }, FADE);
 face.animate({ transform: [`translateX(${run}px)`, 'none'] }, FILL);
 pane.animate({ transform: [`translateX(${-run}px)`, 'none'] }, FILL).finished.then(done, done);
}

// The user takes a waiting message back. Thrown away, it crumbles to dust where it stands; taken back to be rewritten
// (`back`), it fades as it sinks toward the field. As it goes the chat closes the room it held in one soft move with
// the gap before it, so nothing jumps once it is gone. Resolves once it is gone.
function pull(message, back = false) {
 release(message);
 if (!message.isConnected) return Promise.resolve();
 if (reducedMotion()) { message.remove(); return Promise.resolve(); }
 message.style.pointerEvents = 'none';
 const fade = to => message.animate({ opacity: [1, 0], transform: ['none', to] }, { duration: PULL.fade, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
 const close = delay => {
  if (!message.isConnected) return Promise.resolve();
  const height = message.offsetHeight, [least, perPixel, most] = PULL.room;
  const gap = message.previousElementSibling || message.nextElementSibling ? parseFloat(getComputedStyle(message.parentElement).rowGap) || 0 : 0;
  const room = message.animate([{ height: `${height}px`, marginTop: '0px' }, { height: '0px', marginTop: `${-gap}px` }], { delay, duration: Math.min(most, least + height * perPixel), easing: PULL.easing, fill: 'forwards' });
  setTimeout(() => { message.style.overflow = 'clip'; }, delay);
  const gone = () => message.remove();
  return room.finished.then(gone, gone);
 };
 if (back) {
  fade(`translateY(${PULL.sink}px)`);
  return close(PULL.roomAt);
 }
 // Where no picture of it can be made to crumble, it shrinks away instead.
 return Dust.away(message).then(dusted => {
  if (dusted) return close(PULL.dustAt);
  message.style.transformOrigin = '100% 50%';
  fade(`scale(${PULL.scale})`);
  return close(PULL.roomAt);
 });
}

window.QueuedRing = { put, lift, pull };
})();
