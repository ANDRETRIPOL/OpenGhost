'use strict';
// Electron integration test: real row menu, ChatList, password UI and stylesheet.
// Storage and password operations are fixtures; no real chat or password is used.
// Run with: node_modules/electron/dist/electron.exe tests/lock-card-motion.cjs
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=fs.mkdtempSync(path.join(os.tmpdir(),'og-lock-motion-'));
app.setPath('userData',path.join(output,'profile'));app.on('window-all-closed',()=>{});
process.stdout?.on('error',()=>{});process.stderr?.on('error',()=>{});
const report={checks:[],errors:[],output};let finished=false;
function finish(error){if(finished)return;finished=true;if(error)report.error=String(error.stack||error);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));app.exit(error?1:0);}
process.on('uncaughtException',finish);process.on('unhandledRejection',finish);
setTimeout(()=>finish(Error('Lock transition test timeout')),60000);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function check(name,value){assert.ok(value,name);report.checks.push(name);}
const fixture=path.join(output,'fixture.html');
const scripts=['i18n-ru.js','i18n-fr.js','i18n-it.js','i18n.js','glyphs.js','library.js','dock.js','row-menu.js','chat-list.js','lock-ui.js'];
fs.writeFileSync(fixture,`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(root,'styles.css')).href}"><script>if(!localStorage.getItem('openghost.lang'))localStorage.setItem('openghost.lang','en')</script></head><body>
<div class="app"><aside class="sidebar"><nav class="chats"><div class="chats-scroll"><div class="chats-list"></div></div></nav></aside><main class="main"></main></div>
${scripts.map(file=>`<script src="${pathToFileURL(path.join(root,file)).href}"></script>`).join('')}</body></html>`);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1100,height:760,webPreferences:{offscreen:true,backgroundThrottling:false}});
 win.webContents.on('console-message',event=>{if(event.level==='error')report.errors.push(event.message)});
 win.webContents.on('render-process-gone',(_event,details)=>finish(Error(JSON.stringify(details))));
 const js=async code=>{report.lastScript=code.slice(0,220);return win.webContents.executeJavaScript(code);};
 const key=async keyCode=>{win.webContents.sendInputEvent({type:'keyDown',keyCode});if(keyCode==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode});await pause(40);};
 const click=async target=>{const p=await js(`(()=>{const r=${target}.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);win.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...p,button:'left',clickCount:1});await pause(30);};
 const shot=async name=>{win.webContents.invalidate();await pause(100);fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const settle=()=>js(`Promise.all(card.root.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))).then(()=>null)`);
 const setup=async()=>{
  await js(`window.fixtureRecord={id:'motion-chat',title:'Password transition',folder:'',space:'fixture',created:Date.now(),updated:Date.now()};window.calls={protect:0,unprotect:0,lock:0,open:0};window.busy=false;
   window.lib=new Library({read:async key=>key==='index'?{chats:[fixtureRecord]}:null,write:async()=>{},remove:async()=>{}},()=>{});
   window.agent={active:{id:'another-chat'},activeId:'motion-chat',isDraft:false,isBusy:()=>busy,isUnread:()=>false,isLocked:()=>false,protect:async()=>{calls.protect++;return true},unprotect:async()=>{calls.unprotect++;return true},lock:()=>calls.lock++,open:()=>calls.open++};
   window.card=new LockCard({chat:agent,library:lib,scroller:document.querySelector('.chats-scroll')});
   window.ready=lib.ready.then(()=>{window.list=new ChatList({root:document.querySelector('.chats'),library:lib,chat:agent,onNewFolder:()=>{},onNewChat:()=>{},onLock:(id,row,from)=>card.open(id,row,from)})});void 0`);
  await js(`ready.then(()=>null)`);await pause(200);
 };
 const menu=async()=>{await js(`{const item=list.rows.get(fixtureRecord.id);list.menu.open(fixtureRecord.id,item.row,item.row.querySelector('.is-more'))}`);await pause(180);};
 const choose=()=>js(`(()=>{const r=list.menu.root.getBoundingClientRect(),source={x:r.x,y:r.y,width:r.width,height:r.height};list.menu.choose(list.menu.root.querySelector('.is-lock'));const a=card.root.getBoundingClientRect();return {source,first:{x:a.x,y:a.y,width:a.width,height:a.height},body:card.body.offsetWidth,focus:document.activeElement===card.field?.input,snapshot:!!card.handoff?.content.inert,oldMenu:list.menu.root.matches(':popover-open'),newCard:card.root.matches(':popover-open')}})()`);
 report.stage='load';await win.loadFile(fixture);report.stage='setup';await setup();report.stage='menu';
 await menu();await shot('menu');
 report.start=await choose();
 check('First frame retains menu position and dimensions',Object.keys(report.start.source).every(k=>Math.abs(report.start.source[k]-report.start.first[k])<1));
 check('Only the new surface is open',!report.start.oldMenu&&report.start.newCard);
 check('Old menu content is decorative; password receives focus',report.start.snapshot&&report.start.focus);
 await js(`card.handoff.animations.forEach(a=>a.pause());card.handoff.animations.forEach(a=>a.currentTime=180)`);await shot('morph-middle');
 report.middle=await js(`(()=>{const r=card.root.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,body:card.body.offsetWidth,old:Number(getComputedStyle(card.handoff.content).opacity),fresh:Number(getComputedStyle(card.body).opacity)}})()`);
 check('Intermediate surface grows continuously',report.middle.width>report.start.first.width&&report.middle.width<320);
 check('Menu top-left corner stays fixed during expansion',Math.abs(report.middle.x-report.start.source.x)<1&&Math.abs(report.middle.y-report.start.source.y)<1);
 check('Password content keeps its final layout width',report.middle.body===report.start.body);
 check('Content crossfades without a blank surface',report.middle.fresh>0&&report.middle.old<1&&await js(`getComputedStyle(card.root).opacity==='1'`));
 await js(`card.handoff.animations.forEach(a=>a.play())`);await settle();await shot('password');
 report.end=await js(`(()=>{const r=card.root.getBoundingClientRect();return {x:r.x,y:r.y}})()`);
 check('Completed card keeps the menu position',Math.abs(report.end.x-report.start.source.x)<1&&Math.abs(report.end.y-report.start.source.y)<1);
 check('Transition removes its copy and temporary state',await js(`!card.handoff&&!document.querySelector('.lock-menu-content')&&!card.root.classList.contains('is-from-menu')&&!card.root.style.getPropertyValue('--lock-body-width')`));
 check('Input stays focused at completion',await js(`document.activeElement===card.field.input`));
 await win.webContents.insertText('fixture-secret');
 report.typed=await js(`({length:card.field.input.value.length,disabled:card.body.querySelector('[data-act="ok"]').disabled,focused:document.activeElement===card.field.input})`);
 await key('Enter');
 report.firstEntry=await js(`({step:card.step,length:card.field.input.value.length,busy:card.busy,protect:calls.protect})`);
 check('First entry asks to repeat, without setting password',await js(`card.step===2&&card.field.input.value===''&&calls.protect===0`));
 await win.webContents.insertText('different-secret');await key('Enter');
 check('Mismatch still returns to first step',await js(`card.step===1&&card.first===''&&card.body.querySelector('.lock-say').classList.contains('is-wrong')&&calls.protect===0`));
 await win.webContents.insertText('cancel-me');await js(`window.oldInput=card.field.input`);await key('Escape');await pause(300);
 report.cancel=await js(`({id:card.id,open:card.root.matches(':popover-open'),length:oldInput.value.length,focus:document.activeElement?.outerHTML.slice(0,120)})`);
 check('Escape closes, wipes input and returns focus',await js(`!card.id&&!card.root.matches(':popover-open')&&oldInput.value===''&&document.activeElement===list.rows.get(fixtureRecord.id).row`));
 await menu();await choose();await settle();
 await win.webContents.insertText('fixture-secret');await key('Enter');await win.webContents.insertText('fixture-secret');await key('Enter');await pause(1000);
 check('Matching confirmation invokes protection once',await js(`calls.protect===1&&!card.id`));
 // Existing password: first click confirms; only a second click removes it.
 await js(`fixtureRecord.lock={fixture:true};lib.keys.set(fixtureRecord.id,{});lib.titles.set(fixtureRecord.id,'Password transition');list.render()`);await menu();await choose();await settle();
 check('Protected-chat actions use the same transition',await js(`card.mode==='guard'&&card.root.matches(':popover-open')`));
 await click(`card.body.querySelector('[data-act="remove"]')`);
 check('Removing password still requires confirmation',await js(`calls.unprotect===0&&card.body.querySelector('[data-act="remove"]').classList.contains('is-confirming')`));
 await click(`card.body.querySelector('[data-act="remove"]')`);await pause(700);
 check('Second click invokes password removal once',await js(`calls.unprotect===1&&!card.id`));
 await js(`delete fixtureRecord.lock;lib.keys.clear();lib.titles.clear();list.render()`);
 // A lower row keeps the same origin too; only viewport overflow can move the card.
 await js(`list.rows.get(fixtureRecord.id).row.style.transform='translateY(260px)'`);await menu();
 const lower=await choose();await settle();
 check('Lower row keeps both menu offsets',await js(`(()=>{const r=card.root.getBoundingClientRect();return Math.abs(r.left-${lower.source.x})<1&&Math.abs(r.top-${lower.source.y})<1})()`));
 await js(`card.close(true);{const row=list.rows.get(fixtureRecord.id).row;row.style.transform='';row.style.transform='translateY('+(innerHeight-row.getBoundingClientRect().bottom-20)+'px)'}`);await menu();
 const bottom=await choose();await settle();await shot('bottom-password');
 check('Bottom edge moves the card only enough to fit',await js(`(()=>{const r=card.root.getBoundingClientRect();return Math.abs(r.left-${bottom.source.x})<1&&Math.abs(r.top-Math.min(${bottom.source.y},innerHeight-r.height-12))<1&&r.bottom<=innerHeight})()`));
 await js(`card.close(true);list.rows.get(fixtureRecord.id).row.style.transform=''`);
 // Dismiss and reopen mid-transition; cancelled completions must not clear the new card.
 await menu();await choose();await js(`card.close()`);await menu();await choose();await settle();
 check('Interrupted transition cannot clear its replacement',await js(`card.id===fixtureRecord.id&&card.root.matches(':popover-open')&&document.querySelectorAll('.lock-menu-content').length===0`));
 await js(`card.close(true)`);await menu();await choose();win.setSize(760,540);await pause(180);
 check('Resize cleans up an in-flight transition',await js(`!card.id&&!card.handoff&&!document.querySelector('.lock-menu-content')`));
 win.webContents.setZoomFactor(1.5);await pause(150);await menu();await choose();await settle();await shot('narrow-150');
 check('Card fits a narrow window at 150 percent',await js(`(()=>{const r=card.root.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`));
 // Restore the visible sidebar before testing its other actions.
 win.webContents.setZoomFactor(1);win.setSize(1100,760);await pause(180);
 await js(`card.close(true);busy=true;list.render()`);await menu();await click(`list.menu.root.querySelector('.is-lock')`);
 check('Busy chat does not open password card',await js(`!card.id&&list.menu.root.matches(':popover-open')`));
 await js(`list.menu.close(true);busy=false;list.render()`);await menu();await js(`list.menu.choose(list.menu.root.querySelector('.is-rename'))`);
 check('Other menu actions keep their original behavior',await js(`!card.id&&!!list.rows.get(fixtureRecord.id).editing&&!list.menu.root.matches(':popover-open')`));await key('Escape');
 await js(`document.documentElement.dataset.theme='dark'`);await menu();await choose();await settle();await shot('dark-password');
 check('Dark theme completes the same handoff',await js(`card.root.matches(':popover-open')&&!card.handoff&&document.activeElement===card.field.input`));await js(`card.close(true)`);
 win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await menu();await choose();
 check('Reduced motion skips the geometry transition',await js(`card.root.matches(':popover-open')&&!card.handoff&&!document.querySelector('.lock-menu-content')`));
 check('Reduced motion keeps the same menu position',await js(`(()=>{const r=card.root.getBoundingClientRect(),m=list.menu.root.style;return Math.abs(r.left-parseFloat(m.left))<1&&Math.abs(r.top-parseFloat(m.top))<1})()`));
 await js(`card.close(true)`);win.webContents.debugger.detach();
 check('No renderer errors',report.errors.length===0);win.destroy();finish();
}).catch(finish);
