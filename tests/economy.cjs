'use strict';
// Economy (economy.js) with the actual chat.js: where a chat is summarized at each level, what stays word for word after
// a summary made while the agent works, and that a chat without economy is summarized exactly where it was before.
// Providers, DOM and storage are stand-ins; prices.js is checked against a list shaped as OpenRouter's.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
let count = 0;
const check = (name, ok, detail = '') => { assert.ok(ok, `${name}${detail ? ` — ${detail}` : ''}`); count++; console.log(`ok  ${name}`); };

// ---- economy.js on its own
const stored = new Map();
const store = { read: async key => stored.get(key) ?? null, write: async (key, value) => { stored.set(key, value); }, onChange: () => {} };
let stepsAsked = 0;
const bridge = { steps: async () => { stepsAsked++; return { at: Date.now(), models: { 'anthropic/claude-haiku-5-5': { steps: [100000] }, 'openai/gpt-6-1-sol': { steps: [272000] }, 'anthropic/claude-sonnet-4-5': { steps: [200000] } } }; } };
const c = { window: { ChatStore: store, openghost: { llm: bridge } }, console, AbortController, DOMException, setTimeout, clearTimeout, I18n: { t: k => k }, Skills: { blocks: () => '', mentions: () => [] }, Usage: { parts: () => null }, Providers: {} };
vm.createContext(c);
vm.runInContext(read('economy.js'), c);
const Economy = c.window.Economy;

const haiku = { id: 'anthropic:claude-haiku-5-5', provider: 'anthropic', api: 'claude-haiku-5-5', context: 1000000 };
const opus = { id: 'anthropic:claude-opus-5-5', provider: 'anthropic', api: 'claude-opus-5-5', context: 1000000 };
const sol = { id: 'openai:gpt-6.1-sol', provider: 'openai', api: 'gpt-6.1-sol', context: 1050000 };
const subscription = { id: 'chatgpt:gpt-6.1-sol', provider: 'chatgpt', api: 'gpt-6.1-sol', context: 1050000 };
const routed = { id: 'openrouter:google/gemini-3.1-pro-preview', provider: 'openrouter', api: 'google/gemini-3.1-pro-preview', context: 1048576, steps: [200000] };
const qwen = { id: 'openrouter:qwen/qwen3.7-flash', provider: 'openrouter', api: 'qwen/qwen3.7-flash', context: 1000000, steps: [32000, 256000] };

