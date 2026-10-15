(() => {
'use strict';

const HOVER_LIFT = 6;
// The long button: room for the words before the arrow, and how far into the growth the words begin to show.
const CAPTION_PAD = 15, CAPTION_FROM = .45;

class SendButton extends IconButton {
 static get observedAttributes(){return [...super.observedAttributes,'caption']}
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph">
     <g class="arrow" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M60 84V37"/>
      <path d="M41 56 60 37 79 56"/>
     </g>
    </g>
   </svg><span class="caption" aria-hidden="true"><span></span></span>`,{lift:[230,27],wide:[190,24]},`
   :host{position:relative}
   button{position:absolute;right:0;top:0;place-items:center end;padding-right:calc((var(--icon-button-size,32px) - var(--icon-size,22px))/2);border-radius:calc(var(--icon-button-size,32px)/2);background:rgb(var(--send-bg,250,250,250));font:inherit}
   button:focus-visible::after{inset:-4px}
   .caption{position:absolute;left:0;top:0;bottom:0;right:calc(var(--icon-button-size,32px) - 2px);overflow:hidden;pointer-events:none}
   .caption span{position:absolute;left:${CAPTION_PAD}px;top:0;height:100%;display:flex;align-items:center;font-size:13px;font-weight:600;line-height:1;white-space:nowrap;opacity:0}`);
  this.arrow=this.shadowRoot.querySelector('.arrow');this.words=this.shadowRoot.querySelector('.caption span');this.long=0;
 }
 defaultLabel(){return this.getAttribute('caption')||I18n.t('button.send')}
 // With a caption the button grows to the left into a long one that says it; the words stay while it shrinks back.
 sync(){
  const caption=this.getAttribute('caption');
  if(!caption||!this.words)return;
  this.words.textContent=caption;
  this.long=CAPTION_PAD+this.words.offsetWidth+this.offsetWidth+2;
 }
 activate(){this.dispatchEvent(new CustomEvent('composer-send',{bubbles:true,composed:true}))}
 targets(hover,reduced){return {lift:reduced?0:hover,wide:this.hasAttribute('caption')?1:0}}
 render(v){
  const size=this.offsetWidth,ink=Math.max(0,Math.min(1,(v.wide-CAPTION_FROM)/(1-CAPTION_FROM)));
  this.button.style.width=v.wide>.001?`${size+Math.max(0,this.long-size)*v.wide}px`:'';
  this.words.style.opacity=String(ink);
  this.words.style.transform=`translateX(${(1-ink)*8}px)`;
  this.arrow.setAttribute('transform',`translate(0 ${-v.lift*HOVER_LIFT})`);
  this.button.style.transform=`scale(${1-v.press*.06})`;
 }
}
if(!customElements.get('send-button'))customElements.define('send-button',SendButton);
})();
