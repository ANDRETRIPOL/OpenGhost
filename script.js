'use strict';

I18n.apply();

const app = document.querySelector('.app');
const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.querySelector('.sidebar-toggle');
const searchButton = document.querySelector('.sidebar-search-button');
const main = document.querySelector('.main');
const thread = document.querySelector('.thread');
const composer = document.querySelector('.composer');
const composerField = document.querySelector('.composer-field');
const composerInput = document.querySelector('.composer-input');
const composerSend = document.querySelector('.composer-send');
const composerActions = composerSend.parentElement;
const composerPlaceholder = document.querySelector('.composer-placeholder');

let chatList = null;
let folderPill = null;
let modelStage = null;
let effortSlider = null;
let notepad = null;
// Routines (routines.js): the panel of the chat's own, opened from its button, and the one that sets a routine up with a
// chat of its own, opened from the sidebar. The app's window runs them; the quick chat's only reads and sets them.
let routinePanel = null;
let routineMaker = null;
// The agent's plan at the top of the chat, in the app's window: the quick chat's has no room for it.
let planIsland = null;
let updatePill = null;
let sidePanels = null;
const MAIN_WINDOW = !window.openghost?.quick;
Routines.load();
Skills.load();

new SmoothHeight(composerField, composerInput);
ComposerSpace.watch(main, composer);
new ThreadBones({ app, main, thread });
ThreadWindow.watch(thread);
const composerScrollbar = new Scrollbar(composerInput, document.querySelector('.composer-scrollbar'));
const threadScrollbar = new Scrollbar(thread, document.querySelector('.thread-scrollbar'));
new Scrollbar(document.querySelector('.chats-scroll'), document.querySelector('.chats-scrollbar'));
const composerText = new ComposerText(composerInput, document.querySelector('.composer-mirror'));
LinkChip.watch(document.querySelector('.composer-mirror'));
LinkChip.watch(thread);
const settings = new Settings(document.querySelector('.settings'));
new GeneralSettings({ root: document.querySelector('#settings-general'), context: UserContext });
new MemorySettings({ root: document.querySelector('#settings-memory'), memory: Memory });
new ComposerSettings({ root: document.querySelector('#settings-composer'), predictions: Predictions });
new NotifySettings({ root: document.querySelector('#settings-notifications') });
// A pill in the chat that says what the agent remembered opens the memory itself.
MemoryPill.onOpen = () => {
  settings.open();
  settings.page('memory');
};
new AppearanceSettings(document.querySelector('#settings-appearance'));
new AboutSettings(document.querySelector('#settings-about'));
new UsageSettings({ root: document.querySelector('#settings-usage'), settings, dialog: settings.dialog });
// Usage at a glance: the button beside Settings in the sidebar grows into a small panel.
new UsagePeek({ button: document.querySelector('.sidebar-usage'), settings });
const settingsScrollbar = new Scrollbar(document.querySelector('.settings-page'), document.querySelector('.settings-scrollbar'));
for (const panel of document.querySelectorAll('.settings-panel')) settingsScrollbar.observe(panel);
// The chat's own buttons (the capsule at the top, the notes, the browser, down to the end, the folder) are clear glass
// without a lens (styles.css turns it off for them), so no lens maps are made for them: drawing those maps cost work
// at every start of the page, the quick chat's window included, for nothing that shows.
const threadBottom = document.querySelector('.thread-bottom');
// The capsule at the top of the chat holds the sidebar's button and, when a mini chat was closed while its agent was
// at work, its ghost, which brings the mini chat back: it is as wide as what it holds.
const topTools = document.querySelector('.top-tools');
const notesToggle = document.querySelector('.notes-toggle');
const miniToggle = document.querySelector('.mini-toggle');
const fitTopTools = () => topTools.parentElement.style.setProperty('--top-count', 1 + (miniToggle.hidden ? 0 : 1));
new MutationObserver(fitTopTools).observe(miniToggle, { attributes: true, attributeFilter: ['hidden'] });
miniToggle.innerHTML = `${Glyphs.ghost}<span class="mini-toggle-dot"></span>`;
const library = new Library(ChatStore, syncAll);
window.addEventListener('pagehide', () => {
  library.flush();
  UserContext.flush();
  Memory.flush();
  Usage.flush();
});
// The chat whose unsent words the message field holds now (see putAway and bringOut), and the wait before they are saved.
const UNSENT_DELAY = 300;
let written = null, unsentTimer = 0;
const chat = new Chat({
  main, thread, bottom: threadBottom, settings, library, onChange: syncAll, onList: list => threadScrollbar.observe(list), onRecall: recall,
  onNotes: (conv, change) => notepad?.onNotes(conv, change),
  onLeave: conv => putAway(conv),
  onPredict: conv => { if (conv === chat.active) syncComposer(); },
  onPlan: conv => { if (conv === chat.active) planIsland?.sync(); },
});
if (MAIN_WINDOW) planIsland = new PlanIsland({ main, chat });
// The chats' rows show the last message of each: older chats have it worked out once, a while after the start.
if (MAIN_WINDOW) library.ready.then(() => setTimeout(() => chat.fillPreviews().catch(() => {}), 4000));
// A new version of the app, at the top right beside the globe (desktop/update.js); the plan's island keeps clear of it.
if (MAIN_WINDOW && window.openghost?.update) updatePill = new UpdatePill({ main, bridge: window.openghost.update, onMove: () => planIsland?.fit() });
const lockScreen = new LockScreen({ main, chat, composer, onOpen: () => composerInput.focus({ preventScroll: true }) });
const lockCard = new LockCard({ chat, library, scroller: document.querySelector('.chats-scroll'), screen: lockScreen });
new WelcomeGhost({ main, root: document.querySelector('.welcome'), input: composerInput });
folderPill = new FolderPill({ button: document.querySelector('.composer-folder'), library, chat });
chatList = new ChatList({
  root: document.querySelector('.chats'),
  library,
  chat,
  onNewFolder: async () => {
    const folder = await library.pick();
    if (!folder) return;
    chat.newChat(folder);
    composerInput.focus();
  },
  onNewChat: (folder) => {
    chat.newChat(folder);
    composerInput.focus();
  },
  onLock: (id, row) => lockCard.open(id, row),
  onNewRoutine: MAIN_WINDOW && Routines.available ? head => routineMaker?.open({ anchor: head }) : null,
  // The Skills row above the routines opens the search for skills alone.
  onSkills: MAIN_WINDOW && Skills.available ? () => spotlight.showSkills() : null,
  // A fork of the whole chat, from its row's menu (chat.js).
  onFork: MAIN_WINDOW ? id => chat.forkChat(id) : null,
});
document.querySelector('.titlebar-name').innerHTML = `${Glyphs.ghost}<span>OpenGhost</span>`;
const modeButton = document.querySelector('.composer-mode');
const browserToggle = document.querySelector('.browser-toggle');
let browserPanel = null;
if (AgentTools.available) {
  modeButton.hidden = false;
  new ModePicker({ button: modeButton, settings, onChange: () => chat.onModeChange() });
  // The quick chat's window has no built-in browser.
  if (!window.openghost?.quick) {
    browserToggle.hidden = false;
    browserPanel = window.browserPanel = new BrowserPanel({ app, main, toggle: browserToggle });
  }
}
const attachments = new Attachments({
  tray: document.querySelector('.composer-attachments'),
  picker: document.querySelector('.composer-picker'),
  panel: document.querySelector('.note-panel'),
  main,
  zone: document.querySelector('.drop-zone'),
  input: composerInput,
  onChange: syncComposer,
  onText: (text, undo) => composerText.place(text, undo),
  // Files dropped on the open settings go to the settings' own list, not into the message.
  // And files dropped on the open mini chat are the mini chat's.
  isActive: event => !event?.target?.closest?.('.mini') && !chat.active?.locked && !settings.dialog.open,
});
// A fork made from a message of the user's has that message waiting in its field: its words come with the fork's
// draft (chat.js), and its pictures, kept in the message, are put back here.
chat.onForked = (made, prompt) => {
  const pictures = (prompt?.attachments || []).filter(item => item.image && item.url?.startsWith('data:'));
  // The page may fetch nothing but its own provider, so the picture is read out of its data: address by hand.
  const file = ({ url, name }) => {
    try {
      const [head, body] = url.split(',', 2), type = head.slice(5).split(';')[0] || 'image/png';
      const bytes = head.includes(';base64') ? Uint8Array.from(atob(body), char => char.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body));
      return new File([bytes], name || 'image.png', { type });
    } catch {
      return null;
    }
  };
  const files = pictures.map(file).filter(Boolean);
  if (chat.activeId === made.id && files.length) attachments.add(files);
};
// A right click on a field or on selected words: cut, copy, paste, select all (edit-menu.js).
new EditMenu();
new SelectionMenu({
  onAsk: (text, box) => {
    const mini = box.closest('.mini')?.__mini;
    if (mini) { mini.quote(text); return; }
    composerText.insertQuote(text);
    syncComposer();
  },
  onMini: text => { if (chat.active?.record) MiniChat.open({ settings, source: chat, library, quote: text }); },
});
new AddMenu({ button: document.querySelector('.composer-add'), attachments, chat, input: composerInput });
settings.show(chat.model);
modelStage = new ModelStage({
  button: document.querySelector('.composer-model'),
  root: document.querySelector('.model-stage'),
  chat,
  settings,
  input: composerInput,
});
effortSlider = new EffortSlider({
  button: document.querySelector('.composer-effort'),
  panel: document.querySelector('.effort-panel'),
  settings,
});
effortSlider.lock(chat.busy);
notepad = new Notepad({ chat, thread, button: notesToggle });
if (MAIN_WINDOW && Routines.available) {
  routinePanel = new RoutinePanel({ chat, settings, button: document.querySelector('.routines-pill') });
  routineMaker = new RoutinePanel({ chat, settings, mode: 'new', onCreate: createRoutine });
  // A pill of a routine in the chat opens the chat's routines at that routine.
  thread.addEventListener('click', event => {
    const pill = event.target.closest('.thread-note-pill')?.closest('.thread-note.is-routine');
    if (pill && Routines.find(pill.dataset.routine)) routinePanel.open({ show: pill.dataset.routine });
    else if (pill) routinePanel.open();
  });
  Routines.watch(syncAll);
  // A routine that is due runs in its chat; the app is told once the chats are read, so none is lost while the page loads.
  window.openghost.routines.onRun(run => chat.runRoutine(run).catch(() => {}));
  Promise.all([library.ready, Routines.ready]).then(() => window.openghost.routines.ready());
}

