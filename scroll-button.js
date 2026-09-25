(() => {
'use strict';

const NUDGE = 5;

class ScrollButton extends IconButton {
 constructor() {
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph">
     <g class="arrow" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M60 36v47"/>
      <path d="M41 64 60 83 79 64"/>
     </g>
    </g>
   </svg>`, { nudge: [230, 27] }, `
   button{border-radius:50%}
   button:focus-visible::after{inset:-3px}`);
  this.arrow = this.shadowRoot.querySelector('.arrow');
 }
 defaultLabel() { return I18n.t('thread.bottom'); }
 activate() { this.dispatchEvent(new CustomEvent('scroll-bottom', { bubbles: true, composed: true })); }
 targets(hover, reduced) { return { nudge: reduced ? 0 : hover }; }
 render(v) {
  this.arrow.setAttribute('transform', `translate(0 ${v.nudge * NUDGE})`);
  this.button.style.transform = `scale(${1 - v.press * 0.08})`;
 }
}
if (!customElements.get('scroll-button')) customElements.define('scroll-button', ScrollButton);
})();
