(() => {
'use strict';

// The pencil's tip, which it turns about; and the line it writes on the sheet: where it lies, where it starts, how long
// it gets.
const TIP = [53, 67];
const LINE = { y: 73, from: 46, reach: 13 };
// Writing, the pencil leans back and moves along its line.
const WRITE = { lean: 8, slide: 5 };
// The flourish: how long the pencil writes by itself before it lets the line go (ms).
const FLOURISH = 720;

// A sheet with a pencil over its corner: the notes a user keeps beside a chat. Under the pointer the pencil writes a line
// on the sheet; ring() is the flourish it gives when the agent brings a note up or writes one down, the same line written
// by itself. `count` is how many notes still wait, `open` that they are out.
class NotesButton extends IconButton {
 static get observedAttributes(){return [...super.observedAttributes,'open','count']}
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
     <path d="M58 42H47a9 9 0 0 0-9 9v22a9 9 0 0 0 9 9h22a9 9 0 0 0 9-9V62"/>
     <line class="line" x1="${LINE.from}" y1="${LINE.y}" x2="${LINE.from}" y2="${LINE.y}" opacity="0"/>
     <g class="pen">
      <path d="M53 67l2.6-10.4 21.9-21.9a5.1 5.1 0 0 1 7.2 0l.6.6a5.1 5.1 0 0 1 0 7.2L63.4 64.4z"/>
      <path d="M73.5 38.7l7.8 7.8"/>
     </g>
    </g>
   </svg>`,{write:[170,19]},`
   :host(.is-ringing) .icon{animation:ring .7s cubic-bezier(.3,.7,.3,1)}
   @keyframes ring{0%{transform:none}32%{transform:scale(1.14)}100%{transform:none}}
   @media (prefers-reduced-motion: reduce){:host(.is-ringing) .icon{animation:none}}`);
  this.pen=this.shadowRoot.querySelector('.pen');this.line=this.shadowRoot.querySelector('.line');
  this.writing=false;this.flourish=0;
  this.shadowRoot.querySelector('.icon').addEventListener('animationend',()=>this.classList.remove('is-ringing'));
 }
 get open(){return this.hasAttribute('open')}
 get count(){return Number(this.getAttribute('count'))||0}
 defaultLabel(){return I18n.t(this.count?'notes.open.count':'notes.open',{n:this.count})}
 activate(e){this.dispatchEvent(new CustomEvent('notes-toggle',{bubbles:true,composed:true,detail:{keyboard:e.detail===0}}))}
 sync(){this.button.setAttribute('aria-expanded',String(this.open))}
 targets(hover,reduced){return {write:reduced?0:Math.max(hover,this.writing?1:0)}}
 ring(){
  this.classList.remove('is-ringing');void this.offsetWidth;this.classList.add('is-ringing');
  this.writing=true;clearTimeout(this.flourish);
  this.flourish=setTimeout(()=>{this.writing=false;this.wake()},FLOURISH);
  this.wake();
 }
 render(v){
  const write=v.write;
  this.pen.setAttribute('transform',`translate(${write*WRITE.slide} 0) rotate(${-write*WRITE.lean} ${TIP[0]} ${TIP[1]})`);
  this.line.setAttribute('x2',LINE.from+Math.max(0,write)*LINE.reach);
  this.line.setAttribute('opacity',Math.max(0,Math.min(1,write*5)));
 }
 // A copy of the glyph as it stands this moment, the pencil as far into its writing as it is, for the stage that grows
 // out of the button and keeps the glyph as its own. Only the press the button is under is left out of it.
 copy(){
  const svg=this.shadowRoot.querySelector('.icon').cloneNode(true),glyph=svg.querySelector('.glyph');
  svg.setAttribute('class','notepad-glyph');
  for(const name of ['transform','style'])glyph.removeAttribute(name);
  for(const node of svg.querySelectorAll('[class]'))node.removeAttribute('class');
  return svg;
 }
 // How far into its writing the pencil is; given back to the button when the stage hands the glyph over, so the pencil
 // goes on from the same place.
 get pose(){return this.s.write[0]}
 set pose(value){this.s.write=[value,0];this.render({write:value});this.wake()}
}
if(!customElements.get('notes-button'))customElements.define('notes-button',NotesButton);
window.NotesButton=NotesButton;
})();
