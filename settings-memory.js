(() => {
'use strict';

// Settings → Memory: what OpenGhost remembers about the user from all chats. Every record can be rewritten in place or
// removed, a new one written under them, the memory switched off or emptied. Everything saves as it changes.
const ROW = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// A row folded shut: its padding goes too, or the height could not reach zero.
const FOLDED = { height: '0px', paddingTop: '0px', paddingBottom: '0px' };
const CONFIRM_TIME = 6000;
const CROSS = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

class MemorySettings {
 constructor({ root, memory }) {
  this.root = root;
  this.memory = memory;
  this.rows = new Map();
  this.confirmTimer = 0;
  const t = key => escapeHtml(I18n.t(key)), max = memory.limits.text;
  root.innerHTML = `
   <p class="settings-lead">${t('settings.memory.lead')}</p>
   <section class="general-block memory-block">
    <div class="general-head memory-head">
     <span class="settings-label" id="settings-memory-label">${t('settings.memory.switch')}</span>
     <button type="button" class="memory-switch" role="switch" aria-labelledby="settings-memory-label"><span class="memory-switch-knob"></span></button>
    </div>
    <p class="settings-hint">${t('settings.memory.hint')}</p>
    <div class="memory-body">
     <ul class="memory-list" aria-label="${t('settings.memory')}"></ul>
     <p class="memory-empty">${t('settings.memory.empty')}</p>
     <div class="general-field memory-add"><textarea class="memory-new" rows="1" maxlength="${max}" spellcheck="true" aria-label="${t('settings.memory.add')}" placeholder="${t('settings.memory.add')}"></textarea></div>
    </div>
   </section>
   <section class="general-block memory-foot">
    <div class="memory-clear-row">
     <button type="button" class="settings-button memory-clear">${t('settings.memory.clear')}</button>
     <span class="memory-confirm" hidden>
      <span class="memory-confirm-text">${t('settings.memory.clear.ask')}</span>
      <button type="button" class="settings-button memory-clear-yes">${t('settings.memory.clear.yes')}</button>
      <button type="button" class="settings-button memory-clear-no">${t('settings.memory.clear.no')}</button>
     </span>
    </div>
   </section>`;
  this.block = root.querySelector('.memory-block');
  this.toggle = root.querySelector('.memory-switch');
  this.list = root.querySelector('.memory-list');
  this.empty = root.querySelector('.memory-empty');
  this.input = root.querySelector('.memory-new');
  this.clear = root.querySelector('.memory-clear');
  this.confirm = root.querySelector('.memory-confirm');
  this.toggle.addEventListener('click', () => memory.setOn(!memory.on));
  // Enter writes the record down; a record is one line.
  this.input.addEventListener('keydown', event => {
   if (event.key !== 'Enter' || event.isComposing) return;
   event.preventDefault();
   if (memory.add(this.input.value, 'user')) this.input.value = '';
  });
  this.list.addEventListener('click', event => {
   const button = event.target.closest('.memory-remove');
   if (button) memory.remove(button.closest('.memory-row').dataset.id);
  });
  this.list.addEventListener('input', event => {
   const row = event.target.closest('.memory-row');
   if (row && event.target.value.trim()) memory.update(row.dataset.id, event.target.value, 'user');
  });
  this.list.addEventListener('keydown', event => {
   if (event.key === 'Enter' && !event.isComposing && event.target.matches('.memory-text')) { event.preventDefault(); event.target.blur(); }
  });
  // A record left with nothing in it is removed; one left with spaces at its ends is shown as it was saved.
  this.list.addEventListener('focusout', event => {
   const row = event.target.closest?.('.memory-row'), item = row && memory.find(row.dataset.id);
   if (!item) return;
   if (!event.target.value.trim()) memory.remove(item.id);
   else event.target.value = item.text;
  });
  this.clear.addEventListener('click', () => this.ask(true));
  root.querySelector('.memory-clear-no').addEventListener('click', () => this.ask(false, true));
  root.querySelector('.memory-clear-yes').addEventListener('click', () => {
   memory.clear();
   this.ask(false, true);
  });
  memory.onChange(() => this.render());
  memory.ready.then(() => this.render(false));
 }

 // Emptying the memory cannot be taken back, so the button first asks, and stops asking after a while.
 ask(on, focus = false) {
  clearTimeout(this.confirmTimer);
  this.clear.hidden = on;
  this.confirm.hidden = !on;
  if (on) {
   this.confirmTimer = setTimeout(() => this.ask(false), CONFIRM_TIME);
   this.confirm.querySelector('.memory-clear-no').focus();
   if (!reducedMotion()) this.confirm.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: ROW.easing });
  } else if (focus && !this.clear.disabled) this.clear.focus();
 }

 row(item) {
  const el = document.createElement('li');
  el.className = 'memory-row';
  el.dataset.id = item.id;
  el.innerHTML = `<textarea class="memory-text" rows="1" maxlength="${this.memory.limits.text}" spellcheck="true"></textarea><button type="button" class="general-file-remove memory-remove">${CROSS}</button>`;
  el.firstChild.setAttribute('aria-label', I18n.t('settings.memory.record'));
  el.lastChild.setAttribute('aria-label', I18n.t('settings.memory.remove'));
  return el;
 }

 // New records slide open into the list and removed ones fold away; the rest stay put. A record being typed in is left
 // as the user has it.
 render(animate = true) {
  const { memory } = this, items = memory.items, keep = new Set(items.map(item => item.id));
  const motion = animate && !reducedMotion() && this.root.offsetParent !== null;
  this.toggle.setAttribute('aria-checked', String(memory.on));
  this.block.classList.toggle('is-off', !memory.on);
  this.input.disabled = !memory.on || memory.full;
  this.empty.hidden = items.length > 0;
  this.clear.disabled = !items.length;
  if (!items.length && !this.confirm.hidden) this.ask(false);
  for (const [id, el] of this.rows) {
   if (keep.has(id)) continue;
   this.rows.delete(id);
   if (!motion) { el.remove(); continue; }
   el.style.pointerEvents = 'none';
   el.animate([{ height: `${el.offsetHeight}px`, opacity: 1, filter: 'blur(0)' }, { ...FOLDED, opacity: 0, filter: 'blur(4px)' }], { ...ROW, duration: 320, fill: 'forwards' })
    .finished.then(() => el.remove(), () => el.remove());
  }
  let before = null;
  for (const item of [...items].reverse()) {
   let el = this.rows.get(item.id);
   const fresh = !el;
   if (fresh) {
    el = this.row(item);
    this.rows.set(item.id, el);
   }
   if (el.nextElementSibling !== before || fresh) this.list.insertBefore(el, before);
   const field = el.firstChild;
   if (field !== document.activeElement && field.value !== item.text) field.value = item.text;
   field.disabled = !memory.on;
   if (fresh && motion) el.animate([{ ...FOLDED, opacity: 0, transform: 'translateY(-6px)', filter: 'blur(4px)' }, { height: `${el.offsetHeight}px`, opacity: 1, transform: 'none', filter: 'blur(0)' }], ROW);
   before = el;
  }
 }
}

window.MemorySettings = MemorySettings;
})();
