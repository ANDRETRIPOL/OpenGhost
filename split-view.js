(() => {
'use strict';

const { GAP, MIN } = SplitSizing;
const motion = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

// Pane controls share the existing conversations, never a second copy of their messages or running agents.
class SplitPane {
 constructor(owner, template) {
  this.owner = owner;
  const main = this.main = template.cloneNode(true);
  main.className = 'main is-empty is-split-secondary';
  main.removeAttribute('style');
  main.querySelector('.thread').replaceChildren(Object.assign(document.createElement('div'), { className: 'thread-list' }));
  for (const el of main.querySelectorAll('.plan-island, .update-pill, .lock-screen, .thread-bones, .thread-wait')) el.remove();
  main.querySelector('.welcome').replaceChildren();
  main.querySelector('.composer-input').value = '';
  main.querySelector('.composer-input').removeAttribute('autofocus');
  main.querySelector('.composer-mirror-lines').replaceChildren();
  main.querySelector('.composer-ghosts').replaceChildren();
  main.querySelector('.composer-placeholder').textContent = I18n.t('composer.placeholder');
  main.querySelector('.composer-field').className = 'composer-field';
  main.querySelector('.composer-attachments .attachments-row').replaceChildren();
  const $ = s => main.querySelector(s);
  $('.sidebar-toggle').remove();
  this.miniTool = $('.top-tools'); this.miniTool.hidden = true;
  this.miniButton = $('.mini-toggle');
  this.miniButton.innerHTML = `${Glyphs.ghost}<span class="mini-toggle-dot"></span>`;
  this.miniButton.addEventListener('click', () => { if (this.chat.active?.record) MiniChat.open({ settings: this.settings, source: this.chat, library: owner.library }); });
  $('.browser-toggle').remove();
  const close = this.close = Object.assign(document.createElement('button'), { type: 'button', className: 'split-close', innerHTML: Glyphs.close });
  close.setAttribute('aria-label', I18n.t('split.close'));
  close.title = I18n.t('split.close');
  $('.browser-tools').append(close);
  close.addEventListener('click', () => owner.close());
  const name = this.name = Object.assign(document.createElement('div'), { className: 'split-pane-name' });
  main.append(name);
  owner.root.append(main);
  const base = owner.settings, settings = this.settings = Object.create(base);
  Object.assign(settings, { shown: '', model: base.model, effort: base.effort, efforts: base.efforts.slice(), onEfforts: null, onModels: null });
  // Permissions keep the app's existing shared mode; the pane only owns its model/effort controls.
  Object.defineProperty(settings, 'mode', { get: () => base.mode, set: value => { base.mode = value; } });
  settings.setMode = value => base.setMode(value);
  settings.open = (...args) => base.open(...args);
  settings.freshen = () => base.freshen();
  const previousModels = base.onModels;
  base.onModels = () => { previousModels?.(); settings.shown = ''; this.sync(); this.models?.sync(); };
  this.input = $('.composer-input');
  this.field = $('.composer-field');
  this.composer = $('.composer');
  this.sendButton = $('.composer-send');
  this.text = new ComposerText(this.input, $('.composer-mirror'));
  new SkillPicker({ input: this.input, text: this.text, anchor: this.composer, onPick: () => this.sync() });
  new SmoothHeight(this.field, this.input);
  ComposerSpace.watch(main, this.composer);
  this.bones = new ThreadBones({ app: owner.app, main, thread: $('.thread') });
  ThreadWindow.watch($('.thread'));
  const bar = new Scrollbar($('.thread'), $('.thread-scrollbar'));
  this.inputBar = new Scrollbar(this.input, $('.composer-scrollbar'));
  LinkChip.watch($('.composer-mirror')); LinkChip.watch($('.thread'));
  this.chat = new Chat({ main, thread: $('.thread'), bottom: $('.thread-bottom'), settings, library: owner.library,
   onChange: () => owner.changed(), onList: list => bar.observe(list), onLeave: conv => this.putAway(conv),
   onRecall: data => { this.attachments.give(data.attachments); this.text.restore(data.rest, data.quotes); this.sync(); },
   onNotes: (conv, change) => owner.notes(conv, change), onPlan: () => owner.changed(), onPredict: () => owner.changed(),
  });
  owner.join(this.chat);
  this.chat.onForked = (...args) => owner.chat.onForked?.(...args);
  this.plan = new PlanIsland({ main, chat: this.chat });
  this.lock = new LockScreen({ main, chat: this.chat, composer: this.composer, onOpen: () => this.input.focus({ preventScroll: true }) });
  this.folder = new FolderPill({ button: $('.composer-folder'), library: owner.library, chat: this.chat });
  this.attachments = new Attachments({ tray: $('.composer-attachments'), picker: $('.composer-picker'), panel: document.querySelector('.note-panel'), main,
   zone: $('.drop-zone'), input: this.input, onChange: () => this.sync(), onText: (text, undo) => this.text.place(text, undo),
   isActive: event => owner.opened && !this.chat.active?.locked && !base.dialog.open && !!event && main.contains(event.target),
  });
  new AddMenu({ button: $('.composer-add'), host: main, anchor: '--split-add', attachments: this.attachments, chat: this.chat, input: this.input });
  if (AgentTools.available) {
   $('.composer-mode').hidden = false;
   new ModePicker({ button: $('.composer-mode'), host: main, anchor: '--split-mode', settings, onChange: () => this.chat.onModeChange() });
  }
  const clonePanel = selector => {
   const panel = document.querySelector(selector).cloneNode(true);
   panel.removeAttribute('style');
   for (const el of panel.querySelectorAll('[id]')) el.removeAttribute('id');
   main.append(panel); return panel;
  };
  this.models = new ModelStage({ button: $('.composer-model'), root: clonePanel('.model-stage'), chat: this.chat, settings, input: this.input });
  this.effort = new EffortSlider({ button: $('.composer-effort'), panel: clonePanel('.effort-panel'), settings });
  this.notepad = new Notepad({ chat: this.chat, thread: $('.thread'), button: $('.notes-toggle') });
  if (Routines.available) {
   this.routines = new RoutinePanel({ chat: this.chat, settings, button: $('.routines-pill') });
   $('.thread').addEventListener('click', event => {
    const pill = event.target.closest('.thread-note-pill')?.closest('.thread-note.is-routine');
    if (pill) this.routines.open(Routines.find(pill.dataset.routine) ? { show: pill.dataset.routine } : {});
   });
  }
  this.input.addEventListener('input', () => { this.sync(); clearTimeout(this.timer); this.timer = setTimeout(() => this.keep(), 300); });
  this.input.addEventListener('keydown', event => {
   if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
   if ((event.key === 'Tab' || event.key === 'ArrowRight') && !this.input.value && this.chat.prediction) {
    event.preventDefault(); this.text.place(this.chat.takePrediction()); this.sync();
   } else if (event.key === 'Enter') { event.preventDefault(); this.send(); }
  });
  this.sendButton.addEventListener('composer-send', () => this.send());
  this.composer.addEventListener('mousedown', event => {
   if (event.target === this.composer || event.target.classList.contains('composer-toolbar')) { event.preventDefault(); this.input.focus(); }
  });
  main.addEventListener('pointerdown', () => owner.focus(this.chat), true);
  main.addEventListener('focusin', () => owner.focus(this.chat));
  main.addEventListener('keydown', event => {
   if (event.key === 'Escape' && !event.defaultPrevented && this.chat.busy && !document.querySelector(':popover-open, dialog[open]')) {
    event.preventDefault(); this.chat.stop();
   }
  });
  window.addEventListener('pagehide', () => this.keep());
 }

 keep() {
  clearTimeout(this.timer);
  if (this.written?.id) this.owner.library.saveDraft(this.written.id, this.text.text());
 }

 putAway(conv) {
  if (this.written !== conv) return;
  this.keep();
  const text = this.text.text(), files = this.attachments.take(), sealed = conv.record && this.owner.library.isProtected(conv.id);
  conv.unsent = (!sealed && text.trim()) || files.length ? { text: sealed ? null : text, files } : null;
  this.written = null; this.input.value = ''; this.text.refresh(); this.inputBar.update();
 }

 sync() {
  if (!this.chat || !this.attachments) return;
  const chat = this.chat, now = chat.active && !chat.active.locked ? chat.active : null;
  this.lock.sync();
  this.main.classList.toggle('is-empty', !chat.active?.locked && !chat.active?.list.childElementCount);
  if (now !== this.written) {
   if (this.written) this.putAway(this.written);
   this.written = now;
   if (now) {
    const kept = now.unsent; now.unsent = null;
    if (kept) this.attachments.give(kept.files);
    const place = text => {
     if (this.written !== now || this.text.text().trim() || !text) return;
     const focused = document.activeElement, { rest, quotes } = Chat.splitQuotes(text);
     this.text.restore(rest, quotes);
     if (focused?.isConnected && focused !== document.body) focused.focus({ preventScroll: true });
     this.sync();
    };
    if (typeof kept?.text === 'string') place(kept.text);
    else if (now.id) this.owner.library.draft(now.id).then(place);
   }
  }
  const empty = !this.text.text().trim() && !this.attachments.count;
  this.sendButton.toggleAttribute('disabled', empty);
  const suggesting = chat.busy && !empty;
  this.sendButton.parentElement.classList.toggle('is-suggesting', suggesting);
  if (suggesting) this.sendButton.setAttribute('caption', I18n.t('composer.suggest'));
  else this.sendButton.removeAttribute('caption');
  if (!empty && chat.prediction) chat.forget(chat.active, true);
  const predicted = empty ? chat.prediction : '';
  if (predicted !== this.field.dataset.predicted) {
   this.field.dataset.predicted = predicted;
   this.field.classList.toggle('is-predicted', !!predicted);
   const placeholder = this.main.querySelector('.composer-placeholder');
   if (predicted) {
    placeholder.innerHTML = '<span class="composer-guess"></span><kbd class="composer-key">Tab</kbd>';
    placeholder.firstChild.textContent = predicted;
   } else placeholder.textContent = I18n.t('composer.placeholder');
   this.input.setAttribute('aria-placeholder', predicted || I18n.t('composer.placeholder'));
  }
  this.field.classList.toggle('has-value', this.input.value !== '');
  this.folder.sync(); this.settings.show(chat.model); this.models?.sync(); this.effort?.lock(chat.busy);
  this.notepad?.sync(); this.routines?.sync(); this.plan.sync(); chat.syncAsk(); chat.syncForks();
  this.name.textContent = now?.record ? this.owner.library.titleOf(now.record) : I18n.t('chat.new');
  this.main.setAttribute('aria-label', this.name.textContent);
  this.name.hidden = !this.plan.root.hidden;
  this.signalMini();
 }

 signalMini() {
  const state = this.chat?.active ? MiniChat.state(this.chat.active) : '';
  this.miniTool.hidden = this.miniButton.hidden = !state;
  this.main.classList.toggle('has-split-mini', !!state);
  if (!state) return;
  this.miniButton.dataset.state = state;
  this.miniButton.setAttribute('aria-label', I18n.t(`mini.${state}`));
  this.miniButton.title = I18n.t(`mini.${state}`);
 }

 send() {
  const text = this.text.text().trim();
  if ((!text && !this.attachments.count) || !this.chat.send(text, this.attachments.items)) return;
  this.attachments.take(); this.input.value = ''; this.text.refresh(); this.inputBar.update(); this.sync(); this.keep();
 }
}

class SplitView {
 constructor({ app, main, chat, settings, library, bones, changed, notes, sidePanels, template }) {
  Object.assign(this, { app, main, chat, settings, library, bones, changed, notes, sidePanels, template });
  this.views = new Set(); this.join(chat); this.currentChat = chat; this.ratio = 0.5; this.opened = false;
  this.root = Object.assign(document.createElement('section'), { className: 'chat-split', hidden: true });
  this.root.style.setProperty('--split-min', `${MIN}px`);
  this.root.setAttribute('aria-label', I18n.t('split.label'));
  this.divider = Object.assign(document.createElement('div'), { className: 'split-divider', tabIndex: 0 });
  this.divider.setAttribute('role', 'separator'); this.divider.setAttribute('aria-orientation', 'vertical');
  this.divider.setAttribute('aria-label', I18n.t('split.resize'));
  this.divider.setAttribute('aria-valuemin', '0'); this.divider.setAttribute('aria-valuemax', '100');
  this.root.append(this.divider); app.append(this.root);
  main.addEventListener('pointerdown', () => this.focus(chat), true);
  main.addEventListener('focusin', () => this.focus(chat));
  this.divider.addEventListener('pointerdown', event => this.start(event));
  this.divider.addEventListener('dblclick', () => { this.ratio = 0.5; this.layout(); });
  this.divider.addEventListener('keydown', event => {
   if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
   event.preventDefault();
   if (event.key === 'End') this.ratio = 1;
   else if (event.key === 'Home') this.ratio = 0;
   else this.ratio += event.key === 'ArrowLeft' ? -0.05 : 0.05;
   this.layout();
  });
  new ResizeObserver(() => {
   if (this.layoutFrame) return;
   this.layoutFrame = requestAnimationFrame(() => {
    this.layoutFrame = 0;
    if (this.opened) { this.sidePanels.layout(); this.layout(); }
   });
  }).observe(this.root);
  sidePanels.splitRoom = () => this.opened ? 2 * MIN + GAP : 0;
  Notify.watch(() => this.opened && this.pane?.chat.activeId ? [`chat:${this.pane.chat.activeId}`] : []);
 }

 join(view) {
  view.workspace = this; view.conversations = this.chat.conversations; view.nodes = this.chat.nodes; this.views.add(view);
 }
 viewOf(conv) { return [...this.views].find(view => view.active === conv) || null; }
 viewOfId(id) { return id ? [...this.views].find(view => view.activeId === id) || null : null; }
 canFit() {
  return !!SplitSizing.fit(this.app.clientWidth - 2 * this.sidePanels.gap());
 }
 focus(view) {
  if (!view || (view !== this.chat && !this.opened)) return;
  const changed = this.currentChat !== view;
  this.currentChat = view;
  this.main.classList.toggle('is-split-focused', view === this.chat);
  this.pane?.main.classList.toggle('is-split-focused', view === this.pane.chat);
  if (changed) this.changed();
 }
 async open(id) {
  if (!this.library.chat(id)) return;
  const shown = this.viewOfId(id);
  if (shown) { this.focus(shown); shown.main.querySelector('.composer-input').focus(); return; }
  if (!this.canFit()) return;
  this.pane ||= new SplitPane(this, this.template);
  if (!this.opened) {
   this.bones.veil(); this.pane.bones.veil();
   this.opened = true; this.root.hidden = false; this.root.prepend(this.main); this.app.classList.add('has-split');
   this.sidePanels.layout(); this.layout();
   if (!this.opened) return;
   if (motion()) this.root.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
   setTimeout(() => { if (!this.dragging) { this.bones.unveil(); this.pane.bones.unveil(); } }, 260);
  }
  const token = this.opening = (this.opening || 0) + 1;
  await this.pane.chat.open(id);
  if (!this.opened || this.opening !== token) return;
  this.focus(this.pane.chat); this.sync(); this.pane.input.focus({ preventScroll: true }); Notify.look();
 }
 close() {
  if (!this.opened) return;
  this.opening = (this.opening || 0) + 1;
  this.pane.models.close();
  this.pane.notepad.close();
  this.pane.routines?.close();
  for (const popover of this.pane.main.querySelectorAll(':popover-open')) popover.hidePopover();
  this.end(); this.pane.chat.newChat();
  this.opened = false; this.app.insertBefore(this.main, this.root);
  this.root.hidden = true; this.app.classList.remove('has-split'); this.main.classList.remove('is-split-focused');
  this.currentChat = this.chat; this.sidePanels.layout(); this.changed();
  this.main.querySelector('.composer-input').focus({ preventScroll: true }); Notify.look();
 }
 sync() {
  for (const mini of [MiniChat.current, ...MiniChat.away.values()]) {
   if (mini && this.viewOf(mini.origin)) mini.source = this.viewOf(mini.origin);
  }
  this.pane?.sync();
  if (this.chat.active?.record) this.main.setAttribute('aria-label', this.library.titleOf(this.chat.active.record));
  if (this.opened && this.pane.chat.activeId && !this.library.chat(this.pane.chat.activeId)) this.close();
  for (const row of this.app.querySelectorAll('.chat-row[data-id]')) row.classList.toggle('is-open-beside', this.opened && row.dataset.id === this.pane?.chat.activeId);
 }
 layout() {
  if (!this.opened || !this.pane) return;
  const room = this.root.clientWidth - GAP;
  const size = SplitSizing.fit(this.root.clientWidth, this.dragging ? this.dragWidth : room * this.ratio);
  if (!size) { this.close(); return; }
  this.root.style.setProperty('--split-left', `${size.left}px`);
  this.divider.setAttribute('aria-valuemin', String(Math.round(MIN / room * 100)));
  this.divider.setAttribute('aria-valuemax', String(Math.round((room - MIN) / room * 100)));
  this.divider.setAttribute('aria-valuenow', String(Math.round(size.left / room * 100)));
  this.pane.plan?.fit();
 }
 start(event) {
  if (event.button !== 0 || !this.opened) return;
  event.preventDefault(); this.dragging = true; this.dragWidth = this.main.getBoundingClientRect().width;
  this.bones.veil(); this.pane.bones.veil(); this.app.classList.add('is-split-resizing');
  this.pointerId = event.pointerId;
  this.divider.setPointerCapture(event.pointerId);
  const move = event => { this.dragWidth = event.clientX - this.root.getBoundingClientRect().left - GAP / 2; this.layout(); };
  const finish = event => {
   if (!this.dragging) return;
   if (event && event.pointerId !== this.pointerId) return;
   const room = this.root.clientWidth - GAP, size = SplitSizing.fit(this.root.clientWidth, this.dragWidth);
   if (size) this.ratio = size.left / room;
   this.end(); this.layout();
  };
  const cancel = () => { this.dragWidth = (this.root.clientWidth - GAP) * this.ratio; finish(); };
  const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } };
  this.dragCleanup = () => {
   this.divider.removeEventListener('pointermove', move); this.divider.removeEventListener('pointerup', finish); this.divider.removeEventListener('pointercancel', cancel);
   this.divider.removeEventListener('lostpointercapture', finish); document.removeEventListener('pointerup', finish, true);
   window.removeEventListener('blur', cancel); document.removeEventListener('keydown', escape, true);
  };
  window.addEventListener('blur', cancel); document.addEventListener('keydown', escape, true);
  this.divider.addEventListener('lostpointercapture', finish); document.addEventListener('pointerup', finish, true);
  this.divider.addEventListener('pointermove', move); this.divider.addEventListener('pointerup', finish); this.divider.addEventListener('pointercancel', cancel);
 }
 end() {
  this.dragCleanup?.(); this.dragCleanup = null;
  this.dragging = false; this.app.classList.remove('is-split-resizing');
  if (this.pointerId != null && this.divider.hasPointerCapture(this.pointerId)) this.divider.releasePointerCapture(this.pointerId);
  this.pointerId = null;
  this.bones.unveil(); this.pane?.bones.unveil();
 }
}
window.SplitView = SplitView;
})();
