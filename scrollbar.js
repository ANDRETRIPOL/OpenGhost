(() => {
'use strict';

const PAD = 2;
const MIN_THUMB = 24;
const MAX_SQUISH = 0.25;
const SQUISH_RESISTANCE = 40;
const SQUISH_DURATION = 280;
const GESTURE_GAP = 200;
const ARRIVAL_WINDOW = 400;
const SIZE_SPRING = [260, 32];

const clampSquish = value => Math.min(MAX_SQUISH, Math.max(0, value));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const squishAt = (edge, now) => {
 const u = (now - edge.start) / SQUISH_DURATION;
 return u > 0 && u < 1 ? edge.amp * Math.sin(Math.PI * u) ** 2 : 0;
};

class Scrollbar {
 constructor(viewport,track){
  this.viewport=viewport;this.track=track;this.thumb=track.querySelector('.scrollbar-thumb');
  this.target=null;this.size=[0,0];this.visible=false;this.raf=0;this.last=0;this.drag=null;
  this.scrollTop=viewport.scrollTop;
  this.edges={top:{wheel:-Infinity,force:0,start:-Infinity,amp:0},bottom:{wheel:-Infinity,force:0,start:-Infinity,amp:0}};
  this.tick=this.tick.bind(this);
  viewport.addEventListener('scroll',()=>this.onScroll());
  viewport.addEventListener('input',()=>this.update());
  viewport.addEventListener('wheel',e=>this.onWheel(e),{passive:true});
  const resize=this.resize=new ResizeObserver(()=>this.update());
  resize.observe(viewport);resize.observe(track);
  if(viewport.firstElementChild)resize.observe(viewport.firstElementChild);
  track.addEventListener('mousedown',e=>e.preventDefault());
  track.addEventListener('pointerdown',e=>this.onPointerDown(e));
  track.addEventListener('pointermove',e=>this.onPointerMove(e));
  track.addEventListener('pointerup',e=>this.onPointerUp(e));
  track.addEventListener('pointercancel',e=>this.onPointerUp(e));
  this.update();
 }
 observe(el){this.resize.observe(el)}
 update(){
  const v=this.viewport,max=v.scrollHeight-v.clientHeight,scrollable=max>1;
  const trackH=this.track.clientHeight-2*PAD;
  const h=scrollable?Math.max(MIN_THUMB,trackH*v.clientHeight/v.scrollHeight):trackH;
  const ratio=scrollable?Math.min(1,Math.max(0,v.scrollTop/max)):(this.target?this.target.ratio:0);
  this.target={h,trackH,max,ratio};
  if(scrollable&&!this.visible)this.size=[h,0];
  this.visible=scrollable;
  this.track.classList.toggle('is-scrollable',scrollable);
  this.render();
  if(this.size[0]!==h)this.wake();
 }
 thumbTop(){const {trackH,ratio}=this.target;return PAD+(trackH-this.size[0])*ratio}
 render(now=performance.now()){
  if(!this.target)return;
  const h=this.size[0],t=this.thumbTop();
  const cutTop=h*clampSquish(squishAt(this.edges.bottom,now)),cutBottom=h*clampSquish(squishAt(this.edges.top,now));
  this.thumb.style.height=`${h-cutTop-cutBottom}px`;
  this.thumb.style.transform=`translateY(${t+cutTop}px)`;
 }
 onScroll(){
  const v=this.viewport,max=v.scrollHeight-v.clientHeight,prev=this.scrollTop,top=v.scrollTop,now=performance.now();
  this.scrollTop=top;
  if(max>1&&top>=max-1&&prev<max-1&&now-this.edges.bottom.wheel<ARRIVAL_WINDOW)this.bump(this.edges.bottom,now,true);
  else if(max>1&&top<=0&&prev>0&&now-this.edges.top.wheel<ARRIVAL_WINDOW)this.bump(this.edges.top,now,true);
  this.update();
 }
 onWheel(e){
  const v=this.viewport,max=v.scrollHeight-v.clientHeight;
  if(max<=1||!e.deltaY)return;
  const down=e.deltaY>0,edge=this.edges[down?'bottom':'top'],now=performance.now();
  const fresh=now-edge.wheel>GESTURE_GAP;
  edge.wheel=now;
  edge.force=Math.max(fresh?0:edge.force,Math.abs(e.deltaY)*(e.deltaMode===1?16:1));
  if(down?v.scrollTop<max-1:v.scrollTop>0)return;
  this.bump(edge,now,fresh);
 }
 bump(edge,now,fresh){
  if(reducedMotion())return;
  const q=squishAt(edge,now),amp=MAX_SQUISH*(1-Math.exp(-edge.force/SQUISH_RESISTANCE));
  const rising=now-edge.start<SQUISH_DURATION/2;
  if(!fresh&&!(rising&&amp>edge.amp))return;
  edge.amp=Math.max(q,amp);
  if(!edge.amp)return;
  edge.start=now-SQUISH_DURATION*Math.asin(Math.sqrt(q/edge.amp))/Math.PI;
  this.wake();
 }
 onPointerDown(e){
  if(!this.visible||e.button!==0)return;
  if(e.target!==this.thumb){
   const y=e.clientY-this.track.getBoundingClientRect().top;
   this.viewport.scrollBy({top:(y<this.thumbTop()?-1:1)*this.viewport.clientHeight*.9,behavior:'smooth'});
   return;
  }
  this.drag={y:e.clientY,scroll:this.viewport.scrollTop};
  this.track.setPointerCapture(e.pointerId);
  this.track.classList.add('is-dragging');
 }
 onPointerMove(e){
  if(!this.drag||!this.visible)return;
  const {h,trackH,max}=this.target;
  this.viewport.scrollTop=this.drag.scroll+(e.clientY-this.drag.y)*max/Math.max(1,trackH-h);
 }
 onPointerUp(e){
  if(!this.drag)return;
  this.drag=null;
  if(this.track.hasPointerCapture(e.pointerId))this.track.releasePointerCapture(e.pointerId);
  this.track.classList.remove('is-dragging');
 }
 wake(){if(this.raf)return;this.last=performance.now();this.raf=requestAnimationFrame(this.tick)}
 tick(now){
  this.raf=0;
  const dt=Math.min((now-this.last)/1000,.032);this.last=now;
  const s=this.size,[sk,sc]=SIZE_SPRING,sizeGoal=this.target?this.target.h:s[0];
  if(reducedMotion()){s[0]=sizeGoal;s[1]=0}
  const steps=Math.max(1,Math.ceil(dt/.008)),step=dt/steps;
  for(let i=0;i<steps;i++){s[1]+=((sizeGoal-s[0])*sk-s[1]*sc)*step;s[0]+=s[1]*step}
  let moving=Math.abs(sizeGoal-s[0])>.05||Math.abs(s[1])>.05;
  if(!moving){s[0]=sizeGoal;s[1]=0}
  for(const edge of Object.values(this.edges))if(now-edge.start<SQUISH_DURATION)moving=true;
  this.render(now);
  if(moving)this.raf=requestAnimationFrame(this.tick);
 }
}
window.Scrollbar=Scrollbar;
})();
