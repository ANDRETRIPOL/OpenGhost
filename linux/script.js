'use strict';

I18n.apply();

const app = document.querySelector('.app');
const sidebar = document.querySelector('.sidebar');
const sidebarToggle = document.querySelector('.sidebar-toggle');
const search = document.querySelector('.sidebar-search');
const searchButton = document.querySelector('.sidebar-search-button');
const searchInput = document.querySelector('.sidebar-search-input');
const main = document.querySelector('.main');
const thread = document.querySelector('.thread');
const composer = document.querySelector('.composer');
const composerField = document.querySelector('.composer-field');
const composerInput = document.querySelector('.composer-input');
const composerSend = document.querySelector('.composer-send');

let chatList = null;
let folderPill = null;

new SmoothHeight(composerField, composerInput);
new ResizeObserver(() => {
  const gap = parseFloat(getComputedStyle(main).getPropertyValue('--composer-bottom-gap')) || 0;
  main.style.setProperty('--composer-space', `${Math.ceil(composer.offsetHeight + gap)}px`);
}).observe(composer);
new Scrollbar(composerInput, document.querySelector('.composer-scrollbar'));
const threadScrollbar = new Scrollbar(thread, document.querySelector('.thread-scrollbar'));
new Scrollbar(document.querySelector('.chats-scroll'), document.querySelector('.chats-scrollbar'));
const composerText = new ComposerText(composerInput, document.querySelector('.composer-mirror'));
LinkChip.watch(document.querySelector('.composer-mirror'));
LinkChip.watch(thread);
const settings = new Settings(document.querySelector('.settings'));
const threadBottom = document.querySelector('.thread-bottom');
new LiquidGlass(threadBottom, { width: 36, height: 36 });
const library = new Library(ChatStore, syncAll);
window.addEventListener('pagehide', () => library.flush());
const chat = new Chat({ main, thread, bottom: threadBottom, settings, library, onChange: syncAll, onList: list => threadScrollbar.observe(list) });
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
});
document.querySelector('.titlebar-name').innerHTML = `${Glyphs.ghost}<span>OpenGhost</span>`;
const modeButton = document.querySelector('.composer-mode');
const browserToggle = document.querySelector('.browser-toggle');
let browserPanel = null;
if (AgentTools.available) {
  modeButton.hidden = false;
  new ModePicker({ button: modeButton, menu: document.querySelector('.mode-menu'), settings, onChange: () => chat.onModeChange() });
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
  isActive: () => !MiniChat.current,
});
new SelectionMenu({
  onAsk: (text, box) => {
    const mini = box.closest('.mini')?.__mini;
    if (mini) { mini.quote(text); return; }
    composerText.insertQuote(text);
    syncComposer();
  },
  onMini: text => MiniChat.open({ settings, source: chat, quote: text }),
});
document.querySelector('.composer-add').addEventListener('add', () => attachments.pick());
new EffortSlider({
  button: document.querySelector('.composer-effort'),
  panel: document.querySelector('.effort-panel'),
  settings,
});

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

const searchField = new SearchField({
  root: search,
  button: searchButton,
  input: searchInput,
  clear: document.querySelector('.sidebar-search-clear'),
});
searchInput.addEventListener('input', () => chatList.setQuery(searchInput.value));

document.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyK' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  if (document.querySelector('dialog[open]')) return;
  event.preventDefault();
  if (app.classList.contains('is-sidebar-collapsed')) setSidebarCollapsed(false);
  searchField.focus();
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

function syncAll() {
  if (!chatList) return;
  syncComposer();
  folderPill.sync();
  chatList.render();
}

async function send() {
  if (!composerText.text().trim() && !attachments.count) return;
  if (chat.needsFolder && !(await folderPill.pick())) {
    folderPill.nudge();
    return;
  }
  const text = composerText.text().trim();
  if ((!text && !attachments.count) || !chat.send(text, attachments.items)) return;
  attachments.take();
  composerInput.value = '';
  composerText.refresh();
  syncComposer();
}

composerInput.addEventListener('input', syncComposer);

composerInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && chat.busy && !event.isComposing && !document.querySelector(':popover-open, dialog[open]')) {
    event.preventDefault();
    chat.stop();
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  send();
});

composerSend.addEventListener('composer-send', () => send());

syncComposer();
