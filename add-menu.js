(() => {
'use strict';

// The composer's plus opens a dock that grows out of it: photos and files for the message and, for a chat with messages in it,
// compacting it now and its stats, which come into the chat as a card only the user sees.
const ITEMS = [
 { id: 'photos', icon: 'photo' },
 { id: 'files', icon: 'clip' },
 { id: 'compact', icon: 'compact', chat: true },
 // The chart's icon flies on into the card it asks for.
 { id: 'stats', icon: 'bars', chat: true, flies: true },
];

class AddMenu {
 constructor({ button, host = document.body, attachments, chat = null, input = null, anchor = '--add' }) {
  Object.assign(this, { button, attachments, chat, input });
  button.style.setProperty('anchor-name', anchor);
  button.setAttribute('aria-haspopup', 'menu');
  this.dock = new Dock({
   button,
   host,
   anchor,
   label: I18n.t('add.label'),
   source: () => button.shadowRoot?.querySelector('.icon') || button,
   items: ITEMS.filter(item => !item.chat || chat).map(item => ({ ...item, glyph: Glyphs[item.icon], name: I18n.t(`add.${item.id}`), group: item.chat ? 1 : 0 })),
   onOpen: () => this.sync(),
   // The plus gives way to the dock that grows out of it, and comes back as the dock folds into it.
   onToggle: open => {
    button.setAttribute('aria-expanded', String(open));
    if (open) button.classList.add('is-away');
   },
   onReturn: () => button.classList.remove('is-away'),
   onPick: (id, { from }) => this.choose(id, from),
  });
  button.addEventListener('add', event => this.dock.toggle(event.detail?.keyboard));
 }

 get open() {
  return this.dock.open;
 }

 // The chat's own items show once it has a message; while a reply is being written they wait, and say so.
 sync() {
  if (!this.chat) return;
  const chatted = this.chat.canStats || this.chat.busy && this.chat.activeId, busy = this.chat.busy;
  this.dock.set('compact', {
   hidden: !chatted,
   disabled: busy || !this.chat.canCompact,
   hint: busy ? I18n.t('add.wait') : this.chat.canCompact ? I18n.t('add.compact.hint', { n: Math.round(this.chat.fill * 100) }) : I18n.t('add.compact.done'),
  });
  this.dock.set('stats', { hidden: !chatted, disabled: busy, hint: I18n.t(busy ? 'add.wait' : 'add.stats.hint') });
 }

 choose(id, from) {
  if (id === 'photos' || id === 'files') { this.attachments.pick(id); return; }
  this.input?.focus({ preventScroll: true });
  if (id === 'compact') this.chat.compactNow();
  else if (id === 'stats') this.chat.postStats(from);
 }

 destroy() {
  this.dock.destroy();
 }
}

window.AddMenu = AddMenu;
})();
