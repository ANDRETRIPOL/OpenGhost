(() => {
'use strict';

// still: how long rows coming up under a pointer that has not moved leave the focus with the chat's model.
const OPEN = { veil: 460, flight: 640, lift: 40, delay: 90, row: 90, letters: 560, stagger: 26, spread: 420, meta: 180, still: 900 };
const CLOSE = { veil: 380, veilDelay: 60, flight: 540, letters: 240, stagger: 12 };
// How the glyph comes up by the chat's model as its name flies in: from this share of the name's way, softly.
const GREET = { at: 0.55, duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
// The share of a name's way over which it and the button's own name cross-fade, and how many points its way is drawn by.
// `swap`: how far along its way the copy set as the row's name comes up (from the first to the second) and the one set
// as the button's goes from under it (from the second to the third).
const CARRY = { steps: 36, melt: 180, swap: [0.15, 0.5, 0.85] };
const HOP = { duration: 420, spin: 90 };
const WAVE = { duration: 560, stagger: 22, spread: 300 };
const TWIRL = { duration: 760, turn: 180, swell: 1.2 };
// A model that needs the chat compacted first: the others go where they stand (`fade`), then the chosen one glides to its
// new place (`glide`) and the question comes up under it.
const CHOSEN = { fade: 240, glide: 560 };
const EASE = {
 motion: 'cubic-bezier(0.32, 0.72, 0, 1)',
 out: 'cubic-bezier(0.22, 1, 0.36, 1)',
 flight: 'cubic-bezier(0.5, 0, 0.18, 1)',
 spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
 wave: 'cubic-bezier(0.33, 1, 0.68, 1)',
};
// The veil takes the theme's look (--stage-veil), the one a selection in the chat takes: dimmer over the dark theme,
// washed out over the light one.
function veil() {
 const style = getComputedStyle(document.documentElement);
 const filter = style.getPropertyValue('--stage-veil').trim(), color = style.getPropertyValue('--stage-veil-bg').trim();
 const rest = filter.replace(/blur\([^)]*\)/g, 'blur(0px)').replace(/(brightness|contrast|saturate)\([^)]*\)/g, '$1(1)');
 return [{ backdropFilter: rest, backgroundColor: 'transparent' }, { backdropFilter: filter, backgroundColor: color }];
}
const ARC = { steps: 16, bend: -0.32, spin: -70 };
// A timing curve as a function. A name's way takes its easing into its points and runs at an even pace, so that its
// fade keeps time with the button's own name, which fades on the clock.
function bezier(x1, y1, x2, y2) {
 const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
 return x => {
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (at(x1, x2, t) < x) lo = t; else hi = t; }
  return at(y1, y2, t);
 };
}
const CURVES = { flight: bezier(0.5, 0, 0.18, 1), motion: bezier(0.32, 0.72, 0, 1) };
const GAP = 26;
const MARK = 30;
// Room the list keeps: above it for the title bar, and inside it for the glow, the ripple and the drum's sideways drift.
const ROOM = { top: 52, right: 68, bottom: 10 };
// A composer counts as standing high with this much of the window below it; the list over it keeps this off the edge.
const LIFTED = { below: 140, margin: 24 };
// The least a list is scaled to when its names are too long for a small window.
const FIT = 0.62;
// Many models turn the list into a drum: rows away from its middle drift right, tilt and shrink a little.
const DRUM = { reach: 320, shift: 34, tilt: 3.2, shrink: 0.07 };
const GROUPS = { chatgpt: 'ChatGPT', openai: 'OpenAI API', anthropic: 'Anthropic', deepseek: 'DeepSeek', openrouter: 'OpenRouter', local: 'Local', custom: 'Custom API' };
// A provider with many models of many companies shows the companies, and a company opens into its models on a press:
// from how many models on, how its models come out (the nearest first, a step apart, only as many as can be seen), and
// how long the list takes to settle after a company opens or shuts.
const COMPANY = { from: 12, step: 34, letters: 420, shown: 14, settle: 640 };
// Letters typed while the list is open find a company or a model by the start of its name; this long after the last
// letter the next one starts a new word.
const TYPING = 800;
const CHEVRON = '<svg class="model-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const letters = text => [...text].map(char => `<span class="model-letter">${escapeHtml(char)}</span>`).join('');
const words = text => text.split(/(\s+)/).map(part => part.trim() ? `<span class="model-word">${escapeHtml(part)}</span>` : part).join('');
const center = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.width });
const quiet = animation => animation.finished.catch(() => {});

function slot(el) {
 const outer = document.createElement('div'), inner = document.createElement('div');
 outer.className = 'model-slot';
 inner.className = 'model-slot-inner';
 inner.append(el);
 outer.append(inner);
 return outer;
}
// Long names keep the same overall rhythm: their letters simply follow each other closer.
const stagger = (count, step, spread) => Math.min(step, spread / Math.max(1, count));

// Windows are told the way providers tell them: 272K, 200K, 1M.
function size(tokens) {
 if (tokens < 950000) return `${Math.round(tokens / 1000)}K`;
 const m = tokens / 1e6, whole = Math.round(m);
 return `${Math.abs(m - whole) < 0.06 ? whole : m.toFixed(1)}M`;
}

function meta(model) {
 return [
  model.context ? I18n.t('model.context', { size: size(model.context) }) : '',
  I18n.t(model.vision === false ? 'model.text' : 'model.vision'),
  model.tools === false ? I18n.t('model.plain') : '',
 ].filter(Boolean).join(' · ');
}

const counted = count => I18n.t(count === 1 ? 'model.count.one' : 'model.count', { count });
const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
// Whether a provider's models are shown by company: each says which company made it, and there are many.
const grouped = models => models.length > COMPANY.from && models.every(model => model.group);

