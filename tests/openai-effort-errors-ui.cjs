'use strict';
// Full desktop client, actual OpenAI adapter/IPC and native effort control. Default: loopback only.
// --live additionally needs an explicitly authorized read-only auth helper; no credentials reach the renderer/report.
const {app,shell}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=fs.mkdtempSync(path.join(os.tmpdir(),'og-effort-errors-ui-')),live=process.argv.includes('--live');
const existingProfile=path.join(app.getPath('appData'),'OpenGhost');
for(const d of ['profile','session','workspace'])fs.mkdirSync(path.join(output,d));
app.setName('OpenGhost effort error check');app.setPath('userData',path.join(output,'profile'));app.setPath('sessionData',path.join(output,'session'));shell.writeShortcutLink=()=>true;delete process.env.OPENGHOST_UPDATE_AS;
const report={output,live,checks:[],errors:[],warnings:[],requests:[],liveRequests:[],screenshots:[],auth:{}};let win,finished=false;
const pause=ms=>new Promise(r=>setTimeout(r,ms)),check=(name,pass)=>{assert.ok(pass,name);report.checks.push(name)};
const server=http.createServer(async(req,res)=>{
 try{
  assert.equal(req.url,'/responses');let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
  assert.ok(body.model.startsWith('gpt-9-effort-ui-'),'Only fixture models use the loopback server');
  report.requests.push({model:body.model,effort:body.reasoning?.effort??null,include:body.include??null,session:body.prompt_cache_key});
  if(body.reasoning?.effort==='ultra'){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'invalid_value',param:'reasoning.effort',message:'Unsupported value for reasoning.effort: ultra. Supported values: low, medium, high.'}}));return}
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  for(const event of [{type:'response.output_text.delta',item_id:'reply',delta:'EFFORT_'+String(body.reasoning?.effort||'MISSING').toUpperCase()+'_OK'},{type:'response.completed',response:{usage:{input_tokens:100,output_tokens:5,total_tokens:105}}}])res.write('data: '+JSON.stringify(event)+'\n\n');res.end();
 }catch(e){finish(e)}
});
const listening=new Promise(r=>server.listen(0,'127.0.0.1',r));
let auth=null;const allowedLive=new Set(),wireReads=[];
if(live){
 assert.ok(process.env.OG_EFFORT_AUTH_HELPER,'Live checks require an explicitly authorized read-only auth helper');
 auth=require(path.resolve(process.env.OG_EFFORT_AUTH_HELPER))(root,existingProfile,report.auth);
 const nativeFetch=global.fetch;
 global.fetch=async(url,init)=>{
  const address=new URL(url);
  if(address.origin==='https://chatgpt.com'&&address.pathname.endsWith('/responses')){
   const body=JSON.parse(init.body);assert.ok(allowedLive.has(body.model),'Live model must be selected from the accessible catalogue');assert.ok(report.liveRequests.length<5,'Live request budget');
   const record={model:body.model,effort:body.reasoning?.effort??null,serviceTier:body.service_tier??null,at:Date.now()};report.liveRequests.push(record);
   const response=await nativeFetch(url,init);record.status=response.status;
   wireReads.push(response.clone().text().then(text=>{
    for(const block of text.split(/\r?\n\r?\n/)){const data=block.split(/\r?\n/).filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trim()).join('\n');if(!data||data==='[DONE]')continue;let event;try{event=JSON.parse(data)}catch{continue}
     if(event.response?.reasoning?.effort)record.acceptedEffort=event.response.reasoning.effort;
     if(event.response?.service_tier)record.acceptedTier=event.response.service_tier;
     if(event.type==='response.completed'){const u=event.response?.usage||{};record.usage={input_tokens:u.input_tokens,output_tokens:u.output_tokens,total_tokens:u.total_tokens,cached_tokens:u.input_tokens_details?.cached_tokens,reasoning_tokens:u.output_tokens_details?.reasoning_tokens};record.completed=true}
    }
    record.elapsedMs=Date.now()-record.at;
   }));
   return response;
  }
  return nativeFetch(url,init);
 };
}
const OpenAI=require(path.join(root,'desktop/openai.js')),nativeStream=OpenAI.stream;
OpenAI.stream=async(request,context)=>{
 if(request.model.startsWith('gpt-9-effort-ui-')){await listening;const url='http://127.0.0.1:'+server.address().port;return nativeStream(request,{...context,apiUrl:url,codexUrl:url})}
 assert.ok(live&&request.provider==='chatgpt'&&allowedLive.has(request.model),'No unapproved live API request');return nativeStream(request,context);
};
async function finish(error){
 if(finished)return;finished=true;if(error)report.error=String(error.stack||error);
 if(win&&!win.isDestroyed())try{const p=path.join(output,error?'failure.png':'final.png');fs.writeFileSync(p,(await win.webContents.capturePage()).toPNG());report.screenshots.push(p)}catch{}
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,live,checks:report.checks.length,error:report.error||null}));server.closeAllConnections();server.close();app.exit(error?1:0);
}
process.stdout?.on('error',()=>{});process.stderr?.on('error',()=>{});process.on('uncaughtException',finish);process.on('unhandledRejection',finish);setTimeout(()=>finish(Error('Effort error UI timeout')),live?300000:140000);
app.on('browser-window-created',(_,w)=>w.webContents.on('console-message',e=>{if(e.level==='error'){if(e.message==='ResizeObserver loop completed with undelivered notifications.')report.warnings.push(e.message);else report.errors.push(e.message)}}));
const Update=require(path.join(root,'desktop/update.js')),setup=Update.setup;let mainWindow=()=>null;Update.setup=host=>{mainWindow=host.window;return setup(host)};
require(path.join(root,'desktop/main.js'));
app.whenReady().then(async()=>{
 for(let i=0;i<400;i++){win=mainWindow();if(win&&!win.webContents.isLoading())break;await pause(40)}assert.ok(win);win.setContentSize(1280,860);win.show();win.focus();
 const js=code=>{report.lastScript=code.slice(0,1000);return win.webContents.executeJavaScript(code)};
 const wait=async(condition,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await js(condition))return;await pause(35)}throw Error('Not ready: '+condition)};
 const boot=async()=>{await wait("typeof chat!=='undefined'&&!!library.home&&!!effortSlider");await js('library.ready.then(()=>null)');await wait("!document.documentElement.classList.contains('is-splash')");await js("document.querySelector('.tour-skip')?.click();void 0");await wait("!document.querySelector('.tour')")};
 await boot();if(await js("I18n.lang!=='ru'")){await js("I18n.set('ru');void 0");win.webContents.reload();await pause(100);await boot()}
 await js("openghost.notify.set({on:false,sound:false}).then(()=>null)");
 await js(`(()=>{Chat.prototype.foresee=()=>{};Chat.prototype.name=()=>{};Chat.prototype.keepFacts=async()=>{};settings.models=[{id:'openai:effort-ui',provider:'openai',api:'gpt-9-effort-ui-main',name:'GPT · проверка effort',context:128000,efforts:['low','medium','high','ultra'],defaultEffort:'medium',tools:false,vision:true}];settings.model='openai:effort-ui';settings.keys.openai='fixture-only';settings.connected=()=>true;syncAll()})()`);
 win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 const settle=async()=>{await wait("!Theme.moving&&effortSlider.morph.settled&&(effortSlider.opened||!effortSlider.panel.matches(':popover-open'))");await pause(220)};
 const cdp=(method,args)=>win.webContents.debugger.sendCommand(method,args);
 const click=async(expression)=>{await settle();const p=await js(`(()=>{const e=${expression};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp('Input.dispatchMouseEvent',{type,...p,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await pause(120)};
 const key=async(name,vk)=>{await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:vk,...(name==='Enter'?{text:'\r'}:{})});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:vk});await pause(70)};
 const choose=async(level)=>{await click('effortSlider.button');await wait('effortSlider.opened');await settle();await js('effortSlider.slider.focus();void 0');await key('Home',36);const n=await js(`effortSlider.efforts.indexOf(${JSON.stringify(level)})`);assert.ok(n>=0);for(let i=0;i<n;i++)await key('ArrowRight',39);await key('Escape',27);await wait('!effortSlider.opened');check('Native effort selection: '+level,await js(`chat.effort===${JSON.stringify(level)}`))};
 const fresh=async(model)=>{await js(`chat.newChat({path:${JSON.stringify(path.join(output,'workspace'))},name:'Effort check'});chat.setModel(${JSON.stringify(model)});syncAll();void 0`);await settle()};
 const send=async(text)=>{await js(`composerInput.focus();composerText.place(${JSON.stringify(text)});syncComposer();void 0`);await key('Enter',13);await wait("!!chat.active.record&&!chat.busy&&!main.querySelector('.message.is-streaming')",100000);await settle()};
 const shot=async(name)=>{await settle();const p=path.join(output,name+'.png');fs.writeFileSync(p,(await win.webContents.capturePage()).toPNG());report.screenshots.push(p)};
 check('Real desktop client and separate test profile',app.getPath('userData')===path.join(output,'profile')&&await js('chat instanceof Chat&&!!openghost.llm'));
 for(const theme of ['light','dark']){
  await js(`Theme.set('${theme}').then(()=>null)`);await settle();await fresh('openai:effort-ui');await choose('ultra');const before=report.requests.length;await send('Проверка неподдерживаемого уровня.');
  check(theme+': invalid effort produces one request and a visible error',report.requests.length===before+1&&await js("!!chat.active.list.querySelector('.message-error')"));
  check(theme+': API error does not overwrite the selected level',await js("chat.effort==='ultra'&&chat.active.record.effort==='ultra'&&settings.find(chat.model).efforts.includes('high')"));await shot(theme+'-invalid-effort');
  await choose('high');await send('Проверка поддерживаемого High.');const originalId=await js('chat.activeId');
  check(theme+': High reaches the real adapter after the error',report.requests.at(-1).effort==='high'&&report.requests.at(-1).include?.[0]==='reasoning.encrypted_content'&&await js("chat.active.messages.at(-1).content.includes('EFFORT_HIGH_OK')"));
  await click('effortSlider.button');await wait('effortSlider.opened');await shot(theme+'-high-recovered');await key('Escape',27);
  await choose('medium');await send('Повторная смена уровня Medium.');
  check(theme+': reopening after the captured High panel sends the next Medium',report.requests.at(-1).effort==='medium'&&await js("chat.active.messages.at(-1).content.includes('EFFORT_MEDIUM_OK')"));
  await choose('high');
  await fresh('openai:effort-ui');await choose('low');await send('Отдельный чат Low.');
  check(theme+': another chat keeps and transmits Low',report.requests.at(-1).effort==='low'&&await js("chat.active.record.effort==='low'"));
  await js(`chat.open(${JSON.stringify(originalId)}).then(()=>null)`);await settle();check(theme+': returning restores the original High',await js("chat.effort==='high'&&effortSlider.efforts[effortSlider.value]==='high'"));
 }
 if(live){
  const models=await OpenAI.models({provider:'chatgpt'},{chatgpt:auth.credentials,version:app.getVersion()});
  const first=models.find(m=>m.api.includes('terra')&&m.efforts.includes('ultra')&&m.efforts.includes('high'));
  const second=models.find(m=>m.api.includes('luna')&&m.efforts.includes('high'));assert.ok(first&&second,'Two available real models');
  for(const m of [first,second])allowedLive.add(m.api);report.liveModels=[first.api,second.api];
  await js(`settings.models.push(...${JSON.stringify([first,second].map(m=>({...m,tools:false})))});syncAll();void 0`);
  await js("Theme.set('light').then(()=>null)");await fresh(first.id);await choose('ultra');await send('Тест параметра: ответь только EFFORT_OK.');
  check('Real GPT rejects Ultra without a silent parameter downgrade',report.liveRequests.length===1&&report.liveRequests[0].status===400&&report.liveRequests[0].effort==='ultra'&&await js("!!chat.active.list.querySelector('.message-error')"));
  await choose('high');await send('Проверка после ошибки. Ответь ровно: LIVE_HIGH_OK');
  check('Real first GPT answers after selecting High',report.liveRequests.at(-1).status===200&&report.liveRequests.at(-1).effort==='high'&&await js("chat.active.messages.at(-1).content.includes('LIVE_HIGH_OK')&&chat.active.record.effort==='high'"));
  await click('effortSlider.button');await wait('effortSlider.opened');await shot('live-first-high');await key('Escape',27);
  await choose('medium');await send('Проверка смены уровня. Ответь ровно: LIVE_MEDIUM_OK');
  check('Real first GPT accepts a subsequent Medium',report.liveRequests.at(-1).status===200&&report.liveRequests.at(-1).effort==='medium'&&await js("chat.active.messages.at(-1).content.includes('LIVE_MEDIUM_OK')"));
  await fresh(second.id);await choose('high');await send('Независимая проверка High. Ответь ровно: LIVE_SECOND_HIGH_OK');
  check('Real second GPT independently receives and answers at High',report.liveRequests.at(-1).model===second.api&&report.liveRequests.at(-1).status===200&&report.liveRequests.at(-1).effort==='high'&&await js("chat.active.messages.at(-1).content.includes('LIVE_SECOND_HIGH_OK')"));
  await click('effortSlider.button');await wait('effortSlider.opened');await shot('live-second-high');await key('Escape',27);await Promise.all(wireReads);
  check('Successful real streams all complete and do not contradict the selected effort',report.liveRequests.filter(r=>r.status===200).every(r=>r.completed&&(!r.acceptedEffort||r.acceptedEffort===r.effort)));
  check('Live authentication is read-only with no refresh or write attempted',!report.auth.authWritesBlocked&&!report.auth.refreshBlocked);
 }
 const savedId=await js('chat.activeId'),savedEffort=await js('chat.effort');await js('Promise.all([library.persist(),...library.writes.values()]).then(()=>null)');win.webContents.reload();await pause(120);await boot();await js(`chat.open(${JSON.stringify(savedId)}).then(()=>null)`);await settle();
 check('Reload preserves the selected effort in actual chat storage',await js(`chat.active.record.effort===${JSON.stringify(savedEffort)}`));
 check('No unexpected renderer errors',report.errors.length===0);finish();
}).catch(finish);
