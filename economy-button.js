(() => {
'use strict';

// The composer's button for economy (economy.js): the arc the menu opens to (economy-arc.js), small, with its knob
// where the chat's size stands. Without economy the knob rests at the start of the arc in the button's own colour; the
// further the chat saves, the further along it goes, in the arc's colour for that place.
// The arc in the button's 60-unit box: its centre, its radius, and where it starts and ends, in degrees (0 to the right,
// counter-clockwise): the left side of a circle, "(", from the top down, as the menu's.
const ARC = { cx: 73, cy: 60, r: 21, from: 105, to: 255 };
// The knob: its radius, and the ring of the composer's own colour round it, as the arc's knob stands on its track.
const KNOB = 8.5;
const RING = 2.5;

const point = (deg, r = ARC.r) => [ARC.cx + r * Math.cos(deg * Math.PI / 180), ARC.cy - r * Math.sin(deg * Math.PI / 180)];

class EconomyButton extends IconButton {
 static get observedAttributes() { return [...super.observedAttributes, 'expanded']; }
 constructor() {
  const [x0, y0] = point(ARC.from), [x1, y1] = point(ARC.to);
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph">
     <path class="arc" d="M${x0.toFixed(2)} ${y0.toFixed(2)}A${ARC.r} ${ARC.r} 0 0 0 ${x1.toFixed(2)} ${y1.toFixed(2)}" stroke="currentColor" stroke-linecap="round"/>
     <circle class="knob" r="${KNOB}" fill="currentColor" stroke-width="${RING}"/>
    </g>
   </svg>`, { place: [260, 30], hint: [230, 27] }, `
   .arc{stroke-width:8;opacity:.42;transition:opacity .2s ease}
   .knob{stroke:var(--composer-bg,#1e1e1e)}
   button:hover .arc,button:focus-visible .arc{opacity:.6}
   .knob{transition:fill .35s ease}`);
  this.arc = this.shadowRoot.querySelector('.arc');
  this.knob = this.shadowRoot.querySelector('.knob');
  this.goal = 0;
  this.tint = '';
 }
 get expanded() { return this.hasAttribute('expanded'); }
 defaultLabel() { return I18n.t('economy'); }
 activate(e) { this.dispatchEvent(new CustomEvent('economy-toggle', { bubbles: true, composed: true, detail: { keyboard: e.detail === 0 } })); }
 sync() { this.button.setAttribute('aria-haspopup', 'dialog'); this.button.setAttribute('aria-expanded', String(this.expanded)); }
 // Where the knob stands, from 0 (no economy) to 1 (the last stop), and the colour it takes there ('' for none).
 setPlace(share, tint = '', instant = false) {
  this.goal = Math.min(1, Math.max(0, share));
  if (instant) this.s.place = [this.goal, 0];
  if (tint !== this.tint) {
   this.tint = tint;
   this.knob.style.fill = tint || '';
  }
  this.wake();
 }
 knobBox() { return this.knob.getBoundingClientRect(); }
 hideKnob(hidden) { this.knob.style.visibility = hidden ? 'hidden' : ''; }
 targets() { return { place: this.goal, hint: this.expanded ? 1 : 0 }; }
 render(v) {
  const [x, y] = point(ARC.from + (ARC.to - ARC.from) * v.place);
  this.knob.setAttribute('cx', x.toFixed(2));
  this.knob.setAttribute('cy', y.toFixed(2));
 }
}
if (!customElements.get('economy-button')) customElements.define('economy-button', EconomyButton);
})();
