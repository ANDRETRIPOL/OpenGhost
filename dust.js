(() => {
'use strict';

// A thing taken away crumbles to dust, the way a deleted message does in Telegram. A picture is taken of it, and the
// picture is cut into grains. From its left edge on, the grains come loose one after another, drift up and aside on a
// light wind, and fade; what has not come loose yet stands where it stood, as sharp as it was.
//
// The picture is the thing itself, drawn by the browser: a copy of it with all its styles written into the copy, put
// through an SVG. The grains fly on a canvas laid over the place. The dust is not put into what scrolls the thing but
// over the window it is seen through: it stays where the thing stood on the screen while the chat closes the room under
// it, and adds nothing to what can be scrolled.

// At most this many grains; a larger picture is cut into coarser ones.
const GRAINS = 26000;
// What counts as something to crumble: a pixel at least this opaque.
const SOLID = 14;
// How long the crumbling takes to cross the picture (ms): at least, for every pixel of its width, at most. `lean` is how
// much later its bottom goes than its top, `scatter` how far apart in time two grains of one place may come loose.
const SWEEP = { least: 260, perPixel: 0.6, most: 600, lean: 60, scatter: 170 };
// A grain's life (ms): at least, and how much longer at most.
const LIFE = { least: 520, spread: 700 };
// It leaves at `speed` px/s in a direction between up-left and right (radians), the wind carries it and the air lifts it
// more the longer it flies (px/s²), and it sways by up to `sway` px, `swing` times a second or so.
const FLIGHT = { speed: [16, 92], turn: [-2.3, -0.15], wind: 130, lift: 44, sway: [3, 12], swing: [4, 9] };
// How far past the picture the dust may fly before it is gone (px).
const ROOM = { left: 60, top: 170, right: 200, bottom: 44 };
// The air's canvas holds no more pixels than this; a larger place is drawn coarser.
const AIR = 2600000;
const SVG = 'http://www.w3.org/2000/svg';
// What is left out of the picture: controls that only show under the pointer.
const SKIP = '.message-tools, .queued-tools';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const between = ([low, high]) => low + Math.random() * (high - low);

// What the thing is seen through: the nearest box that scrolls it, or else the one it is placed in.
function windowOf(el) {
 for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
  if (/auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
 }
 return el.offsetParent;
}

// A picture inside the copy becomes data of its own: an SVG drawn as an image may load nothing from elsewhere.
function inked(image) {
 const box = image.getBoundingClientRect(), wide = image.naturalWidth || box.width, tall = image.naturalHeight || box.height;
 if (!wide || !tall) return '';
 const width = Math.max(1, Math.round(Math.min(wide, box.width * 3))), height = Math.max(1, Math.round(width * tall / wide));
 const canvas = Object.assign(document.createElement('canvas'), { width, height });
 try {
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/webp', 0.9);
 } catch {
  return '';
 }
}

// A copy carries its own looks: every computed property of the original is written into it, so it is drawn the same
// wherever it is put.
function dress(from, to) {
 const style = getComputedStyle(from);
 let text = '';
 for (const name of style) text += `${name}:${style.getPropertyValue(name)};`;
 to.setAttribute('style', text);
 if (from instanceof HTMLImageElement) to.setAttribute('src', inked(from));
 const kids = from.children, copies = to.children;
 for (let k = 0; k < kids.length; k++) dress(kids[k], copies[k]);
}

// The element as the browser draws it, at `ratio` pixels to one of the page's.
async function picture(el, rect, ratio) {
 const copy = el.cloneNode(true);
 dress(el, copy);
 for (const node of copy.querySelectorAll(SKIP)) node.remove();
 for (const [name, value] of Object.entries({ margin: '0', transform: 'none', translate: 'none', scale: 'none', opacity: '1', animation: 'none', transition: 'none' })) copy.style.setProperty(name, value);
 const width = Math.ceil(rect.width), height = Math.ceil(rect.height);
 const holder = document.createElementNS(SVG, 'svg'), frame = document.createElementNS(SVG, 'foreignObject');
 holder.setAttribute('width', width);
 holder.setAttribute('height', height);
 frame.setAttribute('width', '100%');
 frame.setAttribute('height', '100%');
 frame.append(copy);
 holder.append(frame);
 const image = new Image();
 image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(holder))}`;
 await image.decode();
 const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(width * ratio), height: Math.round(height * ratio) });
 const context = canvas.getContext('2d', { willReadFrequently: true });
 context.drawImage(image, 0, 0, canvas.width, canvas.height);
 return { canvas, pixels: context.getImageData(0, 0, canvas.width, canvas.height) };
}

// The picture cut into grains: where each one is, its colour, how far along and down the picture it lies, and how it
// flies once loose. Also where in the picture there is anything at all.
function cut({ data, width, height }) {
 let solid = 0, left = width, right = -1, top = height, bottom = -1;
 for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
   if (data[(y * width + x) * 4 + 3] < SOLID) continue;
   solid++;
   if (x < left) left = x;
   if (x > right) right = x;
   if (y < top) top = y;
   if (y > bottom) bottom = y;
  }
 }
 if (!solid) return null;
 const step = Math.max(1, Math.ceil(Math.sqrt(solid / GRAINS)));
 const most = Math.ceil((right - left + step) / step) * Math.ceil((bottom - top + step) / step);
 const grains = { step, count: 0, left, right, top, bottom };
 for (const name of ['x', 'y', 'along', 'down', 'start', 'life', 'vx', 'vy', 'sway', 'swing', 'phase']) grains[name] = new Float32Array(most);
 grains.color = new Uint8Array(most * 4);
 const half = step >> 1, wide = Math.max(1, right - left), tall = Math.max(1, bottom - top);
 for (let y = top; y <= bottom; y += step) {
  for (let x = left; x <= right; x += step) {
   const at = (Math.min(height - 1, y + half) * width + Math.min(width - 1, x + half)) * 4;
   if (data[at + 3] < SOLID) continue;
   const k = grains.count++, turn = between(FLIGHT.turn), speed = between(FLIGHT.speed);
   grains.x[k] = x;
   grains.y[k] = y;
   grains.along[k] = (x - left) / wide;
   grains.down[k] = (y - top) / tall;
   grains.color.set(data.subarray(at, at + 4), k * 4);
   grains.life[k] = LIFE.least + Math.random() * LIFE.spread;
   grains.vx[k] = Math.cos(turn) * speed;
   grains.vy[k] = Math.sin(turn) * speed;
   grains.sway[k] = between(FLIGHT.sway);
   grains.swing[k] = between(FLIGHT.swing);
   grains.phase[k] = Math.random() * Math.PI * 2;
  }
 }
 return grains;
}

// The element crumbles where it stands and is left hidden, still holding its room; the dust goes on by itself and clears
// up after itself. Resolves with true once the dust has taken the element's place, or with false when no picture of it
// could be made (the caller then takes it away another way).
async function away(el) {
 if (reducedMotion() || !el.isConnected) return false;
 const host = windowOf(el), rect = el.getBoundingClientRect();
 if (!host?.parentElement || !rect.width || !rect.height) return false;
 const ratio = Math.min(2, window.devicePixelRatio || 1);
 let shot, grains;
 try {
  shot = await picture(el, rect, ratio);
  grains = cut(shot.pixels);
 } catch {
  return false;
 }
 if (!grains || !el.isConnected) return false;
 const { step, x: gx, y: gy, color, start, life, vx, vy, sway, swing, phase } = grains;
 const sweep = Math.min(SWEEP.most, SWEEP.least + (grains.right - grains.left) / ratio * SWEEP.perPixel);
 for (let k = 0; k < grains.count; k++) start[k] = grains.along[k] * sweep + grains.down[k] * SWEEP.lean + Math.random() * SWEEP.scatter;
 const order = Array.from({ length: grains.count }, (_, k) => k).sort((a, b) => start[a] - start[b]);

 // A sheet over the window the thing is seen through, as large as that window and cut to it. On it, two layers over
 // the place: the picture, which loses its grains as they come loose, and the air they fly in. The air reaches only as
 // far round what there is to crumble as the dust flies.
 const layer = document.createElement('div');
 layer.className = 'dust-layer';
 layer.setAttribute('aria-hidden', 'true');
 host.after(layer);
 const now = el.getBoundingClientRect(), frame = host.getBoundingClientRect(), base = layer.getBoundingClientRect();
 const pane = { left: frame.left + host.clientLeft, top: frame.top + host.clientTop };
 Object.assign(layer.style, { left: `${pane.left - base.left}px`, top: `${pane.top - base.top}px`, width: `${host.clientWidth}px`, height: `${host.clientHeight}px` });
 const ink = { left: grains.left / ratio, top: grains.top / ratio, width: (grains.right - grains.left + step) / ratio, height: (grains.bottom - grains.top + step) / ratio };
 const area = { width: ink.width + ROOM.left + ROOM.right, height: ink.height + ROOM.top + ROOM.bottom };
 const fine = Math.min(ratio, Math.sqrt(AIR / (area.width * area.height)));
 const box = document.createElement('div');
 box.className = 'dust';
 box.setAttribute('aria-hidden', 'true');
 Object.assign(box.style, {
  left: `${now.left - pane.left + ink.left - ROOM.left}px`,
  top: `${now.top - pane.top + ink.top - ROOM.top}px`,
  width: `${area.width}px`,
  height: `${area.height}px`,
 });
 const still = shot.canvas;
 still.className = 'dust-still';
 Object.assign(still.style, { left: `${ROOM.left - ink.left}px`, top: `${ROOM.top - ink.top}px`, width: `${Math.ceil(rect.width)}px`, height: `${Math.ceil(rect.height)}px` });
 const air = document.createElement('canvas');
 air.className = 'dust-air';
 air.width = Math.round(area.width * fine);
 air.height = Math.round(area.height * fine);
 box.append(still, air);
 layer.append(box);
 el.style.visibility = 'hidden';

 const context = air.getContext('2d'), paper = still.getContext('2d'), sheet = context.createImageData(air.width, air.height), out = sheet.data;
 const width = air.width, height = air.height, scale = fine / ratio, size = Math.max(1, Math.round(step * scale));
 const ox = ROOM.left * fine - grains.left * scale, oy = ROOM.top * fine - grains.top * scale;
 let loose = 0, began = 0;
 const tick = time => {
  if (!box.isConnected) return;
  began ||= time;
  const t = time - began;
  // Grains whose moment has come leave the picture.
  for (; loose < order.length && start[order[loose]] <= t; loose++) paper.clearRect(gx[order[loose]], gy[order[loose]], step, step);
  out.fill(0);
  let flying = 0;
  for (let n = 0; n < loose; n++) {
   const k = order[n], age = t - start[k], span = life[k];
   if (age >= span) continue;
   flying++;
   const s = age / 1000, part = age / span;
   const px = Math.round(ox + gx[k] * scale + (vx[k] * s + FLIGHT.wind * s * s * 0.5 + Math.sin(s * swing[k] + phase[k]) * sway[k] * part) * fine);
   const py = Math.round(oy + gy[k] * scale + (vy[k] * s - FLIGHT.lift * s * s * 0.5) * fine);
   if (px < 0 || py < 0 || px + size > width || py + size > height) continue;
   const c = k * 4, alpha = color[c + 3] * (1 - part) ** 1.7;
   for (let dy = 0; dy < size; dy++) {
    let at = ((py + dy) * width + px) * 4;
    for (let dx = 0; dx < size; dx++, at += 4) {
     if (out[at + 3] >= alpha) continue;
     out[at] = color[c];
     out[at + 1] = color[c + 1];
     out[at + 2] = color[c + 2];
     out[at + 3] = alpha;
    }
   }
  }
  context.putImageData(sheet, 0, 0);
  if (loose < order.length || flying) requestAnimationFrame(tick);
  else layer.remove();
 };
 requestAnimationFrame(tick);
 return true;
}

window.Dust = { away };
})();