async function economy() {
 await Economy.ready;
 check('Economy is off until the user turns it on', Economy.value === 0);
 const off = Economy.limit(haiku, 0, 1000000);
 check('Off: a chat is summarized at 90% of its window, as before', off.limit === 900000 && !off.on && off.by === 'window');
 check('Off asks no one for prices', stepsAsked === 0);
 Economy.limit(haiku, 500000, 1000000);
 await new Promise(resolve => setTimeout(resolve, 0));
 check('Saving asks for the prices once', stepsAsked === 1);
 Economy.limit(haiku, 500000, 1000000);
 await new Promise(resolve => setTimeout(resolve, 0));
 check('...and not again', stepsAsked === 1);

 const haikuAny = Economy.limit(haiku, 500000, 1000000);
 check('Claude Haiku 5.5 with its own key stays under its 100K step whatever size is picked', haikuAny.by === 'step' && haikuAny.limit === 97000, JSON.stringify(haikuAny));
 const opus500 = Economy.limit(opus, 500000, 1000000), opus100 = Economy.limit(opus, 100000, 1000000);
 check('A model without a step is held to the size picked', opus500.limit === 500000 && opus500.by === 'value' && opus100.limit === 100000);
 const sol400 = Economy.limit(sol, 400000, 1050000);
 check('GPT with an OpenAI key stays under 272K even at 400K', sol400.by === 'step' && sol400.limit < 272000 && sol400.limit > 260000, JSON.stringify(sol400));
 const sub = Economy.limit(subscription, 400000, 1050000);
 check('The ChatGPT subscription has no step: 400K is 400K', sub.by === 'value' && sub.limit === 400000);
 const gemini = Economy.limit(routed, 500000, 1048576);
 check('An OpenRouter model takes the step from its own list (Gemini Pro, 200K)', gemini.by === 'step' && gemini.limit < 200000 && gemini.limit > 190000);
 const q = Economy.limit(qwen, 500000, 1000000);
 check('A step lower than 64K is not kept under: the next one is', q.limit < 256000 && q.limit > 240000, JSON.stringify(q));
 const small = Economy.limit({ ...opus, context: 128000 }, 200000, 128000);
 check('A window smaller than the size picked stays as it was', !small.on && small.limit === Math.floor(128000 * 0.9));

 // What a size saves, in the model's own prices.
 const priced = { ...opus, price: { in: 4e-6, hit: 2e-7, write: 5e-6, out: 2e-5, over: [] } };
 const s500 = Economy.saving(priced, 500000, 1000000), s200 = Economy.saving(priced, 200000, 1000000), s100 = Economy.saving(priced, 100000, 1000000);
 check('Opus saves more the smaller the size, up to about twice', s500.times > 1.1 && s200.times > s500.times && s100.times > 1.6 && s100.times < 3, [s500.times, s200.times, s100.times].map(x => x.toFixed(2)).join(' '));
 const pricedHaiku = { ...haiku, steps: [100000], price: { in: 1e-7, hit: 1e-8, write: 1.25e-7, out: 5e-7, over: [{ at: 100000, in: 5e-7, hit: 5e-8, write: 6.25e-7, out: 2.5e-6 }] } };
 const sh = Economy.saving(pricedHaiku, 500000, 1000000);
 check('Haiku 5.5 kept under its step saves many times over', sh.times > 8, sh.times.toFixed(2));
 const sSub = Economy.saving(subscription, 200000, 1050000);
 check('On the subscription the saving is in its limits', sSub.kind === 'limit' && sSub.times > 1.3);
 check('A model on the user\'s computer gets no figure', Economy.saving({ ...opus, provider: 'local' }, 200000, 1000000) === null);
 check('A size that changes nothing gets no figure', Economy.saving(priced, 0, 1000000) === null);

 // What every request carries is never squeezed: the size leaves the work 48K above it.
 const based = Economy.limit(opus, 100000, 1000000, 70000);
 check('A size too small for what every request carries is raised to leave the work 48K', based.limit === 118000 && based.by === 'base', JSON.stringify(based));
 check('A size with room enough stays as picked', Economy.limit(opus, 100000, 1000000, 33000).limit === 100000);
 const haikuBase = Economy.limit(haiku, 100000, 1000000, 70000);
 check('Haiku with a heavy chat still stays under its step while 24K is left above what every request carries', haikuBase.by === 'step' && haikuBase.limit === 97000);
 const haikuHeavy = Economy.limit(haiku, 100000, 1000000, 80000);
 check('...and gives the step up when less would be left: the work matters more than the step', haikuHeavy.by === 'base' && haikuHeavy.limit === 128000, JSON.stringify(haikuHeavy));
 const light = Economy.saving(priced, 100000, 1000000, 0).times, heavy = Economy.saving(priced, 100000, 1000000, 60000).times;
 check('The saving is worked out with what every request of the chat carries', heavy !== light && heavy > 1, `${light.toFixed(2)} / ${heavy.toFixed(2)}`);

 Economy.set(151234);
 check('The size picked is the one new chats get', Economy.value === 151234);
 Economy.set(0);
 Economy.flush();
 check('It is kept', stored.get('economy')?.value === 0 && stored.get('economy')?.version === 2);
}

// ---- chat.js with economy
vm.runInContext(read('agent-plan.js'), c);
c.AgentPlan = c.window.AgentPlan;
vm.runInContext(read('chat.js'), c);
const Chat = c.window.Chat;

const big = n => 'x'.repeat(Math.round(n * 3.2));
function fixture({ level = 0, tokens = 0, model = opus, window: size = 1000000, messages = null } = {}) {
 const conv = { id: 'f', record: { id: 'f', model: model.id, effort: 'low', named: true, economy: level }, messages: messages || [], tokens, real: tokens, list: { append() {} } };
 const chat = Object.create(Chat.prototype), calls = [];
 const view = () => ({ el: { hidden: true, before() {}, classList: { remove() {} }, querySelector() { return null; } }, stream: { finish: async () => {} }, status: { remove() {} } });
 Object.assign(chat, {
  active: conv, nodes: new Map(), modelOf: one => one.record.model,
  settings: { find: id => (id === model.id ? model : null), windowOf: () => size, configFor: (id, effort) => ({ id, provider: model.provider, effort: effort || 'low', ready: true, output: 64000 }) },
  library: { chat: () => conv.record, update: (_id, change) => Object.assign(conv.record, change) },
  compactNotice: () => ({}), finishNotice() {}, closePart() {}, openPart(_conv, turn) { turn.part = { entry: { role: 'assistant', content: '', steps: [] }, view: view() }; },
  viewOf: () => null, system: async () => ['SYSTEM'], save() {}, onChange() {}, agent: () => false,
 });
 c.Providers.complete = async (config, opts) => { calls.push(opts); return 'SUMMARY'; };
 const turn = { config: chat.config(conv), controller: new AbortController(), queue: [], part: { entry: null, view: view() } };
 return { chat, conv, calls, turn };
}

