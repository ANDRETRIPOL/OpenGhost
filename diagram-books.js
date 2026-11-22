(() => {
'use strict';
// Drawings for bookkeeping and tax, in any country: an invoice, a bank statement sorted line by line, journal entries
// and T-accounts, a reconciliation, documents matched with payments, a trial balance, a balance sheet or a profit and
// loss statement, a tax worked out, and debts by how long they are overdue.
// Nothing here knows a country. Accounts, documents, taxes and words are what the model writes; a drawing gives the
// form, writes the money the way the country of its currency does, and checks the sums: a figure that does not add
// up is shown as written, with a mark and what it should have been, never put right in silence.

const D = window.Diagram;
if (!D?.kit) return;
const { FONT, STATE, clamp, widthOf, truncate, wrap, caps, capsWidth, titleOf, bare, cellsOf, indentOf, unquote } = D.kit;
const t = (key, params) => I18n.t(`books.${key}`, params);

const BOOKS = { max: 720, head: 30, row: 30, line: 22, gap: 16, mark: 8 };
// How old a debt is, from the lightest step of the colour to the full one.
const AGES = 5;

/* Money */

// A side written after an amount: debit or credit, in the words and letters bookkeepers use for them.
const SIDE = /\s*(?<![\p{L}])(Dr|Db|Deb|D|Д|Дт|Cr|Cred|C|К|Кт|Kt)\.?$/u, DEBIT_SIDE = /^(Dr|Db|Deb|D|Д|Дт)$/u;
// Signs and short names of currencies that may stand before or after an amount.
const SYMBOLS = /R\$|US\$|C\$|A\$|NZ\$|HK\$|S\$|MX\$|[$€£¥₽₹₩₺₴₸₦₱₫₪₡₲₵₭₮฿₼₾֏]|zł|Kč|kr\.?|Fr\.?|руб\.?|р\.|грн\.?|сом|сум|тг|лв\.?|Ft|lei/gu;
const CODE = /(?<![\p{L}])[A-Z]{3}(?![\p{L}])/gu;
const DATE = /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\/\d{1,2}|\d{1,2}[./]\d{4}|\d{4}[./]\d{1,2}|\d{1,2}\s+\p{L}{3,}\.?(?:\s+\d{2,4})?|\p{L}{3,}\.?\s+\d{1,2}(?:,?\s+\d{4})?)$/u;

// The value of a number written with this mark before its decimals ('' when the drawing does not say). Groups of
// thousands may be parted by spaces, dots, commas or apostrophes.
function digitsValue(s, style) {
 const d = s.replace(/[\s  '’]/g, ''), comma = d.lastIndexOf(','), dot = d.lastIndexOf('.');
 let dec = '';
 if (comma >= 0 && dot >= 0) dec = comma > dot ? ',' : '.';
 else if (comma >= 0 || dot >= 0) {
  const c = comma >= 0 ? ',' : '.', parts = d.split(c);
  // 1.234.567 is thousands; 12,5 and 12,50 are decimals; 1.234 or 1,234 is what the rest of the drawing makes it.
  if (parts.length === 2) dec = parts[1].length !== 3 || style === c ? c : '';
 }
 const at = dec ? d.lastIndexOf(dec) : -1, whole = (at >= 0 ? d.slice(0, at) : d).replace(/[.,]/g, ''), part = at >= 0 ? d.slice(at + 1) : '';
 return /^\d+$/.test(whole) && /^\d*$/.test(part) ? parseFloat(`${whole}.${part || 0}`) : NaN;
}

// An amount as people write it: 1.234,56 · 1,234.56 · 1 234,56 · (1 234,56) · -R$ 1.234,56 · 1.234,56- · 12 608,00 Кт.
// Gives its value and the side written after it, or null for what is not an amount (a date, a code, words).
function readMoney(raw, style = '') {
 let s = String(raw ?? '').trim().replace(/[−–]/g, '-'), neg = false, side = '';
 if (!s || DATE.test(s) || !/\d/.test(s)) return null;
 const sm = SIDE.exec(s);
 if (sm && /\d/.test(s.slice(0, sm.index))) { side = DEBIT_SIDE.test(sm[1]) ? 'd' : 'c'; s = s.slice(0, sm.index).trim(); }
 if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
 const sign = () => { if (/^[+-]/.test(s)) { neg = neg || s[0] === '-'; s = s.slice(1).trim(); } };
 sign();
 s = s.replace(CODE, ' ').replace(SYMBOLS, ' ').trim();
 sign();
 if (/-$/.test(s)) { neg = true; s = s.slice(0, -1).trim(); }
 if (!/^\d[\d\s  .,'’]*$/.test(s)) return null;
 const value = digitsValue(s, style);
 return Number.isFinite(value) ? { value: neg ? -value : value, side } : null;
}

// Which mark a drawing puts before its decimals: the one its locale uses, else the one its amounts show.
function styleOf(texts, locale) {
 if (locale) try { return new Intl.NumberFormat(locale).formatToParts(1.5).find(p => p.type === 'decimal')?.value || ''; } catch {}
 let comma = 0, dot = 0;
 for (const raw of texts) {
  const s = String(raw ?? '').replace(SIDE, '').replace(/[)\-\s]+$/, '');
  if (/\d,\d{1,2}$/.test(s) || /\d\.\d{3},\d/.test(s)) comma++;
  else if (/\d\.\d{1,2}$/.test(s) || /\d,\d{3}\.\d/.test(s)) dot++;
 }
 return comma > dot ? ',' : dot > comma ? '.' : '';
}

// Money written the way the country of its locale writes it: its groups, its decimal mark, as many decimals as the
// currency has (none for yen, three for the Kuwaiti dinar), and a negative in brackets where bookkeepers there do
// so. The sign of the currency is said once for the whole drawing, not after every number.
function moneyOf(locale, currency) {
 let nf = null, code = '';
 if (currency) try { nf = new Intl.NumberFormat(locale || undefined, { style: 'currency', currency, currencySign: 'accounting' }); code = currency; } catch {}
 if (!nf) try { nf = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch { nf = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
 const digits = nf.resolvedOptions().maximumFractionDigits, unit = 10 ** digits;
 const round = v => Math.round(v * unit) / unit;
 const text = value => {
  const parts = nf.formatToParts(round(value) || 0);
  let s = '';
  parts.forEach((p, i) => {
   if (p.type === 'currency') return;
   if (p.type === 'literal' && /^[\s  ]+$/.test(p.value) && (parts[i - 1]?.type === 'currency' || parts[i + 1]?.type === 'currency')) return;
   s += p.type === 'minusSign' ? '−' : p.value;
  });
  return s.trim();
 };
 const symbol = code ? nf.formatToParts(1).find(p => p.type === 'currency')?.value || code : '';
 // For a spreadsheet: the same decimals and decimal mark, without groups, a plain minus and plain digits.
 let flat;
 try { flat = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false, numberingSystem: 'latn' }); }
 catch { flat = new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }); }
 const cell = value => flat.format(round(value) || 0).replace(/[−]/g, '-');
 return { text, cell, code, symbol, digits, round, same: (a, b) => Math.abs(a - b) < 0.5 / unit, signed: v => round(v) > 0 ? `+${text(v)}` : text(v) };
}

/* Reading */

// The lines every one of these drawings may open with, each a lower-case word: a row that only starts with the same
// word in capitals (Tax consulting | 1 200,00) stays a row.
const COMMON = /^(title|currency|locale|rate|note)(?:\s*:\s*|\s+)(.+)$/;

function blank() { return { title: '', currency: '', locale: '', rate: '', note: '', cols: [] }; }

function common(line, data) {
 const m = COMMON.exec(line);
 if (!m || (line.includes('|') && m[1] !== 'note')) return false;
 const value = unquote(m[2]);
 if (m[1] === 'currency') data.currency = /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : '';
 else if (m[1] === 'locale') { try { data.locale = Intl.getCanonicalLocales(value)[0] || ''; } catch { data.locale = ''; } }
 else data[m[1]] = value;
 return true;
}

// A line of headings, `cols A | B | C`, or the names of two sides.
function listLine(line, word) {
 const m = new RegExp(`^${word}(?:\\s*:\\s*|\\s+)(.+)$`).exec(line);
 return m ? cellsOf(m[1]).map(unquote) : null;
}

// Amounts are read once all the lines are in: only then is it known which mark the drawing puts before decimals.
function finish(data, texts) {
 data.style = styleOf(texts, data.locale);
 data.money = moneyOf(data.locale, data.currency);
 data.rtl = /^(ar|he|fa|ur|ps|yi|dv|ckb)(?:-|$)/i.test(data.locale) || /[֐-ࣿ]/.test(data.title);
 const read = text => readMoney(text, data.style);
 return read;
}

const isMoney = (text, style) => !!readMoney(text, style);
const dateLike = text => DATE.test(String(text ?? '').trim());
// The date of a line: the cell that looks like one. A day and month with a dot and no year (03.10, as Ukraine, Poland
// or Germany write it) reads as a number too; it is the date when it opens the line, is a day and a month, and other
// cells of the line hold numbers (the amount).
const DAY_MONTH = /^(\d{1,2})\.(\d{1,2})$/;
function dateAt(cells) {
 const d = cells.findIndex(dateLike);
 if (d >= 0) return d;
 const m = DAY_MONTH.exec(String(cells[0] ?? '').trim());
 return m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12 && cells.slice(1).some(cell => /\d/.test(cell)) ? 0 : -1;
}

/* Parts */

const label = (key, order, x, y, text, anchor = 'start', cls = 'dg-row-name', more = {}) => ({ key, type: 'label', order, props: { x, y }, fixed: { lines: Array.isArray(text) ? text : [text], anchor, cls, ...more } });
const rule = (key, order, x1, y, x2, cls = 'dg-grid') => ({ key, type: 'line', layer: 'back', order, props: { x1, y1: y, x2, y2: y }, fixed: { cls, draw: true } });
const upright = (key, order, x, y1, y2, cls = 'dg-line') => ({ key, type: 'line', layer: 'back', order, props: { x1: x, y1, x2: x, y2 }, fixed: { cls, draw: true } });
const hit = (key, order, y, h, W) => ({ key, type: 'hit', layer: 'back', order, props: { x: -8, y, w: W + 16, h }, fixed: {} });
const dot = (key, order, x, y, cls, tone, r = 3.5) => ({ key, type: 'dot', order, props: { x, y, r }, fixed: { cls, tone } });

// The mark a list of checks gives a row: a ring in the colour of how it stands, with its sign.
function mark(items, key, order, x, y, state, R = BOOKS.mark) {
 items.push({ key: `${key}:m`, type: 'dot', layer: 'nodes', order, props: { x, y, r: R }, fixed: { cls: `dg-check-mark is-${state}` } });
 const icon = STATE.find(([s]) => s === state)?.[2];
 if (icon) items.push({ key: `${key}:i`, type: 'wglyph', order: order + 0.05, props: { x, y, s: R * 1.5 }, fixed: { icon, cls: `dg-check-icon is-${state}` } });
}

// The last line of a drawing that checked its sums: they add up, or by how much they do not.
function verdict(items, order, y, W, ok, text) {
 mark(items, 'vd', order, BOOKS.mark, y + BOOKS.mark + 2, ok ? 'good' : 'bad');
 items.push(label('vd:t', order + 0.1, BOOKS.mark * 2 + 10, y + BOOKS.mark + 2, truncate(text, W - BOOKS.mark * 2 - 10, ...FONT.step), 'start', 'dg-step-text'));
 return BOOKS.mark * 2 + 8;
}

// The opening of every drawing: its title, then what its money is in, a rate or a note on one quiet line.
function opening(data, W) {
 const items = [], tips = new Map();
 let top = 0, corner = null;
 if (data.title) {
  const title = titleOf(data.title, W - 80);
  items.push(title.item);
  top = BOOKS.head;
  corner = { x: title.width + 16, h: 28 };
 }
 const money = data.money, unit = money.code ? (money.symbol && money.symbol !== money.code ? `${money.code} · ${money.symbol}` : money.code) : '';
 const said = [unit && t('amountsIn', { unit }), data.rate, data.note].filter(Boolean).join(' · ');
 if (said) {
  const y = data.title ? top - 2 : 8;
  items.push(label('hd:said', 0.1, 0, y, truncate(said, W, ...FONT.tick), 'start', 'dg-row-note'));
  top = y + 18;
 }
 return { items, tips, top, corner };
}

// A figure that does not add up: the number as written stays, a mark beside it, and the pointer on its row tells
// what it should have been.
function off(items, tips, key, order, x, y, shown, counted, money, hitKey) {
 items.push(dot(`${key}:off`, order, x - widthOf(shown, FONT.amount) - 9, y, 'dg-state is-bad'));
 const tip = { title: t('offTitle'), rows: [{ name: t('stated'), value: shown }, { name: t('counted'), value: money.text(counted) }], hot: [hitKey] };
 tips.set(hitKey, tip);
}

// A drawing written right to left, in Arabic or Hebrew, is laid out as its mirror: names on the right, numbers on the left.
function mirror(scene) {
 const W = scene.width;
 for (const item of scene.items) {
  const p = item.props, fx = item.fixed;
  // Each line takes its order of words from its own first letter, so a rate, 15%, stays where Arabic puts it.
  if (item.type === 'label') { p.x = W - p.x; fx.anchor = fx.anchor === 'start' ? 'end' : fx.anchor === 'end' ? 'start' : fx.anchor; fx.cls = `${fx.cls || 'dg-text'} is-rtl`; }
  else if (item.type === 'line') { p.x1 = W - p.x1; p.x2 = W - p.x2; }
  else if (item.type === 'hit' || item.type === 'rect' || item.type === 'span') { p.x = W - p.x - p.w; if (item.type === 'span') fx.back = !fx.back; }
  else if (item.type === 'dot' || item.type === 'wglyph') p.x = W - p.x;
  else if (item.type === 'edge') p.pts = p.pts.map((v, i) => i % 2 ? v : W - v);
 }
 scene.corner = null;
 return scene;
}

// The rows of a drawing as a table to paste into a spreadsheet: cells parted by tabs, rows by line breaks.
const tsv = rows => rows.map(row => row.map(cell => String(cell ?? '').replace(/[\t\r\n]+/g, ' ').trim()).join('\t')).join('\n');

function scene(kind, data, W, height, start, extra = {}) {
 const result = { kind, width: W, height, items: start.items, tips: start.tips, corner: start.corner, flush: true, ...extra };
 return data.rtl ? mirror(result) : result;
}

// An account written with its number first, 1.1.1.02 Banco Itaú or 60.01 Поставщики: the number set apart and quiet.
function accountParts(text) {
 const m = /^([\d][\d.\-/]*\d|\d+)\s+(.+)$/.exec(String(text).trim());
 return m ? { code: m[1], name: m[2] } : { code: '', name: String(text).trim() };
}

function account(items, key, order, x, y, text, max, cls = 'dg-row-name') {
 const { code, name } = accountParts(text);
 if (!code) { items.push(label(key, order, x, y, truncate(name, max, ...FONT.row), 'start', cls)); return; }
 const codeW = widthOf(code, FONT.small);
 if (codeW + 30 > max) { items.push(label(key, order, x, y, truncate(code, max, ...FONT.small), 'start', 'dg-books-code')); return; }
 items.push(label(`${key}:c`, order, x, y, code, 'start', 'dg-books-code'));
 items.push(label(key, order + 0.01, x + codeW + 7, y, truncate(name, max - codeW - 7, ...FONT.row), 'start', cls));
}

/* Invoice: any bill of sale, whatever a country calls it */

const INVOICE = /^(number|no|date|from|seller|supplier|issuer|to|buyer|customer|client|period|due|status|total|payable|tax|withheld|withholding|discount)(?:\s*:\s*|\s+)(.*)$/;
const INCLUDED = /^(?:included|incl\.?|inclus[oa]?|incluido|включ\S*|в т\.\s?ч\.?|compris|inclus|inkl\.?|enthalten)$/iu;
const PAID = /^(?:paid|pago|paga|оплач\S*|payée?|pagat[oa]|bezahlt|liquidad[oa])/iu;
const VOID = /^(?:cancel+ed|void|cancelad[oa]|отмен\S*|аннулир\S*|annulée?|annullat[oa]|storniert|anulad[oa]|overdue|vencid[oa]|просроч\S*|en retard|scadut[oa]|überfällig)/iu;
const UNSURE = /^(?:not verified|unverified|não verificad[oa]|no verificad[oa]|не провер\S*|non vérifiée?|non verificat[oa]|ungeprüft|pending|pendente|pendiente)/iu;
const moodOf = text => PAID.test(text) ? 'good' : VOID.test(text) ? 'bad' : UNSURE.test(text) ? 'warn' : 'open';

function parseInvoice(lines) {
 const data = { ...blank(), number: '', date: '', period: '', due: '', status: '', from: null, to: null, rows: [], taxes: [], held: [], discounts: [], total: '', payable: '' };
 const texts = [];
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  if (!line || common(line, data)) continue;
  const cols = listLine(line, 'cols');
  if (cols) { data.cols = cols; continue; }
  const m = INVOICE.exec(line);
  if (m) {
   const key = m[1], cells = cellsOf(m[2]).map(unquote);
   if (key === 'number' || key === 'no') { data.number = cells[0]; if (cells[1]) data.date ||= cells[1]; }
   else if (key === 'date' || key === 'period' || key === 'due') data[key] = cells.join(' · ');
   else if (key === 'status') data.status = cells[0];
   else if (/^(from|seller|supplier|issuer)$/.test(key)) data.from = { name: cells[0], more: cells.slice(1).filter(Boolean) };
   else if (/^(to|buyer|customer|client)$/.test(key)) data.to = { name: cells[0], more: cells.slice(1).filter(Boolean) };
   else if (key === 'total' || key === 'payable') { data[key] = cells[cells.length - 1]; texts.push(data[key]); }
   else {
    const list = key === 'tax' ? data.taxes : key === 'discount' ? data.discounts : data.held;
    const flags = cells.slice(1).filter(cell => INCLUDED.test(cell)), rest = cells.slice(1).filter(cell => !INCLUDED.test(cell));
    list.push({ name: cells[0], amount: rest.find(Boolean) || '', included: flags.length > 0 });
    texts.push(...rest);
   }
   continue;
  }
  const cells = cellsOf(line).map(unquote);
  if (cells.length < 2 || !cells[0]) continue;
  data.rows.push({ name: cells[0], cells: cells.slice(1) });
  texts.push(...cells.slice(1));
 }
 const read = finish(data, texts), num = text => read(text)?.value;
 // A row is a name and then its amount, or how many, the price of one and the amount; 2 × 500,00 says both at once.
 for (const row of data.rows) {
  const values = [], notes = [];
  for (const cell of row.cells) {
   const times = /^(.+?)\s*[×xх*]\s*(.+)$/u.exec(cell);
   if (times && Number.isFinite(num(times[1])) && Number.isFinite(num(times[2]))) values.push(num(times[1]), num(times[2]));
   else if (Number.isFinite(num(cell))) values.push(num(cell));
   else if (cell) notes.push(cell);
  }
  row.amount = values.length ? values[values.length - 1] : NaN;
  if (values.length >= 3) { row.qty = values[values.length - 3]; row.price = values[values.length - 2]; }
  else if (values.length === 2) row.qty = values[0];
  row.note = notes.join(' · ');
 }
 data.rows = data.rows.filter(row => Number.isFinite(row.amount));
 const percent = text => { const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(text); return m ? parseFloat(m[1].replace(',', '.')) / 100 : NaN; };
 const sub = data.rows.reduce((s, row) => s + row.amount, 0);
 for (const d of data.discounts) d.value = Math.abs(num(d.amount) ?? NaN) || sub * (percent(d.name) || 0);
 const base = sub - data.discounts.reduce((s, d) => s + (d.value || 0), 0);
 for (const list of [data.taxes, data.held]) for (const item of list) {
  const stated = num(item.amount);
  item.value = Number.isFinite(stated) ? Math.abs(stated) : Number.isFinite(percent(item.name)) ? base * percent(item.name) : NaN;
  item.computed = !Number.isFinite(stated);
 }
 data.sub = sub;
 data.gross = base + data.taxes.filter(x => !x.included && Number.isFinite(x.value)).reduce((s, x) => s + x.value, 0);
 data.net = data.gross - data.held.filter(x => Number.isFinite(x.value)).reduce((s, x) => s + x.value, 0);
 data.statedTotal = num(data.total);
 data.statedPayable = num(data.payable);
 return data.rows.length || data.number || data.from ? data : null;
}

function invoiceScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, BOOKS.max), money = data.money, start = opening(data, W), { items, tips } = start;
 let y = start.top + 4;
 const problems = [];
 // The document itself: its number strong, how it stands on the right, its dates under it.
 if (data.number || data.status) {
  const mood = data.status ? moodOf(data.status) : '', statusW = data.status ? widthOf(data.status, FONT.value) + 14 : 0;
  if (data.number) items.push(label('iv:no', 0.2, 0, y + 8, truncate(data.number, W - statusW - 16, ...FONT.strong), 'start', 'dg-row-total'));
  if (data.status) {
   items.push(dot('iv:mood', 0.22, W - statusW + 3.5, y + 8, `dg-state is-${mood}`));
   items.push(label('iv:status', 0.23, W, y + 8, data.status, 'end', 'dg-value'));
  }
  y += 18;
 }
 const when = [data.date, data.period && `${t('period')} ${data.period}`, data.due && `${t('due')} ${data.due}`].filter(Boolean).join(' · ');
 if (when) { items.push(label('iv:when', 0.25, 0, y + 6, truncate(when, W, ...FONT.tick), 'start', 'dg-row-note')); y += 18; }
 // Who issued it and to whom, side by side where there is room, one under the other where there is not.
 const parties = [[data.from, t('from')], [data.to, t('to')]].filter(([party]) => party);
 if (parties.length) {
  y += 10;
  const side = W >= 420 && parties.length > 1, colW = side ? (W - BOOKS.gap * 2) / 2 : W;
  let low = y;
  parties.forEach(([party, word], k) => {
   const x0 = side ? k * (colW + BOOKS.gap * 2) : 0, y0 = side ? y : low, order = 0.3 + k * 0.1;
   items.push(label(`iv:p${k}:w`, order, x0, y0 + 6, caps(word, colW), 'start', 'dg-eyebrow'));
   items.push(label(`iv:p${k}:n`, order + 0.02, x0, y0 + 24, truncate(party.name, colW, ...FONT.strong), 'start', 'dg-row-total'));
   const more = party.more.flatMap(text => wrap(text, colW, ...FONT.tick)).slice(0, 3);
   if (more.length) items.push(label(`iv:p${k}:m`, order + 0.04, x0, y0 + 36, more, 'start', 'dg-row-note', { baseline: 'below', lineHeight: 15 }));
   low = Math.max(low, y0 + 40 + more.length * 15);
   if (!side) low += 8;
  });
  y = low + 4;
 }
 // The rows: what was sold, how many and at what price when that is said, and the amount.
 if (data.rows.length) {
  y += 6;
  items.push(rule('iv:r0', 0.4, 0, y, W, 'dg-line'));
  const counted = data.rows.some(row => Number.isFinite(row.qty)), priced = data.rows.some(row => Number.isFinite(row.price));
  const [hDesc, hQty, hPrice, hAmount] = [data.cols[0] || t('item'), data.cols[1] || t('qty'), data.cols[2] || t('price'), data.cols[data.cols.length - 1] || t('amount')];
  const qtyText = row => Number.isFinite(row.qty) ? new Intl.NumberFormat(data.locale || undefined, { maximumFractionDigits: 3 }).format(row.qty) : '';
  const amountW = Math.max(capsWidth(hAmount.toUpperCase()), ...data.rows.map(row => widthOf(money.text(row.amount), FONT.amount))) + 4;
  const priceW = priced ? Math.max(capsWidth(hPrice.toUpperCase()), ...data.rows.map(row => Number.isFinite(row.price) ? widthOf(money.text(row.price), FONT.amount) : 0)) + 4 : 0;
  const qtyW = counted ? Math.max(capsWidth(hQty.toUpperCase()), ...data.rows.map(row => widthOf(qtyText(row), FONT.amount))) + 4 : 0;
  const xAmount = W, xPrice = W - amountW - BOOKS.gap, xQty = xPrice - (priced ? priceW + BOOKS.gap : 0), nameW = (counted ? xQty - qtyW : priced ? xPrice - priceW : xAmount - amountW) - BOOKS.gap;
  y += 14;
  items.push(label('iv:h:d', 0.42, 0, y, caps(hDesc, nameW), 'start', 'dg-eyebrow'));
  if (counted) items.push(label('iv:h:q', 0.42, xQty, y, caps(hQty, qtyW), 'end', 'dg-eyebrow'));
  if (priced) items.push(label('iv:h:p', 0.42, xPrice, y, caps(hPrice, priceW), 'end', 'dg-eyebrow'));
  items.push(label('iv:h:a', 0.42, xAmount, y, caps(hAmount, amountW), 'end', 'dg-eyebrow'));
  y += 10;
  data.rows.forEach((row, i) => {
   const order = 0.45 + i * 0.08, key = `iv:l${i}`, names = wrap(row.name, nameW, ...FONT.row).slice(0, 2), note = row.note ? truncate(row.note, nameW, ...FONT.tick) : '';
   // Text hung from its top has its middle 7 below it: the numbers stand level with the first line of the name.
   const h = 12 + names.length * 18 + (note ? 15 : 0), cy = y + 6 + 7;
   items.push(hit(key, order, y, h, W));
   tips.set(key, { silent: true });
   if (i) items.push(rule(`${key}:r`, order, 0, y, W));
   items.push(label(`${key}:n`, order, 0, y + 6, names, 'start', 'dg-row-name', { baseline: 'below', lineHeight: 18 }));
   if (note) items.push(label(`${key}:o`, order + 0.01, 0, y + 6 + names.length * 18, note, 'start', 'dg-row-note', { baseline: 'below', lineHeight: 15 }));
   if (counted) items.push(label(`${key}:q`, order + 0.02, xQty, cy, qtyText(row), 'end', 'dg-row-note'));
   if (Number.isFinite(row.price)) items.push(label(`${key}:p`, order + 0.03, xPrice, cy, money.text(row.price), 'end', 'dg-row-note'));
   const shown = money.text(row.amount);
   items.push(label(`${key}:a`, order + 0.04, xAmount, cy, shown, 'end', 'dg-row-value'));
   if (Number.isFinite(row.price) && Number.isFinite(row.qty) && !money.same(row.qty * row.price, row.amount)) {
    off(items, tips, key, order + 0.05, xAmount, cy, shown, row.qty * row.price, money, key);
    problems.push(row.qty * row.price - row.amount);
   }
   y += h;
  });
  items.push(rule('iv:r1', 0.6, 0, y, W, 'dg-line'));
 }
 // The sums, on the right: what the rows come to, what is taken off and added, the total, what is withheld, and
 // what is to be paid, the one figure set large.
 const sums = [], plain = !data.discounts.length && !data.taxes.length && !data.held.length;
 if (!plain) sums.push({ name: t('subtotal'), value: data.sub });
 for (const d of data.discounts) sums.push({ name: d.name, value: -(d.value || 0), sign: true });
 for (const x of data.taxes) sums.push({ name: x.included ? `${x.name} · ${t('included')}` : x.name, value: x.value, sign: !x.included, quiet: x.included });
 sums.push({ name: data.held.length ? t('gross') : t('total'), value: data.gross, strong: true, stated: data.statedTotal });
 for (const x of data.held) sums.push({ name: x.name, value: -(x.value || 0), sign: true });
 if (data.held.length || Number.isFinite(data.statedPayable)) sums.push({ name: t('payable'), value: data.net, big: true, stated: data.statedPayable });
 else sums[sums.length - 1].big = true;
 const sx = Math.min(W * 0.42, Math.max(0, W - 340));
 y += 8;
 sums.forEach((row, i) => {
  const order = 0.65 + i * 0.06, key = `iv:s${i}`, h = row.big ? 34 : 24, cy = y + h / 2;
  if (row.big && i) { items.push(rule(`${key}:r`, order, sx, y + 1, W)); }
  const shown = Number.isFinite(row.stated) ? money.text(row.stated) : Number.isFinite(row.value) ? (row.sign ? money.signed(row.value) : money.text(row.value)) : '—';
  items.push(hit(key, order, y, h, W));
  tips.set(key, { silent: true });
  items.push(label(`${key}:n`, order, sx, cy, truncate(row.name, W - sx - 130, ...(row.big || row.strong ? FONT.strong : FONT.row)), 'start', row.big || row.strong ? 'dg-row-total' : row.quiet ? 'dg-row-note' : 'dg-row-name'));
  items.push(label(`${key}:v`, order + 0.02, W, cy, shown, 'end', row.big ? 'dg-books-figure' : row.strong ? 'dg-row-total' : row.quiet ? 'dg-row-note' : 'dg-row-value'));
  if (Number.isFinite(row.stated) && !money.same(row.stated, row.value)) {
   items.push(dot(`${key}:off`, order + 0.03, W - widthOf(shown, row.big ? FONT.center : FONT.strong) - 10, cy, 'dg-state is-bad'));
   tips.set(key, { title: t('offTitle'), rows: [{ name: t('stated'), value: shown }, { name: t('counted'), value: money.text(row.value) }], hot: [key] });
   problems.push(row.value - row.stated);
  }
  y += h;
 });
 const checked = data.rows.some(row => Number.isFinite(row.price) && Number.isFinite(row.qty)) || Number.isFinite(data.statedTotal) || Number.isFinite(data.statedPayable);
 if (checked) { y += 10; y += verdict(items, 0.95, y, W, !problems.length, problems.length ? t('offBy', { n: money.text(Math.abs(problems[0])) }) : t('sumsOk')); }
 const rows = [[data.cols[0] || t('item'), t('qty'), t('price'), t('amount')], ...data.rows.map(row => [row.name, Number.isFinite(row.qty) ? row.qty : '', Number.isFinite(row.price) ? money.cell(row.price) : '', money.cell(row.amount)]), [], ...sums.map(row => [row.name, '', '', Number.isFinite(row.value) ? money.cell(row.value) : ''])];
 return scene('invoice', data, W, y + 2, start, { tsv: tsv(rows) });
}

