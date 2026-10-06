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
  this.held = null;
  for (const item of this.options) item.addEventListener('click', event => this.pick(item, event));
  root.querySelector('.theme-options').addEventListener('keydown', event => this.onKey(event));
  // Mid-transition a click reaches only <html>, so the card under the pointer is found by where it landed.
  document.addEventListener('click', event => {
   if (event.target !== document.documentElement || !Theme.moving) return;
   const item = this.options.find(option => within(option.querySelector('.theme-frame'), event));
   if (item) this.pick(item, event);
  });
  // For the same reason the card under the pointer loses its hover while the theme spreads, at the hand's slightest move,
  // and would sink and rise again once the theme is in. The card picked by the pointer keeps the hover's look instead,
  // until the pointer is seen off it or leaves the window.
  document.addEventListener('pointermove', event => { if (this.held && !within(this.held, event)) this.hold(null); });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) this.hold(null); });
  this.paint();
  if (window.openghost?.size) new SizeSettings(root, window.openghost.size);
 }

 paint() {
  for (const item of this.options) {
   const on = item.dataset.choice === Theme.choice;
   item.setAttribute('aria-checked', String(on));
   item.tabIndex = on ? 0 : -1;
  }
 }

 pick(item, event = null) {
  if (item.dataset.choice === Theme.choice) return;
  // A click from the keyboard has no pointer to keep the hover for.
  if (event?.detail && within(item, event)) this.hold(item);
  const box = item.querySelector('.theme-frame').getBoundingClientRect();
  Theme.set(item.dataset.choice, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
  this.paint();
 }

 hold(item) {
  if (item === this.held) return;
  this.held?.classList.remove('is-held');
  this.held = item;
  item?.classList.add('is-held');
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

// Settings → Appearance → Size: how large the app is drawn. The main process fits it to the screen by itself (desktop/size.js);
// the steps pick a size by hand, and Fit screen hands it back. The keys Ctrl + / Ctrl − / Ctrl 0 change the same thing.
const MINUS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M3.5 8h9"/></svg>';
const PLUS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9"/></svg>';
const SHIFT = { duration: 260, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };

class SizeSettings {
 constructor(root, bridge) {
  this.bridge = bridge;
  this.state = null;
  const mac = window.openghost?.platform === 'darwin', key = mac ? '⌘' : 'Ctrl';
  const hint = I18n.t('settings.size.hint', { plus: `${key} +`, minus: `${key} −`, zero: `${key} 0` });
  root.insertAdjacentHTML('beforeend', `
   <div class="settings-row size-row">
    <div class="settings-text">
     <span class="settings-label" id="size-label">${escapeHtml(I18n.t('settings.size'))}</span>
     <p class="settings-hint">${escapeHtml(hint)}</p>
    </div>
    <div class="size-control" role="group" aria-labelledby="size-label">
     <button type="button" class="settings-button size-auto" aria-pressed="false">${escapeHtml(I18n.t('settings.size.auto'))}</button>
     <button type="button" class="size-step" data-step="-1" aria-label="${escapeHtml(I18n.t('settings.size.smaller'))}">${MINUS}</button>
     <span class="size-value" aria-live="polite"><span class="size-number"></span></span>
     <button type="button" class="size-step" data-step="1" aria-label="${escapeHtml(I18n.t('settings.size.larger'))}">${PLUS}</button>
    </div>
   </div>`);
  const row = root.querySelector('.size-row');
  this.auto = row.querySelector('.size-auto');
  this.value = row.querySelector('.size-value');
  this.steps = [...row.querySelectorAll('.size-step')];
  this.auto.addEventListener('click', () => this.state?.choice !== 'auto' && this.set('auto'));
  for (const button of this.steps) button.addEventListener('click', () => this.step(+button.dataset.step));
  bridge.onChange(state => this.render(state));
  bridge.get().then(state => state && this.render(state), () => {});
 }

 step(direction) {
  const { sizes, zoom } = this.state || {};
  if (!sizes) return;
  const next = direction > 0 ? sizes.find(size => size > zoom + 0.001) : sizes.findLast(size => size < zoom - 0.001);
  if (next) this.set(next);
 }

 set(choice) {
  this.bridge.set(choice).then(state => state && this.render(state), () => {});
 }

 render(state) {
  const before = this.state;
  this.state = state;
  const percent = `${Math.round(state.zoom * 100)}%`, number = this.value.querySelector('.size-number');
  this.auto.setAttribute('aria-pressed', String(state.choice === 'auto'));
  this.auto.classList.toggle('is-primary', state.choice === 'auto');
  this.steps[0].disabled = state.zoom <= state.sizes[0] + 0.001;
  this.steps[1].disabled = state.zoom >= state.sizes.at(-1) - 0.001;
  if (number.textContent === percent) return;
  // The number rolls the way the size went: up for larger, down for smaller.
  if (before && number.textContent && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
   const old = number.cloneNode(true), dir = state.zoom > before.zoom ? -1 : 1;
   old.classList.add('is-leaving');
   number.before(old);
   old.animate({ transform: ['none', `translateY(${dir * 70}%)`], opacity: [1, 0] }, SHIFT).finished.then(() => old.remove(), () => old.remove());
   number.animate({ transform: [`translateY(${-dir * 70}%)`, 'none'], opacity: [0, 1] }, SHIFT);
  }
  number.textContent = percent;
 }
}

window.AppearanceSettings = AppearanceSettings;
})();