async function chats() {
 // Off: where it was before.
 let f = fixture({ tokens: 899000 });
 await f.chat.compactIfNeeded(f.conv, f.turn);
 check('Off: 899K of a 1M window is not summarized yet', f.calls.length === 0);
 f = fixture({ tokens: 900000, messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yes', steps: [{ role: 'assistant', content: 'yes' }] }] });
 await f.chat.compactIfNeeded(f.conv, f.turn);
 check('Off: 900K is', f.calls.length === 1);
 check('Off: the summary may still be as long as before', f.calls[0].maxTokens === 64000);

 // Max on Opus: 100K.
 const talk = () => [{ role: 'user', content: 'build the site' }, { role: 'assistant', content: 'done', steps: [{ role: 'assistant', content: 'done' }] }];
 f = fixture({ level: 100000, tokens: 99000, messages: talk() });
 await f.chat.compactIfNeeded(f.conv, f.turn);
 check('Max: 99K of Opus is not summarized', f.calls.length === 0);
 f = fixture({ level: 100000, tokens: 100000, messages: talk() });
 await f.chat.compactIfNeeded(f.conv, f.turn);
 check('Max: 100K is', f.calls.length === 1);
 check('Max: the summary is measured by the limit, not the 1M window', f.calls[0].maxTokens <= Math.ceil(100000 / 0.9 * 0.15) && f.calls[0].maxTokens > 10000, String(f.calls[0].maxTokens));

 // What the app counts itself is corrected by how its counts compared with the provider's.
 f = fixture({ level: 100000, tokens: 90000, messages: talk() });
 f.conv.real = 80000;
 f.conv.ratio = 1;
 await f.chat.compactIfNeeded(f.conv, f.turn);
 check('A count the app made itself, close to the provider\'s, leaves the chat as it is', f.calls.length === 0);
 f = fixture({ level: 100000, tokens: 90000, messages: talk() });
 f.conv.real = 80000;
 f.conv.ratio = 2;
 await f.chat.compactIfNeeded(f.conv, f.turn);
 check('...but when its counts ran short of the provider\'s, it summarizes before the request would pass the limit', f.calls.length === 1);
 f = fixture({ tokens: 899000 });
 f.conv.real = 0;
 f.conv.ratio = 3;
 await f.chat.compactIfNeeded(f.conv, f.turn);
 check('Off never corrects its count (nothing changes without economy)', f.calls.length === 0);

 // The step of Haiku with a key.
 f = fixture({ level: 500000, model: haiku, tokens: 96000, messages: talk() });
 await f.chat.compactIfNeeded(f.conv, f.turn);
 check('Haiku 5.5 with a key: 96K stays', f.calls.length === 0);
 f = fixture({ level: 500000, model: haiku, tokens: 97500, messages: talk() });
 await f.chat.compactIfNeeded(f.conv, f.turn);
 check('Haiku 5.5 with a key: 97.5K is summarized before the next request passes 100K', f.calls.length === 1);
 check('The request that writes the summary stays under the step too', f.calls[0].messages[1].content.length <= 97000 * 0.8 * 3.2 + 100);

 // Right after a summary, with little new, no summary again at every step.
 f = fixture({ level: 100000, tokens: 120000, messages: [{ role: 'compact', summary: 'S' }, { role: 'user', content: 'go' }] });
 await f.chat.compactIfNeeded(f.conv, f.turn);
 check('Right after a summary a full window with little new is not summarized again', f.calls.length === 0);

 // Summary in the middle of the agent's work: the task's latest steps stay word for word.
 const steps = [];
 for (let i = 0; i < 6; i++) {
  steps.push({ role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'read_file', arguments: `{"path":"f${i}.js"}` } }] });
  steps.push({ role: 'tool', tool_call_id: `c${i}`, content: `FILE_${i} ${big(6000)}` });
 }
 const work = { role: 'assistant', content: '', model: opus.id, steps };
 f = fixture({ level: 100000, tokens: 100000, messages: [{ role: 'user', content: 'first question' }, { role: 'assistant', content: 'first answer', steps: [{ role: 'assistant', content: 'first answer' }] }, { role: 'user', content: 'refactor the app' }, work] });
 f.turn.part.entry = work;
 await f.chat.compact(f.conv, f.turn);
 const summary = f.conv.messages.find(entry => entry.role === 'compact');
 check('A summary made while the agent works in economy keeps its latest steps', summary.tail > 0, JSON.stringify({ tail: summary.tail }));
 const sent = f.chat.history(f.conv);
 const firstKept = sent.findIndex(message => message.role === 'assistant' && message.tool_calls);
 check('The kept steps start at a call of the model\'s, so every result has its call', firstKept > 0 && sent[firstKept].tool_calls.length === 1);
 check('The very last result is there word for word', sent.some(message => message.role === 'tool' && message.content.startsWith('FILE_5')));
 check('Older results that do not fit the room are left to the summary', !sent.some(message => message.role === 'tool' && message.content.startsWith('FILE_0')));
 const keptSize = Math.ceil(sent.slice(firstKept).filter(message => message.role === 'tool' || message.tool_calls).map(message => (message.content || '') + JSON.stringify(message.tool_calls || '')).join('').length / 3.2);
 check('The kept steps take no more than a fifth of the limit', keptSize <= 100000 * 0.2 + 500, String(keptSize));
 check('The user\'s message that started the task is kept as text', sent.some(message => message.role === 'user' && message.content === 'refactor the app'));
 check('The working reply is not repeated as text beside its steps', sent.filter(message => message.role === 'assistant' && !message.tool_calls).every(message => message.content === 'first answer'));
 // A kept step goes without its signed thinking: a thinking block is bound to everything before it, and before the
 // kept steps now stands the summary (Claude Haiku 5.5 turned the request down: "bound to a different conversation").
 {
  const signed = steps.map(step => step.role === 'assistant' ? { ...step, reasoning_content: 'thought', native: { provider: 'anthropic', content: [{ type: 'thinking', thinking: 'thought', signature: 'sig' }, ...step.tool_calls.map(call => ({ type: 'tool_use', id: call.id, name: call.function.name, input: {} }))] } } : step);
  const g = fixture({ level: 100000, tokens: 100000, messages: [{ role: 'user', content: 'refactor the app' }, { ...work, steps: signed }] });
  g.turn.part.entry = g.conv.messages[1];
  await g.chat.compact(g.conv, g.turn);
  const out = g.chat.history(g.conv), kept = out.filter(message => message.role === 'assistant' && message.tool_calls);
  check('The steps kept by a summary go without their signed thinking, with their calls', kept.length > 0 && kept.every(message => !message.native && !message.reasoning_content && message.tool_calls.length === 1), JSON.stringify(kept.map(message => Object.keys(message))));
  const later = { role: 'assistant', content: 'done', native: { provider: 'anthropic', content: [{ type: 'thinking', thinking: 't2', signature: 's2' }, { type: 'text', text: 'done' }] } };
  g.conv.messages.push({ role: 'assistant', content: 'done', model: opus.id, steps: [later] });
  check('A step made after the summary keeps its thinking', g.chat.history(g.conv).at(-1).native?.content[0].type === 'thinking');
 }
 check('A note says the steps are the task\'s latest, word for word, and the agent goes on', sent.some(message => message.role === 'user' && /latest steps of the task under way/.test(message.content)) && sent.at(-1).content === sent.at(-1).content);

 // Off keeps the agreed summary: last turns as text, no steps.
 f = fixture({ tokens: 900000, messages: [{ role: 'user', content: 'refactor the app' }, { ...work, steps: steps.slice() }] });
 f.turn.part.entry = f.conv.messages[1];
 await f.chat.compact(f.conv, f.turn);
 const offSummary = f.conv.messages.find(entry => entry.role === 'compact');
 check('Off: the summary keeps no steps, as agreed before', !offSummary.tail && !f.chat.history(f.conv).some(message => message.role === 'tool'));

 // A step too large even for the room of the tail is lost only past 40% of the limit.
 const huge = { role: 'assistant', content: '', model: opus.id, steps: [{ role: 'assistant', content: '', tool_calls: [{ id: 'h', type: 'function', function: { name: 'read_file', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'h', content: big(30000) }] };
 f = fixture({ level: 100000, tokens: 100000, messages: [{ role: 'user', content: 'read it' }, huge] });
 f.turn.part.entry = huge;
 await f.chat.compact(f.conv, f.turn);
 check('A file of 30K just read stays after the summary (under 40% of the limit)', f.conv.messages.find(entry => entry.role === 'compact').tail === 2);
 const giant = { ...huge, steps: [huge.steps[0], { ...huge.steps[1], content: big(60000) }] };
 f = fixture({ level: 100000, tokens: 100000, messages: [{ role: 'user', content: 'read it' }, giant] });
 f.turn.part.entry = giant;
 await f.chat.compact(f.conv, f.turn);
 check('One of 60K does not: it would leave no room, and the agent can read it again in parts', !f.conv.messages.find(entry => entry.role === 'compact').tail);

 // Everything since the last summary goes into the next one whole: the earlier summary, the user's words, the agent's
 // replies, the tools' calls and results, however long.
 {
  const said = `REPLY_START ${'r'.repeat(30000)} REPLY_END`, read = `RESULT_START ${'x'.repeat(30000)} RESULT_END`, wrote = JSON.stringify({ path: 'a.txt', content: `WRITE_START ${'w'.repeat(30000)} WRITE_END` });
  const g = fixture({ level: 0, tokens: 100000, messages: [
   { role: 'compact', summary: 'EARLIER_SUMMARY' },
   { role: 'user', content: 'read it' },
   { role: 'assistant', content: said, model: opus.id, steps: [
    { role: 'assistant', content: '', tool_calls: [{ id: 'r', type: 'function', function: { name: 'read_file', arguments: '{}' } }, { id: 'w', type: 'function', function: { name: 'write_file', arguments: wrote } }] },
    { role: 'tool', tool_call_id: 'r', content: read }, { role: 'tool', tool_call_id: 'w', content: 'ok' },
    { role: 'assistant', content: said },
   ] },
  ] });
  g.turn.part.entry = g.conv.messages[2];
  await g.chat.compact(g.conv, g.turn);
  const sent = g.calls.map(call => call.messages[1].content).join('\n');
  check('The next summary starts from the last one', sent.includes('EARLIER_SUMMARY'));
  check('...and takes the agent\'s replies, the tools\' results and calls whole', [said, read, wrote].every(text => sent.includes(text)));
  check('...with nothing marked as left out', !/more characters|left out/.test(sent));
 }

 // A task whose working set does not fit the limit: the agent reads the files again after every summary, and the chat
 // went over again at every step (113 requests of Claude Haiku 5.5, no answer). Three summaries a turn at most, then the
 // agent is told once and the turn goes on.
 {
  const s = fixture({ level: 100000, tokens: 150000, messages: [{ role: 'user', content: 'read all of it' }] });
  let made = 0;
  for (let step = 0; step < 8; step++) {
   const work = { role: 'assistant', content: '', model: opus.id, steps: [{ role: 'assistant', content: '', tool_calls: [{ id: `r${step}`, type: 'function', function: { name: 'read_file', arguments: '{}' } }] }, { role: 'tool', tool_call_id: `r${step}`, content: big(60000) }] };
   s.conv.messages.push(work);
   s.turn.part.entry = work;
   s.conv.tokens = 150000;
   s.conv.real = 150000;
   const before = s.calls.length;
   await s.chat.compactIfNeeded(s.conv, s.turn);
   if (s.calls.length > before) made++;
  }
  check('A turn over the limit at every step makes three summaries at most', made <= 3 && made >= 1, String(made));
  const told = s.conv.messages.flatMap(entry => entry.steps || []).filter(step => step.role === 'user' && /does not fit the economy limit/.test(step.content));
  check('...and then the agent is told once that the task does not fit', told.length === 1, String(told.length));
  const next = fixture({ level: 100000, tokens: 150000, messages: [{ role: 'user', content: 'again' }, { role: 'assistant', content: 'x', steps: [{ role: 'assistant', content: 'x' }] }] });
  await next.chat.compactIfNeeded(next.conv, next.turn);
  check('A new turn may summarize again', next.calls.length >= 1);
 }

 // A summary that kept the task's latest steps, with the chat still over its limit and little new: made again once
 // without them, and not again.
 {
  const tailWork = { role: 'assistant', content: '', model: opus.id, steps: [{ role: 'assistant', content: '', tool_calls: [{ id: 't', type: 'function', function: { name: 'read_file', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 't', content: big(15000) }] };
  const after = { role: 'assistant', content: '', model: opus.id, steps: [{ role: 'assistant', content: 'next' }] };
  const h = fixture({ level: 100000, tokens: 101000, messages: [{ role: 'user', content: 'go' }, tailWork, { role: 'compact', summary: 'S', tail: 2, turns: 1, room: 11111, model: opus.id }, after] });
  h.turn.part.entry = after;
  await h.chat.compactIfNeeded(h.conv, h.turn);
  const last = h.conv.messages.filter(m => m.role === 'compact').at(-1);
  check('Over the limit with little new after a summary that kept steps: summarized again, without them', h.calls.length === 1 && !last.tail);
  h.conv.tokens = 101000;
  await h.chat.compactIfNeeded(h.conv, h.turn);
  check('...and not again after that', h.calls.length === 1);
 }

 // A long text pasted into a new message counts before the first request.
 {
  const p = fixture({ level: 100000, tokens: 60000, messages: talk() });
  p.conv.real = 60000;
  p.chat.agent = () => false;
  p.chat.cwd = () => '';
  p.chat.openPart = () => {};
  let prepared = null;
  p.chat.drive = async (_conv, _turn, prepare) => { prepared = prepare; };
  p.chat.run(p.conv, { text: big(50000), attachments: [] }, p.turn.config, null);
  await prepared();
  check('A long message pasted in counts before the first request', p.conv.tokens >= 60000 + 49000, String(p.conv.tokens));
  await p.chat.compactIfNeeded(p.conv, p.turn);
  check('...so the chat is summarized before it is sent past the limit', p.calls.length === 1);
 }

 // The user's own words go into the summary whole.
 {
  const long = 'START ' + 'w'.repeat(60000) + ' FINISH';
  const u = fixture({ tokens: 900000, messages: [{ role: 'user', content: long, text: long }, { role: 'assistant', content: 'ok', steps: [{ role: 'assistant', content: 'ok' }] }] });
  await u.chat.compact(u.conv, u.turn);
  check('A long message of the user goes into the summary whole', u.calls[0].messages[1].content.includes('FINISH') && u.calls[0].messages[1].content.includes(long));
 }

 // A conversation longer than one request can carry is summarized part by part, nothing left out.
 {
  const history = [];
  for (let i = 0; i < 12; i++) history.push({ role: 'user', content: `MARK_${i} ${'q'.repeat(30000)}`, text: '' }, { role: 'assistant', content: `answer ${i}`, steps: [{ role: 'assistant', content: `answer ${i}` }] });
  const w = fixture({ level: 100000, tokens: 100000, messages: history });
  await w.chat.compact(w.conv, w.turn);
  const sent = w.calls.map(call => call.messages[1].content);
  check('A conversation too long for one request is summarized in several', w.calls.length > 1, String(w.calls.length));
  check('...every part fits the request', sent.every(text => text.length <= 100000 * 0.8 * 3.2));
  check('...nothing is left out: every message is in some part', Array.from({ length: 12 }, (_, i) => `MARK_${i}`).every(mark => sent.some(text => text.includes(mark))) && !sent.some(text => /left out/.test(text)));
  check('...and every part after the first carries the summary so far', sent.slice(1).every(text => text.startsWith('[Summary of what came before]')));
 }

 // A summary that drops most of the exact data the one before it carried is asked once more, with what it dropped.
 {
  const prev = Array.from({ length: 40 }, (_, i) => `meadowLedger${i}A owner BG-${1000 + i}`).join('\n');
  const history = [{ role: 'compact', summary: prev }, { role: 'user', content: 'go on', text: 'go on' }, { role: 'assistant', content: 'ok', steps: [{ role: 'assistant', content: 'ok' }] }];
  const w = fixture({ tokens: 900000, messages: history.map(m => ({ ...m })) });
  let n = 0;
  c.Providers.complete = async (config, opts) => { w.calls.push(opts); n++; return n === 1 ? 'A short summary: meadowLedger1A, BG-1001.' : `${prev}\nand the rest`; };
  await w.chat.compact(w.conv, w.turn);
  const kept = w.conv.messages.filter(m => m.role === 'compact').at(-1);
  check('A summary that dropped the data of the one before it is written again once', w.calls.length === 2, String(w.calls.length));
  check('...told which items it left out', /Items of the summary before it that yours left out/.test(w.calls[1].messages[1].content) && w.calls[1].messages[1].content.includes('BG-1039') && w.calls[1].messages[1].content.includes('meadowLedger39A'));
  check('...and the fuller one is kept', kept.summary.includes('meadowLedger39A') && kept.summary.includes('BG-1039'));
  const v = fixture({ tokens: 900000, messages: history.map(m => ({ ...m })) });
  c.Providers.complete = async (config, opts) => { v.calls.push(opts); return `${prev}\nnothing lost`; };
  await v.chat.compact(v.conv, v.turn);
  check('A summary that keeps the data is written once', v.calls.length === 1, String(v.calls.length));
  const x = fixture({ tokens: 900000, messages: history.map(m => ({ ...m })) });
  n = 0;
  c.Providers.complete = async (config, opts) => { x.calls.push(opts); n++; return n === 1 ? 'Short: meadowLedger1A.' : 'Still short: meadowLedger2A.'; };
  await x.chat.compact(x.conv, x.turn);
  check('Asked again at most once, and a second try no fuller leaves the first', x.calls.length === 2 && x.conv.messages.filter(m => m.role === 'compact').at(-1).summary === 'Short: meadowLedger1A.');
 }

 // The chat's own size.
 f = fixture();
 check('A chat from before economy saves nothing', f.chat.economyOf(f.conv) === 0);
 f.chat.setEconomy(200000);
 check('A chat picks its size, kept with the chat', f.conv.record.economy === 200000 && f.chat.economyOf(f.conv) === 200000);
 check('...and new chats get it', Economy.value === 200000);
 const fresh = fixture();
 delete fresh.conv.record;
 fresh.conv.record = null;
 check('A chat not sent yet has the size new chats get', fresh.chat.economyOf(fresh.conv) === 200000);
 f.chat.setEconomy(0);
 check('...and back to none', f.conv.record.economy === 0 && Economy.value === 0);
 check('Something that is no size is refused', f.chat.setEconomy('cheap') === false);
}

// ---- Ghost Max
async function ghost() {
 check('Ghost Max fits a 1M window at both levels', Economy.ghostFits(1, 1000000, 21000) && Economy.ghostFits(2, 1000000, 21000));
 check('Both levels fit a 200K window (what every request carries grows to about 57K with the fullest record)', Economy.ghostFits(1, 200000, 21000) && Economy.ghostFits(2, 200000, 21000));
 check('A 128K window takes neither: the work would have no room left', !Economy.ghostFits(1, 128000, 21000) && !Economy.ghostFits(2, 128000, 21000));
 check('A heavy chat (files and instructions of 90K) on a 200K window takes neither', !Economy.ghostFits(1, 200000, 90000));
 check('The record grows to 80,000 and 120,000 characters', Economy.ghost(1).record === 80000 && Economy.ghost(2).record === 120000 && !Economy.ghost(0) && !Economy.ghost(3));
 check('A full record of a level costs every request so much more (about 12K and 24K tokens)', Math.abs(Economy.ghostExtra(1) - 12122) < 50 && Math.abs(Economy.ghostExtra(2) - 24243) < 50, `${Economy.ghostExtra(1)} ${Economy.ghostExtra(2)}`);

 const f = fixture({ messages: [] });
 f.chat.setEconomy(200000);
 f.chat.setGhost(2);
 check('Ghost Max takes the place of a size: the chat saves nothing meanwhile', f.conv.record.ghost === 2 && f.conv.record.economy === 0 && f.chat.ghostOf(f.conv) === 2);
 check('...and new chats get it', Economy.ghostLevel === 2 && Economy.value === 0);
 check('A Ghost Max+ chat\'s record holds 120,000 characters', f.chat.recordLimit(f.conv) === 120000);
 c.AgentTools = { schemas: [{ type: 'function', function: { name: 'record', description: 'This chat\'s private record. At most 40000 characters. Use it.' } }, { type: 'function', function: { name: 'read_file', description: 'Reads a file.' } }] };
 const tools = f.chat.toolSchemas(f.conv);
 check('The record tool tells the agent the chat\'s own size', /At most 120000 characters\./.test(tools[0].function.description) && !/40000/.test(tools[0].function.description));
 check('Nothing else in the tools changes', tools[1] === c.AgentTools.schemas[1] && tools[0].function.description.replace('120000', '40000') === c.AgentTools.schemas[0].function.description);
 f.chat.setEconomy(100000);
 check('A size takes the place of Ghost Max', f.conv.record.ghost === 0 && f.conv.record.economy === 100000 && f.chat.recordLimit(f.conv) === 40000);
 check('A chat without Ghost Max gets the tools as they are, the very same list', f.chat.toolSchemas(f.conv) === c.AgentTools.schemas);
 const prompt = read('agent-prompt.js'), toolsFile = read('agent-tools.js');
 check('The agent\'s instructions name the record\'s size in one place, as Ghost Max replaces it', prompt.split('Stay under 40000 characters.').length === 2);
 check('...and so does the record tool', toolsFile.split('At most 40000 characters.').length === 2);

 // A summary in Ghost Max: fuller, more kept, the latest steps word for word.
 const steps = [];
 for (let i = 0; i < 4; i++) {
  steps.push({ role: 'assistant', content: '', tool_calls: [{ id: `g${i}`, type: 'function', function: { name: 'read_file', arguments: '{}' } }] });
  steps.push({ role: 'tool', tool_call_id: `g${i}`, content: `PART_${i} ${big(4000)}` });
 }
 const turnsBefore = [];
 for (let i = 0; i < 6; i++) turnsBefore.push({ role: 'user', content: `question ${i}` }, { role: 'assistant', content: `answer ${i}`, steps: [{ role: 'assistant', content: `answer ${i}` }] });
 const work = { role: 'assistant', content: '', model: opus.id, steps };
 const g = fixture({ tokens: 900000, messages: [...turnsBefore, { role: 'user', content: 'now the big task' }, work] });
 g.conv.record.ghost = 2;
 g.turn.part.entry = work;
 await g.chat.compact(g.conv, g.turn);
 const entry = g.conv.messages.find(m => m.role === 'compact');
 check('Ghost Max asks for a fuller summary', /thorough summary, as long as everything below takes, about 6000 words/.test(g.calls[0].messages[0].content));
 check('A summary carries over in full the data a task under way still needs', /carry over in full every piece of data/.test(g.calls[0].messages[0].content));
 check('...with room to write it', g.calls[0].maxTokens >= Economy.summaryTokens(2));
 // A model whose own limit on an answer nobody told (the ChatGPT sign-in's): the summary's room is worked out from
 // the words asked for alone, and must still be a whole number, which OpenAI insists on.
 for (const level of [1, 2]) {
  const u = fixture({ tokens: 900000, messages: [...turnsBefore, { role: 'user', content: 'now the big task' }, work] });
  u.conv.record.ghost = level;
  u.turn.part.entry = work;
  u.turn.config = { ...u.turn.config, output: 0, window: 0 };
  await u.chat.compact(u.conv, u.turn);
  check(`Ghost Max${level === 2 ? '+' : ''}: the summary's room is a whole number of tokens`, u.calls.length && u.calls.every(call => Number.isInteger(call.maxTokens) && call.maxTokens >= Economy.summaryTokens(level)), u.calls.map(call => call.maxTokens).join(' '));
 }
 check('...keeps the task\'s latest steps word for word', entry.tail === 8, String(entry.tail));
 const sent = g.chat.history(g.conv);
 check('...and more of the chat as it was (six questions and answers back)', sent.some(m => m.role === 'user' && m.content === 'question 2') && sent.some(m => m.role === 'tool' && m.content.startsWith('PART_0')));
 const plain = fixture({ tokens: 900000, messages: [...turnsBefore, { role: 'user', content: 'now the big task' }, { ...work, steps: steps.slice() }] });
 plain.turn.part.entry = plain.conv.messages.at(-1);
 await plain.chat.compact(plain.conv, plain.turn);
 const plainSent = plain.chat.history(plain.conv);
 check('Without Ghost Max the summary is as it always was', !/thorough summary/.test(plain.calls[0].messages[0].content) && !plain.conv.messages.find(m => m.role === 'compact').tail && !plainSent.some(m => m.role === 'user' && m.content === 'question 2'));
}

// ---- prices.js
function prices() {
 const ctx = { module: { exports: {} }, console, AbortSignal, setTimeout, clearTimeout, Date, fetch: null, require: name => name === 'electron' ? { app: { getPath: () => 'C:\\nowhere' } } : name === './openrouter' ? (() => { const m = { exports: {} }; vm.runInContext(read('desktop/openrouter.js'), vm.createContext({ module: m, exports: m.exports, require: () => ({}), console, URL, setTimeout, clearTimeout, AbortController, TextDecoder })); return m.exports; })() : require(name) };
 ctx.exports = ctx.module.exports;
 vm.createContext(ctx);
 vm.runInContext(read('desktop/prices.js'), ctx);
 const P = ctx.module.exports;
 const list = [
  { id: 'anthropic/claude-haiku-5.5', pricing: { prompt: '0.0000001', overrides: [{ min_prompt_tokens: 100000, prompt: '0.0000005' }] } },
  { id: 'anthropic/claude-haiku-5.5:batch', pricing: { prompt: '0.00000005', overrides: [{ min_prompt_tokens: 100000, prompt: '0.00000025' }] } },
  { id: 'anthropic/claude-opus-5.5', pricing: { prompt: '0.000004' } },
  { id: 'minimax/minimax-m3.1-flash', pricing: { prompt: '0.00000015', overrides: [{ utc_start: 1500, utc_end: 100, prompt: '0.000000075' }] } },
  { id: '~openai/gpt-sol-latest', pricing: { prompt: '0.000002', overrides: [{ min_prompt_tokens: 272000, prompt: '0.000004' }] } },
  { id: 'qwen/qwen3.7-flash', pricing: { prompt: '0.00000003', overrides: [{ min_prompt_tokens: 32000, prompt: '0.0000001' }, { min_prompt_tokens: 256000, prompt: '0.0000002' }] } },
 ];
 const steps = P.parse(list);
 check('Prices: a step and the prices past it are read from OpenRouter\'s list', JSON.stringify(steps['anthropic/claude-haiku-5-5'].steps) === '[100000]' && steps['anthropic/claude-haiku-5-5'].price.in === 1e-7 && steps['anthropic/claude-haiku-5-5'].price.over[0].in === 5e-7);
 check('Prices: variants and moving names are left out; a time-of-day price is no step', Object.keys(steps).length === 4 && !steps['minimax/minimax-m3-1-flash'].steps.length && !steps['openai/gpt-sol-latest']);
 check('Prices: several steps, lowest first', JSON.stringify(steps['qwen/qwen3-7-flash'].steps) === '[32000,256000]');
 check('Prices: Anthropic\'s and OpenRouter\'s names come to one', P.norm('claude-haiku-5-5-20261001') === P.norm('anthropic/claude-haiku-5.5').split('/')[1]);
}

(async () => {
 await economy();
 await chats();
 await ghost();
 prices();
 console.log(`\n${count} checks passed`);
})().catch(error => { console.error(error); process.exit(1); });
