'use strict';
// Actual Chat.loop/request -> StreamView -> Markdown -> Diagram in an isolated Electron renderer.
// Only provider/tool results are fixtures. No live model, agent command, server or application profile is used.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = fs.mkdtempSync(path.join(os.tmpdir(), 'og-native-visuals-'));
app.setPath('userData', path.join(output, 'profile'));
app.setPath('sessionData', path.join(output, 'session'));
app.on('window-all-closed', () => {});
process.stdout?.on('error', () => {}); process.stderr?.on('error', () => {});
const report = { output, checks: [], errors: [], screenshots: [] }; let finished = false;
function finish(error) {
 if (finished) return; finished = true;
 if (error) report.error = String(error.stack || error);
 fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
 console.log(JSON.stringify({ output, checks: report.checks.length, error: report.error || null }));
 app.exit(error ? 1 : 0);
}
process.on('uncaughtException', finish); process.on('unhandledRejection', finish);
setTimeout(() => finish(Error('Native visuals UI timeout')), 110000);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, pass) => { assert.ok(pass, name); report.checks.push(name); };
const scripts = ['i18n-ru.js', 'i18n.js', 'glyphs.js', 'file-kinds.js', 'tex.js', 'highlight.js', 'markdown.js', 'diagram.js', 'stream-view.js', 'agent-plan.js', 'plan-proof.js', 'chat.js'];
const chart = '```mermaid\nxychart-beta\n title Значения из тестовой фикстуры\n x-axis [A, B, C]\n y-axis Значение 0 --> 10\n bar "Измерение" [3, 6, 9]\n```';
const progress = '## Первые результаты\n\n**Проверены три значения**. График показан до завершения работы.\n\n### Сравнение значений\n\n' + chart;
const rich = '\n\n> [!NOTE]\n> Данные этого примера заданы тестом, а не получены от модели.\n\n| Этап | Число |\n| --- | --- |\n| A | 3 |\n| B | 6 |\n| C | 9 |\n\n- **Выделение** сохранено\n- *Курсив* и `код` тоже\n';
const tail = rich + '\n## Итог проверки\n\n**Готово**. Работа продолжилась в том же ответе, без повторного графика.\n';
const fixture = path.join(output, 'fixture.html');
fs.writeFileSync(fixture, `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(root, 'styles.css')).href}"><style>
html,body{height:auto;min-height:100%;overflow:auto}body{margin:0;background:var(--chat-bg);color:var(--fg-primary)}.fixture-page{container-type:inline-size;min-height:100vh;width:100%;padding:32px 0;overflow:hidden}.fixture-content{width:calc(100% - 56px);max-width:680px;margin:0 auto;font-size:var(--composer-font-size);line-height:var(--message-line-height)}.fixture-status{font:12px/1.4 system-ui;color:var(--fg-secondary);margin-bottom:24px}.fixture-tools{margin:24px auto 0;width:calc(100% - 56px);max-width:680px;font:13px/1.5 system-ui;color:var(--fg-secondary)}
</style><script>localStorage.setItem('openghost.lang','ru');window.Skills={blocks:()=>''};window.Usage={parts:()=>null};window.Providers={};window.UserContext={pictures:()=>[]};window.AgentTools={shell:'run_powershell'};</script></head><body><main class="fixture-page"><div class="fixture-content"><div class="fixture-status">Изолированная UI-проверка · промежуточный ответ</div><article id="answer" class="markdown"></article></div><div class="fixture-tools" id="tool-status"></div></main>${scripts.map(file => `<script src="${pathToFileURL(path.join(root, file)).href}"></script>`).join('')}</body></html>`);

