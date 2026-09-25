'use strict';

const { app, clipboard, Menu, nativeImage, session, webContents } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const PARTITION = 'persist:browser';
const WORLD = 1077;
const WAIT = { load: 30000, stop: 15000, call: 12000, quiet: [300, 2000], pointer: 420 };
const SNAPSHOT = { view: 9000, full: 40000 };
const SHOT = { max: 1280, quality: 82, tall: 4 };
const READ_MAX = 4 * 1024 * 1024;
const WAIT_MAX = 60;
const ALLOWED = new Set(['clipboard-sanitized-write', 'fullscreen', 'pointerLock']);
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
const KEYS = {
 enter: ['Enter', 'Enter', 13, '\r'], return: ['Enter', 'Enter', 13, '\r'], tab: ['Tab', 'Tab', 9], escape: ['Escape', 'Escape', 27], esc: ['Escape', 'Escape', 27],
 backspace: ['Backspace', 'Backspace', 8], delete: ['Delete', 'Delete', 46], space: [' ', 'Space', 32, ' '],
 arrowup: ['ArrowUp', 'ArrowUp', 38], arrowdown: ['ArrowDown', 'ArrowDown', 40], arrowleft: ['ArrowLeft', 'ArrowLeft', 37], arrowright: ['ArrowRight', 'ArrowRight', 39],
 up: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40], left: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39],
 pageup: ['PageUp', 'PageUp', 33], pagedown: ['PageDown', 'PageDown', 34], home: ['Home', 'Home', 36], end: ['End', 'End', 35],
};
const MODIFIERS = { alt: 1, control: 2, ctrl: 2, meta: 4, cmd: 4, win: 4, shift: 8 };

