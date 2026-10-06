(() => {
'use strict';

// Pictures and videos shown in a reply. Markdown leaves a placeholder that lists what to show; this builds what is
// seen: a stack of pictures to leaf through, with the caption and the source of the one on top, and a card with a
// preview for every video.

const YOUTUBE = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})(?![\w-])/i;
// A picture loads by itself only from where search engines keep their previews and from Wikimedia's library: places
// that hand out what they hold and fetch nothing on request. An address anyone could have made up, with something
// of the conversation in its tail, would otherwise be fetched the moment the reply is shown, and so would a
// service that fetches whatever address it is given. Such a picture waits for a click.
const TRUSTED = [
 /^https:\/\/[a-z0-9]+\.mm\.bing\.net\/th[?/]/i,
 /^https:\/\/th\.bing\.com\/th[?/]/i,
 /^https:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\//i,
 /^https:\/\/upload\.wikimedia\.org\/wikipedia\//i,
 /^https:\/\/encrypted-tbn\d\.gstatic\.com\/images\?/i,
];
const LOAD_TIMEOUT = 9000;
const THUMBS = ['hq720', 'mqdefault'];
// What YouTube sends in place of a preview that does not exist is this wide.
const NO_THUMB = 120;
const INFO = { key: 'openghost.media.info', max: 300 };
const APPEAR = { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 6.6a1 1 0 0 1 1.5-.86l8.3 5.4a1 1 0 0 1 0 1.72l-8.3 5.4a1 1 0 0 1-1.5-.86z" fill="currentColor"/></svg>';
const PICTURE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="2.5"/><circle cx="6" cy="6.8" r="1.1"/><path d="M2.6 11.4l3.2-2.9 2.4 2 2.2-2.2 3 3"/></svg>';

const bridge = window.openghost?.tools || null;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const videoId = url => YOUTUBE.exec(String(url || ''))?.[1] || '';
const trusted = url => TRUSTED.some(place => place.test(url));

function make(tag, className, text = '') {
 const node = document.createElement(tag);
 if (className) node.className = className;
 if (text) node.textContent = text;
 return node;
}

function appear(node) {
 if (!reducedMotion()) node.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], APPEAR);
 return node;
}

function probe(src) {
 return new Promise(resolve => {
  const img = new Image();
  const timer = setTimeout(() => resolve(null), LOAD_TIMEOUT);
  img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 1 ? { width: img.naturalWidth, height: img.naturalHeight } : null); };
  img.onerror = () => { clearTimeout(timer); resolve(null); };
  img.src = src;
 });
}

/* Videos */

// What is known of a video beyond its address: its name and who made it. YouTube tells it for any video that
// exists; the answer is kept, so a chat opened again asks nothing.
const asked = new Map();
let kept = null;

function keptInfo() {
 if (kept) return kept;
 try { kept = JSON.parse(localStorage.getItem(INFO.key) || '{}') || {}; } catch { kept = {}; }
 return kept;
}

function keep(id, value) {
 const all = keptInfo();
 all[id] = value;
 const ids = Object.keys(all);
 for (const old of ids.slice(0, Math.max(0, ids.length - INFO.max))) delete all[old];
 try { localStorage.setItem(INFO.key, JSON.stringify(all)); } catch {}
}

function videoInfo(id) {
 if (asked.has(id)) return asked.get(id);
 const known = keptInfo()[id];
 const task = known ? Promise.resolve(known) : !bridge || !window.AgentTools ? Promise.resolve(null) : AgentTools.environment().then(env => {
  if (!env?.home) return null;
  const address = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
  return bridge.run(`media-${id}-${Date.now()}`, 'fetch_url', { url: address }, env.home);
 }).then(result => {
  if (!result || result.error || result.status !== 200 || !result.text) return null;
  const data = JSON.parse(result.text), value = { title: String(data.title || ''), by: String(data.author_name || '') };
  if (value.title) keep(id, value);
  return value.title ? value : null;
 }).catch(() => null);
 asked.set(id, task);
 return task;
}

