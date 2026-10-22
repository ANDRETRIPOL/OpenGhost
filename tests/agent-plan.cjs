'use strict';
// The agent's plan: what the plan tool takes and refuses, what counts as work and as a failed check, what the top of the
// chat shows, the note that tells the agent its plan, and the turn sent back to open steps. Real source in VMs.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const results = [];
const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });

function planVM() {
 const context = { window: {} };
 vm.createContext(context);
 vm.runInContext(read('agent-plan.js'), context);
 return context.window.AgentPlan;
}

function chatVM() {
 const context = { window: {}, console, AbortController, setTimeout, clearTimeout, Promise,
  Skills: { blocks: () => '' }, Usage: { parts: () => null }, Providers: {}, I18n: { t: (key, values) => `${key}${values ? JSON.stringify(values) : ''}` },
  AgentTools: { shell: 'run_powershell', schemas: [{ function: { name: 'read_file' } }, { function: { name: 'plan' } }] } };
 vm.createContext(context);
 vm.runInContext(read('agent-plan.js'), context);
 context.AgentPlan = context.window.AgentPlan;
 vm.runInContext(read('plan-proof.js'), context);
 context.PlanProof = context.window.PlanProof;
 vm.runInContext(read('chat.js').replace('Chat.splitQuotes = splitQuotes;', 'window.audit = { TOOL_NOTES, SideChat }; Chat.splitQuotes = splitQuotes;'), context);
 return context;
}

const P = planVM();
const { TEXT, PLAN } = P;
const steps = ['Photos sorted', 'Page frame', 'Menu in two columns', 'Phone layout'];

// Making a plan.
const made = P.apply(null, { action: 'start', steps });
check('A plan of four steps is made, the first under way', [made.plan.steps.length, made.plan.steps.map(step => step.state), P.current(made.plan).text], [4, ['open', 'open', 'open', 'open'], 'Photos sorted']);
check('The answer tells the plan as it stands, which the note reads back', P.seen(made.text), P.lines(made.plan));
check('One step is no plan, eleven are too many', [P.apply(null, { action: 'start', steps: ['Only'] }).plan, P.apply(null, { action: 'start', steps: Array.from({ length: 11 }, (_, k) => `Step ${k}`) }).plan], [null, null]);
check('A step named at length is refused', P.apply(null, { action: 'start', steps: ['Short', 'x'.repeat(PLAN.words + 1)] }).text, TEXT.long(2));
check('Steps sent as lines of one text are taken too', P.apply(null, { action: 'start', steps: 'One\nTwo\n\nThree' }).plan.steps.map(step => step.text), ['One', 'Two', 'Three']);
check('Anything else needs a plan first', P.apply(null, { action: 'done', step: 1, proof: 'npm test printed 12 passing' }, { work: 3 }).text, TEXT.none);
check('An unknown action is named', P.apply(made.plan, { action: 'finish' }).text, TEXT.action);

// Closing a step.
const ok = { work: 2, check: null };
check('A step is not closed without proof', [P.apply(made.plan, { action: 'done', step: 1 }, ok).text, P.apply(made.plan, { action: 'done', step: 1, proof: 'Done.' }, ok).text, P.apply(made.plan, { action: 'done', step: 1, proof: 'готово' }, ok).text], [TEXT.proof, TEXT.proof, TEXT.proof]);
check('nor when nothing was done since the plan last changed', P.apply(made.plan, { action: 'done', step: 1, proof: 'list_files shows 12 photos in photos/' }, { work: 0 }).text, TEXT.idle(1));
check('nor while the last check fails', P.apply(made.plan, { action: 'done', step: 1, proof: 'the page opens in the browser' }, { work: 3, check: { command: 'npm test', code: 1 } }).text, TEXT.failed('npm test', 1));
check('A check that passed, or a command of unknown end, lets it close', [!!P.apply(made.plan, { action: 'done', step: 1, proof: 'the page opens in the browser' }, { work: 1, check: { command: 'npm test', code: 0 } }).plan, !!P.apply(made.plan, { action: 'done', step: 1, proof: 'the page opens in the browser' }, { work: 1, check: { command: 'npm test', code: null } }).plan], [true, true]);
const one = P.apply(made.plan, { action: 'done', step: 1, proof: '12 photos in photos/, three fit the hero' }, ok);
check('A step closed keeps its proof, and the next one is under way', [one.plan.steps[0].state, one.plan.steps[0].proof, P.current(one.plan).text, P.tally(one.plan)], ['done', '12 photos in photos/, three fit the hero', 'Page frame', { done: 1, total: 4 }]);
check('A closed step can\'t be closed again, nor a step that is not there', [P.apply(one.plan, { action: 'done', step: 1, proof: 'again the same twelve photos' }, ok).text, P.apply(one.plan, { action: 'done', step: 9, proof: 'something that is long enough' }, ok).text], [TEXT.closed(1), TEXT.step(9)]);
check('The plan before the call is left as it was', made.plan.steps[0].state, 'open');

