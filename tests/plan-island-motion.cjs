'use strict';
// Run with Electron. The real stylesheet and PlanIsland render in an isolated,
// hidden window; no application profile, chat storage, IPC or model is loaded.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'og-plan-motion-'));
app.setPath('userData',path.join(output,'profile'));
app.on('window-all-closed',()=>{});
process.stdout?.on('error',()=>{});process.stderr?.on('error',()=>{});
const report={checks:[],errors:[],output};let finished=false;
function finish(error){if(finished)return;finished=true;if(error)report.error=String(error.stack||error);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));app.exit(error?1:0);}
process.on('uncaughtException',finish);process.on('unhandledRejection',finish);
setTimeout(()=>finish(Error('Motion test timeout')),60000);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function check(name,pass){assert.ok(pass,name);report.checks.push(name);}
const fixture=path.join(output,'fixture.html');
fs.writeFileSync(fixture,`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(root,'styles.css')).href}"></head><body>
<main class="main" style="position:relative;inset:0;width:640px;height:620px;margin:24px auto;overflow:visible">
<div class="top-tools" style="position:absolute;left:12px;top:12px;width:130px;height:30px"></div>
<div class="routines-pill" style="position:absolute;right:12px;top:12px;width:130px;height:30px"></div></main>
<script src="${pathToFileURL(path.join(root,'agent-plan.js')).href}"></script><script src="${pathToFileURL(path.join(root,'plan-island.js')).href}"></script></body></html>`);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1100,height:760,webPreferences:{offscreen:true,backgroundThrottling:false}});
 win.webContents.on('console-message',event=>{if(event.level==='error')report.errors.push(event.message)});
 win.webContents.on('render-process-gone',(_event,details)=>finish(Error(JSON.stringify(details))));
 const js=code=>win.webContents.executeJavaScript(code);
 const click=async target=>{const point=await js(`(()=>{const r=${target}.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});await pause(25);};
 const shot=async name=>{await pause(70);fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const settle=()=>js(`Promise.all(island.root.getAnimations().concat(island.sheet.getAnimations(),island.cap.getAnimations()).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))).then(()=>null)`);
 await win.loadFile(fixture);
 await js(`window.I18n={t:(key,v)=>key==='plan.count'?v.done+' of '+v.total+' steps':key==='plan.label'?'Agent plan':key==='plan.close'?'Close plan':key};
 window.view={plan:{id:'motion-test',steps:[{text:'Review the plan animation in a narrow window',state:'done',proof:'Checked the source code and reproduced the first-frame clipping.'},{text:'Check opening and closing without losing the text layout',state:'open'},{text:'Verify keyboard controls and reduced motion',state:'open'}]},waiting:false,finished:false};
 window.conv={};window.island=new PlanIsland({main:document.querySelector('main'),chat:{active:conv,planView:()=>view}});island.sync();`);
 await settle();await pause(200);
 for(const [name,width,room] of [['wide',900,600],['narrow',500,70]]){
  await js(`island.close({instant:true});island.main.style.width='${width}px';island.fit()`);await pause(200);
  // Explicit room also covers a crowded header with more neighbours than this fixture.
  await js(`island.root.style.setProperty('--plan-room','${room}px');island.room=${room};island.settle(false)`);
  await js(`island.open()`);await settle();await shot(name+'-open');
  const before=await js(`(()=>{const r=island.root.getBoundingClientRect();return {width:r.width,height:r.height}})()`);
  const first=await js(`(()=>{island.close();const r=island.root.getBoundingClientRect();return {width:r.width,height:r.height,sheet:getComputedStyle(island.sheet).display,max:getComputedStyle(island.root).maxWidth,inert:island.sheet.inert,duration:island.morph?.effect.getTiming().duration,easing:island.morph?.effect.getTiming().easing}})()`);
  report[name]={before,first};
  check(name+': closing starts at the rendered size',Math.abs(before.width-first.width)<1&&Math.abs(before.height-first.height)<1);
  check(name+': panel stays laid out and non-interactive',first.sheet==='block'&&first.max==='none'&&first.inert);
  check(name+': same timing as opening',first.duration===520&&first.easing==='cubic-bezier(0.32, 1.18, 0.5, 1)');
  await js(`island.panelAnimations.forEach(a=>a.pause());island.panelAnimations.forEach(a=>a.currentTime=180)`);await shot(name+'-closing');
  const middle=await js(`(()=>{const r=island.root.getBoundingClientRect();return {width:r.width,height:r.height,opacity:Number(getComputedStyle(island.sheet).opacity),textWidth:island.sheet.offsetWidth}})()`);
  report[name].middle=middle;
  check(name+': intermediate geometry and faded text',middle.height<before.height&&middle.height>30&&middle.opacity>0&&middle.opacity<1);
  check(name+': text width stays fixed',middle.textWidth===Math.min(440,width-32));
  await js(`island.panelAnimations.forEach(a=>a.play())`);await settle();
  check(name+': clean closed state',await js(`island.state==='shut'&&!island.root.classList.contains('is-open')&&!island.root.classList.contains('is-closing')&&!island.sheet.inert&&getComputedStyle(island.sheet).display==='none'&&island.root.offsetHeight===30`));
  await shot(name+'-closed');
 }
 await click('island.cap');await settle();await click('island.head');
 check('Pointer closes through the panel header',await js(`island.root.classList.contains('is-closing')`));
 await click('island.cap');await settle();
 check('Returning capsule can be reopened by pointer',await js(`island.state==='open'&&!island.root.classList.contains('is-closing')&&!island.sheet.inert`));
 win.webContents.sendInputEvent({type:'mouseDown',x:30,y:400,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',x:30,y:400,button:'left',clickCount:1});await pause(25);await settle();
 check('Pointer outside closes the panel',await js(`island.state==='shut'&&!island.root.classList.contains('is-open')`));
 // Reverse in flight in either direction: the first frame must retain its size.
 await js(`island.open();island.panelAnimations.forEach(a=>a.pause());island.panelAnimations.forEach(a=>a.currentTime=180)`);
 check('Close while opening preserves current geometry',await js(`(()=>{const before=island.root.getBoundingClientRect();island.close();const after=island.root.getBoundingClientRect();return Math.abs(before.width-after.width)<1&&Math.abs(before.height-after.height)<1})()`));
 await js(`island.panelAnimations.forEach(a=>a.pause());island.panelAnimations.forEach(a=>a.currentTime=120)`);
 check('Reopen while closing preserves geometry and opacity',await js(`(()=>{const before=island.root.getBoundingClientRect(),opacity=Number(getComputedStyle(island.sheet).opacity);island.open();const after=island.root.getBoundingClientRect();return Math.abs(before.width-after.width)<1&&Math.abs(before.height-after.height)<1&&Math.abs(opacity-Number(getComputedStyle(island.sheet).opacity))<.02&&!island.sheet.inert})()`));await settle();
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await pause(40);await settle();
 check('Escape closes and returns keyboard focus',await js(`island.state==='shut'&&document.activeElement===island.cap&&island.cap.getAttribute('aria-expanded')==='false'`));
 await js(`island.main.style.width='900px';island.fit()`);await pause(200);
 await js(`island.open()`);await settle();
 check('A step update waits for the closing caption',await js(`(()=>{island.close();const old=island.label.textContent;view.plan.steps[1].text='Check the result';island.sync();return island.label.textContent===old&&island.pendingWord==='Check the result'})()`));await settle();await settle();
 check('Latest step appears after closing',await js(`island.label.textContent==='Check the result'&&island.pendingWord===undefined&&!island.root.classList.contains('is-closing')`));
 await js(`island.open()`);await settle();await js(`island.close();island.hide(false)`);
 check('Hiding during close cancels pending transition',await js(`island.root.hidden&&!island.morph&&!island.root.classList.contains('is-open')&&!island.root.classList.contains('is-closing')`));
 await js(`island.sync();island.open()`);await settle();
 await js(`document.documentElement.dataset.theme='light';island.close()`);await settle();await shot('light-closed');
 win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await js(`island.open();island.close()`);
 check('Reduced motion skips the geometry morph',await js(`island.state==='shut'&&!island.morph&&!island.root.classList.contains('is-open')&&!island.root.classList.contains('is-closing')&&!island.sheet.inert`));
 win.webContents.debugger.detach();
 check('No renderer errors',report.errors.length===0);
 win.destroy();finish();
}).catch(finish);