/* Bank statement: every line and where it went */

const DESTS = [
 ['booked', /^(?:(?:already|já|ya|déjà|già|уже|bereits)\s+)?(?:booked|posted|existing|recorded|done|already|проведен\S*|учтен\S*|есть|lançad[oa]|contabilizad[oa]|registrad[oa]|comptabilisée?|enregistrée?|registrat[oa]|contabilizzat[oa]|gebucht)/iu],
 ['new', /^(?:new|entry|to book|to post|новая|новый|нов\S*|(?:нужно\s+)?провести|(?:a\s+)?lançar|contabilizar|registrar|nov[oa]|nuev[oa]|nouvelle?|à comptabiliser|nuov[oa]|da registrare|neu|zu buchen)/iu],
 ['transfer', /^(?:transfer|own|перевод\S*|между сво\S*|transferência|transferencia|virement|giroconto|trasferimento|umbuchung)/iu],
 ['advance', /^(?:advance|prepaid|prepayment|аванс\S*|предоплат\S*|adiantamento|anticipo|acompte|avance|vorauszahlung|anzahlung)/iu],
 ['settle', /^(?:settle\S*|liability|payable|clears?|погашен\S*|закрыт\S*|baixa|liquidação|liquidación|règlement|saldo debito|ausgleich)/iu],
 ['pending', /^(?:pending|unknown|unidentified|unclear|\?|не разобран\S*|неизвестн\S*|не опознан\S*|pendente|pendiente|en attente|inconnu|sospes[oa]|da chiarire|offen|ungeklärt)/iu],
];
const DEST_TONE = { new: 0, transfer: 1, advance: 2, settle: 3 };
const destOf = text => DESTS.find(([, test]) => test.test(String(text).trim()))?.[0] || '';
// A destination written as the bare word is said in the app's language; anything more is kept as written.
const destWord = (text, kind) => kind && DESTS.find(([k]) => k === kind)[1].exec(text.trim())?.[0].length === text.trim().length ? t(`dest.${kind}`) : text;

