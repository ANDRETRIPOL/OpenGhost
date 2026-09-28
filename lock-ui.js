(() => {
'use strict';

const EASE = {
 motion: 'cubic-bezier(0.32, 0.72, 0, 1)',
 out: 'cubic-bezier(0.22, 1, 0.36, 1)',
 spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};
const CONFIRM_TIME = 3000;
// The card stands just right of the chat it belongs to, and keeps clear of the window's edges.
const GAP = 14;
const EDGE = 12;
// Once set, the padlock is seen snapping shut before the card goes.
const SHUT_TIME = 460;
const ARROW = '<svg class="glyph" viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M42 60h35M63 46l14 14-14 14"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const words = text => text.split(/(\s+)/).map(part => part.trim() ? `<span class="lock-word">${escapeHtml(part)}</span>` : part).join('');
const t = key => escapeHtml(I18n.t(key));

// Words come up out of a blur one after another, the way the model picker asks its question.
function rise(nodes, delay = 0) {
 if (reducedMotion()) return;
 nodes.forEach((node, k) => node.animate(
  [{ opacity: 0, transform: 'translateY(0.35em)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
  { duration: 520, delay: delay + k * 45, easing: EASE.out, fill: 'backwards' },
 ));
}

// A wrong password shakes its field like a head saying no, and the padlock rattles along.
function refuse(field, glyph) {
 if (reducedMotion()) return;
 field.animate([
  { transform: 'translateX(0)' }, { transform: 'translateX(-9px)' }, { transform: 'translateX(8px)' },
  { transform: 'translateX(-5px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' },
 ], { duration: 460, easing: 'ease-out' });
 glyph?.animate([
  { transform: 'rotate(0)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(0)' },
 ], { duration: 460, easing: 'ease-out' });
}

// Over a locked chat: a padlock, a line of big type and a single field for the password.
class LockScreen {
 constructor({ main, chat, composer, onOpen }) {
  Object.assign(this, { main, chat, composer, onOpen });
  this.conv = null;
  this.last = null;
  this.checking = false;
  const root = this.root = document.createElement('div');
  root.className = 'lock-screen';
  root.hidden = true;
  root.innerHTML = `
   <div class="lock-screen-body">
    <div class="lock-screen-glyph">${Glyphs.padlock}</div>
    <h2 class="lock-screen-title">${words(I18n.t('lock.screen.title'))}</h2>
    <p class="lock-screen-text">${t('lock.screen.text')}</p>
    <form class="lock-screen-form" autocomplete="off">
     <input class="lock-screen-input" type="password" spellcheck="false" placeholder="${t('lock.password')}" aria-label="${t('lock.password')}">
     <button class="lock-screen-go" type="submit" aria-label="${t('lock.open')}" disabled>${ARROW}</button>
    </form>
    <p class="lock-screen-error" role="status"></p>
   </div>`;
  main.append(root);
  this.body = root.querySelector('.lock-screen-body');
  this.glyph = root.querySelector('.lock-screen-glyph');
  this.form = root.querySelector('.lock-screen-form');
  this.input = root.querySelector('.lock-screen-input');
  this.go = root.querySelector('.lock-screen-go');
  this.error = root.querySelector('.lock-screen-error');
  this.input.addEventListener('input', () => {
   this.go.disabled = !this.input.value;
   this.error.classList.remove('is-shown');
  });
  this.form.addEventListener('submit', event => {
   event.preventDefault();
   this.submit();
  });
 }

 sync() {
  const conv = this.chat.active, locked = !!conv?.locked, before = this.last;
  this.last = conv;
  if (locked) {
   // The chat that was open a moment ago has just been locked: its screen closes over it with the padlock snapping shut.
   if (this.conv !== conv) this.show(conv, conv === before && !this.conv);
   return;
  }
  if (this.conv) this.hide(this.conv === conv);
 }

 show(conv, shutting) {
  const root = this.root;
  this.conv = conv;
  this.input.value = '';
  this.go.disabled = true;
  this.error.classList.remove('is-shown');
  root.classList.remove('is-checking', 'is-open');
  for (const animation of root.getAnimations({ subtree: true })) animation.cancel();
  root.hidden = false;
  this.main.classList.add('is-locked');
  this.composer.inert = true;
  // The shackle is drawn open once, so that it has somewhere to snap shut from.
  if (shutting && !reducedMotion()) {
   root.classList.add('is-open');
   getComputedStyle(this.glyph.querySelector('.lock-shackle')).transform;
  }
  requestAnimationFrame(() => {
   root.classList.remove('is-open');
   if (this.conv === conv) this.input.focus({ preventScroll: true });
  });
  if (reducedMotion()) return;
  // Locking the chat on screen, the feed blurs away under the screen as it comes up; opening a locked chat, it just appears.
  root.animate(shutting
   ? [{ backgroundColor: 'rgba(25, 25, 25, 0)', backdropFilter: 'blur(0px)' }, { backgroundColor: 'rgba(25, 25, 25, 1)', backdropFilter: 'blur(14px)' }]
   : [{ opacity: 0 }, { opacity: 1 }], { duration: shutting ? 460 : 200, easing: EASE.motion });
  this.glyph.animate([{ opacity: 0, transform: 'scale(0.7)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 560, easing: EASE.spring });
  rise([...root.querySelectorAll('.lock-word'), root.querySelector('.lock-screen-text'), this.form], shutting ? 140 : 60);
 }

 // With the right password the shackle swings open and the screen dissolves over the chat underneath.
 hide(opened) {
  const root = this.root;
  this.conv = null;
  this.input.value = '';
  this.main.classList.remove('is-locked');
  this.composer.inert = false;
  if (!opened || reducedMotion()) {
   root.hidden = true;
   return;
  }
  root.classList.add('is-open');
  this.body.animate([{ filter: 'blur(0)', transform: 'none' }, { filter: 'blur(8px)', transform: 'scale(1.04)' }], { duration: 460, delay: 240, easing: EASE.motion, fill: 'both' });
  const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 460, delay: 240, easing: EASE.motion, fill: 'both' });
  fade.finished.then(() => {
   if (this.conv) return;
   root.hidden = true;
   root.classList.remove('is-open');
   for (const animation of root.getAnimations({ subtree: true })) animation.cancel();
  }, () => {});
  this.onOpen?.();
 }

 async submit() {
  const conv = this.conv, password = this.input.value;
  if (!conv || !password || this.checking) return;
  this.checking = true;
  this.root.classList.add('is-checking');
  this.error.classList.remove('is-shown');
  let opened = false, broken = false;
  try {
   opened = await this.chat.unlock(conv.id, password);
  } catch {
   broken = true;
  }
  this.checking = false;
  this.root.classList.remove('is-checking');
  if (opened || this.conv !== conv) return;
  this.error.textContent = I18n.t(broken ? 'lock.broken' : 'lock.wrong');
  this.error.classList.add('is-shown');
  refuse(this.form, this.glyph);
  this.input.select();
 }
}

// A card beside a chat in the list: it puts a password on the chat, or locks the open one and takes its password off.
class LockCard {
 constructor({ chat, library, scroller }) {
  Object.assign(this, { chat, library });
  this.id = '';
  this.row = null;
  this.mode = '';
  this.busy = false;
  this.timer = 0;
  const root = this.root = document.createElement('div');
  root.className = 'lock-card';
  root.setAttribute('popover', 'manual');
  root.setAttribute('role', 'dialog');
  document.body.append(root);
  root.addEventListener('submit', event => {
   event.preventDefault();
   this.submit();
  });
  root.addEventListener('click', event => this.onClick(event));
  root.addEventListener('input', () => this.validate());
  root.addEventListener('keydown', event => this.onKey(event));
  // A press anywhere else puts the card away; the lock button itself toggles it.
  document.addEventListener('pointerdown', event => {
   if (this.id && !root.contains(event.target) && !event.target.closest?.('[data-action="lock"]')) this.close();
  }, true);
  window.addEventListener('resize', () => this.close(true));
  scroller?.addEventListener('scroll', () => this.close(), { passive: true });
 }

 open(id, row) {
  if (this.id === id) { this.close(); return; }
  const record = this.library.chat(id);
  if (!record || this.chat.isBusy(id)) return;
  this.close(true);
  // A locked chat has nothing to set here: it opens onto its lock screen, where the password goes.
  if (this.chat.isLocked(id)) { this.chat.open(id); return; }
  this.id = id;
  this.row = row;
  this.mode = record.lock ? 'guard' : 'set';
  for (const animation of this.root.getAnimations()) animation.cancel();
  this.render();
  if (!this.root.matches(':popover-open')) this.root.showPopover();
  this.place();
  const first = this.root.querySelector('.lock-card-field') || this.root.querySelector('[data-act="lock"]');
  first?.focus({ preventScroll: true });
  if (reducedMotion()) return;
  this.root.animate([{ opacity: 0, transform: 'translateX(-10px) scale(0.94)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 440, easing: EASE.spring });
  rise([...this.root.querySelectorAll('.lock-card-title, .lock-card-text, .lock-card-field, .lock-card-note, .lock-card-actions')], 40);
 }

 render() {
  const set = this.mode === 'set';
  this.root.setAttribute('aria-labelledby', 'lock-card-title');
  this.root.innerHTML = set ? `
   <form class="lock-card-body" autocomplete="off">
    <div class="lock-card-head"><span class="lock-card-glyph is-open">${Glyphs.padlock}</span><span class="lock-card-title" id="lock-card-title">${t('lock.set.title')}</span></div>
    <p class="lock-card-text">${t('lock.set.text')}</p>
    <input class="lock-card-field" name="first" type="password" spellcheck="false" autocomplete="new-password" placeholder="${t('lock.password')}" aria-label="${t('lock.password')}">
    <input class="lock-card-field" name="second" type="password" spellcheck="false" autocomplete="new-password" placeholder="${t('lock.repeat')}" aria-label="${t('lock.repeat')}">
    <p class="lock-card-note">${t('lock.set.note')}</p>
    <p class="lock-card-error" role="status"></p>
    <div class="lock-card-actions">
     <button type="button" class="settings-button" data-act="cancel">${t('lock.cancel')}</button>
     <button type="submit" class="settings-button is-primary" data-act="ok" disabled>${t('lock.set.ok')}</button>
    </div>
   </form>` : `
   <div class="lock-card-body">
    <div class="lock-card-head"><span class="lock-card-glyph is-open">${Glyphs.padlock}</span><span class="lock-card-title" id="lock-card-title">${t('lock.guard.title')}</span></div>
    <p class="lock-card-text">${t('lock.guard.text')}</p>
    <div class="lock-card-actions">
     <button type="button" class="settings-button" data-act="remove">${t('lock.remove')}</button>
     <button type="button" class="settings-button is-primary" data-act="lock">${t('lock.now')}</button>
    </div>
   </div>`;
 }

 // Level with the chat's row, growing out of it.
 place() {
  const rect = this.row.getBoundingClientRect(), width = this.root.offsetWidth, height = this.root.offsetHeight;
  const left = Math.min(rect.right + GAP, innerWidth - width - EDGE);
  const top = Math.min(Math.max(EDGE, rect.top - 14), innerHeight - height - EDGE);
  Object.assign(this.root.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, transformOrigin: `0 ${Math.round(rect.top + rect.height / 2 - top)}px` });
 }

 fields() {
  return [...this.root.querySelectorAll('.lock-card-field')];
 }

 validate() {
  const ok = this.root.querySelector('[data-act="ok"]');
  if (!ok || this.busy) return;
  const [first, second] = this.fields();
  ok.disabled = !first.value || !second.value;
  this.say('');
 }

 say(key) {
  const error = this.root.querySelector('.lock-card-error');
  if (!error) return;
  error.textContent = key ? I18n.t(key) : '';
  error.classList.toggle('is-shown', !!key);
 }

 async submit() {
  if (this.mode !== 'set' || this.busy) return;
  const [first, second] = this.fields(), ok = this.root.querySelector('[data-act="ok"]');
  if (!first.value) { first.focus(); return; }
  if (first.value !== second.value) {
   this.say('lock.mismatch');
   refuse(second);
   second.select();
   return;
  }
  const id = this.id;
  this.busy = true;
  this.root.classList.add('is-busy');
  ok.disabled = true;
  ok.textContent = I18n.t('lock.set.busy');
  const done = await this.chat.protect(id, first.value).catch(() => false);
  first.value = second.value = '';
  this.busy = false;
  this.root.classList.remove('is-busy');
  if (this.id !== id) return;
  if (!done) {
   ok.textContent = I18n.t('lock.set.ok');
   this.say('lock.failed');
   return;
  }
  this.root.querySelector('.lock-card-glyph').classList.remove('is-open');
  setTimeout(() => { if (this.id === id) this.close(); }, reducedMotion() ? 0 : SHUT_TIME);
 }

 onClick(event) {
  const button = event.target.closest('[data-act]');
  if (!button || this.busy) return;
  const act = button.dataset.act;
  if (act === 'cancel') this.close();
  else if (act === 'lock') {
   this.chat.lock(this.id);
   this.close();
  } else if (act === 'remove') this.remove(button);
 }

 // Taking the password off asks twice, the way deleting a chat does.
 async remove(button) {
  if (!button.classList.contains('is-confirming')) {
   button.classList.add('is-confirming');
   button.textContent = I18n.t('lock.remove.confirm');
   clearTimeout(this.timer);
   this.timer = setTimeout(() => {
    button.classList.remove('is-confirming');
    button.textContent = I18n.t('lock.remove');
   }, CONFIRM_TIME);
   return;
  }
  clearTimeout(this.timer);
  this.busy = true;
  await this.chat.unprotect(this.id).catch(() => false);
  this.busy = false;
  this.close();
 }

 onKey(event) {
  if (event.key === 'Escape') {
   event.preventDefault();
   const row = this.row;
   this.close();
   row?.focus({ preventScroll: true });
  } else if (event.key === 'Enter' && event.target.name === 'first') {
   event.preventDefault();
   this.root.querySelector('[name="second"]').focus();
  }
 }

 close(instant = false) {
  if (!this.id) return;
  this.id = '';
  clearTimeout(this.timer);
  for (const field of this.fields()) field.value = '';
  const root = this.root;
  if (instant || reducedMotion()) {
   root.hidePopover();
   return;
  }
  root.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateX(-6px) scale(0.97)', filter: 'blur(4px)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
   .finished.then(animation => {
    if (!this.id) root.hidePopover();
    animation.cancel();
   }, () => {});
 }
}

window.LockScreen = LockScreen;
window.LockCard = LockCard;
})();
