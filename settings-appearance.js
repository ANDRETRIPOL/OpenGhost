(() => {
'use strict';

// Settings → Appearance: the themes as small windows of the app itself, painted with the real theme colors.
// Picking one spreads the new theme from that window over the whole app.
const CHOICES = ['light', 'dark', 'system'];
const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.6 6.3l2.3 2.3 4.6-4.9"/></svg>';

const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const within = (el, { clientX: x, clientY: y }) => {
 const box = el.getBoundingClientRect();
 return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
};

function preview(theme) {
 return `
  <span class="theme-preview" data-theme="${theme}">
   <span class="theme-preview-side"><i></i><i></i><i></i><i></i></span>
   <span class="theme-preview-chat">
    <span class="theme-preview-bubble"></span>
    <span class="theme-preview-ghost">${Glyphs.ghost}</span>
    <span class="theme-preview-line"></span>
    <span class="theme-preview-line is-short"></span>
    <span class="theme-preview-composer"><span class="theme-preview-send"></span></span>
   </span>
  </span>`;
}

function option(choice) {
 const art = choice === 'system' ? `${preview('light')}${preview('dark')}` : preview(choice);
 return `
  <button type="button" class="theme-option" role="radio" data-choice="${choice}" aria-checked="false" tabindex="-1">
   <span class="theme-frame${choice === 'system' ? ' is-split' : ''}">${art}<span class="theme-check">${CHECK}</span></span>
   <span class="theme-label">${escapeHtml(I18n.t(`settings.theme.${choice}`))}</span>
  </button>`;
}

class AppearanceSettings {
 constructor(root) {
  this.root = root;
  root.innerHTML = `
   <p class="settings-lead">${escapeHtml(I18n.t('settings.appearance.lead'))}</p>
   <div class="theme-options" role="radiogroup" aria-label="${escapeHtml(I18n.t('settings.theme'))}">${CHOICES.map(option).join('')}</div>`;
  this.options = [...root.querySelectorAll('.theme-option')];
  for (const item of this.options) item.addEventListener('click', () => this.pick(item));
  root.querySelector('.theme-options').addEventListener('keydown', event => this.onKey(event));
  // Mid-transition a click reaches only <html>, so the card under the pointer is found by where it landed.
  document.addEventListener('click', event => {
   if (event.target !== document.documentElement || !Theme.moving) return;
   const item = this.options.find(option => within(option.querySelector('.theme-frame'), event));
   if (item) this.pick(item);
  });
  this.paint();
 }

 paint() {
  for (const item of this.options) {
   const on = item.dataset.choice === Theme.choice;
   item.setAttribute('aria-checked', String(on));
   item.tabIndex = on ? 0 : -1;
  }
 }

 pick(item) {
  if (item.dataset.choice === Theme.choice) return;
  const box = item.querySelector('.theme-frame').getBoundingClientRect();
  Theme.set(item.dataset.choice, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
  this.paint();
 }

 onKey(event) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const at = this.options.findIndex(item => item.dataset.choice === Theme.choice);
  const next = this.options[(at + step + this.options.length) % this.options.length];
  next.focus();
  this.pick(next);
 }
}

window.AppearanceSettings = AppearanceSettings;
})();