const STATEMENT = /^(opening|closing|account|period)(?:\s*:\s*|\s+)(.+)$/;

function parseStatement(lines) {
 const data = { ...blank(), account: '', period: '', opening: '', closing: '', rows: [] }, texts = [];
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  if (!line || common(line, data)) continue;
  const m = STATEMENT.exec(line);
  if (m && !(m[1] !== 'account' && m[1] !== 'period' && !isMoney(cellsOf(m[2]).pop(), ''))) {
   const cells = cellsOf(m[2]).map(unquote);
   data[m[1]] = m[1] === 'opening' || m[1] === 'closing' ? cells[cells.length - 1] : cells.join(' · ');
   if (m[1] === 'opening' || m[1] === 'closing') texts.push(data[m[1]]);
   continue;
  }
  const cells = cellsOf(line).map(unquote);
  if (cells.length < 2) continue;
  data.rows.push(cells);
  texts.push(...cells);
 }
 const read = finish(data, texts);
 // A line is a date, what it was, the amount and where it went, then a note; written in other orders, the date is
 // the cell that looks like one and the amount the cell that is money.
 data.rows = data.rows.map(cells => {
  const d = dateAt(cells), sums = cells.map((cell, i) => i !== d && read(cell) ? i : -1).filter(i => i >= 0);
  // The amount is the number with decimals, else the first number after the date: a document number may stand before it.
  const at = sums.find(i => /\d[.,]\d{1,3}\D*$/.test(cells[i])) ?? sums.find(i => i > d) ?? -1;
  if (at < 0) return null;
  const money = read(cells[at]), date = d >= 0 ? cells[d] : '';
  const words = cells.filter((cell, i) => i !== at && i !== d && cell);
  let value = money.value;
  // C after an amount is money in, D money out, as a bank writes it.
  if (money.side) value = money.side === 'c' ? Math.abs(value) : -Math.abs(value);
  const k = words.findIndex((cell, i) => i > 0 && destOf(cell)), dest = k >= 0 ? words.splice(k, 1)[0] : '';
  return { date, text: words[0] || '', value, dest, kind: destOf(dest), note: words.slice(1).join(' · ') };
 }).filter(Boolean);
 data.open = read(data.opening)?.value;
 data.close = read(data.closing)?.value;
 return data.rows.length ? data : null;
}

function statementScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, BOOKS.max), money = data.money, start = opening(data, W), { items, tips } = start;
 if (data.account || data.period) {
  const y = start.top + (start.top ? 0 : 8);
  items.push(label('st:acc', 0.12, 0, y, truncate([data.account, data.period].filter(Boolean).join(' · '), W, ...FONT.tick), 'start', 'dg-row-note'));
  start.top = y + 16;
 }
 let y = start.top + 4;
 // How many lines went where, said once over the list.
 const kinds = ['new', 'booked', 'transfer', 'advance', 'settle', 'pending', ''].map(kind => [kind, data.rows.filter(row => row.kind === kind && (kind || row.dest)).length]).filter(([, n]) => n);
 const toneOf = kind => kind in DEST_TONE ? tones[DEST_TONE[kind]] : undefined;
 const tagCls = kind => `dg-books-tag${kind ? ` is-${kind}` : ''}`;
 if (kinds.length > 1 || data.rows.length >= 4) {
  let x = 0, row = y + 8;
  kinds.forEach(([kind, n], k) => {
   const word = kind ? t(`dest.${kind}`) : t('dest.other'), w = 10 + widthOf(String(n), FONT.value) + 5 + widthOf(word, FONT.tick) + 16;
   if (x && x + w - 16 > W) { x = 0; row += 18; }
   items.push(dot(`st:t:${k}`, 0.15 + k * 0.03, x + 3.5, row, tagCls(kind), toneOf(kind)));
   items.push(label(`st:tn:${k}`, 0.16 + k * 0.03, x + 11, row, String(n), 'start', 'dg-value'));
   items.push(label(`st:tw:${k}`, 0.17 + k * 0.03, x + 11 + widthOf(String(n), FONT.value) + 5, row, word, 'start', 'dg-row-note'));
   x += w;
  });
  y = row + 18;
 }
 const dateW = Math.max(0, ...data.rows.map(row => row.date ? widthOf(row.date, FONT.tick) : 0)), textX = dateW ? dateW + 12 : 0;
 const amountW = Math.max(...data.rows.map(row => widthOf(money.signed(row.value), FONT.amount)));
 const shown = row => row.dest ? destWord(row.dest, row.kind) : '';
 const destW = Math.min(W * 0.28, Math.max(0, ...data.rows.map(row => row.dest ? widthOf(shown(row), FONT.tick) + 12 : 0)));
 // Where a line went has its own column when there is room for it and the words; on a narrow page it goes under them.
 const column = destW && W - textX - amountW - destW - BOOKS.gap * 2 >= 150, textW = W - textX - amountW - BOOKS.gap - (column ? destW + BOOKS.gap : 0);
 const xDest = W - amountW - BOOKS.gap - destW;
 data.rows.forEach((row, i) => {
  const under = [row.dest && !column ? shown(row) : '', row.note].filter(Boolean), order = 0.3 + i * 0.06, key = `st:${i}`;
  const h = under.length ? 44 : BOOKS.row, cy = under.length ? y + 15 : y + h / 2;
  items.push(hit(key, order, y, h, W));
  tips.set(key, { silent: true });
  if (i) items.push(rule(`${key}:r`, order, 0, y, W));
  if (row.date) items.push(label(`${key}:d`, order, 0, cy, row.date, 'start', 'dg-tick'));
  items.push(label(`${key}:n`, order + 0.01, textX, cy, truncate(row.text, textW, ...FONT.row), 'start', 'dg-row-name'));
  if (under.length) {
   let ux = textX;
   if (row.dest && !column) { items.push(dot(`${key}:g`, order + 0.02, ux + 3.5, cy + 16, tagCls(row.kind), toneOf(row.kind))); ux += 11; }
   items.push(label(`${key}:o`, order + 0.02, ux, cy + 16, truncate(under.join(' · '), textW - (ux - textX), ...FONT.tick), 'start', 'dg-row-note'));
  }
  if (row.dest && column) {
   items.push(dot(`${key}:g`, order + 0.02, xDest + 3.5, cy, tagCls(row.kind), toneOf(row.kind)));
   items.push(label(`${key}:gw`, order + 0.03, xDest + 11, cy, truncate(shown(row), destW - 11, ...FONT.tick), 'start', 'dg-row-note'));
  }
  items.push(label(`${key}:a`, order + 0.04, W, cy, money.signed(row.value), 'end', 'dg-row-value'));
  y += h;
 });
 // What came in and went out, from the opening balance to the closing one; a closing balance the statement gives is
 // checked against the lines.
 const inflow = data.rows.filter(row => row.value > 0).reduce((s, row) => s + row.value, 0), outflow = data.rows.filter(row => row.value < 0).reduce((s, row) => s + row.value, 0);
 const hasOpen = Number.isFinite(data.open), end = (hasOpen ? data.open : 0) + inflow + outflow;
 const cells = [...(hasOpen ? [[t('opening'), money.text(data.open)]] : []), [t('in'), money.signed(inflow)], [t('out'), money.text(outflow)], [hasOpen ? t('closing') : t('net'), Number.isFinite(data.close) ? money.text(data.close) : hasOpen ? money.text(end) : money.signed(end)]];
 items.push(rule('st:sum', 0.8, 0, y + 4, W, 'dg-line'));
 y += 14;
 const colW = W / cells.length;
 cells.forEach(([word, value], k) => {
  const x = k * colW, last = k === cells.length - 1;
  items.push(label(`st:s${k}:w`, 0.82 + k * 0.02, x, y + 6, caps(word, colW - 8), 'start', 'dg-eyebrow'));
  items.push(label(`st:s${k}:v`, 0.83 + k * 0.02, x, y + 26, truncate(value, colW - 8, ...FONT.strong), 'start', last ? 'dg-row-total' : 'dg-row-value'));
  if (last && Number.isFinite(data.close) && hasOpen && !money.same(data.close, end)) {
   items.push(hit('st:close', 0.84, y - 4, 40, W));
   items.push(dot('st:close:off', 0.85, x + widthOf(value, FONT.strong) + 9, y + 26, 'dg-state is-bad'));
   tips.set('st:close', { title: t('offTitle'), rows: [{ name: t('stated'), value }, { name: t('counted'), value: money.text(end) }], hot: ['st:close'] });
  }
 });
 y += 40;
 if (hasOpen && Number.isFinite(data.close)) {
  const ok = money.same(data.close, end);
  y += 6 + verdict(items, 0.9, y + 6, W, ok, ok ? t('statementOk') : t('offBy', { n: money.text(Math.abs(data.close - end)) }));
 }
 const rows = [[t('date'), t('item'), t('amount'), t('destination'), t('note')], ...data.rows.map(row => [row.date, row.text, money.cell(row.value), shown(row), row.note])];
 return scene('statement', data, W, y + 2, start, { tsv: tsv(rows) });
}

