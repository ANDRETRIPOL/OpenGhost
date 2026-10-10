(() => {
'use strict';

// Settings → General: the user's standing instructions and the files OpenGhost keeps at hand in every chat.
// Everything saves as it changes; UserContext passes it to the model.
const ROW = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
// A row folded shut: its padding goes too, or the height could not reach zero.
const FOLDED = { height: '0px', paddingTop: '0px', paddingBottom: '0px' };
const STATUS_TIME = 6000;
const CHARS_PER_TOKEN = 3.2;
const PLUS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg>';
const CROSS = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
const tokens = chars => {
 const count = Math.max(1, Math.round(chars / CHARS_PER_TOKEN));
 return count < 1000 ? String(count) : `${(count / 1000).toFixed(count < 10000 ? 1 : 0).replace(/\.0$/, '')}k`;
};

// The quick chat's settings: whether it is on, the keys that call it, and whether the app starts with the computer.
// The keys are set by pressing them: the field listens until a combination comes, and Escape leaves it as it was.
const QUICK_KEYS = { Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
const QUICK_NAMES = { Control: 'Ctrl', Command: '⌘', Super: 'Win', Up: '↑', Down: '↓', Left: '←', Right: '→' };

class QuickSettings {
 constructor(root) {
  this.root = root;
  this.bridge = window.openghost?.quickChat;
  if (!this.bridge) return;
  this.mac = window.openghost.platform === 'darwin';
  this.toggle = root.querySelector('.quick-switch');
  this.keys = root.querySelector('.quick-keys');
  this.startup = root.querySelector('.quick-startup');
  this.startupToggle = root.querySelector('.quick-startup-switch');
  this.status = root.querySelector('.quick-status');
  this.state = null;
  this.recording = false;
  this.toggle.addEventListener('click', () => this.set({ on: !this.state.on }));
  this.startupToggle.addEventListener('click', () => this.set({ startup: !this.state.startup }));
  this.keys.addEventListener('click', () => this.record(!this.recording));
  this.keys.addEventListener('blur', () => this.record(false));
  this.keys.addEventListener('keydown', event => this.onKey(event));
  // Where the quick chat is not to be had, the block stays out of sight.
  this.bridge.get().then(state => {
   if (!state) return;
   root.hidden = false;
   this.paint(state);
  }).catch(() => {});
 }

 async set(changes) {
  const state = await this.bridge.set({ ...this.state, ...changes });
  if (state) this.paint(state);
 }

 record(on) {
  if (this.recording === on || !this.state?.on) return;
  this.recording = on;
  this.paint(this.state);
 }

 onKey(event) {
  if (!this.recording) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') { this.record(false); return; }
  const code = event.code;
  const key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit\d$/.test(code) ? code.slice(5) : /^F\d{1,2}$/.test(code) ? code : QUICK_KEYS[code];
  // A modifier alone is the start of a combination, not one.
  if (!key) return;
  const mods = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && (this.mac ? 'Command' : 'Super')].filter(Boolean);
  if (!mods.length && !/^F\d+$/.test(key)) return;
  this.recording = false;
  this.set({ shortcut: [...mods, key].join('+') });
 }

 words(shortcut) {
  return shortcut.split('+').map(part => part === 'Alt' && this.mac ? '⌥' : part === 'Super' && window.openghost.platform === 'linux' ? 'Super' : QUICK_NAMES[part] || part);
 }

 paint(state) {
  this.state = state;
  this.root.classList.toggle('is-off', !state.on);
  this.toggle.setAttribute('aria-checked', String(state.on));
  this.startup.hidden = !state.canStart;
  this.startupToggle.setAttribute('aria-checked', String(!!state.startup));
  this.keys.disabled = !state.on;
  this.keys.classList.toggle('is-recording', this.recording);
  this.keys.replaceChildren(...(this.recording ? [I18n.t('settings.quick.press')] : this.words(state.shortcut).map(word => Object.assign(document.createElement('kbd'), { textContent: word }))));
  const refused = state.refused || (state.failed && state.on ? state.shortcut : '');
  this.status.textContent = refused ? I18n.t('settings.quick.refused', { keys: this.words(refused).join(' + ') }) : '';
 }
}

class GeneralSettings {
 constructor({ root, context }) {
  this.root = root;
  this.context = context;
  this.rows = new Map();
  this.depth = 0;
  this.statusTimer = 0;
  const t = key => escapeHtml(I18n.t(key));
  root.innerHTML = `
   <p class="settings-lead">${t('settings.general.lead')}</p>
   <section class="general-block general-language"></section>
   <section class="general-block">
    <div class="general-head">
     <label class="settings-label" for="settings-instructions">${t('settings.instructions')}</label>
     <span class="general-count" aria-hidden="true"></span>
    </div>
    <p class="settings-hint">${t('settings.instructions.hint')}</p>
    <div class="general-field"><textarea id="settings-instructions" class="general-input" rows="4" maxlength="${context.limits.instructions}" spellcheck="true" placeholder="${t('settings.instructions.placeholder')}"></textarea></div>
   </section>
   <section class="general-block general-files-block">
    <div class="general-head"><span class="settings-label" id="settings-files-label">${t('settings.files')}</span></div>
    <p class="settings-hint">${t('settings.files.hint')}</p>
    <ul class="general-files" aria-labelledby="settings-files-label"></ul>
    <button type="button" class="general-drop">${PLUS}<span>${t('settings.files.drop')}</span></button>
    <p class="settings-status general-status" role="status"></p>
    <input class="general-picker" type="file" multiple hidden>
   </section>
   <section class="general-block general-quick" hidden>
    <div class="general-head quick-head">
     <span class="settings-label" id="settings-quick-label">${t('settings.quick')}</span>
     <button type="button" class="memory-switch quick-switch" role="switch" aria-labelledby="settings-quick-label"><span class="memory-switch-knob"></span></button>
    </div>
    <p class="settings-hint">${t('settings.quick.hint')}</p>
    <div class="quick-row"><span class="quick-row-label" id="settings-quick-keys">${t('settings.quick.keys')}</span><button type="button" class="quick-keys" aria-labelledby="settings-quick-keys"></button></div>
    <div class="quick-row quick-startup" hidden><span class="quick-row-label" id="settings-quick-startup">${t('settings.quick.startup')}</span><button type="button" class="memory-switch quick-startup-switch" role="switch" aria-labelledby="settings-quick-startup"><span class="memory-switch-knob"></span></button></div>
    <p class="settings-status quick-status" role="status"></p>
   </section>
   <section class="general-block general-access" hidden>
    <div class="general-head">
     <span class="settings-label">${t('settings.access')}</span>
     <span class="general-access-state" role="status"></span>
    </div>
    <p class="settings-hint">${t('settings.access.hint')}</p>
    <div class="general-access-actions">
     <button type="button" class="settings-button general-access-open">${t('settings.access.open')}</button>
     <button type="button" class="settings-button general-access-restart">${t('settings.access.restart')}</button>
    </div>
    <p class="settings-hint general-access-note">${t('settings.access.restart.hint')}</p>
   </section>`;
  new LanguageSettings(root.querySelector('.general-language'));
  this.quick = new QuickSettings(root.querySelector('.general-quick'));
  // A Mac asks the user itself before the app first opens some folders. The block is there only on a Mac.
  this.access = root.querySelector('.general-access');
  root.querySelector('.general-access-open').addEventListener('click', () => window.openghost?.access?.open());
  root.querySelector('.general-access-restart').addEventListener('click', () => window.openghost?.access?.restart());
  window.addEventListener('focus', () => this.paintAccess());
  this.paintAccess();
  this.input = root.querySelector('.general-input');
  this.count = root.querySelector('.general-count');
  this.list = root.querySelector('.general-files');
  this.block = root.querySelector('.general-files-block');
  this.status = root.querySelector('.general-status');
  this.picker = root.querySelector('.general-picker');
  // The field grows with the text and the box around it follows on a spring, like the composer.
  new SmoothHeight(root.querySelector('.general-field'), this.input);
  this.input.addEventListener('input', () => {
   context.setInstructions(this.input.value);
   this.paintCount();
  });
  root.querySelector('.general-drop').addEventListener('click', () => this.picker.click());
  this.picker.addEventListener('change', () => {
   this.add(this.picker.files);
   this.picker.value = '';
  });
  this.list.addEventListener('click', event => {
   const button = event.target.closest('.general-file-remove');
   if (button) this.remove(button.closest('.general-file').dataset.id);
  });
  this.block.addEventListener('dragenter', event => this.onDrag(event, 1));
  this.block.addEventListener('dragleave', event => this.onDrag(event, -1));
  this.block.addEventListener('dragover', event => {
   if (!hasFiles(event)) return;
   event.preventDefault();
   event.dataTransfer.dropEffect = 'copy';
  });
  this.block.addEventListener('drop', event => {
   if (!hasFiles(event)) return;
   event.preventDefault();
   this.depth = 0;
   this.block.classList.remove('is-dropping');
   this.add(event.dataTransfer.files);
  });
  context.onChange(() => this.render());
  context.ready.then(() => {
   this.input.value = context.instructions;
   this.paintCount();
   this.render(false);
  });
 }

 onDrag(event, step) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  this.depth = Math.max(0, this.depth + step);
  this.block.classList.toggle('is-dropping', this.depth > 0);
 }

 // The count shows only near the limit, where it matters.
 paintCount() {
  const length = this.input.value.length, max = this.context.limits.instructions;
  this.count.textContent = length > max * 0.85 ? `${length.toLocaleString('en-US')} / ${max.toLocaleString('en-US')}` : '';
 }

 async add(files) {
  if (!files?.length) return;
  this.say('');
  const skipped = await this.context.add(files);
  if (!skipped.length) return;
  const first = skipped[0];
  const text = first.reason === 'count'
   ? I18n.t('settings.files.count', { count: this.context.limits.files })
   : I18n.t(`settings.files.${first.reason}`, { name: first.name });
  this.say(text, 'error');
 }

 remove(id) {
  this.say('');
  this.context.remove(id);
 }

 say(text, tone = '') {
  clearTimeout(this.statusTimer);
  this.status.textContent = text;
  this.status.dataset.tone = tone;
  if (text) this.statusTimer = setTimeout(() => this.say(''), STATUS_TIME);
 }

 meta(file) {
  const info = FileKinds.describe(file.name);
  const parts = [info.name, FileKinds.formatSize(file.size)];
  if (file.kind === 'text') parts.push(I18n.t('settings.files.tokens', { count: tokens(file.chars) }));
  else if (file.kind === 'image' && file.width) parts.push(`${file.width}×${file.height}`);
  else if (file.kind === 'none') parts.push(I18n.t('settings.files.path'));
  return parts.join(' · ');
 }

 row(file) {
  const el = document.createElement('li');
  el.className = 'general-file';
  el.dataset.id = file.id;
  const url = file.kind === 'image' ? this.context.payloads.get(file.id)?.url : '';
  const art = url ? `<img class="general-file-thumb" src="${url}" alt="">` : FileKinds.icon(FileKinds.describe(file.name));
  el.innerHTML = `
   ${art}
   <span class="general-file-text">
    <span class="general-file-name"></span>
    <span class="general-file-meta"></span>
   </span>
   <button type="button" class="general-file-remove">${CROSS}</button>`;
  el.querySelector('.general-file-name').textContent = file.name;
  el.querySelector('.general-file-name').title = file.path || file.name;
  el.querySelector('.general-file-meta').textContent = this.meta(file);
  el.querySelector('.general-file-remove').setAttribute('aria-label', I18n.t('settings.files.remove', { name: file.name }));
  return el;
 }

 // New files slide open into the list and removed ones fold away; the rest stay put.
 // Whether macOS already lets OpenGhost into every folder; asked anew whenever the window comes back, since the user
 // changes it in the system's own settings.
 async paintAccess() {
  const state = await window.openghost?.access?.state().catch(() => null);
  this.access.hidden = !state;
  if (!state) return;
  this.access.classList.toggle('is-given', state.full);
  this.access.querySelector('.general-access-state').textContent = I18n.t(state.full ? 'settings.access.on' : 'settings.access.off');
 }

 render(animate = true) {
  const files = this.context.files, keep = new Set(files.map(file => file.id));
  const motion = animate && !reducedMotion();
  for (const [id, el] of this.rows) {
   if (keep.has(id)) continue;
   this.rows.delete(id);
   if (!motion) { el.remove(); continue; }
   el.style.pointerEvents = 'none';
   el.animate([{ height: `${el.offsetHeight}px`, opacity: 1, filter: 'blur(0)' }, { ...FOLDED, opacity: 0, filter: 'blur(4px)', marginTop: '-6px' }], { ...ROW, duration: 320, fill: 'forwards' })
    .finished.then(() => el.remove(), () => el.remove());
  }
  let before = null;
  for (const file of [...files].reverse()) {
   let el = this.rows.get(file.id);
   if (!el) {
    el = this.row(file);
    this.rows.set(file.id, el);
    this.list.insertBefore(el, before);
    if (motion) el.animate([{ ...FOLDED, opacity: 0, transform: 'translateY(-6px)', filter: 'blur(4px)' }, { height: `${el.offsetHeight}px`, opacity: 1, transform: 'none', filter: 'blur(0)' }], ROW);
   } else if (el.nextElementSibling !== before) {
    this.list.insertBefore(el, before);
   }
   before = el;
  }
 }
}

window.GeneralSettings = GeneralSettings;
})();
