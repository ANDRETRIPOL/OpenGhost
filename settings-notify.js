(() => {
'use strict';

// Settings → Notifications: what the app does when a reply is ready while the user is elsewhere (notify.js). A switch
// for it all, and under it a small live picture of what it does, as the Composer's predictions have one: a corner of
// the desktop, where a notification of a reply slides in and the app's icon in the taskbar counts one more reply
// waiting; it plays over and over while the page is open. Under it the sound: listened to with a button, switched on
// and off. Off, the picture rests and the sound's row with it.
const ROUND = 4200;
const MOST = 3;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GHOST = '<svg viewBox="-1 -1 60 62" aria-hidden="true"><path fill="currentColor" d="M0 29A29 29 0 0 1 58 29L58 57A2.5 2.5 0 0 1 53 57A6 6 0 0 0 41 57A3 3 0 0 1 35 57A6 6 0 0 0 23 57A3 3 0 0 1 17 57A6 6 0 0 0 5 57A2.5 2.5 0 0 1 0 57Z"/><ellipse class="notify-eye" cx="17" cy="29.5" rx="3.8" ry="4.1"/><ellipse class="notify-eye" cx="41" cy="29.5" rx="3.8" ry="4.1"/></svg>';
const SPEAKER = '<svg class="notify-speaker" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="notify-speaker-a" d="M15.5 9a4 4 0 0 1 0 6"/><path class="notify-speaker-b" d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const SWITCH = '<span class="memory-switch-knob"></span>';

class NotifySettings {
 constructor({ root }) {
  this.root = root;
  this.bridge = window.openghost?.notify;
  const t = key => escapeHtml(I18n.t(key));
  root.innerHTML = `
   <section class="general-block notify-block">
    <div class="general-head quick-head">
     <span class="settings-label" id="settings-notify-label">${t('settings.notifications')}</span>
     <button type="button" class="memory-switch notify-switch" role="switch" aria-labelledby="settings-notify-label">${SWITCH}</button>
    </div>
    <p class="settings-hint">${t('settings.notifications.hint')}</p>
    <div class="notify-stage" aria-hidden="true">
     <div class="notify-toast">
      <div class="notify-toast-from"><i>${GHOST}</i><span>OpenGhost · ${t('settings.notifications.demo.when')}</span></div>
      <b>${t('settings.notifications.demo.title')}</b>
      <span class="notify-toast-text">${t('settings.notifications.demo.text')}</span>
     </div>
     <div class="notify-taskbar"><span class="notify-app-slot"></span><span class="notify-app-slot"></span><span class="notify-app">${GHOST}<span class="notify-count">1</span></span><span class="notify-app-slot"></span></div>
    </div>
    <p class="settings-hint notify-count-hint">${t('settings.notifications.count')}</p>
    <div class="quick-row notify-sound">
     ${SPEAKER}
     <span class="quick-row-label" id="settings-notify-sound">${t('settings.notifications.sound')}</span>
     <button type="button" class="notify-listen">${SPEAKER}<span>${t('settings.notifications.listen')}</span></button>
     <button type="button" class="memory-switch notify-sound-switch" role="switch" aria-labelledby="settings-notify-sound">${SWITCH}</button>
    </div>
   </section>`;
  this.block = root.querySelector('.notify-block');
  this.stage = root.querySelector('.notify-stage');
  this.count = root.querySelector('.notify-count');
  this.toggle = root.querySelector('.notify-switch');
  this.sound = root.querySelector('.notify-sound-switch');
  this.listen = root.querySelector('.notify-listen');
  this.state = { on: true, sound: true };
  this.shown = 0;
  this.timer = 0;
  this.toggle.addEventListener('click', () => this.set({ on: !this.state.on }));
  this.sound.addEventListener('click', () => this.set({ sound: !this.state.sound }, true));
  this.listen.addEventListener('click', () => this.hear());
  this.paint(this.state);
  this.bridge?.get().then(state => { if (state) this.paint(state); }).catch(() => {});
  // The picture plays while the page is on screen, and rests while it is not.
  new IntersectionObserver(entries => this.play(entries.at(-1).isIntersecting)).observe(this.stage);
 }

 async set(changes, hear = false) {
  if (!this.bridge) return;
  const state = await this.bridge.set({ ...this.state, ...changes });
  if (!state) return;
  this.paint(state);
  if (hear && state.on && state.sound) this.hear();
 }

 hear() {
  if (!this.state.on || !this.state.sound) return;
  window.Notify?.play();
  this.listen.classList.remove('is-playing');
  void this.listen.offsetWidth;
  this.listen.classList.add('is-playing');
 }

 paint(state) {
  this.state = state;
  this.block.classList.toggle('is-off', !state.on);
  this.toggle.setAttribute('aria-checked', String(state.on));
  this.sound.setAttribute('aria-checked', String(state.on && state.sound));
  this.sound.disabled = !state.on;
  this.listen.disabled = !state.on || !state.sound;
  this.play(!!this.stage.offsetParent);
 }

 // One round: the notification slides in and the count goes up by one; after a few, it starts again from one.
 play(on) {
  clearTimeout(this.timer);
  this.timer = 0;
  if (!on || !this.state.on) {
   this.stage.classList.remove('is-coming');
   return;
  }
  if (reducedMotion()) {
   this.stage.classList.add('is-still');
   this.count.textContent = '2';
   return;
  }
  const round = () => {
   this.shown = this.shown % MOST + 1;
   this.count.textContent = String(this.shown);
   this.stage.classList.remove('is-coming');
   void this.stage.offsetWidth;
   this.stage.classList.add('is-coming');
   this.timer = setTimeout(round, ROUND);
  };
  round();
 }
}

window.NotifySettings = NotifySettings;
})();