/* Journal entries, and the T-accounts they post to */

const DR = /^(?:Dr|Db|D|Debit|Débito|Debito|Débit|Debe|Soll|Dare|Дт|Д|Дебет)\.?(?:\s+|:\s*)(.+)$/iu;
const CR = /^(?:Cr|C|Credit|Crédito|Credito|Crédit|Haber|Haben|Avere|Кт|К|Кредит)\.?(?:\s+|:\s*)(.+)$/iu;

// The names of the columns of a line of entries, in the languages people keep books in.
const HEAD = {
 date: /^(?:date|дата|fecha|datum|data|tarih)\b/iu,
 debit: /(?:debit|débit|debe|soll|дебет|^дт\b|winien|^wn\b|^dr\b|dare)/iu,
 credit: /(?:credit|crédit|haber|haben|кредит|^кт\b|^ma\b|^cr\b|avere)/iu,
 amount: /(?:amount|montant|сумм|сума|importe|betrag|kwota|valor|importo|^sum)/iu,
};
const moneyEqual = (a, b) => Math.abs(a - b) < 0.005;
function parseEntries(lines) {
 const data = { ...blank(), entries: [], openings: [] }, texts = [];
 let entry = null, base = null;
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  if (!line || common(line, data)) continue;
  const cols = listLine(line, 'cols');
  if (cols) { data.cols = cols; continue; }
  const open = /^opening(?:\s*:\s*|\s+)(.+)$/.exec(line);
  if (open) { const cells = cellsOf(open[1]).map(unquote); data.openings.push({ account: cells[0], amount: cells[cells.length - 1] }); texts.push(cells[cells.length - 1]); continue; }
  const indent = indentOf(raw), cells = cellsOf(line).map(unquote);
  base ??= indent;
  texts.push(...cells);
  // A line of an entry, under it: Dr account | amount, Cr account | amount, or the account with its amount in the
  // column of its side, account | 100,00 | for a debit and account | | 100,00 for a credit.
  if (entry && indent > base) { entry.raw.push(cells); continue; }
  entry = { head: cells, raw: [] };
  data.entries.push(entry);
 }
 const read = finish(data, texts);
 // A line of column names (Date | debit account | credit account | amount | description, in any language) says
 // which cell is which: the lines under it are read by it, whatever their date says ("at the date of purchase"), and
 // a debit or credit cell left empty is a line of one side. Lines of one side follow one another as one compound
 // entry until its debits equal its credits.
 const named = data.entries.findIndex(e => e.head.length >= 3 && !e.head.some(cell => read(cell)) && e.head.some(cell => HEAD.debit.test(cell)) && e.head.some(cell => HEAD.credit.test(cell)));
 if (named >= 0) {
  const head = data.entries.splice(named, 1)[0].head, col = re => head.findIndex(cell => re.test(cell));
  const c = { date: col(HEAD.date), d: col(HEAD.debit), c: col(HEAD.credit), sum: col(HEAD.amount) };
  const merged = [];
  let open = null;
  for (const e of data.entries) {
   if (e.raw.length || c.d < 0 || c.c < 0) { merged.push(e); open = null; continue; }
   const cells = e.head, sumAt = c.sum >= 0 ? c.sum : cells.findIndex((cell, i) => i !== c.date && i !== c.d && i !== c.c && read(cell));
   const a = sumAt >= 0 ? read(cells[sumAt]) : null;
   if (!a) { merged.push(e); open = null; continue; }
   const value = Math.abs(a.value), dr = cells[c.d] || '', cr = cells[c.c] || '';
   const text = cells.filter((cell, i) => cell && ![c.date, c.d, c.c, sumAt].includes(i)).join(' · ');
   const lines = [...(dr ? [{ side: 'd', account: dr, value }] : []), ...(cr ? [{ side: 'c', account: cr, value }] : [])];
   if (!lines.length) { merged.push(e); open = null; continue; }
   // A line of one side joins the entry still open (its sides not yet equal); a line of both sides stands alone.
   if (lines.length === 1 && open && !moneyEqual(open.debit, open.credit)) {
    open.lines.push({ ...lines[0], note: text !== open.text ? text : '' });
   } else {
    open = { head: cells, raw: [], named: true, date: c.date >= 0 ? cells[c.date] : '', text, lines, debit: 0, credit: 0 };
    merged.push(open);
   }
   open.debit = open.lines.filter(l => l.side === 'd').reduce((s, l) => s + l.value, 0);
   open.credit = open.lines.filter(l => l.side === 'c').reduce((s, l) => s + l.value, 0);
   if (lines.length > 1) open = null;
  }
  data.entries = merged;
 }
 for (const e of data.entries) {
  if (e.named) continue;
  e.lines = [];
  // The date is the cell that looks like one; what stands before it (a branch, a number of a batch) is no account.
  const cells = e.head, d = dateAt(cells), at =cells.map((cell, i) => i > d && read(cell) ? i : -1).filter(i => i >= 0);
  // Of the cells that read as numbers the amount is the one with decimals, else the last: an account may be a bare
  // number too, 1102, and stands before the amount.
  const pick = at.length ? at.find(i => /\d[.,]\d{1,3}(?:\D*)$/.test(cells[i])) ?? at[at.length - 1] : -1;
  e.date = d >= 0 ? cells[d] : '';
  const before = d > 0 ? cells.slice(0, d).filter(Boolean) : [];
  const words = cells.filter((cell, i) => i > d && i !== pick && cell);
  if (!e.raw.length && pick >= 0) {
   // Written on one line: date | debit account | credit account | amount | what it is.
   const value = Math.abs(read(cells[pick]).value);
   let dr = words.findIndex(cell => DR.test(cell)), cr = words.findIndex(cell => CR.test(cell));
   if (dr < 0 && cr < 0 && words.length >= 2) { dr = 0; cr = 1; }
   if (dr >= 0) e.lines.push({ side: 'd', account: DR.exec(words[dr])?.[1] || words[dr], value });
   if (cr >= 0) e.lines.push({ side: 'c', account: CR.exec(words[cr])?.[1] || words[cr], value });
   e.text = [...words.filter((_, i) => i !== dr && i !== cr), ...before].join(' · ');
  } else {
   e.text = [...words, ...before].join(' · ');
   for (const line of e.raw) {
    const name = line[0] || '', dm = DR.exec(name), cm = CR.exec(name), amounts = line.slice(1).map(cell => cell ? read(cell) : null);
    const note = line.slice(1).filter(cell => cell && !read(cell)).join(' · ');
    if (dm || cm) { const a = amounts.find(Boolean); if (a) e.lines.push({ side: dm ? 'd' : 'c', account: (dm || cm)[1], value: Math.abs(a.value), note }); continue; }
    // The column an amount stands in says its side; one amount alone with D or C after it says it too.
    if (amounts[0] && amounts[1]) { e.lines.push({ side: 'd', account: name, value: Math.abs(amounts[0].value), note }); e.lines.push({ side: 'c', account: name, value: Math.abs(amounts[1].value), note }); }
    else if (amounts[0]) e.lines.push({ side: amounts[0].side === 'c' ? 'c' : 'd', account: name, value: Math.abs(amounts[0].value), note });
    else if (amounts[1]) e.lines.push({ side: 'c', account: name, value: Math.abs(amounts[1].value), note });
   }
  }
  e.debit = e.lines.filter(l => l.side === 'd').reduce((s, l) => s + l.value, 0);
  e.credit = e.lines.filter(l => l.side === 'c').reduce((s, l) => s + l.value, 0);
 }
 data.entries = data.entries.filter(e => e.lines.length);
 data.openings = data.openings.map(o => { const a = read(o.amount); return a ? { account: o.account, value: a.side === 'c' ? -Math.abs(a.value) : a.side === 'd' ? Math.abs(a.value) : a.value } : null; }).filter(Boolean);
 return data.entries.length ? data : null;
}

function entriesScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 320, BOOKS.max), money = data.money, start = opening(data, W), { items, tips } = start;
 const [hDebit, hCredit] = [data.cols[0] || t('debit'), data.cols[1] || t('credit')];
 const all = data.entries.flatMap(e => e.lines.map(l => money.text(l.value)));
 const sumD = data.entries.reduce((s, e) => s + e.debit, 0), sumC = data.entries.reduce((s, e) => s + e.credit, 0);
 const colW = Math.max(capsWidth(hDebit.toUpperCase()), capsWidth(hCredit.toUpperCase()), ...all.map(text => widthOf(text, FONT.amount)), widthOf(money.text(Math.max(sumD, sumC)), FONT.strong)) + 6;
 const xCredit = W, xDebit = W - colW - BOOKS.gap, nameEnd = xDebit - colW - BOOKS.gap;
 const dateW = Math.max(0, ...data.entries.map(e => e.date ? widthOf(e.date, FONT.tick) : 0)), textX = dateW ? dateW + 12 : 0;
 let y = start.top + 8;
 items.push(label('en:h:d', 0.2, xDebit, y, caps(hDebit, colW), 'end', 'dg-eyebrow'));
 items.push(label('en:h:c', 0.2, xCredit, y, caps(hCredit, colW), 'end', 'dg-eyebrow'));
 y += 10;
 const problems = [];
 data.entries.forEach((e, i) => {
  const order = 0.3 + i * 0.1, key = `en:${i}`, top = y, balanced = money.same(e.debit, e.credit);
  if (i) items.push(rule(`${key}:r`, order, 0, y, W));
  y += 8;
  const head = e.text || (e.lines.length ? '' : '—');
  if (e.date) items.push(label(`${key}:d`, order, 0, y + 9, e.date, 'start', 'dg-tick'));
  if (head) items.push(label(`${key}:t`, order + 0.01, textX, y + 9, truncate(head, nameEnd - textX - (balanced ? 0 : 14), ...FONT.strong), 'start', 'dg-row-total'));
  if (head || e.date) y += 22;
  // Debits first, set at the edge; credits after them, set in, as a journal has written them for centuries.
  const lines = [...e.lines.filter(l => l.side === 'd'), ...e.lines.filter(l => l.side === 'c')];
  lines.forEach((l, k) => {
   const x = textX + (l.side === 'c' ? 22 : 0), cy = y + 9;
   account(items, `${key}:l${k}`, order + 0.02 + k * 0.01, x, cy, l.account, nameEnd - x - (l.note ? Math.min(140, widthOf(l.note, FONT.tick) + 12) : 0), 'dg-row-name');
   if (l.note) items.push(label(`${key}:l${k}:o`, order + 0.03, nameEnd, cy, truncate(l.note, 140, ...FONT.tick), 'end', 'dg-row-note'));
   items.push(label(`${key}:l${k}:v`, order + 0.04, l.side === 'd' ? xDebit : xCredit, cy, money.text(l.value), 'end', 'dg-row-value'));
   y += BOOKS.line;
  });
  y += 4;
  items.push(hit(key, order, top, y - top, W));
  if (!balanced) {
   const diff = e.debit - e.credit;
   problems.push(diff);
   items.push(dot(`${key}:off`, order + 0.05, (head ? textX + Math.min(widthOf(head, FONT.strong), nameEnd - textX - 14) + 10 : textX + 4), top + 17, 'dg-state is-bad'));
   tips.set(key, { title: t('unbalanced'), rows: [{ name: hDebit, value: money.text(e.debit) }, { name: hCredit, value: money.text(e.credit) }, { name: t('difference'), value: money.text(Math.abs(diff)) }], hot: [key] });
  } else tips.set(key, { silent: true });
 });
 items.push(rule('en:sum', 0.9, 0, y + 2, W, 'dg-line'));
 y += 2;
 items.push(label('en:sum:n', 0.91, 0, y + 15, t('total'), 'start', 'dg-row-total'));
 items.push(label('en:sum:d', 0.92, xDebit, y + 15, money.text(sumD), 'end', 'dg-row-total'));
 items.push(label('en:sum:c', 0.92, xCredit, y + 15, money.text(sumC), 'end', 'dg-row-total'));
 y += 34;
 const ok = !problems.length && money.same(sumD, sumC);
 y += verdict(items, 0.95, y, W, ok, ok ? t('entriesOk') : t('unbalancedCount', { n: problems.length || 1, d: money.text(Math.abs(sumD - sumC) || Math.abs(problems[0] || 0)) }));
 const rows = [[t('date'), t('account'), hDebit, hCredit, t('item')]];
 for (const e of data.entries) for (const l of e.lines) rows.push([e.date, l.account, l.side === 'd' ? money.cell(l.value) : '', l.side === 'c' ? money.cell(l.value) : '', [e.text, l.note].filter(Boolean).join(' · ')]);
 return scene('entries', data, W, y + 2, start, { tsv: tsv(rows) });
}

