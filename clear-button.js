(() => {
'use strict';

const LID = { x: -1, y: -3, turn: -14 };

// A trash can whose lid lifts under the pointer. Armed, it waits for a second press: red, with the lid held open.
class ClearButton extends IconButton {
 static get observedAttributes(){return ['disabled','label','armed']}
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
     <path class="lid" d="M40 45h40M53.5 45v-4.5a3.5 3.5 0 0 1 3.5-3.5h6a3.5 3.5 0 0 1 3.5 3.5V45"/>
     <path d="M45 45l2.3 28.4a4 4 0 0 0 4 3.6h17.4a4 4 0 0 0 4-3.6L75 45M55.5 55v12M64.5 55v12"/>
    </g>
   </svg>`,{lift:[260,22]},`button{border-radius:50%;transition:color .2s ease,background-color .2s ease}.glyph{stroke-width:var(--icon-stroke,5.5)}:host([armed]) button{color:rgb(var(--danger-rgb));background:rgba(var(--danger-rgb),.14)}:host([armed]) .icon{opacity:1}`);
  this.lid=this.shadowRoot.querySelector('.lid');
 }
 defaultLabel(){return I18n.t('mini.clear')}
 activate(){this.dispatchEvent(new CustomEvent('clear',{bubbles:true,composed:true}))}
 targets(hover,reduced){return {lift:reduced?0:Math.max(hover,this.hasAttribute('armed')?1:0)}}
 render(v){this.lid.setAttribute('transform',`translate(${LID.x*v.lift} ${LID.y*v.lift}) rotate(${LID.turn*v.lift} 60 45)`)}
}
if(!customElements.get('clear-button'))customElements.define('clear-button',ClearButton);
})();