// Everything below runs inside the page, in an isolated world the page's own scripts can't see.
function install() {
 if (window.__og) return;
 const ACTIVE = new Set(['link', 'button', 'combobox', 'listbox', 'textbox', 'searchbox', 'checkbox', 'radio', 'slider', 'spinbutton', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem', 'file input', 'clickable']);
 const TYPING = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);
 const INPUTS = { button: 'button', submit: 'button', reset: 'button', image: 'button', checkbox: 'checkbox', radio: 'radio', range: 'slider', search: 'searchbox', file: 'file input', number: 'spinbutton', hidden: '' };
 const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'svg', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'OBJECT', 'EMBED']);
 const INLINE = new Set(['SPAN', 'B', 'I', 'EM', 'STRONG', 'SMALL', 'MARK', 'CODE', 'SUB', 'SUP', 'ABBR', 'TIME', 'FONT', 'U', 'S', 'Q', 'CITE', 'BR', 'WBR', 'DATA', 'VAR', 'KBD', 'SAMP', 'BDI', 'BDO']);
 const SELECTOR = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=combobox],[role=textbox],[role=searchbox],[contenteditable=""],[contenteditable=true],[onclick]';
 const state = { next: 1, refs: new Map(), ids: new WeakMap() };
 const clean = text => (text || '').replace(/\s+/g, ' ').trim();
 const cut = (text, max) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
 const quote = (text, max = 100) => `"${cut(clean(text), max).replace(/"/g, '\'')}"`;
 const styleOf = el => el.ownerDocument.defaultView.getComputedStyle(el);
 const shown = el => { const style = styleOf(el); return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.02; };

 function rectOf(el) {
  const r = el.getBoundingClientRect();
  let x = 0, y = 0, view = el.ownerDocument.defaultView;
  while (view && view.frameElement) {
   const f = view.frameElement.getBoundingClientRect();
   x += f.left + view.frameElement.clientLeft;
   y += f.top + view.frameElement.clientTop;
   view = view.parent;
  }
  return { left: r.left + x, top: r.top + y, right: r.right + x, bottom: r.bottom + y, width: r.width, height: r.height };
 }

 function roleOf(el) {
  const role = el.getAttribute('role');
  if (role) return role.split(/\s+/)[0];
  const tag = el.tagName;
  if (tag === 'A') return el.hasAttribute('href') ? 'link' : '';
  if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
  if (tag === 'SELECT') return el.multiple ? 'listbox' : 'combobox';
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'INPUT') {
   const type = (el.getAttribute('type') || 'text').toLowerCase();
   return type in INPUTS ? INPUTS[type] : 'textbox';
  }
  if (el.isContentEditable && !el.parentElement?.isContentEditable) return 'textbox';
  if (/^H[1-6]$/.test(tag)) return 'heading';
  return '';
 }

 function clickable(el) {
  if (el.hasAttribute('onclick')) return true;
  if (el.querySelector(SELECTOR)) return false;
  if (styleOf(el).cursor !== 'pointer') return false;
  const parent = el.parentElement;
  return !parent || styleOf(parent).cursor !== 'pointer';
 }

 function labelText(label, control) {
  let text = '';
  const walker = label.ownerDocument.createTreeWalker(label, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!control.contains(node)) text += ` ${node.data}`;
  return text;
 }

 function nameOf(el, role) {
  const by = el.getAttribute('aria-labelledby');
  let name = el.getAttribute('aria-label') || (by ? by.split(/\s+/).map(id => el.ownerDocument.getElementById(id)?.innerText || '').join(' ') : '');
  if (!name && el.labels?.length) name = [...el.labels].map(label => labelText(label, el)).join(' ');
  if (!name && TYPING.has(role)) name = el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '';
  if (!name && el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type)) name = el.value;
  if (!name && !TYPING.has(role)) name = el.innerText;
  if (!name) name = el.getAttribute('title') || el.querySelector?.('img[alt]')?.alt || el.querySelector?.('svg title')?.textContent || '';
  return clean(name);
 }

 function idOf(el) {
  let id = state.ids.get(el);
  if (!id) {
   id = state.next++;
   state.ids.set(el, id);
   state.refs.set(id, new WeakRef(el));
  }
  return id;
 }

 function href(el) {
  const raw = el.getAttribute('href') || '';
  if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw)) return '';
  try {
   const url = new URL(el.href);
   return cut(url.origin === location.origin ? `${url.pathname}${url.search}` : `${url.host}${url.pathname}`, 80);
  } catch {
   return '';
  }
 }

 function describe(el, role = roleOf(el) || (clickable(el) ? 'clickable' : el.tagName.toLowerCase())) {
  let text = role;
  const name = nameOf(el, role);
  if (name) text += ` ${quote(name)}`;
  if (TYPING.has(role) && el.tagName !== 'SELECT') {
   const value = el.isContentEditable ? el.innerText : el.value;
   if (el.type === 'password') { if (value) text += ' value=••••'; }
   else if (clean(value)) text += ` value=${quote(value, 160)}`;
   if (name !== clean(el.getAttribute('placeholder') || '') && el.getAttribute('placeholder') && !clean(value)) text += ` placeholder=${quote(el.getAttribute('placeholder'))}`;
  }
  if (el.tagName === 'SELECT') {
   const options = [...el.options].map(option => clean(option.text)).filter(Boolean);
   const chosen = el.selectedOptions[0];
   if (chosen) text += ` = ${quote(chosen.text)}`;
   text += ` options: ${options.slice(0, 15).join(' | ')}${options.length > 15 ? ` … ${options.length - 15} more` : ''}`;
  }
  if (/^(checkbox|radio|switch|menuitemcheckbox|menuitemradio)$/.test(role)) {
   const on = typeof el.checked === 'boolean' ? el.checked : el.getAttribute('aria-checked') === 'true';
   text += on ? ' checked' : ' unchecked';
  }
  if (el.getAttribute('aria-expanded')) text += el.getAttribute('aria-expanded') === 'true' ? ' expanded' : ' collapsed';
  if (el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') && el.getAttribute('aria-current') !== 'false') text += ' current';
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') text += ' disabled';
  if (role === 'link') { const target = href(el); if (target) text += ` -> ${target}`; }
  if (el.ownerDocument.activeElement === el) text += ' focused';
  return text;
 }

 function ownText(el) {
  let text = '';
  for (const node of el.childNodes) if (node.nodeType === 3) text += node.data;
  return clean(text);
 }

 function snapshot({ full = false } = {}) {
  const vw = innerWidth, vh = innerHeight, max = full ? 40000 : 9000;
  const lines = [], refs = {};
  let size = 0, skipped = 0, visited = 0;
  const push = text => {
   if (size + text.length > max) { skipped++; return; }
   lines.push(text);
   size += text.length + 1;
  };
  const inView = r => r.width >= 1 && r.height >= 1 && (full || (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw));
  const children = el => {
   if (el.shadowRoot) for (const child of el.shadowRoot.children) visit(child);
   for (const child of el.children) visit(child);
  };
  const visit = el => {
   if (++visited > 20000 || SKIP.has(el.tagName) || el.getAttribute('aria-hidden') === 'true' || el.hidden) return;
   const role = roleOf(el);
   if (ACTIVE.has(role) || (!role && clickable(el))) {
    if (inView(rectOf(el)) && shown(el)) {
     const id = idOf(el), text = describe(el, role || 'clickable');
     refs[id] = cut(text, 140);
     push(`[${id}] ${text}`);
    }
    if (role !== 'listbox') return;
   } else if (role === 'heading') {
    if (inView(rectOf(el)) && shown(el)) push(`heading${/^H[1-6]$/.test(el.tagName) ? ` ${el.tagName[1]}` : ''} ${quote(el.innerText, 160)}`);
    if (!el.querySelector(SELECTOR)) return;
   } else if (el.tagName === 'IMG') {
    const alt = clean(el.alt);
    if (alt && alt.length > 1 && inView(rectOf(el)) && shown(el)) push(`img ${quote(alt)}`);
    return;
   } else if (el.tagName === 'IFRAME') {
    let doc = null;
    try { doc = el.contentDocument; } catch {}
    if (doc?.body) children(doc.body);
    else if (inView(rectOf(el))) push(`iframe${el.title ? ` ${quote(el.title)}` : ''} (content not readable)`);
    return;
   } else {
    const own = ownText(el);
    const flat = (own || el.children.length) && [...el.children].every(child => INLINE.has(child.tagName));
    if (flat && !el.shadowRoot && !el.querySelector(SELECTOR)) {
     const text = clean(el.innerText);
     if (text && inView(rectOf(el)) && shown(el)) push(`text ${quote(text, 240)}`);
     return;
    }
    if (own.length > 1 && inView(rectOf(el)) && shown(el)) push(`text ${quote(own, 240)}`);
   }
   children(el);
  };
  children(document.body || document.documentElement);
  const scroller = document.scrollingElement || document.documentElement;
  const height = scroller.scrollHeight, top = scroller.scrollTop;
  return { lines, refs, skipped, scroll: { top, height, vh, vw, below: Math.max(0, height - top - vh) } };
 }

 function element(ref) {
  const el = state.refs.get(Number(ref))?.deref();
  if (!el || !el.isConnected) throw new Error(`Element [${ref}] is no longer on the page. Take a new snapshot.`);
  return el;
 }

 function inside(node, root) {
  for (let n = node; n; n = n.parentNode || n.host) if (n === root) return true;
  return false;
 }

 function point(ref) {
  const el = element(ref);
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const r = rectOf(el), vw = innerWidth, vh = innerHeight;
  const x = Math.min(Math.max(r.left + Math.min(r.width / 2, 40), 1), vw - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
  let hit = document.elementFromPoint(x, y);
  while (hit?.shadowRoot) {
   const deeper = hit.shadowRoot.elementFromPoint(x, y);
   if (!deeper || deeper === hit) break;
   hit = deeper;
  }
  const own = !hit || inside(hit, el) || inside(el, hit) || (hit.tagName === 'IFRAME' && el.ownerDocument !== document);
  return { x, y, label: describe(el), covered: own ? '' : describe(hit) };
 }

 function choose(ref, wanted) {
  const el = element(ref);
  if (el.tagName !== 'SELECT') throw new Error(`[${ref}] is not a dropdown list. Click it and then click the option you need.`);
  const want = clean(String(wanted)).toLowerCase();
  const options = [...el.options];
  const option = options.find(o => clean(o.text).toLowerCase() === want || o.value.toLowerCase() === want)
   || options.find(o => clean(o.text).toLowerCase().includes(want));
  if (!option) throw new Error(`No option like "${wanted}" in [${ref}]. Options: ${options.map(o => clean(o.text)).filter(Boolean).slice(0, 40).join(' | ')}`);
  el.focus();
  el.value = option.value;
  option.selected = true;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return clean(option.text);
 }

 function reveal(ref) {
  element(ref).scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  return true;
 }

 function quiet(idle, max) {
  return new Promise(resolve => {
   let timer = 0;
   const done = () => { observer.disconnect(); clearTimeout(timer); clearTimeout(cap); resolve(true); };
   const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(done, idle); });
   observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
   timer = setTimeout(done, idle);
   const cap = setTimeout(done, max);
  });
 }

 function has(text) {
  const want = String(text).toLowerCase();
  if ((document.body?.innerText || '').toLowerCase().includes(want)) return true;
  const hosts = [...document.querySelectorAll('*')].filter(el => el.shadowRoot);
  for (let k = 0; k < hosts.length; k++) {
   const root = hosts[k].shadowRoot;
   for (const child of root.children) if ((child.innerText || child.textContent || '').toLowerCase().includes(want)) return true;
   hosts.push(...[...root.querySelectorAll('*')].filter(el => el.shadowRoot));
  }
  return false;
 }

 window.__og = { snapshot, point, choose, reveal, quiet, has };
}