// Dropping, adding, waiting.
check('A step is dropped only with a reason', P.apply(one.plan, { action: 'drop', step: 4 }).text, TEXT.reason);
const dropped = P.apply(one.plan, { action: 'drop', step: 4, reason: 'The user asked for no phone version' });
check('A dropped step keeps its reason and counts neither way', [dropped.plan.steps[3].state, dropped.plan.steps[3].reason, P.tally(dropped.plan)], ['dropped', 'The user asked for no phone version', { done: 1, total: 3 }]);
const added = P.apply(dropped.plan, { action: 'add', steps: ['Opening hours'], after: 2 });
check('Steps are added after the one named', added.plan.steps.map(step => step.text), ['Photos sorted', 'Page frame', 'Opening hours', 'Menu in two columns', 'Phone layout']);
check('A plan holds no more than its most', P.apply(added.plan, { action: 'add', steps: Array.from({ length: PLAN.most }, (_, k) => `More ${k}`) }).text, TEXT.most(PLAN.most));
const waiting = P.apply(added.plan, { action: 'wait', reason: 'Sign in to the booking site in the browser' });
check('Waiting needs a reason and keeps it on the plan', [P.apply(added.plan, { action: 'wait' }).text, waiting.plan.wait, waiting.text.startsWith(TEXT.waits)], [TEXT.reason, 'Sign in to the booking site in the browser', true]);
check('Any change after it means the agent is at it again', P.apply(waiting.plan, { action: 'add', steps: ['Map'] }).plan.wait, '');

// A new plan over an old one with open steps.
check('A new plan over open steps needs the reason', P.apply(added.plan, { action: 'start', steps: ['A', 'B'] }).text, TEXT.replace('2. Page frame; 3. Opening hours; 4. Menu in two columns'));
check('With the reason it replaces the old one', P.apply(added.plan, { action: 'start', steps: ['A', 'B'], reason: 'The user asked for a booking form instead' }).plan.steps.map(step => step.text), ['A', 'B']);

// The last step asks for the request to be checked.
let plan = P.apply(null, { action: 'start', steps: ['First', 'Second'] }).plan;
plan = P.apply(plan, { action: 'done', step: 1, proof: 'node app.js printed Hello' }, ok).plan;
const last = P.apply(plan, { action: 'done', step: 2, proof: 'npm test printed 4 passing' }, ok);
check('Closing the last step asks for the request to be checked part by part', [P.finished(last.plan), last.text.includes(TEXT.last)], [true, true]);
check('Dropping the last open step asks the same', P.apply(plan, { action: 'drop', step: 2, reason: 'The user asked to stop here' }).text.includes(TEXT.last), true);
check('The lines say what is done, dropped, under way and to come', P.lines(added.plan), '✓ 1. Photos sorted — 12 photos in photos/, three fit the hero\n→ 2. Page frame (under way)\n○ 3. Opening hours\n○ 4. Menu in two columns\n✗ 5. Phone layout — dropped: The user asked for no phone version');