// The same entries posted to their accounts, each drawn as a T: debits on the left of its stem, credits on the right,
// the turnover of each side under them and the balance on the side that is larger.
function taccountsScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, BOOKS.max), money = data.money, start = opening(data, W), { items, tips } = start;
 const accounts = new Map(), get = name => { if (!accounts.has(name)) accounts.set(name, { name, open: 0, d: [], c: [] }); return accounts.get(name); };
 for (const o of data.openings) get(o.account).open += o.value;
 data.entries.forEach((e, i) => { for (const l of e.lines) get(l.account)[l.side].push({ value: l.value, ref: i + 1 }); });
 const list = [...accounts.values()], G = 28;
 const amounts = list.flatMap(a => [...a.d, ...a.c].map(x => money.text(x.value)));
 const want = Math.max(200, 2 * (Math.max(60, ...amounts.map(text => widthOf(text, FONT.amount))) + 34));
 const cols = Math.max(1, Math.min(3, Math.floor((W + G) / (want + G)))), tw = (W - G * (cols - 1)) / cols, half = tw / 2;
 let y = start.top + 6;
 for (let r = 0; r * cols < list.length; r++) {
  const row = list.slice(r * cols, r * cols + cols);
  let low = y;
  row.forEach((a, k) => {
   const x0 = k * (tw + G), order = 0.2 + (r * cols + k) * 0.12, key = `ta:${r * cols + k}`;
   account(items, `${key}:n`, order, x0, y + 8, a.name, tw, 'dg-row-total');
   let top = y + 20;
   if (a.open) { items.push(label(`${key}:o`, order + 0.01, a.open > 0 ? x0 : x0 + tw, top + 6, `${t('opening')} ${money.text(Math.abs(a.open))}`, a.open > 0 ? 'start' : 'end', 'dg-row-note')); top += 16; }
   items.push(rule(`${key}:top`, order, x0, top, x0 + tw, 'dg-line'));
   const rows = Math.max(a.d.length, a.c.length, 1);
   const side = (list2, x, end, s) => list2.forEach((v, j) => {
    const cy = top + 12 + j * 20;
    items.push(label(`${key}:${s}${j}:r`, order + 0.02 + j * 0.01, x, cy, String(v.ref), 'start', 'dg-tick'));
    items.push(label(`${key}:${s}${j}`, order + 0.03 + j * 0.01, end, cy, money.text(v.value), 'end', 'dg-row-value'));
   });
   side(a.d, x0, x0 + half - 8, 'd');
   side(a.c, x0 + half + 8, x0 + tw, 'c');
   const bottom = top + 4 + rows * 20;
   items.push({ key: `${key}:stem`, type: 'line', layer: 'back', order, props: { x1: x0 + half, y1: top, x2: x0 + half, y2: bottom + 22 }, fixed: { cls: 'dg-line', draw: true } });
   items.push(rule(`${key}:foot`, order + 0.05, x0, bottom, x0 + tw));
   const dSum = a.d.reduce((s, v) => s + v.value, 0), cSum = a.c.reduce((s, v) => s + v.value, 0), bal = a.open + dSum - cSum;
   items.push(label(`${key}:sd`, order + 0.06, x0 + half - 8, bottom + 11, money.text(dSum), 'end', 'dg-value'));
   items.push(label(`${key}:sc`, order + 0.06, x0 + tw, bottom + 11, money.text(cSum), 'end', 'dg-value'));
   const word = money.same(bal, 0) ? t('zero') : `${t('balance')} ${bal > 0 ? t('dr') : t('cr')} ${money.text(Math.abs(bal))}`;
   items.push(label(`${key}:bal`, order + 0.08, bal >= 0 ? x0 : x0 + tw, bottom + 32, truncate(word, tw, ...FONT.strong), bal >= 0 ? 'start' : 'end', 'dg-row-total'));
   items.push(hit(key, order, y - 2, bottom + 44 - y, tw - 16));
   items[items.length - 1].props.x = x0 - 8;
   tips.set(key, { silent: true });
   low = Math.max(low, bottom + 44);
  });
  y = low + 14;
 }
 const rows = [[t('account'), t('opening'), t('debit'), t('credit'), t('closing')], ...list.map(a => { const d = a.d.reduce((s, v) => s + v.value, 0), c = a.c.reduce((s, v) => s + v.value, 0); return [a.name, money.cell(a.open), money.cell(d), money.cell(c), money.cell(a.open + d - c)]; })];
 return scene('taccounts', data, W, y - 12, start, { tsv: tsv(rows) });
}

/* Reconciliation: two records of one account side by side, and what tells them apart */

function parseReconcile(lines) {
 const data = { ...blank(), sides: [], rows: [], items: [] }, texts = [];
 let closed = false;
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  if (!line || common(line, data)) continue;
  const sides = listLine(line, 'sides');
  if (sides) { data.sides = sides.filter(Boolean).slice(0, 2); continue; }
  const cells = cellsOf(line).map(unquote);
  if (cells.length < 2) continue;
  texts.push(...cells.slice(1));
  // `= Name` is the closing balance as stated; the rows after it are what explains the difference.
  const total = /^=\s*(.*)$/.exec(cells[0]);
  if (total) { data.rows.push({ name: total[1], cells: cells.slice(1), closing: true }); closed = true; continue; }
  (closed ? data.items : data.rows).push({ name: cells[0], cells: cells.slice(1) });
 }
 const read = finish(data, texts);
 const n = Math.max(1, Math.min(2, data.sides.length || Math.max(...data.rows.map(row => row.cells.length)))), val = text => text ? read(text)?.value : undefined;
 data.n = n;
 data.rows = data.rows.map(row => ({ ...row, values: Array.from({ length: n }, (_, k) => val(row.cells[k])) }));
 data.items = data.items.map(row => ({ ...row, values: Array.from({ length: n }, (_, k) => val(row.cells[k])) }));
 const body = data.rows.filter(row => !row.closing), stated = data.rows.find(row => row.closing);
 if (!body.length) return null;
 data.start = body[0];
 data.moves = body.slice(1);
 data.stated = stated || null;
 return data;
}

function reconcileScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, BOOKS.max), money = data.money, n = data.n, start = opening(data, W), { items, tips } = start;
 const ends = Array.from({ length: n }, (_, k) => [data.start, ...data.moves].reduce((s, row) => s + (row.values[k] || 0), 0));
 const texts = [...data.rows, ...data.items].flatMap(row => row.values.filter(Number.isFinite).map(v => money.signed(v)));
 const sideNames = Array.from({ length: n }, (_, k) => data.sides[k] || (n > 1 ? `${k + 1}` : ''));
 const colW = Math.max(96, ...texts.map(text => widthOf(text, FONT.strong)), ...sideNames.map(name => capsWidth(name.toUpperCase()))) + 8;
 const xs = Array.from({ length: n }, (_, k) => W - (n - 1 - k) * (colW + BOOKS.gap)), nameW = W - n * colW - (n - 1) * BOOKS.gap - BOOKS.gap;
 let y = start.top + 8;
 if (sideNames.some(Boolean)) { sideNames.forEach((name, k) => items.push(label(`rc:h${k}`, 0.2, xs[k], y, caps(name, colW), 'end', 'dg-eyebrow'))); y += 10; }
 const name = text => ({ opening: t('opening'), in: t('in'), out: t('out'), closing: t('closing') })[text.trim().toLowerCase()] || text;
 const line = (row, i, kind) => {
  const key = `rc:${kind}${i}`, order = 0.3 + (kind === 'm' ? i + 1 : 0) * 0.07, cy = y + BOOKS.row / 2;
  items.push(hit(key, order, y, BOOKS.row, W));
  tips.set(key, { silent: true });
  if (kind === 'm' || i) items.push(rule(`${key}:r`, order, 0, y, W));
  items.push(label(`${key}:n`, order, 0, cy, truncate(name(row.name), nameW, ...FONT.row), 'start', 'dg-row-name'));
  row.values.forEach((v, k) => { if (Number.isFinite(v)) items.push(label(`${key}:v${k}`, order + 0.02, xs[k], cy, kind === 'm' ? money.signed(v) : money.text(v), 'end', 'dg-row-value')); });
  y += BOOKS.row;
 };
 line(data.start, 0, 's');
 data.moves.forEach((row, i) => line(row, i, 'm'));
 // The closing balance as the movements make it; a stated one that differs keeps its own number, with a mark.
 items.push(rule('rc:end:r', 0.6, 0, y, W, 'dg-line'));
 const endKey = 'rc:end', cy = y + 17, problems = [];
 items.push(hit(endKey, 0.6, y, 34, W));
 tips.set(endKey, { silent: true });
 items.push(label(`${endKey}:n`, 0.61, 0, cy, truncate(data.stated?.name ? name(data.stated.name) : t('closing'), nameW, ...FONT.strong), 'start', 'dg-row-total'));
 ends.forEach((v, k) => {
  const said = data.stated?.values[k], shown = money.text(Number.isFinite(said) ? said : v);
  items.push(label(`${endKey}:v${k}`, 0.62 + k * 0.01, xs[k], cy, shown, 'end', 'dg-row-total'));
  if (Number.isFinite(said) && !money.same(said, v)) {
   problems.push(k);
   items.push(dot(`${endKey}:off${k}`, 0.63, xs[k] - widthOf(shown, FONT.strong) - 9, cy, 'dg-state is-bad'));
   tips.set(endKey, { title: t('offTitle'), rows: [{ name: t('stated'), value: shown }, { name: t('counted'), value: money.text(v) }], hot: [endKey] });
  }
 });
 y += 34;
 if (n === 1) {
  if (data.stated) y += 6 + verdict(items, 0.9, y + 6, W, !problems.length, problems.length ? t('offBy', { n: money.text(Math.abs(data.stated.values[0] - ends[0])) }) : t('reconciled'));
  return scene('reconcile', data, W, y + 2, start, { tsv: tsv([['', sideNames[0]], ...[data.start, ...data.moves].map(row => [name(row.name), money.cell(row.values[0] || 0)]), [t('closing'), money.cell(ends[0])]]) });
 }
 // Two records: the difference between their closing balances, never made to vanish, and the items that explain it.
 const endOf = k => Number.isFinite(data.stated?.values[k]) ? data.stated.values[k] : ends[k];
 const diff = endOf(0) - endOf(1);
 items.push(label('rc:diff:n', 0.7, 0, y + 15, t('difference'), 'start', 'dg-row-name'));
 items.push(label('rc:diff:v', 0.71, xs[1], y + 15, money.signed(diff), 'end', money.same(diff, 0) ? 'dg-row-value' : 'dg-row-total'));
 y += 30;
 let explained = 0;
 if (data.items.length) {
  items.push(label('rc:why', 0.72, 0, y + 10, caps(t('explained'), W), 'start', 'dg-eyebrow'));
  y += 22;
  data.items.forEach((row, i) => {
   const key = `rc:x${i}`, order = 0.74 + i * 0.04, cy = y + 13;
   items.push(hit(key, order, y, 26, W));
   tips.set(key, { silent: true });
   items.push(label(`${key}:n`, order, 0, cy, truncate(row.name, nameW, ...FONT.row), 'start', 'dg-row-name is-quiet'));
   row.values.forEach((v, k) => { if (Number.isFinite(v)) items.push(label(`${key}:v${k}`, order + 0.01, xs[k], cy, money.signed(v), 'end', 'dg-row-value')); });
   explained += (row.values[0] || 0) - (row.values[1] || 0);
   y += 26;
  });
 }
 const rest = diff - explained, ok = money.same(rest, 0);
 y += 8 + verdict(items, 0.9, y + 8, W, ok, ok ? (money.same(diff, 0) ? t('reconciled') : t('explainedAll')) : t('unexplained', { n: money.text(Math.abs(rest)) }));
 const rows = [['', ...sideNames], ...[data.start, ...data.moves].map(row => [name(row.name), ...row.values.map(v => Number.isFinite(v) ? money.cell(v) : '')]), [t('closing'), ...ends.map((v, k) => money.cell(endOf(k)))], [t('difference'), '', money.cell(diff)], ...data.items.map(row => [row.name, ...row.values.map(v => Number.isFinite(v) ? money.cell(v) : '')])];
 return scene('reconcile', data, W, y + 2, start, { tsv: tsv(rows) });
}

/* Documents matched with payments */