const INSTALL = `(${install.toString()})();`;
const plain = message => Object.assign(new Error(message), { plain: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const guests = new Map();
const downloads = [];
let shown = { open: false, id: 0 };
let ready = false;

function normalize(value) {
 const text = String(value || '').trim();
 if (!text) throw plain('url is empty');
 if (/^(https?|file|about|data):/i.test(text)) return text;
 if (text.startsWith('/')) return `file://${text}`;
 if (/^[a-zA-Z]:[\\/]/.test(text)) return `file:///${text.replace(/\\/g, '/')}`;
 if (/^(localhost|127\.0\.0\.1|\[::1\]|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(text)) return `http://${text}`;
 if (!/\s/.test(text) && /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/|$|\?|#)/i.test(text)) return `https://${text}`;
 return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

function uniqueFile(dir, name) {
 const ext = path.extname(name), stem = path.basename(name, ext) || 'download';
 let file = path.join(dir, name || 'download'), k = 1;
 while (fs.existsSync(file)) file = path.join(dir, `${stem} (${k++})${ext}`);
 return file;
}

function setup() {
 if (ready) return;
 ready = true;
 const ses = session.fromPartition(PARTITION);
 ses.setUserAgent(UA);
 ses.setPermissionRequestHandler((contents, permission, callback) => callback(ALLOWED.has(permission)));
 ses.setPermissionCheckHandler((contents, permission) => ALLOWED.has(permission));
 ses.on('will-download', (event, item, contents) => {
  item.setSavePath(uniqueFile(app.getPath('downloads'), item.getFilename()));
  item.once('done', (e, result) => {
   if (result !== 'completed') return;
   const file = item.getSavePath();
   downloads.push({ file, at: Date.now(), told: false });
   const host = contents?.hostWebContents;
   if (host && !host.isDestroyed()) host.send('browser:event', { type: 'download', file, name: path.basename(file) });
  });
 });
}

function guard(host, prefs, params) {
 delete prefs.preload;
 prefs.preload = path.join(__dirname, 'browser-preload.js');
 Object.assign(prefs, { nodeIntegration: false, nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: true });
 return params.partition === PARTITION && /^(https?|file|about|data):/i.test(params.src || 'about:blank');
}

function adopt(host, guest) {
 guests.set(guest.id, { guest, host, queue: Promise.resolve(), attached: false });
 guest.once('destroyed', () => guests.delete(guest.id));
 const tell = (type, data = {}) => { if (!host.isDestroyed()) host.send('browser:event', { type, id: guest.id, ...data }); };
 guest.setWindowOpenHandler(({ url, disposition }) => {
  if (disposition === 'new-window') return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 700, autoHideMenuBar: true, backgroundColor: '#ffffff' } };
  if (/^(https?|file):/i.test(url)) tell('open', { url, background: disposition === 'background-tab' });
  return { action: 'deny' };
 });
 guest.on('before-input-event', (event, input) => {
  if (input.type !== 'keyDown') return;
  const key = input.key.toLowerCase(), ctrl = input.control || input.meta;
  let handled = true;
  if (key === 'f5' || (ctrl && key === 'r')) guest.reload();
  else if (key === 'f12' || (ctrl && input.shift && key === 'i')) guest.toggleDevTools();
  else if (input.alt && key === 'arrowleft') guest.navigationHistory.goBack();
  else if (input.alt && key === 'arrowright') guest.navigationHistory.goForward();
  else if (ctrl && key === 'l') tell('key', { action: 'address' });
  else if (ctrl && key === 't') tell('key', { action: 'new' });
  else if (ctrl && key === 'w') tell('key', { action: 'close' });
  else handled = false;
  if (handled) event.preventDefault();
 });
 guest.on('context-menu', (event, params) => {
  const items = [];
  const add = (label, click, enabled = true) => items.push({ label, click, enabled });
  const line = () => { if (items.length && items.at(-1).type !== 'separator') items.push({ type: 'separator' }); };
  if (params.linkURL) {
   add('Open link in new tab', () => tell('open', { url: params.linkURL, background: false }));
   add('Copy link address', () => clipboard.writeText(params.linkURL));
   line();
  }
  if (params.mediaType === 'image' && params.srcURL) {
   add('Open image in new tab', () => tell('open', { url: params.srcURL, background: false }));
   add('Copy image', () => guest.copyImageAt(params.x, params.y));
   line();
  }
  if (params.isEditable) {
   add('Cut', () => guest.cut(), params.editFlags.canCut);
   add('Copy', () => guest.copy(), params.editFlags.canCopy);
   add('Paste', () => guest.paste(), params.editFlags.canPaste);
   add('Select all', () => guest.selectAll());
   line();
  } else if (params.selectionText) {
   add('Copy', () => guest.copy());
   line();
  }
  add('Back', () => guest.navigationHistory.goBack(), guest.navigationHistory.canGoBack());
  add('Forward', () => guest.navigationHistory.goForward(), guest.navigationHistory.canGoForward());
  add('Reload', () => guest.reload());
  line();
  add('Inspect', () => guest.inspectElement(params.x, params.y));
  Menu.buildFromTemplate(items).popup();
 });
}

function entry(id, host) {
 const found = guests.get(Number(id));
 if (!found || found.guest.isDestroyed() || found.host !== host) throw plain('This browser tab is gone. Open a page again with browser_navigate.');
 return found;
}

async function attach(found) {
 if (found.attached && found.guest.debugger.isAttached()) return;
 if (!found.guest.debugger.isAttached()) found.guest.debugger.attach('1.3');
 found.attached = true;
 await found.guest.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
}

function timed(promise, ms, message) {
 let timer;
 return Promise.race([promise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(plain(message)), ms); })]).finally(() => clearTimeout(timer));
}

