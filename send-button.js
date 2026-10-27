(() => {
'use strict';

const HOVER_LIFT = 6;
// The long button: room for the words before the arrow, and how far into the growth the words begin to show.
const CAPTION_PAD = 15, CAPTION_FROM = .45;

class SendButton extends IconButton {
 static get observedAttributes(){return [...super.observedAttributes,'caption','stop']}
 constructor(){
  super(`
   <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="30 30 60 60" fill="none" aria-hidden="true">
    <g class="glyph">
     <g class="arrow" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M60 84V37"/>
      <path d="M41 56 60 37 79 56"/>
     </g>
    </g>
   </svg><span class="stop-mark" aria-hidden="true"></span><span class="caption" aria-hidden="true"><span></span></span>`,{lift:[230,27],wide:[190,24]},`
   :host{position:relative}
   button{position:absolute;right:0;top:0;place-items:center end;padding-right:calc((var(--icon-button-size,32px) - var(--icon-size,22px))/2);border-radius:calc(var(--icon-button-size,32px)/2);background:rgb(var(--send-bg,250,250,250));font:inherit}
   button:focus-visible::after{inset:-4px}
   .arrow,.stop-mark{transition:opacity .16s ease}
   .stop-mark{--end-cap:round(up,1cap,1px);position:absolute;left:calc((var(--icon-button-size,32px) - var(--end-cap))/2);top:50%;translate:0 -50%;width:var(--end-cap);height:var(--end-cap);border-radius:2px;background:currentColor;font-size:15px;font-weight:600;pointer-events:none;opacity:0}
   :host([stop]) button{place-items:center start;padding-left:calc((var(--icon-button-size,32px) - 20px)/2);padding-right:0;background:rgb(var(--send-end-bg,255,77,87));color:rgb(var(--send-end-ink,255,255,255));transition:background-color .18s ease,color .18s ease,opacity .18s ease}
   :host([stop]) .icon{opacity:0}
   :host([stop]) .arrow{opacity:0}
   :host([stop]) .stop-mark{opacity:1}
   :host([stop]) .caption{left:calc(var(--icon-button-size,32px) - 2px);right:0;display:flex;align-items:center}
   :host([stop]) .caption span{position:relative;left:2px;top:auto;height:auto;display:block;font-size:15px;font-weight:600;text-box:trim-both cap alphabetic}
   :host([stop][disabled]) button{opacity:.65}
   @media(prefers-reduced-motion:reduce){button,.arrow,.stop-mark{transition:none!important}}
   .caption{position:absolute;left:0;top:0;bottom:0;right:calc(var(--icon-button-size,32px) - 2px);overflow:hidden;pointer-events:none}
   .caption span{position:absolute;left:${CAPTION_PAD}px;top:0;height:100%;display:flex;align-items:center;font-size:13px;font-weight:600;line-height:1;white-space:nowrap;opacity:0}`);
  this.arrow=this.shadowRoot.querySelector('.arrow');this.words=this.shadowRoot.querySelector('.caption span');this.long=0;
 }
 // The same slot sends a message or stops work. Typing during work still sends a suggestion, never a stop.
 configure({busy=false,empty=true,stopping=false}={}){
  const stop=!!busy&&!!empty,caption=stop?'End':busy&&!empty?I18n.t('composer.suggest'):'';
  this.toggleAttribute('working',!!busy);
  this.toggleAttribute('stop',stop);
  this.toggleAttribute('disabled',stop?!!stopping:!!empty);
  if(caption){if(this.getAttribute('caption')!==caption)this.setAttribute('caption',caption)}
  else this.removeAttribute('caption');
  // A compact composer may have been measured while hidden; refresh its size and language even with unchanged mode.
  this.attributeChangedCallback();
 }
 defaultLabel(){return this.hasAttribute('stop')?`End · ${I18n.t(this.hasAttribute('disabled')?'composer.stopping':'composer.stop')}`:this.getAttribute('caption')||I18n.t('button.send')}
 // The very same 190/24 spring as the suggestion. Measure its travel in pixels so changing caption lengths is smooth too.
 sync(){
  const caption=this.getAttribute('caption');
  if(!caption||!this.words)return;
  this.words.textContent=caption;
  this.long=CAPTION_PAD+this.words.offsetWidth+(this.offsetHeight||this.offsetWidth)+2;
 }
 activate(){
  if(this.hasAttribute('disabled'))return;
  const stop=this.hasAttribute('stop');
  if(stop)this.setAttribute('disabled','');
  this.dispatchEvent(new CustomEvent(stop?'composer-stop':'composer-send',{bubbles:true,composed:true}));
 }
 targets(hover,reduced){const size=this.offsetHeight||this.offsetWidth;return {lift:reduced||this.hasAttribute('stop')?0:hover,wide:this.hasAttribute('caption')?Math.max(0,this.long-size):0}}
 render(v){
  const size=this.offsetHeight||this.offsetWidth,progress=v.wide/Math.max(1,this.long-size),ink=Math.max(0,Math.min(1,(progress-CAPTION_FROM)/(1-CAPTION_FROM)));
  this.button.style.width=v.wide>.001?`${size+Math.max(0,v.wide)}px`:'';
  this.words.style.opacity=String(ink);
  this.words.style.transform=`translateX(${(1-ink)*8}px)`;
  this.arrow.setAttribute('transform',`translate(0 ${-v.lift*HOVER_LIFT})`);
  this.button.style.transform=`scale(${1-v.press*.06})`;
 }
}
if(!customElements.get('send-button'))customElements.define('send-button',SendButton);
})();