// The words of a link to a video may carry who made it and how long it is, parted by dots: Title · Channel · 4:40.
function videoWords(text, url) {
 const words = String(text || '').trim(), out = { title: '', by: '', time: '' };
 if (!words || /^https?:\/\//i.test(words) || words.replace(/^www\./, '') === String(url).replace(/^https?:\/\/(www\.)?/, '')) return out;
 const bits = words.split(/\s+·\s+/).filter(Boolean);
 if (bits.length > 1 && /^\d{1,2}(?::\d{2}){1,2}$/.test(bits[bits.length - 1])) out.time = bits.pop();
 if (bits.length > 1) out.by = bits.pop();
 out.title = bits.join(' · ');
 return out;
}

function videoCard(item) {
 const id = videoId(item.url), words = videoWords(item.title, item.url);
 const card = make('a', 'md-video');
 card.href = item.url;
 card.target = '_blank';
 card.rel = 'noopener noreferrer';
 const thumb = make('span', 'md-video-thumb'), img = make('img', 'md-video-img'), play = make('span', 'md-video-play');
 img.alt = '';
 img.decoding = 'async';
 img.draggable = false;
 play.innerHTML = PLAY;
 thumb.append(img, play);
 if (words.time) thumb.append(make('span', 'md-video-time', words.time));
 const title = make('span', 'md-video-title', words.title), meta = make('span', 'md-video-meta');
 const icon = make('span', 'link-chip-icon'), by = make('span', 'md-video-by', words.by || 'YouTube');
 icon.dataset.host = 'youtube.com';
 icon.setAttribute('aria-hidden', 'true');
 meta.append(icon, by);
 card.append(thumb, title, meta);
 card.title = item.url;
 // The widest preview first; a video too old or too small for it has the narrow one; one that has neither is
 // not there at all, and its card says so by staying plain.
 const sources = THUMBS.map(name => `https://i.ytimg.com/vi/${id}/${name}.jpg`);
 const next = () => {
  const src = sources.shift();
  if (src) img.src = src;
  else card.classList.add('is-missing');
 };
 img.addEventListener('load', () => { if (img.naturalWidth <= NO_THUMB) next(); else card.classList.add('is-loaded'); });
 img.addEventListener('error', next);
 next();
 videoInfo(id).then(info => {
  if (!info) return;
  if (!title.textContent) title.textContent = info.title;
  if (!words.by && info.by) by.textContent = info.by;
 });
 return card;
}

/* Pictures */

// A stack of pictures: the ones allowed to load are tried first and only those that came are shown, with their
// sizes known, so the stack takes its shape at once. Under it stand the caption and the source of the picture on
// top. A picture from anywhere else is a small plate that loads it on a click.
function gallery(images, changed) {
 const root = make('div', 'md-gallery'), allowed = new Set(), sizes = new Map();
 let build = 0;
 const draw = async () => {
  const turn = ++build, shown = images.filter(image => trusted(image.src) || allowed.has(image.src)), held = images.filter(image => !shown.includes(image));
  if (!root.firstChild && shown.length) root.append(make('div', 'md-gallery-wait'));
  await Promise.all(shown.filter(image => !sizes.has(image.src)).map(async image => sizes.set(image.src, await probe(image.src))));
  if (turn !== build) return;
  const loaded = shown.filter(image => sizes.get(image.src)), lost = shown.filter(image => !sizes.get(image.src));
  root.replaceChildren();
  if (loaded.length) {
   const slider = new MediaSlider(loaded.map(image => ({ url: image.src, name: image.alt, ...sizes.get(image.src) })));
   const caption = make('div', 'md-gallery-caption'), text = make('span', 'md-gallery-text'), source = make('span', 'md-gallery-source');
   const say = k => {
    const image = loaded[k] || loaded[0];
    text.textContent = image.alt || '';
    source.innerHTML = image.href && window.LinkChip ? LinkChip.html(image.href) : '';
    caption.hidden = !image.alt && !image.href;
   };
   slider.onChange = say;
   say(0);
   // A click opens the picture large; the page it comes from is the chip under the stack, and under the picture there.
   const items = loaded.map(image => ({ url: image.src, name: image.alt, href: image.href, ...sizes.get(image.src) }));
   slider.openable(k => window.PhotoViewer?.open({ items, index: k, slider }));
   caption.append(text, source);
   root.append(appear(slider.el), caption);
  }
  // What did not load, and what waits to be asked for, stay as links: nothing the reply showed is lost.
  if (held.length || lost.length) {
   const row = make('div', 'md-gallery-held');
   for (const image of held) {
    const ask = make('button', 'md-gallery-ask');
    ask.type = 'button';
    ask.innerHTML = PICTURE;
    ask.append(make('span', 'md-gallery-ask-text', image.alt || I18n.t('media.picture')), make('span', 'md-gallery-ask-host', hostOf(image.src)));
    ask.title = I18n.t('media.show', { host: hostOf(image.src) });
    ask.addEventListener('click', () => { allowed.add(image.src); draw(); });
    row.append(ask);
   }
   for (const image of lost) {
    const link = make('span', 'md-gallery-lost');
    link.innerHTML = window.LinkChip ? LinkChip.html(image.href || image.src) : '';
    row.append(link);
   }
   root.append(row);
  }
  changed?.();
 };
 draw();
 return root;
}

/* The placeholder comes alive */

// Children are set in place: what already stands where it should is not touched, so a card keeps its preview and a
// stack its place while the reply is still being written around them.
function arrange(parent, nodes) {
 nodes.forEach((node, k) => { if (parent.children[k] !== node) parent.insertBefore(node, parent.children[k] || null); });
 while (parent.children.length > nodes.length) parent.lastElementChild.remove();
}

function mount(el, changed) {
 const data = el.dataset.media || '', live = el.hasAttribute('data-live');
 if (el.__media === data && el.__live === live) return;
 el.__media = data;
 el.__live = live;
 let items = [];
 try { items = JSON.parse(data); } catch {}
 const images = items.filter(item => item.k === 'i' && /^https?:\/\//i.test(item.src)), videos = items.filter(item => item.k === 'v' && videoId(item.url));
 // The links Markdown left in the placeholder give way once; after that only what changed is built anew.
 if (!el.__kept) el.replaceChildren();
 const kept = el.__kept ||= { pictures: '', stack: null, row: null, cards: new Map() }, parts = [];
 // While the reply is still writing the list, the pictures wait as one quiet plate: the stack is built once.
 const pictures = !images.length ? '' : live ? 'wait' : JSON.stringify(images);
 if (pictures !== kept.pictures) {
  kept.pictures = pictures;
  kept.stack = !pictures ? null : live ? make('div', 'md-gallery-wait') : gallery(images, changed);
 }
 if (kept.stack) parts.push(kept.stack);
 const cards = new Map();
 for (const item of videos) {
  const name = `${item.url}\n${item.title}`;
  cards.set(name, kept.cards.get(name) || videoCard(item));
 }
 kept.cards = cards;
 if (cards.size) {
  kept.row ||= make('div', 'md-videos');
  kept.row.classList.toggle('is-many', cards.size > 1);
  arrange(kept.row, [...cards.values()]);
  parts.push(kept.row);
 }
 arrange(el, parts);
 changed?.();
}

window.MediaEmbed = { mount, videoId, trusted, videoWords };
})();
