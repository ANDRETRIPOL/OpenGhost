'use strict';
// Starts the actual packaged binary, drives its full UI over loopback CDP and writes screenshots/report.
// Only disposable test chats are created. No inference, installed profile, updater installation or account access.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const executable = process.env.APP_EXEC && path.resolve(process.env.APP_EXEC);
assert.ok(executable && fs.existsSync(executable), 'APP_EXEC must name a packaged binary');
const output = process.env.OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'og-release-smoke-'));
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(output, 'profile-'));
const workspace = fs.mkdtempSync(path.join(output, 'workspace-'));
const report = { platform: process.platform, executable, output, profile, workspace, checks: [], errors: [], screenshots: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, value) => { assert.ok(value, name); report.checks.push(name); console.log('PASS ' + name); };
let child, socket, logs;
async function main() {
  const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
  logs = fs.openSync(path.join(output, 'app.log'), 'w');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.OPENGHOST_UPDATE_AS;
  child = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`, '--disable-backgrounding-occluded-windows', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], { cwd: workspace, env, stdio: ['ignore', logs, logs], windowsHide: true });
  child.on('error', error => { report.spawnError = String(error); });
  let run, send;
  for (let attempt = 0; attempt < 100 && !run; attempt++) {
    const pages = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()).catch(() => []);
    for (const page of pages) {
      if (page.type !== 'page' || !page.url.endsWith('/index.html')) continue;
      const current = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { current.onopen = resolve; current.onerror = reject; });
      let next = 1; const waiting = new Map();
      current.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.id) { const pending = waiting.get(data.id); if (pending) { clearTimeout(pending.timer); waiting.delete(data.id); pending.resolve(data); } }
        if (data.method === 'Runtime.exceptionThrown') report.errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
      };
      const request = (method, params = {}) => new Promise((resolve, reject) => {
        const id = next++; const timer = setTimeout(() => { waiting.delete(id); reject(Error('CDP timeout: ' + method)); }, 30000);
        waiting.set(id, { resolve, timer }); current.send(JSON.stringify({ id, method, params }));
      });
      const evaluate = async expression => {
        const answer = await request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (answer.error || answer.result?.exceptionDetails) throw Error(JSON.stringify(answer.error || answer.result.exceptionDetails));
        return answer.result?.result?.value;
      };
      if (await evaluate("typeof chat !== 'undefined' && !openghost.quick").catch(() => false)) { socket = current; run = evaluate; send = request; report.page = page.url; break; }
      current.close();
    }
    if (!run) await sleep(700);
  }
  check('Packaged main window is reachable', !!run);
  await send('Runtime.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  report.viewport = await run('({width:innerWidth,height:innerHeight,canSplit:splitView.canFit()})');
  check('The test viewport fits two chat panes', report.viewport.canSplit);
  const until = async expression => { const end = Date.now() + 30000; while (Date.now() < end) { if (await run(expression)) return; await sleep(80); } throw Error('Not ready: ' + expression); };
  const shot = async name => { const result = await send('Page.captureScreenshot', { format: 'png' }); assert.ok(result.result?.data); const file = path.join(output, name + '.png'); fs.writeFileSync(file, Buffer.from(result.result.data, 'base64')); report.screenshots.push(file); };
  const click = async expression => {
    const p = await run(`(()=>{const e=${expression};e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...p, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
    await sleep(180);
  };
  await until("!!library.home && !document.documentElement.classList.contains('is-splash')");
  await run('library.ready.then(()=>null)');
  await run("document.querySelector('.tour-skip')?.click();void 0");
  await until("!document.querySelector('.tour')");
  report.about = await run('openghost.about()');
  check('The packaged app reports the release version', report.about.version === '1.5.3');
  check('The UI is loaded from the packaged ASAR', report.page.includes('app.asar'));
  check('Desktop preload and storage IPC are available', await run("!!openghost.llm && !!ChatStore && chat instanceof Chat"));
  await run(`(async()=>{library.home.path=${JSON.stringify(workspace)};settings.models=[{id:'openai:release-fixture',api:'gpt-release-fixture',provider:'openai',name:'Release test model (no requests)',fast:true,context:128000,efforts:['low','medium','high'],defaultEffort:'high',tools:false,vision:true}];settings.model='openai:release-fixture';settings.keys.openai='test-only-not-a-key';settings.connected=()=>true;window.releaseIds=[];for(const title of ['Release test A','Release test B']){const r=library.create({folder:{path:${JSON.stringify(workspace)},name:'Release test'},text:title,attachments:[]});releaseIds.push(r.id);library.update(r.id,{title,named:true,model:'openai:release-fixture',mode:'ask',effort:'high'});await ChatStore.write('chats/'+r.id,{messages:[{role:'user',text:title,content:title,at:Date.now(),attachments:[]},{role:'assistant',content:'Packaged application smoke test. No model request was sent.',at:Date.now()}],tokens:100})}await library.persist();await chat.open(releaseIds[0]);await Theme.set('light');syncAll()})()`);
  await until("chat.active.list.textContent.includes('No model request was sent')");
  await sleep(800);
  report.history = await run("({id:chat.activeId,messages:chat.active.messages.length,text:chat.active.list.textContent.slice(-500)})");
  check('Disposable chat history is rendered', await run("chat.active.list.textContent.includes('No model request was sent')"));
  await run('splitView.open(releaseIds[1]).then(()=>null)');
  await until('splitView.opened && !splitView.motionFlights?.length');
  check('Split View has two independent conversations', await run('chat.activeId===releaseIds[0] && splitView.pane.chat.activeId===releaseIds[1] && chat.active!==splitView.pane.chat.active'));
  await run("chat.setMode('auto');splitView.pane.chat.setMode('ask');composerText.place('Draft A');splitView.pane.text.place('Draft B');syncAll();void 0");
  check('Modes and drafts stay independent', await run("chat.mode==='auto' && splitView.pane.chat.mode==='ask' && composerInput.value==='Draft A' && splitView.pane.input.value==='Draft B'"));
  await sleep(900); await shot('split-light');
  // Collapse before opening the full-size effort capsule, then use native pointer input on the actual controls.
  await run('splitView.close();void 0'); await sleep(450);
  await click('effortSlider.button'); await until('effortSlider.opened && effortSlider.morph.settled');
  check('Fast is available and initially off', await run("!effortSlider.fastButton.hidden && chat.speed==='standard'"));
  await click('effortSlider.fastButton');
  check('Native Fast click keeps the chosen effort', await run("chat.speed==='fast' && chat.effort==='high' && effortSlider.fastButton.getAttribute('aria-pressed')==='true'"));
  await shot('fast-light');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await run('splitView.open(releaseIds[1]).then(()=>null)'); await until('splitView.opened && !splitView.motionFlights?.length');
  await run('window.releaseMiniA=MiniChat.open({settings:chat.settings,source:chat,library});window.releaseMiniB=MiniChat.open({settings:splitView.pane.settings,source:splitView.pane.chat,library});void 0');
  await until('releaseMiniA.open && releaseMiniB.open && !releaseMiniA.main.classList.contains("is-loading") && !releaseMiniB.main.classList.contains("is-loading")');
  check('Each pane opens its own mini chat', await run('MiniChat.visible.size===2 && releaseMiniA!==releaseMiniB && releaseMiniA.source===chat && releaseMiniB.source===splitView.pane.chat'));
  await sleep(900); await shot('two-minis-light');
  await run("Theme.set('dark').then(()=>null)"); await sleep(900); await shot('two-minis-dark');
  check('Dark theme is rendered', await run("getComputedStyle(document.documentElement).colorScheme.includes('dark') || document.documentElement.dataset.theme==='dark'"));
  check('No uncaught renderer exceptions', report.errors.length === 0);
}
const watchdog = setTimeout(() => { report.error = 'Smoke test timeout'; finish(1); }, 180000);
let finished = false;
function finish(code) {
  if (finished) return; finished = true; clearTimeout(watchdog);
  if (socket) socket.close();
  if (child && child.exitCode === null) child.kill();
  if (logs !== undefined) fs.closeSync(logs);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, checks: report.checks.length, error: report.error || null }));
  process.exit(code);
}
main().then(() => finish(0)).catch(error => { report.error = String(error.stack || error); console.error(report.error); finish(1); });
