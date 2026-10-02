(() => {
'use strict';

const RESIZE = { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const CHAR_IN = 220;
const CHAR_STAGGER = 16;
const GHOST_OUT = 240;
const GHOST_STAGGER = 12;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => text.replace(/[&<>]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;');

function pieces(text) {
 const out = [];
 for (let i = 0; i < text.length; i++) {
  const extra = text.charCodeAt(i) >= 0xd800 && text.charCodeAt(i) < 0xdc00 ? 1 : 0;
  out.push(text.slice(i, i + 1 + extra));
  i += extra;
 }
 return out;
}

function edit(oldText, next) {
 const min = Math.min(oldText.length, next.length);
 let at = 0;
 while (at < min && oldText.charCodeAt(at) === next.charCodeAt(at)) at++;
 let tail = 0;
 while (tail < min - at && oldText.charCodeAt(oldText.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)) tail++;
 return { at, removed: oldText.length - at - tail, inserted: next.length - at - tail };
}

// Over a new chat: where it will go. A folder picked for it, or the chats, where it goes without one; pressed, it picks a folder.
class FolderPill {
 constructor({ button, library, chat }) {
  this.button = button;
  this.library = library;
  this.chat = chat;
  this.shown = null;
  this.picking = null;
  this.token = 0;
  button.innerHTML = `<span class="composer-folder-icons">${Glyphs.bubble}${Glyphs.folderAdd}${Glyphs.folder}</span><span class="composer-folder-label"><span class="composer-folder-text"></span><span class="composer-folder-ghosts"></span></span>`;
  this.label = button.querySelector('.composer-folder-text');
  this.ghosts = button.querySelector('.composer-folder-ghosts');
  button.addEventListener('click', () => this.pick());
  this.sync();
 }

 sync() {
  const folder = this.chat.folder, shown = folder ? folder.path : '', name = folder ? folder.name : I18n.t('chats.home');
  if (shown === this.shown && this.label.textContent === name) return;
  const token = ++this.token;
  for (const animation of [...this.button.getAnimations(), ...this.label.getAnimations()]) animation.cancel();
  this.button.style.width = '';
  const first = this.shown === null, from = this.button.offsetWidth;
  const chrome = from - this.label.offsetWidth;
  const previous = this.label.textContent;
  this.shown = shown;
  this.button.classList.toggle('is-picked', !!folder);
  this.button.title = folder ? folder.path : I18n.t('folder.choose');
  this.button.setAttribute('aria-label', folder ? I18n.t('folder.change', { name: folder.name }) : I18n.t('folder.choose'));
  if (first || reducedMotion() || !previous) {
   this.label.textContent = name;
   return;
  }
  const change = edit(previous, name);
  this.ghosts.replaceChildren();
  this.depart(previous, change);
  this.button.style.width = `${from}px`;
  this.label.innerHTML = this.arrive(name, change);
  const to = chrome + this.label.scrollWidth;
  const letters = Math.max(change.removed, change.inserted, 1);
  const duration = Math.max(RESIZE.duration, CHAR_IN + Math.max(0, change.inserted - 1) * CHAR_STAGGER, GHOST_OUT + Math.max(0, change.removed - 1) * GHOST_STAGGER);
  if (from && to && from !== to) {
   const grow = this.button.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration, easing: RESIZE.easing, fill: 'forwards' });
   grow.finished.then(() => {
    if (token !== this.token) return;
    this.button.style.width = '';
    grow.cancel();
   }).catch(() => {});
  } else this.button.style.width = '';
  void letters;
 }

 depart(previous, change) {
  if (!change.removed) return;
  const chars = pieces(previous);
  this.label.innerHTML = chars.map(char => `<span>${escapeHtml(char)}</span>`).join('');
  const box = this.label.getBoundingClientRect();
  let index = 0;
  const gone = [];
  for (const span of this.label.children) {
   const start = index;
   index += span.textContent.length;
   if (start >= change.at && start < change.at + change.removed) gone.push(span);
  }
  const n = gone.length;
  const stagger = n > 1 ? Math.min(GHOST_STAGGER, 300 / n) : 0;
  gone.forEach((span, k) => {
   const rect = span.getBoundingClientRect();
   const ghost = document.createElement('span');
   ghost.className = 'composer-folder-ghost';
   ghost.textContent = span.textContent;
   ghost.style.left = `${rect.left - box.left}px`;
   ghost.style.top = `${rect.top - box.top}px`;
   ghost.style.animationDelay = `${Math.round((n - 1 - k) * stagger)}ms`;
   ghost.addEventListener('animationend', () => ghost.remove());
   this.ghosts.append(ghost);
  });
 }

 arrive(name, change) {
  const head = escapeHtml(name.slice(0, change.at));
  const fresh = pieces(name.slice(change.at, change.at + change.inserted)).map((char, k) =>
   `<span class="composer-folder-char" style="animation-delay:${k * CHAR_STAGGER}ms">${escapeHtml(char)}</span>`).join('');
  const tail = escapeHtml(name.slice(change.at + change.inserted));
  return head + fresh + tail;
 }

 pick() {
  this.picking ||= this.library.pick().then(folder => {
   if (folder) this.chat.setFolder(folder);
   return folder;
  }).finally(() => { this.picking = null; });
  return this.picking;
 }
}

window.FolderPill = FolderPill;
})();
