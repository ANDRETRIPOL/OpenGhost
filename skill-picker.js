(() => {
'use strict';

// The skills over the message field: typing / at the start of a word lists them in a small panel of the search's glass
// above the field, and the letters after it narrow the list. Arrows move the plate, Enter or Tab (or a press) puts the
// skill into the field as a chip in place of what was typed, Escape lets the list go. The field keeps the keyboard all
// along. In a new chat the folder's pill over the field makes way while the list is out, and comes back once it goes.
const SHOWN = 7;
const TYPED = /(?:^|[\s(])\/([a-z0-9-]{0,64})$/i;
const OPEN = { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const CLOSE = { duration: 120, easing: 'ease-out', fill: 'forwards' };
const GAP = 10;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class SkillPicker {
 constructor({ input, text, anchor, onPick = null }) {
  Object.assign(this, { input, text, anchor, onPick });
  this.items = [];
  this.at = 0;
  this.typed = null;
  this.shown = false;
  const root = this.root = document.createElement('div');
  root.className = 'skill-picker';
  root.popover = 'manual';
  root.innerHTML = '<div class="skill-picker-panel glass-lens"><span class="skill-picker-glide" aria-hidden="true"></span><ul class="skill-picker-list" role="listbox" id="skill-picker-list"></ul></div>';
  document.body.append(root);
  this.panel = root.querySelector('.skill-picker-panel');
  this.list = root.querySelector('.skill-picker-list');
  this.glider = root.querySelector('.skill-picker-glide');
  this.list.setAttribute('aria-label', I18n.t('skills.picker'));
  input.addEventListener('input', () => this.update());
  input.addEventListener('click', () => this.update());
  input.addEventListener('blur', () => this.hide());
  // Before the field's own keys: Enter here picks, it does not send.
  input.addEventListener('keydown', event => this.onKey(event), true);
  this.panel.addEventListener('pointerdown', event => event.preventDefault());
  this.list.addEventListener('pointermove', event => {
   const row = event.target.closest('.skill-picker-row');
   if (row) this.select(Number(row.dataset.at));
  });
  this.list.addEventListener('click', event => {
   const row = event.target.closest('.skill-picker-row');
   if (row) this.pick(this.items[Number(row.dataset.at)]);
  });
  window.addEventListener('resize', () => { if (this.shown) this.place(); });
 }

 // The /word right before the caret, if the caret stands at the end of one.
 query() {
  const input = this.input;
  if (input.selectionStart !== input.selectionEnd) return null;
  const caret = input.selectionStart, m = input.value.slice(0, caret).match(TYPED);
  return m ? { from: caret - m[1].length - 1, to: caret, word: m[1].toLowerCase() } : null;
 }

 // Those whose name begins with what was typed first, then those whose name or description has it.
 found(word) {
  const all = (window.Skills?.of(Skills.folder) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!word) return all;
  const rank = item => item.name.startsWith(word) ? 0 : item.name.includes(word) ? 1 : item.description.toLowerCase().includes(word) ? 2 : -1;
  return all.map(item => ({ item, rank: rank(item) })).filter(entry => entry.rank >= 0).sort((a, b) => a.rank - b.rank).map(entry => entry.item);
 }

 update() {
  const typed = this.query(), items = typed ? this.found(typed.word).slice(0, SHOWN) : [];
  if (!items.length) { this.hide(); return; }
  this.typed = typed;
  this.render(items, typed.word);
  if (!this.shown) this.show();
 }

 render(items, word) {
  const same = items.length === this.items.length && items.every((item, k) => item.name === this.items[k]?.name);
  this.items = items;
  if (!same) {
   this.list.replaceChildren(...items.map((item, k) => {
    const el = document.createElement('li');
    el.className = 'skill-picker-row';
    el.setAttribute('role', 'option');
    el.id = `skill-picker-${k}`;
    el.dataset.at = String(k);
    el.innerHTML = `<span class="skill-picker-sign">${Glyphs.skill}</span><span class="skill-picker-name"></span><span class="skill-picker-about"></span>`;
    el.querySelector('.skill-picker-about').textContent = item.description;
    el.title = item.description;
    return el;
   }));
   this.at = 0;
  }
  // What was typed stands out in the name by its weight alone.
  [...this.list.children].forEach((el, k) => {
   const name = el.querySelector('.skill-picker-name'), text = items[k].name, at = word ? text.indexOf(word) : -1;
   name.textContent = '';
   if (at < 0) name.textContent = text;
   else name.append(text.slice(0, at), Object.assign(document.createElement('mark'), { textContent: word }), text.slice(at + word.length));
  });
  this.select(Math.min(this.at, items.length - 1), true);
 }

 select(at, instant = false) {
  this.at = at;
  const rows = [...this.list.children];
  rows.forEach((el, k) => el.setAttribute('aria-selected', String(k === at)));
  const el = rows[at], style = this.glider.style;
  if (!el) { style.opacity = '0'; return; }
  this.input.setAttribute('aria-activedescendant', el.id);
  if (instant || style.opacity !== '1') { style.transition = 'none'; requestAnimationFrame(() => { style.transition = ''; }); }
  style.transform = `translateY(${el.offsetTop}px)`;
  style.height = `${el.offsetHeight}px`;
  style.opacity = '1';
  el.scrollIntoView({ block: 'nearest' });
 }

 // Over the message field, at its left edge, as wide as suits a list.
 place() {
  const box = this.anchor.getBoundingClientRect(), style = this.root.style;
  style.setProperty('--picker-x', `${Math.round(box.left + 8)}px`);
  style.setProperty('--picker-bottom', `${Math.round(window.innerHeight - box.top + GAP)}px`);
  style.setProperty('--picker-width', `${Math.round(Math.min(460, box.width - 16))}px`);
 }

 show() {
  this.shown = true;
  this.anchor.closest('.main')?.classList.add('is-picking');
  this.place();
  this.root.showPopover();
  this.input.setAttribute('aria-controls', 'skill-picker-list');
  this.input.setAttribute('aria-expanded', 'true');
  this.select(this.at, true);
  for (const animation of this.panel.getAnimations()) animation.cancel();
  this.panel.animate(reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(6px) scale(0.98)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], OPEN);
 }

 hide() {
  if (!this.shown) return;
  this.shown = false;
  this.anchor.closest('.main')?.classList.remove('is-picking');
  this.typed = null;
  this.input.removeAttribute('aria-activedescendant');
  this.input.setAttribute('aria-expanded', 'false');
  const done = () => { if (!this.shown) { this.root.hidePopover(); for (const animation of this.panel.getAnimations()) animation.cancel(); } };
  this.panel.animate(reducedMotion() ? { opacity: 0 } : { opacity: 0, transform: 'translateY(4px) scale(0.98)', filter: 'blur(2px)' }, CLOSE).finished.then(done, done);
 }

 onKey(event) {
  if (!this.shown || event.isComposing) return;
  const key = event.key, last = this.items.length - 1;
  const stop = () => { event.preventDefault(); event.stopImmediatePropagation(); };
  if (key === 'ArrowDown' || key === 'ArrowUp') {
   stop();
   this.select(key === 'ArrowDown' ? (this.at + 1) % (last + 1) : (this.at + last) % (last + 1));
  } else if ((key === 'Enter' || key === 'Tab') && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
   stop();
   this.pick(this.items[this.at]);
  } else if (key === 'Escape') {
   stop();
   this.hide();
  }
 }

 pick(item) {
  const typed = this.typed;
  this.hide();
  if (!item || !typed) return;
  this.text.insertSkill(item.name, typed.from, typed.to);
  this.onPick?.(item);
 }
}

window.SkillPicker = SkillPicker;
})();
