'use strict';
// Actual Scrollbar module with deterministic DOM/event/clock fixtures. No application profile or live model.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'scrollbar.js'),'utf8'),results=[];
const check=(name,ok)=>{assert.ok(ok,name);results.push(name)};
function fixture({autoHide=true,top=0,height=1000,client=200,reduced=false}={}){
 let now=0,seq=0;const timers=new Map(),frames=new Map();
 class Element{
  constructor(){this.listeners=new Map();this.style={};this.tokens=new Set();this.captures=new Set();this.classList={add:k=>this.tokens.add(k),remove:k=>this.tokens.delete(k),contains:k=>this.tokens.has(k),toggle:(k,on)=>{if(on)this.tokens.add(k);else this.tokens.delete(k);return !!on}}}
  addEventListener(name,fn,options){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push({fn,options})}
  emit(name,event={}){event.target??=this;event.preventDefault??=()=>{event.prevented=true};for(const {fn}of this.listeners.get(name)||[])fn(event);return event}
  querySelector(){return this.thumb}
  getBoundingClientRect(){return {top:0,left:0,width:12,height:this.clientHeight}}
  setPointerCapture(id){this.captures.add(id)}
  hasPointerCapture(id){return this.captures.has(id)}
  releasePointerCapture(id){this.captures.delete(id);this.emit('lostpointercapture',{pointerId:id})}
 }
 const viewport=new Element(),track=new Element(),thumb=new Element();track.thumb=thumb;track.clientHeight=200;viewport.clientHeight=client;viewport.scrollHeight=height;viewport.firstElementChild=new Element();
 let position=top;Object.defineProperty(viewport,'scrollTop',{get:()=>position,set:n=>{const next=Math.max(0,Math.min(viewport.scrollHeight-viewport.clientHeight,n));if(next!==position){position=next;viewport.emit('scroll')}}});
 viewport.scrollBy=options=>{viewport.lastScrollBy=options;viewport.scrollTop+=options.top};
 const context={window:{matchMedia:()=>({matches:reduced})},performance:{now:()=>now},setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{at:now+ms,fn});return id},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{const id=++seq;frames.set(id,{at:now+16,fn});return id},ResizeObserver:class{constructor(fn){this.fn=fn;this.nodes=[]}observe(node){this.nodes.push(node)}}};
 vm.runInNewContext(source,context,{filename:'scrollbar.js'});const bar=autoHide===undefined?new context.window.Scrollbar(viewport,track):new context.window.Scrollbar(viewport,track,{autoHide});
 const advance=ms=>{const until=now+ms;let steps=0;for(;;){let due=Infinity;for(const list of [timers,frames])for(const item of list.values())due=Math.min(due,item.at);if(due>until)break;assert.ok(++steps<20000,'No runaway animation loop');now=due;for(const [id,item]of [...timers])if(item.at<=now&&timers.delete(id))item.fn();for(const [id,item]of [...frames])if(item.at<=now&&frames.delete(id))item.fn(now)}now=until};
 const active=()=>track.classList.contains('is-scroll-active');
 const wheel=(deltaY,deltaMode=0)=>viewport.emit('wheel',{deltaY,deltaMode});
 const down=(target=thumb,button=0)=>track.emit('pointerdown',{target,button,pointerId:7,clientY:50});
 return {bar,viewport,track,thumb,timers,frames,advance,active,wheel,down};
}
{
 const f=fixture({autoHide:false});check('Existing scrollbars remain scrollable without opt-in',f.bar.visible&&f.track.classList.contains('is-scrollable'));check('Existing scrollbars do not get the auto-hide class',!f.track.classList.contains('is-auto-hide'));f.viewport.scrollTop=80;f.wheel(20);f.advance(2000);check('Existing scrollbars keep their old behavior and create no idle timer',!f.active()&&f.timers.size===0&&f.track.classList.contains('is-scrollable'));check('Only auto-hidden tracks intercept wheel events',!f.track.listeners.has('wheel'));
}
{
 const f=fixture({top:120});check('Auto-hide is explicitly opted in',f.track.classList.contains('is-auto-hide'));check('Overflow alone does not reveal the indicator',f.bar.visible&&!f.active());check('A restored position is not moved or treated as fresh scrolling',f.viewport.scrollTop===120&&f.timers.size===0);f.bar.resize.fn();f.viewport.emit('input');f.viewport.emit('scroll');check('Resize, input and unchanged scroll events do not reveal an idle indicator',!f.active()&&f.timers.size===0);
 f.viewport.scrollTop=160;check('Real scroll movement reveals the indicator',f.active());check('Activity creates exactly one idle timer',f.timers.size===1);const geometry=JSON.stringify([f.bar.target,f.thumb.style.height,f.thumb.style.transform,f.viewport.scrollTop]);f.advance(999);check('The indicator stays present through the idle grace period',f.active());f.advance(1);check('The indicator hides after one second without scrolling',!f.active()&&f.timers.size===0);check('Hiding keeps overflow state, scroll position and thumb geometry',f.track.classList.contains('is-scrollable')&&geometry===JSON.stringify([f.bar.target,f.thumb.style.height,f.thumb.style.transform,f.viewport.scrollTop]));check('An idle indicator needs no animation loop',f.frames.size===0);
}
{
 const f=fixture();f.viewport.scrollTop=60;f.advance(700);f.viewport.scrollTop=120;f.advance(700);check('Continuing to scroll extends visibility from the latest movement',f.active());check('Repeated activity never stacks hide timers',f.timers.size===1);f.advance(300);check('The refreshed deadline eventually hides the indicator',!f.active());f.viewport.scrollTop=180;f.advance(600);f.bar.update();f.advance(400);check('Layout updates do not keep the indicator alive indefinitely',!f.active());
}
{
 const f=fixture();f.wheel(100,0);check('A vertical wheel gesture reveals the indicator before the native scroll event',f.active());f.advance(1000);f.wheel(0,0);check('A horizontal-only gesture does not reveal the vertical indicator',!f.active());f.wheel(-60,0);check('An attempt to scroll past the top still reveals edge feedback',f.active()&&f.bar.edges.top.amp>0);f.advance(400);check('The existing elastic edge animation still settles',f.frames.size===0);f.advance(600);check('Edge feedback does not leave the indicator permanently visible',!f.active());
 const bottom=fixture({top:800});bottom.wheel(50);check('An attempt past the bottom also reveals the indicator',bottom.active()&&bottom.bar.edges.bottom.amp>0);
}
{
 const f=fixture();f.viewport.scrollTop=100;f.down();check('Dragging captures the pointer and suspends the hide timer',!!f.bar.drag&&f.track.hasPointerCapture(7)&&f.timers.size===0);f.advance(2500);check('A held thumb does not disappear even when the pointer rests',f.active()&&f.track.classList.contains('is-dragging'));const before=f.viewport.scrollTop;f.track.emit('pointermove',{pointerId:7,clientY:75});check('Dragging still moves the viewport',f.viewport.scrollTop>before);f.track.emit('pointerup',{pointerId:7});check('Release clears dragging and capture',!f.bar.drag&&!f.track.hasPointerCapture(7)&&!f.track.classList.contains('is-dragging'));check('Release restarts one idle timer',f.active()&&f.timers.size===1);f.advance(1000);check('The indicator hides after release',!f.active());
}
for(const event of ['pointercancel','lostpointercapture']){
 const f=fixture();f.viewport.scrollTop=100;f.down();if(event==='lostpointercapture')f.track.captures.delete(7);f.track.emit(event,{pointerId:7});check(event+': dragging cannot leave a stuck indicator',!f.bar.drag&&!f.track.classList.contains('is-dragging'));f.advance(1000);check(event+': the idle indicator hides again',!f.active());
}
{
 const f=fixture();f.down(f.thumb,2);check('A non-primary pointer button does not start a drag or reveal the indicator',!f.bar.drag&&!f.active());f.down(f.track);check('Clicking the visible track preserves page scrolling',f.viewport.lastScrollBy.behavior==='smooth'&&f.viewport.scrollTop>0&&f.active());
}
for(const [mode,delta,expected]of [[0,30,30],[1,2,32],[2,1,200]]){
 const f=fixture();const event=f.track.emit('wheel',{deltaY:delta,deltaMode:mode});check('Wheel over the indicator forwards '+['pixels','lines','pages'][mode]+' to the sidebar',event.prevented&&f.viewport.scrollTop===expected&&f.active());
}
{
 const f=fixture();const event=f.track.emit('wheel',{deltaY:0,deltaX:30,deltaMode:0});check('A horizontal gesture over the track is not hijacked',!event.prevented&&!f.active());
 f.viewport.scrollTop=120;f.viewport.scrollHeight=200;f.bar.update();check('Removing overflow immediately clears activity and its timer',!f.bar.visible&&!f.active()&&f.timers.size===0);f.viewport.scrollHeight=1000;f.bar.update();check('New overflow without scrolling stays idle',f.bar.visible&&!f.active());
 const empty=fixture({height:200});empty.wheel(120);empty.viewport.emit('scroll');empty.down();check('A list that fits never reveals a useless indicator',!empty.bar.visible&&!empty.active()&&empty.timers.size===0);
}
{
 const f=fixture({reduced:true});f.wheel(-100);check('Reduced motion retains visibility feedback without an edge animation',f.active()&&f.frames.size===0);f.advance(1000);check('Reduced motion still hides the idle indicator',!f.active());
}
{
 const f=fixture();f.viewport.scrollTop=80;f.advance(600);f.viewport.scrollHeight=200;f.advance(400);
 check('Idle completion refreshes geometry if the list shrank after its last scroll',!f.bar.visible&&!f.active()&&!f.track.classList.contains('is-scrollable'));
 check('Final geometry refresh needs no repeating timer or extra DOM observer',f.timers.size===0&&f.bar.target.max===0&&!f.bar.contentWatch);
}
const script=fs.readFileSync(path.join(root,'script.js'),'utf8'),css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
check('Only the sidebar opts into auto-hide in application startup',script.includes("new Scrollbar(document.querySelector('.chats-scroll'), document.querySelector('.chats-scrollbar'), { autoHide: true })")&&(script.match(/autoHide:\s*true/g)||[]).length===1);
check('Idle styling removes invisible pointer interception without changing layout',/\.scrollbar\.is-auto-hide\.is-scrollable:not\(\.is-scroll-active\):not\(\.is-dragging\)\s*\{\s*opacity:\s*0;\s*pointer-events:\s*none;\s*\}/.test(css));
check('Only opted-in indicators lose their fade with reduced motion',/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.scrollbar\.is-auto-hide\s*\{\s*transition:\s*none;/.test(css));
const resizeRule=css.match(/^\.sidebar-resize\s*\{([\s\S]*?)\}/m)?.[1]||'',resizeMark=css.match(/^\.sidebar-resize::after\s*\{([\s\S]*?)\}/m)?.[1]||'';
const offset=-Number(resizeRule.match(/left:\s*calc\(var\(--sidebar-size\)\s*-\s*([\d.]+)px\)/)?.[1]),markLeft=Number(resizeMark.match(/left:\s*(-?[\d.]+)px/)?.[1]);
const hit=Number(css.match(/--scrollbar-hit-width:\s*([\d.]+)px/)?.[1]),hover=Number(css.match(/--scrollbar-hover-width:\s*([\d.]+)px/)?.[1]);
check('The sidebar resize hit area no longer covers even the expanded scroll thumb',offset>=-(hit-hover)/2);
check('The sidebar resize hit area keeps its full previous width',Number(resizeRule.match(/width:\s*([\d.]+)px/)?.[1])===12);
check('The resize mark stays in its old visual position without intercepting the thumb',offset+markLeft===-5.5&&/pointer-events:\s*none/.test(resizeMark));
check('The folded resize handle keeps the same hit-area offset',/\.app\.is-sidebar-resizing\.is-sidebar-collapsed \.sidebar-resize\s*\{\s*left:\s*calc\(var\(--chat-gap\) - 3px\)/.test(css));
for(const name of results)console.log('ok  '+name);console.log('\n'+results.length+' checks passed');