// A routine set up from the sidebar gets a chat of its own, with the model and effort picked for it: the chat stands in
// the routines' group with the routine's pill as its first line, and opens.
async function createRoutine({ text, rule, model, effort }) {
  const record = library.create({ folder: null, text, attachments: [] });
  library.update(record.id, { model, routine: true });
  const { item } = await Routines.add({ text, rule, chat: record.id, own: true, effort, by: 'user' });
  if (!item) {
    library.remove(record.id);
    return false;
  }
  await library.saveMessages(record.id, [{ role: 'routine', kind: 'set', routine: item.id, text: item.text, say: Routines.say(item.rule) }], 0);
  await chat.open(record.id);
  chat.nameRoutine(record.id, text);
  return true;
}

document.querySelector('.sidebar-settings').addEventListener('settings-open', () => settings.open());

document.querySelector('.sidebar-new-chat').addEventListener('add', () => {
  chat.newChat();
  composerInput.focus();
});

function setSidebarCollapsed(collapsed) {
  app.classList.toggle('is-sidebar-collapsed', collapsed);
  sidebarToggle.toggleAttribute('collapsed', collapsed);
  sidebar.inert = collapsed;
  browserPanel?.fit();
}

// In the app's window the sidebar and the browser make room for the chat as the window narrows, and the sidebar can be
// dragged wider or narrower (side-panels.js); the quick chat's window has neither.
if (MAIN_WINDOW) sidePanels = new SidePanels({ app, sidebar, toggle: sidebarToggle, browser: browserPanel });
else sidebarToggle.addEventListener('sidebar-toggle', () => {
  setSidebarCollapsed(!app.classList.contains('is-sidebar-collapsed'));
});

