(() => {
'use strict';

const FIND = /(?:https?:\/\/|www\.)[^\s<>"'`«»]+/gi;
const AUTHORITY = /^(?:[a-z][\w+.-]*:\/\/)?(?:[^@\/?#\s]*@)?(\[[^\]]*\]|[^\/?#:\s]+)(?::(\d+))?/i;
const SHORT = new Set(['youtu.be', 'bit.ly', 'goo.gl', 't.co', 'g.co', 'amzn.to', 'lnkd.in', 'fb.me', 'wa.me', 'vk.cc', 'clck.ru']);
const SUFFIX2 = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'ne.jp', 'or.jp', 'com.br', 'com.cn', 'com.tr',
 'com.ua', 'co.kr', 'co.in', 'co.nz', 'co.za', 'com.mx', 'com.ar', 'com.sg', 'com.hk', 'com.tw', 'org.ru', 'msk.ru', 'spb.ru', 'co.il']);
const ICON_TIMEOUT = 2500;
const LABEL_MAX = 28;
const APPEAR = { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };

const icons = new Map();
const roots = new Set();
const escapeHtml = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function trim(url) {
 while (/[.,;:!?»"'…*_~]$/.test(url) || url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) url = url.slice(0, -1);
 return url;
}

function authority(url) {
 const m = url.match(AUTHORITY);
 return m ? { host: m[1].toLowerCase().replace(/\.$/, '').replace(/^www\d?\./, ''), port: m[2] || '' } : { host: url, port: '' };
}

const host = url => authority(url).host;
const href = url => /^www\./i.test(url) ? `https://${url}` : url;

function base(name) {
 const bits = name.split('.');
 return bits.slice(-(bits.length > 2 && SUFFIX2.has(bits.slice(-2).join('.')) ? 3 : 2)).join('.');
}

function label(url) {
 const { host: name, port } = authority(url);
 let text = name;
 if (port) text = `${name}:${port}`;
 else if (name.includes('.') && !/^[\d.]+$/.test(name) && !name.startsWith('[') && !SHORT.has(name)) {
  const bits = name.split('.'), cut = bits.length > 2 && SUFFIX2.has(bits.slice(-2).join('.')) ? 2 : 1;
  const rest = bits.slice(0, -cut).join('.');
  if (rest.length > 2) text = rest;
 }
 return text.length > LABEL_MAX ? `…${text.slice(-(LABEL_MAX - 1))}` : text;
}

function find(text) {
 const out = [];
 for (const m of text.matchAll(FIND)) {
  const url = trim(m[0]);
  if (url.length < 8 || m.index && /[\w@/.]/.test(text[m.index - 1])) continue;
  out.push({ index: m.index, url });
 }
 return out;
}

function html(url) {
 const link = href(url);
 return `<a class="link-chip" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(link)}">`
  + `<span class="link-chip-icon" data-host="${escapeHtml(host(url))}" aria-hidden="true"></span><span class="link-chip-text">${escapeHtml(label(url))}</span></a>`;
}

function fill(el, text) {
 let last = 0;
 const template = document.createElement('template');
 for (const { index, url } of find(text)) {
  template.innerHTML = html(url);
  el.append(text.slice(last, index), template.content);
  last = index + url.length;
 }
 el.append(text.slice(last));
}

function probe(src) {
 return new Promise(resolve => {
  const img = new Image();
  const timer = setTimeout(() => resolve(false), ICON_TIMEOUT);
  img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 1); };
  img.onerror = () => { clearTimeout(timer); resolve(false); };
  img.src = src;
 });
}

function load(name) {
 let entry = icons.get(name);
 if (entry) return entry;
 entry = { state: 'wait', src: '' };
 icons.set(name, entry);
 const sources = [...new Set([name, base(name)])].map(item => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(item)}.ico`);
 (async () => {
  for (const src of sources) if (await probe(src)) { entry.src = src; break; }
  entry.state = entry.src ? 'ok' : 'fail';
  for (const root of roots) for (const el of root.querySelectorAll(`.link-chip-icon[data-host="${CSS.escape(name)}"]`)) {
   paint(el);
   if (!reducedMotion()) el.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], APPEAR);
  }
 })();
 return entry;
}

function paint(el) {
 const entry = load(el.dataset.host || '');
 el.style.setProperty('--favicon', entry.state === 'ok' ? `url("${entry.src}")` : 'none');
 el.style.setProperty('--globe', entry.state === 'fail' ? '1' : '0');
}

function scan(node) {
 if (node.nodeType !== 1) return;
 if (node.classList.contains('link-chip-icon')) paint(node);
 else if (node.firstElementChild) for (const el of node.querySelectorAll('.link-chip-icon')) paint(el);
}

function watch(root) {
 roots.add(root);
 scan(root);
 const observer = new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) scan(node);
 });
 observer.observe(root, { childList: true, subtree: true });
 return () => {
  observer.disconnect();
  roots.delete(root);
 };
}

window.LinkChip = { find, trim, host, href, label, html, fill, watch };
})();
