(() => {
'use strict';

// The calendar under the hand (calendar.js draws it): a task ticked off, an entry dragged to another time or day or
// stretched longer, a new one drawn on the scale or typed in plain words, the card of an entry, a menu, the reminders
// that come while the app is open, other calendars connected. Every motion starts from what the hand touched and ends
// where the entry now lies.
const Core = window.CalendarCore;
const Words = window.CalendarWords;
const Store = window.CalendarStore;
const UI = window.CalendarUI;
const { fmt, ICONS, el, word, t, HOUR, EASE, SPRING, reduced } = UI;
const STEP = 15;
const MOVE = 4;
const TONES = ['blue', 'lilac', 'green', 'pink', 'orange', 'turquoise', 'yellow'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snap = minutes => Math.round(minutes / STEP) * STEP;
const clockOf = minutes => `${Math.floor(minutes / 60)}:${Core.pad(minutes % 60)}`;
const keyClock = minutes => Core.timeKey({ h: Math.floor(minutes / 60) % 24, mi: minutes % 60 });

// Moves every child of a box from where it stood to where it stands after `change`: the others make room.
function flip(box, change) {
 if (!box || reduced()) { change(); return; }
 const before = new Map([...box.children].map(node => [node, node.getBoundingClientRect()]));
 change();
 for (const node of box.children) {
  const was = before.get(node);
  if (!was) continue;
  const now = node.getBoundingClientRect(), dx = was.left - now.left, dy = was.top - now.top;
  if (Math.abs(dx) + Math.abs(dy) < 0.5) continue;
  node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: SPRING });
 }
}

// The plate under the pointer in a list or a menu: it glides from line to line on a spring and fades in and out, as
// the one under the chats' rows does (chat-list.js); its own copy here.
const GLIDE = [520, 40], FADE = [320, 32];
function spring(s, goal, [k, c], dt) {
 const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
 for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
 if (Math.abs(goal - s[0]) < 0.01 && Math.abs(s[1]) < 0.05) { s[0] = goal; s[1] = 0; return false; }
 return true;
}

class Glide {
 constructor(box, selector) {
  Object.assign(this, { box, selector, hovered: null, raf: 0, last: 0 });
  this.plate = el('div', 'cal-glide');
  this.plate.setAttribute('aria-hidden', 'true');
  this.g = { x: [0, 0], y: [0, 0], w: [0, 0], h: [0, 0], o: [0, 0] };
  this.tick = this.tick.bind(this);
  box.prepend(this.plate);
  box.addEventListener('pointerover', event => this.hover(event.target.closest(selector)));
  box.addEventListener('pointerleave', () => this.hover(null));
 }

 hover(target) {
  const next = target && this.box.contains(target) && !target.disabled ? target : null;
  if (next === this.hovered) return;
  this.hovered = next;
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  if (!this.plate.isConnected) this.box.prepend(this.plate);
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032), g = this.g, still = reduced();
  this.last = now;
  const target = this.hovered?.isConnected ? this.hovered : null;
  let moving = false;
  if (target) {
   const goal = { x: target.offsetLeft, y: target.offsetTop, w: target.offsetWidth, h: target.offsetHeight };
   const fresh = g.o[0] < 0.02;
   for (const k of ['x', 'y', 'w', 'h']) {
    if (fresh || still) g[k] = [goal[k], 0];
    else moving = spring(g[k], goal[k], GLIDE, dt) || moving;
   }
   this.plate.style.borderRadius = getComputedStyle(target).borderRadius;
  }
  if (still) g.o = [target ? 1 : 0, 0];
  else moving = spring(g.o, target ? 1 : 0, FADE, dt) || moving;
  Object.assign(this.plate.style, {
   transform: `translate(${g.x[0].toFixed(2)}px, ${g.y[0].toFixed(2)}px)`,
   width: `${Math.max(0, g.w[0]).toFixed(2)}px`, height: `${Math.max(0, g.h[0]).toFixed(2)}px`,
   opacity: Math.min(1, Math.max(0, g.o[0])).toFixed(3),
  });
  if (moving) this.raf = requestAnimationFrame(this.tick);
 }
}

class CalendarHand {
 constructor(page) {
  this.page = page;
  this.pop = null;
  this.drag = null;
  this.reminders = [];
  const body = page.body;
  body.addEventListener('click', event => this.click(event));
  body.addEventListener('dblclick', event => this.double(event));
  body.addEventListener('pointerdown', event => this.down(event));
  body.addEventListener('wheel', event => this.wheel(event), { passive: false });
  this.stack = el('div', 'cal-reminders');
  document.body.append(this.stack);
  const bridge = window.openghost?.calendar;
  bridge?.onRemind(card => this.remind(card));
  bridge?.onOpen(place => this.page.open({ at: place }));
  bridge?.ready();
  document.addEventListener('pointerdown', event => {
   const target = event.target;
   if (this.menu && !this.menu.contains(target)) {
    this.skip = this.menuAnchor?.contains(target) ? this.menuAnchor : null;
    this.closeMenu();
   }
   if (this.pop && !this.pop.root.contains(target) && !target.closest('.cal-menu')) this.dismiss();
  }, true);
 }

 attach() {}

 key(event) {
  if (event.key === 'Escape' && (this.pop || this.menu)) { event.preventDefault(); if (this.menu) this.closeMenu(); else this.dismiss(); return true; }
  if (this.pop && event.target.closest?.('.cal-pop')) return true;
  return false;
 }

 // A press: the ring ticks a task off; an entry opens its card.
 click(event) {
  if (this.dragged) { this.dragged = false; return; }
  const ring = event.target.closest('.cal-ring');
  const node = event.target.closest('[data-uid]');
  if (ring && node) { event.stopPropagation(); this.tick(node, ring); return; }
  if (node && !event.target.closest('.cal-link, .cal-more, .cal-mday')) this.card(node);
 }

 // Twice on an empty place: a new entry there.
 double(event) {
  if (event.target.closest('[data-uid]')) return;
  const col = event.target.closest('.cal-col');
  if (col) {
   const minutes = snap(this.minutesAt(col, event.clientY));
   this.quick({ point: { x: event.clientX, y: event.clientY }, day: col.dataset.day, time: keyClock(Math.min(minutes, 23 * 60)), dur: 60, kind: 'event' });
   return;
  }
  const day = event.target.closest('[data-day]')?.dataset.day;
  if (day) this.quick({ point: { x: event.clientX, y: event.clientY }, day });
 }

 minutesAt(col, y) {
  const rect = col.getBoundingClientRect();
  return clamp((y - rect.top) / HOUR * 60, 0, 24 * 60 - STEP);
 }

 find(node) {
  const id = node.dataset.id, key = node.dataset.key;
  if (node.dataset.feed) {
   const feed = Store.feed(node.dataset.feed);
   const entry = feed?.entries?.find(one => `${feed.id}:${one.uid || one.title}` === id);
   return entry ? { item: entry, feed, key } : null;
  }
  const item = Store.item(id);
  return item ? { item, feed: null, key } : null;
 }