// Search opens over the middle of the chat; the sidebar's list stays as it is.
const spotlight = new Spotlight({ button: searchButton, anchor: main, library, chat, onSkill: name => { composerText.insertSkill(name); syncComposer(); } });
// Typing / in the message field lists the skills over it.
new SkillPicker({ input: composerInput, text: composerText, anchor: composer, onPick: syncComposer });

document.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyK' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  if (document.querySelector('dialog[open]')) return;
  event.preventDefault();
  spotlight.toggle();
});

composer.addEventListener('mousedown', (event) => {
  if (event.target === composer || event.target.classList.contains('composer-toolbar')) {
    event.preventDefault();
    composerInput.focus();
  }
});

function syncComposer() {
  const empty = !composerText.text().trim() && !attachments.count;
  composerSend.toggleAttribute('disabled', empty);
  // Written while OpenGhost works, a message is a suggestion for the work under way: the send button says so, and the
  // model and effort, locked till the work is over, make way for it.
  const suggesting = chat.busy && !empty;
  if (suggesting) composerSend.setAttribute('caption', I18n.t('composer.suggest'));
  else composerSend.removeAttribute('caption');
  composerActions.classList.toggle('is-suggesting', suggesting);
  // The likely next message waits in the empty field as grey words (predictions.js); anything written sends it away.
  if (!empty && chat.prediction) chat.forget(chat.active, true);
  const predicted = empty ? chat.prediction : '';
  if (predicted !== composerField.dataset.predicted) {
    composerField.dataset.predicted = predicted;
    composerField.classList.toggle('is-predicted', !!predicted);
    if (predicted) {
      composerPlaceholder.innerHTML = '<span class="composer-guess"></span><kbd class="composer-key">Tab</kbd>';
      composerPlaceholder.firstChild.textContent = predicted;
    } else composerPlaceholder.textContent = I18n.t('composer.placeholder');
    composerInput.setAttribute('aria-placeholder', predicted || I18n.t('composer.placeholder'));
  }
  composerField.classList.toggle('has-value', composerInput.value !== '');
}