async function world(guest, expression) {
 const code = `${INSTALL}(async () => { try { return { ok: await (${expression}) }; } catch (error) { return { error: String(error && error.message || error) }; } })()`;
 const answer = await timed(guest.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]), WAIT.call, 'The page is not responding');
 if (answer?.error) throw plain(answer.error);
 return answer?.ok;
}

async function settle(guest, loading = false) {
 await sleep(loading ? 250 : 120);
 if (guest.isLoading()) await timed(new Promise(resolve => guest.once('did-stop-loading', resolve)), WAIT.stop, 'slow').catch(() => {});
 await world(guest, `__og.quiet(${WAIT.quiet[0]}, ${WAIT.quiet[1]})`).catch(() => {});
}

function percent(scroll) {
 const room = scroll.height - scroll.vh;
 return room > 4 ? Math.round(scroll.top / room * 100) : 0;
}

async function state(guest, { full = false, note = '' } = {}) {
 const snap = await world(guest, `__og.snapshot(${JSON.stringify({ full })})`);
 const { scroll } = snap, head = [];
 if (note) head.push(note);
 head.push(`Page: ${guest.getTitle() || '(no title)'}`, `URL: ${guest.getURL()}`);
 if (guest.isLoading()) head.push('The page is still loading.');
 const screens = scroll.height / Math.max(1, scroll.vh);
 head.push(screens > 1.05 ? `Viewport ${scroll.vw}×${scroll.vh}, scrolled ${percent(scroll)}% of a page ${screens.toFixed(1)} screens tall.` : `Viewport ${scroll.vw}×${scroll.vh}, the whole page fits on screen.`);
 const fresh = downloads.filter(item => !item.told);
 for (const item of fresh) { item.told = true; head.push(`Downloaded: ${item.file}`); }
 const tail = [];
 if (snap.skipped) tail.push(`[… ${snap.skipped} more lines not shown. ${full ? 'Scroll to them and take a snapshot' : 'Call browser_snapshot with full true or scroll'}.]`);
 else if (!full && scroll.below > 8) tail.push('[More content below: scroll down to see it.]');
 const body = snap.lines.length ? snap.lines.join('\n') : '(nothing readable on screen)';
 return { text: `${head.join('\n')}\n\n${body}${tail.length ? `\n${tail.join('\n')}` : ''}`, refs: snap.refs };
}

