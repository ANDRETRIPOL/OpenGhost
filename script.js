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

let chatList = null;
let folderPill = null;
let modelStage = null;
let effortSlider = null;
let notepad = null;

new SmoothHeight(composerField, composerInput);
new ResizeObserver(() => {
  const gap = parseFloat(getComputedStyle(main).getPropertyValue('--composer-bottom-gap')) || 0;
  main.style.setProperty('--composer-space', `${Math.ceil(composer.offsetHeight + gap)}px`);
}).observe(composer);
const composerScrollbar = new Scrollbar(composerInput, document.querySelector('.composer-scrollbar'));
const threadScrollbar = new Scrollbar(thread, document.querySelector('.thread-scrollbar'));
new Scrollbar(document.querySelector('.chats-scroll'), document.querySelector('.chats-scrollbar'));
const composerText = new ComposerText(composerInput, document.querySelector('.composer-mirror'));
LinkChip.watch(document.querySelector('.composer-mirror'));
LinkChip.watch(thread);
const settings = new Settings(document.querySelector('.settings'));
new GeneralSettings({ root: document.querySelector('#settings-general'), context: UserContext });
new MemorySettings({ root: document.querySelector('#settings-memory'), memory: Memory });
// A pill in the chat that says what the agent remembered opens the memory itself.
MemoryPill.onOpen = () => {
  settings.open();
  settings.page('memory');
};
new AppearanceSettings(document.querySelector('#settings-appearance'));
new UsageSettings({ root: document.querySelector('#settings-usage'), settings, dialog: settings.dialog });
const settingsScrollbar = new Scrollbar(document.querySelector('.settings-page'), document.querySelector('.settings-scrollbar'));
for (const panel of document.querySelectorAll('.settings-panel')) settingsScrollbar.observe(panel);
const threadBottom = document.querySelector('.thread-bottom');
new LiquidGlass(threadBottom, { width: 36, height: 36 });
// The capsule at the top of the chat holds the sidebar's button and, once the chat exists, the notes' button: it is as
// wide as what it holds. Growing, its lens takes the new size at once, so the far end is glass as it comes out.
// The third is the ghost of a mini chat that was closed while its agent was at work: it brings the mini chat back.
const TOP_TOOLS = { one: 36, step: 32, height: 36 };
const topTools = document.querySelector('.top-tools');
const notesToggle = document.querySelector('.notes-toggle');
const miniToggle = document.querySelector('.mini-toggle');
const topGlass = new LiquidGlass(topTools);
let topCount = 1;
const fitTopTools = () => {
  const count = 1 + (notesToggle.hidden ? 0 : 1) + (miniToggle.hidden ? 0 : 1);
  topTools.classList.toggle('has-notes', !notesToggle.hidden);
  topTools.style.setProperty('--top-count', count);
  if (count > topCount) topGlass.resize(TOP_TOOLS.one + TOP_TOOLS.step * (count - 1), TOP_TOOLS.height);
  topCount = count;
};
for (const button of [notesToggle, miniToggle]) new MutationObserver(fitTopTools).observe(button, { attributes: true, attributeFilter: ['hidden'] });
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
});
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
});
document.querySelector('.titlebar-name').innerHTML = `${Glyphs.ghost}<span>OpenGhost</span>`;
const modeButton = document.querySelector('.composer-mode');
const browserToggle = document.querySelector('.browser-toggle');
let browserPanel = null;
if (AgentTools.available) {
  modeButton.hidden = false;
  new ModePicker({ button: modeButton, settings, onChange: () => chat.onModeChange() });
  browserToggle.hidden = false;
  browserPanel = window.browserPanel = new BrowserPanel({ app, main, toggle: browserToggle });
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

sidebarToggle.addEventListener('sidebar-toggle', () => {
  setSidebarCollapsed(!app.classList.contains('is-sidebar-collapsed'));
});

// Search opens over the middle of the chat; the sidebar's list stays as it is.
const spotlight = new Spotlight({ button: searchButton, anchor: main, library, chat });

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
  composerSend.toggleAttribute('disabled', !composerText.text().trim() && !attachments.count);
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
