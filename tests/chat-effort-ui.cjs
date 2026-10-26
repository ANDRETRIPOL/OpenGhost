'use strict';
// Real effort control + Settings/Chat/Library in an isolated Electron profile.
// Models are fixtures, no API, shell command or application profile is used.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = fs.mkdtempSync(path.join(os.tmpdir(), 'og-chat-effort-'));
app.setPath('userData', path.join(output, 'profile')); app.on('window-all-closed', () => {});
process.stdout?.on('error', () => {}); process.stderr?.on('error', () => {});
const report = { output, checks: [], errors: [], screenshots: [] }; let finished = false;
function finish(error) { if (finished) return; finished = true; if (error) report.error = String(error.stack || error); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, checks: report.checks.length, error: report.error || null })); app.exit(error ? 1 : 0); }
process.on('uncaughtException', finish); process.on('unhandledRejection', finish); setTimeout(() => finish(Error('Chat effort UI timeout')), 110000);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, pass) => { assert.ok(pass, name); report.checks.push(name); };
const scripts = ['i18n-it.js', 'i18n-fr.js', 'i18n-ru.js', 'i18n.js', 'glyphs.js', 'liquid-glass.js', 'icon-button.js', 'effort-button.js', 'dock.js', 'effort-paint.js', 'effort-morph.js', 'effort-stage.js', 'effort-slider.js', 'settings.js', 'chat-lock.js', 'library.js', 'agent-plan.js', 'plan-proof.js', 'chat.js'];
const panel = (id, anchor) => `<div id="${id}" class="effort-panel" popover="manual" style="position-anchor:${anchor}"><div class="effort-slider" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="3"><div class="effort-track"><span class="effort-fill"></span></div><span class="effort-thumb glass-lens"></span></div></div>`;
const fixture = path.join(output, 'fixture.html');
fs.writeFileSync(fixture, `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(root, 'styles.css')).href}"><style>
body{margin:0;overflow:hidden;background:var(--chat-bg)}.fixture-nav{position:fixed;left:24px;top:28px;width:190px;display:grid;gap:10px}.fixture-nav button{font:inherit;padding:10px;border:0;border-radius:12px;background:var(--plate);color:var(--fg-primary);cursor:pointer}.fixture-main{position:relative;margin:60px 30px 0 240px;width:min(600px,calc(100vw - 270px))}.fixture-title{font:600 20px/1.4 system-ui;color:var(--fg-primary);margin:0 0 12px}.fixture-level{color:var(--fg-secondary);font:15px/1.4 system-ui;margin:0 0 24px}.fixture-main .composer{position:relative;inset:auto;transform:none;width:100%;max-width:none;margin:0}.fixture-main .composer-field{padding:18px 20px;color:var(--fg-secondary)}.fixture-secondary{position:fixed;bottom:24px;left:24px;display:flex;gap:14px;align-items:center;color:var(--fg-secondary);font:13px system-ui}.fixture-quick{anchor-name:--fixture-quick}
</style><script>localStorage.setItem('openghost.lang','ru');if(!localStorage.getItem('deepseek.effort'))localStorage.setItem('deepseek.effort','xhigh');window.Skills={blocks:()=>''};window.Usage={parts:()=>null};window.Providers={};</script></head><body>
<nav class="fixture-nav"><button data-chat="a">Чат A · GPT</button><button data-chat="b">Чат B · GPT</button><button data-chat="c">Чат C · Claude</button><button id="fixture-new">Новый чат</button><button data-model="gpt">Выбрать GPT</button><button data-model="claude">Выбрать Claude</button></nav>
<section class="fixture-main"><h1 class="fixture-title"></h1><p class="fixture-level"></p><div class="composer"><div class="composer-field">Изолированная проверка effort. Запросы к моделям не выполняются.</div><div class="composer-toolbar"><div class="composer-tools"></div><div class="composer-actions"><span class="fixture-model"></span><effort-button class="composer-effort"></effort-button></div></div></div></section>
<div class="fixture-secondary"><span>Второй контрол · другой чат</span><effort-button class="fixture-quick"></effort-button></div>
${panel('main-effort', '--effort')}${panel('quick-effort', '--fixture-quick')}
${scripts.map(file => `<script src="${pathToFileURL(path.join(root, file)).href}"></script>`).join('')}</body></html>`);

