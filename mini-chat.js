(() => {
'use strict';

const NOTE = [
 '# Mini chat',
 'This is a side mini chat the user opened over the main conversation. Everything before it is the main conversation, given to you as context.',
 'The user asks a quick side question here: answer briefly and to the point. Nothing from this mini chat is saved or shown in the main chat.',
].join('\n');
const CLOSE_TIME = 360;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mini chat conversations live only in memory and are thrown away when the window closes.
function memoryLibrary() {
 const chats = [];
 return {
  folders: [],
  chats,
  chat: id => chats.find(chat => chat.id === id) || null,
  create({ folder }) {
   const now = Date.now(), chat = { id: `mini-${now.toString(36)}`, title: '', folder: folder?.path || '', created: now, updated: now, pinned: false, named: true };
   chats.push(chat);
   return chat;
  },
  update(id, changes) {
   const chat = chats.find(item => item.id === id);
   if (chat) Object.assign(chat, changes);
   return chat || null;
  },
  saveMessages: () => Promise.resolve(),
  conversation: () => Promise.resolve({ messages: [], tokens: 0 }),
  remove() {},
  removeFolder: () => [],
  flush() {},
 };
}

const TEMPLATE = `
 <header class="mini-head">
  <span class="mini-title">${'{ghost}'}<span data-i18n="mini.title"></span></span>
  <span class="mini-hint" data-i18n="mini.hint"></span>
  <close-button class="mini-close"></close-button>
 </header>
 <div class="mini-main is-empty">
  <div class="thread-view">
   <div class="thread"><div class="thread-list"></div></div>
   <div class="scrollbar thread-scrollbar" aria-hidden="true"><div class="scrollbar-thumb"></div></div>
   <scroll-button class="thread-bottom glass-lens"></scroll-button>
  </div>
  <div class="mini-empty" aria-hidden="true"><ghost-thinking></ghost-thinking><p data-i18n="mini.empty"></p></div>
  <div class="drop-zone" aria-hidden="true">
   <div class="drop-art"></div>
   <div class="drop-title" data-i18n="drop.title"></div>
   <div class="drop-hint" data-i18n="drop.hint"></div>
  </div>
  <div class="composer">
   <div class="composer-attachments"><div class="attachments-row"></div></div>
   <input class="composer-picker" type="file" multiple hidden>
   <div class="composer-field">
    <div class="composer-placeholder" aria-hidden="true" data-i18n="mini.placeholder"></div>
    <div class="composer-mirror" aria-hidden="true"><div class="composer-mirror-lines"></div></div>
    <div class="composer-ghosts" aria-hidden="true"></div>
    <textarea class="composer-input" data-i18n-attr="aria-label:composer.label"></textarea>
    <div class="scrollbar composer-scrollbar" aria-hidden="true"><div class="scrollbar-thumb"></div></div>
   </div>
   <div class="composer-toolbar">
    <div class="composer-tools">
     <add-button class="composer-add" data-i18n-attr="label:attach.add"></add-button>
     <button type="button" class="composer-mode" popovertarget="mini-mode-menu" aria-haspopup="menu" aria-expanded="false" hidden></button>
    </div>
    <div class="composer-actions"><send-button class="composer-send" disabled></send-button></div>
   </div>
  </div>
 </div>
 <div class="mode-menu" id="mini-mode-menu" popover="auto" role="menu" data-i18n-attr="aria-label:mode"></div>`;

class MiniChat {
 static open(options) {
  MiniChat.current?.close();
  MiniChat.current = new MiniChat(options);
  return MiniChat.current;
 }

 constructor({ settings, source, quote = '' }) {
  const dialog = this.dialog = document.createElement('dialog');
  dialog.className = 'mini';
  dialog.setAttribute('closedby', 'closerequest');
  dialog.innerHTML = TEMPLATE.replace('{ghost}', Glyphs.ghost);
  dialog.__mini = this;
  I18n.apply(dialog);
  dialog.setAttribute('aria-label', I18n.t('mini.title'));
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  this.main = $('.mini-main');
  this.composer = $('.composer');
  this.field = $('.composer-field');
  this.input = $('.composer-input');
  this.send = $('.composer-send');
  const thread = $('.thread'), bottom = $('.thread-bottom');
  bottom.style.setProperty('--glass-lens', getComputedStyle(document.querySelector('.thread-bottom')).getPropertyValue('--glass-lens'));
  new SmoothHeight(this.field, this.input);
  new Scrollbar(this.input, $('.composer-scrollbar'));
  const scrollbar = new Scrollbar(thread, $('.thread-scrollbar'));
  this.text = new ComposerText(this.input, $('.composer-mirror'));
  this.unwatch = [LinkChip.watch($('.composer-mirror')), LinkChip.watch(thread)];
  this.space = new ResizeObserver(() => {
   const gap = parseFloat(getComputedStyle(this.main).getPropertyValue('--composer-bottom-gap')) || 0;
   this.main.style.setProperty('--composer-space', `${Math.ceil(this.composer.offsetHeight + gap)}px`);
  });
  this.space.observe(this.composer);
  const context = source.context();
  this.chat = new Chat({ main: this.main, thread, bottom, settings, library: memoryLibrary(), onChange: () => this.sync(), onList: list => scrollbar.observe(list), note: NOTE });
  this.chat.newChat(context.folder || { path: '', name: '' });
  this.chat.active.messages = context.messages;
  this.chat.active.tokens = context.tokens;
  this.attachments = new Attachments({
   tray: $('.composer-attachments'),
   picker: $('.composer-picker'),
   panel: document.querySelector('.note-panel'),
   main: this.main,
   zone: $('.drop-zone'),
   input: this.input,
   onChange: () => this.sync(),
   isActive: () => dialog.open,
  });
  $('.composer-add').addEventListener('add', () => this.attachments.pick());
  if (AgentTools.available) {
   const mode = $('.composer-mode');
   mode.hidden = false;
   this.mode = new ModePicker({ button: mode, menu: $('.mode-menu'), settings, onChange: () => this.chat.onModeChange() });
  }
  this.input.addEventListener('input', () => this.sync());
  this.input.addEventListener('keydown', event => this.onKey(event));
  this.send.addEventListener('composer-send', () => this.submit());
  this.composer.addEventListener('mousedown', event => {
   if (event.target === this.composer || event.target.classList.contains('composer-toolbar')) {
    event.preventDefault();
    this.input.focus();
   }
  });
  dialog.addEventListener('dismiss', () => this.close());
  dialog.addEventListener('cancel', event => {
   event.preventDefault();
   if (this.chat.busy) this.chat.stop();
   else this.close();
  });
  dialog.addEventListener('close', () => this.destroy());
  this.room = document.querySelector('.main');
  this.place = () => {
   const r = this.room.getBoundingClientRect();
   for (const [name, value] of Object.entries({ top: r.top, right: innerWidth - r.right, bottom: innerHeight - r.bottom, left: r.left, width: r.width, height: r.height })) {
    dialog.style.setProperty(`--room-${name}`, `${Math.round(value)}px`);
   }
  };
  this.place();
  this.follow = new ResizeObserver(this.place);
  this.follow.observe(this.room);
  window.addEventListener('resize', this.place);
  // Everything outside a modal dialog is inert, so the shared note panel lives inside it while it is open.
  this.panel = document.querySelector('.note-panel');
  dialog.append(this.panel);
  dialog.showModal();
  if (quote) this.quote(quote);
  else this.input.focus();
  this.sync();
 }

 quote(text) {
  this.text.insertQuote(text);
  this.sync();
 }

 sync() {
  this.send.toggleAttribute('disabled', !this.text.text().trim() && !this.attachments?.count);
  this.field.classList.toggle('has-value', this.input.value !== '');
 }

 submit() {
  const text = this.text.text().trim();
  if (!text && !this.attachments.count) return;
  if (!this.chat.send(text, this.attachments.items)) return;
  this.attachments.take();
  this.input.value = '';
  this.text.refresh();
  this.sync();
 }

 onKey(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  this.submit();
 }

 close() {
  if (!this.dialog.open || this.closing) return;
  this.closing = true;
  this.chat.stop();
  if (reducedMotion()) { this.dialog.close(); return; }
  this.dialog.classList.add('is-closing');
  setTimeout(() => this.dialog.close(), CLOSE_TIME);
 }

 destroy() {
  if (this.destroyed) return;
  this.destroyed = true;
  this.chat.stop();
  this.text.destroy();
  this.attachments.destroy();
  this.mode?.destroy();
  this.space.disconnect();
  this.follow.disconnect();
  window.removeEventListener('resize', this.place);
  for (const stop of this.unwatch) stop();
  for (const popover of [this.panel, this.dialog.querySelector('.select-menu')]) {
   if (!popover) continue;
   if (popover.matches(':popover-open')) popover.hidePopover();
   document.body.append(popover);
  }
  if (MiniChat.current === this) MiniChat.current = null;
  this.dialog.remove();
 }
}

window.MiniChat = MiniChat;
})();
