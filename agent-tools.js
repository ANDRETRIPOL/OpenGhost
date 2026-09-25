(() => {
'use strict';

const PAGE_CHARS = 40000;
const SEARCH_RESULTS = 8;
const MODES = ['ask', 'auto', 'full'];

const bridge = window.openghost?.tools || null;

const fn = (name, description, properties, required = []) => ({
 type: 'function',
 function: { name, description, parameters: { type: 'object', properties, required } },
});

const SCHEMAS = [
 fn('run_powershell', 'Run PowerShell code on the user\'s Windows computer. It starts in the project folder, is non-interactive (it can never wait for input) and returns the exit code with the combined output. Both output streams are captured already, so never add 2>&1 or *>&1: in Windows PowerShell that wraps every stderr line of a program in an error record. Use it to run programs, scripts and tests, builds, package managers (npm, pip, winget), to inspect the system, and for file work other tools don\'t cover: moving, copying, deleting, searching with Select-String. Servers and watchers never exit: start them with Start-Process -WindowStyle Hidden and send their output to a log file.', {
  command: { type: 'string', description: 'PowerShell code, several lines are fine' },
  timeout: { type: 'integer', description: 'Seconds before the command is stopped, 120 by default, 900 at most' },
 }, ['command']),
 fn('read_file', 'Read a text file, or look at an image: PNG, JPEG, WebP, GIF, BMP, ICO and AVIF files come back as a picture you can see. Text comes as up to 2000 lines; for longer files pass offset (first line, starting at 1) and limit.', {
  path: { type: 'string', description: 'File path, relative to the project folder or absolute' },
  offset: { type: 'integer', description: 'First line to read, starting at 1' },
  limit: { type: 'integer', description: 'How many lines to read' },
 }, ['path']),
 fn('write_file', 'Create a file or replace all of its content. Missing folders are created. To change part of an existing file use edit_file.', {
  path: { type: 'string', description: 'File path, relative to the project folder or absolute' },
  content: { type: 'string', description: 'The complete new content of the file' },
 }, ['path', 'content']),
 fn('edit_file', 'Replace an exact piece of text in an existing file. old_string must match the file exactly, including spaces and indentation, and be unique in it unless replace_all is true. Read the file before editing it.', {
  path: { type: 'string', description: 'File path, relative to the project folder or absolute' },
  old_string: { type: 'string', description: 'The exact text to replace' },
  new_string: { type: 'string', description: 'The text to put instead' },
  replace_all: { type: 'boolean', description: 'Replace every occurrence instead of exactly one' },
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
 }, ['args']),
 fn('web_search', 'Search the internet. Returns titles, links and short snippets of the top results.', {
  query: { type: 'string', description: 'What to search for' },
 }, ['query']),
 fn('fetch_url', 'Open a web page or an API address and return its readable text: HTML turns into plain text with headings, lists and links, JSON and text come as they are. Long pages come in parts, pass start to read further.', {
  url: { type: 'string', description: 'Full http or https address' },
  start: { type: 'integer', description: 'Character to start from when reading a long page further' },
 }, ['url']),
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
];

const BROWSER_FREE = new Set(['browser_snapshot', 'browser_screenshot', 'browser_read', 'browser_wait', 'browser_scroll']);
const RISKY_CLICK = /\b(buy|purchase|order|checkout|check out|pay|payment|subscribe|donate|send|post|tweet|reply|publish|delete|remove|confirm|transfer|withdraw|book|reserve|sign up|register|unfollow|block|report)\b|купить|оплат|заказ|оформит|отправ|опубликов|удал|подтверд|перевест|подписа|заброн|зарегистр|пожертв/i;
let refs = {};

const READ_GIT = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'blame', 'shortlog', 'describe', 'grep', 'help', 'version']);
const LIST_GIT = { branch: /^(-a|-r|-v|-vv|--list|--all|--show-current|--no-color)$/, remote: /^(-v|--verbose)$/, tag: /^(-l|--list)$/ };
const RISKY_GIT = /^(push|pull|clean|rebase|filter-branch|filter-repo|gc|prune|update-ref|reflog|restore)$/;
const RISKY_SHELL = [
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
];
const OUTSIDE_SHELL = [/(^|[^\w.])\.\.[\\/]/, /\$env:(USERPROFILE|HOMEPATH|APPDATA|LOCALAPPDATA|ProgramData|ProgramFiles|windir|SystemRoot|SystemDrive|OneDrive|PUBLIC)/i, /\$HOME\b/i, /(^|[\s'"(=,])~[\\/]/, /(^|[\s'"(=,])\\\\[\w.$-]+\\/];
const ABSOLUTE = /(?:^|[\s'"(=,;|@])([a-zA-Z]:[\\/][^\s'"|;,)<>`]*)/g;

const norm = path => path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

function resolve(cwd, path) {
 const raw = String(path ?? '.').trim() || '.';
 if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) return raw;
 if (/^~([\\/]|$)/.test(raw)) return null;
 const parts = norm(cwd).split('\\');
 for (const part of raw.split(/[\\/]+/)) {
  if (!part || part === '.') continue;
  if (part === '..') parts.pop();
  else parts.push(part.toLowerCase());
 }
 return parts.join('\\');
}

function inside(cwd, path) {
 const full = resolve(cwd, path);
 if (!full || !cwd) return false;
 const root = norm(cwd), target = norm(full);
 return target === root || target.startsWith(`${root}\\`);
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

function browserApproval(name, args, ask) {
 if (BROWSER_FREE.has(name)) return false;
 if (name === 'browser_tabs') return ask && args.action === 'new' && !!args.url;
 if (ask) return true;
 const target = refs[args.ref] || '';
 if (name === 'browser_click') return /^(button|link|clickable|menuitem|option)\b/.test(target) && RISKY_CLICK.test(target);
 return false;
}

function needsApproval(name, args, { mode, cwd }) {
 if (mode === 'full') return false;
 const ask = mode !== 'auto';
 if (name.startsWith('browser_')) return browserApproval(name, args, ask);
 switch (name) {
  case 'read_file':
  case 'list_files': return ask && !inside(cwd, args.path || '.');
  case 'write_file':
  case 'edit_file': return ask || !inside(cwd, args.path);
  case 'video_frames': return (ask && !inside(cwd, args.path)) || (!!args.save_to && (ask || !inside(cwd, args.save_to)));
  case 'run_powershell': return ask || riskyShell(args.command, cwd);
  case 'git': return !readOnlyGit(args.args) && (ask || riskyGit(args.args));
  case 'web_search':
  case 'fetch_url': return ask;
  default: return true;
 }
}

function relative(cwd, path) {
 const raw = String(path ?? '.').trim() || '.';
 if (!/^[a-zA-Z]:[\\/]|^\\\\/.test(raw)) return raw.replace(/^\.[\\/]/, '');
 return inside(cwd, raw) ? raw.slice(norm(cwd).length).replace(/^[\\/]+/, '') || '.' : raw;
}

function describe(name, args, cwd) {
 const path = relative(cwd, args.path || '.');
 switch (name) {
  case 'run_powershell': return { kind: 'command', title: I18n.t('approve.command'), code: String(args.command || '') };
  case 'git': return { kind: 'command', title: I18n.t('approve.git'), code: `git ${gitArgs(args.args).map(arg => /\s/.test(arg) ? `"${arg}"` : arg).join(' ')}` };
  case 'write_file': return { kind: 'file', title: I18n.t('approve.write'), path, added: String(args.content || '') };
  case 'edit_file': return { kind: 'file', title: I18n.t('approve.edit'), path, removed: String(args.old_string || ''), added: String(args.new_string || '') };
  case 'read_file': return { kind: 'file', title: I18n.t('approve.read'), path };
  case 'list_files': return { kind: 'file', title: I18n.t('approve.list'), path };
  case 'video_frames': return args.save_to
   ? { kind: 'file', title: I18n.t('approve.frames'), path, text: I18n.t('approve.framesTo', { folder: relative(cwd, args.save_to) }) }
   : { kind: 'file', title: I18n.t('approve.video'), path };
  case 'web_search': return { kind: 'web', title: I18n.t('approve.search'), text: String(args.query || '') };
  case 'fetch_url': return { kind: 'web', title: I18n.t('approve.fetch'), url: String(args.url || '') };
  case 'browser_navigate': return { kind: 'web', title: I18n.t('approve.browse'), url: String(args.url || '') };
  case 'browser_tabs': return { kind: 'web', title: I18n.t('approve.tab'), url: String(args.url || '') };
  case 'browser_click': return { kind: 'web', title: I18n.t('approve.click'), text: refs[args.ref] || (args.ref ? `[${args.ref}]` : `x ${Math.round(args.x)}, y ${Math.round(args.y)}`) };
  case 'browser_type': return { kind: 'web', title: I18n.t('approve.type'), text: `"${String(args.text ?? '')}"${refs[args.ref] ? ` into ${refs[args.ref]}` : ''}${args.submit ? ', then Enter' : ''}` };
  case 'browser_select': return { kind: 'web', title: I18n.t('approve.choose'), text: `"${String(args.option ?? '')}" in ${refs[args.ref] || `[${args.ref}]`}` };
  case 'browser_press': return { kind: 'web', title: I18n.t('approve.press'), text: String(args.key || '') };
  default: return { kind: 'command', title: name, code: JSON.stringify(args) };
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

async function search(query, id, cwd) {
 const text = String(query || '').trim();
 if (!text) return 'Error: query is empty';
 const q = encodeURIComponent(text);
 let results = [], error = '';
 for (const [url, parse] of [[`https://html.duckduckgo.com/html/?q=${q}`, ddgResults], [`https://www.bing.com/search?q=${q}&setlang=en`, bingResults]]) {
  const result = await bridge.run(id, 'fetch_url', { url }, cwd);
  if (result.error) { error = result.error; continue; }
  results = result.text ? parse(result.text) : [];
  if (results.length) break;
 }
 if (!results.length) return error ? `Error: ${error}` : `Nothing was found for ${text}`;
 return results.slice(0, SEARCH_RESULTS).map((item, k) => `${k + 1}. ${item.title}\n${item.url}${item.snippet ? `\n${item.snippet}` : ''}`).join('\n\n');
}

function format(name, args, result) {
 if (result?.error) return `Error: ${result.error}`;
 switch (name) {
  case 'run_powershell': {
   const notes = [result.timedOut && `stopped after the ${result.timeout} s timeout`, result.cancelled && 'stopped by the user'].filter(Boolean);
   return `Exit code ${result.code ?? 'unknown'}${notes.length ? ` (${notes.join(', ')})` : ''}\n${result.output || '(no output)'}`;
  }
  case 'git':
   if (result.missing) return 'Error: Git is not installed on this computer. It can be installed with: winget install --id Git.Git -e --source winget';
   return `Exit code ${result.code ?? 'unknown'}${result.timedOut ? ' (timed out)' : ''}\n${result.output || '(no output)'}`;
  case 'read_file': {
   if (result.image) return { text: `Image ${result.path}, ${result.width}×${result.height}, ${result.size}. It follows as a picture.`, images: [{ label: result.path, url: result.image }] };
   if (result.binary) return `This is a binary file (${result.size}), it can't be shown as text.`;
   const partial = result.start > 1 || result.end < result.total;
   const head = partial ? `[Lines ${result.start}–${result.end} of ${result.total}]\n` : '';
   return `${head}${result.text || '(empty file)'}${result.cut ? '\n[Cut here, the lines are too long. Read a smaller range.]' : ''}`;
  }
  case 'write_file': return `${result.created ? 'Created' : 'Rewrote'} ${result.path} (${result.lines} lines)`;
  case 'edit_file': return `Edited ${result.path}, ${result.replaced} ${result.replaced === 1 ? 'place' : 'places'} changed`;
  case 'list_files': return `${result.path}\n${result.text || '(empty folder)'}${result.more ? '\n[More entries not shown. List a subfolder.]' : ''}`;
  case 'video_frames': return frames(result);
  default: return JSON.stringify(result);
 }
}

const seconds = value => `${Number(value.toFixed(2))} s`;

function frames(result) {
 const sound = result.audio === true ? ', with sound' : result.audio === false ? ', no sound' : '';
 const lines = [`${result.path}: ${seconds(result.duration)}, ${result.width}×${result.height}${sound}.`];
 if (result.saved) lines.push(`Saved ${result.saved.count} frames as PNG files into ${result.saved.folder}, from ${result.saved.first} to ${result.saved.last}.`);
 if (result.limited) lines.push(`That is the most frames one call can take${result.saved ? '' : ' without save_to'}.`);
 if (result.frames.length) lines.push(`${result.frames.length} frames at ${result.frames.map(frame => seconds(frame.time)).join(', ')} follow as pictures.`);
 return { text: lines.join('\n'), images: result.frames.map(frame => ({ label: `Frame at ${seconds(frame.time)}`, url: frame.url })) };
}

async function browser(name, args, id, cwd) {
 const panel = window.browserPanel;
 if (!panel) return 'Error: the built-in browser is only available in the desktop app';
 const result = await panel.run(name, args, { id, cwd });
 if (!result || result.error) return `Error: ${result?.error || 'the browser did not answer'}`;
 if (result.refs) refs = result.refs;
 if (result.image) return { text: result.text, images: [{ label: 'Screenshot of the built-in browser', url: result.image }] };
 if (result.html !== undefined) return page({ url: result.url, status: 200, type: 'text/html', text: result.html }, args.start);
 const tabs = name === 'browser_tabs' ? '' : panel.tabsLine();
 return tabs ? `${tabs}\n${result.text}` : result.text;
}

let env = null;

window.AgentTools = {
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
 async run(name, args, { id, cwd }) {
  if (!bridge) return 'Error: tools are only available in the desktop app';
  if (name.startsWith('browser_')) return browser(name, args, id, cwd);
  if (name === 'web_search') return search(args.query, id, cwd);
  const result = await bridge.run(id, name, args, cwd);
  return name === 'fetch_url' ? page(result, args.start) : format(name, args, result);
 },
 cancel(id) {
  bridge?.cancel(id);
 },
};
})();
