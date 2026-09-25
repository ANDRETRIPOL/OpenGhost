(() => {
'use strict';

const FRAME_X = 32.75;
const SPLIT_OPEN = 52;
const SPLIT_CLOSED = 41;
const HOVER_NUDGE = 3;

class SidebarToggle extends IconButton {
 static get observedAttributes(){return [...super.observedAttributes,'collapsed']}
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <defs><clipPath id="frame"><rect x="32.75" y="39" width="54.5" height="42" rx="11"/></clipPath></defs>
    <g class="glyph">
     <rect class="pane" x="32.75" y="39" width="19.25" height="42" clip-path="url(#frame)" fill="currentColor" opacity=".3"/>
     <rect x="32.75" y="39" width="54.5" height="42" rx="11" stroke="currentColor" stroke-width="5.5"/>
     <line class="split" x1="52" y1="39" x2="52" y2="81" stroke="currentColor" stroke-width="5.5"/>
    </g>
   </svg>`,{split:[120,20],nudge:[230,27]});
  this.pane=this.shadowRoot.querySelector('.pane');this.split=this.shadowRoot.querySelector('.split');
 }
 get collapsed(){return this.hasAttribute('collapsed')}
 defaultLabel(){return I18n.t(this.collapsed?'sidebar.show':'sidebar.hide')}
 activate(){this.dispatchEvent(new CustomEvent('sidebar-toggle',{bubbles:true,composed:true}))}
 snap(){this.s.split=[this.collapsed?1:0,0]}
 sync(){this.button.setAttribute('aria-expanded',String(!this.collapsed))}
 targets(hover,reduced){return {split:this.collapsed?1:0,nudge:reduced?0:hover*(this.collapsed?1:-1)}}
 render(v){
  const x=SPLIT_OPEN+(SPLIT_CLOSED-SPLIT_OPEN)*v.split+v.nudge*HOVER_NUDGE;
  this.split.setAttribute('x1',x);this.split.setAttribute('x2',x);
  this.pane.setAttribute('width',Math.max(0,x-FRAME_X));
 }
}
if(!customElements.get('sidebar-toggle'))customElements.define('sidebar-toggle',SidebarToggle);
})();
