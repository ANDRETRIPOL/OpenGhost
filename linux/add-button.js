(() => {
'use strict';

const HOVER_TURN = 90;

class AddButton extends IconButton {
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph">
     <g class="plus" stroke="currentColor" stroke-linecap="round">
      <path d="M60 39V81"/>
      <path d="M39 60H81"/>
     </g>
    </g>
   </svg>`,{turn:[170,22]},`.plus{stroke-width:var(--icon-stroke,6)}`);
  this.plus=this.shadowRoot.querySelector('.plus');
 }
 defaultLabel(){return I18n.t('button.add')}
 activate(){this.dispatchEvent(new CustomEvent('add',{bubbles:true,composed:true}))}
 targets(hover,reduced){return {turn:reduced?0:hover}}
 render(v){this.plus.setAttribute('transform',`rotate(${v.turn*HOVER_TURN} 60 60)`)}
}
if(!customElements.get('add-button'))customElements.define('add-button',AddButton);
})();
