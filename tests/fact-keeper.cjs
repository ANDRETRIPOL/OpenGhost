'use strict';
// What of a finished reply the app keeps in the chat's record and the shared memory, whatever the agent kept itself
// (fact-keeper.js, chat.js keepFacts): the exchange the model is shown, when a look is worth asking for, the answer
// read back, and the whole look with stand-ins for the model, the library and the memory. Real source in VMs.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const results = [];
const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });

(async () => {
const keeperContext = { window: {} };
vm.createContext(keeperContext);
vm.runInContext(read('fact-keeper.js'), keeperContext);
const K = keeperContext.window.FactKeeper;

const user = text => ({ role: 'user', text, content: text });
const reply = (content, calls = [], turn = 't1') => ({
 role: 'assistant', content, turn,
 steps: calls.length ? [{ role: 'assistant', content: '', tool_calls: calls.map(([name, args], k) => ({ id: `c${k}`, function: { name, arguments: JSON.stringify(args) } })) }, ...calls.map(([, , result], k) => ({ role: 'tool', tool_call_id: `c${k}`, content: result }))] : [],
});

// The exchange as the model reads it.
const said = K.exchange([
 user('Find me a flat in Lisbon under 900 € a month, no ground floor.'),
 reply('Two fit: Graça, 850 €, 3rd floor; Alfama, 890 €, 2nd floor.', [['web_search', { query: 'Lisbon flats' }, '12 results'], ['record', { action: 'add', text: 'x' }, 'saved'], ['plan', { action: 'start' }, 'set']]),
]);
check('The exchange holds the user\'s words, the work done and the reply', said.split('\n').map(line => line.split(' ')[0]), ['User:', 'Tool', 'Assistant:']);
check('The agent\'s own record, memory and plan calls are not the work', /record|plan/.test(said.split('\n')[1]), false);
check('A tool call is told with the start of its result', said.split('\n')[1], 'Tool web_search {"query":"Lisbon flats"} → 12 results');
const long = K.exchange([user('a'.repeat(K.KEEP.exchange + 500))]);
check('A long exchange keeps its latest part', [long.startsWith('[…]\n'), long.length <= K.KEEP.exchange + 4], [true, true]);

// When a look is worth asking for.
check('"Ok" or "thanks" is not worth a look', [K.worth([user('ok')]), K.worth([user('thanks a lot')])], [false, false]);
check('Four words are, and so is work of the agent\'s', [K.worth([user('my budget is 450 €')]), K.worth([user('go'), reply('', [['read_file', { path: 'a' }, 'text']])])], [true, true]);
check('Its own record call alone is no work', K.worth([user('go'), reply('', [['record', { action: 'add', text: 'x' }, 'saved']])]), false);

// The request.
const asked = K.messages({ exchange: 'User: hi', record: '2026-10-22 10:00 — Budget 450 €', memory: '- [m1] Andrew, a designer', memoryOn: true });
check('The model is told the rules apart and given the stores and the exchange', [asked[0].role, asked[1].content.includes('Budget 450 €'), asked[1].content.includes('[m1] Andrew'), asked[1].content.endsWith('User: hi')], ['system', true, true, true]);
check('With the memory off it is told to leave the memory alone', K.messages({ exchange: 'x', memoryOn: false })[1].content.includes('leave "memory" empty'), true);

// The answer read back.
const answer = 'Sure:\n```json\n{"record":[{"add":"Budget: 450 € for the whole stay"},{"old":"850 €","new":"820 €"},{"add":""},{"x":1}],"memory":[{"save":"Lives in Porto."},{"id":"[m2]","text":"Prefers short answers."},{"id":"two","text":"bad"}]}\n```';
check('The answer is read from inside other words, and only well-formed facts are kept', K.verdict(answer), { record: [{ add: 'Budget: 450 € for the whole stay' }, { old: '850 €', new: '820 €' }], memory: [{ save: 'Lives in Porto.' }, { id: 'm2', text: 'Prefers short answers.' }] });
check('No JSON, or broken JSON, keeps nothing', [K.verdict('Nothing to keep.'), K.verdict('{"record":[')], [{ record: [], memory: [] }, { record: [], memory: [] }]);
const many = K.verdict(JSON.stringify({ record: Array.from({ length: 20 }, (_, k) => ({ add: `fact ${k}` })), memory: Array.from({ length: 20 }, (_, k) => ({ save: `m ${k}` })) }));
check('A look adds a few lines and records at most', [many.record.length, many.memory.length], [K.KEEP.lines, K.KEEP.saves]);

// The whole look, in chat.js.
const memoryItems = [];
const Memory = {
 on: true,
 get full() { return false; },
 lines: () => memoryItems.map(item => `- [${item.id}] ${item.text}`).join('\n'),
 add: (text, by) => { const item = { id: `m${memoryItems.length + 1}`, text, by }; memoryItems.push(item); return item; },
 find: id => memoryItems.find(item => item.id === id),
 update: (id, text, by) => Object.assign(memoryItems.find(item => item.id === id), { text, by }),
 remove() {},
};
const asks = [];
let nextAnswer = '';
const context = { window: {}, console, AbortController, setTimeout, clearTimeout, Promise, Memory, FactKeeper: K,
 Skills: { blocks: () => '' }, Usage: { parts: usage => usage }, I18n: { t: key => key },
 Providers: { complete: async (config, request) => { asks.push(request); request.onUsage?.({ prompt_tokens: 900, completion_tokens: 40 }); return nextAnswer; } },
 AgentTools: { shell: 'run_powershell', schemas: [] } };
vm.createContext(context);
vm.runInContext(read('agent-plan.js'), context);
context.AgentPlan = context.window.AgentPlan;
vm.runInContext(read('plan-proof.js'), context);
context.PlanProof = context.window.PlanProof;
vm.runInContext(read('chat.js'), context);

let saved = '', protectedChat = false, unlocked = false;
const chat = Object.create(context.window.Chat.prototype);
chat.library = {
 chat: id => id === 'c1' ? { id } : null,
 record: async () => saved,
 saveRecord: async (id, text) => { saved = text; return true; },
 isProtected: () => protectedChat,
 keys: { has: () => unlocked },
};
const posted = [];
chat.postPills = (conv, turn) => posted.push(...turn.pills.splice(0));
chat.save = () => {};
const conv = { id: 'c1', record: { id: 'c1' }, messages: [] };
const turnOf = id => ({ id, config: { ready: true }, pills: [], part: { view: { el: {} } } });

conv.messages.push(user('We fly on 12 March at 07:40 from Porto, flight TP1941. I am Andrew, a designer.'), reply('Noted, looking for flats.', [], 't1'));
nextAnswer = '{"record":[{"add":"Flight: 12 March, 07:40, from Porto, TP1941."}],"memory":[{"save":"Andrew is a designer."}]}';
await chat.keepFacts(conv, turnOf('t1'), null, 'stop');
check('After a reply the model is asked once, about that exchange', [asks.length, asks[0].messages[1].content.includes('flight TP1941')], [1, true]);
check('What it names goes into the record, stamped with this computer\'s time', /^\d{4}-\d\d-\d\d \d\d:\d\d — Flight: 12 March, 07:40, from Porto, TP1941\.$/.test(saved), true);
check('and into the memory, with the memory\'s mark for the chat', [memoryItems.map(item => item.text), posted.map(pill => pill.role)], [['Andrew is a designer.'], ['memory']]);
check('What the look cost is counted on the reply', !!conv.messages[1].usage, true);

conv.messages.push(user('Actually the budget is 450 € for the whole stay.'), reply('Got it, 450 € in all.', [], 't2'));
nextAnswer = '{"record":[{"add":"Budget: 450 € for the whole stay."}],"memory":[]}';
await chat.keepFacts(conv, turnOf('t2'), null, 'stop');
check('The next look starts after the last one', [asks.length, asks[1].messages[1].content.includes('flight TP1941'), asks[1].messages[1].content.includes('450 €')], [2, false, true]);
check('and sees the record as it stands, to add only what is new', asks[1].messages[1].content.includes('TP1941'), true);
check('The record grows by the new line', saved.split('\n').length, 2);

conv.messages.push(user('ok'), reply('👍', [], 't3'));
await chat.keepFacts(conv, turnOf('t3'), null, 'stop');
check('"Ok" asks nothing', asks.length, 2);

conv.messages.push(user('The hotel is Casa Amora, room 12, check-in from 15:00.'), reply('Saved the hotel.', [], 't4'));
await chat.keepFacts(conv, turnOf('t4'), new Error('lost'), null);
await chat.keepFacts(conv, turnOf('t4'), null, 'length');
check('A reply that failed, or ran out of room, is not looked at', asks.length, 2);
conv.turn = {};
nextAnswer = '{"record":[{"add":"Hotel: Casa Amora, room 12, check-in from 15:00."}],"memory":[]}';
await chat.keepFacts(conv, turnOf('t4'), null, 'stop');
check('With the next reply already under way nothing is written', [asks.length, saved.includes('Casa Amora')], [3, false]);
conv.turn = null;
conv.messages.push(user('And what about parking near it?'), reply('There is a garage on the next street.', [], 't5'));
await chat.keepFacts(conv, turnOf('t5'), null, 'stop');
check('and the look after it takes that exchange in too', [asks[3].messages[1].content.includes('Casa Amora'), saved.includes('Casa Amora')], [true, true]);

const before = memoryItems.length;
conv.messages.push(user('I moved from Figma to Sketch for all my mockups.'), reply('Noted.', [['memory', { action: 'update', id: 'm1', text: 'Andrew is a designer who works in Sketch.' }, 'Record m1 now says it.']], 't5b'));
nextAnswer = '{"record":[],"memory":[{"save":"Uses Sketch for all mockups."}]}';
await chat.keepFacts(conv, turnOf('t5b'), null, 'stop');
check('When the agent changed the memory itself, the look leaves the memory to it', [asks.at(-1).messages[1].content.includes('leave "memory" empty'), memoryItems.length], [true, before]);

protectedChat = true;
Memory.on = false;
conv.messages.push(user('My passport expires in May 2027, remember that.'), reply('Noted.', [], 't6'));
await chat.keepFacts(conv, turnOf('t6'), null, 'stop');
check('A locked chat with the memory off asks nothing', asks.length, 5);
unlocked = true;
nextAnswer = '{"record":[],"memory":[{"save":"Passport expires in May 2027."}]}';
await chat.keepFacts(conv, turnOf('t6'), null, 'stop');
check('Unlocked, its record may be kept, but never the memory', [asks.length, asks[5].messages[1].content.includes('leave "memory" empty'), memoryItems.length], [6, true, 1]);

const failed = results.filter(item => !item.pass);
for (const item of results) console.log(`${item.pass ? 'ok  ' : 'FAIL'} ${item.name}${item.pass ? '' : `\n     got      ${JSON.stringify(item.actual)}\n     expected ${JSON.stringify(item.expected)}`}`);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
