'use strict';
// Regression coverage using real source in VMs, with fixture storage, networking and timers.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const results = [];
const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });
function chatVM() {
 const context = { window: {}, console, AbortController, setTimeout, clearTimeout,
  Skills: { blocks: () => '' }, Usage: { parts: () => null }, Providers: {} };
 vm.createContext(context);
 // The app loads the plan's rules before the chat, as here.
 vm.runInContext(read('agent-plan.js'), context);
 context.AgentPlan = context.window.AgentPlan;
 vm.runInContext(read('chat.js').replace('Chat.splitQuotes = splitQuotes;', 'window.audit = { transcript, flat, keptSpan, compactRoom, TOOL_NOTES }; Chat.splitQuotes = splitQuotes;'), context);
 return context;
}
function providerVM(schedule, deepseek) {
 let listener, attempts = 0;
 const waits = [], usage = [];
 const bridge = { onEvent: fn => { listener = fn; }, abort: id => listener({ id, type: 'error', aborted: true }),
  start: (id, request) => { attempts++; queueMicrotask(() => schedule({ id, request, emit: event => listener({ id, ...event }), attempt: attempts })); } };
 const context = { window: { openghost: { llm: bridge } }, I18n: { t: key => key }, Usage: { record: (...a) => usage.push(a) },
  DeepSeek: deepseek || {}, DOMException, AbortController, CustomEvent: class {},
  setTimeout: (fn, ms) => { waits.push(ms); queueMicrotask(fn); return waits.length; }, clearTimeout() {} };
 vm.createContext(context); vm.runInContext(read('providers.js'), context);
 return { api: context.window.Providers, waits, usage, get attempts() { return attempts; } };
}
async function compactFixture(context, messages, output = 100000) {
 const captured = [];
 context.Providers.complete = async (_config, options) => { captured.push(options); return 'SUMMARY'; };
 const chat = Object.create(context.window.Chat.prototype);
 Object.assign(chat, { nodes: new Map(), settings: { windowOf: () => 1000000 }, compactNotice: () => ({}),
  closePart() {}, openPart() {}, finishNotice() {}, system: async () => [], save() {} });
 const conv = { messages, list: { append() {} } };
 const turn = { config: { id: 'new-model', output }, controller: new AbortController(), part: { view: { el: { before() {} } } } };
 await chat.compact(conv, turn);
 return { chat, conv, captured, entry: conv.messages.findLast(e => e.role === 'compact') };
}
const user = content => ({ role: 'user', content });
const assistant = (content, extra = {}) => ({ role: 'assistant', model: 'new-model', content, steps: [{ role: 'assistant', content }], ...extra });
async function main() {
 const c = chatVM(), api = c.window.audit;
 check('Summary room is 15% of the window', api.compactRoom({ window: 128000, output: 64000 }), 19200);
 check('Summary room never past what the model can write', api.compactRoom({ window: 1000000, output: 32000 }), 32000);
 check('Summary room with an unknown output limit', api.compactRoom({ window: 1000000 }), 8000);
 check('Summary room with nothing known', api.compactRoom({}), 8000);
 const initial = [user('U1'), assistant('A1'), user('U2'), assistant('A2'), user('U3'), assistant('A3')];
 const first = await compactFixture(c, initial);
 check('Initial compact retains two user/assistant turns', first.entry.turns, 4);
 const tooled = assistant('Final words', { steps: [
  { role: 'assistant', content: '', tool_calls: [{ id: 'k', function: { name: 'read_file', arguments: '{"path":"SECRET_CODE.js"}' } }] },
  { role: 'tool', tool_call_id: 'k', content: 'FILE_BODY' },
  { role: 'assistant', content: 'Final words' }] });
 const textOnly = await compactFixture(c, [user('Q1'), assistant('R1'), user('Q2'), tooled]);
 const kept = textOnly.chat.history(textOnly.conv);
 check('Kept turns carry text only, no commands or their results', [kept.some(m => m.tool_calls || m.role === 'tool'), kept.some(m => String(m.content).includes('FILE_BODY')), kept.filter(m => ['Q1', 'R1', 'Q2', 'Final words'].includes(m.content)).length], [false, false, 4]);
 const huge = await compactFixture(c, [user('old question'), assistant('old answer'), user('L'.repeat(400000)), assistant('short answer')]);
 const hugeKept = huge.chat.history(huge.conv).filter(m => m.role !== 'system').reduce((sum, m) => sum + String(m.content).length, 0);
 check('Kept turns stay within a tenth of the window', hugeKept < 1000000 * 0.1 * 3.2 + 2000, true);
 first.conv.messages.push(user('U4'), assistant('A4'));
 const second = await compactFixture(c, first.conv.messages);
 check('Second compact only reads last summary and later exchange', second.captured[0].messages[1].content, '[Summary of what came before]\nSUMMARY\n\nUser: U4\n\nOpenGhost: A4');
 check('Second compact still retains last two exchanges', second.chat.history(second.conv).filter(m => ['U3', 'A3', 'U4', 'A4'].includes(m.content)).map(m => m.content), ['U3', 'A3', 'U4', 'A4']);
 const pending = await compactFixture(c, [user('done-user'), assistant('done-answer'), user('UNANSWERED')]);
 check('Unanswered user excluded from summary', pending.captured[0].messages[1].content.includes('UNANSWERED'), false);
 check('Unanswered user remains in history', pending.chat.history(pending.conv).at(-1).content, 'UNANSWERED');
 const native = { role: 'assistant', content: 'answer', reasoning_content: 'thought', native: { provider: 'old' }, tool_calls: [{ id: 't', function: { name: 'read_file', arguments: '{}' } }] };
 const unsigned = api.flat([{ role: 'assistant', model: 'old-model', steps: [native, { role: 'tool', content: 'RESULT', tool_call_id: 't' }] }], 'new-model');
 check('Foreign model signatures removed, tool pair retained', [!!unsigned[0].native, !!unsigned[0].reasoning_content, unsigned[0].tool_calls.length, unsigned[1].content], [false, false, 1, 'RESULT']);
 const privateText = 'ONLY_IN_PRIVATE_RECORD';
 const recordCall = { role: 'assistant', model: 'new-model', steps: [
  { role: 'user', content: api.TOOL_NOTES.record + '\n' + privateText },
  { role: 'assistant', content: '', tool_calls: [{ id: 'r', function: { name: 'record', arguments: JSON.stringify({ action: 'write', text: privateText }) } }] },
  { role: 'tool', tool_call_id: 'r', content: 'Saved.' } ] };
 const privateCompact = await compactFixture(c, [user('Remember it'), recordCall]);
 check('Private record text excluded from summary request', privateCompact.captured[0].messages[1].content.includes(privateText), false);
 // No user storage is touched: load the main tools against an artificial Windows path.
 let fixtureReads = 0;
 const fakeFS = { realpathSync: file => file, promises: { stat: async () => ({ isDirectory: () => false, size: 12 }), readFile: async () => { fixtureReads++; return Buffer.from('FIXTURE_ONLY'); } } };
 const tc = { module: { exports: {} }, exports: {}, process: { ...process, platform: 'win32' }, Buffer, TextDecoder, URL, AbortController, setTimeout, clearTimeout,
  require: name => name === 'electron' ? { app: { getPath: () => 'C:\\AuditProfile' } } : name === 'node:path' ? path.win32 : name === 'node:fs' ? fakeFS : name === './media' ? { isImage: () => false } : name === './pdf' ? { isPdf: () => false } : name.startsWith('./') ? {} : require(name) };
 vm.createContext(tc); vm.runInContext(read('desktop/tools.js') + '\nmodule.exports.audit = { inPrivateStore, resolvePath, readFile };', tc);
 check('Exact private record path blocked', tc.module.exports.audit.inPrivateStore('C:\\AuditProfile\\store\\record\\other.json'), true);
 check('Same Windows path with different case blocked', tc.module.exports.audit.inPrivateStore('c:\\auditprofile\\store\\record\\other.json'), true);
 let leaked = {}; try { leaked = await tc.module.exports.audit.readFile('fixture', { path: 'c:\\auditprofile\\store\\record\\other.json' }, 'C:\\Project'); } catch {}
 check('read_file must not return another chat record', leaked.text, undefined);
 check('Blocked read never reaches the file system', fixtureReads, 0);
 for (const file of ['C:\\AuditProfile\\store\\chats\\other.json', '\\\\?\\C:\\AuditProfile\\store\\record\\other.json', '\\\\.\\C:\\AuditProfile\\store\\record\\other.json']) {
  check('Saved copies and device paths are private: ' + file, tc.module.exports.audit.inPrivateStore(file), true);
 }
 fakeFS.realpathSync = file => file.replace(/^C:\\Project\\alias(?=\\|$)/i, 'C:\\AuditProfile\\store');
 check('Junction into private store is blocked', tc.module.exports.audit.inPrivateStore('C:\\Project\\alias\\record\\other.json'), true);
 check('Ordinary project remains readable', tc.module.exports.audit.resolvePath('C:\\Project', 'src/main.js'), 'C:\\Project\\src\\main.js');
 // Stream retry matrix; fake timers finish instantly but preserve requested delays.
 const fail = event => ({ type: 'error', ...event });
 const config = { provider: 'openrouter', id: 'fixture', model: 'fixture' };
 for (const status of [408, 409, 429, 500, 502, 503, 504, 529]) {
  const p = providerVM(({ emit, attempt }) => emit(attempt === 1 ? fail({ status }) : { type: 'done', result: { content: 'ok' } }));
  await p.api.stream(config, { messages: [] }); check('Retry transient HTTP ' + status, [p.attempts, p.waits], [2, [1000]]);
 }
 for (const event of [{ status: 400 }, { status: 401 }, { status: 402 }, { status: 404 }, { status: 429, code: 'insufficient_quota' }, { status: 500, code: 'billing_error' }, { status: 429, code: 'content_filter' }]) {
  const p = providerVM(({ emit }) => emit(fail(event)));
  try { await p.api.stream(config, { messages: [] }); } catch {}
  check('No retry permanent ' + JSON.stringify(event), p.attempts, 1);
 }
 const local = providerVM(({ emit }) => emit(fail({ status: 500, message: 'model does not fit' })));
 try { await local.api.stream({ ...config, provider: 'local' }, { messages: [] }); } catch {}
 check('Local HTTP500 not retried', local.attempts, 1);
 const exhausted = providerVM(({ emit }) => emit(fail({ code: 'network' })));
 try { await exhausted.api.stream(config, { messages: [] }); } catch {}
 check('All six retry pauses and seven attempts', [exhausted.attempts, exhausted.waits, exhausted.usage.length], [7, [1000, 2000, 4000, 8000, 16000, 32000], 0]);
 for (const type of ['content', 'reasoning']) {
  const p = providerVM(({ emit }) => { emit({ type, delta: 'x' }); emit(fail({ code: 'network' })); });
  try { await p.api.stream(config, { messages: [] }); } catch {}
  check('No retry after stream ' + type, p.attempts, 1);
 }
 const complete = providerVM(({ emit, attempt }) => { if (attempt === 1) { emit({ type: 'content', delta: 'partial summary' }); emit(fail({ code: 'network' })); } else emit({ type: 'done', result: { content: 'second summary' } }); });
 try { await complete.api.complete(config, { messages: [] }); } catch {}
 check('No retry complete after partial content', complete.attempts, 1);
 const prediction = providerVM(({ emit, attempt }) => { if (attempt === 1) { emit({ type: 'reasoning', delta: 'thought' }); emit(fail({ code: 'network' })); } else emit({ type: 'done', result: { content: 'guess' } }); });
 try { await prediction.api.predict(config, { messages: [] }); } catch {}
 check('Prediction reasoning prevents repeat', prediction.attempts, 1);
 const success = providerVM(({ emit, attempt }) => emit(attempt === 1 ? fail({ code: 'network' }) : { type: 'done', result: { content: 'ok', usage: { prompt_tokens: 10 } } }));
 await success.api.stream(config, { messages: [] });
 check('Only successful retry contributes usage', success.usage.length, 1);
 const stop = new AbortController();
 const stopped = providerVM(({ emit }) => emit(fail({ code: 'network' })));
 let abortName = '';
 try { await stopped.api.stream(config, { messages: [], signal: stop.signal, onRetry: () => stop.abort() }); } catch (error) { abortName = error.name; }
 check('Stop during retry prevents next request', [stopped.attempts, abortName], [1, 'AbortError']);
 // Real OpenAI parser + real renderer retry code, only the network is artificial.
 for (const mode of ['error-before-token', 'clean-eof-after-text', 'tool-then-error']) {
  let posts = 0;
  const oc = { module: { exports: {} }, exports: {}, require, TextDecoder,
   fetch: async () => { posts++; return { ok: true, body: (async function* () {
    if (mode === 'clean-eof-after-text') { yield Buffer.from('data: {"type":"response.output_text.delta","item_id":"m","delta":"HALF"}\n\n'); return; }
    if (mode === 'tool-then-error') yield Buffer.from('data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"t","name":"read_file","arguments":"{}"}}\n\ndata: {"type":"error","error":{"message":"temporary","status":503}}\n\n');
    else throw new TypeError('terminated');
   })() }; } };
  vm.createContext(oc); vm.runInContext(read('desktop/openai.js'), oc);
  let value, thrown, partial;
  const integrated = providerVM(async ({ emit, request }) => {
   try { const result = await oc.module.exports.stream(request, { onEvent: emit }); emit({ type: 'done', result }); }
   catch (error) { emit({ type: 'error', status: error.status || 0, code: error.code || '', message: error.message }); }
  });
  try { value = await integrated.api.stream({ ...config, provider: 'openai' }, { messages: [] }); } catch (error) { thrown = error.message; partial = error.partial; }
  if (mode === 'error-before-token') check('OpenAI body disconnect before first token is retried', posts, 7);
  if (mode === 'clean-eof-after-text') check('OpenAI interrupted stream shows error, not successful HALF', !!thrown, true);
  if (mode === 'clean-eof-after-text') check('Interrupted text remains available to the chat error handler', partial?.content, 'HALF');
  if (mode === 'tool-then-error') check('No new request after received OpenAI tool call', posts, 1);
 }
 // Record lifecycle without any real store: each fixture key is an in-memory map entry.
 const lc = { window: {}, console, setTimeout, clearTimeout, I18n: { t: x => x }, ChatLock: {
  seal: async (_key, body) => JSON.stringify(body), open: async (_key, body) => JSON.parse(body)
 } };
 vm.createContext(lc); vm.runInContext(read('library.js'), lc);
 const lib = Object.create(lc.window.Library.prototype), disk = new Map(), original = { id: 'a', title: 'A', updated: 1 };
 Object.assign(lib, { chats: [original], keys: new Map(), titles: new Map(), writes: new Map(), gone: new Set(), fresh: new Set(), changed() {}, isHome: () => false,
  notes: async () => ({ items: [] }), side: async () => ({ messages: [] }), store: {
   read: async key => disk.get(key), write: async (key, value) => { disk.set(key, value); }, remove: async key => { disk.delete(key); }
  } });
 check('Record plain write succeeds', await lib.saveRecord('a', 'original'), true);
 check('Record plain read', await lib.record('a'), 'original');
 const fork = await lib.fork('a', { messages: [], tokens: 0 });
 await lib.saveRecord('a', 'changed');
 check('Fork record is independent', [await lib.record('a'), await lib.record(fork.id)], ['changed', 'original']);
 original.lock = {}; lib.keys.set('a', 'fixture-key');
 await lib.saveRecord('a', 'sealed');
 check('Protected record saved sealed', [!!disk.get('record/a').sealed, disk.get('record/a').text], [true, undefined]);
 lib.keys.delete('a');
 check('Locked record cannot be read', await lib.record('a'), '');
 check('Locked record cannot be written', await lib.saveRecord('a', 'bad'), false);
 lib.keys.set('a', 'fixture-key');
 await lib.saveRecord('a', '');
 check('Empty record deletes fixture key', disk.has('record/a'), false);
 await lib.saveRecord('a', 'later');
 lib.remove('a'); await lib.writes.get('a');
 check('Chat removal deletes record', disk.has('record/a'), false);
 // A pending record save must not recreate a file after its chat has been deleted.
 lib.chats.push({ id: 'b', title: 'B' });
 let release;
 lib.queue('b', () => new Promise(resolve => { release = resolve; }));
 await Promise.resolve();
 const pendingSave = lib.saveRecord('b', 'must disappear');
 lib.remove('b');
 release(); await pendingSave;
 check('Delete waits for pending record write before final removal', disk.has('record/b'), false);
 // Record tool's boundary and main/mini visibility.
 const mainChat = Object.create(c.window.Chat.prototype), origin = { id: 'r', brief: 'old', record: { id: 'r' } };
 let written = '';
 const recordLib = { chat: () => ({ id: 'r' }), isProtected: () => false, record: async () => written, saveRecord: async (_id, text) => { written = text; return true; } };
 Object.assign(mainChat, { library: recordLib, agent: () => true, settings: { mode: 'agent' }, peerLines: () => '', cwd: () => 'C:\\Project', routinable: () => false });
 await mainChat.useRecord(origin, {}, { action: 'write', text: 'x'.repeat(40000) });
 check('40000 characters accepted', written.length, 40000);
 await mainChat.useRecord(origin, {}, { action: 'write', text: 'y'.repeat(40001) });
 check('40001 characters rejected without replacing', written[0], 'x');
 const sideChat = Object.create(c.window.SideChat.prototype);
 Object.assign(sideChat, mainChat, { origin });
 await sideChat.useRecord({ id: 'r', brief: 'old' }, {}, { action: 'write', text: 'from mini' });
 check('Mini record write updates main immediately', [origin.brief, written], ['from mini', 'from mini']);
 const pieces = { id: 'p', brief: 'Budget: 300\nCity: Rome', record: { id: 'p' } };
 const before = Date.now();
 const addReply = await mainChat.useRecord(pieces, {}, { action: 'add', text: 'Flight: Friday' });
 const added = pieces.brief.split('\n').at(-1), clock = added.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d) — Flight: Friday$/);
 const stampedAt = clock ? new Date(+clock[1], clock[2] - 1, +clock[3], +clock[4], +clock[5]).getTime() : 0;
 check('Record add puts a line at the end, stamped by the computer clock', [pieces.brief.startsWith('Budget: 300\nCity: Rome\n'), !!clock, Math.abs(stampedAt - before) < 120000], [true, true, true]);
 check('The record tool tells the agent the computer time', /^Saved at \d{4}-\d\d-\d\d \d\d:\d\d by this computer's clock/.test(addReply), true);
 await mainChat.useRecord(pieces, {}, { action: 'edit', old_text: 'Budget: 300', new_text: 'Budget: 450' });
 check('Record edit changes one piece', pieces.brief, `Budget: 450\nCity: Rome\n${added}`);
 await mainChat.useRecord(pieces, {}, { action: 'edit', old_text: 'City: Rome\n', new_text: '' });
 check('Record edit with nothing deletes a line', pieces.brief, `Budget: 450\n${added}`);
 const notThere = await mainChat.useRecord(pieces, {}, { action: 'edit', old_text: 'Paris', new_text: 'x' });
 const twiceThere = await mainChat.useRecord({ id: 'p', brief: 'a b a', record: { id: 'p' } }, {}, { action: 'edit', old_text: 'a', new_text: 'c' });
 check('Record edit refuses a piece not found or found twice', [notThere.startsWith('Error:'), twiceThere.startsWith('Error:'), pieces.brief], [true, true, `Budget: 450\n${added}`]);
 c.AgentPrompt = { state: () => 'agent' }; c.Memory = { on: false }; c.Skills.lines = () => '';
 const ownWrite = { role: 'assistant', content: '', tool_calls: [{ id: 'w', function: { name: 'record', arguments: JSON.stringify({ action: 'write', text: pieces.brief }) } }] };
 check('No note repeats a record the agent has just written whole', mainChat.notes(pieces, [ownWrite, { role: 'tool', tool_call_id: 'w', content: 'Saved.' }]).some(item => item.content.startsWith(api.TOOL_NOTES.record)), false);
 const ownEdit = { role: 'assistant', content: '', tool_calls: [{ id: 'e', function: { name: 'record', arguments: JSON.stringify({ action: 'edit', old_text: 'x', new_text: 'y' }) } }] };
 check('A note follows an edit, which did not carry the whole record', mainChat.notes(pieces, [ownEdit]).some(item => item.content.startsWith(api.TOOL_NOTES.record)), true);
 c.AgentPrompt = { state: () => 'agent' }; c.Memory = { on: false }; c.Skills.lines = () => '';
 const note = mainChat.notes(origin, []);
 check('Main receives latest record note', note.some(item => item.content.endsWith('\nfrom mini')), true);
 check('Current record already in retained steps is not duplicated', mainChat.notes(origin, note).filter(item => item.content.startsWith(api.TOOL_NOTES.record)).length, 0);
 const other = { id: 'other', brief: '', record: { id: 'other' } };
 check('Unrelated chat receives no record note', mainChat.notes(other, []).some(item => item.content.startsWith(api.TOOL_NOTES.record)), false);
 // A switch always happens. The new model writes the summary when it reads at least as much, else the one in use does.
 for (const [label, windows, writer] of [['equal', { old: 100000, new: 100000 }, 'new'], ['larger', { old: 100000, new: 200000 }, 'new'], ['smaller', { old: 200000, new: 100000 }, 'old']]) {
  const handoff = Object.create(c.window.Chat.prototype), conv = { id: 's', record: { id: 's', model: 'old' }, messages: [user('U'), assistant('A')] };
  let summarized = null;
  Object.assign(handoff, { active: conv, modelOf: one => one.record.model, hasHistory: () => true,
   begin: (_conv, config) => ({ config }), summarize: (_conv, turn) => { summarized = [turn.config.id, turn.switch, conv.record.model]; },
   library: { update: (_id, value) => Object.assign(conv.record, value) },
   settings: { windowOf: id => windows[id], configFor: id => ({ id }), setModel() {} } });
  handoff.switchModel('new');
  check('Switch to a model with a ' + label + ' window', summarized, [writer, 'old', 'new']);
 }
 const rollback = Object.create(c.window.Chat.prototype), rollbackRecord = { id: 'back', model: 'new', named: true };
 const emptyEntry = assistant(''); emptyEntry.steps = [];
 const rollbackConv = { id: 'back', record: rollbackRecord, messages: [emptyEntry] };
 const view = { el: { classList: { remove() {} } }, stream: { finish: async () => {} } };
 const rollbackTurn = { switch: 'old', quiet: true, approvals: new Set(), queue: [], parts: [], part: { view, entry: emptyEntry } };
 rollbackConv.turn = rollbackTurn;
 let selected;
 Object.assign(rollback, { active: rollbackConv, library: { chat: () => rollbackRecord, update: (_id, change) => Object.assign(rollbackRecord, change) },
  settings: { setModel: id => { selected = id; } }, postPills() {}, save() {}, dismissGhost() {}, onChange() {}, fail() {}, followBottom() {} });
 await rollback.end(rollbackConv, rollbackTurn, Error('summary failed'), null);
 check('Failed handoff restores old model', [rollbackRecord.model, selected], ['old', 'old']);
 // Confirmation markup with reduced motion: no native window/profile needed.
 // The others go first and the chosen row glides after a pause (a timer); the markup is all that is read here.
 const mc = { window: { matchMedia: () => ({ matches: true }) }, I18n: { t: key => key }, setTimeout: () => 0, clearTimeout: () => {} };
 vm.createContext(mc); vm.runInContext(read('model-stage.js'), mc);
 for (const writer of ['new', 'old']) {
  const stage = Object.create(mc.window.ModelStage.prototype), callbacks = [];
  const button = { addEventListener: (...args) => callbacks.push(args[0]), focus() {} };
  const row = { dataset: { model: 'new' }, closest: () => ({ classList: { toggle() {}, add() {} } }) };
  Object.assign(stage, { rows: [row], groups: [], focus() {}, dropFlyer() {}, mark: () => ({}), name: x => x,
   chat: { model: 'old', summarizerFor: () => writer }, askSlot: { classList: { remove() {} } },
   ask: { innerHTML: '', setAttribute() {}, querySelector() { return button; } } });
  stage.confirm(row);
  check('Confirmation offers the switch and names who summarizes (' + writer + ')', [(stage.ask.innerHTML.match(/data-answer="[^"]+"/g) || []), stage.ask.innerHTML.includes(writer === 'new' ? 'model.confirm.self' : 'model.confirm.text')], [['data-answer="cancel"', 'data-answer="ok"'], true]);
 }
 // OpenAI's actual outgoing request includes and caps the requested output budget.
 let requestBody;
 const outgoing = { module: { exports: {} }, exports: {}, require, TextDecoder, fetch: async (_url, init) => { requestBody = JSON.parse(init.body); return { ok: true, body: (async function* () { yield Buffer.from('data: {"type":"response.completed","response":{"usage":{}}}\n\n'); })() }; } };
 vm.createContext(outgoing); vm.runInContext(read('desktop/openai.js'), outgoing);
 await outgoing.module.exports.stream({ provider: 'openai', model: 'fixture', messages: [], maxTokens: 15000, output: 10000 }, {});
 check('OpenAI request sends max_output_tokens capped by model output', requestBody.max_output_tokens, 10000);
 // DeepSeek's real stream handling is exercised with in-memory Web Streams.
 for (const mode of ['before-first', 'after-text', 'after-reasoning', 'after-tool']) {
  let posts = 0;
  const dc = { window: {}, I18n: { t: key => key, has: () => false }, TextDecoderStream,
   fetch: async () => {
    posts++;
    const success = mode === 'before-first' && posts > 1;
    let n = 0;
    return { ok: true, body: new ReadableStream({ pull(controller) {
     if (success) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')); controller.close(); return; }
     if (n++ === 0 && mode !== 'before-first') {
      const delta = mode === 'after-text' ? { content: 'HALF' } : mode === 'after-reasoning' ? { reasoning_content: 'THOUGHT' } : { tool_calls: [{ index: 0, id: 't', function: { name: 'read_file', arguments: '{}' } }] };
      controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n'));
     } else controller.error(new TypeError('fixture network loss'));
    } }) };
   } };
  vm.createContext(dc); vm.runInContext(read('deepseek.js'), dc);
  const deep = providerVM(() => {}, dc.window.DeepSeek);
  try { await deep.api.stream({ ...config, provider: 'deepseek', key: 'fixture' }, { messages: [] }); } catch {}
  check('DeepSeek ' + mode + ' retry policy', posts, mode === 'before-first' ? 2 : 1);
 }
 // Actual AES-GCM path, but only artificial storage. A record write failure leaves plaintext and protect returns true.
 const cryptoContext = { window: {}, TextEncoder, TextDecoder, Uint8Array, btoa, atob, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout };
 vm.createContext(cryptoContext); vm.runInContext(read('chat-lock.js'), cryptoContext);
 cryptoContext.ChatLock = cryptoContext.window.ChatLock;
 vm.runInContext(read('library.js'), cryptoContext);
 const encryptLib = Object.create(cryptoContext.window.Library.prototype), protectedMeta = { id: 'p', title: 'Private' };
 const protectedDisk = new Map([['chats/p', { messages: [], tokens: 0 }], ['record/p', { version: 1, text: 'private record still plaintext' }]]);
 Object.assign(encryptLib, { chats: [protectedMeta], writes: new Map(), keys: new Map(), titles: new Map(), persist: async () => {}, changed() {}, store: {
  read: async key => protectedDisk.get(key), write: async (key, value) => { if (key === 'record/p') throw Error('fixture record write failure'); protectedDisk.set(key, value); }
 } });
 const protectedResult = await encryptLib.protect('p', 'fixture password');
 check('Password operation must not report success with unsealed record', [protectedResult, !!protectedDisk.get('record/p').sealed], [false, false]);
 check('Failed protection restores unlocked metadata', !!protectedMeta.lock, false);
 check('Failed protection restores the original messages', !!protectedDisk.get('chats/p').sealed, false);

 // Transaction failures at every data file, including failures during rollback.
 function passwordFixture() {
  const meta = { id: 't', title: 'Title' }, values = new Map([
   ['chats/t', { version: 1, messages: [user('important')], tokens: 20 }],
   ['mini/t', { version: 1, messages: [user('side')], tokens: 2, seen: 3 }],
   ['notes/t', { version: 1, items: [{ text: 'note' }], next: 2 }],
   ['drafts/t', { version: 1, text: 'draft' }], ['record/t', { version: 1, text: 'facts' }],
  ]);
  const instance = Object.create(cryptoContext.window.Library.prototype);
  const fault = { read: '', write: '', index: 0, rollback: false, failed: false, persists: 0 };
  Object.assign(instance, { chats: [meta], writes: new Map(), keys: new Map(), titles: new Map(), changed() {}, onChange() {},
   persist: async () => { if (++fault.persists === fault.index) throw Error('fixture index failure'); },
   store: {
    read: async name => { if (name === fault.read) throw Error('fixture read failure'); return values.get(name); },
    write: async (name, body) => {
     if (name === fault.write && !fault.failed) { fault.failed = true; throw Error('fixture write failure'); }
     if (fault.rollback && fault.failed && name === 'chats/t' && !body.sealed) throw Error('fixture rollback failure');
     values.set(name, body);
    }, remove: async name => { values.delete(name); },
   } });
  return { instance, meta, values, fault };
 }
 const contents = values => JSON.stringify([...values]);
 for (const kind of ['chats', 'mini', 'notes', 'drafts', 'record']) {
  const fixture = passwordFixture(), before = contents(fixture.values);
  fixture.fault.write = `${kind}/t`;
  const ok = await fixture.instance.protect('t', 'test password');
  check('Protection write failure rolls back ' + kind, [ok, !!fixture.meta.lock, contents(fixture.values) === before], [false, false, true]);
 }
 for (const phase of ['read', 'index']) {
  const fixture = passwordFixture(), before = contents(fixture.values);
  if (phase === 'read') fixture.fault.read = 'record/t';
  else fixture.fault.index = 1;
  const ok = await fixture.instance.protect('t', 'test password');
  check('Protection ' + phase + ' failure changes no data', [ok, !!fixture.meta.lock, contents(fixture.values) === before], [false, false, true]);
 }
 const recovery = passwordFixture();
 recovery.fault.write = 'record/t'; recovery.fault.rollback = true;
 const partial = await recovery.instance.protect('t', 'test password');
 check('Failed rollback retains a usable password and key', [partial, !!recovery.meta.lock, recovery.instance.keys.has('t'), await recovery.instance.unlock('t', 'test password')], [false, true, true, true]);
 recovery.fault.rollback = false;
 check('Partially protected chat can be recovered by removing password', await recovery.instance.unprotect('t'), true);
 check('Recovery preserves private record', recovery.values.get('record/t').text, 'facts');
 const roundtrip = passwordFixture(), roundtripBefore = contents(roundtrip.values);
 check('Successful password operation seals every chat file', [await roundtrip.instance.protect('t', 'test password'), [...roundtrip.values.values()].every(value => !!value.sealed)], [true, true]);
 check('Correct password opens record', [await roundtrip.instance.unlock('t', 'test password'), await roundtrip.instance.record('t')], [true, 'facts']);
 const beforeUnprotect = contents(roundtrip.values);
 roundtrip.fault.write = 'record/t'; roundtrip.fault.failed = false;
 check('Removing password failure restores all sealed files and retains key', [await roundtrip.instance.unprotect('t'), !!roundtrip.meta.lock, roundtrip.instance.keys.has('t'), contents(roundtrip.values) === beforeUnprotect], [false, true, true, true]);
 roundtrip.fault.write = '';
 check('Successful password removal preserves every value', [await roundtrip.instance.unprotect('t'), !!roundtrip.meta.lock, contents(roundtrip.values) === roundtripBefore], [true, false, true]);
 const saveFailure = passwordFixture(); saveFailure.fault.write = 'record/t';
 let writeFailed = false; try { await saveFailure.instance.saveRecord('t', 'replacement'); } catch { writeFailed = true; }
 check('Record write failure is not swallowed', [writeFailed, await saveFailure.instance.record('t')], [true, 'facts']);
 saveFailure.fault.read = 'record/t';
 let readFailed = false; try { await saveFailure.instance.record('t'); } catch { readFailed = true; }
 check('Record read failure is not treated as an empty record', readFailed, true);
 mainChat.library = saveFailure.instance;
 saveFailure.fault.failed = false;
 const unsaved = { id: 't', brief: 'facts' };
 const failureReply = await mainChat.useRecord(unsaved, {}, { action: 'write', text: 'not stored' });
 check('Record tool reports an I/O failure without changing in-memory facts', [failureReply.startsWith('Error:'), unsaved.brief], [true, 'facts']);
 const unread = { id: 't', brief: null };
 const unreadReply = await mainChat.useRecord(unread, {}, { action: 'write', text: 'not stored' });
 check('Record tool reports a read failure without claiming an empty file', [unreadReply.startsWith('Error:'), unread.brief], [true, null]);

 // Main-process adapters must all report tool activity and require a terminal event.
 const { EventEmitter } = require('node:events'), { Readable } = require('node:stream');
 for (const provider of ['openrouter', 'custom', 'ollama']) {
  for (const mode of ['empty-eof', 'text-eof', 'tool-eof', 'success', 'terminal-then-drop', 'terminal-no-newline']) {
   let posts = 0;
   const terminal = ['success', 'terminal-then-drop', 'terminal-no-newline'].includes(mode);
   const packet = provider === 'ollama'
    ? JSON.stringify(mode === 'tool-eof' ? { message: { tool_calls: [{ function: { name: 'read_file', arguments: {} } }] } } : { message: { content: 'HALF' }, ...(terminal ? { done: true, done_reason: 'stop' } : {}) }) + '\n'
    : 'data: ' + JSON.stringify({ choices: [{ delta: mode === 'tool-eof' ? { tool_calls: [{ index: 0, id: 't', function: { name: 'read_file', arguments: '{}' } }] } : { content: 'HALF' }, ...(terminal ? { finish_reason: 'stop' } : {}) }] }) + '\n\n';
   const body = () => (async function* () {
    if (mode !== 'empty-eof') yield Buffer.from(mode === 'terminal-no-newline' ? packet.trimEnd() : packet);
    if (mode === 'terminal-then-drop') { await new Promise(setImmediate); throw new TypeError('network closed after terminal event'); }
   })();
   const transport = { request: (_url, _options, callback) => {
    const request = new EventEmitter(); request.destroy = error => request.emit('error', error);
    request.end = () => queueMicrotask(() => { posts++; const response = Readable.from(body()); response.statusCode = 200; response.on('close', () => request.emit('close')); callback(response); });
    return request;
   } };
   const engine = { module: { exports: {} }, exports: {}, TextDecoder, URL, Buffer, AbortSignal,
    require: name => ['node:http', 'node:https'].includes(name) ? transport : require(name),
    fetch: async url => {
     if (provider === 'ollama') return { ok: true, json: async () => ({ models: [] }) };
     posts++; return { ok: true, body: body() };
    } };
   vm.createContext(engine); vm.runInContext(read(provider === 'openrouter' ? 'desktop/openrouter.js' : 'desktop/local.js'), engine);
   const proxy = providerVM(async ({ emit, request }) => {
    try { emit({ type: 'done', result: await engine.module.exports.stream(request, { onEvent: emit }) }); }
    catch (error) { emit({ type: 'error', status: error.status || 0, code: error.code || '', message: error.message }); }
   });
   let value, failed = false;
   try { value = await proxy.api.stream({ ...config, provider: provider === 'ollama' ? 'local' : provider, key: provider === 'ollama' ? 'http://fixture.invalid' : 'fixture', address: 'https://fixture.invalid/v1' }, { messages: [] }); }
   catch { failed = true; }
   check(provider + ' ' + mode + ' completes only after terminal event', [posts, failed, value?.content], terminal ? [1, false, 'HALF'] : [mode === 'empty-eof' ? 7 : 1, true, undefined]);
  }
 }
 for (const mode of ['empty-error', 'text-error', 'tool-error', 'success', 'field-fallback']) {
  let calls = 0, retries;
  class ConnectionError extends Error {}
  class APIError extends Error { constructor(status) { super('unsupported field'); this.status = status; } }
  class FakeSDK {
   constructor(options) {
    retries = options.maxRetries;
    const stream = () => {
     calls++;
     const live = new EventEmitter();
     live.finalMessage = async () => {
      if (mode === 'field-fallback' && calls === 1) throw new APIError(400);
      if (mode === 'tool-error') live.emit('streamEvent', { type: 'content_block_start', content_block: { type: 'tool_use' } });
      else if (mode !== 'empty-error') { live.emit('streamEvent', { type: 'content_block_start', content_block: { type: 'text' } }); live.emit('text', 'OK'); }
      if (mode.endsWith('error')) throw new ConnectionError('network');
      return { content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn', usage: { input_tokens: 2, output_tokens: 1 } };
     };
     return live;
    };
    this.messages = { stream }; this.beta = { messages: { stream } };
   }
  }
  Object.assign(FakeSDK, { APIConnectionError: ConnectionError, APIError, APIUserAbortError: class extends Error {} });
  const engine = { module: { exports: {} }, exports: {}, require: name => name === '@anthropic-ai/sdk' ? FakeSDK : require(name) };
  vm.createContext(engine); vm.runInContext(read('desktop/anthropic.js'), engine);
  const proxy = providerVM(async ({ emit, request }) => {
   try { emit({ type: 'done', result: await engine.module.exports.stream(request, { onEvent: emit }) }); }
   catch (error) { emit({ type: 'error', status: error.status || 0, code: error.code || '', message: error.message }); }
  });
  let failed = false;
  try { await proxy.api.stream({ ...config, provider: 'anthropic' }, { messages: [] }); } catch { failed = true; }
  check('Anthropic activity and field fallback: ' + mode, [calls, retries, failed], [mode === 'empty-error' ? 7 : mode === 'field-fallback' ? 2 : 1, 0, mode.endsWith('error')]);
 }
 const report = { count: results.length, passed: results.filter(r => r.pass).length, results };
 if (report.passed !== report.count) process.exitCode = 1;
 console.log(JSON.stringify({ ...report, results: results.filter(r => !r.pass) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
