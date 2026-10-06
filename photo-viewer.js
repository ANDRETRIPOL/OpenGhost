(() => {
'use strict';

// Photos open large: the user's own and the ones the agent showed. The photo flies out of its stack into the middle of
// the window, over the chat gone dim and soft; the arrows and the keys leaf through the stack it came from, and on closing
// it flies back to its place, the stack turned to the photo seen last.
const FLY = { duration: 440, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const BACK = { duration: 360, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const LEAF = { duration: 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const FADE = { duration: 260, easing: 'ease', fill: 'forwards' };
// The photo's room: the arrows at the sides, the close button above, the caption below. A small picture grows to fill
// it, but not past this many times its own size.
const ROOM = { side: 88, top: 72, bottom: 96, grow: 2.5 };
const RADIUS = 12;
// The picture store the agent's previews come from gives the same picture sharper when asked for it wider.
const STORE = /^https:\/\/[\w-]+\.mm\.bing\.net\/th\?/;
const SHARP = 1600;
const CLOSE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Where a photo shows inside its card: the card draws it whole, so it is the card's box cut to the photo's shape.
function shown(img) {
 const box = img.getBoundingClientRect(), ratio = img.naturalWidth / img.naturalHeight;
 if (!box.width || !box.height || !ratio) return null;
 const width = box.width / box.height > ratio ? box.height * ratio : box.width, height = width / ratio;
 return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}

function sharper(url) {
 return STORE.test(url) && /[?&]w=\d+/.test(url) ? url.replace(/([?&])w=\d+/, `$1w=${SHARP}`) : '';
}

class PhotoViewer {
 // items: { url, name, href, width, height } in the stack's order; slider: the stack they are shown in.
 static open(options) {
  if (document.querySelector('dialog.viewer')) return null;
  return new PhotoViewer(options);
 }

 constructor({ items, index = 0, slider = null }) {
  this.items = items;
  this.index = index;
  this.slider = slider;
  this.hidden = null;
  this.closing = false;
  const many = items.length > 1;
  const dialog = this.dialog = document.createElement('dialog');
  dialog.className = 'viewer';
  dialog.setAttribute('aria-label', I18n.t('viewer.label'));
  dialog.innerHTML = `
   <button type="button" class="viewer-close" aria-label="${escapeHtml(I18n.t('viewer.close'))}">${CLOSE}</button>
   ${many ? `<button type="button" class="viewer-arrow is-prev" aria-label="${escapeHtml(I18n.t('media.prev'))}">${CHEVRON}</button>
   <button type="button" class="viewer-arrow is-next" aria-label="${escapeHtml(I18n.t('media.next'))}">${CHEVRON}</button>` : ''}
   <div class="viewer-bar"><span class="viewer-count"></span><span class="viewer-caption"></span><span class="viewer-source"></span></div>`;
  this.prev = dialog.querySelector('.is-prev');
  this.next = dialog.querySelector('.is-next');
  dialog.querySelector('.viewer-close').addEventListener('click', () => this.close());
  this.prev?.addEventListener('click', () => this.go(this.index - 1));
  this.next?.addEventListener('click', () => this.go(this.index + 1));
  dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
  dialog.addEventListener('keydown', event => this.onKey(event));
  // A click on the dimmed chat around the photo closes it; on the photo itself nothing happens.
  dialog.addEventListener('click', event => { if (event.target === dialog) this.close(); });
  this.resize = () => this.place(this.img, this.index);
  window.addEventListener('resize', this.resize);
  document.body.append(dialog);
  dialog.showModal();
  this.img = this.picture(index);
  dialog.prepend(this.img);
  this.say();
  this.fly();
 }

 picture(k) {
  const img = document.createElement('img');
  img.className = 'viewer-img';
  img.alt = this.items[k].name || '';
  img.draggable = false;
  img.decoding = 'async';
  img.src = this.items[k].url;
  this.place(img, k);
  // Until the copy that is already in the stack tells its size, the photo waits to be placed.
  if (!img.complete) img.addEventListener('load', () => this.place(img, k), { once: true });
  const sharp = sharper(this.items[k].url);
  if (sharp) {
   const better = new Image();
   better.onload = () => { if (img.isConnected && better.naturalWidth > img.naturalWidth) img.src = sharp; };
   better.src = sharp;
  }
  return img;
 }

 size(img, k) {
  const item = this.items[k], card = this.slider?.imgs?.[k];
  const width = img.naturalWidth || card?.naturalWidth || item.width, height = img.naturalHeight || card?.naturalHeight || item.height;
  return width && height ? { width, height } : null;
 }

 // The photo as large as its room takes, in the middle of it.
 target(k, img = this.img) {
  const natural = this.size(img, k);
  if (!natural) return null;
  const roomW = Math.max(120, innerWidth - ROOM.side * 2), roomH = Math.max(120, innerHeight - ROOM.top - ROOM.bottom);
  const scale = Math.min(roomW / natural.width, roomH / natural.height, ROOM.grow);
  const width = natural.width * scale, height = natural.height * scale;
  return { left: (innerWidth - width) / 2, top: ROOM.top + (roomH - height) / 2, width, height };
 }

 place(img, k) {
  const box = this.target(k, img);
  if (!img || !box) return;
  Object.assign(img.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
 }

 say() {
  const item = this.items[this.index], many = this.items.length > 1;
  this.dialog.querySelector('.viewer-count').textContent = many ? `${this.index + 1} / ${this.items.length}` : '';
  this.dialog.querySelector('.viewer-caption').textContent = item.name || '';
  this.dialog.querySelector('.viewer-source').innerHTML = item.href && window.LinkChip ? LinkChip.html(item.href) : '';
  this.prev?.classList.toggle('is-hidden', this.index === 0);
  this.next?.classList.toggle('is-hidden', this.index === this.items.length - 1);
 }

 // The card the photo left stays empty while the photo is out, so there is only ever one of it.
 hide(k) {
  if (this.hidden) this.hidden.style.visibility = '';
  this.hidden = this.slider?.cards?.[k] || null;
  if (this.hidden) this.hidden.style.visibility = 'hidden';
 }

 from(k) {
  const card = this.slider?.imgs?.[k];
  const box = card && shown(card);
  return box && box.top < innerHeight && box.top + box.height > 0 ? box : null;
 }

 // The transform that puts the photo, drawn at its place here, onto its place in the stack.
 onto(box, img) {
  const at = img.getBoundingClientRect(), scale = box.width / at.width;
  const x = box.left + box.width / 2 - (at.left + at.width / 2), y = box.top + box.height / 2 - (at.top + at.height / 2);
  const radius = parseFloat(getComputedStyle(this.slider.el).borderTopLeftRadius) || 18;
  return { transform: `translate(${x}px, ${y}px) scale(${scale})`, borderRadius: `${radius / scale}px` };
 }

 fly() {
  const box = this.from(this.index), still = reducedMotion();
  this.dialog.animate({ opacity: [0, 1] }, { ...FADE, pseudoElement: '::backdrop' });
  for (const el of this.dialog.querySelectorAll('.viewer-close, .viewer-arrow, .viewer-bar')) el.animate({ opacity: [0, 1] }, { ...FADE, delay: still ? 0 : 120, fill: 'backwards' });
  if (still || !box) {
   this.img.animate({ opacity: [0, 1], transform: [still ? 'none' : 'scale(0.96)', 'none'] }, FADE);
   return;
  }
  this.hide(this.index);
  this.img.animate([this.onto(box, this.img), { transform: 'none', borderRadius: `${RADIUS}px` }], FLY);
 }

 go(k) {
  if (this.closing || k < 0 || k >= this.items.length || k === this.index) return;
  const dir = Math.sign(k - this.index), old = this.img, still = reducedMotion();
  this.index = k;
  this.img = this.picture(k);
  old.after(this.img);
  // The stack turns along behind the veil, so the photo has its card to fly back to.
  this.slider?.go(k);
  if (this.hidden) this.hide(k);
  this.say();
  if (still) { old.remove(); return; }
  old.animate({ transform: ['none', `translateX(${-dir * 64}px) scale(0.96)`], opacity: [1, 0] }, { ...LEAF, fill: 'forwards' }).finished.then(() => old.remove(), () => old.remove());
  this.img.animate({ transform: [`translateX(${dir * 64}px) scale(0.96)`, 'none'], opacity: [0, 1] }, LEAF);
 }

 onKey(event) {
  const to = { ArrowLeft: this.index - 1, ArrowRight: this.index + 1, Home: 0, End: this.items.length - 1 }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  this.go(to);
 }

 close() {
  if (this.closing) return;
  this.closing = true;
  window.removeEventListener('resize', this.resize);
  const dialog = this.dialog, still = reducedMotion();
  // The stack may still be turning to this photo: it is set at once, so the photo lands on a card at rest.
  if (this.slider && this.slider.pos !== this.index) { this.slider.pos = this.index; this.slider.vel = 0; this.slider.render(); }
  const box = still ? null : this.hidden && this.from(this.index);
  dialog.animate({ opacity: [1, 0] }, { ...FADE, duration: BACK.duration, pseudoElement: '::backdrop' });
  for (const el of dialog.querySelectorAll('.viewer-close, .viewer-arrow, .viewer-bar')) el.animate({ opacity: [1, 0] }, { ...FADE, duration: 160 });
  const flight = box
   ? this.img.animate([{ transform: 'none', borderRadius: `${RADIUS}px` }, this.onto(box, this.img)], { ...BACK, fill: 'forwards' })
   : this.img.animate({ opacity: [1, 0], transform: ['none', still ? 'none' : 'scale(0.96)'] }, { ...FADE, duration: BACK.duration });
  const done = () => {
   if (this.hidden) this.hidden.style.visibility = '';
   dialog.close();
   dialog.remove();
   this.slider?.el.focus?.({ preventScroll: true });
  };
  flight.finished.then(done, done);
 }
}

window.PhotoViewer = PhotoViewer;
})();
