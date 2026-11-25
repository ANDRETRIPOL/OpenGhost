(() => {
'use strict';

// Live blocks in the agent's replies: small black cards in the style of the system's live activities (weather you run
// through the day, cars whose totals follow the days, a timer that rings). The agent sends only a kind and its data;
// the card is drawn here from shared parts, so every kind speaks one language and nothing the model writes runs as code.
// What can be worked out from the data (days × price, servings, a payment, a time in another city) answers at once,
// without the agent; a button that needs new data says so to the agent; a link opens in the built-in browser.
// Blocks add to the drawings (diagram.js), they do not replace them: a drawing explains, a block is live data and
// things to do with it.
//
// <og-block kind="…" data-json="…"> builds itself once it is on the page (a saved chat is drawn before it is put on the
// page, and a card needs its width), ticks only while it is on the page, and unfolds when it is new.

const MOTION = { unfold: 640, rows: 70, count: 520, bar: 620, ease: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const SOUND = 'sounds/reply.mp3';
const PREFIX = new Set(['€', '$', '£', '¥', '₹', '₺', '₴']);

const WORDS = {
 ru: {
  pause: 'Пауза', resume: 'Дальше', reset: 'Сбросить', plusMinute: '+1 мин', done: 'Готово', ringsAt: 'сигнал в {time}', rang: 'время вышло в {time}',
  start: 'Старт', stop: 'Стоп', lap: 'Круг', laps: 'Круги', best: 'лучший', worst: 'худший',
  days: 'дн', hours: 'ч', minutes: 'мин', seconds: 'сек', passed: 'прошло', left: 'осталось',
  shift: 'Сдвинуть время', now: 'сейчас', later: 'через {n} ч', earlier: '{n} ч назад',
  people: 'Человек', tip: 'Чаевые', perPerson: 'с каждого', total: 'итого', tipOf: 'чаевые {sum}',
  over: 'выше бюджета', leftOf: 'Остаётся {left} из {budget}', overBy: 'Дороже бюджета на {sum}', budget: 'бюджет {sum}', perUnit: '{sum} за {unit}',
  low: 'минимум', high: 'максимум', usual: 'обычно', cheaper: 'Сейчас дешевле обычного на {p}%', dearer: 'Сейчас дороже обычного на {p}%', same: 'Сейчас обычная цена',
  each: 'на человека', amount: 'Сумма', term: 'Срок', rate: 'Ставка', years: 'лет', monthly: 'в месяц', overpay: 'переплата {sum}', body: 'долг', interest: 'проценты',
  month: 'Месяц', year: 'Год', perMonth: '{sum} в месяц', save: 'выгода {p}%', chosen: 'Выбрано',
  oneWay: 'В одну сторону', roundTrip: 'Туда и обратно', depart: 'Выезд', arrive: 'приезд {time}', fuel: 'бензин ≈ {sum}', fuelL: 'бензин ≈ {l} л',
  inAir: 'в пути', landed: 'приземлился', boarding: 'посадка', gate: 'выход', terminal: 'терминал', theirTime: 'по местному времени',
  copy: 'Скопировать номер', copied: 'Скопировано', eta: 'ожидается {when}', history: 'История',
  inMin: 'через {n} мин', km: 'км', nowGo: 'отправляется', next: 'дальше',
  servings: 'Порций', kcal: 'ккал', protein: 'белки', fat: 'жиры', carbs: 'углеводы', eaten: 'съедено {n} из {goal}',
  sets: '{done} из {all} подходов', rest: 'отдых {s} с',
  normal: 'норма {lo}–{hi}', notAdvice: 'Не инвестиционный совет', windKmh: 'ветер {v} км/ч',
  share: '{p}% трат', spent: 'потрачено {sum}', budgetLeft: 'осталось {sum}', budgetOver: 'перерасход {sum}',
  of: '{n} из {all}', retry: 'Починить', running: 'идёт', passedStep: 'готово', failed: 'упало', waiting: 'ждёт',
  choose: 'Выбрать', votes: '{n} голосов',
 },
 en: {
  pause: 'Pause', resume: 'Resume', reset: 'Reset', plusMinute: '+1 min', done: 'Done', ringsAt: 'rings at {time}', rang: 'time was up at {time}',
  start: 'Start', stop: 'Stop', lap: 'Lap', laps: 'Laps', best: 'best', worst: 'worst',
  days: 'd', hours: 'h', minutes: 'min', seconds: 'sec', passed: 'passed', left: 'left',
  shift: 'Shift the time', now: 'now', later: 'in {n} h', earlier: '{n} h ago',
  people: 'People', tip: 'Tip', perPerson: 'each', total: 'total', tipOf: 'tip {sum}',
  over: 'over budget', leftOf: '{left} left of {budget}', overBy: 'Over budget by {sum}', budget: 'budget {sum}', perUnit: '{sum} per {unit}',
  low: 'lowest', high: 'highest', usual: 'usual', cheaper: 'Now {p}% below usual', dearer: 'Now {p}% above usual', same: 'Now the usual price',
  each: 'per person', amount: 'Amount', term: 'Term', rate: 'Rate', years: 'yrs', monthly: 'a month', overpay: 'interest {sum}', body: 'loan', interest: 'interest',
  month: 'Month', year: 'Year', perMonth: '{sum} a month', save: 'save {p}%', chosen: 'Chosen',
  oneWay: 'One way', roundTrip: 'Round trip', depart: 'Leave', arrive: 'arrive {time}', fuel: 'fuel ≈ {sum}', fuelL: 'fuel ≈ {l} L',
  inAir: 'in the air', landed: 'landed', boarding: 'boarding', gate: 'gate', terminal: 'terminal', theirTime: 'local time',
  copy: 'Copy number', copied: 'Copied', eta: 'expected {when}', history: 'History',
  inMin: 'in {n} min', km: 'km', nowGo: 'leaving', next: 'next',
  servings: 'Servings', kcal: 'kcal', protein: 'protein', fat: 'fat', carbs: 'carbs', eaten: '{n} of {goal} eaten',
  sets: '{done} of {all} sets', rest: 'rest {s} s',
  normal: 'normal {lo}–{hi}', notAdvice: 'Not investment advice', windKmh: 'wind {v} km/h',
  share: '{p}% of spending', spent: 'spent {sum}', budgetLeft: '{sum} left', budgetOver: '{sum} over',
  of: '{n} of {all}', retry: 'Fix it', running: 'running', passedStep: 'passed', failed: 'failed', waiting: 'waiting',
  choose: 'Choose', votes: '{n} votes',
 },
 it: {
  pause: 'Pausa', resume: 'Riprendi', reset: 'Azzera', plusMinute: '+1 min', done: 'Fatto', ringsAt: 'suona alle {time}', rang: 'tempo scaduto alle {time}',
  start: 'Avvia', stop: 'Ferma', lap: 'Giro', laps: 'Giri', best: 'migliore', worst: 'peggiore',
  days: 'g', hours: 'h', minutes: 'min', seconds: 'sec', passed: 'passati', left: 'mancano',
  shift: 'Sposta l’ora', now: 'adesso', later: 'tra {n} h', earlier: '{n} h fa',
  people: 'Persone', tip: 'Mancia', perPerson: 'a testa', total: 'totale', tipOf: 'mancia {sum}',
  over: 'oltre il budget', leftOf: 'Restano {left} su {budget}', overBy: 'Oltre il budget di {sum}', budget: 'budget {sum}', perUnit: '{sum} per {unit}',
  low: 'minimo', high: 'massimo', usual: 'di solito', cheaper: 'Ora il {p}% sotto il solito', dearer: 'Ora il {p}% sopra il solito', same: 'Ora il prezzo di sempre',
  each: 'a persona', amount: 'Importo', term: 'Durata', rate: 'Tasso', years: 'anni', monthly: 'al mese', overpay: 'interessi {sum}', body: 'capitale', interest: 'interessi',
  month: 'Mese', year: 'Anno', perMonth: '{sum} al mese', save: 'risparmi il {p}%', chosen: 'Scelto',
  oneWay: 'Solo andata', roundTrip: 'Andata e ritorno', depart: 'Partenza', arrive: 'arrivo {time}', fuel: 'carburante ≈ {sum}', fuelL: 'carburante ≈ {l} l',
  inAir: 'in volo', landed: 'atterrato', boarding: 'imbarco', gate: 'gate', terminal: 'terminal', theirTime: 'ora locale',
  copy: 'Copia il numero', copied: 'Copiato', eta: 'previsto {when}', history: 'Storico',
  inMin: 'tra {n} min', km: 'km', nowGo: 'in partenza', next: 'dopo',
  servings: 'Porzioni', kcal: 'kcal', protein: 'proteine', fat: 'grassi', carbs: 'carboidrati', eaten: '{n} di {goal} mangiate',
  sets: '{done} di {all} serie', rest: 'recupero {s} s',
  normal: 'normale {lo}–{hi}', notAdvice: 'Non è un consiglio d’investimento', windKmh: 'vento {v} km/h',
  share: '{p}% della spesa', spent: 'spesi {sum}', budgetLeft: 'restano {sum}', budgetOver: '{sum} oltre',
  of: '{n} di {all}', retry: 'Correggi', running: 'in corso', passedStep: 'superato', failed: 'fallito', waiting: 'in attesa',
  choose: 'Scegli', votes: '{n} voti',
 },
 fr: {
  pause: 'Pause', resume: 'Reprendre', reset: 'Remettre à zéro', plusMinute: '+1 min', done: 'Terminé', ringsAt: 'sonne à {time}', rang: 'temps écoulé à {time}',
  start: 'Démarrer', stop: 'Arrêter', lap: 'Tour', laps: 'Tours', best: 'meilleur', worst: 'pire',
  days: 'j', hours: 'h', minutes: 'min', seconds: 's', passed: 'écoulé', left: 'restant',
  shift: 'Décaler l’heure', now: 'maintenant', later: 'dans {n} h', earlier: 'il y a {n} h',
  people: 'Personnes', tip: 'Pourboire', perPerson: 'chacun', total: 'total', tipOf: 'pourboire {sum}',
  over: 'au-dessus du budget', leftOf: 'Il reste {left} sur {budget}', overBy: 'Au-dessus du budget de {sum}', budget: 'budget {sum}', perUnit: '{sum} par {unit}',
  low: 'minimum', high: 'maximum', usual: 'habituel', cheaper: '{p} % sous le prix habituel', dearer: '{p} % au-dessus du prix habituel', same: 'Le prix habituel',
  each: 'par personne', amount: 'Montant', term: 'Durée', rate: 'Taux', years: 'ans', monthly: 'par mois', overpay: 'intérêts {sum}', body: 'capital', interest: 'intérêts',
  month: 'Mois', year: 'Année', perMonth: '{sum} par mois', save: '{p} % d’économie', chosen: 'Choisi',
  oneWay: 'Aller simple', roundTrip: 'Aller-retour', depart: 'Départ', arrive: 'arrivée {time}', fuel: 'carburant ≈ {sum}', fuelL: 'carburant ≈ {l} l',
  inAir: 'en vol', landed: 'atterri', boarding: 'embarquement', gate: 'porte', terminal: 'terminal', theirTime: 'heure locale',
  copy: 'Copier le numéro', copied: 'Copié', eta: 'prévu {when}', history: 'Historique',
  inMin: 'dans {n} min', km: 'km', nowGo: 'au départ', next: 'ensuite',
  servings: 'Portions', kcal: 'kcal', protein: 'protéines', fat: 'lipides', carbs: 'glucides', eaten: '{n} sur {goal} mangées',
  sets: '{done} séries sur {all}', rest: 'repos {s} s',
  normal: 'normal {lo}–{hi}', notAdvice: 'Pas un conseil d’investissement', windKmh: 'vent {v} km/h',
  share: '{p} % des dépenses', spent: 'dépensé {sum}', budgetLeft: 'il reste {sum}', budgetOver: '{sum} de trop',
  of: '{n} sur {all}', retry: 'Corriger', running: 'en cours', passedStep: 'réussi', failed: 'échoué', waiting: 'en attente',
  choose: 'Choisir', votes: '{n} votes',
 },
};
// The ends of timers and rests, kept by the app and not by their cards: one plain wait to each end (a page that is
// away still keeps a single wait to its second, where a ticking card would be held back), so a timer rings with its
// chat closed or the window put away. A ring is told to the window (block-ring); whoever shows chats tells the user,
// and when nobody takes it up the sound is played here.
const Alarms = {
 waits: new Map(),
 set(id, at, info = {}) {
  const old = this.waits.get(id);
  if (old) clearTimeout(old.wait);
  this.waits.delete(id);
  if (!at || at <= Date.now()) return;
  const entry = { at, info: { ...(old?.info || {}), ...info }, wait: setTimeout(() => this.ring(id), at - Date.now()) };
  this.waits.set(id, entry);
 },
 // The chat a timer belongs to, told by the chat when the card is on its page.
 own(id, chat) { const entry = this.waits.get(id); if (entry) entry.info.chat = chat; },
 ring(id) {
  const entry = this.waits.get(id);
  this.waits.delete(id);
  const detail = { id, ...(entry?.info || {}), handled: false };
  window.dispatchEvent(new CustomEvent('block-ring', { detail }));
  if (!detail.handled) { try { const a = new Audio(SOUND); a.volume = 0.9; a.play().catch(() => {}); } catch {} }
 },
};

// The blocks of a message: ```widget fences, each holding one JSON object with its kind. A fence still being written
// is not one yet.
const FENCE = /(^|\n)([ \t]*)```widget[^\n]*\n([\s\S]*?)\n[ \t]*```/g;
// A widget's JSON as a model writes it: read as it is, and else once more with the slips models make mended (a quote
// left after a number, a comma before a closing bracket). What still cannot be read gives null.
function parse(text) {
 try { return JSON.parse(text); } catch {}
 const mended = String(text || '').replace(/(\d)"(?=\s*[,}\]])/g, '$1').replace(/,(\s*[}\]])/g, '$1');
 try { return JSON.parse(mended); } catch { return null; }
}
function scan(content) {
 const out = [];
 for (const m of String(content || '').matchAll(FENCE)) {
  const data = parse(m[3]);
  out.push({ n: out.length, kind: data?.kind || '', data });
 }
 return out;
}
// The message with the nth block's data put in place of what it had.
function rewrite(content, n, data) {
 let k = -1;
 const fence = '```';
 return String(content || '').replace(FENCE, (all, lead, indent) => (++k === n ? `${lead}${indent}${fence}widget\n${JSON.stringify(data)}\n${indent}${fence}` : all));
}
const known = kind => Object.hasOwn(KINDS, kind);
// A widget written by mistake as a drawing: a mermaid block that opens with a widget's kind and holds only its fields,
// one "name value" a line, a name alone opening the fields indented under it. A drawing always has a "|" in its lines,
// so none of them is read as a widget. Returns the widget's data, or null.
function fromFields(body) {
 const lines = String(body || '').split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('%%'));
 const kind = lines.shift()?.trim();
 if (!known(kind) || lines.length < 2 || lines.some(line => line.includes('|'))) return null;
 const data = { kind }, stack = [{ depth: -1, at: data }];
 for (const line of lines) {
  const m = /^(\s*)([A-Za-z][\w]*)(?:\s+(.+))?$/.exec(line.replace(/\s+$/, ''));
  if (!m) return null;
  const depth = m[1].length;
  while (stack.length > 1 && stack.at(-1).depth >= depth) stack.pop();
  // A name that comes again under a name alone begins the next item of a list (the phases of a pitch, each with its
  // own name and words), instead of writing over the first one.
  const frame = stack.at(-1);
  if (frame.holder && Object.hasOwn(frame.at, m[2])) {
   const list = Array.isArray(frame.holder[frame.key]) ? frame.holder[frame.key] : (frame.holder[frame.key] = [frame.at]);
   frame.at = {};
   list.push(frame.at);
  }
  const at = frame.at;
  if (m[3] === undefined) { at[m[2]] = {}; stack.push({ depth, at: at[m[2]], holder: at, key: m[2] }); continue; }
  let value = m[3].trim();
  try { value = JSON.parse(value); } catch {}
  at[m[2]] = value;
 }
 return data;
}

// What a widget holds that must outlive it (a timer's start) is written into its message. A reply still being
// written is put together anew from its stream with every word, so the change is also kept aside and laid on the
// message again whenever the messages are saved.
const pending = new WeakMap();
// The fence of the nth widget drawn in a message: fences that are no widget (bad data, an unknown kind) draw as code.
const fenceOf = (content, card) => scan(content).filter(b => b.data && known(b.kind))[card]?.n ?? -1;
function keep(entry, n, data) {
 if (n < 0) return;
 const own = pending.get(entry) || new Map();
 own.set(n, data);
 pending.set(entry, own);
 entry.content = rewrite(entry.content, n, data);
}
function settle(messages) {
 for (const entry of messages || []) {
  const own = pending.get(entry);
  if (own) for (const [n, data] of own) entry.content = rewrite(entry.content, n, data);
 }
}



const lang = () => (window.I18n?.lang && WORDS[I18n.lang] ? I18n.lang : 'en');
const locale = () => ({ ru: 'ru-RU', it: 'it-IT', fr: 'fr-FR' }[window.I18n?.lang] || 'en-US');
const say = (key, vars = {}) => String(WORDS[lang()][key] ?? WORDS.en[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (value, digits) => {
 const n = Number(value) || 0, places = digits ?? (Number.isInteger(n) || Math.abs(n) >= 1000 ? 0 : 2);
 return new Intl.NumberFormat(locale(), { maximumFractionDigits: places, minimumFractionDigits: digits ?? 0 }).format(n);
};
// A code the agent wrote (RUB, USD) is shown as its sign, as people write money.
const SIGNS = { RUB: '₽', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', TRY: '₺', UAH: '₴', KZT: '₸' };
const money = (value, cur = '', digits) => { const v = num(value, digits); cur = SIGNS[String(cur).toUpperCase()] || cur; return !cur ? v : PREFIX.has(cur) ? `${cur}${v}` : `${v} ${cur}`; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pad = n => String(Math.floor(n)).padStart(2, '0');
const clock = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
const hm = date => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(date);
// A label in a button or a pill: its own span, trimmed to the capitals, so the words stand in the middle by their ink.
const lab = text => `<span class="bk-t">${esc(text)}</span>`;
const plural = (n, forms) => {
 if (!Array.isArray(forms)) return String(forms ?? '');
 if (lang() !== 'ru') return forms[n === 1 ? 0 : forms.length - 1];
 const a = Math.abs(n) % 100, b = a % 10;
 return forms[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2] ?? forms.at(-1);
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const svgNS = 'http://www.w3.org/2000/svg';

// Shared parts.
function head(d, extra = '') {
 return `<div class="bk-head"><div class="bk-title">${esc(d.title || '')}</div>${extra || (d.meta ? `<div class="bk-meta">${esc(d.meta)}</div>` : '')}</div>`;
}
// Where a widget's data comes from, as the agent wrote it: a Markdown link [name](url) or a bare address is shown as
// its name (the address's site), and opens in the built-in browser; the rest is text.
function source(text) {
 const out = [], LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s),;]+)/g;
 let at = 0;
 for (const m of String(text || '').matchAll(LINK)) {
  out.push(esc(text.slice(at, m.index)));
  const url = m[2] || m[3], name = m[1] || (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();
  out.push(`<span class="bk-src-link" role="link" tabindex="0" data-link="${esc(url)}">${esc(name)}</span>`);
  at = m.index + m[0].length;
 }
 out.push(esc(String(text || '').slice(at)));
 return out.join('');
}
function foot(d) {
 const src = d.source ? (typeof d.source === 'string' ? d.source : [d.source.name, d.source.at].filter(Boolean).join(' · ')) : '';
 const acts = [...(d.links || []).map((l, k) => `<button class="bk-btn${k === 0 ? ' is-main' : ''}" data-link="${esc(l.url)}">${lab(l.label)}</button>`),
  ...(d.actions || []).map(a => `<button class="bk-btn is-soft" data-say="${esc(a.say || a.label)}">${lab(a.label)}</button>`)];
 return `${acts.length ? `<div class="bk-acts">${acts.join('')}</div>` : ''}${src ? `<div class="bk-src">${source(src)}</div>` : ''}`;
}
// Minus and plus drawn, not typed: the font's signs sit on the middle of small letters, not in the middle of the button.
const SIGN = { minus: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8"/></svg>', plus: '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7h8M7 3v8"/></svg>' };
const stepper = (value) => `<span class="bk-step"><button data-step="-1" aria-label="−">${SIGN.minus}</button><b class="bk-step-v">${esc(value)}</b><button data-step="1" aria-label="+">${SIGN.plus}</button></span>`;
const tabs = (names, on) => `<div class="bk-tabs"><span class="bk-tabs-pill"></span>${names.map((n, k) => `<button class="bk-tab${k === on ? ' is-on' : ''}" data-tab="${k}">${lab(n)}</button>`).join('')}</div>`;
const slider = (name, min, max, step, value) => `<input class="bk-range" type="range" data-range="${esc(name)}" min="${min}" max="${max}" step="${step}" value="${value}">`;

// The ten kinds of glyph a row may carry when the agent has no photo for it.
const GLYPH = {
 car: '<path d="M4 15.5c0-2.2 1.5-3.4 3.5-3.9l4.8-1.2 4.4-4.2c.8-.7 1.8-1.1 2.9-1.1h8.3c1.4 0 2.6.6 3.4 1.7l2.8 3.6 3.9 1c1.8.5 3 2 3 3.9v1.7c0 .6-.5 1-1 1H5c-.6 0-1-.4-1-1z" fill="currentColor"/><circle cx="12" cy="17.5" r="3.3" fill="#0b0b0d"/><circle cx="33" cy="17.5" r="3.3" fill="#0b0b0d"/>',
 home: '<path d="M8 19V10l14-7 14 7v9H8z" fill="currentColor"/><path d="M18 19v-6h8v6" fill="#0b0b0d"/>',
 bed: '<path d="M6 18V6M6 13h32v5M10 12a3 3 0 1 1 6 0M18 9h14a6 6 0 0 1 6 4" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
 box: '<path d="M10 7l12-4 12 4v11l-12 4-12-4z" fill="currentColor"/><path d="M10 7l12 4 12-4M22 11v11" stroke="#0b0b0d" stroke-width="1.6" fill="none"/>',
 phone: '<rect x="15" y="2" width="14" height="19" rx="3" fill="currentColor"/><rect x="20" y="4" width="4" height="1.4" rx=".7" fill="#0b0b0d"/>',
 plane: '<path d="M4 12l14-2 7-8h3l-3 8 9 1 3-3h2l-2 4 2 4h-2l-3-3-9 1 3 8h-3l-7-8-14-2z" fill="currentColor"/>',
 bag: '<path d="M10 8h24l-2 14H12z" fill="currentColor"/><path d="M16 8a6 6 0 0 1 12 0" stroke="currentColor" stroke-width="2.2" fill="none"/>',
 food: '<circle cx="22" cy="12" r="9" fill="currentColor"/><circle cx="22" cy="12" r="5" fill="#0b0b0d"/>',
 ticket: '<path d="M6 5h32v5a2.5 2.5 0 0 0 0 4v5H6v-5a2.5 2.5 0 0 0 0-4z" fill="currentColor"/>',
 star: '<path d="M22 2l3 6.5 7 .8-5.2 4.8 1.5 7L22 17.6 15.7 21l1.5-7L12 9.3l7-.8z" fill="currentColor"/>',
};
const TONES = ['156, 201, 255', '255, 210, 122', '201, 178, 255', '124, 214, 162', '255, 155, 133', '125, 211, 252', '240, 171, 252'];
const tone = k => TONES[((k % TONES.length) + TONES.length) % TONES.length];
const thumb = (item, k) => item.image
 ? `<span class="bk-thumb" style="background-image:url(&quot;${esc(item.image)}&quot;)"></span>`
 : `<span class="bk-thumb" style="--tone:${tone(item.tone ?? k)}"><svg viewBox="0 0 44 22">${GLYPH[item.icon] || GLYPH.box}</svg></span>`;

// A number that runs to its new value instead of jumping.
function count(node, to, show = v => num(v)) {
 const from = node._v ?? (node.closest('og-block')?._fresh ? 0 : to);
 node._v = to;
 if (reduced() || from === to) { node.textContent = show(to); return; }
 const t0 = performance.now();
 const step = now => {
  const k = Math.min(1, (now - t0) / MOTION.count), e = 1 - (1 - k) ** 3;
  // A whole number runs through whole numbers; one with a fraction, through hundredths.
  const v = from + (to - from) * e;
  node.textContent = show(k < 1 ? (Number.isInteger(to) ? Math.round(v) : Math.round(v * 100) / 100) : to);
  if (k < 1 && node._v === to) requestAnimationFrame(step);
 };
 requestAnimationFrame(step);
}

// A line or an area through values, drawn into an svg of the given box; returns the points.
function path(values, w, h, pad = 4, lo = Math.min(...values), hi = Math.max(...values)) {
 const span = hi - lo || 1;
 return values.map((v, k) => [values.length === 1 ? w / 2 : k / (values.length - 1) * w, pad + (1 - (v - lo) / span) * (h - pad * 2)]);
}
const line = pts => pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

// Each kind: build(card, data, tools) fills the card and binds what it does.
const KINDS = {};

// Weather: a day's hours, run through by the pointer; days as tabs; the sun and the sea below.
KINDS.weather = (card, d, x) => {
 // What a model sends is read as kindly as it can be: a day given as its index, its name or its date; an hour as a
 // number or a time; conditions and wind as one word or one per hour; any number of readings in a day (24 by the hour,
 // or 8 every three hours), each bar standing for its share of the day.
 const days = (Array.isArray(d.days) ? d.days : []).map(one => ({ ...one, hours: (Array.isArray(one.hours) ? one.hours : []).map(Number).filter(Number.isFinite) })).filter(one => one.hours.length);
 if (!days.length) days.push({ name: '', hours: [] });
 const pickDay = v => { if (Number.isInteger(Number(v)) && String(v).length < 3) return Number(v); const k = days.findIndex(one => one.name === v || one.date === v || String(v).startsWith(one.date || '\u0000')); return k < 0 ? (days.length > 1 ? 1 : 0) : k; };
 const pickHour = v => { const n = Number(String(v ?? '').split(':')[0]); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : new Date().getHours(); };
 let day = clamp(pickDay(d.now?.day ?? 0), 0, days.length - 1);
 const nOf = () => Math.max(1, days[day].hours.length), atHour = h => clamp(Math.floor(h / 24 * nOf()), 0, nOf() - 1);
 let slot = atHour(clamp(pickHour(d.now?.hour), 0, 23));
 const hourOf = k => Math.round(k * 24 / nOf());
 const each = (v, k, n) => Array.isArray(v) ? (v.length === n ? v[k] : v.filter(Boolean).join(', ')) : v;
 const heat = t => t >= 30 ? '#ff7e57' : t >= 26 ? '#ff9a5a' : t >= 23 ? '#ffc65a' : t >= 19 ? '#ffe17a' : t >= 14 ? '#9fd8ff' : t >= 6 ? '#6fb6ff' : '#8f9bff';
 const most = Math.max(...days.map(one => one.hours.length), 1);
 card.innerHTML = `
  <div class="bk-w-top"><div><div class="bk-title">${esc(d.place)}</div><div class="bk-meta bk-w-when"></div></div>
   <div class="bk-w-now"><div class="bk-w-cond"><b class="bk-w-word"></b><span class="bk-meta bk-w-wind"></span></div><div class="bk-big bk-w-t"></div></div></div>
  ${days.length > 1 ? tabs(days.map(x => x.name || x.date || ''), day) : ''}
  <div class="bk-chart" data-scrub><span class="bk-tip"></span>${Array.from({ length: most }, () => '<i class="bk-bar"></i>').join('')}</div>
  <div class="bk-ticks"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
  ${(d.pills || []).length ? `<div class="bk-pills">${d.pills.map(p => `<div class="bk-pill is-${esc(p.tone || 'day')}">${lab(p.label)}</div>`).join('')}</div>` : ''}
  ${foot(d)}`;
 const bars = [...card.querySelectorAll('.bk-bar')], tip = card.querySelector('.bk-tip');
 const paint = () => {
  const one = days[day], temps = one.hours, n = nOf(), lo = Math.min(...temps) - 3, hi = Math.max(...temps);
  slot = clamp(slot, 0, n - 1);
  bars.forEach((bar, k) => { bar.hidden = k >= n; const t = temps[k] ?? lo; bar.style.height = `${8 + (t - lo) / (hi - lo || 1) * 58}px`; bar.style.background = heat(t); bar.classList.toggle('is-on', k === slot); });
  const t = temps[slot], hour = hourOf(slot);
  tip.textContent = `${hour}:00 · ${t == null ? '—' : num(t)}°`;
  if (bars[slot]) tip.style.left = `${bars[slot].offsetLeft + bars[slot].offsetWidth / 2}px`;
  count(card.querySelector('.bk-w-t'), t ?? 0, v => `${Math.round(v)}°`);
  card.querySelector('.bk-w-when').textContent = [one.name, `${hour}:00`].filter(Boolean).join(', ');
  card.querySelector('.bk-w-word').textContent = each(one.cond, slot, n) || '';
  // Wind given as a bare number is the forecast's own speed, in km/h as Open-Meteo gives it: it is said with its unit.
  const wind = each(one.wind, slot, n);
  card.querySelector('.bk-w-wind').textContent = typeof wind === 'number' || /^\d+([.,]\d+)?$/.test(String(wind ?? '').trim()) ? say('windKmh', { v: Math.round(Number(String(wind).replace(',', '.'))) }) : wind || '';
 };
 x.scrub(card.querySelector('.bk-chart'), share => { slot = clamp(Math.floor(share * nOf()), 0, nOf() - 1); paint(); });
 x.tabs(k => { const hour = hourOf(slot); day = k; slot = atHour(hour); paint(); });
 x.relayout(paint);
 x.after(paint);
};

// Timer: the ruler melts, the time runs down; at the end the card lights up and the sound of notifications plays.
KINDS.timer = (card, d, x) => {
 // A timer begins when its reply first comes; one read back from an older chat with no start of its own has long rung.
 let total = Math.max(1, Number(d.seconds) || 60), paused = d.paused ? Number(d.paused) : 0;
 let started = Number(d.started) || (card._new ? Date.now() : Date.now() - total * 1000 - 1000);
 const id = d.id || `t${started.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
 // Its end is kept by the app (Alarms), not by the card: it rings with the chat closed or the window away.
 const keep = changed => {
  x.state({ ...d, id, seconds: total, started, paused: paused || undefined }, changed);
  Alarms.set(id, paused ? 0 : started + total * 1000, { label: d.label || d.title || say('done') });
 };
 keep(card._new && !d.started);
 const TICKS = 40;
 card.innerHTML = `
  <div class="bk-head"><div class="bk-title bk-accent">${esc(d.label || d.title || '')}</div><div class="bk-meta bk-t-end"></div></div>
  <div class="bk-ruler">${Array.from({ length: TICKS }, (_, k) => `<i class="bk-tick${k % 4 === 0 ? ' is-long' : ''}"></i>`).join('')}</div>
  <div class="bk-row bk-t-row"><span class="bk-big bk-accent bk-t-left"></span><span class="bk-gap"></span>
   <button class="bk-btn is-soft is-small" data-do="plus">${lab(say('plusMinute'))}</button>
   <button class="bk-round is-soft" data-do="reset" aria-label="${esc(say('reset'))}"><i class="bk-i-stop"></i></button>
   <button class="bk-round is-accent" data-do="pause" aria-label="${esc(say('pause'))}"><i class="bk-i-pause"></i></button></div>`;
 const left = () => total - ((paused || Date.now()) - started) / 1000;
 const paint = () => {
  const s = Math.max(0, left()), on = Math.ceil(s / total * TICKS), done = s <= 0;
  card.querySelectorAll('.bk-tick').forEach((t, k) => t.classList.toggle('is-on', k < on));
  card.querySelector('.bk-t-left').textContent = done ? say('done') : clock(s);
  card.querySelector('.bk-t-end').textContent = done ? say('rang', { time: hm(new Date(started + total * 1000)) }) : paused ? say('pause') : say('ringsAt', { time: hm(new Date(started + total * 1000)) });
  card.classList.toggle('is-done', done);
  card.querySelector('[data-do="pause"] i').className = paused ? 'bk-i-play' : 'bk-i-pause';
 };
 x.on('[data-do="plus"]', () => { if (left() <= 0) { started = Date.now(); total = 60; paused = 0; } else total += 60; keep(true); paint(); });
 x.on('[data-do="reset"]', () => { started = Date.now(); paused = Date.now(); keep(true); paint(); });
 x.on('[data-do="pause"]', () => { if (paused) { started += Date.now() - paused; paused = 0; } else if (left() > 0) paused = Date.now(); keep(true); paint(); });
 x.tick(paint, 250);
 x.after(paint);
};

// Stopwatch with laps: the best lap green, the worst red.
KINDS.stopwatch = (card, d, x) => {
 let run = 0, acc = Number(d.elapsed) || 0, laps = (d.laps || []).map(Number);
 card.innerHTML = `
  ${head({ title: d.label || d.title || say('laps') })}
  <div class="bk-row"><span class="bk-big bk-sw"></span><span class="bk-gap"></span>
   <button class="bk-round is-soft" data-do="lap" aria-label="${esc(say('lap'))}">${lab(say('lap'))}</button>
   <button class="bk-round is-accent" data-do="go" aria-label="${esc(say('start'))}"><i class="bk-i-play"></i></button></div>
  <div class="bk-laps"></div>`;
 const now = () => acc + (run ? Date.now() - run : 0);
 const show = ms => `${pad(ms / 60000)}:${pad(ms / 1000 % 60)}.${pad(ms / 10 % 100)}`;
 const paint = () => {
  card.querySelector('.bk-sw').textContent = show(now());
  card.querySelector('[data-do="go"] i').className = run ? 'bk-i-stop' : 'bk-i-play';
 };
 const paintLaps = () => {
  const times = laps.map((t, k) => t - (laps[k - 1] || 0)), best = Math.min(...times), worst = Math.max(...times);
  card.querySelector('.bk-laps').innerHTML = times.map((t, k) => `<div class="bk-lap${times.length > 1 && t === best ? ' is-best' : times.length > 1 && t === worst ? ' is-worst' : ''}"><span>${say('lap')} ${k + 1}</span><span>${show(t)}</span></div>`).reverse().slice(0, 5).join('');
 };
 x.on('[data-do="go"]', () => { if (run) { acc += Date.now() - run; run = 0; } else run = Date.now(); paint(); });
 x.on('[data-do="lap"]', () => { if (!run && !acc) return; laps.push(now()); paintLaps(); });
 x.tick(paint, 50);
 x.after(() => { paint(); if (laps.length) paintLaps(); });
};

// Countdown to an event: days, hours, minutes, seconds, and an arc whose dot shows how much of the wait is behind.
KINDS.countdown = (card, d, x) => {
 const to = new Date(d.to).getTime(), from = d.from ? new Date(d.from).getTime() : to - 30 * 864e5;
 card.innerHTML = `
  ${head(d)}
  <svg class="bk-arc" viewBox="0 0 300 84"><path class="bk-arc-track" d="M12 76Q150 -14 288 76"/><path class="bk-arc-fill" d="M12 76Q150 -14 288 76"/><circle class="bk-arc-dot" r="5.5"/></svg>
  <div class="bk-segs">${['days', 'hours', 'minutes', 'seconds'].map(k => `<div><b class="bk-seg" data-seg="${k}"></b><span>${say(k)}</span></div>`).join('')}</div>
  ${foot(d)}`;
 const arc = card.querySelector('.bk-arc-fill'), dot = card.querySelector('.bk-arc-dot');
 const paint = () => {
  const s = Math.max(0, (to - Date.now()) / 1000), share = clamp((Date.now() - from) / (to - from || 1), 0, 1);
  const parts = { days: Math.floor(s / 86400), hours: Math.floor(s % 86400 / 3600), minutes: Math.floor(s % 3600 / 60), seconds: Math.floor(s % 60) };
  for (const [k, v] of Object.entries(parts)) card.querySelector(`[data-seg="${k}"]`).textContent = k === 'days' ? String(v) : pad(v);
  const length = arc.getTotalLength(), at = arc.getPointAtLength(length * share);
  arc.style.strokeDasharray = `${(length * share).toFixed(1)} ${length.toFixed(1)}`;
  dot.setAttribute('cx', at.x.toFixed(1)); dot.setAttribute('cy', at.y.toFixed(1));
 };
 x.tick(paint, 1000);
 x.after(paint);
};

// Clocks of several cities, the day's light behind each; the slider moves all of them at once (to find a time for a call).
KINDS.clocks = (card, d, x) => {
 const cities = d.cities || [];
 let shift = 0;
 card.innerHTML = `
  ${head({ title: d.title || say('now'), meta: '' }, '<div class="bk-meta bk-c-shift"></div>')}
  <div class="bk-clocks">${cities.map((c, k) => `<div class="bk-clock" data-k="${k}"><div><div class="bk-name">${esc(c.name)}</div><div class="bk-meta bk-c-off"></div></div><div class="bk-sky"><span class="bk-c-time"></span></div></div>`).join('')}</div>
  <div class="bk-row bk-small"><span class="bk-dim">${esc(say('shift'))}</span><span class="bk-gap"></span></div>
  ${slider('shift', -12, 12, 1, 0)}`;
 const local = (tz, date) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date); return { h: Number(p.find(q => q.type === 'hour').value), m: Number(p.find(q => q.type === 'minute').value) }; };
 const sky = h => h < 5 || h >= 22 ? 'linear-gradient(90deg,#1d2350,#3b2f6b)' : h < 8 ? 'linear-gradient(90deg,#ffb46b,#ffd9a0)' : h < 18 ? 'linear-gradient(90deg,#8fd0ff,#e9f4ff)' : 'linear-gradient(90deg,#ff9a6b,#b06bd0)';
 const paint = () => {
  const date = new Date(Date.now() + shift * 3600e3), here = local(Intl.DateTimeFormat().resolvedOptions().timeZone, date);
  card.querySelectorAll('.bk-clock').forEach((row, k) => {
   const t = local(cities[k].tz, date), off = Math.round(((t.h * 60 + t.m) - (here.h * 60 + here.m)) / 60);
   const offset = ((off + 36) % 24) - 12;
   row.querySelector('.bk-c-time').textContent = `${t.h}:${pad(t.m)}`;
   row.querySelector('.bk-sky').style.background = sky(t.h);
   row.querySelector('.bk-sky').classList.toggle('is-night', t.h < 5 || t.h >= 22);
   row.querySelector('.bk-c-off').textContent = offset === 0 ? '' : `${offset > 0 ? '+' : '−'}${Math.abs(offset)} ${say('hours')}`;
  });
  card.querySelector('.bk-c-shift').textContent = shift === 0 ? say('now') : shift > 0 ? say('later', { n: shift }) : say('earlier', { n: -shift });
 };
 x.range('shift', v => { shift = v; paint(); });
 x.tick(paint, 15000);
 x.after(paint);
};

// Converters: an amount in one unit, every other unit beside it; tap a row to count from it.
function converter(card, d, x, units, convert, digits) {
 let base = units[0]?.id, amount = Number(d.amount) || 1;
 if (d.base && units.some(u => u.id === d.base)) base = d.base;
 card.innerHTML = `
  ${head(d)}
  <div class="bk-input"><input class="bk-num" type="text" inputmode="decimal" value="${esc(num(amount))}" aria-label="${esc(say('amount'))}"><span class="bk-input-u"></span></div>
  <div class="bk-units">${units.map(u => `<button class="bk-unit" data-u="${esc(u.id)}"><span class="bk-name">${esc(u.name || u.id)}</span><b class="bk-u-v"></b></button>`).join('')}</div>
  ${foot(d)}`;
 const input = card.querySelector('.bk-num');
 const paint = () => {
  const from = units.find(u => u.id === base);
  card.querySelector('.bk-input-u').textContent = from?.name || base;
  card.querySelectorAll('.bk-unit').forEach(row => {
   const u = units.find(q => q.id === row.dataset.u);
   row.classList.toggle('is-on', u.id === base);
   count(row.querySelector('.bk-u-v'), convert(amount, from, u), v => num(v, digits(v)));
  });
 };
 input.addEventListener('input', () => { const v = Number(input.value.replace(/\s/g, '').replace(',', '.')); if (Number.isFinite(v)) { amount = v; paint(); } });
 card.querySelectorAll('.bk-unit').forEach(row => row.addEventListener('click', () => {
  const from = units.find(u => u.id === base), to = units.find(u => u.id === row.dataset.u);
  amount = Number(convert(amount, from, to).toFixed(4)); base = to.id; input.value = num(amount, digits(amount)); paint();
 }));
 x.after(paint);
}
KINDS.currency = (card, d, x) => {
 const rates = { [d.base]: 1, ...(d.rates || {}) };
 const units = Object.keys(rates).map(id => ({ id, name: d.names?.[id] ? `${id} · ${d.names[id]}` : id, rate: rates[id] }));
 converter(card, d, x, units, (v, from, to) => v / from.rate * to.rate, v => Math.abs(v) >= 100 ? 0 : 2);
};
KINDS.units = (card, d, x) => {
 const units = (d.units || []).map(u => ({ ...u, factor: Number(u.factor) || 1, offset: Number(u.offset) || 0 }));
 converter(card, d, x, units, (v, from, to) => ((v * from.factor + from.offset) - to.offset) / to.factor, v => Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 10 ? 1 : 3);
};

// The bill split: people and tip; the share of each.
KINDS.split = (card, d, x) => {
 let total = Number(d.total) || 0, people = Math.max(1, Number(d.people) || 2), tip = Number(d.tip ?? 10);
 const cur = d.currency || '', TIPS = d.tips || [0, 5, 10, 15];
 card.innerHTML = `
  ${head(d)}
  <div class="bk-input"><input class="bk-num" type="text" inputmode="decimal" value="${esc(num(total))}"><span class="bk-input-u">${esc(SIGNS[String(cur).toUpperCase()] || cur)}</span></div>
  <div class="bk-row bk-gaprow"><span class="bk-dim bk-small">${esc(say('people'))}</span><span class="bk-gap"></span>${stepper(people)}</div>
  <div class="bk-row bk-gaprow"><span class="bk-dim bk-small">${esc(say('tip'))}</span><span class="bk-gap"></span>${tabs(TIPS.map(p => `${p}%`), TIPS.indexOf(tip))}</div>
  <div class="bk-result"><span class="bk-big bk-accent bk-s-each"></span><span class="bk-dim">${esc(say('perPerson'))}</span><span class="bk-gap"></span><span class="bk-dim bk-small bk-s-sum"></span></div>`;
 const paint = () => {
  card.querySelector('.bk-step-v').textContent = people;
  const all = total * (1 + tip / 100);
  count(card.querySelector('.bk-s-each'), all / people, v => money(v, cur, 2));
  card.querySelector('.bk-s-sum').textContent = `${say('total')} ${money(all, cur, 2)} · ${say('tipOf', { sum: money(total * tip / 100, cur, 2) })}`;
 };
 x.stepper(n => { people = clamp(people + n, 1, 50); paint(); });
 x.tabs(k => { tip = TIPS[k]; paint(); });
 x.input('.bk-num', v => { total = v; paint(); });
 x.after(paint);
};

// Options to choose among (cars, rooms, flats, goods): the number of units (days, nights, pieces) moves every total,
// what goes over the budget dims, the budget bar follows the pick, the main button names the pick.
KINDS.compare = (card, d, x) => {
 const items = d.items || [], cur = d.currency || '', budget = Number(d.budget) || 0;
 let qty = Math.max(1, Number(d.qty) || 1), pick = clamp(Number(d.pick) || 0, 0, items.length - 1);
 const unit = n => plural(n, d.unit || '');
 card.innerHTML = `
  ${head(d)}
  ${d.qtyLabel ? `<div class="bk-row bk-gaprow"><span class="bk-dim bk-small">${esc(d.qtyLabel)}</span><span class="bk-gap"></span>${stepper('')}</div>` : ''}
  <div class="bk-list">${items.map((it, k) => `<button class="bk-item" data-k="${k}">${thumb(it, k)}<span class="bk-item-text"><span class="bk-name">${esc(it.name)}</span><span class="bk-meta">${esc(it.meta || '')}</span></span><span class="bk-price"><b class="bk-total"></b><span class="bk-per"></span></span></button>`).join('')}</div>
  ${budget ? `<div class="bk-budget"><div class="bk-row bk-small"><span class="bk-b-word"></span><span class="bk-gap"></span><span class="bk-dim">${esc(say('budget', { sum: money(budget, cur) }))}</span></div><div class="bk-track"><span class="bk-dot"></span></div></div>` : ''}
  ${items.some(it => it.url) ? `<div class="bk-acts"><button class="bk-btn is-main" data-do="open">${lab('')}</button>${(d.actions || []).map(a => `<button class="bk-btn is-soft" data-say="${esc(a.say || a.label)}">${lab(a.label)}</button>`).join('')}</div>` : ''}
  ${foot({ ...d, actions: items.some(it => it.url) ? [] : d.actions, links: [] })}`;
 const paint = () => {
  const v = card.querySelector('.bk-step-v');
  if (v) v.textContent = `${qty} ${unit(qty)}`;
  card.querySelectorAll('.bk-item').forEach((row, k) => {
   const total = items[k].price * qty, over = budget && total > budget;
   count(row.querySelector('.bk-total'), total, n => money(n, cur));
   row.classList.toggle('is-on', k === pick);
   row.classList.toggle('is-over', !!over && k !== pick);
   row.querySelector('.bk-per').innerHTML = over ? `<span class="bk-flag">${esc(say('over'))}</span>` : esc(qty > 1 || d.unit ? say('perUnit', { sum: money(items[k].price, cur), unit: unit(1) }) : '');
  });
  if (budget) {
   const total = items[pick].price * qty, left = budget - total;
   card.querySelector('.bk-dot').style.left = `${clamp(total / budget * 100, 0, 100)}%`;
   card.querySelector('.bk-b-word').textContent = left >= 0 ? say('leftOf', { left: money(left, cur), budget: money(budget, cur) }) : say('overBy', { sum: money(-left, cur) });
  }
  const open = card.querySelector('[data-do="open"] .bk-t');
  if (open) open.textContent = `${d.openLabel || '↗'} ${items[pick].name}`.trim();
 };
 x.stepper(n => { qty = clamp(qty + n, 1, 99); paint(); });
 card.querySelectorAll('.bk-item').forEach(row => row.addEventListener('click', () => { pick = Number(row.dataset.k); paint(); }));
 x.on('[data-do="open"]', () => items[pick].url && x.link(items[pick].url));
 x.after(paint);
};

// A product and its price over time: run through the history, the lowest and the usual price, how now compares.
KINDS.product = (card, d, x) => {
 const hist = (d.history || []).map(p => Number(p.price)), cur = d.currency || '', now = Number(d.price ?? hist.at(-1));
 const usual = hist.length ? hist.slice().sort((a, b) => a - b)[Math.floor(hist.length / 2)] : now, low = Math.min(...hist), high = Math.max(...hist);
 const diff = Math.round((now - usual) / usual * 100);
 card.innerHTML = `
  ${head(d)}
  <div class="bk-row"><span class="bk-big bk-p-now"></span><span class="bk-gap"></span><span class="bk-chip ${diff < 0 ? 'is-good' : diff > 0 ? 'is-bad' : ''}">${lab(diff < 0 ? say('cheaper', { p: -diff }) : diff > 0 ? say('dearer', { p: diff }) : say('same'))}</span></div>
  <div class="bk-plot" data-scrub><svg class="bk-svg" preserveAspectRatio="none"></svg><span class="bk-tip"></span></div>
  <div class="bk-stats"><div><span>${esc(say('low'))}</span><b>${esc(money(low, cur))}</b></div><div><span>${esc(say('usual'))}</span><b>${esc(money(usual, cur))}</b></div><div><span>${esc(say('high'))}</span><b>${esc(money(high, cur))}</b></div></div>
  ${foot(d)}`;
 const plot = card.querySelector('.bk-plot'), svg = card.querySelector('.bk-svg'), tip = card.querySelector('.bk-tip');
 let pts = [];
 const draw = () => {
  const w = svg.clientWidth, h = svg.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  pts = path(hist, w, h, 8);
  svg.innerHTML = `<path class="bk-area" d="${line(pts)}L${w} ${h}L0 ${h}Z"/><path class="bk-stroke" pathLength="1" d="${line(pts)}"/><circle class="bk-pdot" r="5"/>`;
  show(hist.length - 1);
 };
 const show = k => {
  const [px, py] = pts[k] || [0, 0];
  const c = svg.querySelector('.bk-pdot'); c.setAttribute('cx', px); c.setAttribute('cy', py);
  tip.textContent = `${d.history[k]?.at || ''} · ${money(hist[k], cur)}`;
  tip.style.left = `${clamp(px, 50, plot.clientWidth - 50)}px`;
 };
 x.scrub(plot, share => show(clamp(Math.round(share * (hist.length - 1)), 0, hist.length - 1)));
 x.relayout(draw);
 x.after(() => { count(card.querySelector('.bk-p-now'), now, v => money(v, cur)); draw(); });
};

// A budget of parts (a trip, a party, a renovation): each part on its slider, the total and the share of each person.
KINDS.budget = (card, d, x) => {
 const parts = (d.items || []).map(p => ({ ...p, amount: Number(p.amount) || 0 })), cur = d.currency || '';
 let people = Math.max(1, Number(d.people) || 1);
 card.innerHTML = `
  ${head(d)}
  <div class="bk-stack"></div>
  <div class="bk-parts">${parts.map((p, k) => `<div class="bk-part" style="--tone:${tone(k)}"><div class="bk-row bk-small"><span class="bk-sw-dot"></span><span class="bk-name">${esc(p.name)}</span><span class="bk-gap"></span><b class="bk-part-v"></b></div>${slider(`p${k}`, p.min ?? 0, p.max ?? Math.max(100, p.amount * 2), p.step ?? 1, p.amount)}</div>`).join('')}</div>
  <div class="bk-row bk-gaprow"><span class="bk-dim bk-small">${esc(say('people'))}</span><span class="bk-gap"></span>${stepper(people)}</div>
  <div class="bk-result"><span class="bk-big bk-accent bk-b-all"></span><span class="bk-gap"></span><span class="bk-dim bk-small bk-b-each"></span></div>
  ${foot(d)}`;
 const paint = () => {
  const all = parts.reduce((s, p) => s + p.amount, 0);
  card.querySelector('.bk-stack').innerHTML = parts.map((p, k) => `<i style="flex:${p.amount || 0.0001};background:rgb(${tone(k)})"></i>`).join('');
  card.querySelectorAll('.bk-part-v').forEach((b, k) => { b.textContent = money(parts[k].amount, cur); });
  card.querySelector('.bk-step-v').textContent = people;
  count(card.querySelector('.bk-b-all'), all, v => money(v, cur));
  card.querySelector('.bk-b-each').textContent = `${money(all / people, cur)} ${say('each')}`;
 };
 parts.forEach((p, k) => x.range(`p${k}`, v => { p.amount = v; paint(); }));
 x.stepper(n => { people = clamp(people + n, 1, 50); paint(); });
 x.after(paint);
};

// A loan or a mortgage: amount, term and rate on sliders; the payment a month, what the bank takes on top.
KINDS.loan = (card, d, x) => {
 const cur = d.currency || '';
 let amount = Number(d.amount) || 100000, years = Number(d.years) || 10, rate = Number(d.rate) || 10;
 card.innerHTML = `
  ${head(d)}
  <div class="bk-result"><span class="bk-big bk-accent bk-l-pay"></span><span class="bk-dim">${esc(say('monthly'))}</span></div>
  <div class="bk-stack is-two"><i class="bk-l-body"></i><i class="bk-l-int"></i></div>
  <div class="bk-row bk-small bk-legend"><span><i class="bk-sw-dot is-a"></i>${esc(say('body'))}</span><span><i class="bk-sw-dot is-b"></i>${esc(say('interest'))}</span><span class="bk-gap"></span><span class="bk-dim bk-l-over"></span></div>
  <div class="bk-slide"><div class="bk-row bk-small"><span class="bk-dim">${esc(say('amount'))}</span><span class="bk-gap"></span><b class="bk-l-a"></b></div>${slider('amount', d.min ?? 0, d.max ?? amount * 3, d.step ?? Math.max(1, Math.round(amount / 100)), amount)}</div>
  <div class="bk-slide"><div class="bk-row bk-small"><span class="bk-dim">${esc(say('term'))}</span><span class="bk-gap"></span><b class="bk-l-y"></b></div>${slider('years', 1, d.maxYears ?? 30, 1, years)}</div>
  <div class="bk-slide"><div class="bk-row bk-small"><span class="bk-dim">${esc(say('rate'))}</span><span class="bk-gap"></span><b class="bk-l-r"></b></div>${slider('rate', 0, d.maxRate ?? 30, 0.1, rate)}</div>
  ${foot(d)}`;
 const paint = () => {
  const n = years * 12, r = rate / 1200, pay = r ? amount * r / (1 - (1 + r) ** -n) : amount / n, all = pay * n, over = all - amount;
  count(card.querySelector('.bk-l-pay'), pay, v => money(v, cur));
  card.querySelector('.bk-l-body').style.flex = String(amount || 0.0001);
  card.querySelector('.bk-l-int').style.flex = String(over || 0.0001);
  card.querySelector('.bk-l-over').textContent = say('overpay', { sum: money(over, cur) });
  card.querySelector('.bk-l-a').textContent = money(amount, cur);
  card.querySelector('.bk-l-y').textContent = `${years} ${say('years')}`;
  card.querySelector('.bk-l-r').textContent = `${num(rate, 1)}%`;
 };
 x.range('amount', v => { amount = v; paint(); });
 x.range('years', v => { years = v; paint(); });
 x.range('rate', v => { rate = v; paint(); });
 x.after(paint);
};

// Plans and subscriptions: month or year; a plan picked by a tap; what a year saves.
KINDS.plans = (card, d, x) => {
 const plans = d.plans || [], cur = d.currency || '';
 let yearly = d.period === 'year', pick = clamp(Number(d.pick) || 0, 0, plans.length - 1);
 card.innerHTML = `
  ${head(d, tabs([say('month'), say('year')], yearly ? 1 : 0))}
  <div class="bk-plans">${plans.map((p, k) => `<button class="bk-plan" data-k="${k}">${p.tag ? `<span class="bk-tag">${lab(p.tag)}</span>` : ''}<span class="bk-name">${esc(p.name)}</span><b class="bk-plan-v"></b><span class="bk-meta bk-plan-per"></span><span class="bk-save"></span><span class="bk-feats">${(p.features || []).map(f => `<span>${esc(f)}</span>`).join('')}</span></button>`).join('')}</div>
  ${foot(d)}`;
 const paint = () => {
  card.querySelectorAll('.bk-tab').forEach((t, k) => t.classList.toggle('is-on', k === (yearly ? 1 : 0)));
  x.pills();
  card.querySelectorAll('.bk-plan').forEach((row, k) => {
   const p = plans[k], price = yearly ? (p.year ?? p.month * 12) : p.month, save = p.year && p.month ? Math.round((1 - p.year / (p.month * 12)) * 100) : 0;
   row.classList.toggle('is-on', k === pick);
   count(row.querySelector('.bk-plan-v'), price, v => money(v, cur));
   row.querySelector('.bk-plan-per').textContent = say('perMonth', { sum: money(yearly ? price / 12 : price, cur) });
   row.querySelector('.bk-save').textContent = yearly && save > 0 ? say('save', { p: save }) : '';
  });
 };
 x.tabs(k => { yearly = k === 1; paint(); });
 card.querySelectorAll('.bk-plan').forEach(row => row.addEventListener('click', () => { pick = Number(row.dataset.k); paint(); }));
 x.after(paint);
};

// A road: time and distance, the departure moved by a quarter of an hour, one way or both, the fuel it takes.
KINDS.route = (card, d, x) => {
 const [h0, m0] = String(d.depart || '9:00').split(':').map(Number);
 let leave = h0 * 60 + (m0 || 0), both = !!d.roundTrip;
 const fuel = d.fuel || null;
 card.innerHTML = `
  <div class="bk-route"><div><div class="bk-meta">${esc(d.fromLabel || '')}</div><div class="bk-place">${esc(d.from)}</div><div class="bk-meta bk-r-leave"></div></div>
   <div class="bk-road"><i></i><svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="7"/><path d="M5.5 9.5h7M9.5 6.5l3 3-3 3"/></svg></div>
   <div class="bk-right"><div class="bk-meta">${esc(d.toLabel || '')}</div><div class="bk-place">${esc(d.to)}</div><div class="bk-meta bk-r-arrive"></div></div></div>
  <div class="bk-row bk-small bk-r-line"><span class="bk-accent2">${esc(`${Math.floor(d.minutes / 60) ? `${Math.floor(d.minutes / 60)} ${say('hours')} ` : ''}${d.minutes % 60} ${say('minutes')} · ${num(d.km)} ${say('km')}`)}</span><span class="bk-gap"></span><span class="bk-dim bk-r-fuel"></span></div>
  <div class="bk-row bk-gaprow">${tabs([say('oneWay'), say('roundTrip')], both ? 1 : 0)}<span class="bk-gap"></span><span class="bk-dim bk-small">${esc(say('depart'))}</span>${stepper('')}</div>
  ${foot(d)}`;
 const paint = () => {
  const arrive = leave + Number(d.minutes || 0);
  const t = m => `${Math.floor(((m % 1440) + 1440) % 1440 / 60)}:${pad(((m % 60) + 60) % 60)}`;
  card.querySelector('.bk-step-v').textContent = t(leave);
  card.querySelector('.bk-r-leave').textContent = t(leave);
  card.querySelector('.bk-r-arrive').textContent = t(arrive);
  // The fuel it takes: its cost when a price is known, else the litres (a price of nought is no price).
  if (fuel && Number(fuel.per100) > 0) {
   const litres = d.km * (both ? 2 : 1) * fuel.per100 / 100;
   card.querySelector('.bk-r-fuel').textContent = Number(fuel.price) > 0 ? say('fuel', { sum: money(litres * fuel.price, fuel.currency || '') }) : say('fuelL', { l: num(Math.round(litres)) });
  }
  card.querySelector('.bk-road i').style.width = '100%';
 };
 x.stepper(n => { leave += n * 15; paint(); });
 x.tabs(k => { both = k === 1; paint(); });
 x.after(paint);
};

// A flight: codes and times at both ends, the plane along the line, the gate and terminal under a tap.
KINDS.flight = (card, d, x) => {
 const a = d.from || {}, b = d.to || {};
 card.innerHTML = `
  <div class="bk-head"><div class="bk-meta">${esc([d.airline, d.number].filter(Boolean).join(' · '))}</div><div class="bk-chip is-${esc(d.state || 'air')}">${lab(d.status || say('inAir'))}</div></div>
  <div class="bk-fl"><div><div class="bk-meta">${esc(a.city)}</div><div class="bk-code">${esc(a.code)}</div><div class="bk-time">${esc(a.time || '')}</div></div>
   <div class="bk-fl-line"><i></i><svg viewBox="0 0 44 22">${GLYPH.plane}</svg></div>
   <div class="bk-right"><div class="bk-meta">${esc(b.city)}</div><div class="bk-code">${esc(b.code)}</div><div class="bk-time">${esc(b.time || '')}</div></div></div>
  ${d.note ? `<div class="bk-row bk-small"><span class="bk-accent2">${esc(d.note)}</span></div>` : ''}
  <button class="bk-more">${lab([d.gate && `${say('gate')} ${d.gate}`, d.terminal && `${say('terminal')} ${d.terminal}`, d.baggage].filter(Boolean).join(' · ') || '…')}</button>
  ${foot(d)}`;
 const share = clamp(Number(d.progress) || 0, 0, 1);
 x.after(() => {
  card.querySelector('.bk-fl-line i').style.width = `${share * 100}%`;
  card.querySelector('.bk-fl-line svg').style.left = `${share * 100}%`;
 });
};

// A parcel: its road in stops, the stop it is at glowing; the number copied by a tap; its history under a tap.
KINDS.parcel = (card, d, x) => {
 const steps = d.steps || [], at = Math.max(0, steps.findLastIndex(s => s.done));
 card.innerHTML = `
  ${head({ title: d.title || d.carrier, meta: d.eta ? say('eta', { when: d.eta }) : '' })}
  <div class="bk-status">${esc(steps[at]?.label || '')}</div>
  <div class="bk-path">${steps.map((s, k) => `<span class="bk-stop${k <= at ? ' is-done' : ''}${k === at ? ' is-now' : ''}" style="left:${steps.length > 1 ? k / (steps.length - 1) * 100 : 0}%"></span>`).join('')}<i class="bk-path-fill"></i></div>
  <div class="bk-row bk-gaprow"><span class="bk-dim bk-small bk-mono">${esc(d.number || '')}</span><span class="bk-gap"></span>${d.number ? `<button class="bk-btn is-soft is-small" data-do="copy">${lab(say('copy'))}</button>` : ''}<button class="bk-btn is-soft is-small" data-do="more">${lab(say('history'))}</button></div>
  <div class="bk-hist" hidden>${steps.slice().reverse().map(s => `<div class="bk-hrow${s.done ? '' : ' is-wait'}"><span>${esc(s.label)}</span><span class="bk-dim">${esc([s.place, s.at].filter(Boolean).join(' · '))}</span></div>`).join('')}</div>
  ${foot(d)}`;
 x.on('[data-do="copy"]', button => { navigator.clipboard?.writeText(String(d.number)).catch(() => {}); button.querySelector('.bk-t').textContent = say('copied'); });
 x.on('[data-do="more"]', () => { const h = card.querySelector('.bk-hist'); h.hidden = !h.hidden; });
 x.after(() => { card.querySelector('.bk-path-fill').style.width = `${steps.length > 1 ? at / (steps.length - 1) * 100 : 0}%`; });
};

// Transport from a stop: a line per tab, the next departures counting down.
KINDS.transit = (card, d, x) => {
 const lines = d.lines || [];
 let on = 0;
 card.innerHTML = `${head(d)}${lines.length > 1 ? tabs(lines.map(l => l.name), 0) : ''}<div class="bk-deps"></div>${foot(d)}`;
 const when = s => { const [h, m] = String(s).split(':').map(Number), now = new Date(), t = new Date(now); t.setHours(h, m || 0, 0, 0); if (t < now - 60e3) t.setDate(t.getDate() + 1); return t; };
 const paint = () => {
  const l = lines[on] || { times: [] }, now = Date.now();
  const next = l.times.map(when).filter(t => t >= now - 30e3).sort((a, b) => a - b).slice(0, 4);
  card.querySelector('.bk-deps').innerHTML = next.map((t, k) => { const m = Math.round((t - now) / 60e3); return `<div class="bk-dep${k === 0 ? ' is-first' : ''}" style="--tone:${tone(l.tone ?? on)}"><span class="bk-line-n">${lab(l.name)}</span><span class="bk-name">${esc(l.to || '')}</span><span class="bk-gap"></span><span class="bk-dim">${hm(t)}</span><b>${esc(m <= 0 ? say('nowGo') : say('inMin', { n: m }))}</b></div>`; }).join('');
 };
 x.tabs(k => { on = k; paint(); });
 x.tick(paint, 15000);
 x.after(paint);
};

// A recipe: the servings move every amount; an ingredient ticked off when it is in.
KINDS.recipe = (card, d, x) => {
 const base = Math.max(1, Number(d.servings) || 2), items = d.ingredients || [];
 let servings = base;
 const nice = v => v >= 100 ? Math.round(v / 5) * 5 : v >= 10 ? Math.round(v) : Math.round(v * 4) / 4;
 card.innerHTML = `
  ${head(d)}
  <div class="bk-row bk-gaprow"><span class="bk-dim bk-small">${esc(say('servings'))}</span><span class="bk-gap"></span>${stepper(servings)}</div>
  <div class="bk-ingr">${items.map((it, k) => `<button class="bk-ing" data-k="${k}"><span class="bk-check"></span><span class="bk-name">${esc(it.name)}</span><span class="bk-gap"></span><b class="bk-ing-v"></b></button>`).join('')}</div>
  ${foot(d)}`;
 const paint = () => {
  card.querySelector('.bk-step-v').textContent = servings;
  card.querySelectorAll('.bk-ing').forEach((row, k) => { const it = items[k]; row.querySelector('.bk-ing-v').textContent = it.amount == null ? (it.unit || '') : `${num(nice(it.amount * servings / base))} ${it.unit || ''}`.trim(); });
 };
 x.stepper(n => { servings = clamp(servings + n, 1, 40); paint(); });
 card.querySelectorAll('.bk-ing').forEach(row => row.addEventListener('click', () => row.classList.toggle('is-done')));
 x.after(paint);
};

// A day of food: the ring of calories, the three macros, meals ticked when eaten.
KINDS.nutrition = (card, d, x) => {
 const meals = (d.meals || []).map(m => ({ ...m, done: !!m.done })), goal = Number(d.goal) || 2000;
 card.innerHTML = `
  ${head(d)}
  <div class="bk-nut"><svg class="bk-ring" viewBox="0 0 80 80"><circle class="bk-ring-track" cx="40" cy="40" r="33"/><circle class="bk-ring-fill" cx="40" cy="40" r="33" pathLength="1"/></svg>
   <div class="bk-ring-v"><b class="bk-n-k"></b><span>${esc(say('kcal'))}</span></div>
   <div class="bk-macros">${['protein', 'fat', 'carbs'].map(k => `<div class="bk-macro" data-m="${k}"><div class="bk-row bk-small"><span>${esc(say(k))}</span><span class="bk-gap"></span><b></b></div><div class="bk-mbar"><i></i></div></div>`).join('')}</div></div>
  <div class="bk-meals">${meals.map((m, k) => `<button class="bk-ing${m.done ? ' is-done' : ''}" data-k="${k}"><span class="bk-check"></span><span class="bk-name">${esc(m.name)}</span><span class="bk-gap"></span><span class="bk-dim">${num(m.kcal)} ${esc(say('kcal'))}</span></button>`).join('')}</div>
  <div class="bk-src bk-n-sum"></div>`;
 const aim = { protein: d.protein || goal * 0.25 / 4, fat: d.fat || goal * 0.3 / 9, carbs: d.carbs || goal * 0.45 / 4 };
 const paint = () => {
  const eaten = meals.filter(m => m.done), kcal = eaten.reduce((s, m) => s + (m.kcal || 0), 0);
  count(card.querySelector('.bk-n-k'), kcal, v => num(Math.round(v)));
  card.querySelector('.bk-ring-fill').style.strokeDasharray = `${clamp(kcal / goal, 0, 1)} 1`;
  for (const k of ['protein', 'fat', 'carbs']) {
   const g = eaten.reduce((s, m) => s + (m[k] || 0), 0), row = card.querySelector(`[data-m="${k}"]`);
   row.querySelector('b').textContent = `${num(Math.round(g))} / ${num(Math.round(aim[k]))} г`;
   row.querySelector('i').style.width = `${clamp(g / aim[k] * 100, 0, 100)}%`;
  }
  card.querySelector('.bk-n-sum').textContent = say('eaten', { n: num(kcal), goal: num(goal) });
 };
 card.querySelectorAll('.bk-meals .bk-ing').forEach(row => row.addEventListener('click', () => { const m = meals[Number(row.dataset.k)]; m.done = !m.done; row.classList.toggle('is-done', m.done); paint(); }));
 x.after(paint);
};

// A workout: a dot per set, tapped when done; a rest bar runs down after each.
KINDS.workout = (card, d, x) => {
 const ex = d.exercises || [], rest = Number(d.rest) || 60;
 const done = ex.map(e => Array.from({ length: e.sets || 3 }, () => false));
 let restUntil = 0;
 card.innerHTML = `
  ${head(d, '<div class="bk-meta bk-wo-n"></div>')}
  <div class="bk-rest"><i></i><span class="bk-small bk-rest-t"></span></div>
  <div class="bk-exs">${ex.map((e, k) => `<div class="bk-ex"><div><div class="bk-name">${esc(e.name)}</div><div class="bk-meta">${esc([e.reps && `${e.reps} ×`, e.weight].filter(Boolean).join(' '))}</div></div><span class="bk-gap"></span>${done[k].map((_, j) => `<button class="bk-set" data-k="${k}" data-j="${j}">${lab(j + 1)}</button>`).join('')}</div>`).join('')}</div>`;
 const paint = () => {
  const all = done.flat(), n = all.filter(Boolean).length;
  card.querySelector('.bk-wo-n').textContent = say('sets', { done: n, all: all.length });
  const left = Math.max(0, (restUntil - Date.now()) / 1000);
  card.querySelector('.bk-rest').classList.toggle('is-on', left > 0);
  card.querySelector('.bk-rest i').style.width = `${left / rest * 100}%`;
  card.querySelector('.bk-rest-t').textContent = left > 0 ? say('rest', { s: Math.ceil(left) }) : '';
 };
 card.querySelectorAll('.bk-set').forEach(b => b.addEventListener('click', () => {
  const k = Number(b.dataset.k), j = Number(b.dataset.j);
  done[k][j] = !done[k][j]; b.classList.toggle('is-done', done[k][j]);
  if (done[k][j]) restUntil = Date.now() + rest * 1000;
  Alarms.set(`rest${card._key}`, done[k][j] ? restUntil : 0, { label: d.title || '' });
  paint();
 }));
 x.tick(() => { if (restUntil) { paint(); if (Date.now() > restUntil) { restUntil = 0; paint(); } } }, 250);
 x.after(paint);
};

// Readings over days (pressure, pulse, sugar, weight): dots and their range, the normal band, run through by the pointer.
KINDS.vitals = (card, d, x) => {
 const sets = d.series ? Object.entries(d.series) : [['', d.points || []]];
 let on = 0;
 card.innerHTML = `
  ${head({ title: d.title || d.metric, meta: '' }, sets.length > 1 ? tabs(sets.map(s => s[0]), 0) : '')}
  <div class="bk-row"><span class="bk-big bk-accent bk-v-now"></span><span class="bk-dim">${esc(d.unit || '')}</span><span class="bk-gap"></span><span class="bk-dim bk-small bk-v-at"></span></div>
  <div class="bk-dots" data-scrub><span class="bk-band"></span></div>
  ${d.normal ? `<div class="bk-src">${esc(say('normal', { lo: d.normal[0], hi: d.normal[1] }))}${d.source ? ` · ${source(typeof d.source === 'string' ? d.source : d.source.name)}` : ''}</div>` : foot(d)}`;
 const box = card.querySelector('.bk-dots');
 let sel = 0;
 const paint = () => {
  const pts = sets[on][1], vals = pts.flatMap(p => [p.v, p.v2].filter(v => v != null)), lo = Math.min(...vals, ...(d.normal || [])) - 5, hi = Math.max(...vals, ...(d.normal || [])) + 5;
  const y = v => (1 - (v - lo) / (hi - lo)) * 100;
  box.querySelectorAll('.bk-vp').forEach(n => n.remove());
  pts.forEach((p, k) => {
   const n = document.createElement('span');
   n.className = `bk-vp${k === sel ? ' is-on' : ''}`;
   n.style.left = `${pts.length > 1 ? k / (pts.length - 1) * 100 : 50}%`;
   n.style.top = `${y(p.v)}%`;
   n.style.height = p.v2 != null ? `${y(p.v2) - y(p.v)}%` : '0';
   box.append(n);
  });
  if (d.normal) { const band = box.querySelector('.bk-band'); band.style.top = `${y(d.normal[1])}%`; band.style.height = `${y(d.normal[0]) - y(d.normal[1])}%`; }
  const p = pts[sel] || {};
  card.querySelector('.bk-v-now').textContent = p.v2 != null ? `${num(p.v)}/${num(p.v2)}` : num(p.v);
  card.querySelector('.bk-v-at').textContent = p.at || '';
 };
 x.scrub(box, share => { const n = sets[on][1].length; sel = clamp(Math.round(share * (n - 1)), 0, n - 1); paint(); });
 x.tabs(k => { on = k; sel = sets[on][1].length - 1; paint(); });
 sel = sets[0][1].length - 1;
 x.after(paint);
};

// A price chart (a currency, a share, a coin): ranges as tabs, run through by the pointer; only shown, never advised.
KINDS.market = (card, d, x) => {
 const sets = Object.entries(d.series || {}), cur = d.currency || '';
 let on = clamp(sets.length - 1, 0, sets.length), pts = [];
 on = 0;
 card.innerHTML = `
  ${head({ title: d.name, meta: d.symbol })}
  <div class="bk-row"><span class="bk-big bk-m-now"></span><span class="bk-gap"></span><span class="bk-chip bk-m-ch">${lab('')}</span></div>
  <div class="bk-plot" data-scrub><svg class="bk-svg" preserveAspectRatio="none"></svg><span class="bk-tip"></span></div>
  ${sets.length > 1 ? tabs(sets.map(s => s[0]), 0) : ''}
  <div class="bk-src">${source([typeof d.source === 'string' ? d.source : d.source?.name, say('notAdvice')].filter(Boolean).join(' · '))}</div>`;
 const plot = card.querySelector('.bk-plot'), svg = card.querySelector('.bk-svg'), tip = card.querySelector('.bk-tip');
 const draw = () => {
  const vals = sets[on]?.[1] || [], w = svg.clientWidth, h = svg.clientHeight, up = vals.at(-1) >= vals[0];
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  card.classList.toggle('is-down', !up);
  pts = path(vals, w, h, 8);
  svg.innerHTML = `<path class="bk-area" d="${line(pts)}L${w} ${h}L0 ${h}Z"/><path class="bk-stroke" pathLength="1" d="${line(pts)}"/><circle class="bk-pdot" r="5"/>`;
  const ch = (vals.at(-1) - vals[0]) / vals[0] * 100;
  const chip = card.querySelector('.bk-m-ch');
  chip.className = `bk-chip bk-m-ch ${up ? 'is-good' : 'is-bad'}`;
  chip.querySelector('.bk-t').textContent = `${up ? '+' : '−'}${num(Math.abs(ch), 2)}%`;
  show(vals.length - 1);
 };
 const show = k => {
  const vals = sets[on]?.[1] || [], [px, py] = pts[k] || [0, 0], c = svg.querySelector('.bk-pdot');
  c.setAttribute('cx', px); c.setAttribute('cy', py);
  card.querySelector('.bk-m-now').textContent = money(vals[k], cur, vals[k] < 10 ? 4 : 2);
  tip.textContent = k === vals.length - 1 ? say('now') : `${sets[on][0]} · ${k + 1}/${vals.length}`;
  tip.style.left = `${clamp(px, 40, plot.clientWidth - 40)}px`;
 };
 x.scrub(plot, share => { const n = (sets[on]?.[1] || []).length; show(clamp(Math.round(share * (n - 1)), 0, n - 1)); });
 x.tabs(k => { on = k; draw(); });
 x.relayout(draw);
 x.after(draw);
};

// Spending by category: one bar of all of it, a category picked shows its share; what is left of the budget.
KINDS.spending = (card, d, x) => {
 const cats = d.categories || [], cur = d.currency || '', all = cats.reduce((s, c) => s + (Number(c.amount) || 0), 0), budget = Number(d.budget) || 0;
 let pick = -1;
 card.innerHTML = `
  ${head(d)}
  <div class="bk-row"><span class="bk-big bk-s-all"></span><span class="bk-gap"></span><span class="bk-dim bk-small bk-s-left"></span></div>
  <div class="bk-stack is-tall">${cats.map((c, k) => `<i data-k="${k}" style="flex:${c.amount};background:rgb(${tone(k)})"></i>`).join('')}</div>
  <div class="bk-cats">${cats.map((c, k) => `<button class="bk-cat" data-k="${k}" style="--tone:${tone(k)}"><span class="bk-sw-dot"></span><span class="bk-name">${esc(c.name)}</span><span class="bk-gap"></span><span class="bk-dim bk-c-share"></span><b>${esc(money(c.amount, cur))}</b></button>`).join('')}</div>
  ${foot(d)}`;
 const paint = () => {
  count(card.querySelector('.bk-s-all'), all, v => money(v, cur));
  card.querySelector('.bk-s-left').textContent = budget ? (budget >= all ? say('budgetLeft', { sum: money(budget - all, cur) }) : say('budgetOver', { sum: money(all - budget, cur) })) : '';
  card.querySelectorAll('.bk-stack i').forEach((s, k) => s.classList.toggle('is-dim', pick >= 0 && k !== pick));
  card.querySelectorAll('.bk-cat').forEach((row, k) => { row.classList.toggle('is-on', k === pick); row.querySelector('.bk-c-share').textContent = k === pick ? say('share', { p: Math.round(cats[k].amount / all * 100) }) : ''; });
 };
 card.querySelectorAll('.bk-cat, .bk-stack i').forEach(n => n.addEventListener('click', () => { const k = Number(n.dataset.k); pick = pick === k ? -1 : k; paint(); }));
 x.after(paint);
};

// A checklist: tap to tick, the count in the head, the bar under it.
KINDS.checklist = (card, d, x) => {
 const items = (d.items || []).map(it => typeof it === 'string' ? { text: it } : it);
 card.innerHTML = `
  ${head(d, '<div class="bk-meta bk-cl-n"></div>')}
  <div class="bk-mbar is-wide"><i></i></div>
  <div class="bk-ingr">${items.map((it, k) => `<button class="bk-ing${it.done ? ' is-done' : ''}" data-k="${k}"><span class="bk-check"></span><span class="bk-item-text"><span class="bk-name">${esc(it.text)}</span>${it.note ? `<span class="bk-meta">${esc(it.note)}</span>` : ''}</span></button>`).join('')}</div>
  ${foot(d)}`;
 const paint = () => {
  const n = card.querySelectorAll('.bk-ing.is-done').length;
  card.querySelector('.bk-cl-n').textContent = say('of', { n, all: items.length });
  card.querySelector('.bk-mbar i').style.width = `${items.length ? n / items.length * 100 : 0}%`;
 };
 card.querySelectorAll('.bk-ing').forEach(row => row.addEventListener('click', () => { row.classList.toggle('is-done'); paint(); }));
 x.after(paint);
};

// A build or a run of checks: a row per step with its state; a failed step opens to the end of its log.
KINDS.build = (card, d, x) => {
 const steps = d.steps || [];
 const MARK = { ok: '<svg viewBox="0 0 16 16" class="bk-mk is-ok"><circle cx="8" cy="8" r="7"/><path d="M4.9 8.3l2.1 2.1 4.1-4.6"/></svg>', fail: '<svg viewBox="0 0 16 16" class="bk-mk is-fail"><circle cx="8" cy="8" r="7"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"/></svg>', run: '<i class="bk-spin"></i>', wait: '<svg viewBox="0 0 16 16" class="bk-mk is-wait"><circle cx="8" cy="8" r="6.3"/></svg>' };
 const word = { ok: say('passedStep'), fail: say('failed'), run: say('running'), wait: say('waiting') };
 card.innerHTML = `
  ${head({ title: d.title || d.project, meta: d.branch })}
  <div class="bk-steps">${steps.map((s, k) => `<div class="bk-bstep is-${esc(s.state)}"><button class="bk-brow" data-k="${k}"${s.log ? '' : ' disabled'}>${MARK[s.state] || MARK.wait}<span class="bk-name">${esc(s.name)}</span><span class="bk-gap"></span><span class="bk-dim bk-small">${esc(s.time || word[s.state] || '')}</span></button>${s.log ? `<pre class="bk-log"${s.state === 'fail' ? '' : ' hidden'}>${esc(s.log)}</pre>` : ''}</div>`).join('')}</div>
  ${foot({ ...d, actions: d.actions || (steps.some(s => s.state === 'fail') ? [{ label: say('retry'), say: say('retry') }] : []) })}`;
 card.querySelectorAll('.bk-brow').forEach(b => b.addEventListener('click', () => { const log = b.parentElement.querySelector('.bk-log'); if (log) log.hidden = !log.hidden; }));
};

// A choice: options tapped, their votes as bars when there are votes; the button gives the choice to the agent.
KINDS.poll = (card, d, x) => {
 const opts = d.options || [], votes = opts.reduce((s, o) => s + (Number(o.votes) || 0), 0);
 let pick = -1;
 card.innerHTML = `
  ${head({ title: d.question || d.title, meta: votes ? say('votes', { n: votes }) : '' })}
  <div class="bk-opts">${opts.map((o, k) => `<button class="bk-opt" data-k="${k}"><span class="bk-opt-fill"></span><span class="bk-radio"></span><span class="bk-item-text"><span class="bk-name">${esc(o.text)}</span>${o.note ? `<span class="bk-meta">${esc(o.note)}</span>` : ''}</span><span class="bk-gap"></span>${votes ? `<b>${Math.round((o.votes || 0) / votes * 100)}%</b>` : ''}</button>`).join('')}</div>
  <div class="bk-acts"><button class="bk-btn is-main" data-do="choose" disabled>${lab(say('choose'))}</button></div>
  ${foot({ ...d, actions: [] })}`;
 const paint = () => {
  card.querySelectorAll('.bk-opt').forEach((row, k) => { row.classList.toggle('is-on', k === pick); row.querySelector('.bk-opt-fill').style.width = votes ? `${(opts[k].votes || 0) / votes * 100}%` : '0'; });
  card.querySelector('[data-do="choose"]').disabled = pick < 0;
 };
 card.querySelectorAll('.bk-opt').forEach(row => row.addEventListener('click', () => { pick = Number(row.dataset.k); paint(); }));
 x.on('[data-do="choose"]', () => pick >= 0 && x.act(`${d.choosePrefix || ''}${opts[pick].text}`));
 x.after(paint);
};

// The tools a kind builds with: events bound inside the card, ticks that run only while it is on the page.
function tools(card) {
 const ticks = card._ticks = [], afters = [];
 card._relayout = [];
 // The white pill of each row of tabs stands under the tab that is on, and slides when another is picked; the first
 // time it is put in place without sliding.
 const pills = (still = false) => card.querySelectorAll('.bk-tabs').forEach(group => {
  const on = group.querySelector('.bk-tab.is-on'), pill = group.querySelector('.bk-tabs-pill');
  if (!pill) return;
  if (still) pill.style.transition = 'none';
  pill.style.left = on ? `${on.offsetLeft}px` : '3px';
  pill.style.width = on ? `${on.offsetWidth}px` : '0px';
  if (still) { void pill.offsetWidth; pill.style.transition = ''; }
 });
 card._pills = pills;
 afters.push(() => pills(true));
 const x = {
  on: (sel, fn) => card.querySelectorAll(sel).forEach(n => n.addEventListener('click', () => fn(n))),
  tabs: fn => card.querySelectorAll('.bk-tabs').forEach(group => group.querySelectorAll('.bk-tab').forEach(t => t.addEventListener('click', () => { group.querySelectorAll('.bk-tab').forEach(o => o.classList.toggle('is-on', o === t)); fn(Number(t.dataset.tab)); pills(); }))),
  // The value of a stepper blinks through its change, so the eye sees it moved.
  stepper: fn => card.querySelectorAll('.bk-step [data-step]').forEach(b => b.addEventListener('click', () => {
   const v = b.parentElement.querySelector('.bk-step-v');
   v?.classList.add('is-blink');
   fn(Number(b.dataset.step));
   requestAnimationFrame(() => requestAnimationFrame(() => v?.classList.remove('is-blink')));
  })),
  relayout: fn => card._relayout.push(fn),
  pills: () => pills(),
  range: (name, fn) => { const r = card.querySelector(`[data-range="${name}"]`); if (!r) return; const fill = () => r.style.setProperty('--fill', `${(r.value - r.min) / (r.max - r.min || 1) * 100}%`); fill(); r.addEventListener('input', () => { fill(); fn(Number(r.value)); }); },
  input: (sel, fn) => { const i = card.querySelector(sel); i?.addEventListener('input', () => { const v = Number(i.value.replace(/\s/g, '').replace(',', '.')); if (Number.isFinite(v)) fn(v); }); },
  scrub: (area, fn) => { const go = e => { const r = area.getBoundingClientRect(); fn(clamp((e.clientX - r.left) / r.width, 0, 0.9999)); }; area.addEventListener('pointermove', go); area.addEventListener('pointerdown', e => { area.setPointerCapture?.(e.pointerId); go(e); }); },
  tick: (fn, every) => ticks.push({ fn, every }),
  after: fn => afters.push(fn),
  // What the card holds that must outlive it (a timer's start): the chat writes it into its message. `changed`:
  // there is something new to write; without it the chat only learns whose the card is.
  state: (data, changed = true) => { card.data = data; card.dispatchEvent(new CustomEvent('block-state', { bubbles: true, detail: { data, changed, kind: card.kind } })); },
  act: text => card.dispatchEvent(new CustomEvent('block-say', { bubbles: true, detail: { text } })),
  link: url => card.dispatchEvent(new CustomEvent('block-link', { bubbles: true, detail: { url } })),
 };
 card.addEventListener('click', e => {
  const s = e.target.closest('[data-say]'), l = e.target.closest('[data-link]');
  if (s && card.contains(s)) x.act(s.dataset.say);
  if (l && card.contains(l)) x.link(l.dataset.link);
 });
 // A source's link is text, not a button: Enter opens it as a click does.
 card.addEventListener('keydown', e => { const l = e.key === 'Enter' && e.target.closest?.('.bk-src-link'); if (l) { e.preventDefault(); x.link(l.dataset.link); } });
 return { x, afters };
}

class BlockCard extends HTMLElement {
 connectedCallback() {
  if (!this.built) this.build();
  this.start();
  // A new width (the window, the mini chat, a split): charts are drawn again and the tab pills put in place.
  let width = this.clientWidth;
  this._watch = new ResizeObserver(() => {
   if (Math.abs(this.clientWidth - width) < 1) return;
   width = this.clientWidth;
   this._pills?.(true);
   (this._relayout || []).forEach(fn => fn());
  });
  this._watch.observe(this);
 }
 disconnectedCallback() { this.stop(); this._watch?.disconnect(); }
 build() {
  this.built = true;
  this.kind = this.getAttribute('kind') || '';
  let data = {};
  try { data = JSON.parse(this.dataset.json || '{}'); } catch {}
  this.data = data;
  const make = KINDS[this.kind];
  // The kind is read from the attribute (og-block[kind="…"]), never from a class: a class named after a kind would
  // also be the name of some part inside another card.
  if (data.accent) this.style.setProperty('--bk-accent', data.accent);
  if (!make) { this.innerHTML = `<div class="bk-src">${esc(this.kind)}</div>`; return; }
  this._new = this.hasAttribute('fresh');
  this._fresh = this._new && !reduced();
  this._key = Math.random().toString(36).slice(2, 8);
  const { x, afters } = tools(this);
  try { make(this, data, x); } catch (error) { this.innerHTML = `<div class="bk-src">${esc(this.kind)}: ${esc(error.message)}</div>`; return; }
  // A new card unfolds from its top edge (a clip, not a move: nothing in it is put on a layer that would settle by a
  // pixel at the end on a fractional screen scale), its numbers run up from nought and its bars grow.
  if (this._fresh) {
   this.animate([{ clipPath: 'inset(0 0 calc(100% - 22px) 0 round 26px)' }, { clipPath: 'inset(0 0 0 0 round 26px)' }], { duration: MOTION.unfold, easing: MOTION.ease });
   this.classList.add('is-fresh');
   requestAnimationFrame(() => requestAnimationFrame(() => { afters.forEach(fn => fn()); this.classList.remove('is-fresh'); setTimeout(() => { this._fresh = false; }, MOTION.unfold); }));
  } else afters.forEach(fn => fn());
 }
 start() {
  this.stop();
  this._timers = (this._ticks || []).map(t => { t.fn(); return setInterval(() => t.fn(), t.every); });
 }
 stop() { (this._timers || []).forEach(clearInterval); this._timers = []; }
}
if (!customElements.get('og-block')) customElements.define('og-block', BlockCard);

// Makes the card for a kind and its data; fresh: it unfolds as it comes.
function make(kind, data, fresh = false) {
 const el = document.createElement('og-block');
 el.setAttribute('kind', kind);
 el.dataset.json = JSON.stringify(data || {});
 if (fresh) el.setAttribute('fresh', '');
 return el;
}

// A kind from another file (blocks-pitch.js): its build gets the same tools as the kinds here.
const add = (kind, build) => { KINDS[kind] = build; };
window.Blocks = { get KINDS() { return Object.keys(KINDS); }, add, make, scan, rewrite, known, parse, fromFields, keep, settle, fenceOf, Alarms };
})();
