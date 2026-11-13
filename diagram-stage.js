(() => {
'use strict';

// The drawing editor, a stage over the whole window as the model picker is. The drawing flies out of the chat to the
// left of the stage and is drawn there larger; beside it a pane of glass lists what it is made of, block by block,
// arrow by arrow, value by value, each part edited in its own line and dragged by its grip to another place. Every
// change redraws the drawing at once, its parts gliding to where they now go. Done, Escape or a press beside the pane
// flies the drawing back into the chat with the changes; "Undo changes" sets it back as it was.

const LAYOUT = { pane: 360, gap: 24, enlarge: 1.6, least: 0.55 };
const MOTION = { fly: 560, back: 460, ease: 'cubic-bezier(0.32, 0.72, 0, 1)', settle: 'cubic-bezier(0.2, 0.9, 0.3, 1.15)' };
const DEBOUNCE = 90;
// How far apart rows keep while one is dragged among them, as their gap in the stylesheet.
const ROW_GAP = 2;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const t = key => I18n.t(key);
const make = (tag, cls, parent, text) => {
 const el = document.createElement(tag);
 if (cls) el.className = cls;
 if (text !== undefined) el.textContent = text;
 parent?.append(el);
 return el;
};
const words = text => String(text ?? '').replace(/\n/g, ' ').trim();
const move = (list, from, to) => { const [item] = list.splice(from, 1); list.splice(to, 0, item); };
const series = k => `rgb(var(--s${(k % 7) + 1}))`;
const GRIP = '<svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/></svg>';
const CROSS = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';
const PLUS = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 2v8M2 6h8"/></svg>';
const CHEVRON = '<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4l2.5 2.5L7.5 4"/></svg>';

// A block of a scheme is written as its name in bold over a quiet detail; in the list they are two lines of their own.
const splitName = text => {
 const value = String(text ?? '');
 const bold = /^\*\*(.+?)\*\*\s*(?:\n([\s\S]*))?$/.exec(value);
 if (bold) return { name: bold[1], detail: (bold[2] || '').replace(/\n/g, ' ').trim(), bold: true };
 const [name, ...rest] = value.split('\n');
 return { name, detail: rest.join(' ').trim(), bold: false };
};
const joinName = ({ name, detail, bold }) => detail.trim() ? `**${name.trim()}**\n${detail.trim()}` : bold && name.trim() ? `**${name.trim()}**` : name;

class DiagramStage {
 static open(view) {
  if (DiagramStage.current || !view?.result) return null;
  return (DiagramStage.current = new DiagramStage(view));
 }

 constructor(view) {
  this.view = view;
  this.original = view.good;
  this.adapter = Diagram.edit.editorFor(view.result);
  this.model = this.read(view.good);
  this.mode = this.model ? 'data' : 'code';
  this.timer = 0;
  this.closing = false;
  this.lit = null;
  this.build();
  this.renderList();
  this.setMode(this.mode);
  this.syncReset();
  this.enter();
 }

 read(source) {
  return this.adapter?.read(Diagram.edit.withHeader(source, this.view.kind)) || null;
 }

 /* The stage */

 build() {
  const view = this.view, root = this.root = make('div', 'ds');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t('diagram.edit'));
  this.veil = make('div', 'ds-veil', root);
  const area = this.area = make('div', 'ds-area', root);
  const head = this.head = make('div', 'ds-head', area);
  make('div', 'ds-sub', head, t('edit.stageHint'));
  const holder = this.holder = make('div', 'ds-drawing', area);
  const host = this.host = make('div', view.el.className.replace(/\bis-staged\b/, ''), holder);
  host.dataset.kind = view.kind;
  host.style.fontSize = getComputedStyle(view.el).fontSize;
  this.ring = make('div', 'ds-ring', holder);
  const pane = this.pane = make('div', 'ds-pane glass-lens', root);
  const bar = make('div', 'ds-bar', pane);
  this.modes = make('div', 'ds-modes', bar);
  this.modes.setAttribute('role', 'tablist');
  for (const mode of ['data', 'code']) {
   const button = make('button', '', this.modes, t(mode === 'data' ? 'edit.visual' : 'edit.code'));
   button.type = 'button';
   button.dataset.mode = mode;
   button.setAttribute('role', 'tab');
   button.addEventListener('click', () => this.setMode(mode, true));
  }
  this.modes.hidden = !this.model;
  make('span', 'ds-space', bar);
  const done = make('button', 'ds-done', bar, t('edit.done'));
  done.type = 'button';
  done.addEventListener('click', () => this.close());
  const body = this.body = make('div', 'ds-body', pane);
  this.list = make('div', 'ds-list', body);
  this.code = make('textarea', 'ds-code', body);
  this.code.spellcheck = false;
  this.code.setAttribute('autocapitalize', 'off');
  this.code.setAttribute('aria-label', t('edit.code'));
  this.code.addEventListener('input', () => this.schedule(() => this.code.value));
  this.code.addEventListener('keydown', event => {
   if (event.key !== 'Tab' || event.shiftKey) return;
   event.preventDefault();
   this.code.setRangeText('  ', this.code.selectionStart, this.code.selectionEnd, 'end');
   this.code.dispatchEvent(new Event('input'));
  });
  const track = make('div', 'scrollbar ds-scrollbar', pane);
  track.setAttribute('aria-hidden', 'true');
  make('div', 'scrollbar-thumb', track);
  this.scrollbar = new Scrollbar(body, track, { autoHide: true });
  this.scrollbar.observe(this.list);
  const foot = make('div', 'ds-foot', pane);
  this.options = make('div', 'ds-options', foot);
  this.hint = make('div', 'ds-hint', foot);
  this.resetButton = make('button', 'ds-reset', foot, t('edit.reset'));
  this.resetButton.type = 'button';
  this.resetButton.addEventListener('click', () => this.reset());
  root.popover = 'manual';
  document.body.append(root);
  root.showPopover();

  // The drawing of the stage: the chat's own, drawn again in this room and larger, without the chat's tools.
  const size = this.enlargement();
  host.style.width = `${Math.round(view.available() * size)}px`;
  this.drawing = Diagram.view(host, () => this.follow(), { instant: true, bare: true, enlarge: size, mirror: view });
  this.drawing.update(view.good);
  this.centre();

  root.addEventListener('keydown', event => {
   if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); this.close(); }
   else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); this.close(); }
  });
  // A press on the stage beside the drawing and the pane is done (the drawing's own empty ground counts as beside);
  // on a block of the drawing, it goes to its line.
  area.addEventListener('pointerdown', event => {
   const node = event.target.closest?.('.dg-node');
   if (node) { this.findRow(node.dataset.key); return; }
   if (!event.target.closest('.ds-drawing [data-key]')) this.pressedBeside = true;
  });
  area.addEventListener('click', event => {
   if (this.pressedBeside && !event.target.closest('.ds-drawing [data-key]')) this.close();
   this.pressedBeside = false;
  });
  this.body.addEventListener('scroll', () => this.place(), { passive: true });
  window.addEventListener('resize', this.onResize = () => this.place());
 }

 // How much larger than in the chat the drawing is drawn here: as much as its room on the stage takes, up to a limit;
 // in a low room (a narrow window, the pane under the drawing) smaller, so it is seen whole.
 enlargement() {
  const room = this.holder.getBoundingClientRect(), box = this.view.canvas.getBoundingClientRect();
  if (!box.width || !box.height || !room.width) return 1;
  const k = Math.min((room.width - 32) / box.width, (room.height - 32) / box.height, LAYOUT.enlarge);
  return Math.max(LAYOUT.least, k);
 }

 // The stage's drawing is laid out for the chat's whole room, wider than the drawing itself, and a figure that keeps to
 // the text's edge stands off the middle of it: the drawing itself is set in the middle of the stage.
 centre() {
  const room = this.holder.getBoundingClientRect(), box = this.drawing.canvas.getBoundingClientRect();
  if (!box.width) return;
  this.host.style.left = `${Math.round(room.left + room.width / 2 - (box.left + box.width / 2))}px`;
 }

 enter() {
  const view = this.view, from = view.canvas.getBoundingClientRect(), to = this.drawing.canvas.getBoundingClientRect();
  view.editing = true;
  view.frame.classList.add('is-staged');
  // A window of glass takes an opaque ground under the veil, as for the model picker, or the sidebar stays sharp.
  document.documentElement.classList.add('is-staging');
  this.root.classList.add('is-open');
  const first = this.list.querySelector('input, textarea, select') || this.pane;
  if (reducedMotion() || !from.width || !to.width) {
   for (const el of [this.veil, this.pane, this.head]) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  } else {
   // While the drawing flies, the ring that marks a block stays away: it would be set on a drawing still on its way.
   this.flying = true;
   const start = this.fit(to, from, this.holder.getBoundingClientRect());
   const fly = this.holder.animate([{ transformOrigin: '0 0', transform: `translate(${start.x}px, ${start.y}px) scale(${start.k})` }, { transformOrigin: '0 0', transform: 'none' }], { duration: MOTION.fly, easing: MOTION.ease });
   const landed = () => { this.flying = false; this.place(); };
   fly.finished.then(landed, landed);
   this.veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
   this.pane.animate([{ opacity: 0, transform: 'translateX(28px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 70, easing: MOTION.ease, fill: 'backwards' });
   this.head.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 160, easing: MOTION.ease, fill: 'backwards' });
  }
  (this.mode === 'code' ? this.code : first).focus({ preventScroll: true });
 }

 // The move and scale (from the holder's top left corner) that set one box of the stage's drawing over another box:
 // as wide as it, centre on centre. The two are drawn for rooms of different widths and may differ in height a little;
 // centred, the difference is shared above and below instead of piling up at the foot.
 fit(box, target, holder) {
  const k = target.width / box.width;
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  return { k, x: target.left + target.width / 2 - holder.left - (cx - holder.left) * k, y: target.top + target.height / 2 - holder.top - (cy - holder.top) * k };
 }

 close() {
  if (this.closing) return;
  this.closing = true;
  this.flush();
  clearTimeout(this.timer);
  const view = this.view, source = this.drawing.good;
  view.adopt(source, this.drawing);
  document.documentElement.classList.remove('is-staging');
  const finish = () => {
   view.frame.classList.remove('is-staged');
   view.frame.style.opacity = '';
   this.root.remove();
   window.removeEventListener('resize', this.onResize);
   DiagramStage.current = null;
   view.frame.querySelector('[data-action="edit"]')?.focus({ preventScroll: true, focusVisible: false });
  };
  const from = this.drawing.canvas.getBoundingClientRect(), holder = this.holder.getBoundingClientRect();
  if (reducedMotion() || !from.width || !view.canvas.getBoundingClientRect().width) { finish(); return; }
  this.root.classList.add('is-closing');
  this.veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.back - 60, easing: 'ease-in', fill: 'forwards' });
  this.pane.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(24px) scale(0.97)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
  this.head.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
  this.ring.style.opacity = '0';
  // The flight home aims, frame by frame, at where the chat's drawing stands now: a chat that moves under it (a drawing
  // grown taller by the changes, a reply still coming) does not leave it landing beside its place. Over its last part
  // the chat's own drawing comes up where it lands and the flying one gives way to it, so no swap is seen.
  view.frame.style.opacity = '0';
  view.frame.classList.remove('is-staged');
  const begin = performance.now(), smooth = (a, b, p) => { const u = Math.min(1, Math.max(0, (p - a) / (b - a))); return u * u * (3 - 2 * u); };
  const step = now => {
   const p = Math.min(1, (now - begin) / MOTION.back), e = 1 - (1 - p) ** 4;
   const goal = this.fit(from, view.canvas.getBoundingClientRect(), holder);
   const k = 1 + (goal.k - 1) * e;
   this.holder.style.transformOrigin = '0 0';
   this.holder.style.transform = `translate(${goal.x * e}px, ${goal.y * e}px) scale(${k})`;
   this.holder.style.opacity = String(1 - smooth(0.62, 1, p));
   view.frame.style.opacity = String(smooth(0.55, 0.95, p));
   if (p < 1) requestAnimationFrame(step); else finish();
  };
  requestAnimationFrame(step);
 }

 /* Changes */

 schedule(read) {
  this.pending = read;
  clearTimeout(this.timer);
  this.timer = setTimeout(() => this.flush(), DEBOUNCE);
 }

 flush() {
  clearTimeout(this.timer);
  const read = this.pending;
  if (!read) return;
  this.pending = null;
  const drawn = this.drawing.update(read());
  this.hint.textContent = drawn === false ? t('diagram.error') : '';
  this.hint.classList.toggle('is-shown', drawn === false);
  this.syncReset();
 }

 edited() {
  // The block a drawing opens with holds its title and settings, which the list has no lines for: it stays as written.
  const front = Diagram.edit.front(this.drawing.good);
  this.schedule(() => `${front}${front && !front.endsWith('\n') ? '\n' : ''}${this.adapter.write(this.model)}`);
 }

 syncReset() {
  this.resetButton.disabled = this.drawing.good === this.original && !this.pending;
 }

 reset() {
  clearTimeout(this.timer);
  this.pending = null;
  this.drawing.update(this.original);
  this.model = this.read(this.original);
  this.hint.textContent = '';
  this.hint.classList.remove('is-shown');
  this.renderList();
  if (this.mode === 'code') this.code.value = this.original;
  this.syncReset();
 }

 setMode(mode, user = false) {
  this.flush();
  if (mode === 'data') {
   const model = this.read(this.drawing.good);
   if (model) { this.model = model; this.renderList(); } else mode = 'code';
  }
  if (mode === 'code') this.code.value = this.drawing.good;
  this.mode = mode;
  this.pane.dataset.mode = mode;
  for (const button of this.modes.children) {
   button.classList.toggle('is-active', button.dataset.mode === mode);
   button.setAttribute('aria-selected', String(button.dataset.mode === mode));
  }
  this.light(null);
  this.scrollbar.update();
  if (user) (mode === 'code' ? this.code : this.list.querySelector('input, textarea, select'))?.focus({ preventScroll: true });
 }

 /* The list */

 renderList() {
  const m = this.model, list = this.list;
  list.replaceChildren();
  this.options.replaceChildren();
  this.rowsOf = new Map();
  this.colsOf = new Map();
  if (!m) return;
  const texts = m.fields.filter(entry => entry.kind !== 'select');
  for (const entry of m.fields.filter(entry => entry.kind === 'select')) this.options.append(this.choice(entry.options, entry.value, value => { entry.value = value; this.edited(); }, t(entry.label), 'is-quiet'));
  if (texts.length) {
   const section = this.section(t('edit.labels'));
   for (const entry of texts) section.rows.append(this.fieldRow(entry));
  }
  if (m.outline !== undefined) this.outlineSection(m);
  m.tables.forEach(table => this.tableSections(table));
 }

 section(title, add = null) {
  const section = make('section', 'ds-section', this.list);
  make('div', 'ds-eyebrow', section, title);
  section.rows = make('div', 'ds-rows', section);
  if (add) {
   const button = make('button', 'ds-add', section);
   button.type = 'button';
   button.innerHTML = `${PLUS}<span></span>`;
   button.lastChild.textContent = add.label;
   button.addEventListener('click', add.run);
  }
  return section;
 }

 fieldRow(entry) {
  const row = make('div', 'ds-row is-field');
  const main = make('div', 'ds-main', row);
  make('div', 'ds-label', main, t(entry.label));
  if (entry.kind === 'check') {
   row.classList.add('is-check');
   row.append(this.toggle(entry.value, value => { entry.value = value; this.edited(); }, t(entry.label)));
  } else main.append(this.input(entry.value, value => { entry.value = value; this.edited(); }, { kind: entry.kind, label: t(entry.label), placeholder: '—' }));
  return row;
 }

 outlineSection(m) {
  const section = this.section(t('edit.ideas'));
  const area = make('textarea', 'ds-outline', section.rows);
  area.spellcheck = false;
  area.value = m.outline;
  area.setAttribute('aria-label', t('edit.ideas'));
  const fit = () => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; };
  area.addEventListener('input', () => { m.outline = area.value; fit(); this.edited(); });
  area.addEventListener('keydown', event => Diagram.edit.outlineKey(event, area));
  requestAnimationFrame(fit);
  make('div', 'ds-note', section, t('edit.outlineHint'));
 }

 // A table is shown as lines. A chart's values stand one line to a point of its axis, with a figure for each of its
 // series; a radar's, one line to a criterion with a figure for each option. The series or options have their own
 // lines under them, and both are dragged into another order.
 tableSections(table) {
  const heads = table.cols.map((col, i) => col.head ? i : -1).filter(i => i >= 0);
  const rows = (title, lines) => {
   const section = this.section(title, { label: t(table.add), run: () => this.addRow(table) });
   section.rows.append(...lines);
   this.sortable(section, (from, to) => this.moveRow(table, from, to));
   this.rowsOf.set(table, section);
  };
  const cols = (title, lines) => {
   const section = this.section(title, { label: t(table.addCol), run: () => this.addCol(table) });
   section.rows.append(...lines);
   this.sortable(section, (from, to) => this.moveCol(table, from, to));
   this.colsOf.set(table, section);
  };
  if (heads.length && (table.lock ?? 0) >= 2) {
   cols(t('edit.values'), heads.map((ci, k) => this.pointRow(table, ci, k)));
   rows(t('edit.series'), table.rows.map((row, ri) => this.seriesRow(table, row, ri)));
   return;
  }
  rows(t(table.title), table.rows.map((row, ri) => this.row(table, row, ri, heads)));
  if (heads.length) cols(t('edit.options'), heads.map((ci, k) => this.optionRow(table, ci, k)));
 }

 shell(removable, onRemove) {
  const row = make('div', 'ds-row');
  const grip = make('button', 'ds-grip', row);
  grip.type = 'button';
  grip.tabIndex = -1;
  grip.innerHTML = GRIP;
  grip.setAttribute('aria-label', t('edit.move'));
  row.main = make('div', 'ds-main', row);
  if (removable) {
   const remove = make('button', 'ds-remove', row);
   remove.type = 'button';
   remove.innerHTML = CROSS;
   remove.setAttribute('aria-label', t('edit.remove'));
   remove.addEventListener('click', onRemove);
  }
  return row;
 }

 // One line of an ordinary table: its main words first, longer words under them, the rest as small labelled chips.
 row(table, row, ri, heads) {
  const cols = table.cols, nodes = table.key === 'nodes', removable = table.rows.length > (table.min ?? 1);
  const el = this.shell(removable, () => this.removeRow(table, ri));
  const set = ci => value => { row.cells[ci] = value; this.edited(); if (nodes) this.syncNodes(); };
  const pair = cols.map((col, ci) => col.kind === 'node' ? ci : -1).filter(ci => ci >= 0);
  const first = make('div', 'ds-line', el.main), rest = [];
  if (row.meta?.id && nodes) el.dataset.key = `n:${row.meta.id}`;
  if (pair.length === 2) {
   first.classList.add('is-pair');
   first.append(this.nodeChoice(table, cols[pair[0]], row.cells[pair[0]], set(pair[0])));
   make('span', 'ds-arrow', first, '→');
   first.append(this.nodeChoice(table, cols[pair[1]], row.cells[pair[1]], set(pair[1])));
  }
  const main = pair.length ? -1 : table.focus ?? cols.findIndex(col => col.kind === 'text');
  if (main >= 0 && nodes && this.isScheme()) {
   const parts = splitName(row.cells[main]);
   first.append(this.input(parts.name, value => { parts.name = value; set(main)(joinName(parts)); }, { strong: true, label: t('edit.text'), placeholder: t('edit.block') }));
   el.main.append(this.input(parts.detail, value => { parts.detail = value; set(main)(joinName(parts)); }, { detail: true, label: t('edit.detail'), placeholder: t('edit.detail') }));
  } else if (main >= 0) first.append(this.input(row.cells[main], set(main), { strong: true, label: t(cols[main].label), placeholder: cols[main].placeholder || t(cols[main].label) }));
  const numbers = cols.map((col, ci) => ci !== main && !col.head && col.kind === 'number' ? ci : -1).filter(ci => ci >= 0);
  const inline = numbers.length && numbers.length <= 2 && cols.every((col, ci) => ci === main || col.kind === 'number' || col.kind === 'node');
  cols.forEach((col, ci) => {
   if (ci === main || col.kind === 'node' || col.head) return;
   const label = t(col.label);
   if (inline && col.kind === 'number') first.append(this.input(row.cells[ci], set(ci), { kind: 'number', label, pill: true }));
   else if (col.kind === 'text' && col.wide) el.main.append(this.input(row.cells[ci], set(ci), { detail: true, label, placeholder: label }));
   else if (pair.length && col.kind === 'text' && !col.wide) first.append(this.input(row.cells[ci], set(ci), { label, placeholder: label, pill: true, quiet: true }));
   else if (pair.length && col.kind === 'check') first.append(this.chipToggle(row.cells[ci], set(ci), label));
   else rest.push([col, ci, label]);
  });
  if (heads.length) {
   const values = make('div', 'ds-chips', el.main);
   heads.forEach((ci, k) => values.append(this.value(row.cells[ci], set(ci), table.cols[ci].name, k)));
  }
  if (rest.length) {
   const chips = make('div', 'ds-chips', el.main);
   for (const [col, ci, label] of rest) {
    if (col.kind === 'select') chips.append(this.choice(col.options, row.cells[ci], set(ci), label));
    else if (col.kind === 'check') chips.append(this.chipToggle(row.cells[ci], set(ci), label));
    else chips.append(this.chip(row.cells[ci], set(ci), label, col.kind));
   }
  }
  return el;
 }

 // A point of a chart's axis: its name, and a value for each series in the series' colour.
 pointRow(table, ci, k) {
  const col = table.cols[ci], heads = table.cols.filter(c => c.head).length;
  const el = this.shell(heads > 1, () => this.removeCol(table, ci));
  const first = make('div', 'ds-line', el.main);
  first.append(this.input(col.name, value => { col.name = value; this.edited(); }, { strong: true, label: t('edit.label'), placeholder: t('edit.label') }));
  if (table.rows.length === 1) first.append(this.input(table.rows[0].cells[ci], value => { table.rows[0].cells[ci] = value; this.edited(); }, { kind: 'number', label: words(table.rows[0].cells[0]) || t('edit.value'), pill: true }));
  else {
   const values = make('div', 'ds-chips', el.main);
   table.rows.forEach((row, ri) => values.append(this.value(row.cells[ci], value => { row.cells[ci] = value; this.edited(); }, words(row.cells[0]) || `${t('edit.series')} ${ri + 1}`, ri)));
  }
  return el;
 }

 // A series of a chart: its colour, its name and how it is drawn.
 seriesRow(table, row, ri) {
  const el = this.shell(table.rows.length > (table.min ?? 1), () => this.removeRow(table, ri));
  const first = make('div', 'ds-line', el.main);
  const dot = make('span', 'ds-dot', first);
  dot.style.background = series(ri);
  first.append(this.input(row.cells[0], value => { row.cells[0] = value; this.edited(); }, { strong: true, label: t('edit.series'), placeholder: `${t('edit.series')} ${ri + 1}` }));
  const kind = table.cols[1];
  if (kind?.kind === 'select') first.append(this.choice(kind.options, row.cells[1], value => { row.cells[1] = value; this.edited(); }, t(kind.label)));
  return el;
 }

 // An option of a radar: its colour and its name.
 optionRow(table, ci, k) {
  const col = table.cols[ci], heads = table.cols.filter(c => c.head).length;
  const el = this.shell(heads > 1, () => this.removeCol(table, ci));
  const first = make('div', 'ds-line', el.main);
  const dot = make('span', 'ds-dot', first);
  dot.style.background = series(k);
  first.append(this.input(col.name, value => { col.name = value; this.edited(); }, { strong: true, label: t('edit.option'), placeholder: `${t('edit.option')} ${k + 1}` }));
  return el;
 }

 isScheme() {
  return this.view.result?.kind === 'flow' && this.view.result.dialect === 'flow';
 }

 /* Controls */

 input(value, onChange, { kind = 'text', strong = false, detail = false, pill = false, quiet = false, label = '', placeholder = '' } = {}) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = `ds-input${strong ? ' is-strong' : ''}${detail ? ' is-detail' : ''}${pill ? ' is-pill' : ''}${quiet ? ' is-quiet' : ''}${kind === 'number' ? ' is-number' : ''}`;
  input.value = words(value);
  input.placeholder = placeholder;
  input.spellcheck = false;
  if (label) input.setAttribute('aria-label', label);
  if (pill && label) input.title = label;
  if (kind === 'number') input.inputMode = 'decimal';
  input.addEventListener('input', () => {
   if (kind === 'number') input.classList.toggle('is-bad', input.value.trim() !== '' && !Number.isFinite(Number(input.value.replace(',', '.').replace(/\s/g, ''))));
   onChange(input.value);
  });
  return input;
 }

 value(value, onChange, name, k) {
  const chip = make('label', 'ds-chip is-value');
  const dot = make('span', 'ds-dot', chip);
  dot.style.background = series(k);
  chip.title = words(name);
  chip.append(this.input(value, onChange, { kind: 'number', label: words(name) }));
  return chip;
 }

 chip(value, onChange, label, kind) {
  const chip = make('label', 'ds-chip');
  make('span', 'ds-chip-name', chip, label);
  chip.append(this.input(value, onChange, { kind, label }));
  return chip;
 }

 choice(options, value, onChange, label, extra = '') {
  const wrap = make('label', `ds-choice${extra ? ` ${extra}` : ''}`);
  const select = make('select', '', wrap);
  for (const [key, name] of options) select.add(new Option(name, key));
  select.value = value;
  select.setAttribute('aria-label', label);
  const chevron = make('span', 'ds-chevron', wrap);
  chevron.innerHTML = CHEVRON;
  select.addEventListener('change', () => onChange(select.value));
  return wrap;
 }

 nodeChoice(table, col, value, onChange) {
  const wrap = this.choice([], value, onChange, t(col.label), 'is-node');
  const select = wrap.querySelector('select');
  select.dataset.node = col.pseudo || '';
  this.fillNodes(select, value);
  return wrap;
 }

 fillNodes(select, value = select.value) {
  const pseudo = select.dataset.node, nodes = this.model.tables.find(table => table.key === 'nodes')?.rows || [];
  select.replaceChildren();
  if (pseudo) select.add(new Option(t(pseudo === 'start' ? 'edit.startState' : 'edit.endState'), '[*]'));
  nodes.forEach((row, i) => select.add(new Option(words(splitName(row.cells[0]).name).replace(/\*\*/g, '') || `${t('edit.block')} ${i + 1}`, row.meta.id)));
  for (const group of this.model.groups || []) select.add(new Option(`${t('edit.group')}: ${group.title || group.id}`, group.id));
  select.value = value;
 }

 syncNodes() {
  for (const select of this.list.querySelectorAll('select[data-node]')) this.fillNodes(select);
 }

 toggle(value, onChange, label) {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'ds-switch';
  box.checked = !!value;
  box.setAttribute('aria-label', label);
  box.addEventListener('change', () => onChange(box.checked));
  return box;
 }

 chipToggle(value, onChange, label) {
  const chip = make('label', 'ds-chip is-toggle');
  chip.append(this.toggle(value, onChange, label));
  make('span', 'ds-chip-name', chip, label);
  return chip;
 }

 /* Rows and columns */

 rebuild(focus = null) {
  const top = this.body.scrollTop;
  this.renderList();
  this.body.scrollTop = top;
  if (focus) focus()?.focus({ preventScroll: false });
  this.edited();
 }

 // A line just added comes in with its first field ready for typing.
 lastLine(section) {
  const row = section?.querySelector(':scope > .ds-rows > .ds-row:last-child');
  row?.classList.add('is-new');
  return row?.querySelector('input');
 }

 addRow(table) {
  table.rows.push(table.blank(table, this.model));
  this.rebuild(() => this.lastLine(this.rowsOf.get(table)));
 }

 removeRow(table, ri) {
  const [row] = table.rows.splice(ri, 1);
  if (table.key === 'nodes') {
   const links = this.model.tables.find(other => other.key === 'links');
   if (links) links.rows = links.rows.filter(link => link.cells[0] !== row.meta.id && link.cells[1] !== row.meta.id);
  }
  this.rebuild();
 }

 moveRow(table, from, to) {
  move(table.rows, from, to);
  this.edited();
 }

 addCol(table) {
  table.cols.push(table.blankCol(table));
  table.rows.forEach(row => row.cells.push(''));
  this.rebuild(() => this.lastLine(this.colsOf.get(table)));
 }

 removeCol(table, ci) {
  table.cols.splice(ci, 1);
  table.rows.forEach(row => row.cells.splice(ci, 1));
  this.rebuild();
 }

 // The head columns of a table (a chart's points, a radar's options) moved: their values move with them in every row.
 moveCol(table, from, to) {
  const heads = table.cols.map((col, i) => col.head ? i : -1).filter(i => i >= 0), a = heads[from], b = heads[to];
  move(table.cols, a, b);
  table.rows.forEach(row => move(row.cells, a, b));
  this.edited();
 }

 /* Dragging */

 // The rows of a section are dragged by their grips. The row taken follows the pointer, the others step aside for
 // it, and the drawing is told of the new order at each step, so it rearranges itself while the row is carried.
 sortable(section, onMove) {
  const rows = section.querySelector('.ds-rows');
  rows.addEventListener('pointerdown', event => {
   const grip = event.target.closest('.ds-grip');
   if (!grip || event.button !== 0) return;
   event.preventDefault();
   this.drag(rows, grip.closest('.ds-row'), event, onMove);
  });
  rows.addEventListener('keydown', event => {
   if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
   const row = event.target.closest('.ds-row'), all = [...rows.children], from = all.indexOf(row), to = from + (event.key === 'ArrowUp' ? -1 : 1);
   const section = rows.closest('.ds-section');
   if (from < 0 || to < 0 || to >= all.length) return;
   event.preventDefault();
   const field = [...row.querySelectorAll('input, select')].indexOf(event.target), si = [...this.list.querySelectorAll('.ds-section')].indexOf(section);
   const was = row.getBoundingClientRect().top;
   onMove(from, to);
   // The list is drawn again in the new order and the moved line glides from where it stood, the same field in hand.
   const moved = this.renumber({ si, ri: to, fi: field });
   const dy = moved ? was - moved.getBoundingClientRect().top : 0;
   if (dy && !reducedMotion()) moved.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 260, easing: MOTION.ease });
  });
 }

 drag(rows, row, event, onMove) {
  const all = [...rows.children];
  if (all.length < 2) return;
  const from = all.indexOf(row), boxes = all.map(el => el.getBoundingClientRect()), step = boxes[from].height + ROW_GAP;
  const start = event.clientY, top = boxes[0].top - boxes[from].top, bottom = boxes[all.length - 1].bottom - boxes[from].bottom;
  let at = from;
  row.classList.add('is-dragging');
  rows.classList.add('is-sorting');
  this.light(null);
  const grip = row.querySelector('.ds-grip');
  grip.setPointerCapture(event.pointerId);
  const moveTo = y => {
   const dy = Math.max(top, Math.min(bottom, y - start)), middle = boxes[from].top + boxes[from].height / 2 + dy;
   row.style.transform = `translateY(${dy}px)`;
   let next = from;
   for (let i = 0; i < all.length; i++) {
    if (i === from) continue;
    const centre = boxes[i].top + boxes[i].height / 2;
    // A row carried to the very edge of the list passes the last one there too.
    if (i < from && middle < centre + 2) next = Math.min(next, i);
    if (i > from && middle > centre - 2) next = Math.max(next, i);
   }
   if (next === at) return;
   onMove(at, next);
   at = next;
   all.forEach((el, i) => {
    if (i === from) return;
    const shift = i > from && i <= at ? -step : i < from && i >= at ? step : 0;
    el.style.transform = shift ? `translateY(${shift}px)` : '';
   });
  };
  const onPointer = e => moveTo(e.clientY);
  const end = () => {
   grip.removeEventListener('pointermove', onPointer);
   grip.removeEventListener('pointerup', end);
   grip.removeEventListener('pointercancel', end);
   grip.removeEventListener('lostpointercapture', end);
   const landed = boxes[at].top - boxes[from].top + (at > from ? boxes[at].height - boxes[from].height : 0);
   const settle = row.animate([{ transform: row.style.transform || 'none' }, { transform: `translateY(${landed}px)` }], { duration: reducedMotion() ? 0 : 220, easing: MOTION.settle });
   const done = () => {
    rows.classList.remove('is-sorting');
    row.classList.remove('is-dragging');
    for (const el of all) el.style.transform = '';
    if (at !== from) { if (at > from) all[at].after(row); else all[at].before(row); }
    this.renumber();
   };
   settle.finished.then(done, done);
  };
  grip.addEventListener('pointermove', onPointer);
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  grip.addEventListener('lostpointercapture', end);
 }

 // After a move the rows' own handlers still speak of their old places: the list is drawn again from the model, the
 // same rows in the same order, so a press on a cross or a typed letter lands on the right row.
 // The line to keep in hand is the focused one, or the place given; the line drawn there is returned.
 renumber(keep = null) {
  let place = keep;
  if (!place) {
   const focused = document.activeElement, row = focused?.closest?.('.ds-row'), section = row?.closest('.ds-section');
   place = row ? { si: [...this.list.querySelectorAll('.ds-section')].indexOf(section), ri: [...row.parentElement.children].indexOf(row), fi: [...row.querySelectorAll('input, select')].indexOf(focused) } : null;
  }
  const top = this.body.scrollTop;
  this.renderList();
  this.body.scrollTop = top;
  if (!place || place.si < 0 || place.ri < 0) return null;
  const row = this.list.querySelectorAll('.ds-section')[place.si]?.querySelectorAll(':scope > .ds-rows > .ds-row')[place.ri];
  row?.querySelectorAll('input, select')[place.fi]?.focus({ preventScroll: true });
  return row || null;
 }

 /* What the list and the drawing say of each other */

 findRow(key) {
  const row = key && this.list.querySelector(`.ds-row[data-key="${CSS.escape(key)}"]`);
  if (!row) return;
  if (this.mode !== 'data') this.setMode('data');
  row.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  row.querySelector('input')?.focus({ preventScroll: true });
 }

 light(key) {
  this.lit = key;
  this.place();
 }

 // The ring round the block whose line is in hand, kept on it while the drawing moves.
 place() {
  const ring = this.ring, g = this.lit && this.drawing.scene.items.get(this.lit)?.g;
  if (!g || this.closing || this.flying) { ring.classList.remove('is-shown'); return; }
  const box = g.getBoundingClientRect(), holder = this.holder.getBoundingClientRect();
  if (!box.width) { ring.classList.remove('is-shown'); return; }
  ring.style.transform = `translate(${box.left - holder.left - 4}px, ${box.top - holder.top - 4}px)`;
  ring.style.width = `${box.width + 8}px`;
  ring.style.height = `${box.height + 8}px`;
  ring.classList.add('is-shown');
 }

 follow() {
  if (this.lit) this.place();
 }
}

// The line in hand lights its block; leaving the list lets it go.
document.addEventListener('focusin', event => {
 const stage = DiagramStage.current, row = event.target.closest?.('.ds-row');
 if (stage && stage.list.contains(event.target)) stage.light(row?.dataset.key || null);
});
document.addEventListener('pointerover', event => {
 const stage = DiagramStage.current;
 if (!stage || stage.list.querySelector('.is-sorting')) return;
 const row = event.target.closest?.('.ds-row');
 if (row && stage.list.contains(row)) stage.light(row.dataset.key || null);
 else if (event.target.closest?.('.ds-pane')) {
  const focused = document.activeElement?.closest?.('.ds-row');
  stage.light(focused?.dataset.key || null);
 }
});

DiagramStage.current = null;
window.DiagramStage = DiagramStage;
})();
