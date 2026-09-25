(() => {
'use strict';

const RX = [10, 3.5];

class BrowserToggle extends IconButton {
 static get observedAttributes(){return [...super.observedAttributes,'open','live']}
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <defs><clipPath id="globe"><circle cx="60" cy="60" r="22"/></clipPath></defs>
    <g class="glyph">
     <circle class="fill" cx="60" cy="60" r="22" fill="currentColor" opacity="0"/>
     <circle cx="60" cy="60" r="22" stroke="currentColor" stroke-width="5.5"/>
     <g clip-path="url(#globe)"><ellipse class="meridian" cx="60" cy="60" rx="10" ry="22" stroke="currentColor" stroke-width="5.5"/></g>
     <line x1="38.5" y1="60" x2="81.5" y2="60" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/>
    </g>
    <circle class="live" cx="83" cy="37" r="6" fill="currentColor"/>
   </svg>`,{spin:[170,19],open:[170,24]},`
   .live{opacity:0;transform-origin:83px 37px;transform-box:view-box}
   :host([live]) .live{opacity:1;animation:live 1.6s ease-in-out infinite}
   @keyframes live{50%{opacity:.35;transform:scale(.75)}}
   @media (prefers-reduced-motion: reduce){:host([live]) .live{animation:none}}`);
  this.fill=this.shadowRoot.querySelector('.fill');this.meridian=this.shadowRoot.querySelector('.meridian');
 }
 get open(){return this.hasAttribute('open')}
 defaultLabel(){return I18n.t(this.open?'browser.hide':'browser.show')}
 activate(){this.dispatchEvent(new CustomEvent('browser-toggle',{bubbles:true,composed:true}))}
 snap(){this.s.open=[this.open?1:0,0]}
 sync(){this.button.setAttribute('aria-expanded',String(this.open))}
 targets(hover,reduced){return {spin:reduced?0:hover,open:this.open?1:0}}
 render(v){
  const rx=RX[0]+(RX[1]-RX[0])*v.spin;
  this.meridian.setAttribute('rx',Math.max(0.5,rx));
  this.meridian.setAttribute('cx',60+v.spin*2.5);
  this.fill.setAttribute('opacity',(v.open*.3).toFixed(3));
 }
}
if(!customElements.get('browser-toggle'))customElements.define('browser-toggle',BrowserToggle);
})();
