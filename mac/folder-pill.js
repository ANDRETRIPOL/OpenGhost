(() => {
'use strict';

const RESIZE = { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const LABEL = { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const NUDGE = { duration: 420, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class FolderPill {
 constructor({ button, library, chat }) {
  this.button = button;
  this.library = library;
  this.chat = chat;
  this.shown = null;
  this.picking = null;
  button.innerHTML = `<span class="composer-folder-icons">${Glyphs.folderAdd}${Glyphs.folder}</span><span class="composer-folder-label"></span>`;
  this.label = button.querySelector('.composer-folder-label');
  button.addEventListener('click', () => this.pick());
  this.sync();
 }

 sync() {
  const folder = this.chat.folder, shown = folder ? folder.path : '', name = folder ? folder.name : I18n.t('folder.new');
  if (shown === this.shown && this.label.textContent === name) return;
  for (const animation of [...this.button.getAnimations(), ...this.label.getAnimations()]) animation.cancel();
  const first = this.shown === null, from = this.button.offsetWidth;
  this.shown = shown;
  this.button.classList.toggle('is-picked', !!folder);
  this.label.textContent = name;
  this.button.title = folder ? folder.path : I18n.t('folder.choose');
  this.button.setAttribute('aria-label', folder ? I18n.t('folder.change', { name: folder.name }) : I18n.t('folder.choose'));
  if (first || reducedMotion()) return;
  const to = this.button.offsetWidth;
  if (from && to && from !== to) this.button.animate([{ width: `${from}px` }, { width: `${to}px` }], RESIZE);
  this.label.animate([{ opacity: 0, filter: 'blur(4px)', transform: 'translateY(3px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], LABEL);
 }

 pick() {
  this.picking ||= this.library.pick().then(folder => {
   if (folder) this.chat.setFolder(folder);
   return folder;
  }).finally(() => { this.picking = null; });
  return this.picking;
 }

 nudge() {
  if (reducedMotion()) return;
  this.button.animate([{ translate: '0' }, { translate: '-5px' }, { translate: '4px' }, { translate: '-2px' }, { translate: '0' }], NUDGE);
 }
}

window.FolderPill = FolderPill;
})();
