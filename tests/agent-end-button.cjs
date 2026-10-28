'use strict';
// Actual SendButton state/measurement/rendering, controller sync methods and Chat.stop/abort. DOM/transport are fixtures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');let count=0;const check=(name,pass)=>{assert.ok(pass,name);count++;console.log('ok  '+name)};
const classes=new Map();
class IconFixture{
 static get observedAttributes(){return ['disabled','label']}
 constructor(html,springs,css){this.attrs=new Map();this.events=[];this.listeners=new Map();this.offsetWidth=this.offsetHeight=34;this.springs={press:[230,27],...springs};this.html=html;this.css=css;this.button={style:{},disabled:false};this.words={textContent:'',style:{},get offsetWidth(){return this.textContent.length*7.5}};this.arrow={setAttribute:(k,v)=>{this.arrow[k]=v}};this.shadowRoot={querySelector:s=>s==='.arrow'?this.arrow:this.words};}
 getAttribute(k){return this.attrs.get(k)??null}hasAttribute(k){return this.attrs.has(k)}setAttribute(k,v){this.attrs.set(k,String(v));this.changed()}removeAttribute(k){if(this.attrs.delete(k))this.changed()}toggleAttribute(k,on){if(this.hasAttribute(k)===!!on)return !!on;on?this.attrs.set(k,''):this.attrs.delete(k);this.changed();return on}attributeChangedCallback(){this.changed();this.wake()}changed(){this.button.disabled=this.hasAttribute('disabled');this.sync?.();this.button.label=this.defaultLabel?.()}
 wake(){}
 dispatchEvent(e){this.events.push(e);this.listeners.get(e.type)?.(e);return true}addEventListener(k,fn){this.listeners.set(k,fn)}
}
const t=key=>({'button.send':'Отправить','composer.suggest':'Отправить рекомендацию','composer.stop':'Остановить агента','composer.stopping':'Остановка агента'}[key]||key);
const c={window:{matchMedia:()=>({matches:false})},IconButton:IconFixture,I18n:{t},customElements:{get:k=>classes.get(k),define:(k,v)=>classes.set(k,v)},CustomEvent:class{constructor(type,options){Object.assign(this,{type,...options})}},console,AbortController,Skills:{blocks:()=>''},Usage:{parts:()=>null},UserContext:{pictures:()=>[]}};vm.createContext(c);vm.runInContext(read('send-button.js'),c);const S=classes.get('send-button');const button=()=>new S();
const b=button();check('The shared send component observes its stop mode',S.observedAttributes.includes('stop'));
check('End keeps the exact existing width and press spring constants',JSON.stringify(b.springs.wide)==='[190,24]'&&JSON.stringify(b.springs.press)==='[230,27]');
b.configure();check('Empty idle composer stays disabled without End or a caption',b.hasAttribute('disabled')&&!b.hasAttribute('stop')&&!b.hasAttribute('caption')&&!b.hasAttribute('working'));
b.configure({empty:false});b.activate();check('A normal draft still sends an ordinary message',b.events.at(-1).type==='composer-send'&&!b.hasAttribute('disabled')&&!b.hasAttribute('caption'));
check('Composer actions still bubble across the shadow boundary',b.events.at(-1).bubbles&&b.events.at(-1).composed);
b.configure({busy:true,empty:true});check('An empty working composer offers an enabled End',b.hasAttribute('stop')&&b.hasAttribute('working')&&b.getAttribute('caption')==='End'&&!b.hasAttribute('disabled'));
check('Accessible name contains visible End and localized action',b.defaultLabel()==='End · Остановить агента');
const originalT=c.I18n.t;c.I18n.t=key=>key==='composer.stop'?'Stop agent':originalT(key);b.configure({busy:true,empty:true});check('Reconfiguration refreshes language even when End and all mode attributes are unchanged',b.button.label==='End · Stop agent');c.I18n.t=originalT;b.configure({busy:true,empty:true});
check('The stop glyph is a square and its words are positioned after it',b.html.includes('class="stop-mark"')&&b.css.includes(':host([stop]) .caption{left:'));
const extent=b.targets(1,false).wide;check('End grows using measured caption width, not a fixed guessed width',extent===39.5&&b.long===73.5);
check('End does not lift its stop symbol like an upward send arrow',b.targets(1,false).lift===0);
b.render({wide:extent/2,lift:0,press:0});check('The same spring renders intermediate widths rather than jumping',parseFloat(b.button.style.width)===34+extent/2&&Number(b.words.style.opacity)>0&&Number(b.words.style.opacity)<1);
b.render({wide:extent,lift:0,press:1});check('Expanded End shows the whole caption and keeps pressed feedback',b.words.style.opacity==='1'&&b.button.style.transform==='scale(0.94)');
const n=b.events.length;b.activate();b.activate();check('End emits stop, never send, and blocks an immediate second press',b.events.length===n+1&&b.events.at(-1).type==='composer-stop'&&b.hasAttribute('disabled'));
b.configure({busy:true,empty:true,stopping:true});check('A pending cancellation remains disabled and is announced',b.hasAttribute('disabled')&&b.defaultLabel()==='End · Остановка агента');
b.configure({busy:true,empty:false});check('Typing during work restores recommendation sending, not stopping',!b.hasAttribute('stop')&&!b.hasAttribute('disabled')&&b.getAttribute('caption')===t('composer.suggest')&&b.hasAttribute('working'));
const longer=b.targets(1,false).wide;check('Different caption lengths have different spring targets',longer>extent);
b.activate();check('Recommendations dispatch the original send event',b.events.at(-1).type==='composer-send');
b.configure({busy:true,empty:true});check('Returning from a recommendation to End animates toward the shorter width',b.targets(0,false).wide===extent);
b.configure({busy:false,empty:true});check('Completion restores the disabled ordinary send arrow',!b.hasAttribute('stop')&&!b.hasAttribute('working')&&!b.hasAttribute('caption')&&b.hasAttribute('disabled')&&b.targets(0,false).wide===0);
check('The old caption remains available while its collapse fades out',b.words.textContent==='End');
b.configure({empty:false});check('Idle sending keeps its existing hover animation',b.targets(1,false).lift===1&&b.targets(1,true).lift===0);
const other=button();other.configure({busy:true,empty:true});check('One composer cannot change another composer’s state',!b.hasAttribute('stop')&&other.hasAttribute('stop'));
// Exercise the actual main sync method, not a rewritten controller.
let text='',files=0;const classesNoop={toggle(){}};const active={id:'active',turn:null};const chat={active,prediction:'',get busy(){return !!this.active?.turn},forget(){}};
Object.assign(c,{chat,composerSend:button(),composerText:{text:()=>text},attachments:{get count(){return files}},composerActions:{classList:classesNoop},composerField:{dataset:{predicted:''},classList:classesNoop},composerInput:{value:'',setAttribute(){}},composerPlaceholder:{textContent:'',firstChild:{textContent:''}}});
const mainSource=read('script.js'),at=mainSource.indexOf('function syncComposer()'),end=mainSource.indexOf('// Each chat keeps',at);vm.runInContext(mainSource.slice(at,end),c);
c.syncComposer();check('Main controller reflects idle state',c.composerSend.hasAttribute('disabled')&&!c.composerSend.hasAttribute('stop'));
const newTurn=()=>({controller:new AbortController(),approvals:new Set(),queue:[],pills:[]});active.turn=newTurn();c.syncComposer();check('Main controller shows End on the active running chat',c.composerSend.hasAttribute('stop')&&!c.composerSend.hasAttribute('disabled'));
text='Уточни вывод';c.syncComposer();check('Main controller still sends a typed recommendation',!c.composerSend.hasAttribute('stop')&&c.composerSend.getAttribute('caption')===t('composer.suggest'));
text='';files=1;c.syncComposer();check('An attachment-only recommendation is not treated as an empty Stop request',!c.composerSend.hasAttribute('stop')&&!c.composerSend.hasAttribute('disabled'));
files=0;active.turn.controller.abort();c.syncComposer();check('Main controller disables End while its existing request is cancelling',c.composerSend.hasAttribute('stop')&&c.composerSend.hasAttribute('disabled'));
chat.active={id:'other',turn:null};c.syncComposer();check('Switching to an idle chat does not expose another agent’s End',!c.composerSend.hasAttribute('stop'));chat.active=active;
// The same configure method is called by real mini/quick sync methods.
c.MiniChat={signal(){}};const miniSource=read('mini-chat.js'),ms=miniSource.indexOf('\n sync() {'),me=miniSource.indexOf('\n // Clearing asks twice',ms);vm.runInContext(`class MiniSync{${miniSource.slice(ms,me)}};window.MiniSync=MiniSync`,c);
const mini={chat,send:button(),text:{text:()=>text},attachments:{get count(){return files}},field:{classList:classesNoop},input:{value:''},clearButton:{classList:classesNoop},disarm(){}};active.turn=newTurn();c.window.MiniSync.prototype.sync.call(mini);check('The actual mini controller exposes End for its own busy agent',mini.send.hasAttribute('stop'));
c.settings={show(){}};c.library={update(){}};c.quick={working(){}};const quickSource=read('quick-chat.js'),qs=quickSource.indexOf('\n sync() {'),qe=quickSource.indexOf('\n submit() {',qs);vm.runInContext(`class QuickSync{${quickSource.slice(qs,qe)}};window.QuickSync=QuickSync`,c);
chat.conversations=new Map([['active',active]]);const widget=()=>({classList:classesNoop,toggleAttribute(){}});const quick={...mini,send:button(),has:true,was:false,away:false,newButton:widget(),expandButton:widget(),clearButton:widget(),effort:{follow(){},lock(){}},models:{sync(){}}};c.window.QuickSync.prototype.sync.call(quick);check('The actual quick controller exposes End for its own busy agent',quick.send.hasAttribute('stop'));
text='Рекомендация';c.window.MiniSync.prototype.sync.call(mini);c.window.QuickSync.prototype.sync.call(quick);check('Both compact composers preserve recommendation sending during work',!mini.send.hasAttribute('stop')&&!quick.send.hasAttribute('stop')&&mini.send.getAttribute('caption')===t('composer.suggest')&&quick.send.getAttribute('caption')===t('composer.suggest'));text='';
// Native stop delegates to the actual Chat cancellation path, including tools and approvals.
for(const file of ['agent-plan.js','plan-proof.js','chat.js']){vm.runInContext(read(file),c);for(const name of ['AgentPlan','PlanProof'])if(c.window[name])c[name]=c.window[name]}
const cancel=[];c.AgentTools={cancel:tool=>cancel.push('tool:'+tool)};const C=c.window.Chat;chat.stop=C.prototype.stop;chat.abort=C.prototype.abort;active.turn=newTurn();active.turn.tool='fixture-tool';active.turn.release=value=>cancel.push('release:'+value);active.turn.approvals.add({card:{settle:value=>cancel.push('approval:'+value)}});active.turn.skillCard={settle:value=>cancel.push('skill:'+value)};active.ask={settle:()=>cancel.push('ask')};active.turn.queue.push({prompt:'keep'});c.syncComposer();
const binding=mainSource.split('\n').find(line=>line.startsWith("composerSend.addEventListener('composer-stop'"));vm.runInContext(binding,c);c.composerSend.activate();
check('Pressing End reaches the real AbortController',active.turn.controller.signal.aborted);
check('End cancels the current tool and releases pending work',cancel.includes('tool:fixture-tool')&&cancel.includes('release:abort'));
check('Pending approval, skill and question cards use the existing cancellation path',cancel.includes('approval:deny')&&cancel.includes('skill:deny')&&cancel.includes('ask'));
check('Stop does not clear the user’s queued recommendation',active.turn.queue.length===1&&active.turn.queue[0].prompt==='keep');
const calls=cancel.length;c.composerSend.activate();check('A repeated stop press cannot repeat cancellation work',cancel.length===calls);
for(const source of [miniSource,quickSource])check('Compact composer has the actual stop event binding',source.includes("this.send.addEventListener('composer-stop', () => { this.chat.stop(); this.sync(); });"));
for(const file of ['i18n.js','i18n-ru.js','i18n-fr.js','i18n-it.js'])check(file+': localized stop and stopping labels exist',read(file).includes("'composer.stop':")&&read(file).includes("'composer.stopping':"));
const rgb=read('styles.css').match(/--send-end-bg:\s*(\d+),\s*(\d+),\s*(\d+)/).slice(1).map(Number),linear=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}),contrast=1.05/(.2126*linear[0]+.7152*linear[1]+.0722*linear[2]+.05);check('End uses the exact coral color requested in the reference',rgb.join(',')==='255,77,87');check('White stop icon retains at least 3:1 non-text contrast',contrast>=3);check('Square and caption share cap-height sizing and semibold weight',b.css.includes('--end-cap:round(up,1cap,1px)')&&b.css.includes('text-box:trim-both cap alphabetic')&&b.css.includes('font-weight:600'));
// Font pixels are controlled here; the full application test measures real Chromium/native pixels.
let reads=0;const draw=[];
class CanvasFixture{
 constructor(){this.width=0;this.height=0;this.style={};this.context={globalAlpha:1,scale(){},measureText:()=>({width:9,actualBoundingBoxAscent:10,actualBoundingBoxDescent:0}),fillText(){},clearRect(){},
  getImageData:()=>{reads++;const data=new Uint8ClampedArray(this.width*this.height*4),x=Math.round(34*(c.window.devicePixelRatio||1));for(let y=4;y<=14;y++)for(let col=x;col<x+7;col++){const i=(y*this.width+col)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=y===4?80:y===14?120:255}return{data}},
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:data=>{this.data=data.data},drawImage:(image,x,y)=>draw.push({image,x,y,alpha:this.context.globalAlpha})};}
 getContext(){return this.context}
}
c.document={createElement:()=>new CanvasFixture()};c.getComputedStyle=el=>el===b.button?{color:'rgb(0,0,0)',getPropertyValue:()=> '255,255,255'}:{font:'600 15px system-ui',letterSpacing:'0px',fontKerning:'auto'};
b.configure({busy:true,empty:true});b.ink=new CanvasFixture();b.button.classList={add(){},remove(){}};b.button.getBoundingClientRect=()=>({left:.4,top:.4});
check('Hidden or disconnected End safely retains its CSS fallback',b.prepareEnd(34,1.5)===null);
b.isConnected=true;c.window.devicePixelRatio=1.5;const bitmap=b.prepareEnd(34,1.5);
check('End bitmap uses device pixels rather than a guessed CSS cap size',bitmap.glyph.width===Math.ceil(b.long*1.5)&&bitmap.glyph.height===51&&bitmap.n===11);
check('End raster uses its target white palette, never an in-flight black send color',bitmap.glyph.context.fillStyle==='rgb(255,255,255)');
check('Stop square keeps the exact first and last alpha rows of E',bitmap.top===4&&bitmap.square.data[(5*4)+3]===80&&bitmap.square.data[((10*11+5)*4)+3]===120);
check('The cap-sized stop square retains rounded corners',bitmap.square.data[3]===0&&bitmap.square.data[((5*11+5)*4)+3]===255);
b.endBitmap=bitmap;const before=reads;b.paintEnd(34,1);b.paintEnd(34,1);
check('Unchanged End frames reuse the bitmap without scanning font pixels again',reads===before&&draw.length===2);
check('The shared End layer snaps a fractional origin onto the device pixel grid',b.ink.style.left===`${1/1.5-.4}px`&&b.ink.style.top===`${1/1.5-.4}px`);
b.paintEnd(34,.5);check('Caption keeps its existing reveal while the square stays opaque',draw.at(-2).alpha===1&&draw.at(-1).alpha===.5&&draw.at(-1).x===6);
c.window.devicePixelRatio=2;b.paintEnd(34,1);check('A device-scale change rebuilds the cached End raster',b.endBitmap.dpr===2&&reads===before+1&&b.ink.width===Math.ceil(b.long*2));
b.refreshEnd();check('Resize and font refresh invalidate only the visual cache',b.endBitmap===null&&b.hasAttribute('stop')&&!b.button.disabled);
console.log(`\n${count} checks passed`);
