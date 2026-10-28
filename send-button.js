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
   </svg><span class="stop-mark" aria-hidden="true"></span><span class="caption" aria-hidden="true"><span></span></span><span class="stop-layer" aria-hidden="true"><canvas class="stop-ink"></canvas></span>`,{lift:[230,27],wide:[190,24]},`
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
   .stop-layer{display:none;position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .16s ease}
   .stop-ink{position:absolute;left:0;top:0}
   :host([stop]) button.raster-end .stop-layer{display:block;opacity:1}
   :host([stop]) button.raster-end .stop-mark{background:transparent}
   :host([stop]) button.raster-end .caption span{color:transparent}
   @media(prefers-reduced-motion:reduce){button,.arrow,.stop-mark,.stop-layer{transition:none!important}}
   .caption{position:absolute;left:0;top:0;bottom:0;right:calc(var(--icon-button-size,32px) - 2px);overflow:hidden;pointer-events:none}
   .caption span{position:absolute;left:${CAPTION_PAD}px;top:0;height:100%;display:flex;align-items:center;font-size:13px;font-weight:600;line-height:1;white-space:nowrap;opacity:0}`);
  this.arrow=this.shadowRoot.querySelector('.arrow');this.words=this.shadowRoot.querySelector('.caption span');this.ink=this.shadowRoot.querySelector('.stop-ink');this.long=0;
  this.endBitmap=null;this.endFrame='';this.refreshEnd=()=>{this.endBitmap=null;this.wake()};
 }
 connectedCallback(){
  super.connectedCallback();
  window.addEventListener('resize',this.refreshEnd);document.fonts?.addEventListener('loadingdone',this.refreshEnd);
  this.endObserver=new ResizeObserver(this.refreshEnd);this.endObserver.observe(this);
 }
 disconnectedCallback(){
  this.endObserver?.disconnect();window.removeEventListener('resize',this.refreshEnd);document.fonts?.removeEventListener('loadingdone',this.refreshEnd);
  super.disconnectedCallback();
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
  this.endBitmap=null;
  const caption=this.getAttribute('caption');
  if(!caption||!this.words)return;
  this.words.textContent=caption;
  this.long=CAPTION_PAD+this.words.offsetWidth+(this.offsetHeight||this.offsetWidth)+2;
 }
 // CSS cap-height and font hinting round independently at fractional DPI. Rasterize once at the current
 // device scale, then give the square the very same alpha rows as E. Both share one composited layer.
 prepareEnd(size,dpr){
  if(!this.ink?.getContext||!this.isConnected||!size||!this.long)return null;
  const style=getComputedStyle(this.words),glyph=document.createElement('canvas');
  glyph.width=Math.ceil(this.long*dpr);glyph.height=Math.ceil(size*dpr);
  const ctx=glyph.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
  ctx.scale(dpr,dpr);ctx.font=style.font;
  // Use the target palette, not a possibly interpolating send-to-End foreground color.
  ctx.fillStyle=`rgb(${getComputedStyle(this.button).getPropertyValue('--send-end-ink').trim()||'255,255,255'})`;
  ctx.letterSpacing=style.letterSpacing;ctx.fontKerning=style.fontKerning;
  const e=ctx.measureText('E'),x=Math.round(size*dpr),baseline=Math.round((glyph.height+(e.actualBoundingBoxAscent-e.actualBoundingBoxDescent)*dpr)/2);
  ctx.fillText('End',x/dpr,baseline/dpr);
  const image=ctx.getImageData(0,0,glyph.width,glyph.height),rows=new Uint8Array(glyph.height);
  let first=glyph.height,last=-1,best=0,colour=[255,255,255];
  for(let y=0;y<glyph.height;y++)for(let col=x;col<Math.min(glyph.width,Math.ceil(x+e.width*dpr));col++){
   const i=(y*glyph.width+col)*4,a=image.data[i+3];rows[y]=Math.max(rows[y],a);
   if(a>best){best=a;colour=[image.data[i],image.data[i+1],image.data[i+2]]}
   if(a){first=Math.min(first,y);last=Math.max(last,y)}
  }
  if(last<first)return null;
  const n=last-first+1,radius=Math.min(2*dpr,(n-2)/2),square=document.createElement('canvas');square.width=square.height=n;
  const mark=square.getContext('2d'),data=mark.createImageData(n,n),middle=n/2;
  for(let y=0;y<n;y++)for(let col=0;col<n;col++){
   const dx=Math.abs(col+.5-middle)-(middle-radius),dy=Math.abs(y+.5-middle)-(middle-radius);
   const distance=Math.hypot(Math.max(dx,0),Math.max(dy,0))+Math.min(Math.max(dx,dy),0)-radius;
   const coverage=Math.max(0,Math.min(1,.5-distance)),i=(y*n+col)*4;
   data.data[i]=colour[0];data.data[i+1]=colour[1];data.data[i+2]=colour[2];
   data.data[i+3]=Math.min(rows[first+y],rows[first+col],Math.round(255*coverage));
  }
  mark.putImageData(data,0,0);
  this.ink.width=glyph.width;this.ink.height=glyph.height;
  this.ink.style.width=`${glyph.width/dpr}px`;this.ink.style.height=`${glyph.height/dpr}px`;
  this.endFrame='';
  return {glyph,square,x,top:first,n,eWidth:e.width*dpr,left:Math.round((size*dpr-n)/2),size,dpr};
 }
 paintEnd(size,ink){
  const dpr=window.devicePixelRatio||1;
  if(!this.endBitmap||this.endBitmap.size!==size||this.endBitmap.dpr!==dpr)this.endBitmap=this.prepareEnd(size,dpr);
  const b=this.endBitmap;if(!b){this.button.classList?.remove('raster-end');return}
  // A fractional layer origin would resample the thin E differently from a solid square.
  const origin=this.button.getBoundingClientRect();
  this.ink.style.left=`${Math.round(origin.left*dpr)/dpr-origin.left}px`;
  this.ink.style.top=`${Math.round(origin.top*dpr)/dpr-origin.top}px`;
  const frame=String(ink);if(frame===this.endFrame)return;
  const ctx=this.ink.getContext('2d');ctx.clearRect(0,0,this.ink.width,this.ink.height);
  ctx.globalAlpha=1;ctx.drawImage(b.square,b.left,b.top);
  ctx.globalAlpha=ink;ctx.drawImage(b.glyph,(1-ink)*8*dpr,0);ctx.globalAlpha=1;
  this.button.classList.add('raster-end');this.endFrame=frame;
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
  if(this.hasAttribute('stop'))this.paintEnd(size,ink);
  this.arrow.setAttribute('transform',`translate(0 ${-v.lift*HOVER_LIFT})`);
  this.button.style.transform=`scale(${1-v.press*.06})`;
 }
}
if(!customElements.get('send-button'))customElements.define('send-button',SendButton);
})();
