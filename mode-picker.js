(() => {
'use strict';

// The agent mode. The button in the composer names it and gives way to a dock of the three modes grown out of it, the way the
// plus does: the lens rests on the current mode and a dot stands under it. Choosing another moves the dot there and the
// button takes its name; as the dock closes, the current mode's icon goes home and the button comes back around it.
const MODES = [
 { id: 'ask', icon: 'lock' },
 { id: 'auto', icon: 'shield' },
 { id: 'full', icon: 'shieldAlert', tone: 'warn' },
];
const RESIZE = { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const LABEL = { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const LAND = { duration: 460, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const icon = mode => `<span class="mode-icon" data-mode="${mode.id}">${Glyphs[mode.icon]}</span>`;
const pickers = new Set();

class ModePicker {
 constructor({ button, host = document.body, anchor = '--mode', settings, onChange }) {
  pickers.add(this);
  this.button = button;
  this.settings = settings;
  this.onChange = onChange;
  this.shown = null;
  button.removeAttribute('popovertarget');
  button.innerHTML = `<span class="composer-mode-icons">${MODES.map(icon).join('')}</span><span class="composer-mode-label"></span>`;
  this.icons = button.querySelector('.composer-mode-icons');
  this.label = button.querySelector('.composer-mode-label');
  this.dock = new Dock({
   button,
   host,
   anchor,
   label: I18n.t('mode'),
   choice: true,
   source: () => this.icons,
   items: MODES.map(mode => ({ id: mode.id, glyph: Glyphs[mode.icon], name: I18n.t(`mode.${mode.id}`), hint: I18n.t(`mode.${mode.id}.hint`), tone: mode.tone || '' })),
   onOpen: () => this.dock.setCurrent(this.settings.mode),
   onToggle: open => {
    button.setAttribute('aria-expanded', String(open));
    if (open) button.classList.add('is-away');
   },
   onReturn: () => this.home(),
   onPick: mode => this.set(mode),
  });
  button.addEventListener('click', event => this.dock.toggle(event.detail === 0));
  this.sync();
 }

 set(mode) {
  if (mode === this.settings.mode) return;
  this.settings.setMode(mode);
  for (const picker of pickers) picker.sync();
  for (const picker of pickers) picker.onChange?.(mode);
 }

 // The button is back, and the mode's icon settles in it with a small bounce.
 home() {
  this.button.classList.remove('is-away');
  if (!reducedMotion()) this.icons.animate([{ transform: 'scale(0.82)' }, { transform: 'none' }], LAND);
 }

 destroy() {
  pickers.delete(this);
  this.dock.destroy();
 }

 sync() {
  const mode = this.settings.mode;
  if (mode === this.shown) return;
  const first = this.shown === null, from = this.button.offsetWidth;
  this.shown = mode;
  this.button.dataset.mode = mode;
  this.label.textContent = I18n.t(`mode.${mode}`);
  this.button.setAttribute('aria-label', I18n.t('mode.current', { name: I18n.t(`mode.${mode}`) }));
  this.button.title = I18n.t(`mode.${mode}.hint`);
  if (this.dock.open) this.dock.setCurrent(mode);
  if (first || reducedMotion()) return;
  const to = this.button.offsetWidth;
  if (from && to && from !== to) this.button.animate([{ width: `${from}px` }, { width: `${to}px` }], RESIZE);
  this.label.animate([{ opacity: 0, filter: 'blur(4px)', transform: 'translateY(3px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], LABEL);
 }
}

window.ModePicker = ModePicker;
})();