function parseMatch(lines) {
 const data = { ...blank(), sides: [], groups: [] }, texts = [];
 let group = null, base = null;
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  if (!line || common(line, data)) continue;
  const sides = listLine(line, 'sides');
  if (sides) { data.sides = sides.slice(0, 2); continue; }
  const cells = cellsOf(line).map(unquote);
  if (cells.length < 2) continue;
  texts.push(cells[1] || '', cells[3] || '');
  const indent = indentOf(raw);
  base ??= indent;
  const row = { left: cells[0] ? { text: cells[0], amount: cells[1] || '' } : null, right: cells[2] ? { text: cells[2], amount: cells[3] || '' } : null, note: cells.slice(4).filter(Boolean).join(' · ') };
  // A line set in under another adds to its group: one invoice paid in parts, one payment for several invoices.
  if (group && indent > base) { if (row.left) group.left.push(row.left); if (row.right) group.right.push(row.right); if (row.note) group.note = [group.note, row.note].filter(Boolean).join(' · '); continue; }
  group = { left: row.left ? [row.left] : [], right: row.right ? [row.right] : [], note: row.note };
  data.groups.push(group);
 }
 const read = finish(data, texts);
 for (const g of data.groups) {
  for (const side of [g.left, g.right]) for (const x of side) x.value = Math.abs(read(x.amount)?.value ?? NaN);
  g.l = g.left.reduce((s, x) => s + (Number.isFinite(x.value) ? x.value : 0), 0);
  g.r = g.right.reduce((s, x) => s + (Number.isFinite(x.value) ? x.value : 0), 0);
  g.state = !g.left.length ? 'noDocument' : !g.right.length ? 'noPayment' : data.money.same(g.l, g.r) ? 'matched' : 'partial';
 }
 data.groups = data.groups.filter(g => g.left.length || g.right.length);
 return data.groups.length ? data : null;
}

const MATCH_MOOD = { matched: 'good', partial: 'warn', noPayment: 'bad', noDocument: 'bad' };

function matchScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 320, BOOKS.max), money = data.money, start = opening(data, W), { items, tips } = start, G = 52, sideW = (W - G) / 2, xR = sideW + G;
 let y = start.top + 4;
 const states = ['matched', 'partial', 'noPayment', 'noDocument'].map(s => [s, data.groups.filter(g => g.state === s).length]).filter(([, k]) => k);
 if (data.groups.length >= 3) {
  let x = 0, row = y + 8;
  states.forEach(([state, k], i) => {
   const word = t(`match.${state}`), w = 11 + widthOf(String(k), FONT.value) + 5 + widthOf(word, FONT.tick) + 16;
   if (x && x + w - 16 > W) { x = 0; row += 18; }
   items.push(dot(`mt:t${i}`, 0.12 + i * 0.03, x + 3.5, row, `dg-state is-${MATCH_MOOD[state]}`));
   items.push(label(`mt:tn${i}`, 0.13 + i * 0.03, x + 11, row, String(k), 'start', 'dg-value'));
   items.push(label(`mt:tw${i}`, 0.14 + i * 0.03, x + 11 + widthOf(String(k), FONT.value) + 5, row, word, 'start', 'dg-row-note'));
   x += w;
  });
  y = row + 20;
 }
 const [hl, hr] = [data.sides[0] || t('documents'), data.sides[1] || t('payments')];
 items.push(label('mt:hl', 0.2, 0, y + 4, caps(hl, sideW), 'start', 'dg-eyebrow'));
 items.push(label('mt:hr', 0.2, xR, y + 4, caps(hr, sideW), 'start', 'dg-eyebrow'));
 y += 14;
 const cell = (key, order, x, cy, part) => {
  const amount = Number.isFinite(part.value) ? money.text(part.value) : '', aw = amount ? widthOf(amount, FONT.amount) + 10 : 0;
  items.push(label(`${key}:n`, order, x, cy, truncate(part.text, sideW - aw, ...FONT.row), 'start', 'dg-row-name'));
  if (amount) items.push(label(`${key}:a`, order + 0.01, x + sideW, cy, amount, 'end', 'dg-row-value'));
 };
 data.groups.forEach((g, i) => {
  const order = 0.3 + i * 0.07, key = `mt:${i}`, lines = Math.max(g.left.length, g.right.length, 1);
  const extra = g.state === 'partial' || g.note ? 16 : 0, h = 12 + lines * 20 + extra, top = y;
  items.push(hit(key, order, y, h, W));
  if (i) items.push(rule(`${key}:r`, order, 0, y, W));
  const first = y + 16;
  g.left.forEach((part, k) => cell(`${key}:l${k}`, order + 0.01, 0, first + k * 20, part));
  g.right.forEach((part, k) => cell(`${key}:p${k}`, order + 0.02, xR, first + k * 20, part));
  if (!g.left.length) items.push(label(`${key}:l:none`, order + 0.01, 0, first, t('match.noDocument'), 'start', 'dg-row-note'));
  if (!g.right.length) items.push(label(`${key}:p:none`, order + 0.02, xR, first, t('match.noPayment'), 'start', 'dg-row-note'));
  // The tie between the two sides, with how they stand at its middle; a side that is missing leaves it broken.
  const mid = first + (lines - 1) * 10, whole = g.left.length && g.right.length;
  items.push({ key: `${key}:tie`, type: 'line', layer: 'back', order: order + 0.03, props: { x1: sideW + 8, y1: mid, x2: xR - 8, y2: mid }, fixed: { cls: whole ? 'dg-line' : 'dg-books-gap', draw: true } });
  items.push(dot(`${key}:s`, order + 0.04, sideW + G / 2, mid, `dg-state is-${MATCH_MOOD[g.state]}`, undefined, 4));
  const under = [g.state === 'partial' ? `${t('difference')} ${money.text(Math.abs(g.l - g.r))}` : '', g.note].filter(Boolean).join(' · ');
  if (under) items.push(label(`${key}:o`, order + 0.05, xR, first + (lines - 1) * 20 + 16, truncate(under, sideW, ...FONT.tick), 'start', 'dg-row-note'));
  tips.set(key, g.state === 'matched' ? { silent: true } : { title: t(`match.${g.state}`), rows: [{ name: hl, value: money.text(g.l) }, { name: hr, value: money.text(g.r) }], hot: [key] });
  y = top + h;
 });
 const L = data.groups.reduce((s, g) => s + g.l, 0), R = data.groups.reduce((s, g) => s + g.r, 0);
 items.push(rule('mt:sum', 0.85, 0, y + 2, W, 'dg-line'));
 items.push(label('mt:sum:l', 0.86, sideW, y + 18, money.text(L), 'end', 'dg-row-total'));
 items.push(label('mt:sum:r', 0.86, W, y + 18, money.text(R), 'end', 'dg-row-total'));
 items.push(label('mt:sum:n', 0.86, 0, y + 18, t('total'), 'start', 'dg-row-total'));
 y += 36;
 const open = data.groups.filter(g => g.state !== 'matched').length;
 y += verdict(items, 0.9, y, W, !open, open ? t('matchOpen', { n: open }) : t('matchOk'));
 const rows = [[hl, t('amount'), hr, t('amount'), t('status')]];
 for (const g of data.groups) for (let k = 0; k < Math.max(g.left.length, g.right.length); k++) rows.push([g.left[k]?.text || '', Number.isFinite(g.left[k]?.value) ? money.cell(g.left[k].value) : '', g.right[k]?.text || '', Number.isFinite(g.right[k]?.value) ? money.cell(g.right[k].value) : '', k ? '' : t(`match.${g.state}`)]);
 return scene('match', data, W, y + 2, start, { tsv: tsv(rows) });
}

/* Trial balance: every account with its opening balance, its turnover and its closing balance */

function parseTrial(lines) {
 const data = { ...blank(), rows: [] }, texts = [];
 let base = null;
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  if (!line || common(line, data)) continue;
  const cols = listLine(line, 'cols');
  if (cols) { data.cols = cols; continue; }
  const cells = cellsOf(line).map(unquote);
  if (cells.length < 2 || !cells[0]) continue;
  const indent = indentOf(raw);
  base ??= indent;
  data.rows.push({ name: cells[0], cells: cells.slice(1), depth: 0, indent });
  texts.push(...cells.slice(1));
 }
 const read = finish(data, texts);
 // A balance is a debit when positive or written with D after it, a credit when negative or written with C.
 const balance = text => { const a = text ? read(text) : null; return !a ? 0 : a.side === 'c' ? -Math.abs(a.value) : a.side === 'd' ? Math.abs(a.value) : a.value; };
 const turn = text => { const a = text ? read(text) : null; return a ? Math.abs(a.value) : 0; };
 // Accounts set in under another are its sub-accounts; the one above is their sum.
 const stack = [];
 for (const row of data.rows) {
  while (stack.length && stack[stack.length - 1].indent >= row.indent) stack.pop();
  row.parent = stack[stack.length - 1] || null;
  row.depth = stack.length;
  if (row.parent) (row.parent.children ||= []).push(row);
  stack.push(row);
  const c = row.cells, k = c.length;
  // Two numbers are the turnover; three the opening and the turnover; four, the closing balance too.
  if (k >= 4) Object.assign(row, { open: balance(c[0]), d: turn(c[1]), c: turn(c[2]), stated: balance(c[3]), given: true });
  else if (k === 3) Object.assign(row, { open: balance(c[0]), d: turn(c[1]), c: turn(c[2]) });
  else Object.assign(row, { open: 0, d: turn(c[0]), c: turn(c[1]) });
  row.close = row.open + row.d - row.c;
 }
 data.full = data.rows.some(row => row.cells.length >= 3);
 return data.rows.length ? data : null;
}

function trialScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 320, BOOKS.max), money = data.money, start = opening(data, W), { items, tips } = start;
 const top = data.rows.filter(row => !row.parent), sum = key => top.reduce((s, row) => s + row[key], 0);
 const dOf = v => v > 0 ? v : 0, cOf = v => v < 0 ? -v : 0;
 const totals = { od: top.reduce((s, r) => s + dOf(r.open), 0), oc: top.reduce((s, r) => s + cOf(r.open), 0), d: sum('d'), c: sum('c'), cd: top.reduce((s, r) => s + dOf(r.close), 0), cc: top.reduce((s, r) => s + cOf(r.close), 0) };
 const end = row => row.given ? row.stated : row.close;
 // Six columns, a debit and a credit for each of the three, where they fit; on a narrow page a balance is one
 // column with its side after it.
 const all = [...data.rows.flatMap(row => [row.open, row.d, row.c, end(row)]), ...Object.values(totals)].map(v => money.text(Math.abs(v)));
 const numW = Math.max(56, ...all.map(text => widthOf(text, FONT.strong))) + 4;
 const six = data.full && W - 6 * (numW + 10) >= 130, groups = data.full ? 3 : 1;
 const sideTag = v => money.same(v, 0) ? '' : ` ${v > 0 ? t('dr') : t('cr')}`;
 const cols = six
  ? [['od', r => dOf(r.open)], ['oc', r => cOf(r.open)], ['d', r => r.d], ['c', r => r.c], ['cd', r => dOf(end(r))], ['cc', r => cOf(end(r))]]
  : data.full ? [['o', r => r.open, true], ['d', r => r.d], ['c', r => r.c], ['e', r => end(r), true]] : [['d', r => r.d], ['c', r => r.c], ['e', r => end(r), true]];
 const colW = six ? numW : numW + widthOf(` ${t('dr')}`, FONT.amount);
 const xs = cols.map((_, k) => W - (cols.length - 1 - k) * (colW + 10)), nameW = xs[0] - colW - BOOKS.gap;
 let y = start.top + 6;
 // Headings short enough for a column of numbers: Opening, Closing, not the balance named in full.
 const heads = data.cols.length ? data.cols : data.full ? [t('start'), t('turnover'), t('end')] : [t('debit'), t('credit'), t('end')];
 if (six) {
  heads.slice(0, 3).forEach((word, g) => items.push(label(`tb:g${g}`, 0.2, (xs[g * 2] - colW + xs[g * 2 + 1]) / 2, y + 2, caps(word, colW * 2 + 6), 'middle', 'dg-eyebrow')));
  items.push(rule('tb:gr', 0.2, xs[0] - colW, y + 11, W));
  y += 18;
  cols.forEach((_, k) => items.push(label(`tb:h${k}`, 0.21, xs[k], y + 2, caps(k % 2 ? t('cr') : t('dr'), colW), 'end', 'dg-eyebrow')));
 } else {
  const words = data.full ? [heads[0], t('debit'), t('credit'), heads[2]] : [heads[0], heads[1], heads[2]];
  cols.forEach((_, k) => items.push(label(`tb:h${k}`, 0.21, xs[k], y + 2, caps(words[k] || '', colW), 'end', 'dg-eyebrow')));
 }
 y += 12;
 const problems = [];
 data.rows.forEach((row, i) => {
  const key = `tb:${i}`, order = 0.3 + i * 0.05, cy = y + 14, strong = !!row.children?.length, x = row.depth * 14;
  items.push(hit(key, order, y, 28, W));
  if (i) items.push(rule(`${key}:r`, order, 0, y, W));
  account(items, `${key}:n`, order, x, cy, row.name, nameW - x, strong ? 'dg-row-total' : 'dg-row-name');
  const notes = [];
  cols.forEach(([id, get, sided], k) => {
   const v = get(row);
   if (money.same(v, 0) && !sided) return;
   const shown = sided ? (money.same(v, 0) ? '—' : `${money.text(Math.abs(v))}${sideTag(v)}`) : money.text(v);
   items.push(label(`${key}:v${k}`, order + 0.01, xs[k], cy, shown, 'end', strong ? 'dg-row-total' : 'dg-row-value'));
  });
  // Its own sum: the closing balance from the opening one and the turnover, and a sum account against its parts.
  if (row.given && !money.same(row.stated, row.close)) notes.push([t('closing'), row.stated, row.close]);
  if (strong) for (const [name, get] of [[t('debit'), r => r.d], [t('credit'), r => r.c], [t('opening'), r => r.open]]) {
   const parts = row.children.reduce((s, r) => s + get(r), 0);
   if (!money.same(parts, get(row))) notes.push([name, get(row), parts]);
  }
  if (notes.length) {
   problems.push(notes[0][2] - notes[0][1]);
   items.push(dot(`${key}:off`, order + 0.02, x - 9 < 0 ? nameW - 2 : x - 9, cy, 'dg-state is-bad'));
   tips.set(key, { title: t('offTitle'), rows: notes.flatMap(([name, said, counted]) => [{ name: `${name} · ${t('stated')}`, value: money.text(said) }, { name: `${name} · ${t('counted')}`, value: money.text(counted) }]), hot: [key] });
  } else tips.set(key, { silent: true });
  y += 28;
 });
 items.push(rule('tb:sum', 0.8, 0, y + 1, W, 'dg-line'));
 const totalRow = six ? [totals.od, totals.oc, totals.d, totals.c, totals.cd, totals.cc].map(v => money.text(v)) : data.full ? ['', money.text(totals.d), money.text(totals.c), ''] : [money.text(totals.d), money.text(totals.c), ''];
 items.push(label('tb:sum:n', 0.81, 0, y + 16, t('total'), 'start', 'dg-row-total'));
 totalRow.forEach((text, k) => { if (text) items.push(label(`tb:sum:${k}`, 0.82, xs[k], y + 16, text, 'end', 'dg-row-total')); });
 y += 34;
 const pairs = [[t('turnover'), totals.d, totals.c], ...(data.full ? [[t('opening'), totals.od, totals.oc], [t('closing'), totals.cd, totals.cc]] : [])], bad = pairs.find(([, a, b]) => !money.same(a, b));
 const ok = !bad && !problems.length;
 y += verdict(items, 0.9, y, W, ok, ok ? t('trialOk') : bad ? t('trialOff', { what: bad[0], n: money.text(Math.abs(bad[1] - bad[2])) }) : t('offBy', { n: money.text(Math.abs(problems[0])) }));
 const rows = [[t('account'), `${t('opening')} ${t('dr')}`, `${t('opening')} ${t('cr')}`, t('debit'), t('credit'), `${t('closing')} ${t('dr')}`, `${t('closing')} ${t('cr')}`], ...data.rows.map(row => [`${'  '.repeat(row.depth)}${row.name}`, money.cell(dOf(row.open)), money.cell(cOf(row.open)), money.cell(row.d), money.cell(row.c), money.cell(dOf(end(row))), money.cell(cOf(end(row)))])];
 return scene('trial', data, W, y + 2, start, { tsv: tsv(rows) });
}

