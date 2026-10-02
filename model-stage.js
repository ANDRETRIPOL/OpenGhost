(() => {
'use strict';

const OPEN = { veil: 460, flight: 640, lift: 40, delay: 90, row: 90, letters: 560, stagger: 26, spread: 420, meta: 180 };
const CLOSE = { veil: 380, veilDelay: 60, flight: 540, letters: 240, stagger: 12 };
const HOP = { duration: 420, spin: 90 };
const WAVE = { duration: 560, stagger: 22, spread: 300 };
const TWIRL = { duration: 760, turn: 180, swell: 1.2 };
const EASE = {
 motion: 'cubic-bezier(0.32, 0.72, 0, 1)',
 out: 'cubic-bezier(0.22, 1, 0.36, 1)',
 flight: 'cubic-bezier(0.5, 0, 0.18, 1)',
 spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
 wave: 'cubic-bezier(0.33, 1, 0.68, 1)',
};
// The veil takes the theme's look (--stage-veil): darker and dimmer over the dark theme, milky over the light one.
function veil() {
 const style = getComputedStyle(document.documentElement);
 const filter = style.getPropertyValue('--stage-veil').trim(), color = style.getPropertyValue('--stage-veil-bg').trim();
 const rest = filter.replace(/blur\([^)]*\)/g, 'blur(0px)').replace(/(brightness|contrast|saturate)\([^)]*\)/g, '$1(1)');
 return [{ backdropFilter: rest, backgroundColor: 'transparent' }, { backdropFilter: filter, backgroundColor: color }];
}
const ARC = { steps: 16, bend: -0.32, spin: -70 };
const GAP = 26;
const MARK = 30;
// Room the list keeps: above it for the title bar, and inside it for the glow, the ripple and the drum's sideways drift.
const ROOM = { top: 52, right: 68, bottom: 10 };
// Many models turn the list into a drum: rows away from its middle drift right, tilt and shrink a little.
const DRUM = { reach: 320, shift: 34, tilt: 3.2, shrink: 0.07 };
const GROUPS = { chatgpt: 'ChatGPT', openai: 'OpenAI API', anthropic: 'Anthropic', deepseek: 'DeepSeek' };

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
 ].filter(Boolean).join(' · ');
}

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

 current() {
  return this.rows.find(row => row.dataset.model === this.chat.model) || this.rows[0] || null;
 }

 sync() {
  const locked = this.chat.busy, name = this.name(this.chat.model);
  this.button.setAttribute('label', name ? I18n.t('model.current', { name }) : I18n.t('model.none'));
  this.button.toggleAttribute('disabled', locked);
  this.button.title = locked ? I18n.t('model.locked') : '';
  if (locked && (this.state === 'open' || this.state === 'confirm')) this.cancel();
 }

 // Models come grouped by provider, under a small label once there is more than one provider.
 build() {
  this.list.setAttribute('aria-label', I18n.t('model'));
  const models = this.settings.models, providers = [...new Set(models.map(model => model.provider))];
  const slots = [];
  this.rows = [];
  this.groups = [];
  for (const provider of providers) {
   if (providers.length > 1) {
    const label = document.createElement('div');
    label.className = 'model-group';
    label.dataset.provider = provider;
    label.textContent = GROUPS[provider] || provider;
    this.groups.push(label);
    slots.push(slot(label));
   }
   for (const model of models.filter(item => item.provider === provider)) {
    const name = model.name || model.id, info = meta(model);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'model-row';
    row.dataset.model = model.id;
    row.dataset.provider = provider;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-label', `${name}, ${info}`);
    row.innerHTML = `<span class="model-text" aria-hidden="true"><span class="model-name">${letters(name)}</span><span class="model-meta">${escapeHtml(info)}</span></span><span class="model-mark" aria-hidden="true"></span>`;
    this.rows.push(row);
    slots.push(slot(row));
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

 // The glyph column stands right above the button; the list grows up from the composer and scrolls once it reaches the top.
 place() {
  const b = this.button.getBoundingClientRect(), top = this.button.closest('.composer').getBoundingClientRect().top;
  const bottom = innerHeight - top + GAP;
  Object.assign(this.list.style, {
   right: `${Math.max(0, innerWidth - (b.left + b.width / 2) - MARK / 2 - ROOM.right)}px`,
   bottom: `${bottom - ROOM.bottom}px`,
   maxHeight: `${Math.max(180, innerHeight - bottom - ROOM.top + ROOM.bottom)}px`,
  });
  this.bend();
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
  this.build();
  this.root.showPopover();
  this.place();
  this.button.setAttribute('expanded', '');
  const current = this.current();
  for (const row of this.rows) row.setAttribute('aria-selected', String(row === current));
  this.middle(current);
  this.rest(current);
  if (!current) return;
  if (reducedMotion()) { this.mark(current); return; }
  this.veil.animate(veil(), { duration: OPEN.veil, easing: EASE.motion, fill: 'both' });
  const count = this.rows.length, pace = Math.min(OPEN.row, 480 / count);
  this.groups.forEach(label => {
   const first = this.rows.findIndex(row => row.dataset.provider === label.dataset.provider);
   label.animate([{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 420, delay: OPEN.delay + (count - 1 - first) * pace, easing: EASE.out, fill: 'backwards' });
  });
  this.rows.forEach((row, r) => {
   // Rows rise from the button upwards: the nearest one first.
   const base = OPEN.delay + (count - 1 - r) * pace, chars = row.querySelectorAll('.model-letter');
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

 // The button's glyph lifts off and lands next to the chat's model.
 launch(row) {
  const mark = this.mark(row, true), timing = { duration: OPEN.flight, delay: OPEN.lift, easing: EASE.flight };
  const flyer = this.makeFlyer(mark.getBoundingClientRect().width, this.button.turn, timing);
  this.button.away(true);
  arc(flyer, center(this.button.glyphRect()), center(mark.getBoundingClientRect()), timing).finished.then(() => {
   if (this.flyer !== flyer) return;
   this.dropFlyer();
   this.mark(row);
   mark.animate([{ transform: 'scale(1.3)' }, { transform: 'none' }], { duration: 520, easing: EASE.spring });
  }, () => {});
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
 wave(row) {
  const chars = row.querySelectorAll('.model-letter'), step = stagger(chars.length, WAVE.stagger, WAVE.spread);
  chars.forEach((letter, k) => letter.animate(
   [{ transform: 'none' }, { transform: 'translateY(-0.14em)', offset: 0.38 }, { transform: 'none' }],
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
  const id = row.dataset.model;
  if (id === this.chat.model) { this.close(); return; }
  if (this.chat.hasHistory()) { this.confirm(row); return; }
  this.state = 'hop';
  this.chat.setModel(id);
  for (const item of this.rows) item.setAttribute('aria-selected', String(item === row));
  if (reducedMotion()) { this.mark(row); this.state = 'open'; this.close(); return; }
  this.hop(row).then(() => {
   this.state = 'open';
   this.close();
  });
 }

 confirm(row) {
  this.state = 'confirm';
  this.choice = row;
  this.focus(row, false);
  for (const other of this.rows) other.closest('.model-slot').classList.toggle('is-gone', other !== row);
  for (const label of this.groups) label.closest('.model-slot').classList.add('is-gone');
  this.dropFlyer();
  const mark = this.mark(row);
  if (!reducedMotion()) mark.animate([{ opacity: 0, transform: 'scale(0.2) rotate(-120deg)' }, { opacity: 1, transform: 'none' }], { duration: 620, delay: 120, easing: EASE.spring, fill: 'backwards' });
  const from = this.name(this.chat.model), to = this.name(row.dataset.model);
  this.ask.innerHTML = `
   <p class="model-confirm-title" id="model-confirm-title">${words(I18n.t('model.confirm.title', { name: to }))}</p>
   <p class="model-confirm-text">${escapeHtml(I18n.t('model.confirm.text', { from, to }))}</p>
   <div class="model-confirm-actions">
    <button type="button" class="approval-button is-deny" data-answer="cancel">${escapeHtml(I18n.t('model.confirm.cancel'))}</button>
    <button type="button" class="approval-button is-allow" data-answer="ok">${escapeHtml(I18n.t('model.confirm.ok'))}</button>
   </div>`;
  this.ask.setAttribute('aria-labelledby', 'model-confirm-title');
  this.ask.querySelector('[data-answer="cancel"]').addEventListener('click', () => this.cancel());
  this.ask.querySelector('[data-answer="ok"]').addEventListener('click', () => this.accept());
  this.askSlot.classList.remove('is-folded');
  this.ask.querySelector('[data-answer="ok"]').focus({ preventScroll: true });
  if (reducedMotion()) return;
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
  this.close();
  this.chat.switchModel(id);
 }

 cancel() {
  if (this.state === 'open' || this.state === 'confirm') this.close();
 }

 // Everything dissolves and the glyph flies home from wherever it stands.
 close() {
  if (this.state !== 'open' && this.state !== 'confirm') return;
  this.state = 'closing';
  this.button.removeAttribute('expanded');
  if (reducedMotion()) { this.finish(); return; }
  const waits = [];
  const live = this.flyer?.isConnected ? this.flyer.getBoundingClientRect() : null;
  for (const item of this.rows) {
   const glyphs = [...item.querySelectorAll('.model-letter')].reverse(), step = stagger(glyphs.length, CLOSE.stagger, 160);
   glyphs.forEach((letter, k) => letter.animate(
    [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-0.3em)', filter: 'blur(6px)' }],
    { duration: CLOSE.letters, delay: k * step, easing: 'ease-in', fill: 'forwards' },
   ));
   item.querySelector('.model-meta').animate([{ opacity: 0, filter: 'blur(4px)' }], { duration: 200, fill: 'forwards' });
  }
  for (const label of this.groups) label.animate([{ opacity: 0, filter: 'blur(4px)' }], { duration: 200, fill: 'forwards' });
  this.ask.animate([{ opacity: 0, filter: 'blur(6px)', transform: 'translateY(-4px)' }], { duration: 240, easing: 'ease-in', fill: 'forwards' });
  waits.push(quiet(this.veil.animate(veil().reverse(), { duration: CLOSE.veil, delay: CLOSE.veilDelay, easing: EASE.motion, fill: 'both' })));
  const mark = this.marked?.querySelector('.model-mark svg');
  if (mark) {
   const from = live ? center(live) : center(mark.getBoundingClientRect()), timing = { duration: CLOSE.flight, easing: EASE.motion };
   const turn = ModelGlyph.turnOf(live ? this.flyer.querySelector('svg') : mark);
   const flyer = this.makeFlyer(mark.getBoundingClientRect().width, turn, timing);
   mark.parentElement.classList.add('is-away');
   waits.push(quiet(arc(flyer, from, center(this.button.glyphRect()), { ...timing, spin: -ARC.spin })).then(() => this.land()));
  } else {
   this.land();
  }
  Promise.all(waits).then(() => this.finish());
 }

 // The glyph is back in the button: it settles with a small bounce.
 land() {
  this.dropFlyer();
  this.button.away(false);
  if (!reducedMotion()) this.button.animate([{ transform: 'scale(0.82)' }, { transform: 'none' }], { duration: 460, easing: EASE.spring });
 }

 finish() {
  if (this.state !== 'closing') return;
  this.state = 'closed';
  this.dropFlyer();
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
  const k = this.rows.indexOf(this.focused);
  const step = { ArrowUp: -1, ArrowDown: 1, Tab: event.shiftKey ? -1 : 1 }[event.key];
  const to = step ? (k + step + this.rows.length) % this.rows.length : { Home: 0, End: this.rows.length - 1 }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  const row = this.rows[to];
  this.steered = performance.now() + 700;
  row?.focus({ preventScroll: true });
  row?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
 }
}

window.ModelStage = ModelStage;
})();
