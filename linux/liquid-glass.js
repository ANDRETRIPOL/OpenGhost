(() => {
'use strict';

const NS = 'http://www.w3.org/2000/svg';
const MAP_SCALE = 2;
const DEFAULTS = { zoom: 1.15, edge: 6, band: 7 };

let defs = null;
let count = 0;

function svg(tag, attrs) {
 const el = document.createElementNS(NS, tag);
 for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
 return el;
}

function host() {
 if (defs) return defs;
 const root = svg('svg', { width: 0, height: 0, 'aria-hidden': 'true' });
 root.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
 defs = svg('defs', {});
 root.append(defs);
 document.body.append(root);
 return defs;
}

function paintMap(width, height, radius, { zoom, edge, band }) {
 const pw = Math.ceil(width * MAP_SCALE), ph = Math.ceil(height * MAP_SCALE);
 const cx = width / 2, cy = height / 2, hx = cx - radius, hy = cy - radius, pull = 1 - 1 / zoom;
 const vectors = new Float32Array(pw * ph * 2);
 let max = 0.001;
 for (let j = 0; j < ph; j++) {
  for (let i = 0; i < pw; i++) {
   const x = (i + 0.5) / MAP_SCALE, y = (j + 0.5) / MAP_SCALE;
   const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy;
   let nx = 0, ny = 0, depth;
   if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy);
    nx = qx / len;
    ny = qy / len;
    depth = radius - len;
   } else if (qx > qy) {
    nx = 1;
    depth = radius - qx;
   } else {
    ny = 1;
    depth = radius - qy;
   }
   nx *= Math.sign(x - cx) || 1;
   ny *= Math.sign(y - cy) || 1;
   const bend = edge * (1 - Math.min(1, Math.max(0, depth) / band)) ** 2;
   const k = (j * pw + i) * 2;
   vectors[k] = (cx - x) * pull - nx * bend;
   vectors[k + 1] = (cy - y) * pull - ny * bend;
   max = Math.max(max, Math.abs(vectors[k]), Math.abs(vectors[k + 1]));
  }
 }
 const canvas = document.createElement('canvas');
 canvas.width = pw;
 canvas.height = ph;
 const ctx = canvas.getContext('2d'), image = ctx.createImageData(pw, ph);
 for (let p = 0; p < pw * ph; p++) {
  image.data[p * 4] = 128 + vectors[p * 2] / max * 127;
  image.data[p * 4 + 1] = 128 + vectors[p * 2 + 1] / max * 127;
  image.data[p * 4 + 2] = 128;
  image.data[p * 4 + 3] = 255;
 }
 ctx.putImageData(image, 0, 0);
 return { href: canvas.toDataURL(), scale: max * 2 };
}

class LiquidGlass {
 constructor(element, options = {}) {
  this.element = element;
  this.options = { ...DEFAULTS, ...options };
  this.id = `liquid-glass-${++count}`;
  this.image = svg('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'map' });
  this.displace = svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G' });
  this.filter = svg('filter', { id: this.id, x: 0, y: 0, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
  this.filter.append(this.image, this.displace);
  host().append(this.filter);
  this.size = '';
  this.timer = 0;
  element.style.setProperty('--glass-lens', `url(#${this.id})`);
  const { width, height } = options;
  if (width && height) this.resize(width, height);
  else new ResizeObserver(() => this.schedule()).observe(element);
 }

 schedule() {
  clearTimeout(this.timer);
  this.timer = setTimeout(() => this.resize(this.element.offsetWidth, this.element.offsetHeight), 120);
 }

 resize(width, height) {
  const size = `${width}x${height}`;
  if (!width || !height || size === this.size) return;
  this.size = size;
  const radius = Math.min(this.options.radius ?? height / 2, width / 2, height / 2);
  const { href, scale } = paintMap(width, height, radius, this.options);
  for (const el of [this.filter, this.image]) { el.setAttribute('width', width); el.setAttribute('height', height); }
  this.image.setAttribute('href', href);
  this.displace.setAttribute('scale', scale.toFixed(2));
 }
}

window.LiquidGlass = LiquidGlass;
})();