// What counts as work and as a check.
const conv = {};
P.saw(conv, { name: 'plan', worked: true });
P.saw(conv, { name: 'record', worked: true });
P.saw(conv, { name: 'read_file', worked: false });
check('The plan itself, the record and failed calls do no work', conv.planWork || 0, 0);
P.saw(conv, { name: 'read_file', worked: true });
P.saw(conv, { name: 'run_powershell', shell: true, args: JSON.stringify({ command: 'Get-ChildItem photos' }), output: 'Exit code 0\nphotos', worked: true });
check('Reading a file and a command are work; a listing is no check', [conv.planWork, conv.planCheck], [2, undefined]);
check('The user\'s answer to a question is a step\'s work too', [P.saw(conv, { name: 'ask_user', output: 'Dark', worked: true }), conv.planWork], [true, 3]);
conv.planWork = 2;
P.saw(conv, { name: 'run_powershell', shell: true, args: JSON.stringify({ command: 'npm test' }), output: 'Exit code 1\n1 failing', worked: true });
check('A test that failed is the last check', conv.planCheck, { command: 'npm test', code: 1 });
P.saw(conv, { name: 'run_powershell', shell: true, args: JSON.stringify({ command: 'cd app; npm run build' }), output: 'Exit code 0\nbuilt', worked: true });
check('A build that passed takes its place', conv.planCheck, { command: 'cd app; npm run build', code: 0 });
const checks = ['pytest -q', 'python -m pytest tests', 'node --check app.js', 'npx tsc --noEmit', 'cargo test', 'go vet ./...', 'make', 'make test', 'eslint .', 'npm run lint'];
check('Tests, builds, linters and syntax checks are checks', checks.filter(command => !PLAN.check.test(command)), []);
const others = ['npm install', 'git status', 'node app.js', 'Get-Content README.md', 'python script.py', 'npm run dev', 'makedirs.py'];
check('Installs, runs and reads are not', others.filter(command => PLAN.check.test(command)), []);

// The chat: what the top shows, the note, the turn sent back.
const c = chatVM(), { TOOL_NOTES, SideChat } = c.window.audit;
const chat = Object.create(c.window.Chat.prototype);
const user = text => ({ role: 'user', text, content: text });
const reply = extra => ({ role: 'assistant', content: 'ok', steps: [], ...extra });
const open = P.apply(null, { action: 'start', steps: ['A', 'B'] }).plan, done = P.apply(P.apply(open, { action: 'done', step: 1, proof: 'node a.js printed 1' }, ok).plan, { action: 'done', step: 2, proof: 'node b.js printed 2' }, ok).plan;
check('No plan, nothing at the top', chat.planView({ messages: [user('hi'), reply()] }), null);
check('A plan with open steps shows, after the user wrote too', !!chat.planView({ messages: [user('go'), reply({ plan: open }), user('and?'), reply()] }), true);
check('A finished plan shows until the user writes again', [!!chat.planView({ messages: [user('go'), reply({ plan: done })] }), chat.planView({ messages: [user('go'), reply({ plan: done }), user('thanks')] })], [true, null]);
const asked = { ...open, wait: 'Sign in' };
check('It waits for the user until they write', [chat.planView({ messages: [reply({ plan: asked })] }).waiting, chat.planView({ messages: [reply({ plan: asked }), user('done')] }).waiting], [true, false]);
check('A question or an approval waiting lights it too', [chat.planView({ messages: [reply({ plan: open })], ask: {} }).waiting, chat.planView({ messages: [reply({ plan: open })], turn: { approvals: new Set([1]) } }).waiting], [true, true]);
check('The latest plan of the chat is the one', chat.planOf({ messages: [reply({ plan: open }), reply({ plan: done })] }), done);

// What the agent saw last: a note of the app, or the answer to its own call.
const lines = P.lines(open);
check('The plan seen last is read from a note', chat.planSeen([{ role: 'user', content: `${TOOL_NOTES.plan}\n${lines}` }]), lines);
check('or from the answer to a plan call, whichever is later', chat.planSeen([{ role: 'user', content: `${TOOL_NOTES.plan}\nold` }, { role: 'tool', content: P.apply(null, { action: 'start', steps: ['A', 'B'] }).text }]), lines);
check('Other tool results say nothing of it', chat.planSeen([{ role: 'tool', content: 'Exit code 0\nThe plan now: no' }]), '');

