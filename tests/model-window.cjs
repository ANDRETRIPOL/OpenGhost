'use strict';
// The least window a model is offered with (providers.js, NEED): the agent's real instructions and tools and a full
// private record fit in the base it is built from, and a model with a smaller window is not in the picker
// (settings.js, collect). Real files; storage and DOM are stand-ins, no network or model is touched.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
let count = 0;
const check = (name, ok, detail = '') => { assert.ok(ok, `${name}${detail ? ` — ${detail}` : ''}`); count++; console.log(`ok  ${name}`); };

const c = { window: { openghost: { calendar: {} } }, console, navigator: { platform: 'Win32', userAgent: '' }, I18n: { t: key => key, has: () => false }, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} } };
c.window.window = c.window;
vm.createContext(c);
for (const file of ['agent-prompt.js', 'agent-tools.js', 'providers.js', 'settings.js']) vm.runInContext(read(file), c);
const { AgentPrompt, AgentTools, Providers, Settings } = c.window;
c.Providers = Providers;

// As the app counts: characters by 3.2 (chat.js, CONTEXT.chars); a full record of 40,000 characters as economy.js
// counts it, never short (3.3 characters to a token).
// The formatting guide goes with the instructions (chat.js, system); the place, the day and the mode take about 1,000.
const chat = read('chat.js'), from = chat.indexOf('const FORMAT_GUIDE = [') + 'const FORMAT_GUIDE = '.length;
const guide = vm.runInNewContext(chat.slice(from, chat.indexOf('].join', from) + 1)).join('\n');
const prompt = `${AgentPrompt.build({ env: { shell: 'PowerShell' } })}\n\n# Formatting\n${guide}`, tools = JSON.stringify(AgentTools.schemas);
const instructions = Math.ceil((prompt.length + tools.length) / 3.2), record = Math.ceil(40000 / 3.3);
check('The agent\'s instructions, tools and a full record fit the base the least window is built from', guide.length > 10000 && instructions + record + 1000 <= Providers.AGENT, `${instructions} + ${record} of ${Providers.AGENT}`);
check('The least window leaves the work its room above the base, the chat summarized at 90%', Providers.NEED * 0.9 - Providers.AGENT >= 48000, String(Providers.NEED));
check('...so 128K models are offered and 64K ones are not', Providers.NEED <= 128000 && Providers.NEED > 65536);

const s = Object.create(Settings.prototype);
Object.assign(s, {
 catalog: {
  deepseek: [{ id: 'deepseek:big', provider: 'deepseek', context: 128000 }],
  openrouter: [{ id: 'or:small', provider: 'openrouter', context: 32768 }, { id: 'or:mid', provider: 'openrouter', context: 65536 }, { id: 'or:large', provider: 'openrouter', context: 1000000 }, { id: 'or:untold', provider: 'openrouter', context: 0 }],
  local: [{ id: 'local:qwen', provider: 'local', name: 'qwen', context: 32768 }, { id: 'local:wide', provider: 'local', name: 'wide', context: 131072 }],
 },
 connected: () => true,
 paint() {},
});
s.collect();
const ids = s.models.map(model => model.id);
check('A model with too small a window is not in the picker', !ids.includes('or:small') && !ids.includes('or:mid') && !ids.includes('local:qwen'), ids.join(' '));
check('...one with enough, and one whose window nobody told, are', ['deepseek:big', 'or:large', 'or:untold', 'local:wide'].every(id => ids.includes(id)), ids.join(' '));
check('A chat on a model no longer offered moves to one that is', s.find('local:qwen') === null && s.resolve('local:qwen') !== 'local:qwen');
check('Settings name the server\'s models left out', s.cramped('local') === 'settings.window.small');

// A window written by hand smaller than the agent needs is not taken.
{
 const kept = { 'local.context': '32768', 'custom.context': '200000' };
 c.localStorage.getItem = key => kept[key] ?? null;
 const hand = s.readHand();
 check('A window written by hand smaller than the agent needs is not taken; a large one is', hand.local.context === 0 && hand.custom.context === 200000);
}

// Ollama (desktop/local.js, run in Node as the main process runs it) against a stand-in server shaped as Ollama's
// docs/api.md shows /api/tags, /api/ps and /api/show: a model's pictures and window are as Ollama tells them, even when
// it is slow to tell, and the window asked for is what the agent needs.
(async () => {
 const http = require('node:http'), Local = require(path.join(__dirname, '..', 'desktop', 'local.js'));
 check('Ollama is asked for at least the window the agent needs', Local.AUTO >= Providers.NEED);
 const server = http.createServer((req, res) => {
  const send = obj => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  req.resume();
  req.on('end', () => {
   if (req.url === '/api/tags') return send({ models: [{ name: 'gemma3:4b', model: 'gemma3:4b' }, { name: 'gemma3:1b', model: 'gemma3:1b' }] });
   if (req.url === '/api/ps') return send({ models: [] });
   if (req.url === '/api/show') return setTimeout(() => send({ model_info: { 'general.architecture': 'gemma3', 'gemma3.context_length': 131072 }, capabilities: ['completion', 'vision'] }), 3000);
   res.writeHead(404); res.end('{}');
  });
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 try {
  const list = await Local.models({ provider: 'local', key: `http://127.0.0.1:${server.address().port}` });
  check('A model Ollama says sees pictures is shown seeing them, though Ollama took 3 seconds to say', list.length === 2 && list.every(model => model.vision === true), JSON.stringify(list.map(m => [m.id, m.vision])));
  check('...and works in the window the agent needs, within what it was trained for', list.every(model => model.context === 131072 && model.limit === 131072));
 } finally { server.close(); }
 console.log(`\n${count} checks passed`);
})().catch(error => { console.error(error); process.exit(1); });
