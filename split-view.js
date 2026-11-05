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
  this.browserToggle = $('.browser-toggle');
  const close = this.close = Object.assign(document.createElement('button'), { type: 'button', className: 'split-close', innerHTML: Glyphs.close });
  close.setAttribute('aria-label', I18n.t('split.close'));
  close.title = I18n.t('split.close');
  $('.browser-tools').append(close);
  close.addEventListener('click', () => owner.close());
  const crease = this.crease = Object.assign(document.createElement('div'), { className: 'split-crease' });
  crease.setAttribute('aria-hidden', 'true');
  main.append(crease);
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
  this.effort = new EffortSlider({ button: $('.composer-effort'), panel: clonePanel('.effort-panel'), settings, chat: this.chat });
  this.notepad = new Notepad({ chat: this.chat, thread: $('.thread'), button: $('.notes-toggle') });
  if (Routines.available) {
   this.routines = new RoutinePanel({ chat: this.chat, settings, button: $('.routines-pill') });
   $('.thread').addEventListener('click', event => {
    const pill = event.target.closest('.thread-note-pill')?.closest('.thread-note.is-routine');
    if (pill) this.routines.open(Routines.find(pill.dataset.routine) ? { show: pill.dataset.routine } : {});
   });
  }
  this.ensureBrowser();
  this.input.addEventListener('input', () => { this.sync(); clearTimeout(this.timer); this.timer = setTimeout(() => this.keep(), 300); });
  this.input.addEventListener('keydown', event => {
   if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
   if ((event.key === 'Tab' || event.key === 'ArrowRight') && !this.input.value && this.chat.prediction) {
    event.preventDefault(); this.text.place(this.chat.takePrediction()); this.sync();
   } else if (event.key === 'Enter') { event.preventDefault(); this.send(); }
  });
  this.sendButton.addEventListener('composer-send', () => this.send());
  this.sendButton.addEventListener('composer-stop', () => { this.chat.stop(); this.sync(); });
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

 ensureBrowser() {
  if (!this.browserToggle) return null;
  const available = !window.openghost?.quick && (AgentTools.available || !!window.browserPanel);
  this.browserToggle.hidden = !available;
  if (available && !this.browser && typeof BrowserPanel === 'function') {
   this.browser = new BrowserPanel({ app: this.owner.app, main: this.main, toggle: this.browserToggle, split: true });
   this.chat.browser = this.browser;
   if (this.owner.sidePanels) this.owner.sidePanels.splitBrowser = this.browser;
  }
  return this.browser;
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
  this.ensureBrowser();
  const empty = !this.text.text().trim() && !this.attachments.count;
  this.sendButton.configure({ busy: chat.busy, empty, stopping: !!chat.active?.turn?.controller.signal.aborted });
  const suggesting = chat.busy && !empty;
  this.sendButton.parentElement.classList.toggle('is-suggesting', suggesting);
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
  this.folder.sync(); this.settings.show(chat.model); this.models?.sync(); this.effort?.follow(); this.effort?.lock(chat.busy);
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
  const leftCrease = this.leftCrease = Object.assign(document.createElement('div'), { className: 'split-crease is-left' });
  leftCrease.setAttribute('aria-hidden', 'true');
  main.append(leftCrease);
  const tools = main.querySelector('.browser-tools');
  if (tools) {
   const btn = this.splitToggle = this.toggleButton = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'split-toggle',
    innerHTML: Glyphs.split,
   });
   btn.setAttribute('aria-label', I18n.t('split.open'));
   btn.title = `${I18n.t('split.open')} (Ctrl+\\)`;
   tools.prepend(btn);
   btn.addEventListener('click', () => this.openBeside());
  }
  const drop = this.dropZone = Object.assign(document.createElement('div'), { className: 'split-drop-zone', hidden: true });
  drop.setAttribute('aria-hidden', 'true');
  drop.innerHTML = `<div class="split-drop-card"><span class="split-drop-icon">${Glyphs.split}</span><span class="split-drop-label">${I18n.t('split.open')}</span></div>`;
  app.append(drop);
  app.addEventListener('dragover', event => {
   if (!this.dragChatId || !this.canFit()) return;
   const workspace = this.opened ? this.root : this.main;
   const rect = workspace.getBoundingClientRect();
   if (event.clientX >= rect.left + rect.width * 0.35 && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dropZone.classList.add('is-over');
   } else {
    this.dropZone.classList.remove('is-over');
   }
  });
  app.addEventListener('dragleave', event => {
   if (!this.dragChatId) return;
   if (!event.relatedTarget || !this.app.contains(event.relatedTarget)) this.dropZone.classList.remove('is-over');
  });
  app.addEventListener('drop', event => {
   if (!this.dragChatId) return;
   const id = this.dragChatId;
   const over = this.dropZone.classList.contains('is-over');
   this.endDrag();
   if (over && id) {
    event.preventDefault();
    this.open(id);
   }
  });
  document.addEventListener('keydown', event => {
   if (event.code !== 'Backslash' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
   if (document.querySelector('dialog[open]')) return;
   event.preventDefault();
   this.toggle();
  });
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
    this.syncToggle();
    if (this.opened) { this.sidePanels.layout(); this.layout(); }
   });
  }).observe(this.root);
  window.addEventListener('resize', () => this.syncToggle());
  sidePanels.splitRoom = () => this.opened ? 2 * MIN + GAP : 0;
  Notify.watch(() => this.opened && this.pane?.chat.activeId ? [`chat:${this.pane.chat.activeId}`] : []);
  this.syncToggle();
 }

 join(view) {
  view.workspace = this; view.conversations = this.chat.conversations; view.nodes = this.chat.nodes; this.views.add(view);
 }
 viewOf(conv) { return [...this.views].find(view => view.active === conv) || null; }
 viewOfId(id) { return id ? [...this.views].find(view => view.activeId === id) || null : null; }
 canFit() {
  const canGrow = typeof window.openghost?.size?.setSplit === 'function';
  const width = canGrow && !this.opened
   ? Math.max(this.app.clientWidth, window.screen?.availWidth || 0)
   : this.app.clientWidth;
  return !!SplitSizing.fit(width - 2 * this.sidePanels.gap());
 }
 syncToggle() {
  if (!this.toggleButton) return;
  this.toggleButton.hidden = this.opened || !this.canFit();
  this.toggleButton.setAttribute('aria-label', I18n.t('split.open'));
  this.toggleButton.title = `${I18n.t('split.open')} (Ctrl+\\)`;
 }
 beginDrag(id) {
  if (!id || !this.canFit() || this.viewOfId(id)) return;
  this.dragChatId = id;
  this.dropZone.querySelector('.split-drop-label').textContent = I18n.t('split.open');
  this.dropZone.hidden = false;
  this.dropZone.classList.remove('is-over');
  this.app.classList.add('is-split-dragging');
 }
 endDrag() {
  this.dragChatId = '';
  if (this.dropZone) {
   this.dropZone.hidden = true;
   this.dropZone.classList.remove('is-over');
  }
  this.app.classList.remove('is-split-dragging');
 }
 toggle() {
  if (this.opened) this.close();
  else this.openBeside();
 }
 openBeside() {
  if (!this.canFit()) return Promise.resolve();
  const candidates = [...(this.library.chats || [])]
   .filter(item => item?.id && item.id !== this.chat.activeId && !this.viewOfId(item.id))
   .sort((a, b) => (b.updated || 0) - (a.updated || 0));
  if (candidates.length) return this.open(candidates[0].id);
  return this.openDraft(this.chat.folder);
 }
 ensureOpen() {
  this.pane ||= new SplitPane(this, this.template);
  this.pane.ensureBrowser();
  if (this.opened) return false;
  window.openghost?.size?.setSplit?.(true);
  if (!SplitSizing.fit(this.app.clientWidth - 2 * this.sidePanels.gap())) {
   window.openghost?.size?.setSplit?.(false);
   return false;
  }
  this.opened = true;
  this.root.hidden = false;
  this.root.prepend(this.main);
  this.app.classList.add('has-split');
  this.syncToggle();
  this.sidePanels.layout();
  this.layout();
  return this.opened;
 }
 openDraft(folder = null) {
  if (!this.canFit()) return Promise.resolve();
  const openedNow = this.ensureOpen();
  if (!this.opened) return Promise.resolve();
  this.pane.chat.newChat(folder);
  if (openedNow) this.animateUnfold();
  else this.animateSwitch();
  this.focus(this.pane.chat);
  this.sync();
  this.pane.input.focus({ preventScroll: true });
  Notify.look();
  return Promise.resolve();
 }
 focus(view) {
  if (!view || (view !== this.chat && !this.opened)) return;
  const changed = this.currentChat !== view;
  this.currentChat = view;
  this.main.classList.toggle('is-split-focused', view === this.chat);
  this.pane?.main.classList.toggle('is-split-focused', view === this.pane.chat);
  if (changed) this.changed();
 }
 // iPhone Duo / Foldable inner display book-unfold motion:
 // Both panes unfold in 3D from the center hinge seam with optical glass blur-to-clear crystallization
 // and a specular light + shadow sweep across the fold crease.
 animateUnfold() {
  if (!motion() || !this.pane) return;
  const left = this.main, right = this.pane.main;
  const duration = 520;
  const springEase = 'cubic-bezier(0.22, 1, 0.36, 1)';
  for (const el of [left, right, this.leftCrease, this.pane.crease, this.divider]) {
   el?.getAnimations().forEach(a => a.cancel());
  }
  this.root.classList.add('is-unfolding');
  left.animate([
   { transform: 'perspective(1600px) rotateY(15deg) scale(0.968)', filter: 'brightness(0.91) saturate(1.08)', offset: 0 },
   { transform: 'perspective(1600px) rotateY(3.5deg) scale(0.994)', filter: 'brightness(0.98) saturate(1.03)', offset: 0.28 },
   { transform: 'none', filter: 'brightness(1.02) saturate(1.01)', offset: 0.52 },
   { transform: 'none', filter: 'none', offset: 1 },
  ], { duration, easing: springEase });
  const rightAnim = right.animate([
   { opacity: 0.16, transform: 'perspective(1600px) rotateY(-54deg) translateX(-18px) scale(0.925)', filter: 'blur(18px) brightness(0.7) saturate(1.4)', offset: 0 },
   { opacity: 0.88, transform: 'perspective(1600px) rotateY(-14deg) translateX(-4px) scale(0.985)', filter: 'blur(7px) brightness(0.93) saturate(1.18)', offset: 0.28 },
   { opacity: 1, transform: 'none', filter: 'blur(2px) brightness(1.03) saturate(1.05)', offset: 0.52 },
   { opacity: 1, transform: 'none', filter: 'blur(0px) brightness(1) saturate(1)', offset: 1 },
  ], { duration, easing: springEase });
  rightAnim.finished.catch(() => {}).finally(() => this.root.classList.remove('is-unfolding'));
  this.leftCrease?.animate([
   { opacity: 0.95, transform: 'scaleX(1.25)', offset: 0 },
   { opacity: 0.55, transform: 'scaleX(1)', offset: 0.45 },
   { opacity: 0, transform: 'scaleX(0.6)', offset: 1 },
  ], { duration, easing: 'ease-out' });
  this.pane.crease?.animate([
   { opacity: 1, transform: 'translateX(-14%) scaleX(1.15)', offset: 0 },
   { opacity: 0.72, transform: 'translateX(12%) scaleX(1.05)', offset: 0.44 },
   { opacity: 0, transform: 'translateX(46%) scaleX(0.85)', offset: 1 },
  ], { duration: duration + 40, easing: springEase });
  this.divider.animate([
   { opacity: 0, transform: 'scaleY(0.25)' },
   { opacity: 1, transform: 'none' },
  ], { duration: 420, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' });
  const inner = [right.querySelector('.thread-view'), right.querySelector('.composer')].filter(Boolean);
  inner.forEach((el, i) => {
   el.getAnimations().forEach(a => a.cancel());
   el.animate([
    { opacity: 0.35, transform: 'translateY(10px) scale(0.986)' },
    { opacity: 1, transform: 'none' },
   ], { duration: 420, delay: i * 35, easing: springEase });
  });
 }
 animateSwitch() {
  if (!motion() || !this.pane) return;
  const right = this.pane.main;
  right.getAnimations().forEach(a => a.cancel());
  right.animate([
   { opacity: 0.68, transform: 'perspective(1600px) rotateY(-12deg) scale(0.985)', filter: 'blur(8px) brightness(0.92)', offset: 0 },
   { opacity: 1, transform: 'none', filter: 'blur(1.5px) brightness(1.02)', offset: 0.48 },
   { opacity: 1, transform: 'none', filter: 'blur(0px) brightness(1)', offset: 1 },
  ], { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  this.pane.crease?.animate([
   { opacity: 0.65, transform: 'translateX(-10%)' },
   { opacity: 0, transform: 'translateX(35%)' },
  ], { duration: 320, easing: 'ease-out' });
 }
 async open(id) {
  if (!this.library.chat(id)) return;
  const shown = this.viewOfId(id);
  if (shown) { this.focus(shown); shown.main.querySelector('.composer-input').focus(); return; }
  if (!this.canFit()) return;
  const openedNow = this.ensureOpen();
  if (!this.opened) return;
  const token = this.opening = (this.opening || 0) + 1;
  if (openedNow) this.animateUnfold();
  else this.animateSwitch();
  await this.pane.chat.open(id);
  if (!this.opened || this.opening !== token) return;
  this.focus(this.pane.chat); this.sync(); this.pane.input.focus({ preventScroll: true }); Notify.look();
 }
 close() {
  if (!this.opened) return;
  this.opening = (this.opening || 0) + 1;
  this.endDrag();
  this.root.classList.remove('is-unfolding');
  this.pane.models.close();
  this.pane.notepad.close();
  this.pane.routines?.close();
  if (this.pane.browser?.seen) {
   if (this.pane.browser.drivers.size) this.pane.browser.setPeek(false);
   else this.pane.browser.setOpen(false);
  }
  for (const popover of this.pane.main.querySelectorAll(':popover-open')) popover.hidePopover();
  this.end(); this.pane.chat.newChat();
  this.opened = false; this.app.insertBefore(this.main, this.root);
  this.root.hidden = true; this.app.classList.remove('has-split'); this.main.classList.remove('is-split-focused');
  window.openghost?.size?.setSplit?.(false);
  this.syncToggle();
  this.currentChat = this.chat; this.sidePanels.layout(); this.changed();
  this.main.querySelector('.composer-input').focus({ preventScroll: true }); Notify.look();
 }
 sync() {
  for (const mini of [MiniChat.current, ...MiniChat.away.values()]) {
   if (mini && this.viewOf(mini.origin)) mini.source = this.viewOf(mini.origin);
  }
  this.pane?.sync();
  this.syncToggle();
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
  this.root.style.setProperty('--split-right', `${size.right}px`);
  this.app.style.setProperty('--split-left', `${size.left}px`);
  this.app.style.setProperty('--split-right', `${size.right}px`);
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
