(() => {
'use strict';

const HOVER_TURN = 90;

class CloseButton extends IconButton {
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph">
     <g class="cross" stroke="currentColor" stroke-linecap="round">
      <path d="M45 45 75 75"/>
      <path d="M75 45 45 75"/>
     </g>
    </g>
   </svg>`,{turn:[170,22]},`button{border-radius:50%}.cross{stroke-width:var(--icon-stroke,6)}`);
  this.cross=this.shadowRoot.querySelector('.cross');
 }
 defaultLabel(){return I18n.t('button.close')}
 activate(){this.dispatchEvent(new CustomEvent('dismiss',{bubbles:true,composed:true}))}
 targets(hover,reduced){return {turn:reduced?0:hover}}
 render(v){this.cross.setAttribute('transform',`rotate(${v.turn*HOVER_TURN} 60 60)`)}
}
if(!customElements.get('close-button'))customElements.define('close-button',CloseButton);
})();
