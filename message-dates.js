(() => {
'use strict';

// Store instants, display local calendar dates. An old message without a saved instant stays undated.
const formats = new Map(), watched = new WeakMap();
const valid = at => typeof at === 'number' && Number.isFinite(at) && !Number.isNaN(new Date(at).getTime());

function info(at, { locale = window.I18n?.lang || 'en', timeZone } = {}) {
 if (!valid(at)) return null;
 const key = `${locale}|${timeZone || ''}`;
 let f = formats.get(key);
 if (!f) {
  const zone = timeZone ? { timeZone } : {}, displayLocale = locale === 'en' ? 'en-GB' : locale;
  f = {
   key: new Intl.DateTimeFormat('en', { ...zone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }),
   day: new Intl.DateTimeFormat(displayLocale, { ...zone, day: 'numeric', month: 'long' }),
   clock: new Intl.DateTimeFormat(displayLocale, { ...zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
   full: new Intl.DateTimeFormat(displayLocale, { ...zone, year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }),
  };
  formats.set(key, f);
 }
 const date = new Date(at), parts = Object.fromEntries(f.key.formatToParts(date).map(p => [p.type, p.value]));
 const day = f.day.format(date), clock = f.clock.format(date);
 return { at, key: `${parts.year}-${parts.month}-${parts.day}`, day, clock, text: clock, title: f.full.format(date), iso: date.toISOString() };
}

// The first known date and every local day change get a marker. Technical/legacy entries supply no guessed date.
function boundaries(entries, options) {
 const out = [];
 let previous = '';
 entries.forEach((entry, index) => {
  const date = info(typeof entry === 'number' ? entry : entry?.at, options);
  if (!date) return;
  if (date.key !== previous) out.push({ index, ...date });
  previous = date.key;
 });
 return out;
}

function time(at) {
 const date = info(at);
 if (!date) return null;
 const el = document.createElement('time');
 el.className = 'message-time';
 el.dateTime = date.iso;
 el.textContent = date.text;
 el.title = date.title;
 el.setAttribute('aria-label', date.title);
 return el;
}

function mark(el, at) {
 if (!valid(at)) return;
 el.dataset.messageAt = String(at);
 const list = el.closest('.thread-list');
 if (list) schedule(list);
}

function sync(list) {
 if (!list) return;
 const markers = [...list.children].filter(el => el.classList.contains('thread-day'));
 const rows = [...list.children].filter(el => !el.classList.contains('thread-day'));
 const old = new Map(markers.map(el => [el.__before, el])), unused = new Set(markers);
 const dates = boundaries(rows.map(el => ({ at: !el.hidden && el.hasAttribute('data-message-at') ? Number(el.dataset.messageAt) : null })));
 for (const date of dates) {
  const before = rows[date.index];
  let marker = old.get(before);
  if (!marker) {
   marker = document.createElement('div');
   marker.className = 'thread-day';
   marker.setAttribute('role', 'separator');
   marker.append(document.createElement('time'));
  }
  marker.__before = before;
  marker.dataset.day = date.key;
  marker.setAttribute('aria-label', date.day);
  const label = marker.firstElementChild;
  label.dateTime = date.key;
  label.title = date.title;
  if (label.textContent !== date.day) label.textContent = date.day;
  if (marker.nextElementSibling !== before) list.insertBefore(marker, before);
  unused.delete(marker);
 }
 for (const marker of unused) marker.remove();
}

function schedule(list) {
 const state = watched.get(list);
 if (!state || state.pending) return;
 state.pending = true;
 queueMicrotask(() => { state.pending = false; sync(list); });
}

function watch(list) {
 if (watched.has(list)) return;
 const observer = new MutationObserver(records => {
  // Our own marker inserts/removals do not schedule another pass; streaming text is not watched.
  if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && !node.classList.contains('thread-day')))) schedule(list);
 });
 watched.set(list, { observer, pending: false });
 observer.observe(list, { childList: true });
 sync(list);
}

window.MessageDates = { valid, info, boundaries, time, mark, sync, watch, now: () => Date.now() };
})();