async function pointer(found, x, y) {
 const { guest, host } = found;
 if (host.isDestroyed()) return;
 host.send('browser:event', { type: 'pointer', id: guest.id, x, y });
 if (shown.open && shown.id === guest.id) await sleep(WAIT.pointer);
}

async function mouse(guest, x, y, count = 1) {
 const send = params => guest.debugger.sendCommand('Input.dispatchMouseEvent', { x, y, ...params });
 await send({ type: 'mouseMoved' });
 for (let k = 1; k <= count; k++) {
  await send({ type: 'mousePressed', button: 'left', buttons: 1, clickCount: k });
  await send({ type: 'mouseReleased', button: 'left', buttons: 0, clickCount: k });
 }
}

function keyOf(combo) {
 const parts = String(combo || '').split('+').map(part => part.trim()).filter(Boolean);
 if (!parts.length) throw plain('key is empty');
 let modifiers = 0;
 for (const part of parts.slice(0, -1)) {
  const bit = MODIFIERS[part.toLowerCase()];
  if (!bit) throw plain(`Unknown modifier ${part}. Use Control, Alt, Shift or Meta.`);
  modifiers |= bit;
 }
 const last = parts.at(-1), known = KEYS[last.toLowerCase()];
 if (known) {
  const [key, code, vk, text] = known;
  return { key, code, vk, text: modifiers & 7 ? '' : text || '', modifiers };
 }
 if (last.length !== 1) throw plain(`Unknown key ${last}. Use Enter, Tab, Escape, Backspace, Delete, Space, arrows, PageUp, PageDown, Home, End or a single character.`);
 const upper = last.toUpperCase();
 const code = /[A-Z]/.test(upper) ? `Key${upper}` : /\d/.test(last) ? `Digit${last}` : '';
 return { key: last, code, vk: upper.charCodeAt(0), text: modifiers & 7 ? '' : last, modifiers };
}