(async () => {
// A tool call keeps the plan on the reply it was made in.
const entry = reply(), live = { messages: [user('make a site'), entry] }, turn = { part: { entry }, parts: [{ entry }], config: {} };
chat.onPlan = () => { live.told = (live.told || 0) + 1; };
await chat.usePlan(live, turn, { action: 'start', steps: ['Frame', 'Menu'] });
check('A new plan stands on the reply and the top is told', [!!entry.plan, entry.plan.steps.length, live.told], [true, 2, 1]);
live.planWork = 3;
await chat.usePlan(live, turn, { action: 'done', step: 1, proof: 'the page opens and shows the frame' });
check('Closing a step uses up the work done for it', [entry.plan.steps[0].state, live.planWork], ['done', 0]);
check('The next step then needs work of its own', await chat.usePlan(live, turn, { action: 'done', step: 2, proof: 'the menu shows 18 items on the page' }), TEXT.idle(2));
check('A step closed with nothing for the app to see rests on the agent\'s word', [entry.plan.steps[0].by, entry.plan.steps[0].saw], ['word', []]);
await chat.usePlan(live, turn, { action: 'wait', reason: 'Which of the two menus to keep' });
check('Waiting is told at the end of the turn', turn.waits, 'Which of the two menus to keep');

// The answer after a plan finished in the turn, read once for its sources.
{
 const finished = P.apply(P.apply(open, { action: 'done', step: 1, proof: 'node a.js printed 1' }, ok).plan, { action: 'done', step: 2, proof: 'node b.js printed 2' }, ok).plan;
 const conv = { messages: [user('find sources'), reply({ plan: finished, content: 'See https://made.up/x' })] };
 c.PlanProof.begin(conv);
 c.PlanProof.note(conv, { kind: 'opened', url: 'https://real.test/a', text: 'page' });
 const t = { controller: new AbortController(), planned: true, parts: [{ entry: conv.messages[1] }] };
 const first = chat.proofAudit(conv, t, 'stop');
 check('An answer after a plan finished in the turn, with a link never opened, is sent back once', [first.includes('https://made.up/x'), chat.proofAudit(conv, t, 'stop')], [true, '']);
 check('Not when the plan was not touched in the turn, nor when the answer ran out of room', [chat.proofAudit(conv, { controller: new AbortController(), parts: t.parts }, 'stop'), chat.proofAudit(conv, { controller: new AbortController(), planned: true, parts: t.parts }, 'length')], ['', '']);
}

// The turn sent back to open steps.
const back = (messages, extra = {}) => {
 const t = { controller: new AbortController(), ...extra };
 const said = [chat.planBack({ messages }, t, 'stop'), chat.planBack({ messages }, t, 'stop'), chat.planBack({ messages }, t, 'stop')];
 return said.map(text => text ? 'back' : '');
};
check('A turn ending with open steps goes back to them twice, then ends', back([user('go'), reply({ plan: open })]), ['back', 'back', '']);
check('The note names the open steps', chat.planBack({ messages: [reply({ plan: open })] }, { controller: new AbortController() }, 'stop'), TOOL_NOTES.planBack('1. A; 2. B'));
check('Not when it is finished, waits for the user, ran out of room or was stopped', [
 back([reply({ plan: done })])[0], back([reply({ plan: asked })])[0],
 chat.planBack({ messages: [reply({ plan: open })] }, { controller: new AbortController() }, 'length'),
 (() => { const t = { controller: new AbortController() }; t.controller.abort(); return chat.planBack({ messages: [reply({ plan: open })] }, t, 'stop'); })(),
], ['', '', '', '']);
check('But again once the user answered what it waited for', back([reply({ plan: asked }), user('signed in'), reply()])[0], 'back');
// A task that took a good many steps with no plan: reminded once.
const nudge = (messages, extra) => chat.planNudge({ messages }, extra);
const worked = { work: PLAN.nudge };
check('A long task with no plan is reminded once', [nudge([user('make a site')], worked), nudge([user('make a site')], worked)], [TOOL_NOTES.planNudge, '']);
check('Not before enough work, nor with a plan made or open', [nudge([user('x')], { work: PLAN.nudge - 1 }), nudge([user('x')], { work: 9, planned: true }), nudge([reply({ plan: open })], { work: 9 })], ['', '', '']);
check('A finished plan of an earlier task does not stop it', nudge([reply({ plan: done }), user('now a new site')], { work: 9 }), TOOL_NOTES.planNudge);
check('The mini chat is never reminded', SideChat.prototype.planNudge.call(Object.create(SideChat.prototype), { messages: [] }, { work: 9 }), '');
check('The mini chat\'s agent keeps no plan', SideChat.prototype.toolSchemas.call(Object.create(SideChat.prototype)).map(tool => tool.function.name), ['read_file']);

const failed = results.filter(item => !item.pass);
for (const item of results) console.log(`${item.pass ? 'ok  ' : 'FAIL'} ${item.name}${item.pass ? '' : `\n     got      ${JSON.stringify(item.actual)}\n     expected ${JSON.stringify(item.expected)}`}`);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