app.whenReady().then(async () => {
 const win = new BrowserWindow({ show: false, width: 1100, height: 840, webPreferences: { offscreen: true, backgroundThrottling: false } });
 win.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); }); win.webContents.on('render-process-gone', (_e, details) => finish(Error(JSON.stringify(details))));
 const js = code => { report.lastScript = code.slice(0, 300); return win.webContents.executeJavaScript(code); };
 const settle = async () => { await pause(40); await js(`Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))).then(()=>null)`); for(let i=0;i<100;i++){if(await js(`(!window.control||control.morph.settled)&&(!window.quickControl||quickControl.morph.settled)`))break;await pause(25)} await pause(100); };
 const click = async selector => { const p = await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`); await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1}); await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1}); await settle(); };
 const key = async keyCode => { report.keyboard ||= []; const before=await js(`({active:document.activeElement?.outerHTML,focused:document.hasFocus(),chat:chat.active?.id,value:control.value,locked:control.locked,opened:control.opened,a:lib.chat('a').effort,b:lib.chat('b').effort,c:lib.chat('c').effort})`); const windowsVirtualKeyCode={ArrowRight:39,Home:36,End:35,Escape:27}[keyCode]; await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:keyCode,code:keyCode,windowsVirtualKeyCode}); await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:keyCode,code:keyCode,windowsVirtualKeyCode}); await settle(); report.keyboard.push({keyCode,before,after:await js(`({active:document.activeElement?.outerHTML,value:control.value,a:lib.chat('a').effort,b:lib.chat('b').effort,c:lib.chat('c').effort})`)}); };
 const shot = async name => { await settle(); const file = path.join(output, name + '.png'); fs.writeFileSync(file, (await win.webContents.capturePage({x:220,y:20,width:680,height:300})).toPNG()); report.screenshots.push(file); };
 const setup = async () => {
  await js(`window.models=[{id:'gpt',provider:'chatgpt',api:'gpt-fixture',name:'GPT',efforts:['low','medium','high','xhigh'],defaultEffort:'medium'},{id:'claude',provider:'anthropic',api:'claude-fixture',name:'Claude',efforts:['low','medium','high','max'],defaultEffort:'high'}];
   if(!localStorage.getItem('fixture-store/index'))localStorage.setItem('fixture-store/index',JSON.stringify({chats:[{id:'a',model:'gpt',effort:'high',title:'Чат A · GPT',folder:'C:\\Fixture',updated:1},{id:'b',model:'gpt',effort:'low',title:'Чат B · GPT',folder:'C:\\Fixture',updated:1},{id:'c',model:'claude',effort:'max',title:'Чат C · Claude',folder:'C:\\Fixture',updated:1}],folders:[{path:'C:\\Fixture',name:'Fixture'}]}));
   window.indexWrites=0;window.store={read:async key=>JSON.parse(localStorage.getItem('fixture-store/'+key)||'null'),write:async(key,value)=>{if(key==='index')indexWrites++;localStorage.setItem('fixture-store/'+key,JSON.stringify(value))},remove:async key=>localStorage.removeItem('fixture-store/'+key)};
   window.lib=new Library(store,()=>window.sync?.());window.ready=lib.ready;window.settings=Object.create(Settings.prototype);Object.assign(settings,{models,model:localStorage.getItem('openghost.model')||'gpt',shown:'',effort:'high',legacyEffort:localStorage.getItem('deepseek.effort'),efforts:models[0].efforts.slice(),keys:{},hand:{custom:{}},connected:()=>true});void 0`);
  await js('ready.then(()=>null)');
  await js(`window.chat=Object.create(Chat.prototype);Object.assign(chat,{settings,library:lib,active:null,conversations:new Map(),opening:0,onChange:()=>window.sync?.(),activate(conv){this.active=conv;window.sync?.()},restore(){},main:document.querySelector('.fixture-main')});
   window.q=Object.create(Chat.prototype);Object.assign(q,{settings,library:lib,active:{id:'c',record:lib.chat('c')},onChange:()=>window.sync?.()});
   window.sync=()=>{if(chat.active){settings.show(chat.model);control?.follow();control?.lock(chat.busy);document.querySelector('.fixture-title').textContent=chat.active.record?.title||'Новый чат';document.querySelector('.fixture-model').textContent=settings.find(chat.model)?.name||'';document.querySelector('.fixture-level').textContent='Собственный effort: '+EffortStage.nameOf(chat.effort)}if(window.quickControl)quickControl.follow()};
   window.control=null;window.quickControl=null;void 0`);
  await js(`chat.open('a')`);
  await js(`window.control=new EffortSlider({button:document.querySelector('.composer-effort'),panel:document.querySelector('#main-effort'),settings,chat});window.quickControl=new EffortSlider({button:document.querySelector('.fixture-quick'),panel:document.querySelector('#quick-effort'),settings,chat:q});
   document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>chat.open(b.dataset.chat));document.querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>chat.setModel(b.dataset.model));document.querySelector('#fixture-new').onclick=()=>chat.newChat();sync();void 0`);
  await settle();
 };
 await win.loadFile(fixture); win.webContents.debugger.attach('1.3'); await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }); await setup();
 check('A starts at its own High value', await js(`chat.effort==='high'&&control.value===2&&control.slider.getAttribute('aria-valuetext')===EffortStage.nameOf('high')`));
 check('A second control reads its own model and value', await js(`quickControl.value===3&&quickControl.efforts[3]==='max'`));
 await click('[data-chat="b"]');
 check('Opening B with the same GPT restores Low', await js(`chat.active.id==='b'&&chat.effort==='low'&&control.value===0`));
 await click('.composer-effort');
 check('The real effort button opens its panel', await js(`control.opened&&control.panel.matches(':popover-open')`)); await shot('first-open');
 await js(`control.slider.focus()`); await key('ArrowRight');
 check('Keyboard changes only B to Medium', await js(`lib.chat('b').effort==='medium'&&lib.chat('a').effort==='high'&&lib.chat('c').effort==='max'`));
 await key('Escape'); await click('[data-chat="a"]');
 check('Returning to A restores High instead of B’s Medium', await js(`chat.effort==='high'&&control.value===2&&control.slider.getAttribute('aria-valuetext')===EffortStage.nameOf('high')`));
 await click('.composer-effort'); await js(`control.slider.focus()`); await key('End');
 check('A can be changed to XHigh without changing B', await js(`lib.chat('a').effort==='xhigh'&&lib.chat('b').effort==='medium'&&control.value===3`)); await shot('chat-a-xhigh');
 await key('Escape'); await click('[data-chat="b"]'); await click('.composer-effort');
 check('B keeps Medium after A was changed', await js(`chat.effort==='medium'&&control.value===1`)); await shot('chat-b-medium');
 await key('Escape'); await click('[data-chat="c"]');
 check('A different provider restores its own Max value', await js(`chat.effort==='max'&&control.efforts[3]==='max'&&control.value===3`));
 await click('.composer-effort'); await js(`control.slider.focus()`); await key('Home'); await key('Escape'); await click('[data-chat="a"]');
 check('Changing another provider never changes A or B', await js(`lib.chat('c').effort==='low'&&chat.effort==='xhigh'&&lib.chat('b').effort==='medium'`));
 await click('[data-model="claude"]');
 check('Switching A’s provider shows a compatible value without saving the fallback', await js(`chat.model==='claude'&&chat.effort==='high'&&lib.chat('a').effort==='xhigh'&&lib.chat('b').effort==='medium'`));
 await click('[data-model="gpt"]');
 check('Switching A back recovers its prior XHigh', await js(`chat.model==='gpt'&&chat.effort==='xhigh'&&control.value===3`));
 await click('[data-chat="c"]'); await click('#fixture-new');
 check('A new chat still uses the last manually picked GPT', await js(`chat.model==='gpt'&&!chat.active.record`));
 check('A new chat gets the GPT default Medium, not another chat’s last level', await js(`chat.effort==='medium'&&control.value===1`));
 await click('.composer-effort'); await js(`control.slider.focus()`); await key('Home'); await key('Escape');
 check('A draft choice does not affect any saved chat', await js(`chat.active.effort==='low'&&lib.chat('a').effort==='xhigh'&&lib.chat('b').effort==='medium'`));
 await click('[data-chat="a"]'); await js(`window.running=chat.begin(chat.active,chat.config(chat.active));sync()`); await settle();
 check('The effort control is disabled during the current request', await js(`control.locked&&control.button.hasAttribute('disabled')`));
 await click('[data-chat="b"]'); await click('.composer-effort'); await js(`control.slider.focus()`); await key('Home'); await key('Escape');
 check('Another chat cannot mutate the captured running request', await js(`running.config.effort==='xhigh'&&lib.chat('a').effort==='xhigh'&&lib.chat('b').effort==='low'`));
 await js(`chat.conversations.get('a').turn=null;lib.persist().then(()=>null)`);
 await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload()}); await setup();
 check('Reopening saved data restores distinct chat efforts', await js(`lib.chat('a').effort==='xhigh'&&lib.chat('b').effort==='low'&&lib.chat('c').effort==='low'&&chat.effort==='xhigh'`));
 check('The old shared effort key was not changed', await js(`localStorage.getItem('deepseek.effort')==='xhigh'`));
 await click('[data-chat="b"]');
 check('Accessible labels refresh on a same-model switch after reload', await js(`control.slider.getAttribute('aria-valuetext')===EffortStage.nameOf('low')&&control.button.getAttribute('label')===I18n.t('effort.current',{name:EffortStage.nameOf('low')})`));
 // Both appearances and a high zoom use the same saved value; no layout-driven commits.
 for(const theme of ['light','dark']){
  await js(`document.documentElement.dataset.theme='${theme}'`);await click('.composer-effort');
  check(theme+': correct saved level with a visible panel',await js(`control.value===0&&control.panel.matches(':popover-open')&&control.slider.getBoundingClientRect().width>0`));await shot('effort-'+theme);await key('Escape');
 }
 win.webContents.setZoomFactor(1.5);await pause(120);await click('.composer-effort');
 report.zoom=await js(`({value:control.value,opened:control.opened,width:control.slider.getBoundingClientRect().width,viewport:innerWidth,buttonRight:control.button.getBoundingClientRect().right,a:lib.chat('a').effort,b:lib.chat('b').effort})`);
 check('150 percent zoom keeps the current value and control visible',await js(`control.value===0&&control.slider.getBoundingClientRect().width>0&&lib.chat('a').effort==='xhigh'`));await key('Escape');win.webContents.setZoomFactor(1);
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await click('[data-chat="a"]');await click('.composer-effort');await js(`control.slider.focus()`);await key('Home');await key('Escape');await click('[data-chat="b"]');
 check('Reduced motion preserves isolation while switching chats',await js(`lib.chat('a').effort==='low'&&lib.chat('b').effort==='low'&&control.value===0`));
 check('No renderer errors',report.errors.length===0);
 await js(`lib.flush()`);win.destroy();finish();
}).catch(finish);