// Each chat keeps what was being written in it. When a chat leaves the screen, or locks, the words and files in the field
// are put away with it, and when a chat comes they are brought out again. The words are also kept on the disk as they are
// written, so they are there after a restart; a chat with a password keeps them sealed with its key, and shows them only
// once it is open. Files wait in memory only.

// Writes down what the field holds now for the chat it belongs to. A chat not started yet has no place of its own, so its
// words are kept apart, and moved once it is.
function keepUnsent() {
  clearTimeout(unsentTimer);
  const conv = written;
  if (!conv) return;
  const key = conv.record ? conv.id : 'new';
  if (conv.keptAs && conv.keptAs !== key) library.saveDraft(conv.keptAs, '');
  conv.keptAs = key;
  library.saveDraft(key, composerText.text());
}

function putAway(conv) {
  if (conv !== written) return;
  keepUnsent();
  const text = composerText.text(), files = attachments.take();
  // The words of a chat with a password are not held in memory while it is locked: they are read from the disk again.
  const sealed = !!conv.record && library.isProtected(conv.id);
  conv.unsent = (!sealed && text.trim()) || files.length ? { text: sealed ? null : text, files } : null;
  written = null;
  composerInput.value = '';
  composerText.refresh();
  // Emptied by the app, the field sends no word of it: its scrollbar is told, or the bar of a long message stays behind.
  composerScrollbar.update();
}

function bringOut() {
  const now = chat.active, want = now && !now.locked ? now : null;
  if (want === written) return;
  if (written) putAway(written);
  written = want;
  if (!want) return;
  const focused = document.activeElement, kept = want.unsent;
  want.unsent = null;
  want.keptAs = want.record ? want.id : 'new';
  if (kept) attachments.give(kept.files);
  const place = text => {
    if (written !== want || composerText.text().trim()) return;
    const { quotes, rest } = Chat.splitQuotes(text);
    if (!rest && !quotes.length) return;
    const before = document.activeElement;
    composerText.restore(rest, quotes);
    // Bringing the words out puts the keyboard in the field; it goes back to where it was.
    if (before instanceof HTMLElement && before !== document.activeElement && before.isConnected && before !== document.body) before.focus({ preventScroll: true });
    syncComposer();
  };
  if (typeof kept?.text === 'string') place(kept.text);
  else library.draft(want.keptAs).then(place);
  if (focused instanceof HTMLElement && focused !== document.activeElement && focused.isConnected && focused !== document.body) focused.focus({ preventScroll: true });
}

function syncAll() {
  if (!chatList) return;
  // The marks where forks begin follow their chats' names, and their going.
  chat.syncForks();
  // The skills of the chat on screen: its project may have skills of its own.
  const folder = chat.active?.record ? chat.cwd(chat.active) : '';
  if (folder !== Skills.folder) { Skills.folder = folder; if (folder) Skills.refresh(folder); }
  folderPill.sync();
  chatList.render();
  lockScreen.sync();
  // After the lock screen has let go of the field: words can't be put into a field it holds.
  bringOut();
  syncComposer();
  settings.show(chat.model);
  modelStage?.sync();
  effortSlider?.lock(chat.busy);
  notepad?.sync();
  routinePanel?.sync();
  planIsland?.sync();
  sidePanels?.sync(chat.activeId);
  MiniChat.check();
}

