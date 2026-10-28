'use strict';
// Full desktop/main.js + index.html, actual LLM IPC/parser, Providers, Chat, tools and storage.
// Only the remote model is replaced by a loopback HTTP/SSE server. Nothing uses a real key or user profile.
const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = fs.mkdtempSync(path.join(os.tmpdir(), 'og-real-resume-'));
const workspace = path.join(output, 'workspace');
for (const dir of ['profile', 'session', 'workspace']) fs.mkdirSync(path.join(output, dir));
fs.writeFileSync(path.join(workspace, 'fixture.txt'), 'RECOVERY_FIXTURE: this file was read by the actual tool.\n');
app.setName('OpenGhost recovery check');
app.setPath('userData', path.join(output, 'profile'));
app.setPath('sessionData', path.join(output, 'session'));
shell.writeShortcutLink = () => true;
delete process.env.OPENGHOST_UPDATE_AS;
process.stdout?.on('error', () => {}); process.stderr?.on('error', () => {});
const report = { output, checks: [], errors: [], screenshots: [], requests: [], tools: [] };
let finished = false, scenario = null;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, pass) => { assert.ok(pass, name); report.checks.push(name); console.log('ok  ' + name); };
const textOf = message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
const packet = delta => ({ choices: [{ delta }] });
function emit(res, event) { res.write('data: ' + JSON.stringify(event) + '\n\n'); }
function complete(res, content = '', calls = []) {
 if (content) emit(res, packet({ content }));
 if (calls.length) emit(res, packet({ tool_calls: calls }));
 emit(res, { choices: [{ delta: {}, finish_reason: calls.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 15000, completion_tokens: 30, total_tokens: 15030 } });
 res.end('data: [DONE]\n\n');
}
function fail(res, content, incomplete = false, code = 503) {
 emit(res, packet({ content }));
 if (incomplete) emit(res, packet({ tool_calls: [{ index: 0, id: 'incomplete', type: 'function', function: { name: 'write_file', arguments: '{"path":"should-not-exist.txt","content":' } }] }));
 emit(res, { error: { code, message: 'Fixture provider error' } });
 res.end();
}
const server = http.createServer(async (req, res) => {
 try {
  if (req.method === 'GET' && !req.url.endsWith('/models')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ fixture: 'OpenGhost recovery check', ready: true })); return; }
  if (req.url.endsWith('/models')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'recovery-ui', context_length: 128000 }] })); return; }
  assert.equal(req.url, '/v1/chat/completions');
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.ok(scenario, 'A test scenario owns every request'); assert.equal(body.model, 'recovery-ui');
  const current = scenario, n = ++current.calls;
  current.requests.push(body);
  report.requests.push({ scenario: current.name, n, at: Date.now(), model: body.model, effort: body.reasoning_effort, messages: body.messages.length, toolResults: body.messages.filter(m => m.role === 'tool'), last: body.messages.slice(-3).map(m => ({ role: m.role, content: textOf(m).slice(0, 900) })) });
  if (current.name === 'permanent') { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Fixture invalid key' } })); return; }
  if (current.name === 'quota-http') { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'credit_balance_exhausted', type: 'insufficient_quota', message: 'Fixture empty credit balance' } })); return; }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  if (['quota-stream', 'filter-stream', 'unknown-stream'].includes(current.name)) {
   fail(res, 'Сохранённый текст перед постоянной ошибкой.', false, { 'quota-stream': 'credit_balance_exhausted', 'filter-stream': 'content_filter', 'unknown-stream': 'unknown_error' }[current.name]);
  } else if (current.name === 'symbolic-overload') {
   if (n === 1) fail(res, 'Фрагмент до временной перегрузки.', false, 'server_error');
   else complete(res, 'Символьная перегрузка восстановлена автоматически.');
  } else if (current.name === 'tools') {
   if (n === 1) complete(res, '## Проверка файла\n\nПрочитаю тестовый файл один раз.\n', [{ index: 0, id: 'read-once', type: 'function', function: { name: 'read_file', arguments: '{"path":"fixture.txt"}' } }]);
   else if (n === 2) fail(res, '## Сохранённый прогресс\n\nФайл прочитан. Этот фрагмент получен до обрыва связи.', true);
   else current.release = () => complete(res, '## Работа продолжена\n\nОтвет восстановлен автоматически. Ранее прочитанный файл повторно не запрашивался.');
  } else if (current.name === 'queue') {
   if (n === 1) {
    emit(res, packet({ content: 'Фрагмент до временного сбоя.' }));
    current.interrupt = () => { emit(res, { error: { code: 503, message: 'Fixture temporary overload' } }); res.end(); };
   } else current.release = () => complete(res, 'Рекомендация учтена после восстановления связи.');
  } else if (current.name === 'stop') fail(res, 'Этот текст останется после нажатия End.');
  else if (current.name === 'outage') fail(res, 'Сохранённый фрагмент ' + n + '.');
  else throw Error('Unknown test scenario');
 } catch (error) { finish(error); }
});
const listening = new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
function finish(error) {
 if (finished) return; finished = true;
 if (error) report.error = String(error.stack || error);
 fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
 console.log(JSON.stringify({ output, checks: report.checks.length, error: report.error || null }));
 server.closeAllConnections(); server.close(); app.exit(error ? 1 : 0);
}
process.on('uncaughtException', finish); process.on('unhandledRejection', finish);
setTimeout(() => finish(Error('Full recovery check timeout')), 210000);
app.on('browser-window-created', (_event, win) => win.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); }));
// Count actual dispatches and refuse anything beyond the fixture's one read-only action.
const Tools = require(path.join(root, 'desktop', 'tools.js')), originalTool = Tools.runTool;
Tools.runTool = async (id, name, args, cwd, sender) => {
 report.tools.push({ name, args, cwd });
 assert.equal(name, 'read_file', 'No shell, write or other action may run in this test');
 assert.equal(args.path, 'fixture.txt'); assert.equal(cwd, workspace);
 return originalTool(id, name, args, cwd, sender);
};
const Update = require(path.join(root, 'desktop', 'update.js')), setupUpdate = Update.setup;
let mainWindow = () => null;
Update.setup = host => { mainWindow = host.window; return setupUpdate(host); };
require(path.join(root, 'desktop', 'main.js'));
app.whenReady().then(async () => {
 await listening;
 report.address = 'http://127.0.0.1:' + server.address().port + '/v1';
 let win;
 for (let n = 0; n < 300; n++) { win = mainWindow(); if (win && !win.webContents.isLoading()) break; await pause(50); }
 assert.ok(win, 'Real application window exists'); win.setContentSize(1280, 860); win.webContents.setBackgroundThrottling(false); win.show(); win.focus();
 const js = code => { report.lastScript = code.slice(0, 600); return win.webContents.executeJavaScript(code); };
 const wait = async (condition, timeout = 16000) => { let last = ''; const end = Date.now() + timeout; while (Date.now() < end) { try { if (await js(condition)) return; } catch (error) { last = String(error); } await pause(20); } throw Error('Not ready: ' + condition + ' ' + last); };
 const click = async expression => {
  const point = await js(`(()=>{const el=${expression};el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, ...point, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) });
 };
 const shot = async name => { await pause(430); const file = path.join(output, name + '.png'); fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG()); report.screenshots.push(file); };
 const ready = async () => {
  await wait(`typeof chat!=='undefined'&&!!chatList&&!!library.home`); await js(`library.ready.then(()=>null)`); await wait(`!document.documentElement.classList.contains('is-splash')`);
  await js(`(()=>{const tour=document.querySelector('.tour');[...tour?.querySelectorAll('button')||[]].find(b=>/skip|пропуст|ignorer|salta/i.test(b.textContent))?.click()})()`);
  await wait(`!document.querySelector('.tour')`);
  await js(`(()=>{localStorage.setItem('openghost.lang','ru');settings.models=[{id:'recovery-ui',api:'recovery-ui',provider:'custom',name:'Локальная проверка',context:128000,efforts:['low','high'],defaultEffort:'high',thinking:'levels',tools:true,vision:true}];settings.model='recovery-ui';settings.shown='';settings.keys.custom='fixture-only';settings.hand.custom.address=${JSON.stringify(report.address)};Providers.complete=async()=>'';Providers.predict=async()=>'';ModePicker.prototype.set.call({settings},'full');composerSend.addEventListener('composer-send',()=>{window.checkedTurn=chat.active.turn;window.checkedTurnId=checkedTurn?.id||''});syncAll()})()`);
 };
 await ready(); check('The test controls the main window, not hidden Quick', await js(`!window.openghost.quick`)); await js(`Theme.set('light')`);
 win.webContents.debugger.attach('1.3'); await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
 report.page = win.webContents.getURL(); report.profile = app.getPath('userData');
 check('Real desktop/main.js and index.html are loaded with isolated storage', report.page.endsWith('/index.html') && await js(`chat instanceof Chat&&library instanceof Library&&!!window.openghost.llm`));
 async function start(name, title) {
  assert.ok(!await js(`chat.busy`), 'Previous scenario is finished');
  scenario = { name, calls: 0, requests: [] };
  await js(`(async()=>{const item=library.create({folder:{path:${JSON.stringify(workspace)}},text:${JSON.stringify(title)},attachments:[]});library.update(item.id,{model:'recovery-ui',effort:'high',title:${JSON.stringify(title)},named:true});window.reviewId=item.id;window.checkedTurn=null;window.checkedTurnId='';await chat.open(item.id);composerText.place('Выполни локальную проверку восстановления ответа');syncComposer()})()`);
  await wait(`!composerSend.hasAttribute('disabled')&&!composerSend.raf&&!settings.dialog.open`);
  await js(`Promise.race([Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity&&a.playState==='running').map(a=>a.finished.catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,1300))]).then(()=>null)`);
  await pause(150); await click('composerSend.button');
  await wait(`!!checkedTurn&&!!checkedTurnId`);
  return scenario;
 }
 const recovered = await start('tools', 'Автоматическое продолжение');
 await wait(`chat.active.turn?.reconnecting&&!!chat.active.list.querySelector('.message-retry')`);
 check('After a real SSE failure the turn stays busy and shows reconnecting, not manual Retry', await js(`chat.busy&&composerSend.hasAttribute('stop')&&chat.active.list.textContent.includes('Связь восстанавливается')&&!chat.active.list.querySelector('.message-error,.message-actions')`));
 await shot('real-reconnecting-light');
 await wait(`chat.active.turn===checkedTurn&&checkedTurn.parts.length===2`);
 for (let n = 0; !recovered.release && n < 300; n++) await pause(10);
 check('The new request contains earlier tool output exactly once', recovered.calls === 3 && recovered.requests[2].messages.filter(m => m.role === 'tool' && m.content.includes('RECOVERY_FIXTURE')).length === 1);
 check('The resumed request keeps partial text once and has a continuation instruction', recovered.requests[2].messages.filter(m => m.role === 'assistant' && textOf(m).includes('Этот фрагмент получен до обрыва')).length === 1 && recovered.requests[2].messages.some(m => m.role === 'user' && textOf(m).includes('temporary provider failure')));
 check('Partial write_file arguments are absent from the resumed request', recovered.requests[2].messages.every(m => !m.tool_calls?.some(c => c.id === 'incomplete')) && !fs.existsSync(path.join(workspace, 'should-not-exist.txt')));
 check('The original completed read_file was dispatched exactly once', report.tools.length === 1 && report.tools[0].name === 'read_file');
 recovered.release(); await wait(`!chat.busy`); await wait(`chat.active.list.textContent.includes('Ответ восстановлен автоматически')`);
 check('Automatic completion uses the same turn, model and effort', await js(`chat.active.messages.filter(e=>e.role==='assistant').every(e=>e.turn===checkedTurnId&&e.model==='recovery-ui')`) && recovered.requests.every(r => r.reasoning_effort === 'high'));
 check('The visible transcript retains progress and final text without errors', await js(`chat.active.list.textContent.includes('Этот фрагмент получен до обрыва')&&chat.active.list.textContent.includes('Ответ восстановлен автоматически')&&!chat.active.list.querySelector('.message-error,.message-actions')&&!composerSend.hasAttribute('stop')`));
 const recoveredId = await js(`reviewId`);
 await js(`library.queue(reviewId,()=>Promise.resolve()).then(()=>null)`);
 const saved = JSON.parse(fs.readFileSync(path.join(output, 'profile', 'store', 'chats', recoveredId + '.json'), 'utf8'));
 check('Real on-disk history includes partial text and completed tool result once', saved.messages.flatMap(m => m.steps || []).filter(m => m.role === 'tool' && m.content.includes('RECOVERY_FIXTURE')).length === 1 && saved.messages.filter(m => m.role === 'assistant' && m.content.includes('Этот фрагмент получен до обрыва')).length === 1);
 await shot('real-recovered-light'); await js(`Theme.set('dark')`); await pause(400); await shot('real-recovered-dark');
 const queued = await start('queue', 'Рекомендация при переподключении');
 await wait(`chat.active.turn?.writing&&chat.active.list.textContent.includes('Фрагмент до временного сбоя')`);
 await js(`composerText.place('USER_CORRECTION: используй уже прочитанный результат');syncComposer()`); await wait(`composerSend.hasAttribute('caption')&&!composerSend.hasAttribute('stop')&&!composerSend.raf`);
 await click('composerSend.button');
 await wait(`chat.active.turn?.queue.length===1`);
 queued.interrupt();
 for (let n = 0; !queued.release && n < 400; n++) await pause(10);
 check('A real recommendation pending at interruption enters resumed context once', queued.calls === 2 && queued.requests[1].messages.filter(m => m.role === 'user' && textOf(m).startsWith('USER_CORRECTION')).length === 1);
 queued.release(); await wait(`!chat.busy`);
 check('The recommendation was consumed without ending and restarting the turn', await js(`chat.active.messages.filter(e=>e.role==='assistant').every(e=>e.turn===checkedTurnId)&&chat.active.messages.filter(e=>e.role==='user'&&e.text?.startsWith('USER_CORRECTION')).length===1`));
 const stopped = await start('stop', 'End во время ожидания');
 await wait(`chat.active.turn?.reconnecting&&checkedTurn.retryBudget.used>=2&&composerSend.hasAttribute('stop')&&!composerSend.raf`);
 await shot('real-backoff-end-dark'); const requestsAtStop = stopped.calls;
 await click('composerSend.button'); await wait(`!chat.busy`); await pause(2200);
 check('End cancels actual backoff without another HTTP request', stopped.calls === requestsAtStop && await js(`!checkedTurn.reconnecting&&checkedTurn.controller.signal.aborted&&!composerSend.hasAttribute('stop')`));
 check('End leaves the partial text saved and shows the normal stopped note', await js(`chat.active.messages.some(e=>e.content?.includes('Этот текст останется'))&&!!chat.active.list.querySelector('.message-note')&&!chat.active.list.querySelector('.message-error')`));
 const permanent = await start('permanent', 'Постоянная ошибка'); await wait(`!chat.busy`);
 check('A permanent auth failure stops without retrying and keeps manual recovery available', permanent.calls === 1 && await js(`!!chat.active.list.querySelector('.message-error')&&!!chat.active.list.querySelector('.message-actions')`));
 for (const name of ['quota-http', 'quota-stream', 'filter-stream', 'unknown-stream']) {
  const denied = await start(name, 'Постоянная ошибка: ' + name);
  await wait(`!chat.busy&&!!chat.active.list.querySelector('.message-error')&&!!chat.active.list.querySelector('.message-actions')`);
  check(name + ': a permanent or unknown error sends exactly one real HTTP request', denied.calls === 1);
  if (name !== 'quota-http') check(name + ': partial progress survives without entering reconnection', await js(`chat.active.messages.some(m=>m.content?.includes('Сохранённый текст перед постоянной ошибкой'))&&!checkedTurn.reconnecting&&checkedTurn.retryBudget.used===0`));
 }
 const symbolic = await start('symbolic-overload', 'Временная символьная ошибка');
 await wait(`!chat.busy&&chat.active.list.textContent.includes('Символьная перегрузка восстановлена автоматически')`);
 check('A real statusless server_error still continues automatically', symbolic.calls === 2 && await js(`!chat.active.list.querySelector('.message-error,.message-actions')`));
 const outage = await start('outage', 'Ограничение попыток'); const began = Date.now();
 await wait(`!chat.busy`, 85000);
 report.outageSeconds = (Date.now() - began) / 1000;
 await wait(`!!chat.active.list.querySelector('.message-error')&&!!chat.active.list.querySelector('.message-actions')`);
 check('A persistent partial-stream outage ends after seven actual HTTP requests', outage.calls === 7 && report.outageSeconds >= 62 && await js(`!!chat.active.list.querySelector('.message-error')&&!!chat.active.list.querySelector('.message-actions')`));
 check('No recovery scenario executes incomplete or repeated tool calls', report.tools.length === 1 && !fs.existsSync(path.join(workspace, 'should-not-exist.txt')));
 // A full renderer reload reads the real saved transcript, rather than using the in-memory conversation cache.
 await js(`library.persist()`); win.webContents.reload(); await pause(100); await ready();
 await js(`chat.open(${JSON.stringify(recoveredId)}).then(()=>null)`); await wait(`chat.active.list.textContent.includes('Ответ восстановлен автоматически')`);
 check('After a full renderer reload both partial progress and final answer reopen intact', await js(`chat.active.messages.some(e=>e.content?.includes('Этот фрагмент получен до обрыва'))&&chat.active.messages.some(e=>e.content?.includes('Ответ восстановлен автоматически'))&&chat.history(chat.active).filter(m=>m.role==='tool').length===1`));
 check('The full application reported no renderer errors', report.errors.length === 0);
 finish();
}).catch(async error => {
 try {
  const win = mainWindow();
  if (win) {
   const file = path.join(output, 'failure.png'); fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG()); report.screenshots.push(file);
   report.state = await win.webContents.executeJavaScript(`({text:document.body.innerText.slice(-1800),busy:chat.busy,config:chat.config(chat.active),draft:composerText.text(),send:composerSend.outerHTML,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.className)})`);
  }
 } catch {}
 finish(error);
});