app.whenReady().then(async () => {
 const win = new BrowserWindow({ show: false, width: 1000, height: 920, webPreferences: { offscreen: true, backgroundThrottling: false } });
 win.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); });
 win.webContents.on('render-process-gone', (_event, details) => finish(Error(JSON.stringify(details))));
 const js = code => { report.lastScript = code.slice(0, 300); return win.webContents.executeJavaScript(code); };
 const wait = async condition => { for (let i = 0; i < 160; i++) { if (await js(condition)) return; await pause(25); } throw Error('Not ready: ' + condition); };
 const settle = async () => { await pause(60); await js(`Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))).then(()=>null)`); await wait(`Array.from(document.querySelectorAll('.md-diagram')).every(el=>el.__view?.result&&!el.__view.scene.raf)`); await pause(80); };
 const shot = async name => { await settle(); const file = path.join(output, name + '.png'); fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG()); report.screenshots.push(file); };
 await win.loadFile(fixture); win.webContents.debugger.attach('1.3');
 await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
 const start = async ({ aggregateOnly = false, text = progress } = {}) => {
  await js(`window.fixtureText=${JSON.stringify(text)};window.fixtureTail=${JSON.stringify(tail)};window.aggregateOnly=${aggregateOnly};
   document.querySelector('#answer').replaceChildren();document.querySelector('#tool-status').textContent='';
   window.events=[];window.toolStarted=false;window.completed=false;window.loopError='';window.requests=0;
   window.entry={role:'assistant',content:'',steps:[]};window.conv={id:'fixture',record:{id:'fixture'},messages:[entry],tokens:0};
   window.stream=new StreamView(document.querySelector('#answer'));window.view={stream};
   window.turn={config:{id:'fixture',provider:'openai'},controller:new AbortController(),part:{entry,view},parts:[],approvals:new Set(),queue:[],pills:[]};
   window.chat=Object.create(Chat.prototype);Object.assign(chat,{agent:()=>false,system:async()=>[],history:()=>[],notes:()=>[],seam:()=>0,session:()=>'fixture',dismissGhost(){},showGhost(){},compactIfNeeded:async()=>{},planWatch:()=>false,planNudge:()=>'',planBack:()=>'',proofAudit:()=>'',save(){},
    useTool:async()=>{toolStarted=true;events.push('tool');window.atTool={shown:stream.shown,length:stream.source.length,done:stream.done,boundary:stream.boundary,svg:!!document.querySelector('.md-diagram svg'),live:document.querySelector('.md-diagram')?.hasAttribute('data-live'),raw:entry.content};window.firstDiagram=document.querySelector('.md-diagram');window.firstView=firstDiagram?.__view;window.firstSVG=firstDiagram?.querySelector('svg');window.firstHeadings=Array.from(document.querySelectorAll('.md-h'));window.firstClasses=firstHeadings.map(h=>h.className);document.querySelector('#tool-status').textContent='Инструмент запущен. Ответ остаётся открытым для продолжения.';await new Promise(resolve=>window.releaseTool=resolve);return 'fixture result';}});
   Providers.stream=async(_config,options)=>{requests++;const text=requests===1?fixtureText:fixtureTail;if(!aggregateOnly){let accumulated='';for(let i=0;i<text.length;i+=47){const delta=text.slice(i,i+47);accumulated+=delta;options.onContent?.(delta,{content:accumulated});}window.backlog=stream.source.length-stream.shown;}return {content:text,toolCalls:requests===1?[{id:'fixture-tool',function:{name:'read_file',arguments:'{}'}}]:[],finishReason:requests===1?'tool_calls':'stop'};};
   window.runPromise=chat.loop(conv,turn).then(async reason=>{window.finishReason=reason;await stream.finish();completed=true;document.querySelector('#tool-status').textContent='Инструмент завершён. Нативный рисунок сохранён в том же ответе.';}).catch(error=>{loopError=String(error.stack||error);throw error});void 0`);
  await wait('toolStarted||!!loopError'); check('Fixture tool is reached without a renderer exception', !(await js('loopError'))); await settle();
 };
 const complete = async () => { await js('releaseTool();void 0'); await wait('completed||!!loopError'); check('The same real agent loop continues and finishes', await js(`completed&&finishReason==='stop'&&requests===2&&!loopError`)); await settle(); };
 await start();
 check('Progress is fully rendered before tool dispatch despite a pending typing backlog', await js(`atTool.shown===atTool.length&&atTool.length>100&&atTool.boundary&&!atTool.done`));
 check('A closed chart without a trailing newline is native before the tool starts', await js(`atTool.svg&&!atTool.live&&atTool.raw===fixtureText&&!!firstView.result&&firstSVG.textContent.includes('Значения из тестовой фикстуры')`));
 check('Two ordinary Markdown headings have distinct existing highlight classes', await js(`firstHeadings.length===2&&firstClasses[0]!==firstClasses[1]&&firstClasses.every(c=>/t-/.test(c))`));
 check('Heading highlights and chart are visibly drawn while the tool is waiting', await js(`firstHeadings.every(h=>h.getBoundingClientRect().height>20&&getComputedStyle(h,'::before').backgroundColor!=='rgba(0, 0, 0, 0)')&&firstSVG.getBoundingClientRect().height>150&&firstSVG.querySelectorAll('[data-key]').length>3`));
 check('The chart exposes a text alternative and its known values', await js(`firstSVG.getAttribute('role')==='img'&&!!firstSVG.getAttribute('aria-label')&&firstSVG.textContent.includes('Значения из тестовой фикстуры')`));
 await shot('progress-light');
 await js(`document.documentElement.dataset.theme='dark';void 0`); await shot('progress-dark');
 check('Dark appearance retains the same heading classes and native chart view', await js(`firstHeadings.every((h,i)=>h.className===firstClasses[i])&&firstDiagram.__view===firstView`));
 await complete();
 check('Continuation reuses the exact diagram, SVG, view and earlier heading nodes', await js(`document.querySelector('.md-diagram')===firstDiagram&&firstDiagram.__view===firstView&&firstDiagram.querySelector('svg')===firstSVG&&firstHeadings.every((h,i)=>document.querySelectorAll('.md-h')[i]===h&&h.className===firstClasses[i])`));
 check('The final text contains one figure and advances the heading palette', await js(`document.querySelectorAll('.md-diagram').length===1&&document.querySelectorAll('.md-h').length===3&&new Set(Array.from(document.querySelectorAll('.md-h')).map(h=>h.className)).size===3`));
 check('Table, callout, emphasis, inline code and list use the real rich renderer', await js(`!!document.querySelector('.md-table table')&&!!document.querySelector('.md-callout')&&!!document.querySelector('strong')&&!!document.querySelector('em')&&!!document.querySelector('p code,li code')&&!!document.querySelector('ul')`));
 check('Raw history has no invented fence or duplicated progress figure', await js(`entry.content.startsWith(fixtureText)&&entry.content.endsWith(fixtureTail.trim())&&(entry.content.match(/\x60\x60\x60mermaid/g)||[]).length===1&&entry.steps.filter(s=>s.role==='tool').length===1`));
 await shot('final-dark');
 await js(`document.documentElement.dataset.theme='light';void 0`); await shot('final-light');
 // Real editor controls remain usable after checkpoint and continuation.
 await js(`firstView.ensureTools();firstDiagram.querySelector('[data-action="edit"]').click();void 0`);
 check('The native editor still opens after continuing the response', await js(`firstView.editing&&!!firstDiagram.querySelector('.dg-editor')`));
 await js(`firstView.closeEditor();void 0`); await settle();
 win.setContentSize(400, 940); await pause(100); await settle();
 report.narrow = await js(`({width:innerWidth,scroll:document.documentElement.scrollWidth,svg:firstSVG.getBoundingClientRect().toJSON(),headings:firstHeadings.map(h=>h.getBoundingClientRect().toJSON())})`);
 await shot('narrow-light');
 check('A narrow viewport still displays the chart without page overflow', await js(`innerWidth<=420&&document.documentElement.scrollWidth<=innerWidth+1&&firstSVG.getBoundingClientRect().width<=innerWidth&&firstSVG.getBoundingClientRect().height>0`));
 win.setContentSize(960, 920); win.webContents.setZoomFactor(2); await pause(100); await settle();
 check('200 percent zoom keeps the native chart and colored headings visible', await js(`innerWidth<=500&&firstSVG.getBoundingClientRect().width<=innerWidth&&firstHeadings.every(h=>h.getBoundingClientRect().width<=innerWidth)&&document.documentElement.scrollWidth<=innerWidth+1`));
 await shot('zoom-200'); win.webContents.setZoomFactor(1); await pause(80);
 await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
 await start({ aggregateOnly: true, text: progress + rich });
 check('Terminal-packet-only text also shows its full native chart before the tool', await js(`atTool.svg&&!atTool.live&&atTool.shown===atTool.length&&atTool.raw===fixtureText.trim()&&!atTool.done`));
 check('Tables, callouts, emphasis and inline code are already visible before the tool', await js(`!stream.done&&!!document.querySelector('.md-table table')&&!!document.querySelector('.md-callout')&&!!document.querySelector('em')&&!!document.querySelector('li code')`));
 await complete();
 check('Reduced motion preserves rich formatting and the same chart view', await js(`matchMedia('(prefers-reduced-motion: reduce)').matches&&document.querySelector('.md-diagram').__view===firstView&&document.querySelectorAll('.md-h').length===3`));
 // Live incomplete fences remain incomplete: checkpoint must never fabricate model content.
 await start({ text: '## Ещё строится\n\n```mermaid\nflowchart LR\n A[Начало] --> B[Проверка]\n B --> C[Ещё]' });
 check('An unfinished figure stays live and its raw fence is not silently closed', await js(`atTool.live&&firstDiagram.__view.live&&entry.content===fixtureText&&!fixtureText.endsWith('\x60\x60\x60')`));
 await js(`releaseTool();void 0`); await wait('completed');
 check('No renderer errors occurred', report.errors.length === 0);
 win.destroy(); finish();
}).catch(finish);