// The ghost at the top of the chat: there while this chat's mini chat is out of sight with its agent at work or its
// answer ready, and says which.
MiniChat.onSignal = () => {
  const state = chat.active ? MiniChat.state(chat.active) : '';
  miniToggle.hidden = !state;
  if (!state) return;
  miniToggle.dataset.state = state;
  miniToggle.setAttribute('aria-label', I18n.t(`mini.${state}`));
  miniToggle.title = I18n.t(`mini.${state}`);
};
miniToggle.addEventListener('click', () => { if (chat.active?.record) MiniChat.open({ settings, source: chat, library }); });

function send() {
  const text = composerText.text().trim();
  if ((!text && !attachments.count) || !chat.send(text, attachments.items)) return;
  attachments.take();
  composerInput.value = '';
  composerText.refresh();
  // Emptied by the app, the field sends no word of it: its scrollbar is told, or the bar of a long message stays behind.
  composerScrollbar.update();
  syncComposer();
  keepUnsent();
}

// A waiting message taken back to be rewritten: its words return to the field, its files to the tray.
function recall({ rest, quotes, attachments: files }) {
  attachments.give(files);
  composerText.restore(rest, quotes);
  syncComposer();
}

composerInput.addEventListener('input', syncComposer);
composerInput.addEventListener('input', () => {
  clearTimeout(unsentTimer);
  unsentTimer = setTimeout(keepUnsent, UNSENT_DELAY);
});
window.addEventListener('pagehide', keepUnsent);

// Tab or the right arrow in the empty field takes the predicted message into it, to be changed or sent.
composerInput.addEventListener('keydown', (event) => {
  if ((event.key !== 'Tab' && event.key !== 'ArrowRight') || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  if (composerInput.value !== '' || !chat.prediction) return;
  event.preventDefault();
  composerText.place(chat.takePrediction());
  syncComposer();
});

composerInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  send();
});

// Escape stops the agent from anywhere in the window, not only from the message field. An open menu or dialog, and
// fields that use Escape themselves (renaming, search, the address bar), get it first.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || !chat.busy) return;
  if (document.querySelector(':popover-open:not(.mini), dialog[open]')) return;
  event.preventDefault();
  chat.stop();
});

composerSend.addEventListener('composer-send', () => send());

syncComposer();

// Notifications (notify.js): in the app's window the chat on screen and the mini chat open over it are what the user
// sees; a notification pressed opens its chat, and for a reply of a mini chat, the mini chat too.
if (!window.openghost?.quick) {
  Notify.watch(() => [chat.activeId && `chat:${chat.activeId}`, MiniChat.current?.open && MiniChat.current.origin && `mini:${MiniChat.current.origin.id}`]);
  window.openghost?.notify?.onOpen(async key => {
    const kind = key.slice(0, key.indexOf(':')), id = key.slice(key.indexOf(':') + 1);
    if (!library.chat(id)) return;
    if (settings.dialog.open) settings.dialog.close();
    await chat.open(id);
    if (kind === 'mini' && chat.activeId === id) MiniChat.open({ settings, source: chat, library });
    Notify.look();
  });
}

// The language can't change while an agent is at work in this window: the page is read anew for it.
LanguageSettings.busy = () => [chat, MiniChat.current?.chat, ...[...MiniChat.away.values()].map(mini => mini.chat)]
  .some(one => one && [...one.conversations.values()].some(conv => conv.turn));
// While an agent works here, the window is not slowed down out of sight (desktop/main.js).
if (!window.openghost?.quick && window.openghost?.working) {
  let working = false;
  setInterval(() => {
    const now = LanguageSettings.busy();
    if (now !== working) window.openghost.working(working = now);
  }, 1000);
}
// Read anew for a new language, the page comes back where it was left: in the settings.
try {
  const page = sessionStorage.getItem('openghost.reopen');
  if (page) {
    sessionStorage.removeItem('openghost.reopen');
    settings.open();
    settings.page(page, true);
  }
} catch {}
