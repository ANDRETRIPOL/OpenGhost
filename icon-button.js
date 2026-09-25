(() => {
'use strict';

const STYLE=`
:host{display:inline-block;width:var(--icon-button-size,32px);height:var(--icon-button-size,32px);vertical-align:middle;-webkit-app-region:no-drag}
*{box-sizing:border-box}
button{display:grid;place-items:center;position:relative;width:100%;height:100%;border:0;padding:0;border-radius:8px;outline:none;background:transparent;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;color:rgb(var(--icon-rgb,255,255,255));transition:color .2s ease}
/* Цвет непрозрачный, а уровень задаёт opacity всей иконки: иначе полупрозрачные линии светлеют на пересечениях. */
.icon{width:var(--icon-size,22px);height:var(--icon-size,22px);overflow:visible;pointer-events:none;opacity:var(--icon-opacity,.55);transition:opacity .2s ease}
button:hover,button:focus-visible{color:rgb(var(--icon-hover-rgb,var(--icon-rgb,255,255,255)))}
button:hover .icon,button:focus-visible .icon{opacity:var(--icon-hover-opacity,.85)}
button:disabled{cursor:default;color:rgb(var(--icon-rgb,255,255,255))}
button:disabled .icon{opacity:var(--icon-disabled-opacity,.25)}
button:focus-visible::after{content:"";position:absolute;inset:0;border-radius:inherit;border:2px solid rgba(255,255,255,.35);pointer-events:none}
`;

class IconButton extends HTMLElement {
 static get observedAttributes(){return ['disabled','label']}
 constructor(svg,springs,css=''){
  super();
  this.attachShadow({mode:'open',delegatesFocus:true}).innerHTML=`<style>${STYLE}${css}</style><button type="button">${svg}</button>`;
  this.button=this.shadowRoot.querySelector('button');this.glyph=this.shadowRoot.querySelector('.glyph');
  this.springs={press:[230,27],...springs};
  this.s=Object.fromEntries(Object.keys(this.springs).map(name=>[name,[0,0]]));
  this.hover=false;this.down=false;this.raf=0;this.last=0;
  this.tick=this.tick.bind(this);
  this.button.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'){this.hover=true;this.wake()}});
  this.button.addEventListener('pointerleave',()=>{this.hover=false;this.down=false;this.wake()});
  this.button.addEventListener('pointerdown',e=>{if(this.button.disabled||e.button!==0)return;this.down=true;this.wake()});
  this.release=()=>{if(this.down){this.down=false;this.wake()}};
  this.button.addEventListener('pointercancel',this.release);
  this.button.addEventListener('keydown',e=>{if(!e.repeat&&(e.key===' '||e.key==='Enter')){this.down=true;this.wake()}});
  this.button.addEventListener('keyup',this.release);
  this.button.addEventListener('blur',()=>{this.down=false;this.wake()});
  this.button.addEventListener('click',e=>{this.down=false;this.wake();this.activate(e)});
 }
 connectedCallback(){
  window.addEventListener('pointerup',this.release);window.addEventListener('blur',this.release);
  this.snap();this.attributeChangedCallback();this.wake();
 }
 disconnectedCallback(){cancelAnimationFrame(this.raf);this.raf=0;window.removeEventListener('pointerup',this.release);window.removeEventListener('blur',this.release)}
 attributeChangedCallback(){
  if(!this.button)return;
  this.button.disabled=this.hasAttribute('disabled');
  this.button.setAttribute('aria-label',this.getAttribute('label')||this.defaultLabel());
  if(this.button.disabled){this.hover=false;this.down=false}
  this.sync();this.wake();
 }
 defaultLabel(){return ''}
 activate(){}
 snap(){}
 sync(){}
 targets(){return {}}
 render(){}
 wake(){if(!this.isConnected||this.raf)return;this.last=performance.now();this.raf=requestAnimationFrame(this.tick)}
 tick(now){
  this.raf=0;const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dt=Math.min((now-this.last)/1000,.032);this.last=now;
  const hover=this.hover&&!this.button.disabled?1:0;
  const target={press:this.down?1:0,...this.targets(hover,reduced)};
  let moving=false;
  for(const name of Object.keys(this.s)){
   const s=this.s[name],goal=target[name],[k,c]=this.springs[name];
   if(reduced){s[0]=goal;s[1]=0;continue}
   const steps=Math.max(1,Math.ceil(dt/.008)),h=dt/steps;
   for(let i=0;i<steps;i++){s[1]+=((goal-s[0])*k-s[1]*c)*h;s[0]+=s[1]*h}
   if(Math.abs(goal-s[0])>.0005||Math.abs(s[1])>.002)moving=true;else{s[0]=goal;s[1]=0}
  }
  const v=Object.fromEntries(Object.entries(this.s).map(([name,s])=>[name,s[0]]));
  this.glyph.setAttribute('transform',`translate(0 ${v.press*2})`);
  this.glyph.style.opacity=String(1-v.press*.3);
  this.render(v);
  if(moving)this.raf=requestAnimationFrame(this.tick);
 }
}
window.IconButton=IconButton;
})();
