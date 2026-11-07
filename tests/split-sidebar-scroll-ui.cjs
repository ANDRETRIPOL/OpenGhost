'use strict';
// Full desktop client, disposable profile and local fixture data only. No live model or working profile.
const {app,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),output=fs.mkdtempSync(path.join(os.tmpdir(),'og-split-sidebar-'));
const baseline=process.argv.includes('--baseline');
for(const flag of ['disable-backgrounding-occluded-windows','disable-background-timer-throttling','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
for(const d of ['profile','session','workspace','workspace/project'])fs.mkdirSync(path.join(output,d),{recursive:true});
app.setName('OpenGhost sidebar visual check');app.setPath('userData',path.join(output,'profile'));app.setPath('sessionData',path.join(output,'session'));shell.writeShortcutLink=()=>true;delete process.env.OPENGHOST_UPDATE_AS;
const report={output,baseline,checks:[],errors:[],warnings:[],screenshots:[],pixels:[]};let win,ended=false;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function finish(error){
 if(ended)return;ended=true;if(error)report.error=String(error.stack||error);
 if(error&&win)try{report.selectionState=await win.webContents.executeJavaScript(`(()=>({main:chat.activeId,right:splitView.pane?.chat.activeId,list:chatList.chat.activeId,focused:splitView.currentChat.activeId,rows:[ids.a,ids.b].map(id=>{const e=chatList.rows.get(id).row,s=getComputedStyle(e);return{id,classes:e.className,focusVisible:e.matches(':focus-visible'),background:s.backgroundColor,shadow:s.boxShadow}})}))()`);report.state=await win.webContents.executeJavaScript(`(()=>{const r=chatList.rows.get(window.ids?.newer);return r?{classes:r.row.className,hovered:r.row.matches(':hover'),meta:getComputedStyle(r.row.querySelector('.chat-meta')).minWidth,body:r.row.querySelector('.chat-body').getBoundingClientRect().toJSON(),split:r.split.getBoundingClientRect().toJSON()}:null})()`);const p=path.join(output,'failure.png');fs.writeFileSync(p,(await win.webContents.capturePage()).toPNG());report.screenshots.push(p)}catch{}
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({output,checks:report.checks.length,failed:report.checks.filter(c=>!c.pass).map(c=>c.name),error:report.error||null}));app.exit(error?1:0);
}
process.stdout?.on('error',()=>{});process.stderr?.on('error',()=>{});process.on('uncaughtException',finish);process.on('unhandledRejection',finish);setTimeout(()=>finish(Error('Sidebar visual test timeout')),240000);
app.on('browser-window-created',(_,w)=>w.webContents.on('console-message',e=>{if(e.level==='error'){if(e.message==='ResizeObserver loop completed with undelivered notifications.')report.warnings.push(e.message);else report.errors.push(e.message)}}));
const Update=require(path.join(root,'desktop/update.js')),setup=Update.setup;let mainWindow=()=>null;Update.setup=host=>{mainWindow=host.window;return setup(host)};require(path.join(root,'desktop/main.js'));
app.whenReady().then(async()=>{
 for(let n=0;n<300;n++){win=mainWindow();if(win&&!win.webContents.isLoading())break;await pause(40)}assert.ok(win);
 require(path.join(root,'desktop/size.js')).pick(win,1);win.setContentSize(1440,900);win.show();win.focus();win.webContents.setBackgroundThrottling(false);
 const js=async s=>{report.lastScript=s;new vm.Script(s);return win.webContents.executeJavaScript(s)};
 const wait=async(s,ms=15000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await js(s))return;await pause(30)}throw Error('Not ready: '+s)};
 const check=async(name,s)=>{const pass=!!(typeof s==='string'?await js(s):s);report.checks.push({name,pass});if(!baseline)assert.ok(pass,name)};
 const settle=async()=>{await pause(70);await js(`Promise.race([Promise.all(document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))),new Promise(r=>setTimeout(r,1800))]).then(()=>null)`);await wait(`!Theme.moving`);await pause(100)};
 const shot=async name=>{await settle();const p=path.join(output,name+'.png');fs.writeFileSync(p,(await win.webContents.capturePage()).toPNG());report.screenshots.push(p)};
 const cdp=(method,params)=>win.webContents.debugger.sendCommand(method,params);
 const hover=async expression=>{await settle();await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1});await pause(40);const p=await js(`(()=>{const e=${expression};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await settle()};
 const click=async expression=>{await hover(expression);const p=await js(`(()=>{const r=(${expression}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});await settle()};
 await wait(`typeof splitView!=='undefined'&&!!splitView&&!!library.home`);await js(`library.ready.then(()=>null)`);await wait(`!document.documentElement.classList.contains('is-splash')`);await js(`document.querySelector('.tour-skip')?.click();void 0`);await wait(`!document.querySelector('.tour')`);
 await js(`(()=>{window.fixtureErrors=[];addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason?.stack||e.reason)));settings.models=[{id:'visual-fixture',api:'visual-fixture',name:'Тестовая модель',provider:'custom',context:128000,efforts:['low','high'],defaultEffort:'low',tools:true}];settings.model='visual-fixture';settings.keys.custom='fixture-only';settings.hand.custom.address='http://127.0.0.1:1';settings.freshen=()=>{};Chat.prototype.keepFacts=async()=>{};Chat.prototype.foresee=()=>{};Chat.prototype.name=()=>{};Providers.complete=async()=>'';Providers.stream=()=>{throw Error('This visual test must never request a model')};syncAll()})()`);
 win.webContents.debugger.attach('1.3');await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 const workspace=path.join(output,'workspace'),project=path.join(workspace,'project');
 await js(`(async()=>{window.ids={};library.home.path=${JSON.stringify(workspace)};window.fixtureMessages=[];for(let i=0;i<16;i++){fixtureMessages.push({role:'user',text:'Проверка сообщения '+i,content:'Проверка сообщения '+i,attachments:[]});fixtureMessages.push({role:'assistant',content:'## Проверка прокрутки '+i+'\\n\\n'+('Сообщения не должны попадать под полосу прокрутки даже в узкой панели. '.repeat(5))+'\\n\\n| Колонка | Значение |\\n| --- | --- |\\n| Пример | Проверка ширины содержимого |\\n\\n'+('Отдельный край остаётся свободным для перетаскивания полосы. '.repeat(3))})}const rows=[['a','Вакансии склада в Тулузе и подготовка заказов',null,400],['b','Помощь с выплатой ARS и документы для заявления',null,390],['newer','Более новый обычный чат без пары',null,900],['older','Более старый обычный чат',null,100],['pinned','Закреплённый обычный чат',null,80],['c','Чат C в тестовой папке',${JSON.stringify(project)},300],['d','Чат D в тестовой папке',${JSON.stringify(project)},290]];for(const [name,title,folder,stamp] of rows){const r=library.create({folder:folder?{path:folder,name:'Тестовая папка'}:null,text:title,attachments:[]});ids[name]=r.id;library.update(r.id,{title,named:true,model:'visual-fixture',mode:'ask',pinned:name==='pinned',preview:{text:'Проверочная строка под длинным названием',mine:false}});r.updated=Date.now()-1000000+stamp*1000;await ChatStore.write('chats/'+r.id,{messages:fixtureMessages,tokens:2000})}await library.persist();await chat.open(ids.a);await splitView.open(ids.b);Theme.set('light');syncAll()})()`);
 await wait(`splitView.opened&&!splitView.motionFlights.length`);await settle();
 await check('Full real client uses only its isolated profile',win.webContents.getURL().endsWith('/index.html')&&app.getPath('userData').startsWith(output));
 const groupCheck=`document.querySelector('.chat-pair')?.parentElement===chatList.homeGroup.inner`;
 const navigationOrder=`(()=>{const nodes=[chatList.skillsGroup.section,chatList.routinesGroupEl.section,chatList.pinnedHead,chatList.rows.get(ids.pinned).row,chatList.homeGroup.section];return nodes.every(n=>n.isConnected)&&nodes.slice(1).every((n,i)=>!!(nodes[i].compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING))})()`;
 await check('Skills, Routines, Pinned and Chats appear in the requested order',navigationOrder);
 await click(`chatList.rows.get(ids.pinned).pin`);await check('Unpinning the last chat removes only the empty pinned section',`!chatList.pinnedHead.isConnected&&chatList.routinesGroupEl.section.nextElementSibling===chatList.homeGroup.section`);
 await click(`chatList.rows.get(ids.pinned).pin`);await check('Repinning restores the section below Routines and above Chats',navigationOrder);
 await check('A home pair stays inside the ordinary Chats section',groupCheck);
 await check('The pair does not precede pinned chats or Skills',`(()=>{const p=document.querySelector('.chat-pair'),s=chatList.skillsGroup.section,r=chatList.rows.get(ids.pinned).row;return !!(s.compareDocumentPosition(p)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(r.compareDocumentPosition(p)&Node.DOCUMENT_POSITION_FOLLOWING)})()`);
 await check('A newer ordinary chat sorts before an older pair',`(()=>{const p=document.querySelector('.chat-pair'),r=chatList.rows.get(ids.newer).row;return r.parentElement===p.parentElement&&!!(r.compareDocumentPosition(p)&Node.DOCUMENT_POSITION_FOLLOWING)})()`);
 for(const theme of ['light','dark']){
  await js(`Theme.set('${theme}').then(()=>null)`);await settle();await hover(`chatList.rows.get(ids.a).row`);
  await check(theme+': the hover highlight fits the nested active row',`(()=>{const a=chatList.rows.get(ids.a).row.getBoundingClientRect(),g=chatList.glide.getBoundingClientRect();return Math.abs(a.left-g.left)<.8&&Math.abs(a.right-g.right)<.8&&Math.abs(a.top-g.top)<1&&Math.abs(a.height-g.height)<1})()`);
  await check(theme+': active row stays fully inside its pair frame',`(()=>{const r=chatList.rows.get(ids.a).row.getBoundingClientRect(),p=document.querySelector('.chat-pair').getBoundingClientRect();return r.left>=p.left+4&&r.right<=p.right-4})()`);
  await check(theme+': the secondary chat has no left bracket',`!getComputedStyle(chatList.rows.get(ids.b).row).boxShadow.includes('3px 0px')`);
  await click(`chatList.rows.get(ids.b).row`);await hover(`chatList.rows.get(ids.newer).row`);
  await check(theme+': selecting right leaves the other row undecorated',`(()=>{const e=chatList.rows.get(ids.a).row,s=getComputedStyle(e);return !e.classList.contains('is-active')&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.boxShadow==='none'})()`);
  await check(theme+': the focused right chat keeps ordinary selection',`chatList.rows.get(ids.b).row.classList.contains('is-active')&&getComputedStyle(chatList.rows.get(ids.b).row).backgroundColor!=='rgba(0, 0, 0, 0)'`);
  await click(`chatList.rows.get(ids.a).row`);await hover(`chatList.rows.get(ids.newer).row`);
  await check(theme+': selecting left leaves the secondary row undecorated',`(()=>{const e=chatList.rows.get(ids.b).row,s=getComputedStyle(e);return !e.classList.contains('is-active')&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.boxShadow==='none'})()`);
  await check(theme+': active pair does not shade its transparent rows',`getComputedStyle(document.querySelector('.chat-pair')).backgroundColor==='rgba(0, 0, 0, 0)'`);
  await check(theme+': ordinary primary chat selection is preserved',`chatList.rows.get(ids.a).row.classList.contains('is-active')&&getComputedStyle(chatList.rows.get(ids.a).row).backgroundColor!=='rgba(0, 0, 0, 0)'`);
  await check(theme+': text never reaches behind the split button',`(()=>{const r=chatList.rows.get(ids.newer),b=r.row.querySelector('.chat-body').getBoundingClientRect(),a=r.split.getBoundingClientRect();return !r.split.hidden&&b.right<=a.left-2})()`);
  await shot('sidebar-'+theme);
  const sidebarRect=await js(`(()=>{const r=sidebar.getBoundingClientRect();return{x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`),sidebarFile=path.join(output,'sidebar-order-'+theme+'.png');fs.writeFileSync(sidebarFile,(await win.webContents.capturePage(sidebarRect)).toPNG());report.screenshots.push(sidebarFile);
 }
 await js(`(()=>{Theme.set('light');const c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d');g.fillStyle='#5379a5';g.fillRect(0,0,16,16);library.update(ids.newer,{preview:{text:'Проверочная строка с фотографией',photo:c.toDataURL()}});syncAll()})()`);await hover(`chatList.rows.get(ids.newer).row`);
 await check('Rows with a photo also reserve all three buttons without text overlap',`(()=>{const r=chatList.rows.get(ids.newer),b=r.row.querySelector('.chat-body').getBoundingClientRect(),a=r.split.getBoundingClientRect();return r.row.classList.contains('has-photo')&&b.right<=a.left-2})()`);
 await js(`library.update(ids.newer,{preview:{text:'Проверочная строка под длинным названием'}});chatList.setQuery('Вакансии');void 0`);await settle();
 await check('Search keeps both members of a matching pair without duplicates',`document.querySelectorAll('.chat-pair .chat-row').length===2&&document.querySelectorAll('.chat-row[data-id="'+ids.a+'"]').length===1&&document.querySelectorAll('.chat-row[data-id="'+ids.b+'"]').length===1`);
 await js(`chatList.setQuery('');void 0`);await settle();await click(`chatList.rows.get(ids.b).pin`);
 await check('Pinning a member places the pair in the normal pinned section',`(()=>{const p=document.querySelector('.chat-pair');return p.parentElement===chatList.list&&chatList.pinnedHead.compareDocumentPosition(p)&Node.DOCUMENT_POSITION_FOLLOWING})()`);
 await check('A pinned split pair stays below Routines and above ordinary Chats',`(()=>{const p=document.querySelector('.chat-pair'),r=chatList.routinesGroupEl.section,h=chatList.pinnedHead,c=chatList.homeGroup.section;return !!(r.compareDocumentPosition(h)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(h.compareDocumentPosition(p)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(p.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING)})()`);await shot('pinned-pair-light');
 await click(`chatList.rows.get(ids.b).pin`);await js(`chat.open(ids.c).then(()=>splitView.open(ids.d)).then(()=>null)`);await settle();
 await check('A folder pair stays in its normal folder',`(()=>{const p=[...document.querySelectorAll('.chat-pair')].find(e=>e.querySelector('[data-id="'+ids.c+'"]'));return p?.closest('.chats-folder')?.__group?.path===${JSON.stringify(project)}})()`);
 await check('Pairing never rewrites chat folders or pinned flags',`library.isHome(library.chat(ids.a))&&library.isHome(library.chat(ids.b))&&library.chat(ids.c).folder===${JSON.stringify(project)}&&!library.chat(ids.b).pinned`);
 await js(`chat.open(ids.a).then(()=>null)`);await settle();
 const safeGutter=side=>`(()=>{const v=${side},list=v.thread.querySelector('.thread-list:not(.is-parked)').getBoundingClientRect(),bar=v.main.querySelector('.thread-scrollbar').getBoundingClientRect();return list.right<=bar.left-2})()`;
 for(const width of [1440,1100,1000]){
  win.setContentSize(width,850);await settle();await check('Split '+width+': left messages stay outside the scrollbar hit area',safeGutter('chat'));await check('Split '+width+': right messages stay outside the scrollbar hit area',safeGutter('splitView.pane.chat'));
 }
 await js(`splitView.close({forget:false});void 0`);await settle();
 for(const [width,zoom] of [[800,1],[520,1],[780,1.5],[520,1.5]]){
  win.setMinimumSize(300,300);win.setContentSize(width,850);win.webContents.setZoomFactor(zoom);await settle();
  await check('Single '+width+' / zoom '+zoom+': messages stay outside the scrollbar hit area',safeGutter('chat'));
 }
 win.webContents.setZoomFactor(1);win.setContentSize(1100,850);await settle();
 async function fade(theme,edge){
  await js(`Theme.set('${theme}').then(()=>null)`);await js(`thread.scrollTop=${edge==='top'?'0':'thread.scrollHeight'};void 0`);await settle();await pause(200);
  const box=await js(`(()=>{const t=main.querySelector('.thread-scrollbar .scrollbar-thumb'),r=t.getBoundingClientRect();window.oldThumb={background:t.style.background,width:t.style.width,transition:t.style.transition};t.style.transition='none';t.style.background='rgb(255, 0, 0)';t.style.width='6px';return {height:r.height}})()`);await pause(100);
  const geometry=await js(`(()=>{const t=main.querySelector('.thread-scrollbar .scrollbar-thumb').getBoundingClientRect();return{x:t.x+t.width/2,top:t.top,bottom:t.bottom,dpr:devicePixelRatio,bg:getComputedStyle(main).backgroundColor}})()`);
  const native=await win.webContents.capturePage(),size=native.getSize(),pixels=native.toBitmap();
  const pixel=y=>{const x=Math.max(0,Math.min(size.width-1,Math.round(geometry.x*geometry.dpr))),yy=Math.max(0,Math.min(size.height-1,Math.round(y*geometry.dpr))),at=(yy*size.width+x)*4;return [pixels[at+2],pixels[at+1],pixels[at]]};
  const bg=geometry.bg.match(/[\d.]+/g).slice(0,3).map(Number),contrast=p=>p.reduce((sum,v,i)=>sum+Math.abs(v-bg[i]),0);
  const top=pixel(geometry.top+4),bottom=pixel(geometry.bottom-5),edgeValue=contrast(edge==='top'?top:bottom),innerValue=contrast(edge==='top'?bottom:top);
  report.pixels.push({theme,edge,geometry,top,bottom,edgeValue,innerValue,height:box.height});
  await check(theme+': scrollbar visibly fades at the '+edge+' edge',innerValue>edgeValue+35);
  await js(`(()=>{const t=main.querySelector('.thread-scrollbar .scrollbar-thumb');Object.assign(t.style,oldThumb)})()`);
  await shot('scroll-'+theme+'-'+edge);
 }
 for(const theme of ['light','dark'])for(const edge of ['top','bottom'])await fade(theme,edge);
 await js(`Theme.set('light');thread.scrollTop=thread.scrollHeight/2;void 0`);await settle();
 const drag=await js(`(()=>{const t=main.querySelector('.thread-scrollbar .scrollbar-thumb').getBoundingClientRect();return{x:t.x+t.width/2,y:t.y+t.height/2,before:thread.scrollTop}})()`);
 for(const e of [{type:'mouseMoved',x:drag.x,y:drag.y},{type:'mousePressed',x:drag.x,y:drag.y,button:'left',clickCount:1},{type:'mouseMoved',x:drag.x,y:drag.y+45,button:'left',buttons:1},{type:'mouseReleased',x:drag.x,y:drag.y+45,button:'left',clickCount:1}])await cdp('Input.dispatchMouseEvent',e);
 await settle();await check('Scrollbar dragging still scrolls real messages',await js(`thread.scrollTop>${drag.before}+100`));
 await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await js(`chat.open(ids.newer).then(()=>chat.open(ids.a)).then(()=>null)`);await settle();await check('Reduced motion retains pair placement and restoration',`splitView.opened&&document.querySelector('.chat-pair')?.parentElement===chatList.homeGroup.inner`);
 win.setContentSize(1440,900);await settle();if(await js(`app.classList.contains('is-sidebar-collapsed')`))await click(`sidebarToggle`);await wait(`!sidebar.inert`);
 await click(`document.querySelector('.chat-pair .chat-pair-close')`);await check('The pair close button removes only its grouping',`!splitView.opened&&!splitView.pairs.find(ids.a)&&!!library.chat(ids.a)&&!!library.chat(ids.b)`);
 await check('No unexpected renderer errors',report.errors.length===0&&await js('fixtureErrors.length===0'));
 await js(`library.persist().then(()=>null)`);finish();
}).catch(finish);
