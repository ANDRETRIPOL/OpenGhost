(() => {
'use strict';

// Settings → General → Language. A button names the language the app speaks; pressed, a small menu opens over it with
// the language in use lying right on the button, as a pop-up button's menu does, each language under its own name and,
// beside it, its name in the language on screen. One highlight glides between the rows.
// Picking another keeps it (i18n.js) and reads the page anew: every word of the page is set as it is built. That would
// stop an agent at work, so while one works the language stays, and the line under the button says why.
const CHECK = '<svg class="lang-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.6 6.3l2.3 2.3 4.6-4.9"/></svg>';
const ARROWS = '<svg class="lang-arrows" viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.2 5.2L5 2.4l2.8 2.8M2.2 8.8L5 11.6l2.8-2.8"/></svg>';
const STATUS_TIME = 6000;
// The menu keeps this far inside the settings' page.
const EDGE = 8;

// The highlight follows the pointer on the spring the list of chats has: it keeps its speed from row to row.
const GLIDE_SPRING = [520, 40];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function spring(s, goal, [k, c], dt) {
 const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
 for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
 if (Math.abs(goal - s[0]) < 0.01 && Math.abs(s[1]) < 0.05) { s[0] = goal; s[1] = 0; return false; }
 return true;
}

const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

class LanguageSettings {
 constructor(root) {
  this.root = root;
  this.statusTimer = 0;
  // Where the highlight is and how fast it goes; where it is going.
  this.at = [0, 0];
  this.goal = 0;
  this.raf = 0;
  this.last = 0;
  this.tick = this.tick.bind(this);
  const t = key => escapeHtml(I18n.t(key));
  const now = I18n.languages.find(item => item.code === I18n.lang);
  root.innerHTML = `
   <div class="general-head lang-head">
    <span class="settings-label" id="settings-language-label">${t('settings.language')}</span>
    <button type="button" class="lang-button" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="settings-language-label settings-language-now"><span id="settings-language-now">${escapeHtml(now.name)}</span>${ARROWS}</button>
   </div>
   <p class="settings-hint">${t('settings.language.hint')}</p>
   <p class="settings-status lang-status" role="status"></p>
   <div class="lang-menu" popover role="listbox" aria-labelledby="settings-language-label">
    <span class="lang-glide" aria-hidden="true"></span>
    ${I18n.languages.map(({ code, name }) => {
     const said = I18n.t(`lang.${code}`);
     return `<button type="button" class="lang-option" role="option" data-code="${code}" lang="${code}" aria-selected="${code === I18n.lang}" tabindex="-1"><span class="lang-name">${escapeHtml(name)}</span><span class="lang-note" lang="${I18n.lang}">${said === name ? '' : escapeHtml(said)}</span>${CHECK}</button>`;
    }).join('')}
   </div>`;
  this.button = root.querySelector('.lang-button');
  this.menu = root.querySelector('.lang-menu');
  this.glider = root.querySelector('.lang-glide');
  this.status = root.querySelector('.lang-status');
  this.options = [...root.querySelectorAll('.lang-option')];
  this.button.addEventListener('click', () => this.open());
  this.menu.addEventListener('toggle', event => {
   const open = event.newState === 'open';
   this.button.setAttribute('aria-expanded', String(open));
   this.button.classList.toggle('is-open', open);
  });
  for (const option of this.options) {
   option.addEventListener('click', () => this.pick(option.dataset.code));
   option.addEventListener('pointerenter', () => this.point(option));
   option.addEventListener('focus', () => this.point(option));
  }
  this.menu.addEventListener('keydown', event => this.onKey(event));
 }

 get current() {
  return this.options.find(option => option.dataset.code === I18n.lang);
 }

 open() {
  if (this.locked()) return;
  this.say('');
  const menu = this.menu, at = this.button.getBoundingClientRect();
  menu.showPopover();
  // The language in use lies on the button, as far as the settings' page has room for it; the menu's right edge
  // follows the button's.
  const row = this.current, pad = (menu.offsetWidth - row.offsetWidth) / 2, room = this.root.closest('.settings-page').getBoundingClientRect();
  const left = Math.min(room.right - EDGE - menu.offsetWidth, Math.max(room.left + EDGE, at.right + pad - menu.offsetWidth));
  const top = Math.min(room.bottom - EDGE - menu.offsetHeight, Math.max(room.top + EDGE, at.top + at.height / 2 - row.offsetTop - row.offsetHeight / 2));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.transformOrigin = `${at.left + at.width / 2 - left}px ${at.top + at.height / 2 - top}px`;
  this.point(row, true);
  row.focus({ preventScroll: true });
 }

 // The highlight goes to the row under the pointer or the keys.
 point(option, instant = false) {
  this.goal = option.offsetTop;
  this.glider.style.height = `${option.offsetHeight}px`;
  if (instant || reducedMotion()) {
   this.at = [this.goal, 0];
   this.glider.style.transform = `translateY(${this.goal}px)`;
   return;
  }
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032);
  this.last = now;
  const moving = spring(this.at, this.goal, GLIDE_SPRING, dt);
  this.glider.style.transform = `translateY(${this.at[0].toFixed(2)}px)`;
  if (moving) this.raf = requestAnimationFrame(this.tick);
 }

 onKey(event) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const at = this.options.indexOf(document.activeElement);
  this.options[(Math.max(0, at) + step + this.options.length) % this.options.length].focus({ preventScroll: true });
 }

 // While an agent works the page can't be read anew.
 locked() {
  if (!LanguageSettings.busy?.()) return false;
  this.say(I18n.t('settings.language.locked'));
  return true;
 }

 pick(code) {
  this.menu.hidePopover();
  this.button.focus({ preventScroll: true });
  if (code === I18n.lang || this.locked() || !I18n.set(code)) return;
  // The page comes back in the settings, where it was left.
  try { sessionStorage.setItem('openghost.reopen', 'general'); } catch {}
  location.reload();
 }

 say(text) {
  clearTimeout(this.statusTimer);
  this.status.textContent = text;
  if (text) this.statusTimer = setTimeout(() => this.say(''), STATUS_TIME);
 }
}

window.LanguageSettings = LanguageSettings;
})();