// The glyph travels on a curve, bent to one side like the ghost's flights, growing or shrinking on the way.
function arc(el, from, to, { duration, delay = 0, spin = ARC.spin, bend = ARC.bend, easing = EASE.flight }) {
 const box = el.offsetWidth, dx = to.x - from.x, dy = to.y - from.y;
 const c = { x: (from.x + to.x) / 2 - dy * bend, y: (from.y + to.y) / 2 + dx * bend };
 const frames = [];
 for (let i = 0; i <= ARC.steps; i++) {
  const t = i / ARC.steps, u = 1 - t;
  const x = u * u * from.x + 2 * u * t * c.x + t * t * to.x, y = u * u * from.y + 2 * u * t * c.y + t * t * to.y;
  const scale = (from.size + (to.size - from.size) * t) / box;
  frames.push({ offset: t, transform: `translate(${x - box / 2}px, ${y - box / 2}px) rotate(${spin * u}deg) scale(${scale})` });
 }
 return el.animate(frames, { duration, delay, easing, fill: 'both' });
}

class ModelStage {
 constructor({ button, root, chat, settings, input }) {
  Object.assign(this, { button, root, chat, settings, input });
  this.state = 'closed';
  this.rows = [];
  this.groups = [];
  this.companies = new Map();
  this.typed = { text: '', at: 0 };
  this.settling = 0;
  this.frame = 0;
  this.pointer = null;
  this.steered = 0;
  this.focused = null;
  this.marked = null;
  this.choice = null;
  this.flyer = null;
  this.keyboard = false;
  root.innerHTML = '<div class="model-veil"></div><div class="model-list" role="listbox"></div>';
  this.veil = root.querySelector('.model-veil');
  this.list = root.querySelector('.model-list');
  button.addEventListener('model-open', event => this.open(event.detail.keyboard));
  this.veil.addEventListener('pointerdown', () => this.cancel());
  this.list.addEventListener('pointerover', event => {
   const row = event.target.closest('.model-row');
   if (!row || this.state !== 'open' || row === this.focused) return;
   // Rows that travel under a pointer at rest, as when a company opens or shuts, do not take the focus from the keyboard;
   // nor do rows that come up under it as the list opens over the composer, until the pointer moves.
   if (performance.now() < this.steered && (!this.pointer || (event.clientX === this.pointer.x && event.clientY === this.pointer.y))) return;
   this.focus(row, true);
   row.focus({ preventScroll: true });
  });
  this.list.addEventListener('pointerleave', () => {
   if (this.state === 'open') this.rest(this.current());
  });
  this.list.addEventListener('focusin', event => {
   const row = event.target.closest('.model-row');
   if (row && this.state === 'open') this.focus(row, true);
  });
  this.list.addEventListener('click', event => {
   const row = event.target.closest('.model-row');
   if (row && this.state === 'open') this.pick(row);
  });
  // A press on the list between the models closes it, the same as a press on the veil.
  this.list.addEventListener('pointerdown', event => {
   if (!event.target.closest('.model-row, .model-confirm')) this.cancel();
  });
  this.list.addEventListener('scroll', () => this.scheduleBend(true), { passive: true });
  root.addEventListener('pointermove', event => { this.pointer = { x: event.clientX, y: event.clientY }; });
  root.addEventListener('keydown', event => this.onKey(event));
  window.addEventListener('resize', () => { if (this.state !== 'closed') this.place(); });
  const prior = settings.onModels;
  settings.onModels = () => { prior?.(); this.sync(); };
  this.sync();
 }

 name(id) {
  return this.settings.find(id)?.name || id;
 }

 // The row of the chat's model; while its company is shut, the company's row stands for it.
 current() {
  const own = this.rows.find(row => row.dataset.model === this.chat.model);
  if (own) return own;
  const model = this.settings.find(this.chat.model), company = model && this.companies.get(`${model.provider}/${model.group}`);
  return company?.row || this.rows.find(row => row.dataset.model) || this.rows[0] || null;
 }

 sync() {
  const locked = this.chat.busy, name = this.name(this.chat.model);
  this.button.setAttribute('label', name ? I18n.t('model.current', { name }) : I18n.t('model.none'));
  // While the menu is out the button's name waits for the one that flies home into it (close).
  if (this.state === 'closed') this.button.setName(name || I18n.t('model'));
  this.button.toggleAttribute('disabled', locked);
  this.button.title = locked ? I18n.t('model.locked') : '';
  if (locked && (this.state === 'open' || this.state === 'confirm')) this.cancel();
 }

 modelRow(model, company = null) {
  const name = model.name || model.id, info = meta(model);
  const row = document.createElement('button');
  row.type = 'button';
  row.className = company ? 'model-row is-sub' : 'model-row';
  row.dataset.model = model.id;
  row.dataset.provider = model.provider;
  row.dataset.find = name.toLowerCase();
  if (company) row.dataset.of = company.key;
  row.setAttribute('role', 'option');
  row.setAttribute('aria-label', `${name}, ${info}`);
  row.setAttribute('aria-selected', String(model.id === this.chat.model));
  row.innerHTML = `<span class="model-text" aria-hidden="true"><span class="model-name">${letters(name)}</span><span class="model-meta">${escapeHtml(info)}</span></span><span class="model-mark" aria-hidden="true"></span>`;
  return row;
 }

 // A company's own row: its name in the models' type, how many models it has, and a small arrow that turns as it opens.
 companyRow(company) {
  const count = counted(company.models.length);
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'model-row is-company';
  row.dataset.company = company.key;
  row.dataset.provider = company.provider;
  row.dataset.find = company.name.toLowerCase();
  row.setAttribute('role', 'button');
  row.setAttribute('aria-expanded', 'false');
  row.setAttribute('aria-label', `${company.name}, ${count}`);
  row.innerHTML = `<span class="model-text" aria-hidden="true"><span class="model-name">${letters(company.name)}</span><span class="model-meta">${escapeHtml(count)}${CHEVRON}</span></span><span class="model-mark" aria-hidden="true"></span>`;
  return row;
 }

