'use strict';

// The released app itself, started by the workflow with a debugging port, driven the way a user would use it: the
// address of a real local server goes into Settings → Providers → Local models, a model is picked, a message is sent.
// Nothing stands in for anything: the app is the one from the release, the server and the model are real.
// Env: ADDRESS (the local server), PORT (the app's debugging port), OUT (where to put the picture), WINDOW (the window
// the model is expected to be listed with, when known).
const fs = require('node:fs');
const ADDRESS = process.env.ADDRESS, PORT = process.env.PORT || '9222', OUT = process.env.OUT || '.';
const WAIT = Number(process.env.ANSWER_MINUTES || 40) * 60000;
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`); };
const note = (name, ok, detail = '') => console.log(`${ok ? 'GOOD' : 'NOTE'} ${name}${detail ? ` :: ${detail}` : ''}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function attach() {
 for (let k = 0; k < 60; k++) {
  const pages = await fetch(`http://127.0.0.1:${PORT}/json`).then(response => response.json()).catch(() => null);
  for (const page of pages || []) {
   if (page.type !== 'page' || !page.webSocketDebuggerUrl) continue;
   const socket = new WebSocket(page.webSocketDebuggerUrl);
   await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
   let next = 1;
   const waiting = new Map();
   socket.onmessage = event => { const data = JSON.parse(event.data); if (data.id && waiting.has(data.id)) { waiting.get(data.id)(data); waiting.delete(data.id); } };
   const send = (method, params = {}) => new Promise(resolve => { const id = next++; waiting.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
   const run = async code => {
    const reply = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(`in the page: ${reply.result.exceptionDetails.exception?.description || reply.result.exceptionDetails.text}`);
    return reply.result?.result?.value;
   };
   // The app has two windows: the main one, and the quick chat's, which is not the one to drive.
   const main = await run(`typeof settings !== 'undefined' && typeof chat !== 'undefined' && !(window.openghost && window.openghost.quick)`).catch(() => false);
   if (main) return { run, send, url: page.url };
   socket.close();
  }
  await sleep(1000);
 }
 throw new Error('the app\'s main window did not come up');
}

(async () => {
 const { run, send, url } = await attach();
 console.log('driving:', url);
 const until = async (code, ms, every = 500) => { const from = Date.now(); while (Date.now() - from < ms) { if (await run(code)) return true; await sleep(every); } return false; };
 const shot = async name => { const reply = await send('Page.captureScreenshot', { format: 'png' }); if (reply.result?.data) fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(reply.result.data, 'base64')); };
 await sleep(6000);
 await run(`(document.querySelector('.splash')?.remove(), document.documentElement.classList.remove('is-splash'), 'ok')`);
 console.log('app version:', await run(`(async () => (await window.openghost?.about?.())?.version || document.title)().catch(() => 'unknown')`));
 await run(`(settings.setMode('full'), 'ok')`);

 // 1. The address goes into the settings, as typed by a user.
 await run(`(settings.open(), settings.page('providers'), 'ok')`);
 await sleep(800);
 await run(`(() => { const input = settings.inputs.local; input.focus(); input.value = ${JSON.stringify(ADDRESS)}; input.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
 const connected = await until(`settings.accepted.has('local') && settings.catalog.local.length > 0`, 30000);
 const state = JSON.parse(await run(`JSON.stringify({ models: settings.catalog.local.map(m => ({ id: m.id, context: m.context, limit: m.limit, vision: m.vision, tools: m.tools })), status: settings.statuses.local.textContent, badge: document.querySelector('.provider[data-provider="local"] .provider-state').textContent, count: document.querySelector('.provider[data-provider="local"] .provider-models').textContent })`));
 console.log('settings:', JSON.stringify(state));
 check('the app connects to the server and lists its models', connected && state.badge === 'Connected' && state.models.length > 0, state.status);
 await run(`(document.querySelector('.provider[data-provider="local"]').scrollIntoView({ block: 'center' }), 'ok')`);
 await sleep(500);
 await shot('1-settings');
 const wanted = process.env.MODEL ? state.models.find(m => m.id === `local:${process.env.MODEL}`) : state.models[0];
 check('the model to talk to is in the list', !!wanted, JSON.stringify(state.models.map(m => m.id)));
 if (!wanted) { console.log(`FAILED ${failures}`); process.exit(1); }
 if (process.env.WINDOW) check(`its window is listed as ${process.env.WINDOW}`, wanted.context === Number(process.env.WINDOW), String(wanted.context));
 check('the model to talk to is not named as having too small a window', !state.status.includes(wanted.id.slice(6)), state.status);
 await run(`(settings.dialog.close(), 'ok')`);
 await sleep(600);

 // 2. A message, with the agent's whole instructions and tools behind it. The command is one only a tool can answer.
 await run(`(settings.setModel(${JSON.stringify(wanted.id)}), chat.setModel?.(${JSON.stringify(wanted.id)}), 'ok')`);
 const send1 = text => run(`(() => { const input = document.querySelector('.main > .composer .composer-input'); input.focus(); input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return 'ok'; })()`);
 const t0 = Date.now();
 await send1('Run the command  echo marmalade-42  in the shell and tell me exactly what it printed.');
 await until(`chat.busy`, 15000);
 console.log('model in use:', await run(`JSON.stringify((({ provider, model, window, tools, ready }) => ({ provider, model, window, tools, ready }))(settings.configFor(chat.active?.model || ${JSON.stringify(wanted.id)})))`));
 const done = await until(`!chat.busy`, WAIT, 5000);
 await sleep(1500);
 const seconds = Math.round((Date.now() - t0) / 1000);
 const talk = JSON.parse(await run(`JSON.stringify({ said: chat.active.messages.filter(m => m.role === 'assistant').map(m => m.content), calls: chat.active.messages.flatMap(m => m.steps || []).flatMap(s => s.tool_calls || []).map(c => c.function.name + ' ' + c.function.arguments), results: chat.active.messages.flatMap(m => m.steps || []).filter(s => s.role === 'tool').map(s => String(s.content).slice(0, 200)), shown: document.querySelector('.thread-view').innerText.replace(/\\s+/g, ' ').slice(-500) })`));
 console.log(`after ${seconds} s:`, JSON.stringify(talk));
 await shot('2-chat');
 check('the answer came, with no error in the chat', done && talk.said.join('').trim().length > 0 && !/not answering|returned error|Retry$/.test(talk.shown), talk.shown);
 // Whether a small model follows the agent's long instructions is the model's doing, not the app's: noted, not failed.
 note('the model called a tool of the agent\'s', talk.calls.length > 0, talk.calls.join(' | '));
 note('and the tool really ran and printed it', talk.results.some(text => /marmalade-42/.test(text)), talk.results.join(' | ').slice(0, 200));

 console.log(failures ? `FAILED ${failures}` : 'ALL PASSED');
 process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
