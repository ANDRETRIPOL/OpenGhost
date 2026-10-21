(() => {
'use strict';

// The agent's plan for a task of several parts (the plan tool), shown to the user at the top of the chat (plan-island.js).
// It lives in the chat itself: every change of it is kept on the reply it was made in (`entry.plan` in chat.js), so a
// chat's plan is the latest one there. It comes back with the chat, is sealed with it, goes into a fork made after it,
// and outlives every summary.
//
// A step is closed only with proof, and the app checks what it can see of it: that something was done since the last
// step was closed, and that the last check the agent ran (tests, a build, a linter) did not fail. A turn that ends while
// steps are open is sent back to them (chat.js), and closing the last step asks for the whole request to be checked.
const PLAN = {
 // Steps in a new plan, and in a plan at most, with the steps added along the way.
 steps: [2, 10],
 most: 14,
 // A step is a name the user reads at the top of the chat; a proof is a line under it.
 words: 90,
 proof: [12, 400],
 // How many times one turn is sent back to open steps.
 returns: 2,
 // After this many steps of work in one turn without a plan, the agent is reminded that a task of parts gets one.
 nudge: 6,
 // What a check is: a command whose failure means the work is not done.
 check: /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|lint|check|typecheck|type-check)\b|\bnpx\s+(tsc|eslint|jest|vitest|playwright|mocha|ava)\b|\b(jest|vitest|pytest|tox|nox|mypy|ruff|flake8|pylint|eslint|tsc|phpunit|rspec|mocha)\b|\bpython3?\s+-m\s+(pytest|unittest|mypy|ruff|py_compile|compileall)\b|\bnode\s+--(check|test)\b|\b(cargo|go|dotnet|swift|mix)\s+(test|build|check|vet)\b|\b(gradlew?|mvn)\s+\S*(test|build|check|verify)\b|\bmake(\s+(test|check|all))?\s*($|[;&|\n])/im,
 // Tools that do no step's work themselves. The user's answer to a question is a step's work: it may be what a step
 // waited for.
 idle: new Set(['plan', 'record', 'memory', 'notepad', 'routine', 'skill']),
 // What says nothing of what was seen.
 hollow: /^(it\s+)?(is\s+)?(done|ok(ay)?|finished|complete(d)?|works?|working|fine|ready|yes|готово|сделано|выполнено|работает|всё работает|fatto|finito|fait|terminé|ça marche)[.!]*$/i,
 head: 'The plan now:',
};

const TEXT = {
 action: 'Error: action must be start, done, drop, add or wait.',
 none: 'Error: there is no plan yet. Make one with action start.',
 count: ([least, most]) => `Error: a plan has ${least} to ${most} steps. A task that small needs no plan; a bigger one gets its steps grouped, each a result the user can see.`,
 most: most => `Error: a plan holds ${most} steps at most. Put several small steps together into one.`,
 empty: 'Error: a step needs a name.',
 long: n => `Error: step ${n} is too long. Name it in a few words, as the user will see it at the top of the chat; what it takes goes in your work, not in its name.`,
 replace: list => `Error: the plan still has open steps: ${list}. Close or drop them first, or give the reason this new plan replaces them (the user's new request, say): their open steps are then dropped for it.`,
 step: n => `Error: there is no step ${n}. The steps are numbered from 1 in the plan as it stands.`,
 closed: n => `Error: step ${n} is closed already.`,
 proof: 'Error: give the proof: what showed this step works, as you saw it — the command and what it printed, the page you opened and what it shows, the file you read back. Intentions and "should work" are not proof.',
 idle: n => `Error: nothing has been done since the plan last changed, so nothing shows that step ${n} works. If the work you did before covers it, check it now (run it, open it, read it back), then close the step with what you saw.`,
 failed: (command, code) => `Error: your last check failed: “${command}” ended with exit code ${code}. A step is done once its check passes: fix what failed and run it again, or leave the step open.`,
 reason: 'Error: give the reason, in a sentence the user would accept.',
 started: 'The plan is set, and the user sees it at the top of the chat. Work the steps in order; close each with done and its proof as soon as you have seen it work.',
 closedStep: n => `Step ${n} is closed.`,
 last: 'That was the last step. Before your final answer, read the user\'s request once more and go through it part by part: for each thing they asked for, name what showed it is done. Whatever nothing showed, do now, or add it to the plan, or say plainly in the answer that it is not done.',
 dropped: n => `Step ${n} is dropped. Tell the user in your reply that you dropped it and why.`,
 added: 'Added.',
 waits: 'The user is told that you wait for them. Ask for what you need in your reply, in a sentence or two, and end the reply there.',
};

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const open = plan => plan ? plan.steps.filter(step => step.state === 'open') : [];
const numbered = (plan, steps) => steps.map(step => `${plan.steps.indexOf(step) + 1}. ${step.text}`).join('; ');

const AgentPlan = {
 PLAN,
 TEXT,

 open,

 // All steps closed, done or dropped.
 finished(plan) {
  return !!plan && plan.steps.length > 0 && !open(plan).length;
 },

 // The step under way: the first one still open.
 current(plan) {
  return open(plan)[0] || null;
 },

 // How many steps count, and how many of them are done: a dropped step counts neither way.
 tally(plan) {
  const kept = plan ? plan.steps.filter(step => step.state !== 'dropped') : [];
  return { done: kept.filter(step => step.state === 'done').length, total: kept.length };
 },

 // The plan as the agent reads it, a line a step.
 lines(plan) {
  const now = AgentPlan.current(plan);
  return plan.steps.map((step, k) => {
   const n = `${k + 1}. ${step.text}`;
   if (step.state === 'done') return `✓ ${n} — ${step.proof}`;
   if (step.state === 'dropped') return `✗ ${n} — dropped: ${step.reason}`;
   return step === now ? `→ ${n} (under way)` : `○ ${n}`;
  }).join('\n');
 },

 // What a tool result says of the plan: the plan as it stood after the call, or '' when it says nothing of it.
 seen(content) {
  const text = typeof content === 'string' ? content : '';
  const at = text.lastIndexOf(`\n${PLAN.head}\n`);
  return at < 0 ? '' : text.slice(at + PLAN.head.length + 2);
 },

 // What a finished tool call tells of the work, kept on the conversation: how many calls did something since the plan
 // last changed, and the last check run with how it ended. True when the call did a step's work.
 saw(conv, { name, shell, args, output, worked }) {
  if (PLAN.idle.has(name) || !worked) return false;
  conv.planWork = (conv.planWork || 0) + 1;
  if (!shell) return true;
  let command = '';
  try { command = String(JSON.parse(args || '{}').command || ''); } catch {}
  if (!PLAN.check.test(command)) return true;
  const code = /^Exit code (-?\d+)/.exec(typeof output === 'string' ? output : '')?.[1];
  conv.planCheck = { command: clean(command).slice(0, 120), code: code === undefined ? null : Number(code) };
  return true;
 },

 // One call of the plan tool. Gives the plan as it stands after it, or null when the call changed nothing, and the
 // words the agent is answered with.
 apply(plan, args, { work = 0, check = null } = {}) {
  const action = String(args?.action || '');
  const reply = (next, text) => ({ plan: next, text: next ? `${text}\n\n${PLAN.head}\n${AgentPlan.lines(next)}` : text });
  const refuse = text => ({ plan: null, text });
  const names = list => {
   const steps = (Array.isArray(list) ? list : typeof list === 'string' ? list.split('\n') : []).map(clean).filter(Boolean);
   const long = steps.findIndex(text => text.length > PLAN.words);
   return { steps, long };
  };
  // Any change of the plan means the agent is at it again: what it waited for is over.
  const copy = () => ({ ...plan, steps: plan.steps.map(step => ({ ...step })), wait: '' });
  const pick = next => {
   const n = Number(args.step);
   if (!Number.isInteger(n) || n < 1 || n > next.steps.length) return { error: TEXT.step(args.step ?? '') };
   if (next.steps[n - 1].state !== 'open') return { error: TEXT.closed(n) };
   return { n, step: next.steps[n - 1] };
  };
  if (action === 'start') {
   const { steps, long } = names(args.steps);
   if (steps.length < PLAN.steps[0] || steps.length > PLAN.steps[1]) return refuse(TEXT.count(PLAN.steps));
   if (long >= 0) return refuse(TEXT.long(long + 1));
   const left = open(plan), reason = clean(args.reason);
   if (left.length && !reason) return refuse(TEXT.replace(numbered(plan, left)));
   return reply({ id: `p${Date.now().toString(36)}`, made: Date.now(), steps: steps.map(text => ({ text, state: 'open' })), wait: '' }, TEXT.started);
  }
  if (!['done', 'drop', 'add', 'wait'].includes(action)) return refuse(TEXT.action);
  if (!plan) return refuse(TEXT.none);
  const next = copy();
  if (action === 'done') {
   const { n, step, error } = pick(next);
   if (error) return refuse(error);
   const proof = clean(args.proof);
   if (proof.length < PLAN.proof[0] || PLAN.hollow.test(proof)) return refuse(TEXT.proof);
   if (!work) return refuse(TEXT.idle(n));
   if (check && check.code !== null && check.code !== 0) return refuse(TEXT.failed(check.command, check.code));
   Object.assign(step, { state: 'done', proof: proof.slice(0, PLAN.proof[1]) });
   return reply(next, AgentPlan.finished(next) ? `${TEXT.closedStep(n)} ${TEXT.last}` : TEXT.closedStep(n));
  }
  if (action === 'drop') {
   const { n, step, error } = pick(next);
   if (error) return refuse(error);
   const reason = clean(args.reason);
   if (!reason) return refuse(TEXT.reason);
   Object.assign(step, { state: 'dropped', reason: reason.slice(0, PLAN.proof[1]) });
   return reply(next, AgentPlan.finished(next) ? `${TEXT.dropped(n)} ${TEXT.last}` : TEXT.dropped(n));
  }
  if (action === 'add') {
   const { steps, long } = names(args.steps);
   if (!steps.length) return refuse(TEXT.empty);
   if (long >= 0) return refuse(TEXT.long(next.steps.length + long + 1));
   if (next.steps.length + steps.length > PLAN.most) return refuse(TEXT.most(PLAN.most));
   const after = Number(args.after), at = Number.isInteger(after) && after >= 0 && after <= next.steps.length ? after : next.steps.length;
   next.steps.splice(at, 0, ...steps.map(text => ({ text, state: 'open' })));
   return reply(next, TEXT.added);
  }
  const reason = clean(args.reason);
  if (!reason) return refuse(TEXT.reason);
  next.wait = reason.slice(0, PLAN.proof[1]);
  return reply(next, TEXT.waits);
 },
};

window.AgentPlan = AgentPlan;
})();
