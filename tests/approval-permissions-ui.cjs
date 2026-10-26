'use strict';
// Real approval card/deck, Chat approval dispatch and chat-menu reset in an isolated Electron window.
// Everything persisted is fixture data in memory; only screenshots/report/profile are written to a new temp folder.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'og-ask-permissions-'));
app.setPath('userData', path.join(output, 'profile'));
app.on('window-all-closed', () => {});
process.stdout?.on('error', () => {}); process.stderr?.on('error', () => {});
const report = { output, checks: [], errors: [], screenshots: [] };
let finished = false;
function finish(error) {
 if (finished) return; finished = true;
 if (error) report.error = String(error.stack || error);
 fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
 console.log(JSON.stringify({ output, checks: report.checks.length, error: report.error || null }));
 app.exit(error ? 1 : 0);
}
process.on('uncaughtException', finish); process.on('unhandledRejection', finish);
setTimeout(() => finish(Error('ASK UI test timeout')), 110000);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(name, pass) { assert.ok(pass, name); report.checks.push(name); }
const scripts = ['i18n-it.js', 'i18n-fr.js', 'i18n-ru.js', 'i18n.js', 'glyphs.js', 'chat-lock.js', 'library.js', 'row-menu.js', 'chat-list.js', 'approval-card.js', 'agent-tools.js', 'agent-plan.js', 'plan-proof.js', 'chat.js'];
const fixture = path.join(output, 'fixture.html');
fs.writeFileSync(fixture, `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(root, 'styles.css')).href}"><style>
body{margin:0;overflow:hidden;background:var(--chat-bg)}.main{position:relative;display:block;inset:auto;width:min(860px,calc(100vw - 40px));max-width:calc(100vw - 40px);height:auto;margin:70px auto;background:none;overflow:visible}.composer{position:relative;inset:auto;width:100%;max-width:none;margin:0;transform:none}.fixture-chats{position:fixed;left:16px;top:12px;width:220px;height:400px;display:none}.chats-scroll{height:100%}
</style><script>window.Skills={blocks:()=>''};window.Usage={parts:()=>null};window.Providers={};window.AgentLine={show(){},deed:()=>''};</script></head><body>
<nav class="chats fixture-chats"><div class="chats-scroll"><div class="chats-list"></div></div></nav>
<main class="main"><div class="fixture-reply"></div><div class="composer"><div class="composer-field" style="height:80px"></div><div class="composer-toolbar" style="height:30px"></div></div></main>
${scripts.map(file => `<script src="${pathToFileURL(path.join(root, file)).href}"></script>`).join('')}</body></html>`);

