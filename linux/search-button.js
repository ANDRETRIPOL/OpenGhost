(() => {
'use strict';

const HOVER_TILT = 14;

class SearchButton extends IconButton {
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph">
     <g class="lens" stroke="currentColor" stroke-linecap="round">
      <circle cx="54.5" cy="54.5" r="15.5"/>
      <path d="M65.5 65.5 81 81"/>
     </g>
    </g>
   </svg>`,{tilt:[230,27]},`button{border-radius:50%}.lens{stroke-width:var(--icon-stroke,6)}`);
  this.lens=this.shadowRoot.querySelector('.lens');
 }
 defaultLabel(){return I18n.t('search')}
 activate(e){this.dispatchEvent(new CustomEvent('search-open',{bubbles:true,composed:true,detail:{pointerType:e.pointerType||''}}))}
 targets(hover,reduced){return {tilt:reduced?0:hover}}
 render(v){this.lens.setAttribute('transform',`rotate(${-HOVER_TILT*v.tilt} 54.5 54.5)`)}
}
if(!customElements.get('search-button'))customElements.define('search-button',SearchButton);
})();