 // Models come grouped by provider, under a small label once there is more than one provider. A provider with the
 // models of many companies shows the companies, by name; only the company of the chat's model starts open.
 build() {
  this.list.setAttribute('aria-label', I18n.t('model'));
  const models = this.settings.models, providers = [...new Set(models.map(model => model.provider))];
  const chosen = this.settings.find(this.chat.model);
  const slots = [];
  this.rows = [];
  this.groups = [];
  this.companies = new Map();
  const add = row => { this.rows.push(row); slots.push(slot(row)); };
  for (const provider of providers) {
   const own = models.filter(item => item.provider === provider);
   if (providers.length > 1) {
    const label = document.createElement('div');
    label.className = 'model-group';
    label.dataset.provider = provider;
    label.textContent = GROUPS[provider] || provider;
    this.groups.push(label);
    slots.push(slot(label));
   }
   if (!grouped(own)) {
    for (const model of own) add(this.modelRow(model));
    continue;
   }
   for (const name of [...new Set(own.map(model => model.group))].sort(byName)) {
    const company = { key: `${provider}/${name}`, provider, name, models: own.filter(model => model.group === name), open: false, rows: [], row: null };
    company.row = this.companyRow(company);
    this.companies.set(company.key, company);
    add(company.row);
    if (chosen?.provider !== provider || chosen.group !== name) continue;
    company.open = true;
    company.row.setAttribute('aria-expanded', 'true');
    company.rows = company.models.map(model => this.modelRow(model, company));
    for (const row of company.rows) add(row);
   }
  }
  this.ask = document.createElement('div');
  this.ask.className = 'model-confirm';
  this.ask.setAttribute('role', 'alertdialog');
  this.askSlot = slot(this.ask);
  this.askSlot.classList.add('is-folded');
  this.list.replaceChildren(...slots, this.askSlot);
  this.list.scrollTop = 0;
  this.marked = null;
 }

 // The one glyph stands next to the chosen model: moving it moves the choice.
 mark(row, away = false) {
  if (this.marked && this.marked !== row) this.marked.querySelector('.model-mark').replaceChildren();
  this.marked = row;
  const holder = row.querySelector('.model-mark');
  if (!holder.firstElementChild) holder.innerHTML = ModelGlyph.glyph({ alive: true });
  const svg = holder.firstElementChild;
  holder.classList.toggle('is-away', away);
  // While a copy is in flight the glyph waits at the start of its orbit, where the copy's small star comes to rest.
  if (away) {
   svg.pauseAnimations();
   svg.setCurrentTime(0);
  } else svg.unpauseAnimations();
  return svg;
 }

 // The glyph comes to stand by another row without a flight: by a company's row when the company shuts over the chat's
 // model, by the model's own row when it opens again.
 settleMark(row) {
  this.dropFlyer();
  const svg = this.mark(row);
  if (!reducedMotion()) svg.animate([{ opacity: 0, transform: 'scale(0.2) rotate(-120deg)' }, { opacity: 1, transform: 'none' }], { duration: 620, easing: EASE.spring });
 }

 // Rows that can be seen now, or are about to be: only they are worth moving letter by letter.
 near(row) {
  const list = this.list, top = row.offsetTop - list.scrollTop;
  return top > -120 && top < list.clientHeight + 120;
 }