 // A task ticked off: the ring fills and its tick is drawn, the words are struck through from the left.
 async tick(node, ring) {
  const found = this.find(node);
  if (!found || found.feed) return;
  const done = !node.classList.contains('is-done');
  node.classList.toggle('is-done', done);
  ring.classList.toggle('is-done', done);
  if (done && !reduced()) {
   ring.animate([{ transform: 'scale(0.82)' }, { transform: 'scale(1.08)', offset: 0.55 }, { transform: 'none' }], { duration: 420, easing: SPRING });
   const title = node.querySelector('.cal-row-title, .cal-block-title, .cal-chip-title, .cal-tray-title');
   title?.classList.add('is-striking');
  }
  // The line folds away in the lists where done tasks go to the end, once the tick has been seen.
  await new Promise(resolve => setTimeout(resolve, done && !reduced() ? 520 : 0));
  await Store.done(found.item, found.key, done);
 }

 // Overdue tasks carried to today, all at once; one Ctrl+Z puts them all back.
 async carry(times) {
  const today = Core.dayKey(UI.todayWall());
  const before = times.map(time => Store.item(time.id)).filter(Boolean);
  for (const item of before) await Store.update(item.id, { date: today }, { undoable: false });
  Store.remember(async () => { for (const item of before) await window.openghost.calendar.restore(item); });
 }

