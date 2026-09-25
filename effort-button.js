(() => {
'use strict';

const SEGMENTS = 4;
const SEGMENT = { width: 22, height: 11, gap: 8 };
const VIEW_WIDTH = SEGMENTS * SEGMENT.width + (SEGMENTS - 1) * SEGMENT.gap;
const DIM = .25;
const HOVER_DIM = .42;

class EffortButton extends IconButton {
 static get observedAttributes(){return [...super.observedAttributes,'expanded']}
 constructor(){
  const segments=Array.from({length:SEGMENTS},(_,i)=>`<rect class="segment" x="${i*(SEGMENT.width+SEGMENT.gap)}" y="${30-SEGMENT.height/2}" width="${SEGMENT.width}" height="${SEGMENT.height}" rx="${SEGMENT.height/2}"/>`).join('');
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_WIDTH} 60" aria-hidden="true">
    <g class="glyph" fill="currentColor">${segments}</g>
   </svg>`,{level:[500,45],hint:[230,27]},`
   :host{width:auto}
   button{padding:0 8px;border-radius:calc(var(--icon-button-size,34px)/2)}
   .icon{width:calc(var(--icon-size,16px)*${VIEW_WIDTH/60});height:var(--icon-size,16px)}`);
  this.icon=this.shadowRoot.querySelector('.icon');
  this.segments=[...this.shadowRoot.querySelectorAll('.segment')];
  this.levelGoal=0;
 }
 get expanded(){return this.hasAttribute('expanded')}
 defaultLabel(){return I18n.t('effort')}
 activate(e){this.dispatchEvent(new CustomEvent('effort-toggle',{bubbles:true,composed:true,detail:{keyboard:e.detail===0}}))}
 setLevel(level,instant=false){
  this.levelGoal=level;
  if(instant)this.s.level=[level,0];
  this.wake();
 }
 segmentShapes(){
  const [r,g,b]=getComputedStyle(this.button).color.match(/[\d.]+/g).map(Number),glyph=Number(this.glyph.style.opacity||1);
  return this.segments.map(segment=>({rect:segment.getBoundingClientRect(),rgb:[r,g,b],alpha:Number(segment.style.opacity||1)*glyph}));
 }
 hideSegments(hidden){this.icon.style.visibility=hidden?'hidden':''}
 sync(){this.button.setAttribute('aria-haspopup','dialog');this.button.setAttribute('aria-expanded',String(this.expanded))}
 targets(hover,reduced){return {level:this.levelGoal,hint:reduced?0:Math.max(hover,this.expanded?1:0)}}
 render(v){
  const dim=DIM+(HOVER_DIM-DIM)*v.hint;
  this.segments.forEach((segment,i)=>{segment.style.opacity=String(dim+(1-dim)*Math.min(1,Math.max(0,v.level-i+1)))});
 }
}
if(!customElements.get('effort-button'))customElements.define('effort-button',EffortButton);
})();
