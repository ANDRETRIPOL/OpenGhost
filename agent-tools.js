(() => {
'use strict';

const PAGE_CHARS = 40000;
const SEARCH_RESULTS = 8;
// Pictures and videos found for an answer: how many by default and at most, and how wide a picture's preview is asked for.
const MEDIA = { count: 6, max: 12, preview: 720 };
const MODES = ['ask', 'auto', 'full'];

const bridge = window.openghost?.tools || null;

// The agent's shell follows the computer: PowerShell on Windows, zsh on a Mac, bash on Linux.
const SHELLS = {
 win32: {
  tool: 'run_powershell',
  about: 'Run PowerShell code on the user\'s Windows computer. It starts in the project folder, is non-interactive (it can never wait for input) and returns the exit code with the combined output. Both output streams are captured already, so never add 2>&1 or *>&1: in Windows PowerShell that wraps every stderr line of a program in an error record. Use it to run programs, scripts and tests, builds, package managers (npm, pip, winget), to inspect the system, and for file work other tools don\'t cover: moving, copying, deleting, searching with Select-String. Servers and watchers never exit: start them with Start-Process -WindowStyle Hidden and send their output to a log file.',
  command: 'PowerShell code, several lines are fine',
  noGit: 'Error: Git is not installed on this computer. It can be installed with: winget install --id Git.Git -e --source winget',
 },
 darwin: {
  tool: 'run_zsh',
  about: 'Run a zsh script on the user\'s Mac. It starts in the project folder, is non-interactive (it can never wait for input) and returns the exit code with the combined output. Use it to run programs, scripts and tests, builds, package managers (npm, pip, brew), to inspect the system, and for file work other tools don\'t cover: moving, copying, deleting, searching with grep. Servers and watchers never exit: start them with nohup, send their output to a log file, and put them in the background with &.',
  command: 'Zsh script, several lines are fine',
  noGit: 'Error: Git is not installed. Install it with Homebrew: brew install git',
  installs: /\bbrew\b[^\n;|]*\s(install|uninstall|upgrade|remove)\b/,
 },
 linux: {
  tool: 'run_bash',
  about: 'Run a bash script on the user\'s Linux computer. It starts in the project folder, is non-interactive (it can never wait for input) and returns the exit code with the combined output. Use it to run programs, scripts and tests, builds, package managers (npm, pip, apt, dnf), to inspect the system, and for file work other tools don\'t cover: moving, copying, deleting, searching with grep. Servers and watchers never exit: start them with nohup, send their output to a log file, and put them in the background with &.',
  command: 'Bash script, several lines are fine',
  noGit: 'Error: Git is not installed. Install it with the system package manager, for example: sudo apt install git',
  installs: /\b(apt|apt-get|dnf|yum|pacman|zypper)\b[^\n;|]*\s(install|remove|purge|upgrade|dist-upgrade)\b/,
 },
};
const SHELL = SHELLS[window.openghost?.platform] || SHELLS.win32;
const WINDOWS = SHELL === SHELLS.win32;

const fn = (name, description, properties, required = []) => ({
 type: 'function',
 function: { name, description, parameters: { type: 'object', properties, required } },
});

// Commands and file changes say in plain words what they do: that sentence heads the card the user answers.
const PURPOSE = what => ({ type: 'string', description: `What this ${what} does, as one short plain sentence in the user's language for someone who can't read code, e.g. "See which files are in the Downloads folder". The user reads it when asked to allow it.` });

const SCHEMAS = [
 fn(SHELL.tool, SHELL.about, {
  command: { type: 'string', description: SHELL.command },
  description: PURPOSE('command'),
  timeout: { type: 'integer', description: 'Seconds before the command is stopped, 120 by default, 900 at most' },
 }, ['command', 'description']),
 fn('read_file', 'Read a text file or the text of a PDF, or look at an image: PNG, JPEG, WebP, GIF, BMP, ICO and AVIF files come back as a picture you can see. Text comes as up to 2000 lines; for longer files pass offset (first line, starting at 1) and limit.', {
  path: { type: 'string', description: 'File path, relative to the project folder or absolute' },
  offset: { type: 'integer', description: 'First line to read, starting at 1' },
  limit: { type: 'integer', description: 'How many lines to read' },
 }, ['path']),
 fn('pdf_pages', 'Look at pages of a PDF as pictures. The text of a PDF does not carry its photos, charts, drawings, formulas, the layout of its tables, scanned pages or handwriting: they are only there to be seen. One call shows up to 6 pages.', {
  path: { type: 'string', description: 'PDF file, relative to the project folder or absolute' },
  pages: { type: 'string', description: 'Which pages, counted from 1: "3", "1-4" or "2, 5, 9"' },
 }, ['path', 'pages']),
 fn('write_file', 'Create a file or replace all of its content. Missing folders are created. To change part of an existing file use edit_file.', {
  path: { type: 'string', description: 'File path, relative to the project folder or absolute' },
  content: { type: 'string', description: 'The complete new content of the file' },
  description: PURPOSE('file'),
 }, ['path', 'content']),
 fn('edit_file', 'Replace an exact piece of text in an existing file. old_string must match the file exactly, including spaces and indentation, and be unique in it unless replace_all is true. Read the file before editing it.', {
  path: { type: 'string', description: 'File path, relative to the project folder or absolute' },
  old_string: { type: 'string', description: 'The exact text to replace' },
  new_string: { type: 'string', description: 'The text to put instead' },
  replace_all: { type: 'boolean', description: 'Replace every occurrence instead of exactly one' },
  description: PURPOSE('change'),
 }, ['path', 'old_string', 'new_string']),
 fn('video_frames', 'Look inside a video: takes still frames from it and shows them to you as pictures, with the duration, the resolution and whether there is sound. Frames are spread evenly over the whole video or over start to end, or taken at exact times. The built-in decoder reads mp4, mov, webm and mkv with H.264, VP8, VP9 or AV1. Start with a few frames over the whole video, then look closer at the moments that matter. To split a video into image files, pass save_to.', {
  path: { type: 'string', description: 'Video file, relative to the project folder or absolute' },
  count: { type: 'integer', description: 'How many frames, 8 by default. You see at most 24; with save_to up to 600 are saved' },
  start: { type: 'number', description: 'Start of the part to look at, in seconds' },
  end: { type: 'number', description: 'End of the part to look at, in seconds' },
  times: { type: 'array', items: { type: 'number' }, description: 'Exact moments in seconds, instead of count' },
  save_to: { type: 'string', description: 'Folder to save the frames into as full-size PNG files' },
 }, ['path']),
 fn('list_files', 'Show files and folders as a tree with sizes. Heavy folders like node_modules and .git are listed but not expanded.', {
  path: { type: 'string', description: 'Folder to list, the project folder by default' },
  depth: { type: 'integer', description: 'How many levels deep, 2 by default, 6 at most' },
 }),
 fn('git', 'Run git in the project folder with the given arguments, for example ["status"], ["init"], ["add", "-A"], ["commit", "-m", "Add CSV parser"], ["log", "--oneline", "-10"], ["diff"]. The repository is local.', {
  args: { type: 'array', items: { type: 'string' }, description: 'Arguments after the word git, one per item' },
  description: PURPOSE('git command'),
 }, ['args', 'description']),
 fn('web_search', 'Search the internet. Returns titles, links and short snippets of the top results.', {
  query: { type: 'string', description: 'What to search for' },
 }, ['query']),
 fn('fetch_url', 'Open a web page or an API address and return its readable text: HTML turns into plain text with headings, lists and links, JSON and text come as they are. Long pages come in parts, pass start to read further.', {
  url: { type: 'string', description: 'Full http or https address' },
  start: { type: 'integer', description: 'Character to start from when reading a long page further' },
 }, ['url']),
 fn('find_media', 'Find pictures or videos on the internet to show in the answer: a dish, a place, a game, a product, someone\'s work, how a thing is done. For each one it returns a ready line of Markdown to copy into the answer: a picture with the page it is from, or a link to a YouTube video with its name, author and length. The app shows such lines as pictures to leaf through and as video cards with previews.', {
  query: { type: 'string', description: 'What to look for, in the language it is found best in' },
  kind: { type: 'string', enum: ['pictures', 'videos'], description: 'pictures by default' },
  count: { type: 'integer', description: 'How many to return, 6 by default, 12 at most' },
 }, ['query']),
 fn('browser_navigate', 'Open a page in the built-in browser, the panel on the right of the app where the user\'s own logins live. Returns a snapshot of the screen: text, and the elements you can use, each with a [number].', {
  url: { type: 'string', description: 'An address (https://example.com or example.com), a local file path, words to search on Google, or back, forward, reload' },
 }, ['url']),
 fn('browser_snapshot', 'Describe what the page in the built-in browser shows right now: text, and the elements you can use with their [numbers]. Only what is on screen, unless full is true.', {
  full: { type: 'boolean', description: 'Cover the whole page, not only the visible part' },
 }),
 fn('browser_click', 'Click in the built-in browser like a person with a mouse: pass ref, the [number] from the latest snapshot, or x and y in page pixels read from a screenshot. Returns the new snapshot.', {
  ref: { type: 'integer', description: 'Element [number] from the latest snapshot' },
  x: { type: 'number', description: 'Horizontal position in page pixels, instead of ref' },
  y: { type: 'number', description: 'Vertical position in page pixels, instead of ref' },
  double: { type: 'boolean', description: 'Double click' },
 }),
 fn('browser_type', 'Type into a field in the built-in browser: clicks field ref, replaces its text and types like a keyboard. submit true presses Enter after. Without ref it types where the focus is.', {
  ref: { type: 'integer', description: 'Field [number] from the latest snapshot' },
  text: { type: 'string', description: 'What to type' },
  submit: { type: 'boolean', description: 'Press Enter after typing' },
  clear: { type: 'boolean', description: 'false keeps the text already in the field and adds to it' },
 }, ['text']),
 fn('browser_select', 'Choose an option of a dropdown list (a select element) in the built-in browser by its visible text or value. Menus built from other elements are opened with a click and chosen with a click.', {
  ref: { type: 'integer', description: 'The list [number] from the latest snapshot' },
  option: { type: 'string', description: 'Option text or value' },
 }, ['ref', 'option']),
 fn('browser_press', 'Press a key or a combination in the built-in browser: Enter, Escape, Tab, Backspace, Delete, Space, ArrowDown, PageDown, Home, End, Control+A, Shift+Tab and so on.', {
  key: { type: 'string', description: 'Key name or combination' },
  times: { type: 'integer', description: 'How many times, 1 by default' },
 }, ['key']),
 fn('browser_scroll', 'Scroll the page in the built-in browser down or up by a share of the screen, or bring element ref into view. Returns the new snapshot.', {
  direction: { type: 'string', enum: ['down', 'up'], description: 'down by default' },
  amount: { type: 'number', description: 'How many screens, 0.8 by default' },
  ref: { type: 'integer', description: 'Scroll this element into view instead' },
 }),
 fn('browser_screenshot', 'Look at the page in the built-in browser yourself: returns a picture of the screen, or of the page from the top with full_page. Use it when layout, images, colors, charts or the look of a site you build matter, or when the snapshot is not enough.', {
  full_page: { type: 'boolean', description: 'The page from the top, up to four screens tall' },
 }),
 fn('browser_read', 'Read the whole text of the page open in the built-in browser, with headings, lists and links, as the user sees it: signed in and after scripts ran. Long pages come in parts, pass start to read further.', {
  start: { type: 'integer', description: 'Character to start from when reading further' },
 }),
 fn('browser_wait', 'Wait in the built-in browser until some text appears on the page, or for a number of seconds, then return the snapshot.', {
  text: { type: 'string', description: 'Text to wait for' },
  seconds: { type: 'number', description: 'How long to wait at most, 15 by default with text' },
 }),
 fn('browser_tabs', 'Tabs of the built-in browser: list them, open a new one (with url to load a page in it), switch to tab n or close it. The other browser tools act on the active tab.', {
  action: { type: 'string', enum: ['list', 'new', 'switch', 'close'] },
  url: { type: 'string', description: 'For new: what to open in it' },
  tab: { type: 'integer', description: 'For switch and close: the tab number from the list' },
 }, ['action']),
 fn('memory', 'What you remember about the user across all chats; what it holds comes in a note from the app. save: write a new record, when nothing there is about the same thing. update: write the record with this id anew, so that it says what it said and what is new together, or the new instead of what has changed. forget: remove the record with this id.', {
  action: { type: 'string', enum: ['save', 'update', 'forget'] },
  id: { type: 'string', description: 'For update and forget: the id of the record, like m3' },
  text: { type: 'string', description: 'For save and update: the whole record, one or two plain sentences about the user in their language, clear on their own a year from now' },
 }, ['action']),
 fn('notepad', 'The user\'s notepad beside this chat; what is in it comes in a note from the app. remind: bring a note up when its moment has come. The app shows it to the user as a card in the chat; then ask whether to do it now and wait for their yes. done: tick a note off once the user has agreed and it is done, or once they say it no longer matters. add: write a note down when the user asks you to remember something or to remind them of it later.', {
  action: { type: 'string', enum: ['remind', 'done', 'add'] },
  id: { type: 'string', description: 'For remind and done: the id of the note, like n3' },
  text: { type: 'string', description: 'For add: the note, one short line in the user\'s own words and language' },
 }, ['action']),
];

const BROWSER_FREE = new Set(['browser_snapshot', 'browser_screenshot', 'browser_read', 'browser_wait', 'browser_scroll']);
const RISKY_CLICK = /\b(buy|purchase|order|checkout|check out|pay|payment|subscribe|donate|send|post|tweet|reply|publish|delete|remove|confirm|transfer|withdraw|book|reserve|sign up|register|unfollow|block|report)\b|купить|оплат|заказ|оформит|отправ|опубликов|удал|подтверд|перевест|подписа|заброн|зарегистр|пожертв/i;
// What the refs of the latest snapshot stand for, for each agent that looks at pages: the chat's, and one that works in a
// tab of its own (a mini chat's).
const MAIN = {};
const seen = new Map();
const refsOf = apart => seen.get(apart || MAIN) || {};

const READ_GIT = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'blame', 'shortlog', 'describe', 'grep', 'help', 'version']);
const LIST_GIT = { branch: /^(-a|-r|-v|-vv|--list|--all|--show-current|--no-color)$/, remote: /^(-v|--verbose)$/, tag: /^(-l|--list)$/ };
const RISKY_GIT = /^(push|pull|clean|rebase|filter-branch|filter-repo|gc|prune|update-ref|reflog|restore)$/;
const RISKY_SHELL = WINDOWS ? [
 /\b(Remove-Item|rm|rmdir|rd|del|erase|ri|Clear-Content|Clear-Item)\b/i,
 /\b(Format-Volume|Format-Disk|Clear-Disk|Initialize-Disk|diskpart|bcdedit|cipher)\b/i,
 /\b(Stop-Computer|Restart-Computer|shutdown|logoff)\b/i,
 /\b(Stop-Process|spps|kill|taskkill|Stop-Service|Set-Service|sc\.exe)\b/i,
 /\b(Set-ExecutionPolicy|New-ItemProperty|Set-ItemProperty|Remove-ItemProperty|reg(\.exe)?\s+(add|delete|import|load))\b/i,
 /\b(HKLM|HKCU|HKCR|Registry)::?/i,
 /\b(winget|choco|scoop)\s+(install|uninstall|upgrade|remove)\b/i,
 /\b(npm|pnpm|yarn)\s+(i|install|add|remove|uninstall)\b[^\n;|]*\s(-g|--global)\b/i,
 /\bpip3?\s+(install|uninstall)\b[^\n;|]*--user\b/i,
 /-Verb\s+RunAs\b/i,
 /\b(Invoke-Expression|iex)\b/i,
 /\b(Set-Acl|icacls|takeown|attrib)\b/i,
 /\b(netsh|New-NetFirewallRule|Set-NetFirewallProfile|Disable-|Enable-WindowsOptionalFeature)\b/i,
 /\bgit\s+(push|pull|clean|rebase|reset\s+--hard|checkout\s+(--|-f|\.)|restore|filter-branch)\b/i,
 /\b(Send-MailMessage|New-PSSession|Enter-PSSession|Invoke-Command)\b/i,
] : [
 /\brm\b/, /\bshred\b/, /\bmkfs\b/, /\bdd\b/, /\bshutdown\b/, /\breboot\b/, /\bhalt\b/, /\bpoweroff\b/,
 /\bsudo\b/, /\bsu\b/, /\bkill\b/, /\bkillall\b/, /\bpkill\b/, /\bsystemctl\b/, /\bservice\b/,
 SHELL.installs,
 /\b(npm|pnpm|yarn)\s+(i|install|add|remove|uninstall)\b[^\n;|]*\s(-g|--global)\b/,
 /\bpip3?\s+(install|uninstall)\b[^\n;|]*--user\b/,
 /\b(chmod|chown)\b/, /\b(ufw|iptables|nft)\b/,
 /\bgit\s+(push|pull|clean|rebase|reset\s+--hard|checkout\s+(--|-f|\.)|restore|filter-branch)\b/,
 /\b(curl|wget)\b[^\n|]*\|\s*(ba)?sh\b/,
];
const OUTSIDE_SHELL = WINDOWS
 ? [/(^|[^\w.])\.\.[\\/]/, /\$env:(USERPROFILE|HOMEPATH|APPDATA|LOCALAPPDATA|ProgramData|ProgramFiles|windir|SystemRoot|SystemDrive|OneDrive|PUBLIC)/i, /\$HOME\b/i, /(^|[\s'"(=,])~[\\/]/, /(^|[\s'"(=,])\\\\[\w.$-]+\\/]
 : [/(^|[^\w.])\.\.\//, /\$HOME\b/, /(^|[\s'"(=,])~\//, /(^|[\s'"(=,])\/(etc|usr|bin|sbin|boot|root|proc|sys|dev)\b/];
const ABSOLUTE = WINDOWS ? /(?:^|[\s'"(=,;|@])([a-zA-Z]:[\\/][^\s'"|;,)<>`]*)/g : /(?:^|[\s'"(=,;|@])(\/(?:[^\s'"|;,)<>`]|\\ )*)/g;

// Windows paths ignore case and take either slash; elsewhere they keep their case and use /.
const PATHS = WINDOWS ? {
 sep: '\\', split: /[\\/]+/, home: /^~([\\/]|$)/, here: /^\.[\\/]/, trailing: /[\\/]+$/,
 norm: path => path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase(),
 absolute: path => /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\'),
 part: part => part.toLowerCase(),
 key: path => path.toLowerCase(),
} : {
 sep: '/', split: /\/+/, home: /^~(\/|$)/, here: /^\.\//, trailing: /(?<=.)[\\/]+$/,
 norm: path => path.replace(/\\/g, '/').replace(/\/+$/, ''),
 absolute: path => path.startsWith('/'),
 part: part => part,
 key: path => path,
};
const norm = PATHS.norm;

function resolve(cwd, path) {
 const raw = String(path ?? '.').trim() || '.';
 if (PATHS.absolute(raw)) return raw;
 if (PATHS.home.test(raw)) return null;
 const parts = norm(cwd).split(PATHS.sep);
 for (const part of raw.split(PATHS.split)) {
  if (!part || part === '.') continue;
  if (part === '..') parts.pop();
  else parts.push(PATHS.part(part));
 }
 return parts.join(PATHS.sep);
}

function inside(cwd, path) {
 const full = resolve(cwd, path);
 if (!full || !cwd) return false;
 const root = norm(cwd), target = norm(full);
 return target === root || target.startsWith(`${root}${PATHS.sep}`);
}

function gitArgs(args) {
 if (typeof args === 'string') args = args.split(/\s+/).filter(Boolean);
 if (!Array.isArray(args)) return [];
 return args[0] === 'git' ? args.slice(1) : args;
}

function readOnlyGit(args) {
 const [command, ...rest] = gitArgs(args);
 if (READ_GIT.has(command)) return true;
 if (command === 'stash') return rest[0] === 'list' || rest[0] === 'show';
 const list = LIST_GIT[command];
 return !!list && rest.every(arg => list.test(arg));
}

function riskyGit(args) {
 const [command, ...rest] = gitArgs(args);
 if (RISKY_GIT.test(command || '')) return true;
 if (command === 'reset') return rest.includes('--hard') || rest.includes('--merge');
 if (command === 'checkout') return rest.some(arg => arg === '--' || arg === '-f' || arg === '--force' || arg === '.');
 if (command === 'branch') return rest.some(arg => /^(-D|--delete|-d|--force|-f|-M)$/.test(arg));
 if (command === 'stash') return /^(drop|clear)$/.test(rest[0] || '');
 if (command === 'tag') return rest.some(arg => /^(-d|--delete|-f|--force)$/.test(arg));
 return rest.some(arg => arg === '--force' || arg === '-f');
}

function riskyShell(command, cwd) {
 const text = String(command || '');
 if (RISKY_SHELL.some(re => re.test(text))) return true;
 if (OUTSIDE_SHELL.some(re => re.test(text))) return true;
 for (const match of text.matchAll(ABSOLUTE)) if (!inside(cwd, match[1])) return true;
 return false;
}

// What a step does, as the card shows it. The app tells it from the step itself, never from the agent's own words,
// so a harmless-sounding description can't hide a deletion; the strongest effect found wins. A command counts as
// only reading when every command in it only looks; a program, a method call or anything unknown counts as running something.
const SHELL_EFFECTS = [
 ['delete', new Set(['remove-item', 'clear-content', 'clear-item', 'clear-recyclebin', 'rm', 'rmdir', 'rd', 'del', 'erase', 'ri']), null],
 ['system', new Set(['format-volume', 'format-disk', 'clear-disk', 'initialize-disk', 'diskpart', 'bcdedit', 'stop-computer', 'restart-computer', 'shutdown', 'logoff', 'stop-process', 'spps', 'kill', 'taskkill', 'stop-service', 'start-service', 'restart-service', 'set-service', 'sc.exe', 'set-executionpolicy', 'new-itemproperty', 'set-itemproperty', 'remove-itemproperty', 'set-acl', 'icacls', 'takeown', 'attrib', 'netsh', 'setx', 'new-netfirewallrule', 'set-netfirewallprofile', 'enable-windowsoptionalfeature', 'disable-windowsoptionalfeature']),
  /\breg(\.exe)?\s+(add|delete|import|load)\b|\b(HKLM|HKCU|HKCR|Registry)::?|-Verb\s+RunAs\b/i],
 ['install', new Set(['install-module', 'install-package', 'install-script', 'uninstall-module', 'uninstall-package', 'update-module']),
  /\b(winget|choco|scoop)\s+(install|uninstall|upgrade|remove)\b|\b(npm|pnpm|yarn|bun)\s+(i|install|add|remove|uninstall|ci|update)\b|\bpip3?\s+(install|uninstall)\b/i],
 ['change', new Set(['set-content', 'add-content', 'out-file', 'new-item', 'set-item', 'copy-item', 'move-item', 'rename-item', 'expand-archive', 'compress-archive', 'export-csv', 'export-clixml', 'tee-object', 'mkdir', 'md', 'ni', 'cpi', 'copy', 'cp', 'mi', 'move', 'mv', 'ren', 'rni', 'sc', 'ac', 'tee']),
  /(^|[^-=<>2*])>>?\s*(?!&|\$null\b)\S/],
 ['online', new Set(['invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm', 'curl', 'wget', 'start-bitstransfer', 'test-netconnection', 'test-connection', 'ping', 'resolve-dnsname', 'send-mailmessage']),
  /\bgit\s+(clone|fetch|pull|push)\b/i],
];
const READ_COMMAND = /^(get|select|sort|format|measure|where|group|test|resolve|split|join|compare|convertto|convertfrom|find)-\w+$|^(out-string|out-host|write-output|write-host|foreach-object|set-location|push-location|pop-location|start-sleep)$/;
const READ_WORDS = new Set(['ls', 'dir', 'gci', 'cat', 'type', 'gc', 'gi', 'gp', 'gm', 'sls', 'ft', 'fl', 'fw', 'select', 'sort', 'where', 'measure', 'group', 'compare', 'echo', 'write', 'pwd', 'cd', 'chdir', 'sl', 'foreach', 'if', 'else', 'elseif', 'switch', 'for', 'while', 'do', 'try', 'catch', 'finally', 'return', 'param', 'begin', 'process', 'end']);
const FILE_COMMANDS = new Set([...SHELL_EFFECTS[0][1], ...SHELL_EFFECTS[3][1], 'get-childitem', 'get-content', 'get-item', 'ls', 'dir', 'gci', 'cat', 'type', 'gc', 'gi', 'test-path', 'invoke-item', 'ii', 'start-process', 'start']);
const PATH_PARAMS = /^-(path|literalpath|destination|outfile|filepath|target|workingdirectory)$/i;
const HOME = WINDOWS ? /^(\$HOME|\$env:USERPROFILE|~)(?=[\\/]|$)/i : /^(\$HOME|\$\{HOME\}|~)(?=\/|$)/;

// Statements and pipeline stages, script blocks and subexpressions included, split outside of quotes.
function segments(code) {
 const parts = [];
 let part = '', quote = '';
 for (let i = 0; i < code.length; i++) {
  const c = code[i];
  if (quote) {
   part += c;
   if (c === '`' && quote === '"') part += code[++i] ?? '';
   else if (c === quote) quote = '';
  } else if (c === '"' || c === "'") {
   quote = c;
   part += c;
  } else if ('|;\n{}()'.includes(c) || (c === '&' && code[i + 1] === '&')) {
   parts.push(part);
   part = '';
  } else part += c;
 }
 parts.push(part);
 return parts.map(item => item.trim().replace(/^(\$[\w:.]+\s*=\s*)+/, '').replace(/^[&.]\s*/, '')).filter(Boolean);
}

function tokens(segment) {
 return [...segment.matchAll(/"((?:[^"`]|`.)*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3]);
}

function shellEffect(code) {
 const parts = segments(code), words = parts.map(part => part.split(/\s+/)[0].toLowerCase());
 const text = code.replace(/'[^']*'|"(?:[^"`]|`.)*"/g, '""');
 for (const [effect, commands, pattern] of SHELL_EFFECTS) if (words.some(word => commands.has(word)) || pattern?.test(text)) return effect;
 const reads = words.every(word => /^[$\d-]/.test(word) ? !/\.\w+$/.test(word) : READ_COMMAND.test(word) || READ_WORDS.has(word));
 return parts.length && reads && !/::/.test(text) ? 'read' : 'run';
}

// The places a command reaches: paths handed to file commands, files it writes with > and anything under
// the home folder or given in full. Variables and registry keys aren't places a person would recognise.
function shellTargets(code, cwd) {
 const found = [];
 for (const part of segments(code)) {
  const [command, ...rest] = tokens(part), file = FILE_COMMANDS.has(String(command).toLowerCase());
  let positional = file;
  for (let i = 0; i < rest.length; i++) {
   const arg = rest[i];
   if (PATH_PARAMS.test(arg)) { found.push(rest[++i]); continue; }
   const redirect = /^\d?>>?(.*)$/.exec(arg);
   if (redirect) { found.push(redirect[1] || rest[++i]); continue; }
   if (arg.startsWith('-')) { positional = positional && !/^-(filter|include|exclude|pattern|encoding|value|itemtype|name|newname|argumentlist)$/i.test(arg); continue; }
   if (positional || HOME.test(arg) || /^[a-zA-Z]:[\\/]/.test(arg)) found.push(arg);
   positional = false;
  }
 }
 const places = found.filter(path => path && !/^\$(?!HOME\b|env:USERPROFILE\b)|^(HK\w+|Registry)::?/i.test(path)).map(path => place(path, cwd));
 return distinct(places);
}

// bash and zsh on a Mac and on Linux. A line's command is found past sudo, env, nohup, xargs and the like; find -exec and
// sh -c count for the command they run, git counts the way the git tool does, and a heredoc's text is data, not commands.
const POSIX_EFFECTS = [
 ['delete', ['rm', 'rmdir', 'unlink', 'shred', 'srm', 'trash'], [/\bfind\b[^\n;|&]*\s-delete\b/, /\brsync\b[^\n;|&]*\s--delete/]],
 ['system', ['sudo', 'doas', 'su', 'shutdown', 'reboot', 'halt', 'poweroff', 'kill', 'killall', 'pkill', 'dd', 'fdisk', 'sfdisk', 'parted', 'mkswap', 'swapon', 'swapoff', 'umount', 'passwd', 'useradd', 'userdel', 'usermod', 'groupadd', 'groupdel', 'visudo', 'update-alternatives', 'ldconfig', 'modprobe', 'insmod', 'rmmod', 'csrutil', 'spctl', 'tmutil', 'hostnamectl', 'timedatectl'], [
  /\bmkfs(\.\w+)?\b/,
  /\b(systemctl|launchctl)\s+(-{1,2}\S+\s+)*(start|stop|restart|reload|enable|disable|mask|unmask|kill|daemon-reload|set-default|isolate|load|unload|bootstrap|bootout|kickstart|remove|submit)\b/,
  /\bservice\s+\S+\s+(start|stop|restart|reload|force-reload)\b/,
  /\bdefaults\s+(-\S+\s+)*(write|delete|import|rename)\b/,
  /\bcrontab\s+(?!-l\b)[^\s|;&]/,
  /\bsysctl\s+(-w|--write)\b/,
  /\bdiskutil\s+(?!list\b|info\b|activity\b)\w/,
  /\bnetworksetup\s+-set/,
  /\bpmset\s+(?!-g\b)[^\s|;&]/,
  /\bscutil\s+--set\b/,
  /\bnvram\s+(-d|-c|\S+=)/,
  /\bufw\s+(?!status\b)\w/,
  /\b(iptables|ip6tables)\s+(\S+\s+)*-[ADIFXNPRZ]\b/,
  /\bnft\s+(add|delete|flush|insert|replace|create|destroy)\b/,
  /\bfirewall-cmd\s+(?!--(list|state|get|query))\S/,
  /\bmount\s+[^\s|;&]/,
  /\bip\s+(-\S+\s+)*(link|addr|address|route|rule|neigh)\s+(add|del|delete|set|flush|change|replace)\b/,
  /\bifconfig\s+\S+\s+(up|down|inet6?|alias|-alias|mtu|ether|lladdr)\b/,
 ]],
 ['install', [], [
  /\bbrew\s+(-\S+\s+)*(install|uninstall|reinstall|upgrade|remove|rm|tap|untap|link|unlink)\b/,
  /\b(apt|apt-get|aptitude)\s+(-\S+\s+)*(install|reinstall|remove|purge|upgrade|full-upgrade|dist-upgrade|autoremove)\b/,
  /\b(dnf|yum|microdnf)\s+(-\S+\s+)*(install|reinstall|remove|erase|upgrade|update|downgrade|autoremove)\b/,
  /\bzypper\s+(-\S+\s+)*(install|in|remove|rm|update|up|dist-upgrade|dup)\b/,
  /\b(pacman|yay|paru)\s+-[A-Za-z]*[SRU]/,
  /\bapk\s+(add|del|upgrade)\b/,
  /\b(snap|flatpak)\s+(install|remove|uninstall|refresh|update)\b/,
  /\bport\s+(install|uninstall|upgrade)\b/,
  /\bsoftwareupdate\s+(\S+\s+)*(-i|--install|-a|--all)\b/,
  /\b(npm|pnpm|yarn|bun)\s+(i|install|add|remove|uninstall|ci|update)\b/,
  /\b(pip3?|pipx)\s+(install|uninstall)\b|\bpython3?\s+-m\s+pip\s+(install|uninstall)\b/,
  /\buv\s+(pip\s+(install|uninstall)|add|remove|sync|tool\s+install)\b/,
  /\b(gem|cargo)\s+(install|uninstall)\b|\bgo\s+install\b/,
  /\b(conda|mamba|micromamba)\s+(install|remove|update|create)\b|\bpoetry\s+(add|remove|install)\b/,
  /\b(curl|wget)\b[^\n;|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/,
 ]],
 ['change', ['cp', 'mv', 'mkdir', 'touch', 'ln', 'tee', 'install', 'rsync', 'truncate', 'unzip', 'zip', 'gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz', 'unxz', 'zstd', 'unzstd', '7z', 'patch', 'split', 'csplit', 'ditto', 'rename', 'mktemp', 'chmod', 'chown', 'chgrp', 'chflags', 'chattr', 'setfacl', 'xattr'], [
  /(^|[^<>&\d])(\d*|&)>>?\|?\s*(?!&|\/dev\/(null|stdout|stderr|tty)\b|\()[^\s;|&<>]/,
  /\bsed\b[^\n;|&]*\s(-[a-zA-Z]*i|--in-place)/,
  /\bperl\s+-[a-zA-Z]*i/,
  /\btar\s+(-{0,2}[a-zA-Z]*[cxru]|[^\n;|&]*\s-[a-zA-Z]*[cxru]|[^\n;|&]*\s--(create|extract|get|append|update)\b)/,
 ]],
 ['online', ['curl', 'wget', 'ssh', 'scp', 'sftp', 'ftp', 'lftp', 'mosh', 'nc', 'netcat', 'ncat', 'telnet', 'ping', 'ping6', 'dig', 'nslookup', 'host', 'whois', 'traceroute', 'tracepath', 'mtr', 'http', 'https', 'aria2c', 'gh'], [
  /\b(npm|pnpm|yarn)\s+publish\b|\bdocker\s+(pull|push|login)\b/,
 ]],
].map(([effect, commands, patterns]) => [effect, new Set(commands), patterns]);
const POSIX_RANK = ['delete', 'system', 'install', 'change', 'online', 'record', 'run', 'read'];
const POSIX_READS = new Set(['ls', 'll', 'la', 'l', 'dir', 'vdir', 'cat', 'bat', 'batcat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'zgrep', 'rg', 'ag', 'ack', 'find', 'fd', 'fdfind', 'locate', 'mdfind', 'mdls', 'wc', 'echo', 'printf', 'print', 'pwd', 'cd', 'pushd', 'popd', 'dirs', 'stat', 'file', 'du', 'df', 'which', 'whereis', 'type', 'hash', 'command', 'whoami', 'id', 'groups', 'users', 'who', 'w', 'last', 'uname', 'hostname', 'arch', 'sw_vers', 'lsb_release', 'date', 'cal', 'uptime', 'env', 'printenv', 'export', 'set', 'unset', 'local', 'declare', 'typeset', 'readonly', 'alias', 'unalias', 'shopt', 'setopt', 'read', 'sort', 'uniq', 'cut', 'tr', 'awk', 'gawk', 'mawk', 'sed', 'column', 'nl', 'fold', 'fmt', 'paste', 'join', 'comm', 'diff', 'cmp', 'colordiff', 'tree', 'realpath', 'readlink', 'dirname', 'basename', 'test', '[', '[[', ']', ']]', 'true', 'false', ':', 'sleep', 'wait', 'ps', 'pgrep', 'pidof', 'lsof', 'top', 'htop', 'free', 'vm_stat', 'iostat', 'vmstat', 'jq', 'yq', 'xxd', 'hexdump', 'od', 'strings', 'md5', 'md5sum', 'shasum', 'sha1sum', 'sha256sum', 'sha512sum', 'cksum', 'b2sum', 'seq', 'history', 'man', 'help', 'info', 'apropos', 'whatis', 'tty', 'locale', 'getconf', 'nproc', 'lscpu', 'lsblk', 'lsusb', 'lspci', 'ioreg', 'system_profiler', 'sysctl', 'defaults', 'systemctl', 'launchctl', 'service', 'crontab', 'diskutil', 'networksetup', 'pmset', 'scutil', 'nvram', 'ufw', 'iptables', 'ip6tables', 'nft', 'firewall-cmd', 'mount', 'ip', 'ifconfig', 'netstat', 'ss', 'tar', 'clear', 'tput', 'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'in', 'function', 'return', 'exit', 'break', 'continue', 'select']);
// Commands whose arguments are places, and what their options take.
const POSIX_FILES = new Set(['rm', 'rmdir', 'unlink', 'shred', 'srm', 'trash', 'cp', 'mv', 'mkdir', 'touch', 'ln', 'tee', 'install', 'rsync', 'scp', 'truncate', 'tar', 'unzip', 'zip', 'gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz', 'unxz', 'zstd', 'unzstd', '7z', 'split', 'ditto', 'chmod', 'chown', 'chgrp', 'chflags', 'chattr', 'xattr', 'cat', 'bat', 'batcat', 'head', 'tail', 'less', 'more', 'ls', 'll', 'la', 'stat', 'file', 'du', 'tree', 'wc', 'diff', 'cmp', 'md5', 'md5sum', 'shasum', 'sha256sum', 'realpath', 'readlink', 'open', 'xdg-open', 'grep', 'egrep', 'fgrep', 'zgrep', 'rg', 'ag', 'sed', 'awk', 'find', 'source', '.', 'python', 'python3', 'node', 'bash', 'sh', 'zsh', 'ruby', 'perl', 'php', 'gcc', 'g++', 'clang', 'clang++', 'cc', 'rustc']);
const POSIX_FIRST = new Set(['python', 'python3', 'node', 'bash', 'sh', 'zsh', 'ruby', 'perl', 'php', 'source', '.']);
const POSIX_LEADING = { chmod: 1, chown: 1, chgrp: 1, chflags: 1, grep: 1, egrep: 1, fgrep: 1, zgrep: 1, rg: 1, ag: 1, sed: 1, awk: 1 };
const GREP_VALUES = ['-e', '-f', '-m', '-A', '-B', '-C', '--regexp', '--file', '--max-count'];
const POSIX_VALUES = {
 head: ['-n', '-c'], tail: ['-n', '-c'], grep: GREP_VALUES, egrep: GREP_VALUES, fgrep: GREP_VALUES, zgrep: GREP_VALUES,
 rg: [...GREP_VALUES, '-g', '-t', '-T', '-j', '--glob', '--type'], ag: ['-A', '-B', '-C', '-G', '-m'],
 sed: ['-e', '-f', '--expression', '--file'], awk: ['-F', '-v', '-f'],
 cut: ['-d', '-f', '-c', '-b'], sort: ['-k', '-t', '-S'], du: ['-d', '-t', '-B'], ls: ['-I', '-w'], tree: ['-L', '-I', '-P'],
 mkdir: ['-m'], install: ['-m', '-o', '-g'], touch: ['-t', '-d'], split: ['-l', '-b', '-n', '-a'], unzip: ['-x'], zip: ['-x', '-i'],
 stat: ['-f', '-c', '--format'], diff: ['-U', '-C', '--label'], rsync: ['-e', '--exclude', '--include', '-f', '--filter'],
 tar: ['-b', '--exclude'], open: ['-a', '-b'], scp: ['-P', '-o', '-c', '-l'],
};
const POSIX_PATH_OPTIONS = {
 tar: ['-f', '-C', '-T', '-X', '--file', '--directory', '--files-from', '--exclude-from'], git: ['-C'], make: ['-C', '-f', '--directory', '--file'],
 unzip: ['-d'], wget: ['-O', '-P', '--output-document', '--directory-prefix'], curl: ['-o', '--output', '-T', '--upload-file'],
 cp: ['-t', '--target-directory'], mv: ['-t', '--target-directory'], ln: ['-t', '--target-directory'], install: ['-t', '--target-directory'],
 sort: ['-o', '--output'], touch: ['-r', '--reference'], gcc: ['-o'], 'g++': ['-o'], clang: ['-o'], 'clang++': ['-o'], cc: ['-o'], go: ['-o'], rustc: ['-o'],
 ssh: ['-i', '-F'], scp: ['-i', '-F'], sftp: ['-i', '-F'], pip: ['-r', '--requirement', '-t', '--target'], pip3: ['-r', '--requirement', '-t', '--target'],
 patch: ['-i', '-o', '-d', '--input', '--output', '--directory'], openssl: ['-in', '-out', '-keyout'], ffmpeg: ['-i'],
};
const POSIX_STOPS = { python: ['-c', '-m'], python3: ['-c', '-m'], node: ['-e', '-p', '--eval', '--print'], bash: ['-c'], sh: ['-c'], zsh: ['-c'], ruby: ['-e'], perl: ['-e'], php: ['-r'] };
// Words that lead to the command they run, with their options that take a value.
const POSIX_PREFIXES = {
 sudo: ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U'], doas: ['-u', '-C'], nohup: [], time: [], nice: ['-n'], ionice: ['-c', '-n', '-p'], exec: ['-a'],
 builtin: [], noglob: [], caffeinate: ['-t', '-w'], env: ['-u', '-C', '-S'], command: [], xargs: ['-n', '-I', '-P', '-L', '-s', '-d', '-E', '-a'],
 timeout: ['-s', '-k', '--signal', '--kill-after'], watch: ['-n', '-d'], stdbuf: ['-i', '-o', '-e'], unbuffer: [],
 if: [], then: [], else: [], elif: [], while: [], until: [], do: [], '!': [],
};
const REDIRECT = /^(\d*|&)(>>?|<<?<?|<>)[&|-]?$/;
const SHELL_NAMES = /^(ba|z|da|k)?sh$/;

// Commands and pipeline stages, split outside of quotes. A command substitution is a command of its own while the one
// around it goes on; heredoc text and comments are left out, also from the whole line kept as .text.
function posixSegments(code) {
 const parts = [], outer = [], heredocs = [], dropped = [];
 let part = '', quote = '';
 const cut = () => { parts.push(part); part = ''; };
 const open = close => { outer.push({ part, quote, close }); part = ''; quote = ''; };
 const shut = () => { const top = outer.pop(); cut(); part = `${top.part}""`; quote = top.quote; };
 const past = (from, close) => { const end = code.indexOf(close, from); return end < 0 ? code.length : end + close.length; };
 for (let i = 0; i < code.length; i++) {
  const c = code[i], next = code[i + 1] ?? '';
  if (quote === "'") { part += c; if (c === "'") quote = ''; continue; }
  if (c === '\\') { part += c + next; i++; continue; }
  if (c === '$' && next === '(' && code[i + 2] === '(') { const end = past(i + 3, '))'); part += code.slice(i, end); i = end - 1; continue; }
  if (c === '$' && next === '(') { i++; open(')'); continue; }
  if (c === '`') { if (outer.at(-1)?.close === '`') shut(); else open('`'); continue; }
  if (quote === '"') { part += c; if (c === '"') quote = ''; continue; }
  if (c === ')' && outer.at(-1)?.close === ')') { shut(); continue; }
  if (c === '"' || c === "'") { quote = c; part += c; continue; }
  if (c === '$' && next === '{') { const end = past(i + 2, '}'); part += code.slice(i, end); i = end - 1; continue; }
  if (c === '#' && (!part || /\s$/.test(part))) {
   const end = code.indexOf('\n', i), stop = end < 0 ? code.length : end;
   dropped.push([i, stop]);
   i = stop - 1;
   continue;
  }
  if (c === '<' && next === '<' && code[i + 2] !== '<') {
   const m = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|\\?([^\s;&|<>()]+))/.exec(code.slice(i, i + 200));
   if (m) { heredocs.push([m[2] ?? m[3] ?? m[4], !!m[1]]); part += m[0]; i += m[0].length - 1; continue; }
  }
  if (c === '\n') {
   cut();
   const from = i + 1;
   for (const [word, tabs] of heredocs.splice(0)) {
    for (;;) {
     const end = code.indexOf('\n', i + 1), line = code.slice(i + 1, end < 0 ? code.length : end);
     i = end < 0 ? code.length : end;
     if (end < 0 || (tabs ? line.replace(/^\t+/, '') : line).trimEnd() === word) break;
    }
   }
   if (i >= from) dropped.push([from, i]);
   continue;
  }
  if (c === ';' || c === '(' || c === ')') { cut(); continue; }
  if (c === '|') {
   if (part.endsWith('>')) part += c;
   else { cut(); if (next === '|' || next === '&') i++; }
   continue;
  }
  if (c === '&') {
   if (next === '&') { cut(); i++; }
   else if (next === '>' || /[<>]$/.test(part)) part += c;
   else cut();
   continue;
  }
  if ((c === '{' || c === '}') && (!part || /\s$/.test(part)) && (!next || /[\s;]/.test(next))) { cut(); continue; }
  part += c;
 }
 while (outer.length) shut();
 cut();
 const list = parts.map(item => item.trim()).filter(Boolean);
 list.text = dropped.reduceRight((text, [from, to]) => text.slice(0, from) + text.slice(to), code);
 return list;
}

// The words of a command with quotes and escapes resolved; redirections are words of their own.
function posixTokens(part) {
 const list = [];
 let token = '', has = false, quote = '';
 const flush = () => { if (has) list.push(token); token = ''; has = false; };
 for (let i = 0; i < part.length; i++) {
  const c = part[i];
  if (quote === "'") { if (c === "'") quote = ''; else token += c; continue; }
  if (quote === '"') {
   if (c === '"') quote = '';
   else if (c === '\\' && '"\\$`\n'.includes(part[i + 1] || 'x')) { i++; if (part[i] !== '\n') token += part[i]; }
   else token += c;
   continue;
  }
  if (c === '\\') { i++; if (i < part.length && part[i] !== '\n') { token += part[i]; has = true; } continue; }
  if (c === "'" || c === '"') { quote = c; has = true; continue; }
  if (/\s/.test(c)) { flush(); continue; }
  if (c === '<' || c === '>') {
   let op = has && /^(\d+|&)$/.test(token) ? token : '';
   if (op) { token = ''; has = false; } else flush();
   op += c;
   while ('<>'.includes(part[i + 1] || 'x') && op.length < 5) op += part[++i];
   if ('&|-'.includes(part[i + 1] || 'x')) op += part[++i];
   list.push(op);
   continue;
  }
  token += c;
  has = true;
 }
 flush();
 return list;
}

// The command a line runs, past assignments, redirections and words like sudo, env or xargs.
function posixCommand(tokens) {
 let k = 0, name = '';
 for (;;) {
  while (k < tokens.length && (REDIRECT.test(tokens[k]) || /^[A-Za-z_]\w*=/.test(tokens[k]))) k += REDIRECT.test(tokens[k]) ? 2 : 1;
  if (k >= tokens.length) return { name: name || ':', at: k };
  name = tokens[k].replace(/^.*\//, '');
  const values = POSIX_PREFIXES[name];
  if (!values || (name === 'command' && /^-[vV]$/.test(tokens[k + 1] || ''))) return { name: name.startsWith('-') ? ':' : name, at: k };
  k++;
  while (k < tokens.length && /^-./.test(tokens[k])) k += values.includes(tokens[k]) ? 2 : 1;
  if (name === 'timeout' && k < tokens.length) k++;
 }
}

// Git's own options come before its command; -C and -c take a value.
function gitCommand(args) {
 let k = 0;
 while (k < args.length && args[k].startsWith('-')) k += /^-[Cc]$/.test(args[k]) ? 2 : 1;
 return args.slice(k);
}

function posixEffect(code) {
 const parts = posixSegments(code), words = [], more = [];
 for (const part of parts) {
  const tokens = posixTokens(part), { name, at } = posixCommand(tokens), args = tokens.slice(at + 1);
  if (name === 'git') { more.push(gitEffect(gitCommand(args))); continue; }
  const inner = SHELL_NAMES.test(name) ? args.indexOf('-c') : -1;
  if (inner >= 0) { more.push(posixEffect(args[inner + 1] || '')); continue; }
  words.push(name);
  if (name === 'find') args.forEach((arg, k) => { if (/^-(exec|execdir|ok|okdir)$/.test(arg)) words.push(posixCommand(args.slice(k + 1)).name); });
 }
 const text = parts.text.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""');
 const found = POSIX_EFFECTS.find(([, commands, patterns]) => words.some(word => commands.has(word)) || patterns.some(re => re.test(text)));
 const own = found ? found[0] : parts.length && words.every(word => POSIX_READS.has(word)) ? 'read' : 'run';
 return more.reduce((best, effect) => POSIX_RANK.indexOf(effect) < POSIX_RANK.indexOf(best) ? effect : best, own);
}

// Paths a command reaches, as written: arguments of file commands, values of options that take a path, files written
// with > and anything under the home folder or given in full.
function posixPaths(code) {
 const found = [];
 for (const part of posixSegments(code)) {
  const tokens = posixTokens(part), { name, at } = posixCommand(tokens), command = tokens[at] || '';
  if (/^\.{1,2}\//.test(command) || HOME.test(command)) found.push(command);
  const paths = POSIX_PATH_OPTIONS[name] || [], values = POSIX_VALUES[name] || [], stops = POSIX_STOPS[name] || [];
  let collect = POSIX_FILES.has(name), leading = POSIX_LEADING[name] || 0, options = true;
  for (let k = at + 1; k < tokens.length; k++) {
   const arg = tokens[k];
   if (REDIRECT.test(arg)) {
    if (/^[^<]*>[>|]?$/.test(arg)) found.push(tokens[k + 1]);
    k++;
    continue;
   }
   if (options && /^-./.test(arg)) {
    if (arg === '--') { options = false; continue; }
    const eq = arg.indexOf('='), flag = eq > 0 ? arg.slice(0, eq) : arg, value = () => eq > 0 ? arg.slice(eq + 1) : tokens[++k];
    if (stops.includes(flag)) {
     const inner = value();
     if (flag === '-c' && SHELL_NAMES.test(name)) found.push(...posixPaths(inner || ''));
     collect = false;
    } else if (paths.includes(flag)) found.push(value());
    else if (values.includes(flag)) {
     value();
     if (/^-(e|f)$|^--(regexp|file|expression)$/.test(flag)) leading = 0;
    } else if (name === 'sed' && arg === '-i' && /^(\.\w*)?$/.test(tokens[k + 1] ?? 'x')) k++;
    else if (name === 'xattr' && /^-[a-z]*[dpw]/.test(arg)) leading = /w/.test(arg) ? 2 : 1;
    else if (name === 'find') collect = false;
    continue;
   }
   if (collect && leading > 0) { leading--; continue; }
   if (collect) { found.push(arg); if (POSIX_FIRST.has(name)) collect = false; continue; }
   if (HOME.test(arg) || /^\/./.test(arg)) found.push(arg);
  }
 }
 return found;
}

// Variables, devices, web and remote addresses and numbers aren't places a person would recognise.
function posixTargets(code, cwd) {
 const places = posixPaths(code)
  .filter(path => path && path !== '{}' && path !== '-' && !/^\d+$|^\/dev\/|:\/\/|^[\w.@-]+:/.test(path) && !/^\$(?!HOME\b|\{HOME\})/.test(path))
  .map(path => place(path, cwd));
 return distinct(places);
}

const commandEffect = WINDOWS ? shellEffect : posixEffect;
const commandPlaces = WINDOWS ? shellTargets : posixTargets;

// A path as a chip: named by its last part, with the whole path to hover over; the home folder and the project have
// names of their own, and a wildcard keeps the folder it looks in.
const partsOf = path => path.replace(HOME, '').split(/[\\/]/).filter(part => part && part !== '.');

function place(path, cwd) {
 const raw = String(path).replace(PATHS.trailing, ''), parts = partsOf(raw), last = parts.at(-1);
 const label = !last ? (HOME.test(raw) ? I18n.t('approve.home') : raw === '/' ? '/' : String(cwd || '').split(/[\\/]/).filter(Boolean).pop() || raw)
  : /[*?]/.test(last) && parts.length > 1 ? parts.slice(-2).join(PATHS.sep) : last;
 return { kind: /\.[\w*]{1,8}$/.test(last || '') ? 'file' : 'folder', label, title: raw };
}

// The same place once; two places that share a name are told apart by the folder they are in.
function distinct(places) {
 const list = [...new Map(places.map(item => [PATHS.key(item.title), item])).values()];
 const shared = new Set(list.map(item => item.label).filter((label, i, all) => all.indexOf(label) !== i));
 for (const item of list) {
  const parts = partsOf(item.title);
  if (shared.has(item.label) && parts.length > 1) item.label = parts.slice(-2).join(PATHS.sep);
 }
 return list;
}

// Git either talks to a server, throws work away, only records history (a commit touches no file of the user's),
// or changes the files in the folder, like switching branches or merging.
function gitEffect(args) {
 const [command = '', ...rest] = gitArgs(args);
 if (/^(push|pull|fetch|clone)$/.test(command)) return 'online';
 if (/^(clean|restore|rm)$/.test(command) || (command === 'reset' && rest.includes('--hard'))
  || (command === 'checkout' && rest.some(arg => arg === '--' || arg === '.'))
  || (command === 'branch' && rest.some(arg => /^(-D|-d|--delete)$/.test(arg))) || (command === 'stash' && /^(drop|clear)$/.test(rest[0] || ''))) return 'delete';
 if (readOnlyGit(args)) return 'read';
 return /^(add|commit|init|tag|branch|notes)$/.test(command) ? 'record' : 'change';
}

function host(url) {
 try { return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).host.replace(/^www\./, ''); } catch { return String(url); }
}

function browserApproval(name, args, ask, apart) {
 if (BROWSER_FREE.has(name)) return false;
 if (name === 'browser_tabs') return ask && args.action === 'new' && !!args.url;
 if (ask) return true;
 const target = refsOf(apart)[args.ref] || '';
 if (name === 'browser_click') return /^(button|link|clickable|menuitem|option)\b/.test(target) && RISKY_CLICK.test(target);
 return false;
}

// A video or a PDF the user attached to the chat is one they showed the agent themselves: looking at it needs no
// approval, wherever it lives. Each in its own way only: a video is watched, a PDF is read and its pages are looked at.
// Reading a video as a plain file still asks, as any file outside the project does.
function attachedFile(attached, cwd, path) {
 const full = resolve(cwd, path);
 return !!full && attached.some(item => norm(item) === norm(full));
}

// `attached`: what the user attached to the chat, as { videos, pdfs }; a plain list is a list of videos.
function needsApproval(name, args, { mode, cwd, attached = [], apart = null }) {
 if (mode === 'full') return false;
 const ask = mode !== 'auto';
 if (name.startsWith('browser_')) return browserApproval(name, args, ask, apart);
 const videos = Array.isArray(attached) ? attached : attached.videos || [], pdfs = Array.isArray(attached) ? [] : attached.pdfs || [];
 switch (name) {
  case 'read_file':
  case 'pdf_pages': return ask && !inside(cwd, args.path || '.') && !attachedFile(pdfs, cwd, args.path);
  case 'list_files': return ask && !inside(cwd, args.path || '.');
  case 'write_file':
  case 'edit_file': return ask || !inside(cwd, args.path);
  case 'video_frames': return (ask && !inside(cwd, args.path) && !attachedFile(videos, cwd, args.path)) || (!!args.save_to && (ask || !inside(cwd, args.save_to)));
  case SHELL.tool: return ask || riskyShell(args.command, cwd);
  case 'git': return !readOnlyGit(args.args) && (ask || riskyGit(args.args));
  case 'web_search':
  case 'find_media':
  case 'fetch_url': return ask;
  default: return true;
 }
}

function relative(cwd, path) {
 const raw = String(path ?? '.').trim() || '.';
 if (!PATHS.absolute(raw)) return raw.replace(PATHS.here, '');
 return inside(cwd, raw) ? raw.slice(norm(cwd).length).replace(/^[\\/]+/, '') || '.' : raw;
}

// What the card asking for approval shows: a headline in plain words (the agent's own sentence for commands and
// file changes), what the step does (`effect`, worked out by the app), the places it touches, and the technical
// details for whoever wants them.
function describe(name, args, cwd, apart = null) {
 const refs = refsOf(apart);
 const purpose = typeof args.description === 'string' ? args.description.trim() : '';
 const file = { kind: 'file', label: String(args.path || '').split(/[\\/]/).filter(Boolean).pop() || String(args.path || ''), title: relative(cwd, args.path || '.') };
 const site = url => ({ kind: 'site', label: host(url), title: url });
 switch (name) {
  case SHELL.tool: {
   const code = String(args.command || '');
   return { kind: 'command', title: purpose || I18n.t('approve.command'), effect: commandEffect(code), badge: true, places: commandPlaces(code, cwd), code, reveal: 'command' };
  }
  case 'git': return {
   kind: 'command', title: purpose || I18n.t('approve.git'), effect: gitEffect(args.args), badge: true, places: [],
   code: `git ${gitArgs(args.args).map(arg => /\s/.test(arg) ? `"${arg}"` : arg).join(' ')}`, reveal: 'command',
  };
  case 'write_file': return { kind: 'file', title: purpose || I18n.t('approve.write'), effect: 'change', places: [file], added: String(args.content || ''), reveal: 'content' };
  case 'edit_file': return { kind: 'file', title: purpose || I18n.t('approve.edit'), effect: 'change', places: [file], removed: String(args.old_string || ''), added: String(args.new_string || ''), reveal: 'changes' };
  case 'read_file': return { kind: 'file', title: I18n.t('approve.read'), effect: 'read', places: [file] };
  case 'pdf_pages': return { kind: 'file', title: I18n.t('approve.pdf'), effect: 'read', places: [file] };
  case 'list_files': return { kind: 'file', title: I18n.t('approve.list'), effect: 'read', places: [place(args.path || '.', cwd)] };
  case 'video_frames': return args.save_to
   ? { kind: 'file', title: I18n.t('approve.frames'), effect: 'change', places: [file, place(args.save_to, cwd)] }
   : { kind: 'file', title: I18n.t('approve.video'), effect: 'read', places: [file] };
  case 'web_search': return { kind: 'web', title: I18n.t('approve.search'), effect: 'online', places: [], quote: `“${String(args.query || '')}”` };
  case 'fetch_url': return { kind: 'web', title: I18n.t('approve.fetch'), effect: 'online', places: [site(String(args.url || ''))] };
  case 'find_media': return { kind: 'web', title: I18n.t(args.kind === 'videos' ? 'approve.videos' : 'approve.pictures'), effect: 'online', places: [], quote: `“${String(args.query || '')}”` };
  case 'browser_navigate': return { kind: 'web', title: I18n.t('approve.browse'), effect: 'online', places: [site(String(args.url || ''))] };
  case 'browser_tabs': return { kind: 'web', title: I18n.t('approve.tab'), effect: 'online', places: [site(String(args.url || ''))] };
  case 'browser_click': return { kind: 'web', title: I18n.t('approve.click'), effect: 'online', places: [], quote: refs[args.ref] || (args.ref ? `[${args.ref}]` : `x ${Math.round(args.x)}, y ${Math.round(args.y)}`) };
  case 'browser_type': return { kind: 'web', title: I18n.t('approve.type'), effect: 'online', places: [], quote: `“${String(args.text ?? '')}”${refs[args.ref] ? ` into ${refs[args.ref]}` : ''}${args.submit ? ', then Enter' : ''}` };
  case 'browser_select': return { kind: 'web', title: I18n.t('approve.choose'), effect: 'online', places: [], quote: `“${String(args.option ?? '')}” in ${refs[args.ref] || `[${args.ref}]`}` };
  case 'browser_press': return { kind: 'web', title: I18n.t('approve.press'), effect: 'online', places: [], quote: String(args.key || '') };
  default: return { kind: 'command', title: name, effect: 'run', places: [], code: JSON.stringify(args), reveal: 'command' };
 }
}

const clean = text => text.replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD', 'FORM', 'FIELDSET', 'DETAILS', 'SUMMARY', 'HR', 'ADDRESS']);

// Highlighters often put each code line in its own element instead of a newline.
function code(node) {
 let out = '';
 const walk = el => {
  for (const child of el.childNodes) {
   if (child.nodeType === 3) { out += child.data; continue; }
   if (child.nodeType !== 1) continue;
   if (child.tagName === 'BR') { out += '\n'; continue; }
   walk(child);
   const line = /^(DIV|P|LI|TR)$/.test(child.tagName) || /(^|[\s_-])line(\s|$)/i.test(child.getAttribute('class') || '');
   if (line && !out.endsWith('\n')) out += '\n';
  }
 };
 walk(node);
 return out.replace(/\n+$/, '');
}

function flatten(node, base) {
 let out = '';
 for (const child of node.childNodes) {
  if (child.nodeType === 3) { out += child.data.replace(/\s+/g, ' '); continue; }
  if (child.nodeType !== 1) continue;
  const tag = child.tagName;
  if (tag === 'BR') out += '\n';
  else if (tag === 'PRE') out += `\n\n\`\`\`\n${code(child)}\n\`\`\`\n\n`;
  else if (/^H[1-6]$/.test(tag)) out += `\n\n${'#'.repeat(Number(tag[1]))} ${clean(flatten(child, base)).replace(/\n/g, ' ')}\n\n`;
  else if (tag === 'LI') out += `\n- ${clean(flatten(child, base))}\n`;
  else if (tag === 'TR') out += `\n${[...child.children].map(cell => clean(flatten(cell, base)).replace(/\n/g, ' ')).join(' | ')}`;
  else if (tag === 'A') {
   const inner = flatten(child, base), label = clean(inner);
   let href = '';
   try { href = new URL(child.getAttribute('href') || '', base).href; } catch {}
   out += label && /^https?:/.test(href) && label.length < 90 && !href.startsWith(`${base.split('#')[0]}#`) && label !== href ? `[${label}](${href})` : inner;
  } else if (tag === 'IMG') {
   const alt = (child.getAttribute('alt') || '').trim();
   if (alt) out += ` [image: ${alt}] `;
  } else {
   const inner = flatten(child, base);
   out += BLOCK.has(tag) ? `\n\n${inner}\n\n` : inner;
  }
 }
 return out;
}

function readable(html, url) {
 const doc = new DOMParser().parseFromString(html, 'text/html');
 for (const node of doc.querySelectorAll('script, style, noscript, template, svg, canvas, iframe, object, embed, link, meta, button, input, select, textarea')) node.remove();
 let root = doc.querySelector('article, main, [role="main"]') || doc.body;
 if (!root || clean(root.textContent).length < 200) root = doc.body;
 if (root === doc.body) for (const node of root.querySelectorAll('nav, footer, aside, [role="navigation"], [aria-hidden="true"]')) node.remove();
 const title = clean(doc.title || '');
 const body = root ? clean(flatten(root, url)) : '';
 return title ? `# ${title}\n\n${body}` : body;
}

function page(result, start) {
 if (result.error) return `Error: ${result.error}`;
 const head = `${result.url}${result.status >= 400 ? ` (HTTP ${result.status})` : ''}`;
 if (result.text === null) return `${head}\nThis is ${result.type || 'binary content'} (${result.size}), it can't be read as text.`;
 let text = result.text;
 if (/html|xml/i.test(result.type) || /^\s*<(!doctype|html)/i.test(text)) text = readable(text, result.url);
 else if (/json/i.test(result.type)) {
  try { text = JSON.stringify(JSON.parse(text), null, 1); } catch {}
 }
 const from = Math.max(0, Math.floor(Number(start) || 0)), part = text.slice(from, from + PAGE_CHARS), end = from + part.length;
 const tail = end < text.length ? `\n\n[Characters ${from}–${end} of ${text.length}. Call fetch_url with start=${end} to read further.]` : '';
 return `${head}\n\n${part || '(empty page)'}${tail}`;
}

function ddgResults(html) {
 const doc = new DOMParser().parseFromString(html, 'text/html');
 return [...doc.querySelectorAll('.result:not(.result--ad)')].map(item => {
  const link = item.querySelector('.result__a');
  if (!link) return null;
  let url = link.getAttribute('href') || '';
  try {
   const parsed = new URL(url, 'https://duckduckgo.com');
   url = parsed.searchParams.get('uddg') || parsed.href;
  } catch {}
  return { title: clean(link.textContent), url, snippet: clean(item.querySelector('.result__snippet')?.textContent || '') };
 }).filter(item => item && /^https?:/.test(item.url) && !/duckduckgo\.com\/y\.js/.test(item.url));
}

function bingResults(html) {
 const doc = new DOMParser().parseFromString(html, 'text/html');
 return [...doc.querySelectorAll('li.b_algo')].map(item => {
  const link = item.querySelector('h2 a');
  if (!link) return null;
  let url = link.getAttribute('href') || '';
  try {
   const encoded = new URL(url).searchParams.get('u');
   if (encoded?.startsWith('a1')) url = atob(encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/'));
  } catch {}
  return { title: clean(link.textContent), url, snippet: clean(item.querySelector('.b_caption p, .b_lineclamp2, .b_lineclamp3')?.textContent || '') };
 }).filter(item => item && /^https?:/.test(item.url));
}

async function lookup(text, id, cwd) {
 const q = encodeURIComponent(text);
 let results = [], error = '';
 for (const [url, parse] of [[`https://html.duckduckgo.com/html/?q=${q}`, ddgResults], [`https://www.bing.com/search?q=${q}&setlang=en`, bingResults]]) {
  const result = await bridge.run(id, 'fetch_url', { url }, cwd);
  if (result.error) { error = result.error; continue; }
  results = result.text ? parse(result.text) : [];
  if (results.length) break;
 }
 return { results, error };
}

async function search(query, id, cwd) {
 const text = String(query || '').trim();
 if (!text) return 'Error: query is empty';
 const { results, error } = await lookup(text, id, cwd);
 if (!results.length) return error ? `Error: ${error}` : `Nothing was found for ${text}`;
 return results.slice(0, SEARCH_RESULTS).map((item, k) => `${k + 1}. ${item.title}\n${item.url}${item.snippet ? `\n${item.snippet}` : ''}`).join('\n\n');
}

// Pictures as Bing's image search lists them: every result carries, in one attribute, the page it is from, its
// name and a preview of the picture that the search engine keeps itself, which loads wherever the picture's own
// site would refuse. Only previews from the common store are taken: what the search engine is unsure is fit for
// everyone it keeps on a host of its own, and that is left out.
const PREVIEW_STORE = /^https:\/\/[\w-]+\.mm\.bing\.net\/th\?/;

function pictureResults(html) {
 const doc = new DOMParser().parseFromString(html, 'text/html'), seen = new Set();
 return [...doc.querySelectorAll('a.iusc[m]')].map(node => {
  try {
   const m = JSON.parse(node.getAttribute('m'));
   return { title: clean(String(m.t || '')), preview: String(m.turl || ''), page: String(m.purl || '') };
  } catch { return null; }
 }).filter(item => item && PREVIEW_STORE.test(item.preview) && /^https?:/.test(item.page) && !seen.has(item.preview) && seen.add(item.preview));
}

// The store keeps a preview 474 px wide. Asked for a width alone, it now and then sends the same small picture in
// the middle of a white field of that width; asked to resize and not to pad, it sends the picture itself, finer
// where it has a finer one.
const previewAt = (url, width) => `${url}&w=${width}&rs=1&p=0`;

// Videos as YouTube's own search lists them, read from the data its page is built from.
const YOUTUBE_ID = /(?:youtube\.com\/watch\?(?:[^#\s]*&)?v=|youtu\.be\/)([\w-]{11})(?![\w-])/;

function videoResults(html) {
 const from = html.indexOf('var ytInitialData = '), to = from < 0 ? -1 : html.indexOf(';</script>', from);
 if (to < 0) return [];
 let data;
 try { data = JSON.parse(html.slice(from + 20, to)); } catch { return []; }
 const found = new Map(), words = part => clean(part?.simpleText || (part?.runs || []).map(run => run.text).join(''));
 const walk = (node, depth) => {
  if (!node || typeof node !== 'object' || depth > 48) return;
  const video = node.videoRenderer;
  if (video && /^[\w-]{11}$/.test(video.videoId || '')) {
   if (!found.has(video.videoId) && words(video.title)) found.set(video.videoId, { id: video.videoId, title: words(video.title), by: words(video.ownerText), time: words(video.lengthText), views: words(video.shortViewCountText) || words(video.viewCountText), when: words(video.publishedTimeText) });
   return;
  }
  for (const key in node) walk(node[key], depth + 1);
 };
 walk(data, 0);
 return [...found.values()];
}

// A name inside the square brackets of a Markdown link can't hold brackets of its own, and an address inside the
// round ones can't hold round brackets or spaces.
const linkName = text => clean(String(text || '')).replace(/\[/g, '(').replace(/\]/g, ')').replace(/\n/g, ' ');
const linkAddress = url => String(url || '').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20');

async function media(args, id, cwd) {
 const text = String(args.query || '').trim(), count = Math.min(MEDIA.max, Math.max(1, Math.round(Number(args.count)) || MEDIA.count));
 if (!text) return 'Error: query is empty';
 const q = encodeURIComponent(text);
 if (args.kind === 'videos') {
  const result = await bridge.run(id, 'fetch_url', { url: `https://www.youtube.com/results?search_query=${q}` }, cwd);
  let found = result.error || !result.text ? [] : videoResults(result.text);
  if (!found.length) {
   // Where YouTube shows the app nothing, pages of youtube.com found by a search of the web are videos all the
   // same, only without their lengths.
   const { results } = await lookup(`${text} site:youtube.com`, id, cwd);
   found = results.map(item => ({ id: YOUTUBE_ID.exec(item.url)?.[1] || '', title: item.title.replace(/\s*[-–|]\s*YouTube$/i, ''), by: '', time: '', views: '', when: '' })).filter(item => item.id);
  }
  if (!found.length) return result.error ? `Error: ${result.error}` : `No videos were found for ${text}`;
  // Every line is ready to copy and nothing else looks like one: how much a video was watched and when it came
  // out stand apart, after the lines.
  const videos = found.slice(0, count), watched = videos.map(video => [video.views, video.when].filter(Boolean).join(', '));
  return [
   `Videos for “${text}”, one on a line: its name, who made it and how long it is. To show a video, copy its line into the answer exactly as it is, alone on a line.`,
   videos.map(video => `[${linkName([video.title, video.by, video.time].filter(Boolean).join(' · '))}](https://www.youtube.com/watch?v=${video.id})`).join('\n'),
   watched.some(Boolean) ? `How many times each was watched and when it came out, in the same order: ${watched.map((words, k) => `${k + 1}) ${words || 'unknown'}`).join('; ')}.` : '',
  ].filter(Boolean).join('\n\n');
 }
 const result = await bridge.run(id, 'fetch_url', { url: `https://www.bing.com/images/search?q=${q}&form=HDRSC3` }, cwd);
 const found = result.error || !result.text ? [] : pictureResults(result.text);
 if (!found.length) return result.error ? `Error: ${result.error}` : `No pictures were found for ${text}`;
 return [
  `Pictures for “${text}”, one on a line: its name, its address and the page it is from. To show pictures, copy the lines you choose into the answer exactly as they are, one under another with nothing between them.`,
  found.slice(0, count).map(picture => `[![${linkName(picture.title)}](${previewAt(picture.preview, MEDIA.preview)})](${linkAddress(picture.page)})`).join('\n'),
 ].join('\n\n');
}

function format(name, args, result) {
 if (result?.error) return `Error: ${result.error}`;
 switch (name) {
  case SHELL.tool: {
   const notes = [result.timedOut && `stopped after the ${result.timeout} s timeout`, result.cancelled && 'stopped by the user'].filter(Boolean);
   return `Exit code ${result.code ?? 'unknown'}${notes.length ? ` (${notes.join(', ')})` : ''}\n${result.output || '(no output)'}`;
  }
  case 'git':
   if (result.missing) return SHELL.noGit;
   return `Exit code ${result.code ?? 'unknown'}${result.timedOut ? ' (timed out)' : ''}\n${result.output || '(no output)'}`;
  case 'read_file': {
   if (result.image) return { text: `Image ${result.path}, ${result.width}×${result.height}, ${result.size}. It follows as a picture.`, images: [{ label: result.path, url: result.image }] };
   if (result.binary) return `This is a binary file (${result.size}), it can't be shown as text.`;
   const partial = result.start > 1 || result.end < result.total;
   // A PDF comes as its text alone, so it is said how many pages there are to look at.
   const pdf = result.pdf ? `[The text of a PDF of ${result.pdf} ${result.pdf === 1 ? 'page' : 'pages'}. Its pictures, charts, formulas and the look of its pages are seen with pdf_pages.]\n` : '';
   const head = partial ? `[Lines ${result.start}–${result.end} of ${result.total}]\n` : '';
   return `${pdf}${head}${result.text || '(empty file)'}${result.cut ? '\n[Cut here, the lines are too long. Read a smaller range.]' : ''}`;
  }
  case 'write_file': return `${result.created ? 'Created' : 'Rewrote'} ${result.path} (${result.lines} lines)`;
  case 'edit_file': return `Edited ${result.path}, ${result.replaced} ${result.replaced === 1 ? 'place' : 'places'} changed`;
  case 'list_files': return `${result.path}\n${result.text || '(empty folder)'}${result.more ? '\n[More entries not shown. List a subfolder.]' : ''}`;
  case 'video_frames': return frames(result);
  case 'pdf_pages': return pages(result);
  default: return JSON.stringify(result);
 }
}

const seconds = value => `${Number(value.toFixed(2))} s`;

// Runs of numbers as a person writes them: 1–3, 7, 9–10.
function runs(numbers) {
 const out = [];
 for (let k = 0; k < numbers.length; k++) {
  let end = k;
  while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end++;
  out.push(end > k ? `${numbers[k]}–${numbers[end]}` : `${numbers[k]}`);
  k = end;
 }
 return out.join(', ');
}

function pages(result) {
 const name = String(result.path || '').split(/[\\/]/).pop(), shown = result.pages.map(page => page.page);
 const lines = [`${result.path}: ${result.count} ${result.count === 1 ? 'page' : 'pages'}.`];
 if (result.limited) lines.push(`One call shows ${result.limited} pages at most; ask for the others in another call.`);
 lines.push(`${shown.length === 1 ? 'Page' : 'Pages'} ${runs(shown)} ${shown.length === 1 ? 'follows as a picture' : 'follow as pictures'}.`);
 return { text: lines.join('\n'), images: result.pages.map(page => ({ label: `Page ${page.page} of ${name}`, url: page.url })) };
}

function frames(result) {
 const sound = result.audio === true ? ', with sound' : result.audio === false ? ', no sound' : '';
 const lines = [`${result.path}: ${seconds(result.duration)}, ${result.width}×${result.height}${sound}.`];
 if (result.saved) lines.push(`Saved ${result.saved.count} frames as PNG files into ${result.saved.folder}, from ${result.saved.first} to ${result.saved.last}.`);
 if (result.limited) lines.push(`That is the most frames one call can take${result.saved ? '' : ' without save_to'}.`);
 if (result.frames.length) lines.push(`${result.frames.length} frames at ${result.frames.map(frame => seconds(frame.time)).join(', ')} follow as pictures.`);
 return { text: lines.join('\n'), images: result.frames.map(frame => ({ label: `Frame at ${seconds(frame.time)}`, url: frame.url })) };
}

async function browser(name, args, id, cwd, apart) {
 const panel = window.browserPanel;
 if (!panel) return 'Error: the built-in browser is only available in the desktop app';
 const result = await panel.run(name, args, { id, cwd, apart });
 if (!result || result.error) return `Error: ${result?.error || 'the browser did not answer'}`;
 if (result.refs) seen.set(apart || MAIN, result.refs);
 if (result.image) return { text: result.text, images: [{ label: 'Screenshot of the built-in browser', url: result.image }] };
 if (result.html !== undefined) return page({ url: result.url, status: 200, type: 'text/html', text: result.html }, args.start);
 const tabs = name === 'browser_tabs' ? '' : panel.tabsLine(apart);
 return tabs ? `${tabs}\n${result.text}` : result.text;
}

let env = null;

window.AgentTools = {
 runs,
 available: !!bridge,
 schemas: SCHEMAS,
 modes: MODES,
 needsApproval,
 describe,
 inside,
 environment() {
  env ||= bridge ? bridge.environment().catch(() => null) : Promise.resolve(null);
  return env;
 },
 // The project's own instructions for agents, AGENTS.md in its folder, as the file stands now; null when there is none.
 guide(cwd) {
  return bridge?.guide && cwd ? bridge.guide(cwd).catch(() => null) : Promise.resolve(null);
 },
 // `apart`: the agent works in a browser tab of its own (a mini chat's).
 async run(name, args, { id, cwd, apart = null }) {
  if (!bridge) return 'Error: tools are only available in the desktop app';
  if (name.startsWith('browser_')) return browser(name, args, id, cwd, apart);
  if (name === 'web_search') return search(args.query, id, cwd);
  if (name === 'find_media') return media(args, id, cwd);
  const result = await bridge.run(id, name, args, cwd);
  return name === 'fetch_url' ? page(result, args.start) : format(name, args, result);
 },
 cancel(id) {
  bridge?.cancel(id);
 },
 // One way to write a file's place, so that two agents naming the same file are seen to.
 place(cwd, path) {
  const full = resolve(cwd, path);
  return full ? norm(full) : '';
 },
};
})();