/* Financial statements: a balance sheet, a profit and loss statement, any report made of sections and sums */

function parseReport(lines) {
 const data = { ...blank(), parts: [], check: null }, texts = [];
 let section = null;
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  if (!line || common(line, data)) continue;
  const check = /^check(?:\s*:\s*|\s+)(.+?)\s*=\s*(.+)$/.exec(line);
  if (check) { data.check = { left: check[1].split(/\s*\+\s*/).map(unquote), right: check[2].split(/\s*\+\s*/).map(unquote) }; continue; }
  const cells = cellsOf(line).map(unquote), sum = /^=\s*(.+)$/.exec(cells[0]);
  // `= Name` sums every row above it, as a profit and loss statement goes from revenue down to the profit.
  if (sum) { data.parts.push({ kind: 'sum', name: sum[1], amount: cells[1] || '' }); texts.push(cells[1] || ''); section = null; continue; }
  if (cells.length === 1 || (cells.length > 1 && !cells.slice(1).some(Boolean))) { section = { kind: 'section', name: cells[0], rows: [] }; data.parts.push(section); continue; }
  const row = { name: cells[0], amount: cells[1], note: cells.slice(2).filter(Boolean).join(' · ') };
  texts.push(cells[1]);
  if (section) section.rows.push(row);
  else data.parts.push({ kind: 'row', ...row });
 }
 const read = finish(data, texts);
 let running = 0;
 for (const part of data.parts) {
  if (part.kind === 'section') { for (const row of part.rows) { row.value = read(row.amount)?.value ?? 0; running += row.value; } part.total = part.rows.reduce((s, row) => s + row.value, 0); }
  else if (part.kind === 'row') { part.value = read(part.amount)?.value ?? 0; running += part.value; }
  else { part.value = running; part.stated = read(part.amount)?.value; }
 }
 return data.parts.some(part => part.kind !== 'sum') ? data : null;
}

function reportScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, BOOKS.max), money = data.money, start = opening(data, W), { items, tips } = start;
 const sectionOf = name => data.parts.find(part => part.kind === 'section' && part.name.trim().toLowerCase() === name.trim().toLowerCase());
 const check = data.check && [...data.check.left, ...data.check.right].every(sectionOf) ? data.check : null;
 // A balance sheet stands in two columns, what the company has beside where it came from, when the page is wide enough.
 const two = check && W >= 540;
 const colW = two ? (W - 36) / 2 : W;
 const problems = [];
 const draw = (parts, x0, y0, tag) => {
  let y = y0;
  parts.forEach((part, i) => {
   const order = 0.2 + i * 0.1 + (tag === 'r' ? 0.05 : 0), key = `rp:${tag}${i}`;
   if (part.kind === 'section') {
    if (i) y += 10;
    items.push(label(`${key}:h`, order, x0, y + 8, caps(part.name, colW), 'start', 'dg-eyebrow'));
    y += 18;
    part.rows.forEach((row, k) => {
     const rk = `${key}:${k}`, cy = y + 12;
     items.push(hit(rk, order + 0.01, y, 24, colW));
     items[items.length - 1].props.x = x0 - 8;
     tips.set(rk, { silent: true });
     items.push(label(`${rk}:n`, order + 0.01 + k * 0.005, x0, cy, truncate(row.name, colW - 110, ...FONT.row), 'start', 'dg-row-name'));
     items.push(label(`${rk}:v`, order + 0.02 + k * 0.005, x0 + colW, cy, money.text(row.value), 'end', 'dg-row-value'));
     y += 24;
    });
    items.push(rule(`${key}:r`, order + 0.05, x0, y + 1, x0 + colW));
    items.push(label(`${key}:tn`, order + 0.06, x0, y + 14, truncate(`${t('total')} · ${part.name}`, colW - 110, ...FONT.strong), 'start', 'dg-row-total'));
    items.push(label(`${key}:tv`, order + 0.06, x0 + colW, y + 14, money.text(part.total), 'end', 'dg-row-total'));
    y += 28;
   } else if (part.kind === 'row') {
    items.push(label(`${key}:n`, order, x0, y + 12, truncate(part.name, colW - 110, ...FONT.row), 'start', 'dg-row-name'));
    items.push(label(`${key}:v`, order + 0.01, x0 + colW, y + 12, money.signed(part.value), 'end', 'dg-row-value'));
    y += 24;
   } else {
    items.push(rule(`${key}:r`, order, x0, y + 3, x0 + colW, 'dg-line'));
    const shown = money.text(Number.isFinite(part.stated) ? part.stated : part.value);
    items.push(hit(key, order, y + 3, 32, colW));
    items[items.length - 1].props.x = x0 - 8;
    items.push(label(`${key}:n`, order + 0.01, x0, y + 20, truncate(part.name, colW - 130, ...FONT.strong), 'start', 'dg-row-total'));
    items.push(label(`${key}:v`, order + 0.02, x0 + colW, y + 20, shown, 'end', 'dg-books-figure'));
    if (Number.isFinite(part.stated) && !money.same(part.stated, part.value)) {
     problems.push(part.value - part.stated);
     items.push(dot(`${key}:off`, order + 0.03, x0 + colW - widthOf(shown, FONT.center) - 10, y + 20, 'dg-state is-bad'));
     tips.set(key, { title: t('offTitle'), rows: [{ name: t('stated'), value: shown }, { name: t('counted'), value: money.text(part.value) }], hot: [key] });
    } else tips.set(key, { silent: true });
    y += 40;
   }
  });
  return y;
 };
 let y = start.top + 4;
 if (two) {
  const left = check.left.map(sectionOf), right = check.right.map(sectionOf), rest = data.parts.filter(part => !left.includes(part) && !right.includes(part));
  y = Math.max(draw(left, 0, y, 'l'), draw(right, colW + 36, y, 'r'));
  if (rest.length) y = draw(rest, 0, y + 6, 'x');
 } else y = draw(data.parts, 0, y, 'a');
 if (check) {
  const a = check.left.reduce((s, name) => s + sectionOf(name).total, 0), b = check.right.reduce((s, name) => s + sectionOf(name).total, 0), ok = money.same(a, b);
  y += 6 + verdict(items, 0.95, y + 6, W, ok, ok ? `${check.left.join(' + ')} = ${check.right.join(' + ')} · ${money.text(a)}` : t('notBalanced', { n: money.text(Math.abs(a - b)) }));
 } else if (problems.length) y += 6 + verdict(items, 0.95, y + 6, W, false, t('offBy', { n: money.text(Math.abs(problems[0])) }));
 const rows = [];
 for (const part of data.parts) {
  if (part.kind === 'section') { rows.push([part.name, '']); for (const row of part.rows) rows.push([`  ${row.name}`, money.cell(row.value)]); rows.push([`${t('total')} · ${part.name}`, money.cell(part.total)]); }
  else rows.push([part.kind === 'sum' ? `= ${part.name}` : part.name, money.cell(part.value)]);
 }
 return scene('report', data, W, y + 2, start, { tsv: tsv(rows) });
}

/* A tax worked out: bases and rates, what is due, what is deducted, and what is left to pay or to get back */

function parseTax(lines) {
 const data = { ...blank(), raw: [] }, texts = [];
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  if (!line || common(line, data)) continue;
  const cells = cellsOf(line).map(unquote);
  if (cells.length < 2 && !/^=/.test(cells[0])) continue;
  data.raw.push(cells);
  texts.push(...cells.slice(1));
 }
 const read = finish(data, texts), rate = text => { const m = /^([+-]?\d+(?:[.,]\d+)?)\s*%$/.exec(String(text).trim()); return m ? parseFloat(m[1].replace(',', '.')) / 100 : NaN; };
 data.rows = [];
 let base = null, total = 0;
 data.raw.forEach((cells, i) => {
  const name = cells[0], sum = /^=\s*(.*)$/.exec(name), first = cells[1] || '', times = /^(.+?)\s*[×xх*]\s*(\d+(?:[.,]\d+)?\s*%)$/u.exec(first);
  if (sum) { data.result = { name: sum[1] || t('result'), stated: read(first)?.value, value: total }; return; }
  // Name | 18% is the rate for the base above it; Name | 18% | 18 000,00 also says what the model counted.
  if (Number.isFinite(rate(first)) || times) {
   const r = times ? rate(times[2]) : rate(first), b = times ? read(times[1])?.value : base?.value;
   if (!Number.isFinite(b)) return;
   if (times) data.rows.push({ kind: 'base', name, value: b });
   const value = b * r;
   data.rows.push({ kind: 'tax', name, rate: r, base: b, value, stated: read(cells[2] || '')?.value });
   total += Number.isFinite(read(cells[2] || '')?.value) ? read(cells[2]).value : value;
   base = null;
   return;
  }
  const a = read(first);
  if (!a) return;
  // An amount just before a rate is its base and is not added up; any other amount adds or takes off.
  const next = data.raw[i + 1]?.[1] || '';
  if (Number.isFinite(rate(next))) { base = { kind: 'base', name, value: a.value }; data.rows.push(base); return; }
  data.rows.push({ kind: 'move', name, value: a.value, note: cells.slice(2).filter(Boolean).join(' · ') });
  total += a.value;
 });
 data.total = total;
 if (data.result) data.result.value = total;
 return data.rows.some(row => row.kind !== 'base') ? data : null;
}

function taxScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, BOOKS.max), money = data.money, start = opening(data, W), { items, tips } = start;
 const opX = 0, nameX = 22;
 let y = start.top + 4;
 const problems = [];
 // A rate the way the country writes it: 19 % in Germany and France, 19% in England, ١٥٪ in Arabic.
 const percent = r => new Intl.NumberFormat(data.locale || undefined, { style: 'percent', maximumFractionDigits: 3 }).format(r).replace(/^-/, '−');
 data.rows.forEach((row, i) => {
  const key = `tx:${i}`, order = 0.2 + i * 0.07, cy = y + 14;
  items.push(hit(key, order, y, 28, W));
  tips.set(key, { silent: true });
  if (i && row.kind !== 'tax') items.push(rule(`${key}:r`, order, nameX, y, W));
  const op = row.kind === 'tax' ? '×' : row.kind === 'base' ? '' : row.value < 0 ? '−' : '+';
  if (op) items.push(label(`${key}:op`, order, opX, cy, op, 'start', 'dg-books-op'));
  // The rate is said after the name, unless the name says it already: Umsatzsteuer 19 %.
  const name = row.kind === 'tax' && !/\d\s*%/.test(row.name) ? `${row.name} · ${percent(row.rate)}` : row.name;
  items.push(label(`${key}:n`, order + 0.01, nameX, cy, truncate(name, W - nameX - 130, ...FONT.row), 'start', row.kind === 'base' ? 'dg-row-name is-quiet' : 'dg-row-name'));
  const value = row.kind === 'move' ? Math.abs(row.value) : row.value, shown = money.text(Number.isFinite(row.stated) ? row.stated : value);
  items.push(label(`${key}:v`, order + 0.02, W, cy, shown, 'end', row.kind === 'base' ? 'dg-row-note' : 'dg-row-value'));
  if (row.kind === 'tax' && Number.isFinite(row.stated) && !money.same(row.stated, row.value)) {
   problems.push(row.value - row.stated);
   items.push(dot(`${key}:off`, order + 0.03, W - widthOf(shown, FONT.amount) - 9, cy, 'dg-state is-bad'));
   tips.set(key, { title: t('offTitle'), rows: [{ name: t('stated'), value: shown }, { name: t('counted'), value: `${money.text(row.base)} × ${percent(row.rate)} = ${money.text(row.value)}` }], hot: [key] });
  }
  y += 28;
 });
 // What is left: to pay when it is more than nothing, to get back or carry over when it is less.
 const result = data.result || { name: '', value: data.total }, value = Number.isFinite(result.stated) ? result.stated : result.value;
 items.push(rule('tx:sum', 0.8, 0, y + 4, W, 'dg-line'));
 items.push(label('tx:sum:op', 0.81, opX, y + 24, '=', 'start', 'dg-books-op'));
 items.push(label('tx:sum:n', 0.82, nameX, y + 24, truncate(result.name || (value < 0 ? t('refund') : t('toPay')), W - nameX - 150, ...FONT.strong), 'start', 'dg-row-total'));
 const shown = money.text(Math.abs(value));
 items.push(label('tx:sum:v', 0.83, W, y + 24, shown, 'end', 'dg-books-figure'));
 if (result.name) items.push(label('tx:sum:w', 0.84, W, y + 44, value < 0 ? t('refund') : t('toPay'), 'end', 'dg-row-note'));
 items.push(hit('tx:sum', 0.8, y + 6, 46, W));
 tips.set('tx:sum', { silent: true });
 if (Number.isFinite(result.stated) && !money.same(result.stated, result.value)) {
  problems.push(result.value - result.stated);
  items.push(dot('tx:sum:off', 0.85, W - widthOf(shown, FONT.center) - 10, y + 24, 'dg-state is-bad'));
  tips.set('tx:sum', { title: t('offTitle'), rows: [{ name: t('stated'), value: money.text(result.stated) }, { name: t('counted'), value: money.text(result.value) }], hot: ['tx:sum'] });
 }
 y += result.name ? 56 : 42;
 const checked = data.rows.some(row => Number.isFinite(row.stated)) || Number.isFinite(result.stated);
 if (checked) y += 6 + verdict(items, 0.9, y + 6, W, !problems.length, problems.length ? t('offBy', { n: money.text(Math.abs(problems[0])) }) : t('sumsOk'));
 const rows = [...data.rows.map(row => [row.kind === 'tax' ? `${row.name} ${percent(row.rate)}` : row.name, money.cell(row.kind === 'tax' && Number.isFinite(row.stated) ? row.stated : row.value)]), [result.name || t('result'), money.cell(value)]];
 return scene('tax', data, W, y + 2, start, { tsv: tsv(rows) });
}

/* Debts by age: who owes, or whom we owe, and how long it is overdue */

function dayOf(text, locale) {
 const s = String(text ?? '').trim();
 let m;
 if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return Date.UTC(+m[1], m[2] - 1, +m[3]);
 if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s))) {
  const a = +m[1], b = +m[2], year = +m[3] < 100 ? 2000 + +m[3] : +m[3];
  // Month first where the country writes it so, and where the day could not be the first number.
  const monthFirst = b > 12 || (a <= 12 && /^en-(US|PH)|^fil/i.test(locale || navigator.language || ''));
  return monthFirst ? Date.UTC(year, a - 1, b) : Date.UTC(year, b - 1, a);
 }
 return NaN;
}

const OVERDUE = /(?:^|\D)(\d{1,4})\s*(?:дн\p{L}*|д\.|days?\b|d\b|jours?\b|j\b|giorn[oi]\b|dias?\b|días?\b|dni\b|dzie\p{L}*|tage?n?\b|gün\b)/iu;
function parseAging(lines) {
 const data = { ...blank(), buckets: [], asof: '', rows: [] }, texts = [];
 let group = null, base = null;
 for (const raw of lines.slice(1)) {
  const line = bare(raw);
  if (!line || common(line, data)) continue;
  const buckets = listLine(line, 'buckets');
  if (buckets) { data.buckets = buckets.filter(Boolean); continue; }
  const asof = /^as of(?:\s*:\s*|\s+)(.+)$/.exec(line);
  if (asof) { data.asof = unquote(asof[1]); continue; }
  const cells = cellsOf(line).map(unquote), indent = indentOf(raw);
  base ??= indent;
  // A name alone opens a counterparty; its documents are the lines set in under it.
  if (cells.length === 1) { group = { name: cells[0], cells: [], docs: [] }; data.rows.push(group); continue; }
  texts.push(...cells.slice(1));
  if (group && indent > base) group.docs.push(cells);
  else { group = null; data.rows.push({ name: cells[0], cells: cells.slice(1), docs: [] }); }
 }
 const read = finish(data, texts), now = data.asof ? dayOf(data.asof, data.locale) : Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
 // Written with dates, a debt falls into the bucket of the days since it was due; written with buckets, as it stands.
 const byDate = !data.buckets.length;
 const LIMITS = [0, 30, 60, 90];
 if (byDate) data.buckets = [t('current'), t('days', { n: '1–30' }), t('days', { n: '31–60' }), t('days', { n: '61–90' }), t('days', { n: '90+' })];
 const n = data.buckets.length;
 for (const row of data.rows) {
  row.values = Array(n).fill(0);
  const docs = row.docs.length ? row.docs : row.cells.length ? [[row.name, ...row.cells]] : [];
  row.count = row.docs.length;
  for (const doc of docs) {
   const cells = doc.slice(1);
   if (byDate) {
    const a = read(cells[0]), due = cells.slice(1).map(cell => dayOf(cell, data.locale)).find(Number.isFinite);
    if (!a) continue;
    // The days overdue may be written as words (просрочка 10 дней, 45 днів, 30 days overdue, 12 jours, 7 dni): they
    // are the days, before any date.
    const late = cells.slice(1).map(cell => OVERDUE.exec(String(cell))).find(Boolean);
    const days = late ? Number(late[1]) : Number.isFinite(due) && Number.isFinite(now) ? Math.round((now - due) / 86400000) : 0;
    const k = days <= LIMITS[0] ? 0 : days <= LIMITS[1] ? 1 : days <= LIMITS[2] ? 2 : days <= LIMITS[3] ? 3 : 4;
    row.values[k] += Math.abs(a.value);
   } else cells.slice(0, n).forEach((cell, k) => { const a = cell ? read(cell) : null; if (a) row.values[k] += Math.abs(a.value); });
  }
  row.total = row.values.reduce((s, v) => s + v, 0);
 }
 data.rows = data.rows.filter(row => row.total > 0);
 // The first bucket is the money not yet due when the drawing counted by dates, or when it is named so.
 data.current = byDate || /^(?:current|not due|не просроч\S*|в срок|a vencer|a vencer|corriente|non échu|non scadut[oa]|nicht fällig)/iu.test(data.buckets[0] || '');
 return data.rows.length ? data : null;
}

function agingScene(data, tones, { width }) {
 if (!data) return null;
 const W = clamp(width, 300, BOOKS.max), money = data.money, start = opening(data, W), { items, tips } = start, n = data.buckets.length, tone = tones[0];
 const level = k => n > 1 ? Math.round(k * (AGES - 1) / (n - 1)) : AGES - 1;
 let y = start.top + 4;
 if (data.asof) { items.push(label('ag:asof', 0.11, 0, y + 6, `${t('asOf')} ${data.asof}`, 'start', 'dg-row-note')); y += 18; }
 // The legend: one colour growing darker with age, so the eye finds the oldest money first.
 let x = 0, row = y + 8;
 data.buckets.forEach((word, k) => {
  const w = 14 + widthOf(word, FONT.tick) + 16;
  if (x && x + w - 16 > W) { x = 0; row += 18; }
  items.push({ key: `ag:lg${k}`, type: 'rect', layer: 'nodes', order: 0.12 + k * 0.02, props: { x, y: row - 4, w: 8, h: 8 }, fixed: { cls: `dg-books-age is-a${level(k)}`, tone, rx: 2 } });
  items.push(label(`ag:lw${k}`, 0.13 + k * 0.02, x + 14, row, word, 'start', 'dg-row-note'));
  x += w;
 });
 y = row + 18;
 const most = Math.max(...data.rows.map(r => r.total)), totalW = Math.max(...data.rows.map(r => widthOf(money.text(r.total), FONT.amount)));
 const nameW = Math.min(W * 0.36, 220, Math.max(...data.rows.map(r => widthOf(r.name, FONT.row)))), barX = nameW + BOOKS.gap, barW = Math.max(60, W - barX - totalW - BOOKS.gap);
 data.rows.forEach((r, i) => {
  const key = `ag:${i}`, order = 0.3 + i * 0.07, h = r.count ? 40 : BOOKS.row, cy = r.count ? y + 14 : y + h / 2;
  items.push(hit(key, order, y, h, W));
  if (i) items.push(rule(`${key}:r`, order, 0, y, W));
  items.push(label(`${key}:n`, order, 0, cy, truncate(r.name, nameW, ...FONT.row), 'start', 'dg-row-name'));
  if (r.count) items.push(label(`${key}:c`, order + 0.01, 0, cy + 15, t('docs', { n: r.count }), 'start', 'dg-row-note'));
  // The parts of one bar, each the money of an age, with a gap of the surface between them.
  let bx = barX;
  r.values.forEach((v, k) => {
   if (!v) return;
   const w = Math.max(3, v / most * barW - 2);
   items.push({ key: `${key}:b${k}`, type: 'span', order: order + 0.02 + k * 0.02, props: { x: bx, y: cy, w, h: 8 }, fixed: { cls: `dg-books-age is-a${level(k)}`, tone, rx: 2 } });
   bx += w + 2;
  });
  items.push(label(`${key}:t`, order + 0.1, W, cy, money.text(r.total), 'end', 'dg-row-value'));
  tips.set(key, { title: r.name, rows: r.values.map((v, k) => v ? { name: data.buckets[k], value: money.text(v), tone, mark: 'bar' } : null).filter(Boolean), hot: [key] });
  y += h;
 });
 // Under the rows, how much each age holds and its share of all.
 const sums = data.buckets.map((_, k) => data.rows.reduce((s, r) => s + r.values[k], 0)), all = sums.reduce((s, v) => s + v, 0);
 items.push(rule('ag:sum', 0.8, 0, y + 4, W, 'dg-line'));
 y += 14;
 const per = Math.max(1, Math.min(n, Math.floor(W / 96))), colW = W / per;
 sums.forEach((v, k) => {
  const cx = (k % per) * colW, cy = y + Math.floor(k / per) * 50, order = 0.82 + k * 0.02;
  items.push(label(`ag:s${k}:w`, order, cx, cy + 6, caps(data.buckets[k], colW - 8), 'start', 'dg-eyebrow'));
  items.push(label(`ag:s${k}:v`, order + 0.01, cx, cy + 25, truncate(money.text(v), colW - 8, ...FONT.strong), 'start', 'dg-row-total'));
  items.push(label(`ag:s${k}:p`, order + 0.01, cx, cy + 41, all ? `${new Intl.NumberFormat(data.locale || undefined, { maximumFractionDigits: 1 }).format(v / all * 100)}%` : '', 'start', 'dg-row-note'));
 });
 y += Math.ceil(n / per) * 50 + 4;
 if (data.current && n > 1) {
  const overdue = all - sums[0], share = all ? overdue / all * 100 : 0;
  items.push(dot('ag:od', 0.9, 3.5, y + 8, `dg-state is-${overdue > 0 ? 'warn' : 'good'}`));
  items.push(label('ag:odt', 0.91, 13, y + 8, `${t('overdue')} ${money.text(overdue)} · ${new Intl.NumberFormat(data.locale || undefined, { maximumFractionDigits: 1 }).format(share)}%`, 'start', 'dg-row-total'));
  y += 22;
 }
 const rows = [['', ...data.buckets, t('total')], ...data.rows.map(r => [r.name, ...r.values.map(v => v ? money.cell(v) : ''), money.cell(r.total)]), [t('total'), ...sums.map(v => money.cell(v)), money.cell(all)]];
 return scene('aging', data, W, y + 2, start, { tsv: tsv(rows) });
}

/* The kinds, by the word their first line opens with */

const KINDS = [
 [/^(invoice|bill)\b/i, parseInvoice, invoiceScene],
 [/^(statement|bank)\b/i, parseStatement, statementScene],
 [/^(entries|journal|postings)\b/i, parseEntries, entriesScene],
 [/^(t-?accounts)\b/i, parseEntries, taccountsScene],
 [/^(reconcile|reconciliation)\b/i, parseReconcile, reconcileScene],
 [/^(match|matching)\b/i, parseMatch, matchScene],
 [/^(trial|trial-?balance|turnover)\b/i, parseTrial, trialScene],
 [/^(report|balance|pnl|income)\b/i, parseReport, reportScene],
 [/^(tax|vat)\b/i, parseTax, taxScene],
 [/^(aging|ageing)\b/i, parseAging, agingScene],
];
for (const [test, read, draw] of KINDS) D.addKind(test, (lines, tones, options) => draw(read(lines), tones, options), 'column', test);

// What a drawing's lines are read into, for tests: the same reading the drawing is made from.
const parse = source => {
 const lines = String(source).split(/\r?\n/).filter(line => line.trim()), kind = KINDS.find(([test]) => test.test(lines[0]?.trim() || ''));
 return kind ? kind[1](lines) : null;
};

window.DiagramBooks = { readMoney, moneyOf, styleOf, dayOf, parse };
})();