 // While a company opens or shuts the rows under it travel: the drum follows them until they stand, and the focus
 // stays where it was put.
 settle() {
  const until = performance.now() + COMPANY.settle;
  this.steered = until + 200;
  if (this.settling) { this.settling = until; return; }
  this.settling = until;
  const step = () => {
   if (this.state === 'closed' || performance.now() > this.settling) { this.settling = 0; if (this.state !== 'closed') this.bend(); return; }
   this.bend();
   requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
 }

 // A company opens: its models come out under it, the nearest first.
 expand(company) {
  if (company.open || this.state !== 'open') return;
  company.open = true;
  company.row.setAttribute('aria-expanded', 'true');
  const rows = company.rows = company.models.map(model => this.modelRow(model, company));
  this.rows.splice(this.rows.indexOf(company.row) + 1, 0, ...rows);
  const slots = rows.map(row => {
   const box = slot(row);
   box.classList.add('is-shut');
   return box;
  });
  company.row.closest('.model-slot').after(...slots);
  const own = rows.find(row => row.dataset.model === this.chat.model);
  if (own && this.marked === company.row) this.settleMark(own);
  if (reducedMotion()) {
   for (const box of slots) box.classList.remove('is-shut');
   this.bend();
   return;
  }
  // The shut state is on screen before the rows are let out, so they have somewhere to come from.
  void this.list.offsetHeight;
  for (const box of slots) box.classList.remove('is-shut');
  rows.slice(0, COMPANY.shown).forEach((row, k) => {
   const base = k * COMPANY.step, chars = row.querySelectorAll('.model-letter'), step = stagger(chars.length, OPEN.stagger / 2, 180);
   chars.forEach((letter, n) => letter.animate(
    [{ opacity: 0, transform: 'translateY(-0.4em)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: COMPANY.letters, delay: base + n * step, easing: EASE.out, fill: 'backwards' },
   ));
   row.querySelector('.model-meta').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: base + 140, easing: EASE.out, fill: 'backwards' });
  });
  this.settle();
 }

 // A company shuts: its models fold away under its name, and the glyph of a chosen model among them moves to the name.
 collapse(company) {
  if (!company.open || this.state !== 'open') return;
  company.open = false;
  company.row.setAttribute('aria-expanded', 'false');
  const rows = company.rows;
  company.rows = [];
  this.rows = this.rows.filter(row => !rows.includes(row));
  if (rows.includes(this.marked)) this.settleMark(company.row);
  if (rows.includes(this.focused)) this.rest(company.row);
  const slots = rows.map(row => row.closest('.model-slot'));
  for (const box of slots) {
   box.inert = true;
   box.classList.add('is-shut');
  }
  const drop = () => { for (const box of slots) box.remove(); };
  if (reducedMotion()) drop();
  else setTimeout(drop, COMPANY.settle);
  this.settle();
 }

 toggle(row) {
  const company = this.companies.get(row.dataset.company);
  if (!company) return;
  if (company.open) this.collapse(company);
  else this.expand(company);
 }

 // The glyph column stands right above the button; the list grows up from the composer and scrolls once it reaches the top.
 place() {
  const b = this.button.getBoundingClientRect(), composer = this.button.closest('.composer').getBoundingClientRect();
  let bottom = innerHeight - composer.top + GAP;
  // In a small window of its own (the quick chat) the stage has a box to keep to, `room`: the list stands against the
  // box's right edge and is no taller and no wider than the box.
  const room = this.room?.() || null;
  let most = Math.max(room ? 120 : 180, innerHeight - bottom - ROOM.top + ROOM.bottom - (room ? room.top : 0));
  // A composer standing high, as an empty chat holds it in the middle of the window and taller still with files in it,
  // leaves too little room above it for the list, which was then a few names squeezed at the top of the window. The
  // list then stands in the middle of the window over the composer, as tall as it needs, while the window has room.
  const need = this.list.scrollHeight;
  if (!room && need > most && innerHeight - composer.bottom > LIFTED.below) {
   const height = Math.min(need, innerHeight - ROOM.top - LIFTED.margin);
   bottom = Math.round(ROOM.bottom + Math.max(LIFTED.margin, (innerHeight - ROOM.top - height) / 2));
   most = height;
  }
  Object.assign(this.list.style, {
   right: `${room ? Math.max(0, innerWidth - room.right) : Math.max(0, innerWidth - (b.left + b.width / 2) - MARK / 2 - ROOM.right)}px`,
   bottom: `${bottom - ROOM.bottom}px`,
   maxHeight: `${most}px`,
   maxWidth: room ? `${room.width}px` : '',
  });
  if (room) this.fit(room.width);
  this.bend();
 }

 // Names too long for the box are set smaller, all by the same measure, so the list stays one column.
 fit(width) {
  const list = this.list, style = getComputedStyle(list);
  list.style.removeProperty('--model-fit');
  const room = width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const widest = Math.max(0, ...this.rows.map(row => row.offsetWidth));
  if (widest > room) list.style.setProperty('--model-fit', Math.max(FIT, room / widest).toFixed(3));
 }

 // Scrolls so the row sits in the middle of the list, where the drum is flat.
 middle(row) {
  if (!row) return;
  const list = this.list;
  list.scrollTop = Math.max(0, row.offsetTop + row.offsetHeight / 2 - list.clientHeight / 2);
  this.bend();
 }

 scheduleBend(scrolled = false) {
  this.scrolled ||= scrolled;
  if (this.frame) return;
  this.frame = requestAnimationFrame(() => {
   this.frame = 0;
   this.bend();
   if (this.scrolled) this.follow();
   this.scrolled = false;
  });
 }

 // While the list scrolls, focus stays with the row under the pointer, or with the one in the middle of the drum.
 follow() {
  if (this.state !== 'open' || performance.now() < this.steered) return;
  const hit = this.pointer && document.elementFromPoint(this.pointer.x, this.pointer.y)?.closest('.model-row');
  let row = hit && this.rows.includes(hit) ? hit : null;
  if (!row) {
   const list = this.list, mid = list.scrollTop + list.clientHeight / 2;
   row = this.rows.reduce((best, item) => Math.abs(item.offsetTop + item.offsetHeight / 2 - mid) < Math.abs(best.offsetTop + best.offsetHeight / 2 - mid) ? item : best, this.rows[0]);
  }
  if (!row || row === this.focused) return;
  this.focus(row, false);
  row.focus({ preventScroll: true });
 }

 // Layout positions, not the drawn ones, drive the drum, so rows never chase their own transforms.
 bend() {
  const list = this.list;
  list.classList.toggle('can-up', list.scrollTop > 2);
  list.classList.toggle('can-down', list.scrollTop + list.clientHeight < list.scrollHeight - 2);
  if (reducedMotion()) return;
  const mid = list.scrollTop + list.clientHeight / 2;
  for (const el of [...this.rows, ...this.groups]) {
   const d = Math.max(-1.3, Math.min(1.3, (el.offsetTop + el.offsetHeight / 2 - mid) / DRUM.reach));
   el.style.translate = `${(DRUM.shift * d * d).toFixed(1)}px 0`;
   el.style.rotate = `${(-DRUM.tilt * d).toFixed(2)}deg`;
   el.style.scale = (1 - DRUM.shrink * Math.abs(d)).toFixed(3);
  }
 }

 open(keyboard = false) {
  if (this.state !== 'closed' || this.chat.busy) return;
  // With no provider connected there is no model to pick: the way to one is through the settings.
  if (!this.settings.models.length) { this.settings.open(I18n.t('settings.key.needed')); return; }
  this.settings.freshen();
  this.state = 'open';
  this.keyboard = keyboard;
  this.pointer = null;
  this.steered = performance.now() + OPEN.still;
  this.build();
  this.root.showPopover();
  // In a window of glass the page takes an opaque ground meanwhile, for the veil to soften all of it (styles.css).
  document.documentElement.classList.add('is-staging');
  this.place();
  this.button.setAttribute('expanded', '');
  const current = this.current();
  this.typed = { text: '', at: 0 };
  this.middle(current);
  this.rest(current);
  if (!current) return;
  if (reducedMotion()) { this.mark(current); return; }
  this.veil.animate(veil(), { duration: OPEN.veil, easing: EASE.motion, fill: 'both' });
  // Only what can be seen rises: a long list has most of its rows far out of view.
  const seen = this.rows.filter(row => this.near(row)), count = seen.length, pace = Math.min(OPEN.row, 480 / Math.max(1, count));
  this.groups.forEach(label => {
   const first = seen.findIndex(row => row.dataset.provider === label.dataset.provider);
   if (first >= 0) label.animate([{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 420, delay: OPEN.delay + (count - 1 - first) * pace, easing: EASE.out, fill: 'backwards' });
  });
  seen.forEach((row, r) => {
   // Rows rise from the button upwards: the nearest one first.
   const base = OPEN.delay + (count - 1 - r) * pace, chars = row === current && !row.dataset.company ? [] : row.querySelectorAll('.model-letter');
   const step = stagger(chars.length, OPEN.stagger, OPEN.spread);
   chars.forEach((letter, k) => letter.animate(
    [{ opacity: 0, transform: 'translateY(0.5em)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: OPEN.letters, delay: base + k * step, easing: EASE.out, fill: 'backwards' },
   ));
   row.querySelector('.model-meta').animate(
    [{ opacity: 0, transform: 'translateY(6px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: 480, delay: base + OPEN.meta, easing: EASE.out, fill: 'backwards' },
   );
  });
  this.launch(current);
 }

 // The name of the chat's model lifts out of the button and flies up into its row, growing into it; the glyph comes
 // up beside it as it lands. A company standing for the model (its company is shut) has no name of the model to take:
 // the glyph only comes up by the company.
 launch(row) {
  this.mark(row, true);
  // The glyph comes up out of nothing as the name nears its row, so the two arrive together and nothing is added after.
  const greet = () => {
   if (this.marked !== row || this.state === 'closed') return;
   const svg = this.mark(row);
   if (!reducedMotion()) svg.animate([{ opacity: 0, transform: 'scale(0.5) rotate(-40deg)' }, { opacity: 1, transform: 'none' }], GREET);
  };
  if (row.dataset.company) { this.button.fadeName(false, 200); setTimeout(greet, OPEN.flight / 2); return; }
  // The copy stands over the button's name, set as it is, and the name under it goes at once: the copy sets out from it.
  this.button.fadeName(false, 0);
  // The row has just taken the focus and grows to it from a little smaller: the name is taken to where the row will
  // stand, not to where it stands now, or it landed and the row went on growing under it, and the name jumped aside.
  void getComputedStyle(row).transform;
  for (const animation of row.getAnimations()) animation.finish();
  const name = row.querySelector('.model-name');
  this.carry(this.name(row.dataset.model), this.buttonEnd(), this.rowEnd(name), { duration: OPEN.flight, delay: OPEN.lift, curve: CURVES.flight }, name);
  setTimeout(greet, OPEN.lift + OPEN.flight * GREET.at);
 }

 // The two ends of a name's way: the name in the button, at its size and colour (the colour it rests in, on the way
 // home), and a model's name in its row.
 buttonEnd(home = false) {
  const rect = this.button.labelRect(), style = this.button.labelStyle(home);
  return { x: rect.left, y: rect.top + rect.height / 2, size: style.size, width: rect.width, color: style.color, weight: style.weight, spacing: style.spacing, turn: 0 };
 }

 // A row away from the drum's middle is drawn a little turned and smaller. A copy taken to the name's box landed
 // straight and too large and then gave way to the turned, smaller name: the name jumped as it landed. The name's two
 // ends are found where they are drawn, so the copy takes the row's turn and size on its way.
 rowEnd(name) {
  const style = getComputedStyle(name), was = name.style.position;
  name.style.position = 'relative';
  const [start, end] = [0, 100].map(left => {
   const pin = name.appendChild(document.createElement('i'));
   pin.style.cssText = `position: absolute; left: ${left}%; top: 50%; width: 0; height: 0`;
   const at = pin.getBoundingClientRect();
   pin.remove();
   return { x: at.left, y: at.top };
  });
  name.style.position = was;
  // Its width as laid out, to the fraction: a whole pixel off at this size was a letter a quarter pixel apart.
  const scale = Math.hypot(end.x - start.x, end.y - start.y) / (parseFloat(style.width) || name.offsetWidth || 1);
  const size = parseFloat(style.fontSize);
  return { x: start.x, y: start.y, size: size * scale, width: Math.hypot(end.x - start.x, end.y - start.y), color: style.color, weight: parseFloat(style.fontWeight), spacing: (parseFloat(style.letterSpacing) || 0) / size, turn: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI };
 }

 // A name on its way between the button and a row, on the curve the glyph used to fly. It is set in the list's large
 // type the whole way and scaled about its left end from one size to the other, so it is crisp at the large end; its
 // colour goes from the one to the other, and at the button's end it cross-fades with the button's own name.
 // `hidden`: the row's own name, out of sight while the carried one stands in for it. Resolves true once landed, false
 // if let go of on the way.
 carry(text, from, to, { duration, delay = 0, curve }, hidden, show = null) {
  this.dropCarrier();
  const carrier = this.carrier = document.createElement('div');
  carrier.className = 'model-carrier';
  // Two copies fly as one: one set as the button's name is, one as the row's, and the one gives way to the other on
  // the way. A single copy that changed its weight and colour as it flew was drawn once, as it set out, and kept that
  // look the whole way: it landed thin and grey and turned bold at once. Each copy is set letter by letter, as the
  // row's name is, so each letter lands on its own.
  const face = (end, row) => `<span class="model-name${row ? ' is-row' : ''}" style="font-weight: ${end.weight}; letter-spacing: ${end.spacing}em; color: ${end.color}">${letters(text)}</span>`;
  const rowAtEnd = to.size > from.size;
  carrier.innerHTML = face(from, !rowAtEnd) + face(to, rowAtEnd);
  this.root.append(carrier);
  this.carried = hidden;
  hidden.style.visibility = 'hidden';
  const [first, last] = carrier.children;
  const big = parseFloat(getComputedStyle(first).fontSize), h = carrier.offsetHeight;
  // Their widths as set, to the fraction: each is drawn a little wider or narrower along the way, so that both are
  // as wide as the name is between its two ends, and each is its own width where it lands.
  const wide = el => parseFloat(getComputedStyle(el).width) || el.offsetWidth || 1, firstWide = wide(first), lastWide = wide(last);
  const dx = to.x - from.x, dy = to.y - from.y, c = { x: (from.x + to.x) / 2 - dy * ARC.bend, y: (from.y + to.y) / 2 + dx * ARC.bend };
  const out = to.size > from.size, frames = [], firstFrames = [], lastFrames = [];
  const ramp = (t, a, b) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  for (let i = 0; i <= CARRY.steps; i++) {
   // `time` runs even, `t` is how far along the way the name is by then.
   const time = i / CARRY.steps, t = curve(time), u = 1 - t;
   const x = u * u * from.x + 2 * u * t * c.x + t * t * to.x, y = u * u * from.y + 2 * u * t * c.y + t * t * to.y;
   const scale = (from.size + (to.size - from.size) * t) / big, turn = from.turn + (to.turn - from.turn) * t;
   frames.push({ offset: time, transform: `translate(${x.toFixed(2)}px, ${(y - h / 2).toFixed(2)}px) rotate(${turn.toFixed(3)}deg) scale(${scale.toFixed(5)})` });
   const width = (from.width + (to.width - from.width) * t) / scale;
   // The one it lands as comes up over the other, which then goes from under it: never a moment with both half there.
   firstFrames.push({ offset: time, transform: `scaleX(${(width / firstWide).toFixed(5)})`, opacity: 1 - ramp(t, CARRY.swap[1], CARRY.swap[2]) });
   lastFrames.push({ offset: time, transform: `scaleX(${(width / lastWide).toFixed(5)})`, opacity: ramp(t, CARRY.swap[0], CARRY.swap[1]) });
  }
  const timing = { duration, delay, easing: 'linear', fill: 'both' };
  const animation = carrier.animate(frames, timing);
  first.animate(firstFrames, timing);
  last.animate(lastFrames, timing);
  return animation.finished.then(() => {
   if (this.carrier !== carrier) return false;
   // Landed. The copy is drawn on a layer of its own, and on a screen of 125% or 150% its edges fall on the pixels a
   // little otherwise than the name it lands on: put in its place at once, the name still stepped. The name shows under
   // it and the copy melts off it instead: the row's name, or the button's (`show`). The row's name it left on the way
   // home stays away: the list goes with it.
   if (out) hidden.style.visibility = '';
   else show?.();
   this.carried = null;
   // The row's own glow is there now: the copy's would double it while it melts.
   carrier.classList.add('is-landed');
   const gone = () => { carrier.remove(); if (this.carrier === carrier) this.carrier = null; return true; };
   return carrier.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CARRY.melt, easing: 'ease', fill: 'forwards' }).finished.then(gone, gone);
  }, () => false);
 }

 dropCarrier() {
  this.carrier?.remove();
  this.carrier = null;
  if (this.carried) this.carried.style.visibility = '';
  this.carried = null;
 }

 // A short hop from one model to another before the stage closes, so the choice is seen being made.
 hop(row) {
  const from = this.flyer?.isConnected ? this.flyer.querySelector('svg') : this.marked.querySelector('.model-mark svg');
  const start = center(from.getBoundingClientRect()), turn = ModelGlyph.turnOf(from);
  const mark = this.mark(row, true), timing = { duration: HOP.duration, easing: EASE.motion };
  const flyer = this.makeFlyer(mark.getBoundingClientRect().width, turn, timing);
  return quiet(arc(flyer, start, center(mark.getBoundingClientRect()), { ...timing, spin: -HOP.spin, bend: 0.5 })).then(() => {
   if (this.flyer !== flyer) return;
   this.dropFlyer();
   this.mark(row);
  });
 }

 // A still copy of the glyph that travels between places; its small star swings round to where the glyph it lands in has it.
 makeFlyer(box, turn = 0, timing = null) {
  this.flyer?.remove();
  const flyer = this.flyer = document.createElement('div');
  flyer.className = 'model-flyer';
  flyer.style.width = flyer.style.height = `${box}px`;
  flyer.innerHTML = ModelGlyph.glyph({ turn });
  this.root.append(flyer);
  const rest = Math.round(turn / 360) * 360;
  if (timing && rest !== turn) flyer.querySelector('.orbit').animate([{ transform: `rotate(${turn}deg)` }, { transform: `rotate(${rest}deg)` }], { ...timing, fill: 'both' });
  return flyer;
 }

 dropFlyer() {
  this.flyer?.remove();
  this.flyer = null;
 }

 // Focus comes back to a row without the ripple, which is kept for rows the user reaches for.
 rest(row) {
  if (!row) return;
  this.focus(row, false);
  row.focus({ preventScroll: true });
 }

 focus(row, wave) {
  if (!row || row === this.focused) return;
  this.focused?.classList.remove('is-focus');
  this.focused = row;
  row.classList.add('is-focus');
  if (wave && !reducedMotion()) this.wave(row);
 }

 // Focus moves like a lens: the name in focus sharpens and its letters ripple; the glyph turns when its own model is reached.
 // The letters ripple by their place, not by a transform: a transform lifts each onto a layer of its own while it
 // moves, and on a screen of 125% or 150% a letter dropped back from its layer was drawn a hair apart and twitched.
 wave(row) {
  const chars = row.querySelectorAll('.model-letter'), step = stagger(chars.length, WAVE.stagger, WAVE.spread);
  chars.forEach((letter, k) => letter.animate(
   [{ top: '0em' }, { top: '-0.14em', offset: 0.38 }, { top: '0em' }],
   { duration: WAVE.duration, delay: k * step, easing: EASE.wave, composite: 'add' },
  ));
  const mark = row === this.marked && row.querySelector('.model-mark:not(.is-away) svg');
  if (mark) this.twirl(mark);
 }

 // The glyph greets its own model with a half turn about the big star, and ends where it can stay:
 // the big star stops on a quarter, which looks just as it began, and the small star keeps the turn and circles on from there.
 twirl(svg) {
  const big = svg.querySelector('.big'), orbit = svg.querySelector('.orbit'), timing = { duration: TWIRL.duration, easing: EASE.motion };
  const pose = el => {
   const m = new DOMMatrix(getComputedStyle(el).transform);
   return { turn: Math.atan2(m.b, m.a) * 180 / Math.PI, scale: Math.hypot(m.a, m.b) };
  };
  const frames = (from, to) => [
   { transform: `rotate(${from.turn}deg) scale(${from.scale})` },
   { transform: `rotate(${(from.turn + to) / 2}deg) scale(${TWIRL.swell})`, offset: 0.45 },
   { transform: `rotate(${to}deg) scale(1)` },
  ];
  // A twirl still under way hands over from wherever it has got to.
  const bigFrom = pose(big), orbitFrom = pose(orbit), orbitTo = orbitFrom.turn + TWIRL.turn;
  for (const animation of [...big.getAnimations(), ...orbit.getAnimations()]) animation.cancel();
  big.animate(frames(bigFrom, Math.round((bigFrom.turn + TWIRL.turn) / 90) * 90), timing);
  orbit.style.transform = `rotate(${orbitTo}deg)`;
  orbit.animate(frames(orbitFrom, orbitTo), timing);
 }

 pick(row) {
  if (row.dataset.company) { this.toggle(row); return; }
  const id = row.dataset.model;
  if (id === this.chat.model) { this.close(); return; }
  if (this.chat.hasHistory()) { this.confirm(row); return; }
  this.state = 'hop';
  this.chat.setModel(id);
  for (const item of this.rows) if (item.dataset.model) item.setAttribute('aria-selected', String(item === row));
  if (reducedMotion()) { this.mark(row); this.state = 'open'; this.close(); return; }
  this.hop(row).then(() => {
   this.state = 'open';
   this.close();
  });
 }

 // The others go where they stand first, with nothing moving: carried along while their rows folded, the chosen name
 // jerked on its way to its place. Once they are gone it glides there in one move.
 confirm(row) {
  this.state = 'confirm';
  this.choice = row;
  this.focus(row, false);
  this.dropFlyer();
  this.dropCarrier();
  const others = [...this.rows.filter(other => other !== row), ...this.groups].map(el => el.closest('.model-slot'));
  for (const box of others) box.classList.add('is-going');
  this.mark(row);
  const from = this.name(this.chat.model), to = this.name(row.dataset.model);
  // Who will write the summary: the model the chat moves to, or the one it is on (chat.summarizerFor).
  const self = this.chat.summarizerFor(row.dataset.model) === row.dataset.model;
  this.ask.innerHTML = `
   <p class="model-confirm-title" id="model-confirm-title">${words(I18n.t('model.confirm.title', { name: to }))}</p>
   <p class="model-confirm-text">${escapeHtml(I18n.t(self ? 'model.confirm.self' : 'model.confirm.text', { from, to }))}</p>
   <div class="model-confirm-actions">
    <button type="button" class="approval-button is-deny" data-answer="cancel">${escapeHtml(I18n.t('model.confirm.cancel'))}</button>
    <button type="button" class="approval-button is-allow" data-answer="ok">${escapeHtml(I18n.t('model.confirm.ok'))}</button>
   </div>`;
  this.ask.setAttribute('aria-labelledby', 'model-confirm-title');
  this.ask.querySelector('[data-answer="cancel"]').addEventListener('click', () => this.cancel());
  this.ask.querySelector('[data-answer="ok"]').addEventListener('click', () => this.accept());
  clearTimeout(this.going);
  this.going = setTimeout(() => this.chosen(row, others), reducedMotion() ? 0 : CHOSEN.fade);
 }

 // Where a row stands in the list's own layout, on screen: its drawn place less the drum's turn and the glide.
 laid(row) {
  return row.offsetTop - this.list.scrollTop + this.list.getBoundingClientRect().top;
 }

 // The others gone, the list takes its new shape at once, out of sight of any move; the chosen row is drawn from where
 // it stood to where it now stands, the drum's tilt with it, and the question comes up under it.
 chosen(row, others) {
  if (this.state !== 'confirm' || this.choice !== row) return;
  const list = this.list, from = this.laid(row), was = { translate: row.style.translate, rotate: row.style.rotate, scale: row.style.scale };
  list.classList.add('is-instant');
  for (const box of others) box.classList.add('is-gone');
  this.askSlot.classList.remove('is-folded');
  void list.offsetHeight;
  this.bend();
  const to = this.laid(row);
  requestAnimationFrame(() => list.classList.remove('is-instant'));
  this.ask.querySelector('[data-answer="ok"]').focus({ preventScroll: true });
  if (reducedMotion()) return;
  // The way down goes into `translate`, which comes before the drum's turn and shrink: put after them, it was shrunk
  // with the row and the glide began a few pixels off.
  const across = value => parseFloat(value) || 0;
  row.animate([
   { translate: `${across(was.translate)}px ${(from - to).toFixed(1)}px`, rotate: was.rotate || '0deg', scale: was.scale || '1' },
   { translate: `${across(row.style.translate)}px 0px`, rotate: row.style.rotate || '0deg', scale: row.style.scale || '1' },
  ], { duration: CHOSEN.glide, easing: EASE.motion });
  const mark = row.querySelector('.model-mark svg');
  mark?.animate([{ opacity: 0, transform: 'scale(0.2) rotate(-120deg)' }, { opacity: 1, transform: 'none' }], { duration: 620, delay: 120, easing: EASE.spring, fill: 'backwards' });
  this.ask.querySelectorAll('.model-word').forEach((word, k) => word.animate(
   [{ opacity: 0, transform: 'translateY(0.4em)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
   { duration: 480, delay: 120 + k * 40, easing: EASE.out, fill: 'backwards' },
  ));
  this.ask.querySelector('.model-confirm-text').animate(
   [{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0)' }],
   { duration: 520, delay: 260, easing: EASE.out, fill: 'backwards' },
  );
  this.ask.querySelectorAll('.approval-button').forEach((button, k) => button.animate(
   [{ opacity: 0, transform: 'translateY(8px) scale(0.92)' }, { opacity: 1, transform: 'none' }],
   { duration: 520, delay: 360 + k * 70, easing: EASE.spring, fill: 'backwards' },
  ));
 }

 accept() {
  if (this.state !== 'confirm') return;
  const id = this.choice.dataset.model;
  this.accepting = true;
  this.close();
  this.chat.switchModel(id);
 }

 cancel() {
  if (this.state === 'open' || this.state === 'confirm') this.close();
 }

 // Everything dissolves and the glyph flies home from wherever it stands.
 close() {
  if (this.state !== 'open' && this.state !== 'confirm') return;
  clearTimeout(this.going);
  this.state = 'closing';
  this.button.removeAttribute('expanded');
  document.documentElement.classList.remove('is-staging');
  if (reducedMotion()) { this.finish(); return; }
  const waits = [];
  // The name that goes home into the button: the model chosen (or kept); none when a model waiting to be confirmed is
  // refused, as the chat's own row has gone by then.
  const home = this.state === 'confirm' ? (this.accepting ? this.choice : null) : this.current();
  const carried = home && !home.dataset.company ? home : null;
  for (const item of this.rows.filter(row => this.near(row))) {
   const glyphs = item === carried ? [] : [...item.querySelectorAll('.model-letter')].reverse(), step = stagger(glyphs.length, CLOSE.stagger, 160);
   glyphs.forEach((letter, k) => letter.animate(
    [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-0.3em)', filter: 'blur(6px)' }],
    { duration: CLOSE.letters, delay: k * step, easing: 'ease-in', fill: 'forwards' },
   ));
   item.querySelector('.model-meta').animate([{ opacity: 0, filter: 'blur(4px)' }], { duration: 200, fill: 'forwards' });
  }
  for (const label of this.groups) label.animate([{ opacity: 0, filter: 'blur(4px)' }], { duration: 200, fill: 'forwards' });
  this.ask.animate([{ opacity: 0, filter: 'blur(6px)', transform: 'translateY(-4px)' }], { duration: 240, easing: 'ease-in', fill: 'forwards' });
  waits.push(quiet(this.veil.animate(veil().reverse(), { duration: CLOSE.veil, delay: CLOSE.veilDelay, easing: EASE.motion, fill: 'both' })));
  // The glyph stays by its row and goes with the list; the chosen name flies home into the button, which takes it.
  this.marked?.querySelector('.model-mark svg')?.animate([{ opacity: 0, transform: 'scale(0.4)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
  this.dropFlyer();
  if (carried) {
   const name = carried.querySelector('.model-name'), text = this.name(carried.dataset.model);
   this.button.setName(text);
   waits.push(this.carry(text, this.rowEnd(name), this.buttonEnd(true), { duration: CLOSE.flight, curve: CURVES.motion }, name, () => this.button.fadeName(true, 0)).then(() => this.land()));
  } else {
   this.button.fadeName(true, 220, CLOSE.veilDelay);
   this.land();
  }
  Promise.all(waits).then(() => this.finish());
 }

 // The name is back in the button, which has been fading its own in as the copy came.
 land() {
  this.dropCarrier();
 }

 finish() {
  if (this.state !== 'closing') return;
  this.state = 'closed';
  document.documentElement.classList.remove('is-staging');
  this.accepting = false;
  this.dropFlyer();
  this.dropCarrier();
  this.sync();
  this.button.away(false);
  for (const animation of this.root.getAnimations({ subtree: true })) animation.cancel();
  this.root.hidePopover();
  this.focused = null;
  this.marked = null;
  this.choice = null;
  if (this.keyboard) this.button.focus({ preventScroll: true });
  else this.input?.focus({ preventScroll: true });
 }

 onKey(event) {
  if (event.key === 'Escape') {
   event.preventDefault();
   this.cancel();
   return;
  }
  if (this.state === 'confirm') {
   if (event.key !== 'Tab' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
   event.preventDefault();
   const buttons = [...this.ask.querySelectorAll('.approval-button')];
   buttons[(buttons.indexOf(document.activeElement) + 1) % buttons.length]?.focus();
   return;
  }
  if (this.state !== 'open') return;
  const focused = this.focused, own = this.companies.get(focused?.dataset.company), parent = this.companies.get(focused?.dataset.of);
  if (event.key === 'ArrowRight' && own && !own.open) { event.preventDefault(); this.expand(own); return; }
  if (event.key === 'ArrowLeft' && (own?.open || parent)) { event.preventDefault(); this.collapse(own?.open ? own : parent); return; }
  if (this.type(event)) return;
  const k = this.rows.indexOf(this.focused);
  const step = { ArrowUp: -1, ArrowDown: 1, Tab: event.shiftKey ? -1 : 1 }[event.key];
  const to = step ? (k + step + this.rows.length) % this.rows.length : { Home: 0, End: this.rows.length - 1 }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  this.reach(this.rows[to]);
 }

 // The keyboard goes to a row and the row comes into view.
 reach(row, block = 'nearest') {
  if (!row) return;
  this.steered = performance.now() + 700;
  row.focus({ preventScroll: true });
  row.scrollIntoView({ block, behavior: reducedMotion() ? 'auto' : 'smooth' });
 }

 // Letters typed find a row by the start of its name: the rows that can be seen first, from the one after the row in
 // focus on, then the models of the companies still shut, whose company then opens.
 type(event) {
  const key = event.key;
  if (key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
  const now = performance.now(), going = now - this.typed.at < TYPING && this.typed.text;
  // A space is a press on the row until a word is under way.
  if (key === ' ' && !going) return false;
  event.preventDefault();
  const text = this.typed.text = (going ? this.typed.text : '') + key.toLowerCase();
  this.typed.at = now;
  const from = this.rows.indexOf(this.focused), order = [...this.rows.slice(from + (going ? 0 : 1)), ...this.rows.slice(0, from + (going ? 0 : 1))];
  const row = order.find(item => item.dataset.find?.startsWith(text));
  if (row) { this.reach(row, 'center'); return true; }
  for (const company of this.companies.values()) {
   if (company.open) continue;
   const model = company.models.find(item => (item.name || item.id).toLowerCase().startsWith(text));
   if (!model) continue;
   this.expand(company);
   this.reach(company.rows.find(item => item.dataset.model === model.id), 'center');
   return true;
  }
  return true;
 }
}

window.ModelStage = ModelStage;
})();