 // Dragging. A block on the scale moves to another time or day, or grows longer by its lower edge; a card of the week
 // or a chip of the month moves to another day; a task with no day lands on the scale and becomes a block there; a
 // press and pull on an empty place of the scale draws a new entry.
 down(event) {
  if (event.button !== 0 || this.pop) return;
  const node = event.target.closest('.cal-block, .cal-card, .cal-chipline, .cal-tray-card, .cal-tasks .cal-row');
  const col = event.target.closest('.cal-col');
  if (event.target.closest('.cal-ring')) return;
  if (!node && !col) return;
  if (node?.dataset.feed) return;
  const start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  const move = e => {
   if (!this.drag) {
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < MOVE) return;
    this.begin(node, col, start, e);
    if (!this.drag) { cleanup(); return; }
   }
   this.follow(e);
  };
  const up = e => { cleanup(); if (this.drag) { this.dragged = true; this.drop(e); } };
  const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
 }

 begin(node, col, start, event) {
  const root = this.page.root;
  if (!node && col) {
   // A new entry drawn on the scale.
   const from = Math.floor(this.minutesAt(col, start.y) / STEP) * STEP;
   const draft = el('div', 'cal-block is-draft');
   draft.style.setProperty('--at', (from / 60).toFixed(4));
   draft.style.setProperty('--len', (STEP / 60).toFixed(4));
   draft.style.setProperty('--lane', 0);
   draft.style.setProperty('--lanes', 1);
   draft.append(el('div', 'cal-block-body'));
   draft.firstChild.append(word('', 'cal-draft-time'));
   col.append(draft);
   this.drag = { mode: 'draw', col, from, to: from + STEP, draft };
   this.showDraft();
   return;
  }
  const found = this.find(node);
  if (!found) return;
  const rect = node.getBoundingClientRect();
  const resize = node.classList.contains('cal-block') && (event.target.closest?.('.cal-grip') || start.y > rect.bottom - 8);
  if (resize) {
   this.drag = { mode: 'resize', node, found, rect, start, dur: Math.round((+node.dataset.end - +node.dataset.start) / 60000) };
   node.classList.add('is-resizing');
   return;
  }
  // The entry is lifted: a copy of it follows the hand, a little larger, with a deeper shadow, leaning with the speed.
  const lifted = node.cloneNode(true);
  lifted.classList.add('cal-lifted');
  lifted.style.removeProperty('--lane');
  Object.assign(lifted.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  root.append(lifted);
  if (!reduced()) lifted.animate([{ transform: 'none', boxShadow: 'none' }, { transform: 'scale(1.03)' }], { duration: 220, easing: SPRING, fill: 'forwards' });
  node.classList.add('is-away');
  const slot = el('div', 'cal-slot');
  const kind = node.classList.contains('cal-block') ? 'block' : node.classList.contains('cal-tray-card') ? 'tray' : node.classList.contains('cal-chipline') ? 'chip' : node.classList.contains('cal-card') ? 'card' : 'row';
  const length = found.item.date && found.item.time ? Math.round((+node.dataset.end - +node.dataset.start) / 60000) : found.item.kind === 'event' ? 60 : 30;
  this.drag = { mode: 'move', kind, node, found, lifted, slot, rect, start, grab: { x: start.x - rect.left, y: start.y - rect.top }, length: Math.max(STEP, length || 30), vx: 0, lean: 0, last: { x: start.x, t: performance.now() }, target: null };
  this.frame();
 }

 // The quarters drawn: from the one pressed to the one the pointer is in, down or up.
 span(d) { return d.to > d.from ? [d.from, d.to] : [d.to, d.from + STEP]; }

 showDraft() {
  const d = this.drag;
  const [a, b] = this.span(d);
  d.draft.style.setProperty('--at', (a / 60).toFixed(4));
  d.draft.style.setProperty('--len', (Math.max(STEP, b - a) / 60).toFixed(4));
  d.draft.querySelector('.cal-draft-time').textContent = `${clockOf(a)} – ${clockOf(Math.max(a + STEP, b))}`;
 }

 follow(event) {
  const d = this.drag;
  d.pointer = { x: event.clientX, y: event.clientY };
  if (d.mode === 'draw') {
   const m = this.minutesAt(d.col, event.clientY);
   d.to = m >= d.from ? Math.max(d.from + STEP, Math.ceil(m / STEP) * STEP) : Math.floor(m / STEP) * STEP;
   this.showDraft();
   this.autoScroll(event.clientX, event.clientY);
   return;
  }
  if (d.mode === 'resize') {
   const grow = snap((event.clientY - d.start.y) / HOUR * 60);
   d.newDur = Math.max(STEP, d.dur + grow);
   d.node.style.setProperty('--len', (d.newDur / 60).toFixed(4));
   const label = d.node.querySelector('.cal-block-time .cal-t');
   if (label) label.textContent = `${fmt.clock(+d.node.dataset.start)} – ${fmt.clock(+d.node.dataset.start + d.newDur * 60000)}`;
   this.autoScroll(event.clientX, event.clientY);
   return;
  }
  const now = performance.now(), dt = Math.max(1, now - d.last.t);
  d.vx = d.vx * 0.7 + ((event.clientX - d.last.x) / dt) * 0.3;
  d.last = { x: event.clientX, t: now };
  this.target(event);
  this.autoScroll(event.clientX, event.clientY);
  this.edge(event.clientX);
 }

 // The lifted entry follows on a spring, leaning with its speed, and takes the shape of what it will become.
 frame() {
  const d = this.drag;
  if (!d || d.mode !== 'move') return;
  const p = d.pointer || d.start;
  const goal = d.shape || { w: d.rect.width, h: d.rect.height };
  d.w = d.w == null ? d.rect.width : d.w + (goal.w - d.w) * 0.25;
  d.h = d.h == null ? d.rect.height : d.h + (goal.h - d.h) * 0.25;
  const grabX = d.grab.x * (d.w / d.rect.width), grabY = Math.min(d.grab.y, d.h - 6);
  d.lean += (clamp(d.vx * 3, -2.2, 2.2) - d.lean) * 0.18;
  Object.assign(d.lifted.style, { left: `${p.x - grabX}px`, top: `${p.y - grabY}px`, width: `${d.w}px`, height: `${d.h}px`, rotate: reduced() ? '0deg' : `${d.lean.toFixed(2)}deg` });
  d.raf = requestAnimationFrame(() => this.frame());
 }

 // Where the entry would land: a day and a time on the scale, a lane of whole days, a day of the week or the month, a
 // group of tasks. A soft hollow shows the place and the others make room.
 target(event) {
  const d = this.drag;
  d.lifted.style.pointerEvents = 'none';
  const under = document.elementFromPoint(event.clientX, event.clientY);
  const col = under?.closest('.cal-col'), lane = under?.closest('.cal-lane'), day = under?.closest('.cal-wcol, .cal-mcell'), group = under?.closest('.cal-tgroup[data-drop]');
  let target = null;
  if (col && (d.kind === 'block' || d.kind === 'tray' || d.kind === 'card' || d.kind === 'chip')) {
   const top = event.clientY - (d.kind === 'block' ? d.grab.y : 10);
   const minutes = snap(clamp(this.minutesAt(col, top), 0, 24 * 60 - d.length));
   target = { type: 'time', box: col, day: col.dataset.day, minutes };
   d.shape = { w: col.getBoundingClientRect().width - 8, h: Math.max(22, d.length / 60 * HOUR - 4) };
  } else if (lane) {
   target = { type: 'allday', box: lane, day: lane.dataset.day };
   d.shape = { w: lane.getBoundingClientRect().width - 8, h: 26 };
  } else if (day) {
   target = { type: 'day', box: day.querySelector('.cal-cards') || day, day: day.dataset.day };
   d.shape = null;
  } else if (group) {
   target = { type: 'group', box: group.querySelector('.cal-tgroup-rows'), day: group.dataset.drop === 'undated' ? null : group.dataset.drop };
   d.shape = null;
  } else d.shape = null;
  const same = d.target && target && d.target.box === target.box && d.target.minutes === target.minutes;
  if (same) return;
  d.target = target;
  if (!target) { if (d.slot.isConnected) flip(d.slot.parentElement, () => d.slot.remove()); return; }
  if (target.type === 'time') {
   d.slot.className = 'cal-slot is-time';
   d.slot.style.setProperty('--at', (target.minutes / 60).toFixed(4));
   d.slot.style.setProperty('--len', (d.length / 60).toFixed(4));
   d.slot.dataset.label = `${clockOf(target.minutes)} – ${clockOf(target.minutes + d.length)}`;
   if (d.slot.parentElement !== target.box) target.box.append(d.slot);
   const label = d.lifted.querySelector('.cal-block-time .cal-t, .cal-time, .cal-chip-time');
   if (label) label.textContent = d.length && d.found.item.kind === 'event' ? `${clockOf(target.minutes)} – ${clockOf(target.minutes + d.length)}` : clockOf(target.minutes);
   this.makeRoom(target.box, target.minutes, d.length);
  } else {
   d.slot.className = 'cal-slot is-line';
   d.slot.style.height = `${Math.min(d.rect.height, 64)}px`;
   flip(target.box, () => { if (target.type === 'allday') target.box.append(d.slot); else target.box.prepend(d.slot); });
  }
 }

 // Blocks that would meet the entry in its new place step aside: their lanes are worked out with it there.
 makeRoom(col, minutes, length) {
  const dayStart = UI.startOf(UI.dayOf(col.dataset.day));
  const blocks = [...col.querySelectorAll('.cal-block:not(.is-away):not(.is-draft)')];
  const times = blocks.map(node => ({ node, start: +node.dataset.start, end: +node.dataset.end }));
  const ghost = { node: null, start: dayStart + minutes * 60000, end: dayStart + (minutes + length) * 60000 };
  const lay = this.page.layout([...times, ghost].map(one => ({ ...one, allDay: false, uid: '' })), dayStart);
  for (const { time, lane, lanes } of lay) {
   if (!time.node) { this.drag.slot.style.setProperty('--lane', lane); this.drag.slot.style.setProperty('--lanes', lanes); continue; }
   time.node.style.setProperty('--lane', lane);
   time.node.style.setProperty('--lanes', lanes);
  }
 }

 // Held near the top or the bottom of the scale, it scrolls; only over the scale, not beside it.
 autoScroll(x, y) {
  // The scale of hours, or a narrow week laid out as a list of days.
  const scroller = [...this.page.body.querySelectorAll('.cal-grid-scroll, .cal-week')].find(one => one.scrollHeight > one.clientHeight + 1);
  if (!scroller) return;
  const rect = scroller.getBoundingClientRect();
  const over = x >= rect.left && x <= rect.right && y >= rect.top - 24 && y <= rect.bottom + 24;
  const speed = !over ? 0 : y < rect.top + 48 ? -(rect.top + 48 - y) / 3 : y > rect.bottom - 48 ? (y - rect.bottom + 48) / 3 : 0;
  cancelAnimationFrame(this.scrollRaf);
  if (!speed) return;
  const step = () => { scroller.scrollTop += speed; if (this.drag) this.scrollRaf = requestAnimationFrame(step); };
  this.scrollRaf = requestAnimationFrame(step);
 }

 // Held at the side of the days, the days turn over: the entry can be carried to a day not on screen.
 edge(x) {
  const grid = this.page.body.querySelector('.cal-grid, .cal-week');
  if (!grid) return;
  const rect = grid.getBoundingClientRect(), side = x < rect.left + 36 ? -1 : x > rect.right - 36 ? 1 : 0;
  if (side !== this.drag.side) { clearTimeout(this.edgeTimer); this.drag.side = side; if (side) this.edgeTimer = setTimeout(() => { if (!this.drag) return; this.page.go(side); this.drag.target = null; this.drag.side = 0; }, 650); }
 }

 async drop(event) {
  const d = this.drag;
  this.drag = null;
  cancelAnimationFrame(this.scrollRaf);
  clearTimeout(this.edgeTimer);
  if (d.mode === 'draw') {
   const [a, b] = this.span(d);
   if (b - a < STEP * 2) { d.draft.remove(); return; }
   this.quick({ anchor: d.draft, day: d.col.dataset.day, time: keyClock(a), dur: b - a, kind: 'event', draft: d.draft });
   return;
  }
  if (d.mode === 'resize') {
   d.node.classList.remove('is-resizing');
   if (d.newDur && d.newDur !== d.dur) await Store.move(d.found.item, d.found.key, { dur: d.newDur });
   return;
  }
  cancelAnimationFrame(d.raf);
  const target = d.target;
  const settle = async (rect) => {
   if (rect && !reduced()) {
    const now = d.lifted.getBoundingClientRect();
    await d.lifted.animate([{ left: `${now.left}px`, top: `${now.top}px`, width: `${now.width}px`, height: `${now.height}px`, rotate: d.lifted.style.rotate, transform: 'scale(1.03)' }, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, rotate: '0deg', transform: 'none' }], { duration: 380, easing: SPRING, fill: 'forwards' }).finished.catch(() => {});
   }
  };
  if (!target) {
   // Nowhere to land: it goes back where it was.
   await settle(d.rect);
   d.lifted.remove();
   d.slot.remove();
   d.node.classList.remove('is-away');
   this.page.render();
   return;
  }
  const slotRect = d.slot.isConnected ? d.slot.getBoundingClientRect() : null;
  await settle(target.type === 'time' || target.type === 'allday' ? slotRect : null);
  const { item, key } = d.found;
  let change = null;
  if (target.type === 'time') change = { date: target.day, time: keyClock(target.minutes), dur: item.kind === 'event' || item.dur ? d.length : undefined };
  else if (target.type === 'allday') change = { date: target.day, time: null };
  else if (target.type === 'day') change = { date: target.day };
  else if (target.type === 'group') change = { date: target.day, ...(target.day ? {} : { time: null }) };
  // A task with no day put on the scale is the whole task moved; a repeat's time moved is that time alone.
  if (change) {
   if (!item.date) await Store.update(item.id, { ...change, dur: target.type === 'time' ? d.length : null });
   else await Store.move(item, key, change);
  }
  d.lifted.remove();
  d.slot.remove();
 }

 // Two fingers sideways on a trackpad turn the days, following the fingers, and let go on a day.
 wheel(event) {
  if (Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.2 || !['day', 'days', 'week', 'month'].includes(this.page.view)) return;
  event.preventDefault();
  const view = this.page.body.firstElementChild;
  if (!view) return;
  this.swipe = (this.swipe || 0) - event.deltaX;
  const width = view.getBoundingClientRect().width;
  const pull = this.swipe / (1 + Math.abs(this.swipe) / (width * 0.6));
  view.style.transform = `translateX(${pull.toFixed(1)}px)`;
  view.style.opacity = String(1 - Math.min(0.35, Math.abs(pull) / width));
  clearTimeout(this.swipeTimer);
  this.swipeTimer = setTimeout(() => {
   const go = Math.abs(this.swipe) > width * 0.18 ? -Math.sign(this.swipe) : 0;
   this.swipe = 0;
   if (go) { view.style.transform = ''; view.style.opacity = ''; this.page.go(go); return; }
   const back = view.animate([{ transform: view.style.transform, opacity: view.style.opacity }, { transform: 'none', opacity: 1 }], { duration: 360, easing: SPRING });
   view.style.transform = '';
   view.style.opacity = '';
   void back;
  }, 120);
 }

 // Popovers: the card of an entry, the field for a new one, the calendars connected. One at a time, grown from what
 // was pressed.
 popover(cls, anchor) {
  this.dismiss();
  const root = el('div', `cal-pop glass-lens ${cls}`);
  root.setAttribute('role', 'dialog');
  document.body.append(root);
  this.pop = { root, anchor };
  return root;
 }

 place(root, anchor, { side = 'right', width = 340 } = {}) {
  const rect = anchor?.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor ? { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 } : { left: innerWidth / 2, right: innerWidth / 2, top: 120, bottom: 120, width: 0, height: 0 };
  root.style.width = `${width}px`;
  const h = root.offsetHeight;
  let x = side === 'right' ? rect.right + 12 : rect.left + rect.width / 2 - width / 2;
  let y = side === 'right' ? rect.top - 16 : rect.bottom + 10;
  if (side === 'right' && x + width > innerWidth - 12) x = rect.left - width - 12;
  x = clamp(x, 12, innerWidth - width - 12);
  y = clamp(y, 56, innerHeight - h - 12);
  Object.assign(root.style, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px` });
  const ox = clamp((rect.left + rect.width / 2) - x, 0, width), oy = clamp((rect.top + rect.height / 2) - y, 0, h);
  root.style.transformOrigin = `${ox}px ${oy}px`;
  if (!reduced()) root.animate([{ opacity: 0, transform: 'scale(0.94)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 300, easing: SPRING });
 }

 dismiss() {
  this.closeMenu();
  const pop = this.pop;
  if (!pop) return;
  this.pop = null;
  pop.draft?.remove();
  pop.onClose?.();
  if (reduced()) { pop.root.remove(); return; }
  pop.root.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: 140, easing: 'ease-in', fill: 'forwards' }).finished.then(() => pop.root.remove(), () => pop.root.remove());
 }

 // A new entry in plain words. What the words mean is shown at once under the field (and marked in it), and only that
 // is kept: nothing the app misread goes in unseen.
 quick({ anchor = null, point = null, text = '', day = null, time = null, dur = null, kind = null, draft = null } = {}) {
  const root = this.popover('cal-quick', anchor);
  this.pop.draft = draft;
  const field = el('div', 'cal-quick-field');
  const mirror = el('div', 'cal-quick-mirror');
  const input = el('input', 'cal-quick-input');
  input.type = 'text';
  input.placeholder = t('cal.quick.placeholder');
  input.setAttribute('aria-label', t('cal.quick.label'));
  input.spellcheck = false;
  field.append(mirror, input);
  const chips = el('div', 'cal-quick-chips');
  const hint = el('div', 'cal-quick-hint');
  hint.append(word(t('cal.quick.hint')));
  root.append(field, chips, hint);
  const preset = { day, time, dur, kind };
  let read = null, kindPicked = kind;
  const show = () => {
   read = Words.read(input.value, { now: Date.now() });
   if (!read.date && preset.day) read.date = preset.day;
   if (!read.time && preset.time && !read.allDay) read.time = preset.time;
   if (read.dur == null && preset.dur) read.dur = preset.dur;
   if (kindPicked) read.kind = kindPicked;
   if (read.kind === 'event' && read.time && read.dur == null) read.dur = 60;
   // The marks in the field: what was read as a day, a time, a repeat, a reminder, a tag.
   mirror.replaceChildren();
   let at = 0;
   for (const span of read.spans) {
    if (span.from > at) mirror.append(document.createTextNode(input.value.slice(at, span.from)));
    mirror.append(el('mark', `cal-mark-${span.what}`, input.value.slice(span.from, span.to)));
    at = span.to;
   }
   mirror.append(document.createTextNode(input.value.slice(at)));
   mirror.scrollLeft = input.scrollLeft;
   const list = [];
   const chip = (glyph, text, cls = '', act = null) => { const node = el(act ? 'button' : 'span', `cal-qchip ${cls}`); if (act) { node.type = 'button'; node.addEventListener('click', act); } if (glyph) node.innerHTML = ICONS[glyph] || glyph; node.append(word(text)); list.push(node); };
   chip(read.kind === 'event' ? '<span class="cal-dot"></span>' : '<span class="cal-ring-mini"></span>', t(read.kind === 'event' ? 'cal.kind.event' : 'cal.kind.task'), 'is-kind', () => { kindPicked = read.kind === 'event' ? 'task' : 'event'; show(); input.focus(); });
   if (read.date) chip('day', fmt.near(Core.parseDay(read.date), UI.todayWall()), 'is-date');
   else chip('inbox', t('cal.undated'), 'is-faint');
   if (read.allDay) chip('clock', t('cal.allDay'), 'is-time');
   else if (read.time) { const [h, mi] = read.time.split(':').map(Number); const a = h * 60 + mi; chip('clock', read.kind === 'event' && read.dur ? `${clockOf(a)} – ${clockOf((a + read.dur) % 1440)}` : clockOf(a), 'is-time'); }
   if (read.rule) chip('repeat', fmt.repeat(read.rule), 'is-repeat');
   if (read.remind != null) chip('bell', fmt.remind(read.remind), 'is-remind');
   if (read.tag) chip('tag', `#${read.tag}`, 'is-tag');
   if (read.priority) chip('flag', '!'.repeat(read.priority), 'is-priority');
   chips.replaceChildren(...list);
   hint.hidden = !!input.value.trim();
  };
  input.addEventListener('input', show);
  input.addEventListener('scroll', () => { mirror.scrollLeft = input.scrollLeft; });
  input.addEventListener('keydown', async event => {
   if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    if (!read?.title) { root.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 300 }); return; }
    const tag = read.tag ? await Store.tagNamed(read.tag) : null;
    // A reminder by default for what has a time: at the start of a task, ten minutes before an event.
    const remind = read.remind != null ? read.remind : read.time ? (read.kind === 'event' ? 10 : 0) : null;
    const data = { title: read.title, kind: read.kind, date: read.date, time: read.allDay ? null : read.time, dur: read.kind === 'event' && read.time ? read.dur ?? 60 : read.dur, rule: read.rule, remind, tag: tag?.id || null, priority: read.priority, by: 'user' };
    const answer = await Store.add(data);
    this.dismiss();
    if (answer?.item) this.landed(answer.item);
   }
  });
  input.value = text;
  show();
  this.place(root, anchor || point, { side: anchor && !draft ? 'below' : 'right', width: 420 });
  requestAnimationFrame(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
 }

 // A new entry on a day not on screen: a word says where it went, and a press shows it there.
 landed(item) {
  if (!item.date) { this.toast(t('cal.added.undated')); return; }
  const shown = this.page.body.querySelector(`[data-id="${CSS.escape(item.id)}"]`);
  if (shown) { this.light(shown); return; }
  this.toast(t('cal.added', { day: fmt.near(Core.parseDay(item.date), UI.todayWall()) }), t('cal.show'), () => { this.page.anchor = Core.parseDay(item.date); this.page.render({ morph: true }); });
 }

 toast(text, action = '', act = null) {
  this.page.root.querySelector('.cal-toast')?.remove();
  const node = el('div', 'cal-toast glass-lens');
  node.append(word(text));
  if (action) { const button = el('button', 'cal-link'); button.type = 'button'; button.append(word(action)); button.addEventListener('click', () => { node.remove(); act?.(); }); node.append(button); }
  this.page.root.append(node);
  if (!reduced()) node.animate([{ opacity: 0, transform: 'translate(-50%, 10px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 320, easing: SPRING });
  setTimeout(() => { if (!node.isConnected) return; node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(() => node.remove(), () => node.remove()); }, 4200);
 }

 // The card of an entry: everything about it, each line a control. An entry of a calendar kept elsewhere is only shown.
 card(node) {
  const found = this.find(node);
  if (!found) return;
  const { item, feed, key } = found;
  const root = this.popover('cal-card-pop', node);
  this.pop.node = node;
  node.classList.add('is-open');
  this.pop.onClose = () => node.classList.remove('is-open');
  const time = { start: +node.dataset.start, end: +node.dataset.end, allDay: !item.time };
  const top = el('div', 'cal-card-top');
  const mark = item.kind === 'task' ? el('span', `cal-ring-mini${item.done ? ' is-done' : ''}`) : el('span', `cal-dot${feed ? ` t-${feed.tone}` : Store.tag(item.tag) ? ` t-${Store.tag(item.tag).tone}` : ''}`);
  const title = el('input', 'cal-card-title');
  title.value = item.title;
  title.readOnly = !!feed;
  title.setAttribute('aria-label', t('cal.card.title'));
  top.append(mark, title);
  root.append(top);
  const when = el('div', 'cal-card-when');
  const whenText = () => {
   if (!item.date) return t('cal.undated');
   const day = Core.parseDay(node.dataset.start ? Core.dayKey(Core.toWall(+node.dataset.start)) : item.date);
   return `${fmt.long(day)}${item.time ? ` · ${fmt.span({ ...time, kind: item.kind })}` : ''}`;
  };
  when.append(word(whenText()));
  root.append(when);
  if (feed) {
   const from = el('div', 'cal-card-from');
   from.append(el('span', `cal-dot t-${feed.tone}`), word(t('cal.card.from', { name: feed.name })));
   root.append(from);
   if (item.place) root.append(this.line('place', t('cal.card.place'), item.place));
   if (item.note) { const note = el('div', 'cal-card-note is-read'); note.textContent = item.note; root.append(note); }
   this.place(root, node, { width: 340 });
   return;
  }
  const save = async changes => { const answer = await Store.update(item.id, changes); if (answer?.item) Object.assign(item, answer.item); };
  title.addEventListener('change', () => { const value = title.value.trim(); if (value && value !== item.title) save({ title: value }); });
  title.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); title.blur(); } });
  const lines = el('div', 'cal-fields');
  const line = (glyph, label, value, open) => {
   const row = this.line(glyph, label, value);
   if (open) {
    row.classList.add('is-button');
    row.addEventListener('click', () => { if (this.skip === row) { this.skip = null; return; } open(row); });
   }
   lines.append(row);
   return row;
  };
  // The day and the time: a small month to pick a day; times by a quarter of an hour.
  line('day', t('cal.card.day'), item.date ? fmt.near(Core.parseDay(item.date), UI.todayWall()) : t('cal.undated'), row => this.pickDay(row, item.date, day => (item.rule && key && day ? Store.move(item, key, { date: day }) : save({ date: day }))));
  line('clock', t('cal.card.time'), item.time ? fmt.span({ ...time, kind: item.kind }) : t('cal.allDay'), row => this.pickTime(row, item, key));
  line('repeat', t('cal.card.repeat'), fmt.repeat(item.rule), row => this.menuOf(row, this.repeatChoices(item), choice => save({ rule: choice })));
  line('bell', t('cal.card.remind'), fmt.remind(item.remind), row => this.menuOf(row, [null, 0, 5, 10, 15, 30, 60, 1440].map(minutes => ({ label: fmt.remind(minutes), value: minutes, on: item.remind === minutes })), choice => save({ remind: choice })));
  const tag = Store.tag(item.tag);
  const tagRow = line('tag', t('cal.card.tag'), '', row => this.menuOf(row, [{ label: t('cal.tag.none'), value: null, on: !item.tag }, ...Store.tags.map(one => ({ label: one.name, value: one.id, tone: one.tone, on: one.id === item.tag }))], choice => save({ tag: choice })));
  tagRow.querySelector('.cal-field-value').replaceChildren(tag ? this.page.tagChip(tag) : word(t('cal.tag.none')));
  if (item.kind === 'task') line('flag', t('cal.card.priority'), t(`cal.priority.${item.priority || 0}`), row => this.menuOf(row, [0, 1, 2, 3].map(n => ({ label: t(`cal.priority.${n}`), value: n, on: (item.priority || 0) === n })), choice => save({ priority: choice })));
  const kindRow = line(item.kind === 'event' ? 'day' : 'tick', t('cal.card.kind'), t(item.kind === 'event' ? 'cal.kind.event' : 'cal.kind.task'), () => save({ kind: item.kind === 'event' ? 'task' : 'event', ...(item.kind === 'task' && item.time && !item.dur ? { dur: 60 } : {}) }).then(() => this.dismiss()));
  void kindRow;
  root.append(lines);
  new Glide(lines, '.cal-field.is-button');
  const note = el('textarea', 'cal-card-note');
  note.placeholder = t('cal.card.note');
  note.value = item.note || '';
  note.rows = 2;
  note.addEventListener('change', () => save({ note: note.value }));
  root.append(note);
  if (item.by === 'agent' && item.chat) {
   const by = el('div', 'cal-card-by');
   by.innerHTML = window.Glyphs?.ghost || '';
   by.append(word(t('cal.card.byAgent')));
   root.append(by);
  }
  const foot = el('div', 'cal-card-foot');
  const remove = el('button', 'cal-btn is-danger');
  remove.type = 'button';
  remove.append(word(item.rule && key ? t('cal.card.removeOne') : t('cal.card.remove')));
  remove.addEventListener('click', async () => { this.dismiss(); if (item.rule && key) await Store.skip(item, key); else await Store.remove(item.id); this.toast(t('cal.removed'), t('cal.undo'), () => Store.takeBack()); });
  foot.append(remove);
  if (item.rule && key) {
   const all = el('button', 'cal-btn is-danger is-quiet');
   all.type = 'button';
   all.append(word(t('cal.card.removeAll')));
   all.addEventListener('click', async () => { this.dismiss(); await Store.remove(item.id); this.toast(t('cal.removed'), t('cal.undo'), () => Store.takeBack()); });
   foot.append(all);
  }
  foot.append(el('span', 'cal-grow'));
  if (item.kind === 'task') {
   const done = el('button', 'cal-btn');
   done.type = 'button';
   const isDone = item.rule ? (item.doneKeys || []).includes(key) : item.done;
   done.append(word(isDone ? t('cal.undone') : t('cal.done')));
   done.addEventListener('click', async () => { this.dismiss(); await Store.done(item, key, !isDone); });
   foot.append(done);
  }
  root.append(foot);
  this.place(root, node, { width: 344 });
 }

 line(glyph, label, value) {
  const row = el('div', 'cal-field');
  const iconNode = el('span', 'cal-field-icon');
  iconNode.innerHTML = ICONS[glyph] || '';
  const valueNode = el('span', 'cal-field-value');
  if (value) valueNode.append(word(value));
  row.append(iconNode, word(label, 'cal-field-label'), valueNode);
  return row;
 }

 repeatChoices(item) {
  const day = Core.parseDay(item.date) || UI.todayWall();
  const wd = Core.weekday(day);
  const choices = [
   { label: t('cal.repeat.none'), value: null },
   { label: t('cal.repeat.daily'), value: { freq: 'daily' } },
   { label: t('cal.repeat.weekdays'), value: { freq: 'weekly', byday: [1, 2, 3, 4, 5].map(d => ({ n: 0, day: d })) } },
   { label: `${t('cal.repeat.weekly')} · ${fmt.weekday(day)}`, value: { freq: 'weekly', byday: [{ n: 0, day: wd }] } },
   { label: t('cal.repeat.everyWeeks', { n: 2 }), value: { freq: 'weekly', interval: 2, byday: [{ n: 0, day: wd }] } },
   { label: `${t('cal.repeat.monthly')} · ${day.d}`, value: { freq: 'monthly' } },
   { label: t('cal.repeat.yearly'), value: { freq: 'yearly' } },
  ];
  const now = JSON.stringify(Core.clean(item.rule));
  for (const choice of choices) choice.on = JSON.stringify(Core.clean(choice.value)) === now;
  return choices;
 }

 // A small menu, the app's glass, with the highlight gliding under the pointer.
 menuOf(anchor, choices, act) {
  this.closeMenu();
  const menu = el('div', 'cal-menu glass-lens');
  menu.setAttribute('role', 'menu');
  for (const choice of choices) {
   const line = el('button', `cal-menu-line${choice.on ? ' is-on' : ''}`);
   line.type = 'button';
   line.setAttribute('role', 'menuitem');
   if (choice.tone) line.append(el('span', `cal-dot t-${choice.tone}`));
   line.append(word(choice.label));
   if (choice.on) { const tick = el('span', 'cal-menu-tick'); tick.innerHTML = ICONS.tick; line.append(tick); }
   line.addEventListener('click', event => { event.stopPropagation(); this.closeMenu(); act(choice.value); this.refresh(); });
   menu.append(line);
  }
  document.body.append(menu);
  new Glide(menu, '.cal-menu-line');
  const rect = anchor.getBoundingClientRect();
  const w = Math.max(200, menu.offsetWidth), h = menu.offsetHeight;
  const x = clamp(rect.right - w, 12, innerWidth - w - 12), y = rect.bottom + 6 + h > innerHeight - 12 ? rect.top - h - 6 : rect.bottom + 6;
  Object.assign(menu.style, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px`, minWidth: `${w}px` });
  if (!reduced()) menu.animate([{ opacity: 0, transform: 'scale(1.06, 0.96)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 160, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' });
  this.menu = menu;
  this.menuAnchor = anchor;
  menu.querySelector('.is-on, .cal-menu-line')?.focus({ preventScroll: true });
 }

 closeMenu() {
  if (!this.menu) return;
  const menu = this.menu;
  this.menu = null;
  this.menuAnchor = null;
  menu.style.pointerEvents = 'none';
  menu.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(1.04)', filter: 'blur(6px)' }], { duration: 110, easing: 'ease-out', fill: 'forwards' }).finished.then(() => menu.remove(), () => menu.remove());
 }

 // The card shows the entry as it is now, after a change made from it.
 refresh() {
  const node = this.pop?.node;
  if (!node) return;
  setTimeout(() => {
   if (!this.pop) return;
   const fresh = this.page.body.querySelector(`[data-uid="${CSS.escape(node.dataset.uid)}"]`) || this.page.body.querySelector(`[data-id="${CSS.escape(node.dataset.id)}"]`);
   if (fresh) { const keep = this.pop.root.getBoundingClientRect(); this.pop.root.remove(); this.pop = null; this.card(fresh); if (this.pop) { Object.assign(this.pop.root.style, { left: `${keep.left}px`, top: `${keep.top}px` }); this.pop.root.getAnimations().forEach(a => a.finish()); } }
  }, 90);
 }

 // A small month to pick a day.
 pickDay(anchor, current, act) {
  this.closeMenu();
  const menu = el('div', 'cal-menu cal-picker glass-lens');
  let shown = Core.parseDay(current) || UI.todayWall();
  shown = { y: shown.y, m: shown.m, d: 1 };
  const draw = () => {
   menu.replaceChildren();
   const head = el('div', 'cal-picker-head');
   const back = el('button', 'cal-round is-small'); back.type = 'button'; back.innerHTML = ICONS.left;
   const forth = el('button', 'cal-round is-small'); forth.type = 'button'; forth.innerHTML = ICONS.right;
   back.addEventListener('click', event => { event.stopPropagation(); const m = shown.m - 2; shown = { y: shown.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 + 1, d: 1 }; draw(); });
   forth.addEventListener('click', event => { event.stopPropagation(); const m = shown.m; shown = { y: shown.y + Math.floor(m / 12), m: (m % 12) + 1, d: 1 }; draw(); });
   head.append(word(fmt.month(shown), 'cal-picker-month'), back, forth);
   const grid = el('div', 'cal-picker-grid');
   const first = UI.mondayOf(shown), today = Core.dayKey(UI.todayWall());
   for (let k = 0; k < 7; k++) grid.append(word(fmt.weekday(Core.addDays(first, k)).slice(0, 2), 'cal-picker-wd'));
   for (let k = 0; k < 42; k++) {
    const day = Core.addDays(first, k), key = Core.dayKey(day);
    const cell = el('button', `cal-picker-day${day.m !== shown.m ? ' is-out' : ''}${key === today ? ' is-today' : ''}${key === current ? ' is-on' : ''}`);
    cell.type = 'button';
    cell.append(word(String(day.d)));
    cell.addEventListener('click', event => { event.stopPropagation(); this.closeMenu(); act(key); this.refresh(); });
    grid.append(cell);
   }
   const none = el('button', 'cal-menu-line');
   none.type = 'button';
   none.append(word(t('cal.undated')));
   none.addEventListener('click', event => { event.stopPropagation(); this.closeMenu(); act(null); this.refresh(); });
   menu.append(head, grid, none);
  };
  draw();
  document.body.append(menu);
  new Glide(menu, '.cal-picker-day, .cal-menu-line');
  const rect = anchor.getBoundingClientRect(), w = 272, h = menu.offsetHeight;
  Object.assign(menu.style, { left: `${Math.round(clamp(rect.right - w, 12, innerWidth - w - 12))}px`, top: `${Math.round(rect.bottom + 6 + h > innerHeight - 12 ? rect.top - h - 6 : rect.bottom + 6)}px`, width: `${w}px` });
  if (!reduced()) menu.animate([{ opacity: 0, transform: 'scale(1.06, 0.96)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 160, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' });
  this.menu = menu;
  this.menuAnchor = anchor;
 }

 // Times by a quarter of an hour, and how long; «весь день» takes the time away.
 pickTime(anchor, item, key) {
  const choices = [{ label: t('cal.allDay'), value: { time: null }, on: !item.time }];
  const start = item.time ? Core.parseTime(item.time) : { h: 9, mi: 0 };
  const from = Math.max(0, start.h * 60 + start.mi - 120);
  for (let m = from; m < Math.min(24 * 60, from + 6 * 60); m += STEP) choices.push({ label: clockOf(m), value: { time: keyClock(m) }, on: item.time === keyClock(m) });
  if (item.kind === 'event' && item.time) for (const dur of [15, 30, 45, 60, 90, 120, 180]) choices.push({ label: t('cal.card.long', { d: dur < 60 ? `${dur} ${t('cal.min')}` : `${dur / 60} ${t('cal.h')}` }), value: { dur }, on: item.dur === dur });
  this.menuOf(anchor, choices, value => {
   if (!value) return;
   if (item.rule && key) Store.move(item, key, value);
   else Store.update(item.id, { ...value, ...(value.time && !item.date ? { date: Core.dayKey(UI.todayWall()) } : {}) });
  });
  this.menu?.querySelector('.is-on')?.scrollIntoView({ block: 'center' });
 }

 // An entry shown, as when a notification is pressed: its card opens over it.
 reveal({ id, key, day } = {}) {
  const item = Store.item(id);
  if (!item) return;
  const target = Core.parseDay((key || '').slice(0, 10)) || Core.parseDay(item.date);
  if (target && this.page.view !== 'tasks' && !this.page.body.querySelector(`[data-uid="${CSS.escape(`${id}|${key}`)}"]`)) { this.page.anchor = target; this.page.render(); }
  const node = this.page.body.querySelector(`[data-uid="${CSS.escape(`${id}|${key}`)}"]`) || this.page.body.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (node) { node.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); this.light(node); setTimeout(() => this.card(node), 300); }
  void day;
 }

 // The light that runs once round an entry the agent has just written: the same fine ice line as the notes' pill.
 light(node) {
  if (reduced() || !node?.isConnected) return;
  const rect = node.getBoundingClientRect();
  const radius = parseFloat(getComputedStyle(node).borderTopLeftRadius) || 10;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cal-light');
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  const perimeter = 2 * (rect.width + rect.height);
  const make = (cls, share) => {
   const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
   Object.entries({ x: 0.75, y: 0.75, width: rect.width - 1.5, height: rect.height - 1.5, rx: radius, pathLength: 1, class: cls }).forEach(([k, v]) => r.setAttribute(k, v));
   r.style.strokeDasharray = `${share} ${1 - share}`;
   svg.append(r);
   return r;
  };
  const glow = make('cal-light-glow', 140 / perimeter), head = make('cal-light-head', 60 / perimeter);
  node.append(svg);
  const time = clamp(perimeter / 0.5, 1100, 1800);
  for (const r of [glow, head]) r.animate([{ strokeDashoffset: 0.08 }, { strokeDashoffset: -0.92 }], { duration: time, easing: 'cubic-bezier(0.42, 0, 0.58, 1)', fill: 'forwards' });
  const shown = svg.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: time, easing: 'linear', fill: 'forwards' });
  node.classList.add('is-lit');
  const done = () => { svg.remove(); node.classList.remove('is-lit'); };
  shown.finished.then(done, done);
 }

 // A reminder while the app is open: a card of glass at the top right, over whatever is on screen.
 remind(card) {
  if (card.quiet) { this.reminders.push(card); return; }
  const node = el('div', 'cal-reminder glass-lens');
  const head = el('div', 'cal-reminder-head');
  const sign = el('span', 'cal-reminder-sign');
  sign.innerHTML = window.Glyphs?.calendar || ICONS.day;
  const minutes = Math.round((card.begins - Date.now()) / 60000);
  head.append(sign, word(card.allDay ? t('cal.allDay') : minutes <= 0 ? t('cal.now') : fmt.soon({ start: card.begins, end: card.end }, Date.now()) || fmt.clock(card.begins), 'cal-reminder-when'));
  const close = el('button', 'cal-reminder-close'); close.type = 'button'; close.innerHTML = ICONS.close; close.setAttribute('aria-label', t('cal.close'));
  head.append(close);
  const title = el('div', 'cal-reminder-title', card.title);
  const sub = el('div', 'cal-reminder-sub');
  sub.append(word([card.allDay ? '' : fmt.span({ start: card.begins, end: card.end, kind: card.kind }), card.place].filter(Boolean).join(' · ')));
  const foot = el('div', 'cal-reminder-foot');
  const button = (label, act, cls = '') => { const b = el('button', `cal-btn ${cls}`); b.type = 'button'; b.append(word(label)); b.addEventListener('click', act); foot.append(b); return b; };
  const gone = () => { node.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(24px) scale(0.98)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.then(() => node.remove(), () => node.remove()); };
  const later = button(t('cal.snooze'), () => this.menuOf(later, [5, 10, 30, 60].map(n => ({ label: n < 60 ? t('cal.snoozeMin', { n }) : t('cal.snoozeHour'), value: n })), n => { Store.snooze(card.id, card.key, n); gone(); }));
  if (card.kind === 'task') button(t('cal.done'), async () => { const item = Store.item(card.id); if (item) await Store.done(item, card.key, true); gone(); });
  button(t('cal.show'), () => { gone(); this.page.open({ at: { id: card.id, key: card.key } }); }, 'is-main');
  close.addEventListener('click', gone);
  node.append(head, title, sub, foot);
  this.stack.append(node);
  window.Notify?.play?.();
  if (!reduced()) {
   node.animate([{ opacity: 0, transform: 'translateY(-14px) scale(0.96)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 460, easing: SPRING });
   setTimeout(() => this.light(node), 200);
  }
 }

 // Reminders that came while the window was put away are shown when it is back.
 back() {
  const waiting = this.reminders.splice(0);
  for (const card of waiting) if (card.begins > Date.now() - 10 * 60000) this.remind({ ...card, quiet: false });
 }

 // Other calendars: Google, iCloud, Outlook by their secret iCalendar address, or an .ics file; shown and kept up to
 // date, or copied in once. Those connected: their colour, shown or not, read again, taken away.
 connect(anchor) {
  const root = this.popover('cal-connect', anchor);
  const draw = () => {
   root.replaceChildren();
   const head = el('div', 'cal-connect-head');
   head.append(word(t('cal.feeds.title'), 'cal-connect-title'));
   root.append(head);
   for (const feed of Store.feeds) {
    const row = el('div', 'cal-feed');
    const dot = el('button', `cal-dot t-${feed.tone}${feed.on ? '' : ' is-off'}`);
    dot.type = 'button';
    dot.title = t(feed.on ? 'cal.feeds.hide' : 'cal.feeds.showIt');
    dot.addEventListener('click', async () => { await Store.feedUpdate(feed.id, { on: !feed.on }); draw(); });
    const info = el('div', 'cal-feed-info');
    info.append(el('div', 'cal-feed-name', feed.name));
    const sub = el('div', 'cal-feed-sub');
    sub.append(word(feed.error ? t('cal.feeds.error') : t('cal.feeds.read', { n: (feed.entries || []).length })));
    info.append(sub);
    const again = el('button', 'cal-round is-small'); again.type = 'button'; again.innerHTML = ICONS.repeat; again.title = t('cal.feeds.refresh');
    again.addEventListener('click', async () => { again.classList.add('is-busy'); await Store.feedRefresh(feed.id); draw(); });
    const remove = el('button', 'cal-round is-small'); remove.type = 'button'; remove.innerHTML = ICONS.trash; remove.title = t('cal.feeds.remove');
    remove.addEventListener('click', async () => { await Store.feedRemove(feed.id); draw(); });
    row.append(dot, info, again, remove);
    root.append(row);
   }
   const form = el('div', 'cal-connect-form');
   const input = el('input', 'cal-connect-input');
   input.type = 'url';
   input.placeholder = t('cal.feeds.placeholder');
   const modes = el('div', 'cal-connect-modes');
   let copy = false;
   const mode = (label, value) => { const b = el('button', `cal-qchip${copy === value ? ' is-on' : ''}`); b.type = 'button'; b.append(word(label)); b.addEventListener('click', () => { copy = value; modes.querySelectorAll('.cal-qchip').forEach(one => one.classList.toggle('is-on', one === b)); }); modes.append(b); };
   mode(t('cal.feeds.modeShow'), false);
   mode(t('cal.feeds.modeCopy'), true);
   const add = el('button', 'cal-btn is-main'); add.type = 'button'; add.append(word(t('cal.feeds.add')));
   const said = el('div', 'cal-connect-said');
   add.addEventListener('click', async () => {
    if (!input.value.trim()) { input.focus(); return; }
    add.disabled = true;
    said.textContent = t('cal.feeds.reading');
    const answer = await Store.connect({ url: input.value, copy });
    add.disabled = false;
    if (answer?.error) { said.textContent = t(`cal.feeds.err.${answer.error}`); return; }
    said.textContent = copy ? t('cal.feeds.copied', { n: answer.added || 0 }) : '';
    input.value = '';
    if (!copy) draw();
   });
   form.append(input, modes, add);
   root.append(form, said);
   const how = el('details', 'cal-connect-how');
   const summary = el('summary', '', t('cal.feeds.how'));
   how.append(summary);
   for (const name of ['google', 'icloud', 'outlook']) { const p = el('p'); p.append(el('b', '', t(`cal.feeds.how.${name}.name`)), document.createTextNode(` ${t(`cal.feeds.how.${name}`)}`)); how.append(p); }
   root.append(how);
   const file = el('button', 'cal-menu-line');
   file.type = 'button';
   file.innerHTML = ICONS.inbox;
   file.append(word(t('cal.feeds.file')));
   file.addEventListener('click', async () => { const answer = await Store.importFile(); if (answer?.added != null) said.textContent = t('cal.feeds.copied', { n: answer.added }); else if (answer?.error) said.textContent = t('cal.feeds.err.read'); });
   root.append(file);
  };
  draw();
  this.place(root, anchor, { side: 'below', width: 440 });
 }
}

window.CalendarHand = CalendarHand;
window.CalendarGlide = Glide;
void TONES;
})();