async function press(guest, combo) {
 const { key, code, vk, text, modifiers } = keyOf(combo);
 const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
 await guest.debugger.sendCommand('Input.dispatchKeyEvent', { ...base, type: text ? 'keyDown' : 'rawKeyDown', text, unmodifiedText: text });
 await guest.debugger.sendCommand('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
}

async function navigate(guest, target) {
 const history = guest.navigationHistory;
 if (target === 'back' || target === 'forward') {
  const can = target === 'back' ? history.canGoBack() : history.canGoForward();
  if (!can) throw plain(`There is no page to go ${target} to`);
  if (target === 'back') history.goBack(); else history.goForward();
  await settle(guest, true);
  return '';
 }
 if (target === 'reload') { guest.reload(); await settle(guest, true); return ''; }
 const url = normalize(target);
 let failure = '';
 await timed(guest.loadURL(url), WAIT.load, 'timeout').catch(error => {
  if (error.message === 'timeout') failure = 'The page takes long to load, this is what has loaded so far.';
  else if (error.code && error.code !== 'ERR_ABORTED') failure = `The page could not be opened: ${error.code}.`;
 });
 await settle(guest);
 return failure;
}

async function screenshot(guest, full) {
 const cdp = (method, params = {}) => guest.debugger.sendCommand(method, params);
 const metrics = await cdp('Page.getLayoutMetrics');
 const view = metrics.cssVisualViewport, content = metrics.cssContentSize;
 const width = Math.round(view.clientWidth), height = Math.round(full ? Math.min(content.height, view.clientHeight * SHOT.tall) : view.clientHeight);
 const params = { format: 'png' };
 if (full) Object.assign(params, { captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
 const shot = await timed(cdp('Page.captureScreenshot', params), WAIT.call, 'The page did not draw a screenshot');
 let image = nativeImage.createFromBuffer(Buffer.from(shot.data, 'base64'));
 const target = Math.min(width, SHOT.max);
 if (image.getSize().width !== target) image = image.resize({ width: target, quality: 'good' });
 const size = image.getSize();
 return { image: `data:image/jpeg;base64,${image.toJPEG(SHOT.quality).toString('base64')}`, width: size.width, height: size.height, scale: size.width / width };
}

async function act(found, name, args, signal) {
 const { guest } = found;
 const check = () => { if (signal.aborted) throw plain('Stopped by the user'); };
 await attach(found);
 check();
 switch (name) {
  case 'browser_navigate': {
   const raw = String(args.url || '').trim(), word = raw.toLowerCase();
   const note = await navigate(guest, ['back', 'forward', 'reload'].includes(word) ? word : raw);
   return state(guest, { note });
  }
  case 'browser_snapshot':
   return state(guest, { full: !!args.full });
  case 'browser_click': {
   let x = Number(args.x), y = Number(args.y), note = '';
   if (args.ref !== undefined && args.ref !== null && args.ref !== '') {
    const spot = await world(guest, `__og.point(${Number(args.ref)})`);
    ({ x, y } = spot);
    if (spot.covered) note = `Note: at that spot [${args.ref}] is covered by ${spot.covered}, the click went there.`;
   } else if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw plain('Pass ref from the snapshot, or x and y in page pixels');
   }
   check();
   await pointer(found, x, y);
   await mouse(guest, x, y, args.double ? 2 : 1);
   await settle(guest);
   return state(guest, { note });
  }
  case 'browser_type': {
   const text = String(args.text ?? '');
   if (args.ref !== undefined && args.ref !== null && args.ref !== '') {
    const spot = await world(guest, `__og.point(${Number(args.ref)})`);
    check();
    await pointer(found, spot.x, spot.y);
    await mouse(guest, spot.x, spot.y);
    await sleep(80);
   }
   if (args.clear !== false) {
    await press(guest, 'Control+A');
    if (!text) await press(guest, 'Delete');
   }
   if (text) await guest.debugger.sendCommand('Input.insertText', { text });
   if (args.submit) { await sleep(60); await press(guest, 'Enter'); }
   await settle(guest);
   return state(guest);
  }
  case 'browser_select': {
   const chosen = await world(guest, `__og.choose(${Number(args.ref)}, ${JSON.stringify(String(args.option ?? ''))})`);
   await settle(guest);
   return state(guest, { note: `Chose "${chosen}".` });
  }
  case 'browser_press': {
   const count = Math.min(20, Math.max(1, Math.round(Number(args.times) || 1)));
   for (let k = 0; k < count; k++) { check(); await press(guest, args.key); }
   await settle(guest);
   return state(guest);
  }
  case 'browser_scroll': {
   if (args.ref !== undefined && args.ref !== null && args.ref !== '') {
    await world(guest, `__og.reveal(${Number(args.ref)})`);
   } else {
    const metrics = await guest.debugger.sendCommand('Page.getLayoutMetrics');
    const view = metrics.cssVisualViewport, amount = Math.min(10, Math.max(0.1, Number(args.amount) || 0.8));
    const sign = String(args.direction || 'down').toLowerCase() === 'up' ? -1 : 1;
    await guest.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseWheel', x: view.clientWidth / 2, y: view.clientHeight / 2, deltaX: 0, deltaY: sign * view.clientHeight * amount });
   }
   await sleep(250);
   await settle(guest);
   return state(guest);
  }
  case 'browser_screenshot': {
   const shot = await screenshot(guest, !!args.full_page);
   const scale = Math.abs(shot.scale - 1) < 0.01 ? 'one screenshot pixel is one page pixel, so x and y for browser_click can be read from it' : `to click by coordinates divide screenshot pixels by ${shot.scale.toFixed(3)}`;
   return { ...shot, text: `Screenshot of ${args.full_page ? 'the page from the top' : 'the viewport'}: ${guest.getTitle() || guest.getURL()}, ${shot.width}×${shot.height}; ${scale}.` };
  }
  case 'browser_read': {
   const html = await timed(guest.executeJavaScript('document.documentElement ? document.documentElement.outerHTML : ""'), WAIT.call, 'The page is not responding');
   return { html: html.slice(0, READ_MAX), url: guest.getURL(), title: guest.getTitle() };
  }
  case 'browser_wait': {
   const seconds = Math.min(WAIT_MAX, Math.max(0.5, Number(args.seconds) || (args.text ? 15 : 2)));
   const until = Date.now() + seconds * 1000;
   let found = !args.text;
   if (args.text) {
    while (Date.now() < until) {
     check();
     if (await world(guest, `__og.has(${JSON.stringify(String(args.text))})`).catch(() => false)) { found = true; break; }
     await sleep(400);
    }
   } else {
    await sleep(seconds * 1000);
   }
   await settle(guest);
   return state(guest, { note: args.text ? (found ? `"${args.text}" is on the page.` : `"${args.text}" did not appear within ${seconds} s.`) : '' });
  }
  default:
   throw plain(`Unknown browser tool ${name}`);
 }
}

function run(name, args, host, signal) {
 const found = entry(args.tab, host);
 const job = found.queue.catch(() => {}).then(() => act(found, name, args, signal));
 found.queue = job;
 return job;
}

function setShown(value) {
 shown = { open: !!value?.open, id: Number(value?.id) || 0 };
}

module.exports = { PARTITION, setup, guard, adopt, run, setShown };
