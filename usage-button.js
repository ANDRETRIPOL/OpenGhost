(() => {
'use strict';

// The sidebar's Usage button, at the far end of the row Settings stands in: a gauge, its needle a drop standing upright.
// Under the pointer the needle swings over and settles, as a gauge finding its reading; while the usage is out it
// stays there.
const SWING = 46;
const PIVOT = '60 61.3';

class UsageButton extends IconButton {
 static get observedAttributes(){return [...super.observedAttributes,'active']}
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph">
     <path class="dial" d="M44.44 77.06A22 22 0 1 1 75.56 77.06" stroke="currentColor" stroke-linecap="round"/>
     <path class="needle" d="M60 44.92C56.85 50.8 52.65 55.42 52.65 61.3a7.35 7.35 0 0 0 14.7 0C67.35 55.42 63.15 50.8 60 44.92Z" fill="currentColor"/>
    </g>
   </svg>`,{swing:[150,13]},`
   .dial{stroke-width:var(--icon-stroke,6)}
   :host([active]) button{color:rgb(var(--icon-hover-rgb,var(--icon-rgb,255,255,255)))}
   :host([active]) .icon{opacity:var(--icon-hover-opacity,.85)}`);
  this.needle=this.shadowRoot.querySelector('.needle');
 }
 defaultLabel(){return I18n.t('settings.usage')}
 activate(e){this.dispatchEvent(new CustomEvent('usage-open',{bubbles:true,composed:true,detail:{keyboard:e.detail===0}}))}
 targets(hover,reduced){return {swing:reduced?0:Math.max(hover,this.hasAttribute('active')?1:0)}}
 render(v){this.needle.setAttribute('transform',`rotate(${(v.swing*SWING).toFixed(2)} ${PIVOT})`)}
}
if(!customElements.get('usage-button'))customElements.define('usage-button',UsageButton);
})();