app.whenReady().then(async () => {
 const win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { offscreen: true, backgroundThrottling: false } });
 win.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); });
 win.webContents.on('render-process-gone', (_event, details) => finish(Error(JSON.stringify(details))));
 const js = code => { report.lastScript = code.slice(0, 300); return win.webContents.executeJavaScript(code); };
 const until = async expression => { for (let i = 0; i < 100; i++) { if (await js(expression)) return true; await pause(25); } return false; };
 const click = async selector => {
  const point = await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 }); await pause(35);
 };
 const key = async keyCode => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode }); if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode }); await pause(35); };
 const settle = async () => { await pause(40); await js(`Promise.all([...document.getAnimations()].filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))).then(()=>null)`); await pause(80); };
 // The app applies a language on page reload. Re-read its actual I18n module here while retaining fixture state.
 const language = async lang => { await js(`I18n.set(${JSON.stringify(lang)})`); await js(fs.readFileSync(path.join(root,'i18n.js'),'utf8')); assert.equal(await js('I18n.lang'),lang); };
 const shot = async (name, selector = '.approval') => {
  await settle();
  const rect = await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.max(0,Math.floor(r.x)-4),y:Math.max(0,Math.floor(r.y)-4),width:Math.ceil(r.width)+8,height:Math.ceil(r.height)+8}})()`);
  const file = path.join(output, name + '.png');
  fs.writeFileSync(file, (await win.webContents.capturePage(rect)).toPNG()); report.screenshots.push(file);
 };
 await win.loadFile(fixture);
 win.webContents.debugger.attach('1.3');
 await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
 await js(`window.disk=new Map();window.fault={write:false,remove:false,hold:false};window.writes=0;window.ran=0;
 window.fixtureRecord={id:'ask-fixture',title:'ASK permissions',folder:'C:\\Fixture',created:1,updated:1};
 window.store={read:async key=>key==='index'?{chats:[fixtureRecord]}:structuredClone(disk.get(key)),write:async(key,value)=>{if(key.startsWith('permissions/')){writes++;if(fault.hold)await new Promise(resolve=>window.releaseWrite=resolve);if(fault.write)throw Error('fixture write failure')}disk.set(key,structuredClone(value))},remove:async key=>{if(fault.remove&&key.startsWith('permissions/'))throw Error('fixture reset failure');disk.delete(key)}};
 window.lib=new Library(store,()=>{});window.ready=lib.ready;void 0`);
 await js('ready.then(()=>null)');
 await js(`window.conv={id:fixtureRecord.id,record:fixtureRecord};window.chat=Object.create(Chat.prototype);Object.assign(chat,{main:document.querySelector('.main'),settings:{mode:'ask'},library:lib,active:conv,tools:0,onPlan(){},dismissGhost(){},showGhost(){},replied(){},followBottom(){},cwd:()=>fixtureRecord.folder,attachedFiles:()=>({}),seat:()=>null});
 window.makeTurn=()=>({controller:new AbortController(),queue:[],approvals:new Set()});window.view={el:document.querySelector('.fixture-reply'),status:document.createElement('div')};
 window.begin=()=>{conv.turn=makeTurn();window.answer=chat.approve(conv,conv.turn,view,{name:'web_search',args:{query:'Electron ASK permission fixture'},cwd:fixtureRecord.folder,apart:null});return null};
 window.finishCard=async()=>{chat.approvalDeck?.card?.settle('deny');await answer;return null};
 window.agent={active:{id:'other'},activeId:fixtureRecord.id,isDraft:false,isBusy:()=>false,isUnread:()=>false,isLocked:()=>lib.isLocked(fixtureRecord.id)};
 window.list=new ChatList({root:document.querySelector('.fixture-chats'),library:lib,chat:agent,onNewFolder(){},onNewChat(){},onLock(){}});void 0`);
 // The actual Chat.approve method constructs a card with a scoped persistence callback.
 await language('en'); await js('begin()'); await settle(); await shot('initial-card');
 check('ASK card has three explicit actions', await js(`document.querySelectorAll('.approval-actions button').length===3`));
 check('Always allow is secondary; Allow remains primary', await js(`!!document.querySelector('.approval-button.is-always')&&!!document.querySelector('.approval-button.is-allow')&&!document.querySelector('.approval-button.is-always.is-allow')`));
 check('Scope is visible and linked for assistive technology', await js(`(()=>{const b=document.querySelector('.is-always'),hint=document.getElementById(b.getAttribute('aria-describedby'));return !!hint&&hint.textContent===I18n.t('approve.always.kind')&&hint.getBoundingClientRect().height>0})()`));
 await click('.approval-button.is-allow'); check('Allow once does not save a rule', await js(`answer.then(v=>v==='allow'&&!disk.has('permissions/'+fixtureRecord.id))`)); await settle();
 await js('begin()'); await settle(); await click('.approval-button.is-deny');
 check('Deny does not save a rule', await js(`answer.then(v=>v==='deny'&&!disk.has('permissions/'+fixtureRecord.id))`)); await settle();
 await js(`begin();fault.hold=true;writes=0`); await settle(); await click('.approval-button.is-always');
 check('Saving disables all choices and keeps the card waiting', await js(`chat.approvalDeck.card.saving&&!chat.approvalDeck.card.settled&&[...document.querySelectorAll('.approval-actions button')].every(b=>b.disabled)&&document.querySelector('.approval').getAttribute('aria-busy')==='true'`));
 await js(`chat.approvalDeck.card.chooseAlways();fault.hold=false;releaseWrite();void 0`);
 check('A double press saves once and allows only after saving', await js(`answer.then(v=>v==='allow'&&writes===1&&disk.get('permissions/'+fixtureRecord.id).rules.length===1)`)); await settle();
 await js(`AgentTools.run=async()=>{ran++;return 'fixture result'};window.call={id:'fixture',function:{name:'web_search',arguments:'{"query":"next search"}'}};conv.turn=makeTurn();window.next=chat.useTool(conv,conv.turn,view,call);void 0`);
 check('The next same-kind tool call proceeds without another card', await js(`next.then(v=>v==='fixture result'&&ran===1&&conv.turn.approvals.size===0)`));
 await js(`lib.resetPermissions(fixtureRecord.id)`); await js('begin()'); await settle();
 check('Reset makes the next action ask again', await js(`!!chat.approvalDeck.card&&!chat.approvalDeck.card.settled`));
 await js(`fault.write=true`); await click('.approval-button.is-always');
 check('Failed save stays open, grants nothing and offers retry', await until(`!!document.querySelector('.approval-error')&&!chat.approvalDeck.card.settled&&!disk.has('permissions/'+fixtureRecord.id)&&!document.querySelector('.is-always').disabled`));
 await shot('save-failure'); await js(`fault.write=false`); await click('.approval-button.is-allow'); await js('answer'); await settle();
 // The command card from the real approval flow keeps its disclosure and precise scope.
 await language('ru');
 await js(`conv.turn=makeTurn();window.commandRequest={name:AgentTools.shell,args:{command:'Get-ChildItem -LiteralPath $HOME/Downloads',description:'Посмотреть содержимое папки «Загрузки»'},cwd:fixtureRecord.folder,apart:null};window.answer=chat.approve(conv,conv.turn,view,commandRequest);void 0`); await settle();
 check('A command keeps its disclosure, three choices and exact-command scope',await js(`!!document.querySelector('.approval-reveal')&&document.querySelectorAll('.approval-actions button').length===3&&document.querySelector('.approval-hint').textContent===I18n.t('approve.always.exact')`));
 await click('.approval-reveal');await settle();
 check('Show command still reveals the actual command',await js(`document.querySelector('.approval').classList.contains('is-open')&&document.querySelector('.approval-code').textContent===commandRequest.args.command`));await shot('ru-command');
 await click('.approval-button.is-deny');await js('answer');await settle();
 await js(`conv.turn=makeTurn();window.answer=chat.approve(conv,conv.turn,view,{name:'browser_press',args:{key:'Enter'},cwd:fixtureRecord.folder,apart:null});void 0`);await settle();
 check('A potentially submitting key has no Always allow choice',await js(`document.querySelectorAll('.approval-actions button').length===2&&!document.querySelector('.approval-button.is-always')`));await click('.approval-button.is-deny');await js('answer');await settle();
 await js(`chat.settings.mode='auto';conv.turn=makeTurn();window.answer=chat.approve(conv,conv.turn,view,commandRequest);void 0`);await settle();
 check('AUTO approval cards never offer an ASK exception',await js(`document.querySelectorAll('.approval-actions button').length===2&&!document.querySelector('.approval-button.is-always')`));await click('.approval-button.is-deny');await js('answer');await settle();await js(`chat.settings.mode='ask'`);
 // Four languages, both appearances and a width where the three choices need wrapping.
 for (const lang of ['en', 'ru', 'it', 'fr']) for (const theme of ['light', 'dark']) for (const width of [860, 340]) {
  await language(lang); await js(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.querySelector('.main').style.width='${width}px';begin()`); await settle();
  const fits = await js(`(()=>{const card=document.querySelector('.approval'),r=card.getBoundingClientRect(),buttons=[...card.querySelectorAll('.approval-actions button')];return card.scrollWidth<=card.clientWidth+1&&buttons.every(b=>{const x=b.getBoundingClientRect();return x.left>=r.left&&x.right<=r.right+1&&b.scrollWidth<=b.clientWidth})})()`);
  check(lang+' '+theme+' '+width+': complete labels without horizontal clipping', fits);
  if (lang==='ru' && width===860) await shot('ru-'+theme);
  if (lang==='fr' && theme==='light' && width===340) await shot('fr-narrow');
  await js('finishCard()'); await settle();
 }
 // Real keyboard activation must keep the explicit choice; no blanket grant by a shortcut.
 await language('ru'); await js(`document.querySelector('.main').style.width='860px';begin()`); await settle();
 await js(`document.querySelector('.approval-button.is-deny').focus()`); await key('Tab');
 report.keyboard = await js(`({active:document.activeElement?.outerHTML,focused:document.hasFocus(),visible:document.activeElement?.matches(':focus-visible')})`);
 check('Tab reaches Always allow with a visible focus ring', await js(`document.activeElement===document.querySelector('.is-always')&&document.activeElement.matches(':focus-visible')`));
 await key('Enter'); check('Keyboard activation saves the same scoped rule', await js(`answer.then(v=>v==='allow'&&disk.has('permissions/'+fixtureRecord.id))`)); await settle();
 await js(`lib.resetPermissions(fixtureRecord.id)`);
 win.setSize(760, 800); win.webContents.setZoomFactor(2); await pause(150);
 await js(`begin()`); await settle();
 check('200 percent zoom keeps all three choices inside the card', await js(`(()=>{const r=document.querySelector('.approval').getBoundingClientRect();return [...document.querySelectorAll('.approval-actions button')].every(b=>{const q=b.getBoundingClientRect();return q.left>=r.left&&q.right<=r.right+1&&b.scrollWidth<=b.clientWidth})})()`));
 await js('finishCard()'); await settle(); win.webContents.setZoomFactor(1); win.setSize(1100,800); await pause(120);
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
 await js('begin()'); await pause(60);
 check('Reduced motion still exposes and settles all actions', await js(`document.querySelectorAll('.approval-actions button').length===3`)); await click('.approval-button.is-deny'); await js('answer'); await settle(); win.webContents.debugger.detach();
 // Real menu item, reset storage, keyboard focus and retry after an injected disk error.
 await js(`document.querySelector('.fixture-chats').style.display='block';document.querySelector('.main').style.display='none';lib.allowPermission(fixtureRecord.id,'fixture-rule')`);
 const menu = () => js(`{const item=list.rows.get(fixtureRecord.id);list.menu.open(fixtureRecord.id,item.row,item.row.querySelector('.is-more'));}void 0`);
 await menu(); await settle(); await shot('reset-menu','.row-menu'); await click('.row-menu-line.is-permissions');
 check('Menu reset removes saved permissions and restores row focus', await until(`!disk.has('permissions/'+fixtureRecord.id)&&!list.menu.id&&document.activeElement===list.rows.get(fixtureRecord.id).row`));
 await js(`lib.allowPermission(fixtureRecord.id,'fixture-rule')`); await js(`fault.remove=true`); await menu(); await settle(); await click('.row-menu-line.is-permissions');
 check('Failed reset remains open and does not claim success', await until(`!!list.menu.id&&!!disk.get('permissions/'+fixtureRecord.id)&&!document.querySelector('.is-permissions').disabled&&document.querySelector('.is-permissions').textContent===I18n.t('approve.resetFailed')`));
 await js(`fault.remove=false`); await click('.row-menu-line.is-permissions');
 check('Retry after failed reset succeeds', await until(`!disk.has('permissions/'+fixtureRecord.id)&&!list.menu.id`));
 await js(`fixtureRecord.lock={fixture:true};lib.keys.clear();list.render()`); await menu();
 check('A locked chat cannot reset permissions until unlocked', await js(`document.querySelector('.is-permissions').disabled`)); await js(`list.menu.close(true)`);
 check('No renderer errors', report.errors.length===0);
 win.destroy(); finish();
}).catch(finish);
