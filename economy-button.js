(() => {
'use strict';

// The composer's button for economy (economy.js): a leaf, as an ECO mode is drawn, with its midrib and stalk. Without
// economy it is in the button's own colour; with a size or Ghost Max picked it takes the colour the arc gives that
// place (economy-arc.js), and the arc's knob flies out of it when the menu opens and back into it when it closes.
// Drawn in the button's 60-unit box, the line of the plus and the shield; the midrib quieter than the leaf.
const LEAF = 'M42 78C37.4 54.4 56.4 35.4 80 40C84.6 63.6 65.6 82.6 42 78Z';
const RIB = 'M42 78L70 50';
const STALK = 'M42 78L35.5 84.5';

class EconomyButton extends IconButton {
 static get observedAttributes() { return [...super.observedAttributes, 'expanded']; }
 constructor() {
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph leaf">
     <path class="edge" d="${LEAF}" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
     <path class="rib" d="${RIB}" stroke="currentColor" stroke-linecap="round"/>
     <path class="stalk" d="${STALK}" stroke="currentColor" stroke-linecap="round"/>
    </g>
   </svg>`, { hint: [230, 27] }, `
   .edge,.stalk{stroke-width:5.5}
   .rib{stroke-width:5;opacity:.5}
   .leaf{transition:color .35s ease}`);
  this.leaf = this.shadowRoot.querySelector('.leaf');
  this.tint = '';
 }
 get expanded() { return this.hasAttribute('expanded'); }
 defaultLabel() { return I18n.t('economy'); }
 activate(e) { this.dispatchEvent(new CustomEvent('economy-toggle', { bubbles: true, composed: true, detail: { keyboard: e.detail === 0 } })); }
 sync() { this.button.setAttribute('aria-haspopup', 'dialog'); this.button.setAttribute('aria-expanded', String(this.expanded)); }
 // How far the chat saves (0 for none) and the colour of that place ('' for none): the leaf takes the colour.
 setPlace(share, tint = '') {
  if (tint === this.tint) return;
  this.tint = tint;
  this.leaf.style.color = share > 0 || tint ? tint : '';
 }
 // Where the arc's knob comes from and goes back to: the leaf's middle.
 knobBox() {
  const box = this.leaf.getBoundingClientRect(), size = Math.min(box.width, box.height) * 0.7;
  return new DOMRect(box.left + box.width / 2 - size / 2, box.top + box.height / 2 - size / 2, size, size);
 }
 hideKnob(hidden) { this.leaf.style.visibility = hidden ? 'hidden' : ''; }
 targets() { return { hint: this.expanded ? 1 : 0 }; }
 render() {}
}
if (!customElements.get('economy-button')) customElements.define('economy-button', EconomyButton);
})();
