(() => {
'use strict';

const HOVER_LIFT = 6;

class SendButton extends IconButton {
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph">
     <g class="arrow" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M60 84V37"/>
      <path d="M41 56 60 37 79 56"/>
     </g>
    </g>
   </svg>`,{lift:[230,27]},`
   button{border-radius:50%;background:rgb(var(--send-bg,250,250,250))}
   button:focus-visible::after{inset:-4px}`);
  this.arrow=this.shadowRoot.querySelector('.arrow');
 }
 defaultLabel(){return I18n.t('button.send')}
 activate(){this.dispatchEvent(new CustomEvent('composer-send',{bubbles:true,composed:true}))}
 targets(hover,reduced){return {lift:reduced?0:hover}}
 render(v){
  this.arrow.setAttribute('transform',`translate(0 ${-v.lift*HOVER_LIFT})`);
  this.button.style.transform=`scale(${1-v.press*.06})`;
 }
}
if(!customElements.get('send-button'))customElements.define('send-button',SendButton);
})();
