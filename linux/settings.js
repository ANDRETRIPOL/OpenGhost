(() => {
'use strict';

const STORAGE = { key: 'deepseek.apiKey', effort: 'deepseek.effort', mode: 'openghost.mode' };
const MODEL = 'deepseek-flash';
const EFFORTS = ['none', 'low', 'high', 'max'];
const DEFAULT_EFFORT = 'high';
const MODES = ['ask', 'auto', 'full'];
const DEFAULT_MODE = 'ask';
const CHECK_DELAY = 400;

class Settings {
 constructor(dialog) {
  this.dialog = dialog;
  this.keyInput = dialog.querySelector('.settings-key');
  this.status = dialog.querySelector('.settings-status');
  this.key = localStorage.getItem(STORAGE.key) || '';
  const effort = localStorage.getItem(STORAGE.effort);
  this.effort = EFFORTS.includes(effort) ? effort : DEFAULT_EFFORT;
  const mode = localStorage.getItem(STORAGE.mode);
  this.mode = MODES.includes(mode) ? mode : DEFAULT_MODE;
  this.check = null;
  this.checked = false;
  this.timer = 0;
  this.keyInput.value = this.key;
  this.keyInput.addEventListener('input', () => this.onKeyInput());
  dialog.addEventListener('dismiss', () => dialog.close());
 }

 get config() {
  return { key: this.key, model: MODEL, effort: this.effort };
 }

 setEffort(value) {
  this.effort = value;
  localStorage.setItem(STORAGE.effort, value);
 }

 setMode(value) {
  if (!MODES.includes(value)) return;
  this.mode = value;
  localStorage.setItem(STORAGE.mode, value);
 }

 open(reason = '') {
  if (!this.dialog.open) {
   this.dialog.showModal();
   this.dialog.focus();
  }
  if (reason) {
   this.setStatus(reason, 'error');
   this.keyInput.focus();
  } else if (this.key && !this.checked && !this.check) {
   this.checkKey();
  }
 }

 onKeyInput() {
  this.key = this.keyInput.value.trim();
  if (this.key) localStorage.setItem(STORAGE.key, this.key);
  else localStorage.removeItem(STORAGE.key);
  clearTimeout(this.timer);
  if (this.check) this.check.abort();
  this.check = null;
  this.checked = false;
  if (!this.key) { this.setStatus(''); return; }
  this.setStatus(I18n.t('settings.key.checking'));
  this.timer = setTimeout(() => this.checkKey(), CHECK_DELAY);
 }

 async checkKey() {
  if (this.check) this.check.abort();
  const check = this.check = new AbortController();
  this.setStatus(I18n.t('settings.key.checking'));
  try {
   await DeepSeek.listModels(this.key, check.signal);
   if (check !== this.check) return;
   this.setStatus(I18n.t('settings.key.ok'), 'ok');
  } catch (error) {
   if (check !== this.check) return;
   this.setStatus(error.message, 'error');
  }
  this.check = null;
  this.checked = true;
 }

 setStatus(text, tone = '') {
  this.status.textContent = text;
  this.status.dataset.tone = tone;
 }
}

window.Settings = Settings;
})();
