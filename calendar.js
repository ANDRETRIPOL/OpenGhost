(() => {
'use strict';

// The calendar's page, in the place of the chat, opened from its row in the sidebar. Five ways to see it: a day (the
// strip of days, the day's brief, its entries), three days and a week on a scale of hours, a month, and the tasks by
// when they are due. Every time of an entry is one element with its uid wherever it is shown, so going from one view to
// another moves each of them from where it was to where it is now. The hand's part — dragging, the card of an entry,
// the field to type a new one, the reminders — is calendar-hand.js.
const Core = window.CalendarCore;
const Store = window.CalendarStore;
// A word with a count takes the form for that count where the language has one («1 событие», «2 события», «5 событий»).
const t = (key, params) => {
 const I = window.I18n;
 if (typeof params?.n === 'number') { const form = `${key}.${new Intl.PluralRules(I.lang || 'en').select(params.n)}`; if (I.has(form)) return I.t(form, params); }
 return I.t(key, params);
};
const lang = () => window.I18n?.lang || 'en';
const locale = () => (lang() === 'en' ? 'en-GB' : lang());
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SPRING = 'cubic-bezier(0.34, 1.26, 0.64, 1)';
const VIEWS = ['day', 'days', 'week', 'month', 'tasks'];
const HOUR = 56;
const STORE_VIEW = 'calendar.view';

const el = (tag, cls = '', text = null) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
// A label stands in the middle of its box by its capitals (cap-trimmed in its own span).
const word = (text, cls = '') => el('span', `cal-t${cls ? ` ${cls}` : ''}`, text);

// A label that changes turns over as the figures of the update button do (update-pill.js; its own copy here): the old
// one rises out blurred, the new one comes up from below, going back the other way round. `each`: figure by figure from
// the right, only those that changed; otherwise the word as a whole. When it has turned it is plain text again.
const ROLL = { duration: 380, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' };
const RISE = 0.62, BLUR = 3;
function roll(node, from, to, dir = 1, each = true) {
 if (from === to || reduced()) return;
 const a = each ? [...from] : [from], b = each ? [...to] : [to], up = dir < 0 ? -1 : 1;
 const out = [{ transform: 'none', filter: 'blur(0px)', opacity: 1 }, { transform: `translateY(${-RISE * up}em)`, filter: `blur(${BLUR}px)`, opacity: 0 }];
 const come = [{ transform: `translateY(${RISE * up}em)`, filter: `blur(${BLUR}px)`, opacity: 0 }, { transform: 'none', filter: 'blur(0px)', opacity: 1 }];
 const token = String(Math.random());
 node.dataset.roll = token;
 node.textContent = '';
 node.classList.add('cal-roll');
 const slot = () => el('span', 'cal-slot');
 const glyph = (text, leaving) => el('span', `cal-glyph${leaving ? ' is-leaving' : ''}`, text);
 const n = Math.max(a.length, b.length), widths = [];
 for (let i = 0; i < n; i++) {
  const was = a[a.length - n + i], now = b[b.length - n + i], box = slot();
  node.append(box);
  if (was === now) { box.append(glyph(now)); continue; }
  const old = was != null ? glyph(was, true) : null, fresh = now != null ? glyph(now) : null;
  if (old) box.append(old);
  if (fresh) box.append(fresh);
  widths.push([box, old ? old.offsetWidth : 0, fresh ? fresh.offsetWidth : 0]);
  old?.animate(out, { ...ROLL, fill: 'forwards' });
  fresh?.animate(come, ROLL);
 }
 for (const [box, w0, w1] of widths) if (Math.abs(w0 - w1) > 0.5) box.animate([{ width: `${w0}px` }, { width: `${w1}px` }], ROLL);
 setTimeout(() => { if (node.dataset.roll !== token) return; delete node.dataset.roll; node.classList.remove('cal-roll'); node.textContent = to; }, ROLL.duration + 40);
}
const icon = body => `<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
 left: icon('<path d="M15 6l-6 6 6 6"/>'),
 right: icon('<path d="M9 6l6 6-6 6"/>'),
 plus: icon('<path d="M12 5.5v13M5.5 12h13"/>'),
 repeat: icon('<path d="M17 4.5l2.5 2.5L17 9.5"/><path d="M5 11.5V10a3 3 0 0 1 3-3h11.5"/><path d="M7 19.5L4.5 17 7 14.5"/><path d="M19 12.5V14a3 3 0 0 1-3 3H4.5"/>'),
 bell: icon('<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
 tag: icon('<path d="M4.5 12.3V5.5a1 1 0 0 1 1-1h6.8l7.2 7.2a1 1 0 0 1 0 1.4l-5.8 5.8a1 1 0 0 1-1.4 0z"/><circle cx="8.6" cy="8.6" r="1.2"/>'),
 flag: icon('<path d="M6 20.5V4.5"/><path d="M6 5h11l-2.5 4 2.5 4H6"/>'),
 clock: icon('<circle cx="12" cy="12" r="7.5"/><path d="M12 8v4.2l2.8 1.8"/>'),
 tick: icon('<path d="M6 12.5l4 4 8-9"/>'),
 alert: icon('<path d="M12 4.5l8.5 15h-17z"/><path d="M12 10.5v4"/><circle cx="12" cy="17.2" r=".4" fill="currentColor"/>'),
 flame: icon('<path d="M12 20.5c3.6 0 6-2.4 6-5.7 0-3.6-2.6-5.6-3.6-8.8-1.6 1.4-2.2 3-2.2 4.6-1-.8-1.7-2-1.9-3.3C8 9 6 11.6 6 14.8c0 3.3 2.4 5.7 6 5.7z"/>'),
 note: icon('<path d="M6.5 4.5h11v15h-11z"/><path d="M9.5 9h5M9.5 12.5h5M9.5 16h3"/>'),
 place: icon('<path d="M12 20.5s-6-5.6-6-10.5a6 6 0 0 1 12 0c0 4.9-6 10.5-6 10.5z"/><circle cx="12" cy="10" r="2.2"/>'),
 trash: icon('<path d="M5 7h14M9.5 7V5h5v2M7 7l.8 12h8.4L17 7"/>'),
 close: icon('<path d="M7 7l10 10M17 7L7 17"/>'),
 // Three round lobes on a flat base, its ink centred on 12, 12: from 3.5 to 20.5 across, from 6 to 18 down.
 cloud: icon('<path d="M7.25 18a3.75 3.75 0 1 1 .75-7.42 4.5 4.5 0 1 1 8.97.42 3.5 3.5 0 1 1 .03 7z"/>'),
 inbox: icon('<path d="M4.5 13.5l2-8h11l2 8v5h-15z"/><path d="M4.5 13.5h4.3l1 2h4.4l1-2h4.3"/>'),
 day: icon('<rect x="4.5" y="5.5" width="15" height="14" rx="3"/><path d="M4.5 9.5h15M9 3.5v3M15 3.5v3"/>'),
};

// Words for days and times, in the app's language.
const fmt = {
 clock(ms) { const w = Core.toWall(ms); return `${w.h}:${Core.pad(w.mi)}`; },
 span(time) { return time.allDay ? t('cal.allDay') : time.end > time.start + 60000 && time.kind !== 'task' ? `${fmt.clock(time.start)} – ${fmt.clock(time.end)}` : fmt.clock(time.start); },
 weekday(day, style = 'short') { const name = new Intl.DateTimeFormat(locale(), { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(day.y, day.m - 1, day.d))); return name[0].toUpperCase() + name.slice(1).replace(/\.$/, ''); },
 dayMonth(day, month = 'short') { return new Intl.DateTimeFormat(locale(), { day: 'numeric', month, timeZone: 'UTC' }).format(new Date(Date.UTC(day.y, day.m - 1, day.d))); },
 month(day) { const text = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(day.y, day.m - 1, 1))); return text[0].toUpperCase() + text.slice(1).replace(/\s*г\.$/, ''); },
 long(day) { const text = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(day.y, day.m - 1, day.d))); return text.replace(/\s*г\.$/, ''); },
 // «Сегодня», «Завтра», «Вчера», or «Ср, 25 нояб.».
 near(day, today) {
  const gap = Core.dayNumber(day.y, day.m, day.d) - Core.dayNumber(today.y, today.m, today.d);
  if (gap === 0) return t('cal.today');
  if (gap === 1) return t('cal.tomorrow');
  if (gap === -1) return t('cal.yesterday');
  return `${fmt.weekday(day)}, ${fmt.dayMonth(day)}`;
 },
 // «через 20 мин», «через 2 ч», «идёт».
 soon(time, now) {
  const minutes = Math.round((time.start - now) / 60000);
  if (time.start <= now && time.end > now) return time.kind === 'task' ? '' : t('cal.going');
  if (minutes <= 0 || minutes > 180) return '';
  return minutes < 60 ? t('cal.inMin', { n: minutes }) : t('cal.inHours', { n: Math.round(minutes / 60) });
 },
 repeat(rule) {
  if (!rule) return t('cal.repeat.none');
  const days = (rule.byday || []).filter(item => !item.n).map(item => item.day);
  const every = rule.interval > 1;
  if (rule.freq === 'daily') return every ? t('cal.repeat.everyDays', { n: rule.interval }) : t('cal.repeat.daily');
  if (rule.freq === 'weekly') {
   if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return t('cal.repeat.weekdays');
   if (days.length === 2 && days.includes(0) && days.includes(6)) return t('cal.repeat.weekends');
   const names = days.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => fmt.weekday(Core.addDays({ y: 2026, m: 11, d: 22 }, d))).join(', ');
   return every ? t('cal.repeat.everyWeeks', { n: rule.interval }) + (names ? ` · ${names}` : '') : names || t('cal.repeat.weekly');
  }
  if (rule.freq === 'monthly') return t('cal.repeat.monthly');
  return t('cal.repeat.yearly');
 },
 remind(minutes) {
  if (minutes == null) return t('cal.remind.none');
  if (minutes === 0) return t('cal.remind.at');
  if (minutes % 1440 === 0) return t('cal.remind.days', { n: minutes / 1440 });
  if (minutes % 60 === 0) return t('cal.remind.hours', { n: minutes / 60 });
  return t('cal.remind.minutes', { n: minutes });
 },
};

const todayWall = () => Core.toWall(Date.now());
const dayOf = key => Core.parseDay(key);
const startOf = day => Core.toMoment({ ...day, h: 0, mi: 0 }, 'local');
const mondayOf = day => Core.addDays(day, -((Core.weekday(day) + 6) % 7));

class CalendarPage {
 constructor({ main, list = null, onOpen = null }) {
  Object.assign(this, { main, list, onOpen });
  this.opened = false;
  this.view = (() => { try { const saved = localStorage.getItem(STORE_VIEW); return VIEWS.includes(saved) ? saved : 'day'; } catch { return 'day'; } })();
  const now = todayWall();
  this.anchor = { y: now.y, m: now.m, d: now.d };
  this.root = el('section', 'cal');
  this.root.hidden = true;
  this.root.setAttribute('aria-label', t('cal.title'));
  this.build();
  main.append(this.root);
  this.hand = window.CalendarHand ? new window.CalendarHand(this) : null;
  Store.on((view, before) => { if (this.opened) this.render({ morph: true, before }); this.count(); });
  Store.ready.then(() => this.count());
  // The line of now and the «in 20 min» words keep up with the clock; the day changes at midnight.
  this.clock = setInterval(() => this.minute(), 30000);
  document.addEventListener('keydown', event => this.key(event));
 }

 build() {
  const head = el('header', 'cal-head');
  this.mark = el('span', 'cal-mark');
  this.mark.innerHTML = window.Glyphs?.calendar || ICONS.day;
  this.titleBox = el('div', 'cal-title');
  this.title = el('h1', 'cal-h1');
  this.subtitle = el('div', 'cal-sub');
  this.titleBox.append(this.title, this.subtitle);
  const tools = el('div', 'cal-tools');
  this.seg = el('div', 'cal-seg');
  this.segPlate = el('span', 'cal-seg-plate');
  this.seg.append(this.segPlate);
  this.segButtons = VIEWS.map(view => {
   const button = el('button', 'cal-seg-btn');
   button.type = 'button';
   button.dataset.view = view;
   button.append(word(t(`cal.view.${view}`)));
   button.addEventListener('click', () => this.setView(view));
   this.seg.append(button);
   return button;
  });
  this.todayButton = el('button', 'cal-pill');
  this.todayButton.type = 'button';
  this.todayButton.append(word(t('cal.today')));
  this.todayButton.addEventListener('click', () => this.goToday());
  const round = (name, label, handler, cls = '') => { const button = el('button', `cal-round${cls}`); button.type = 'button'; button.innerHTML = ICONS[name]; button.setAttribute('aria-label', label); button.title = label; button.addEventListener('click', handler); return button; };
  this.prev = round('left', t('cal.prev'), () => this.go(-1));
  this.next = round('right', t('cal.next'), () => this.go(1));
  this.feedsButton = round('cloud', t('cal.feeds.title'), () => this.hand?.connect(this.feedsButton), ' is-feeds');
  this.addButton = round('plus', t('cal.add'), () => this.hand?.quick({ anchor: this.addButton }), ' is-add');
  tools.append(this.seg, this.todayButton, this.prev, this.next, this.feedsButton, this.addButton);
  head.append(this.mark, this.titleBox, tools);
  this.body = el('div', 'cal-body');
  this.root.append(head, this.body);
  // The plate under the view picked follows its button when the window, and so the views, change width.
  if (window.ResizeObserver) new ResizeObserver(() => { if (this.opened) this.placePlate(false); }).observe(this.seg);
 }

 // The row in the sidebar shows how many entries today still has.
 count() {
  if (!this.list?.calendarCount) return;
  const now = Date.now(), today = todayWall();
  const times = Store.times(startOf(today), startOf(Core.addDays(today, 1)) - 1).filter(time => time.kind === 'event' ? time.end > now : !time.done);
  this.list.calendarCount(times.length);
 }

 toggle() { if (this.opened) this.close(); else this.open(); }

 async open({ at = null } = {}) {
  await Store.ready;
  if (!this.seeded) { this.seeded = true; Store.seedTags([t('cal.tag.work'), t('cal.tag.personal'), t('cal.tag.health'), t('cal.tag.family')]).catch(() => {}); }
  if (at?.day) this.anchor = dayOf(at.day) || this.anchor;
  if (this.opened) { this.render({ morph: true }); if (at) this.hand?.reveal(at); return; }
  this.opened = true;
  this.onOpen?.(true);
  this.list?.calendar?.(true);
  this.root.hidden = false;
  this.main.classList.add('is-calendar');
  this.render();
  this.placePlate(false);
  if (!reduced()) {
   this.fly(true);
   this.root.animate([{ opacity: 0, transform: 'translateY(14px) scale(0.992)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: EASE });
  }
  window.openghost?.calendar?.ready?.();
  if (at) requestAnimationFrame(() => this.hand?.reveal(at));
 }

 close() {
  if (!this.opened) return;
  this.opened = false;
  this.hand?.dismiss();
  this.onOpen?.(false);
  this.list?.calendar?.(false);
  this.main.classList.remove('is-calendar');
  if (reduced()) { this.root.hidden = true; return; }
  this.fly(false);
  const away = this.root.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(0.994)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
  away.finished.then(() => { if (!this.opened) this.root.hidden = true; away.cancel(); }).catch(() => {});
 }

 // The calendar's sign flies from its row in the sidebar to the title, and back when the page goes.
 fly(open) {
  const row = this.list?.calendarIcon?.();
  if (!row || !row.getClientRects().length) return;
  const from = (open ? row : this.mark).getBoundingClientRect(), to = (open ? this.mark : row).getBoundingClientRect();
  if (!from.width || !to.width) return;
  const ghost = el('div', 'cal-flight');
  ghost.innerHTML = this.mark.innerHTML;
  Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
  document.body.append(ghost);
  const dx = from.left - to.left, dy = from.top - to.top, s = from.width / to.width;
  this.mark.style.visibility = 'hidden';
  row.style.visibility = 'hidden';
  // A little arc: the sign rises on its way, the way things are thrown.
  const flight = ghost.animate([
   { transform: `translate(${dx}px, ${dy}px) scale(${s})`, color: open ? 'rgba(var(--fg-rgb), 0.62)' : 'rgb(var(--cal-red))' },
   { transform: `translate(${dx * 0.42}px, ${dy * 0.42 - 26}px) scale(${(s + 1) / 2})`, offset: 0.5 },
   { transform: 'none', color: open ? 'rgb(var(--cal-red))' : 'rgba(var(--fg-rgb), 0.62)' },
  ], { duration: 560, easing: EASE });
  flight.finished.catch(() => {}).finally(() => { ghost.remove(); this.mark.style.visibility = ''; row.style.visibility = ''; });
 }

 setView(view, { anchor = null } = {}) {
  if (!VIEWS.includes(view)) return;
  if (anchor) this.anchor = anchor;
  if (view === this.view && !anchor) return;
  this.view = view;
  try { localStorage.setItem(STORE_VIEW, view); } catch {}
  this.hand?.dismiss();
  this.render({ morph: true });
  this.placePlate(true);
 }

 placePlate(animate) {
  const button = this.segButtons.find(one => one.dataset.view === this.view);
  this.segButtons.forEach(one => one.classList.toggle('is-on', one === button));
  if (!button) return;
  const box = this.seg.getBoundingClientRect(), rect = button.getBoundingClientRect();
  if (!box.width) return;
  this.segPlate.style.transition = animate && !reduced() ? `transform 0.48s ${SPRING}, width 0.48s ${SPRING}` : 'none';
  this.segPlate.style.width = `${rect.width}px`;
  this.segPlate.style.transform = `translateX(${rect.left - box.left - 3}px)`;
 }

 go(step) {
  const a = this.anchor;
  if (this.view === 'day' || this.view === 'days') this.anchor = Core.addDays(a, step);
  else if (this.view === 'week') this.anchor = Core.addDays(a, 7 * step);
  else if (this.view === 'month') { const m = a.m - 1 + step; this.anchor = { y: a.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 + 1, d: 1 }; }
  else return;
  this.hand?.dismiss();
  this.render({ slide: step });
 }

 goToday() {
  const now = todayWall(), was = this.anchor;
  this.anchor = { y: now.y, m: now.m, d: now.d };
  const gap = Core.dayNumber(this.anchor.y, this.anchor.m, this.anchor.d) - Core.dayNumber(was.y, was.m, was.d);
  this.render(gap ? { slide: Math.sign(gap) } : { morph: true });
  if (this.view === 'days' || this.view === 'week') this.scrollToNow(true);
 }

 // What the page shows now, from the anchor: its title, the range of days, and the body.
 range() {
  const a = this.anchor;
  if (this.view === 'day') return { from: a, days: 1 };
  if (this.view === 'days') return { from: a, days: 3 };
  if (this.view === 'week') return { from: mondayOf(a), days: 7 };
  if (this.view === 'month') { const first = { y: a.y, m: a.m, d: 1 }; return { from: mondayOf(first), days: 42 }; }
  return { from: todayWall(), days: 15 };
 }

 heading() {
  const a = this.anchor, today = todayWall();
  const isToday = Core.dayKey(a) === Core.dayKey(today);
  if (this.view === 'day') return isToday ? [t('cal.today'), fmt.long(a)] : [fmt.near(a, today), fmt.long(a)];
  if (this.view === 'days') { const end = Core.addDays(a, 2); return [a.m === end.m ? `${a.d} – ${fmt.dayMonth(end, 'long')}` : `${fmt.dayMonth(a)} – ${fmt.dayMonth(end)}`, String(end.y)]; }
  if (this.view === 'week') { const from = mondayOf(a), end = Core.addDays(from, 6); return [t('cal.view.week'), from.m === end.m ? `${from.d} – ${fmt.dayMonth(end, 'long')}` : `${fmt.dayMonth(from)} – ${fmt.dayMonth(end)}`]; }
  if (this.view === 'month') return [fmt.month(a).replace(/\s\d{4}$/, ''), String(a.y)];
  return [t('cal.view.tasks'), t('cal.tasks.sub')];
 }

 // Draws the view. `morph`: each entry moves from where it was to where it is now; `slide`: the days slide by.
 render({ morph = false, slide = 0, before = null } = {}) {
  if (!this.opened) return;
  const old = morph && !reduced() ? this.snapshot() : null;
  const keepScroll = this.body.querySelector('.cal-grid-scroll')?.scrollTop;
  const [title, sub] = this.heading();
  this.title.textContent = title;
  this.subtitle.textContent = sub;
  this.root.dataset.view = this.view;
  this.todayButton.disabled = this.view === 'tasks';
  this.prev.disabled = this.next.disabled = this.view === 'tasks';
  const fresh = el('div', `cal-view is-${this.view}`);
  if (this.view === 'day') this.drawDay(fresh);
  else if (this.view === 'days') this.drawGrid(fresh, 3);
  else if (this.view === 'week') this.drawWeek(fresh);
  else if (this.view === 'month') this.drawMonth(fresh);
  else this.drawTasks(fresh);
  const was = this.body.firstElementChild;
  const oldStrip = this.view === 'day' && was?.classList.contains('is-day') ? was.querySelector('.cal-strip') : null;
  this.body.replaceChildren(fresh);
  this.hand?.attach(fresh);
  const scroller = fresh.querySelector('.cal-grid-scroll');
  if (scroller) { if (keepScroll != null && !slide && was?.classList.contains(`is-${this.view}`)) scroller.scrollTop = keepScroll; else this.scrollToNow(false); }
  if (oldStrip) this.turnStrip(oldStrip, fresh.querySelector('.cal-strip'));
  if (slide && !reduced()) {
   // From one day to another the strip of days stays put: only what is under it slides.
   const moving = oldStrip ? [...fresh.children].filter(node => !node.classList.contains('cal-strip')) : [fresh];
   for (const node of moving) node.animate([{ transform: `translateX(${slide * 46}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: EASE });
   if (was) {
    const ghost = was.cloneNode(true);
    ghost.classList.add('cal-leaving');
    if (oldStrip) ghost.querySelector('.cal-strip')?.style.setProperty('visibility', 'hidden');
    this.body.append(ghost);
    ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-slide * 46}px)`, opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' }).finished.then(() => ghost.remove(), () => ghost.remove());
   }
  }
  if (old) this.morph(old, before);
  this.count();
 }

 // Where each entry is now, by its uid: for the next drawing to move it from there.
 snapshot() {
  const map = new Map();
  for (const node of this.body.querySelectorAll('[data-uid]')) { const rect = node.getBoundingClientRect(); if (rect.width) map.set(node.dataset.uid, rect); }
  return map;
 }

 morph(old, before) {
  const nodes = [...this.body.querySelectorAll('[data-uid]')];
  const added = before ? new Set(Store.items.filter(item => !before.items.some(one => one.id === item.id)).map(item => item.id)) : new Set();
  let k = 0;
  for (const node of nodes) {
   const rect = node.getBoundingClientRect(), from = old.get(node.dataset.uid);
   if (!rect.width) continue;
   if (from) {
    const dx = from.left - rect.left, dy = from.top - rect.top, sx = from.width / rect.width, sy = from.height / rect.height;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
    // A move the agent made goes by an arc, so the eye follows it; the user's own moves go straight.
    const arc = node.dataset.by === 'agent' && Math.hypot(dx, dy) > 60;
    const frames = arc
     ? [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: `translate(${dx / 2}px, ${dy / 2 - 34}px) scale(${(sx + 1) / 2}, ${(sy + 1) / 2})`, offset: 0.5 }, { transform: 'none' }]
     : [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: 'none' }];
    node.style.transformOrigin = '0 0';
    node.animate(frames, { duration: arc ? 760 : 540, easing: SPRING, delay: Math.min(k++ * 14, 220) });
   } else {
    node.animate([{ opacity: 0, transform: 'translateY(6px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE, delay: Math.min(k++ * 16, 260), fill: 'backwards' });
    const id = node.dataset.uid.split('|')[0];
    if (added.has(id) && node.dataset.by === 'agent') this.hand?.light(node);
   }
  }
 }

 scrollToNow(smooth) {
  const scroller = this.body.querySelector('.cal-grid-scroll');
  if (!scroller) return;
  const now = todayWall();
  const top = Math.max(0, (now.h - 1.5) * HOUR);
  scroller.scrollTo({ top: Math.min(top, 8 * HOUR + 400), behavior: smooth && !reduced() ? 'smooth' : 'auto' });
 }

 minute() {
  const today = todayWall();
  if (this.lastDay && this.lastDay !== Core.dayKey(today)) { if (this.opened) this.render(); this.count(); }
  this.lastDay = Core.dayKey(today);
  if (!this.opened) return;
  for (const line of this.body.querySelectorAll('.cal-now')) line.style.setProperty('--at', this.nowAt());
  for (const node of this.body.querySelectorAll('[data-start]')) {
   const start = +node.dataset.start, end = +node.dataset.end, now = Date.now();
   node.classList.toggle('is-live', node.dataset.kind !== 'task' && start <= now && end > now);
   const soon = node.querySelector('.cal-soon');
   if (soon) { const text = fmt.soon({ start, end, kind: node.dataset.kind }, now); soon.hidden = !text; soon.firstChild.textContent = text; }
  }
 }

 nowAt() { const w = todayWall(); return ((w.h * 60 + w.mi) / 60).toFixed(4); }

 // An entry as a line of a list: its ring (a task) or dot (an event), its title, and under it the time and the rest.
 row(time, { date = false, now = Date.now(), soon = false } = {}) {
  const row = el('div', `cal-row${time.done ? ' is-done' : ''}${time.feed ? ' is-feed' : ''}`);
  this.tagNode(row, time);
  row.append(this.mark_(time));
  const body = el('div', 'cal-row-body');
  const title = el('div', 'cal-row-title');
  title.append(el('span', 'cal-strike', time.title));
  body.append(title);
  const meta = el('div', 'cal-meta');
  if (time.repeat && time.kind === 'task') meta.append(this.icon('flame', 'cal-meta-icon'));
  if (date) meta.append(word(fmt.near(dayOf(time.day), todayWall())));
  if (!time.allDay) { const clock = word(fmt.span(time), 'cal-time'); if (time.kind === 'task' && !time.done && time.start < now) clock.classList.add('is-late'); meta.append(clock); }
  else if (time.kind === 'event') meta.append(word(t('cal.allDay'), 'cal-time'));
  if (soon && !time.done && !time.allDay) { const chip = el('span', 'cal-chip cal-soon'); chip.append(word(fmt.soon(time, now))); chip.hidden = !fmt.soon(time, now); meta.append(chip); }
  if (time.repeat && time.kind !== 'task') meta.append(this.icon('repeat', 'cal-meta-icon'));
  if (time.tag) meta.append(this.tagChip(time.tag));
  if (time.feed) { const chip = el('span', `cal-tag t-${time.feed.tone}`); chip.append(word(time.feed.name)); meta.append(chip); }
  if (time.item.place) { meta.append(this.icon('place', 'cal-meta-icon')); meta.append(word(time.item.place, 'cal-place')); }
  if (time.by === 'agent') { const by = el('span', 'cal-agent'); by.innerHTML = window.Glyphs?.ghost || ''; by.title = t('cal.byAgent'); meta.append(by); }
  if (meta.childNodes.length) body.append(meta);
  row.append(body);
  return row;
 }

 tagNode(node, time) {
  node.dataset.uid = time.uid;
  node.dataset.id = time.id;
  node.dataset.key = time.key;
  node.dataset.kind = time.kind;
  node.dataset.start = time.start;
  node.dataset.end = time.end;
  if (time.by) node.dataset.by = time.by;
  if (time.feed) node.dataset.feed = time.feed.id;
  if (time.kind !== 'task' && time.start <= Date.now() && time.end > Date.now() && !time.allDay) node.classList.add('is-live');
 }

 mark_(time) {
  if (time.kind === 'task') {
   const ring = el('button', `cal-ring${time.priority ? ` is-p${time.priority}` : ''}${time.done ? ' is-done' : ''}`);
   ring.type = 'button';
   ring.setAttribute('aria-label', time.done ? t('cal.undone') : t('cal.done'));
   ring.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="cal-ring-fill" cx="12" cy="12" r="10"/><path class="cal-ring-tick" d="M7.2 12.4l3.2 3.2 6.4-7" pathLength="1"/></svg>`;
   if (time.feed) ring.disabled = true;
   return ring;
  }
  const dot = el('span', 'cal-dot');
  if (time.tone) dot.classList.add(`t-${time.tone}`);
  return dot;
 }

 icon(name, cls) { const node = el('span', cls); node.innerHTML = ICONS[name]; return node; }
 tagChip(tag) { const chip = el('span', `cal-tag t-${tag.tone}`); chip.append(word(tag.name)); return chip; }

 // A day: the strip of days, the brief (today), what is overdue (today), the day's entries.
 drawDay(view) {
  const today = todayWall(), a = this.anchor, now = Date.now();
  const strip = el('div', 'cal-strip');
  const first = Core.addDays(a, -Math.min(3, Math.max(0, Core.dayNumber(a.y, a.m, a.d) - Core.dayNumber(today.y, today.m, today.d))));
  const busy = new Set(Store.times(startOf(first), startOf(Core.addDays(first, 14))).map(time => time.day));
  // The plate under the day shown: it slides to another day, as the figures over it turn.
  const plate = el('i', 'cal-day-plate');
  strip.append(plate);
  for (let k = 0; k < 14; k++) {
   const day = Core.addDays(first, k), key = Core.dayKey(day);
   const cell = el('button', `cal-day${key === Core.dayKey(today) ? ' is-today' : ''}${key === Core.dayKey(a) ? ' is-on' : ''}${[0, 6].includes(Core.weekday(day)) ? ' is-weekend' : ''}`);
   cell.type = 'button';
   cell.dataset.day = key;
   cell.dataset.n = String(day.d);
   cell.dataset.w = fmt.weekday(day);
   if (key === Core.dayKey(a)) strip.style.setProperty('--on', k);
   cell.append(word(cell.dataset.n, 'cal-day-n'), word(cell.dataset.w, 'cal-day-w'));
   if (busy.has(key)) cell.append(el('i', 'cal-day-dot'));
   cell.addEventListener('click', () => { const gap = Core.dayNumber(day.y, day.m, day.d) - Core.dayNumber(this.anchor.y, this.anchor.m, this.anchor.d); this.anchor = day; this.render(gap ? { slide: Math.sign(gap) } : {}); });
   strip.append(cell);
  }
  view.append(strip);
  const times = Store.times(startOf(a), startOf(Core.addDays(a, 1)) - 1);
  const isToday = Core.dayKey(a) === Core.dayKey(today);
  if (isToday) view.append(this.brief(times, now));
  const list = el('div', 'cal-list');
  if (isToday) {
   const late = Store.overdue(now);
   if (late.length) {
    const group = el('div', 'cal-group is-overdue');
    const head = el('div', 'cal-group-head');
    head.append(word(t('cal.overdue'), 'cal-group-name'), word(String(late.length), 'cal-group-count'));
    const carry = el('button', 'cal-link');
    carry.type = 'button';
    carry.append(word(t('cal.carry')));
    carry.addEventListener('click', () => this.hand?.carry(late));
    head.append(carry);
    group.append(head, ...late.map(time => this.row(time, { date: true, now })));
    list.append(group);
   }
  }
  const shown = times.filter(time => !(time.kind === 'event' && time.allDay && time.end <= startOf(a)));
  if (!shown.length) list.append(this.empty(isToday ? t('cal.empty.today') : t('cal.empty.day')));
  for (const time of shown) list.append(this.row(time, { now, soon: isToday }));
  view.append(list);
 }

 // The strip drawn again over the one that was: where a day's figures or name differ they turn over (forward up, back
 // down), the plate slides from the day it was under to the day it is under now.
 turnStrip(old, strip) {
  if (!strip || reduced()) return;
  const was = [...old.querySelectorAll('.cal-day')], now = [...strip.querySelectorAll('.cal-day')];
  const num = key => { const d = Core.parseDay(key); return d ? Core.dayNumber(d.y, d.m, d.d) : 0; };
  const shift = num(now[0]?.dataset.day) - num(was[0]?.dataset.day);
  if (shift) now.forEach((cell, k) => {
   const before = was[k];
   if (!before) return;
   roll(cell.querySelector('.cal-day-n'), before.dataset.n, cell.dataset.n, shift);
   roll(cell.querySelector('.cal-day-w'), before.dataset.w, cell.dataset.w, shift, false);
  });
  const from = Number(old.style.getPropertyValue('--on')), to = Number(strip.style.getPropertyValue('--on'));
  const plate = strip.querySelector('.cal-day-plate'), step = 58;
  if (plate && Number.isFinite(from) && from !== to) plate.animate([{ transform: `translateX(${from * step}px)` }, { transform: `translateX(${to * step}px)` }], { duration: 460, easing: SPRING });
 }

 // «Добрый день, у вас 2 события, 1 привычка и 2 важных», worked out here, not by a model.
 brief(times, now) {
  const box = el('div', 'cal-brief');
  const hour = todayWall().h;
  const greet = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'day' : 'evening';
  const events = times.filter(time => time.kind === 'event' && !time.allDay && time.end > now).length;
  const habits = times.filter(time => time.kind === 'task' && time.repeat && !time.done).length;
  const important = times.filter(time => time.priority >= 2 && !time.done).length;
  const tasks = times.filter(time => time.kind === 'task' && !time.repeat && !time.done).length;
  box.append(word(t(`cal.brief.${greet}`)));
  const badge = (n, key, cls, glyph) => { const chip = el('span', `cal-badge ${cls}`); chip.innerHTML = ICONS[glyph]; chip.append(word(t(key, { n }))); return chip; };
  const parts = [];
  if (events) parts.push(badge(events, 'cal.brief.events', 't-pink', 'day'));
  if (tasks) parts.push(badge(tasks, 'cal.brief.tasks', 'is-grey', 'tick'));
  if (habits) parts.push(badge(habits, 'cal.brief.habits', 'is-grey', 'flame'));
  if (important) parts.push(badge(important, 'cal.brief.important', 't-yellow', 'alert'));
  if (!parts.length) { box.append(word(t('cal.brief.free'))); return box; }
  parts.forEach((part, k) => { if (k && k === parts.length - 1) box.append(word(t('cal.brief.and'))); box.append(part); });
  return box;
 }

 empty(text) { const node = el('div', 'cal-empty'); node.append(word(text)); return node; }

 // Days on a scale of hours: a column a day, entries as blocks; a lane for whole days on top; the tasks with no day
 // beside, to be put on the scale by hand.
 drawGrid(view, count) {
  const from = this.anchor, now = Date.now(), today = Core.dayKey(todayWall());
  const times = Store.times(startOf(from), startOf(Core.addDays(from, count)) - 1);
  const grid = el('div', 'cal-grid');
  grid.style.setProperty('--days', count);
  const heads = el('div', 'cal-grid-heads');
  heads.append(el('div', 'cal-gutter'));
  const lanes = el('div', 'cal-lanes');
  lanes.append(el('div', 'cal-gutter'));
  for (let k = 0; k < count; k++) {
   const day = Core.addDays(from, k), key = Core.dayKey(day);
   const head = el('div', `cal-col-head${key === today ? ' is-today' : ''}`);
   head.append(word(key === today ? t('cal.today') : fmt.weekday(day), 'cal-col-name'), word(fmt.dayMonth(day), 'cal-col-date'), this.load(times.filter(time => time.day === key)));
   heads.append(head);
   const lane = el('div', 'cal-lane');
   lane.dataset.day = key;
   for (const time of times.filter(time => time.allDay && time.day <= key && time.end > startOf(day))) lane.append(this.chip(time));
   lanes.append(lane);
  }
  const scroller = el('div', 'cal-grid-scroll');
  const canvas = el('div', 'cal-canvas');
  const hours = el('div', 'cal-hours');
  for (let h = 1; h < 24; h++) { const label = el('div', 'cal-hour'); label.style.setProperty('--at', h); label.append(word(`${h}:00`)); hours.append(label); }
  canvas.append(hours);
  for (let k = 0; k < count; k++) {
   const day = Core.addDays(from, k), key = Core.dayKey(day);
   const col = el('div', `cal-col${key === today ? ' is-today' : ''}`);
   col.dataset.day = key;
   const dayStart = startOf(day);
   const mine = times.filter(time => !time.allDay && time.start < dayStart + Core.DAY && time.end >= dayStart && (time.end > dayStart || time.start >= dayStart));
   for (const { time, lane, lanes: of } of this.layout(mine, dayStart)) {
    const block = this.block(time, dayStart);
    block.style.setProperty('--lane', lane);
    block.style.setProperty('--lanes', of);
    col.append(block);
   }
   if (key === today) { const line = el('div', 'cal-now'); line.style.setProperty('--at', this.nowAt()); line.append(word(fmt.clock(now))); col.append(line); }
   canvas.append(col);
  }
  scroller.append(canvas);
  grid.append(heads, lanes, scroller);
  const wait = Store.undated().filter(item => !item.done);
  if (wait.length) {
   const tray = el('aside', 'cal-tray');
   const head = el('div', 'cal-tray-head');
   head.innerHTML = ICONS.inbox;
   head.append(word(t('cal.undated')), word(String(wait.length), 'cal-group-count'));
   tray.append(head);
   for (const item of wait) { const card = this.trayCard(item); tray.append(card); }
   view.append(grid, tray);
   view.classList.add('has-tray');
  } else view.append(grid);
 }

 trayCard(item) {
  const time = Store.time(item, { key: 'undated', start: 0, end: 0, allDay: true, day: '' }, null);
  const card = el('div', 'cal-tray-card');
  this.tagNode(card, time);
  card.append(this.mark_(time), el('span', 'cal-tray-title', item.title));
  return card;
 }

 // How full a day is, as a small ring: hours taken out of the waking day.
 load(times) {
  const ring = el('span', 'cal-load');
  const minutes = times.filter(time => !time.allDay).reduce((sum, time) => sum + Math.max(15, (time.end - time.start) / 60000), 0);
  const share = Math.min(1, minutes / (10 * 60));
  ring.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle class="cal-load-track" cx="8" cy="8" r="6"/>${share > 0 ? `<circle class="cal-load-arc" cx="8" cy="8" r="6" pathLength="1" stroke-dasharray="${share.toFixed(3)} 1" transform="rotate(-90 8 8)"/>` : ''}</svg>`;
  return ring;
 }

 // Entries at the same time stand side by side: each gets a lane among those it meets.
 layout(times, dayStart) {
  const items = times.map(time => ({ time, a: Math.max(time.start, dayStart), b: Math.max(Math.min(time.end, dayStart + Core.DAY), Math.max(time.start, dayStart) + 30 * 60000) })).sort((x, y) => x.a - y.a || y.b - x.b);
  const out = [];
  let cluster = [], end = -Infinity;
  const flush = () => { const lanes = []; for (const one of cluster) { let lane = lanes.findIndex(last => last <= one.a); if (lane < 0) { lane = lanes.length; lanes.push(0); } lanes[lane] = one.b; one.lane = lane; } for (const one of cluster) out.push({ time: one.time, lane: one.lane, lanes: lanes.length }); cluster = []; };
  for (const one of items) { if (one.a >= end && cluster.length) flush(); cluster.push(one); end = Math.max(end, one.b); }
  if (cluster.length) flush();
  return out;
 }

 block(time, dayStart) {
  const block = el('div', `cal-block${time.kind === 'task' ? ' is-task' : ''}${time.done ? ' is-done' : ''}${time.feed ? ' is-feed' : ''}`);
  if (time.tone) block.classList.add(`t-${time.tone}`);
  this.tagNode(block, time);
  const top = (Math.max(time.start, dayStart) - dayStart) / Core.HOUR, length = Math.max(time.kind === 'task' ? 0.5 : 0.4, (Math.min(time.end, dayStart + Core.DAY) - Math.max(time.start, dayStart)) / Core.HOUR);
  block.style.setProperty('--at', top.toFixed(4));
  block.style.setProperty('--len', length.toFixed(4));
  if (length < 0.75) block.classList.add('is-short');
  block.append(this.mark_(time));
  const body = el('div', 'cal-block-body');
  body.append(el('div', 'cal-block-title', time.title));
  const meta = el('div', 'cal-block-time');
  meta.append(word(fmt.span(time)));
  if (time.repeat) meta.append(this.icon('repeat', 'cal-meta-icon'));
  if (time.by === 'agent') { const by = el('span', 'cal-agent'); by.innerHTML = window.Glyphs?.ghost || ''; meta.append(by); }
  body.append(meta);
  block.append(body);
  if (!time.feed && time.kind === 'event') block.append(el('span', 'cal-grip'));
  return block;
 }

 // An entry as a small chip (a lane of whole days, a day of the month).
 chip(time) {
  const chip = el('div', `cal-chipline${time.kind === 'task' ? ' is-task' : ''}${time.done ? ' is-done' : ''}${time.feed ? ' is-feed' : ''}`);
  if (time.tone) chip.classList.add(`t-${time.tone}`);
  this.tagNode(chip, time);
  chip.append(this.mark_(time));
  if (!time.allDay) chip.append(word(fmt.clock(time.start), 'cal-chip-time'));
  chip.append(el('span', 'cal-chip-title', time.title));
  return chip;
 }

 // A week: a column of cards a day, from Monday.
 drawWeek(view) {
  const from = mondayOf(this.anchor), now = Date.now(), today = Core.dayKey(todayWall());
  const times = Store.times(startOf(from), startOf(Core.addDays(from, 7)) - 1);
  const week = el('div', 'cal-week');
  for (let k = 0; k < 7; k++) {
   const day = Core.addDays(from, k), key = Core.dayKey(day);
   const col = el('div', `cal-wcol${key === today ? ' is-today' : ''}${key < today ? ' is-past' : ''}`);
   col.dataset.day = key;
   const head = el('div', 'cal-col-head');
   const mine = times.filter(time => time.day === key || (time.allDay && time.day < key && time.end > startOf(day)));
   head.append(word(fmt.weekday(day), 'cal-col-name'), word(fmt.dayMonth(day), 'cal-col-date'), this.load(mine));
   col.append(head);
   const cards = el('div', 'cal-cards');
   for (const time of mine) { const card = this.row(time, { now }); card.classList.add('cal-card'); cards.append(card); }
   col.append(cards);
   week.append(col);
  }
  view.append(week);
 }

 // A month: six weeks from the Monday before its first day.
 drawMonth(view) {
  const a = this.anchor, first = mondayOf({ y: a.y, m: a.m, d: 1 }), today = Core.dayKey(todayWall());
  const times = Store.times(startOf(first), startOf(Core.addDays(first, 42)) - 1);
  const names = el('div', 'cal-month-names');
  for (let k = 0; k < 7; k++) names.append(word(fmt.weekday(Core.addDays(first, k)), 'cal-month-name'));
  const grid = el('div', 'cal-month');
  for (let k = 0; k < 42; k++) {
   const day = Core.addDays(first, k), key = Core.dayKey(day);
   const cell = el('div', `cal-mcell${day.m !== a.m ? ' is-out' : ''}${key === today ? ' is-today' : ''}${[0, 6].includes(Core.weekday(day)) ? ' is-weekend' : ''}`);
   cell.dataset.day = key;
   const number = el('button', 'cal-mday');
   number.type = 'button';
   number.append(word(String(day.d)));
   number.addEventListener('click', () => this.setView('day', { anchor: day }));
   cell.append(number);
   const mine = times.filter(time => time.day === key || (time.allDay && time.day < key && time.end > startOf(day)));
   mine.slice(0, 3).forEach(time => cell.append(this.chip(time)));
   if (mine.length > 3) { const more = el('button', 'cal-more'); more.type = 'button'; more.append(word(t('cal.more', { n: mine.length - 3 }))); more.addEventListener('click', () => this.setView('day', { anchor: day })); cell.append(more); }
   grid.append(cell);
  }
  view.append(names, grid);
 }

 // Tasks by when they are due: with no day, overdue, today, tomorrow, each day of two weeks, later.
 drawTasks(view) {
  const today = todayWall(), now = Date.now(), end = Core.addDays(today, 15);
  const own = Store.times(startOf(today), startOf(end) - 1).filter(time => time.kind === 'task');
  const later = Store.items.filter(item => item.kind === 'task' && item.date && !item.rule && !item.done && item.date >= Core.dayKey(end));
  const groups = [];
  const undated = Store.undated();
  groups.push({ name: t('cal.undated'), cls: 'is-inbox', times: undated.map(item => Store.time(item, { key: 'undated', start: 0, end: 0, allDay: true, day: '' }, null)), drop: 'undated' });
  const late = Store.overdue(now);
  if (late.length) groups.push({ name: t('cal.overdue'), cls: 'is-overdue', times: late, carry: true });
  for (let k = 0; k < 15; k++) {
   const day = Core.addDays(today, k), key = Core.dayKey(day);
   const mine = own.filter(time => time.day === key);
   if (!mine.length && k > 1) continue;
   groups.push({ name: k === 0 ? t('cal.today') : k === 1 ? t('cal.tomorrow') : `${fmt.weekday(day)}, ${fmt.dayMonth(day)}`, sub: k > 1 ? '' : fmt.dayMonth(day), times: mine, drop: key });
  }
  if (later.length) groups.push({ name: t('cal.later'), times: later.map(item => Store.time(item, Core.occurrences(item, 0, 8.64e15, { limit: 1 })[0], null)), date: true });
  const list = el('div', 'cal-tasks');
  for (const group of groups) {
   const section = el('section', `cal-tgroup ${group.cls || ''}`);
   if (group.drop) section.dataset.drop = group.drop;
   const side = el('div', 'cal-tgroup-side');
   side.append(word(group.name, 'cal-group-name'), word(t('cal.count', { n: group.times.filter(time => !time.done).length }), 'cal-group-count'));
   if (group.carry) { const carry = el('button', 'cal-link'); carry.type = 'button'; carry.append(word(t('cal.carry'))); carry.addEventListener('click', () => this.hand?.carry(group.times)); side.append(carry); }
   const rows = el('div', 'cal-tgroup-rows');
   const open = group.times.filter(time => !time.done), done = group.times.filter(time => time.done);
   for (const time of [...open, ...done]) rows.append(this.row(time, { date: group.cls === 'is-overdue' || group.date, now }));
   if (!group.times.length) rows.append(this.empty(group.drop === 'undated' ? t('cal.empty.undated') : t('cal.empty.tasks')));
   section.append(side, rows);
   list.append(section);
  }
  view.append(list);
 }

 key(event) {
  if (!this.opened || event.defaultPrevented) return;
  if (this.hand?.key(event)) return;
  const typing = event.target.closest?.('input, textarea, [contenteditable="true"]');
  if (typing || event.altKey) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); Store.takeBack(); return; }
  if (event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); this.go(-1); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); this.go(1); }
  else if (/^[1-5]$/.test(event.key)) { event.preventDefault(); this.setView(VIEWS[+event.key - 1]); }
  else if (event.key.toLowerCase() === 't' || event.key.toLowerCase() === 'е') { event.preventDefault(); this.goToday(); }
  else if (event.key === 'Escape') { event.preventDefault(); this.close(); }
  // Any letter starts a new entry, with that letter in the field.
  else if (event.key.length === 1 && /\S/.test(event.key)) { event.preventDefault(); this.hand?.quick({ anchor: this.addButton, text: event.key }); }
 }
}

window.CalendarPage = CalendarPage;
window.CalendarUI = { fmt, ICONS, el, word, todayWall, startOf, dayOf, mondayOf, HOUR, EASE, SPRING, reduced, t };
})();
