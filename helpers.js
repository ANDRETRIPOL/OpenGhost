(() => {
'use strict';

// The agent's helpers: other agents the chat's agent starts for parts of its task (spawn_agent), each working at the
// same time in the same folder, with the same model and the same tools, except those that speak for the chat itself
// (asking the user, the plan, the notepad, routines, memory, the record, pictures in the reply) and except starting
// helpers of their own. A helper starts knowing nothing but its task. Its steps are its own: they go to the model in a
// conversation of its own, never into the chat; what it changes is guarded like the files of any other agent at work
// in the folder (Desk), it works in a browser tab of its own, and what it asks to be allowed is asked in the chat's
// own card. Its last answer is its report, read by the chat's agent with wait_agent. The user sees the helpers in the
// island beside the plan's (helper-island.js), can write to one and can stop one.
//
// Only the chats with an island of helpers have them: the main window's chat and the second pane of Split View. The
// mini chat and the quick chat have no room for them, and their agents never get the tools.

const { Desk, TOOL_NOTES, assistantStep, imageStep, estimate, spend, sharedKinds, CONTEXT, COMPACT, compactRoom } = Chat.internals;

// most: helpers at work at once. wait: how long wait_agent waits by default, and at most, in seconds. log: the deeds of a
// helper kept to be shown. room: the share of the window a helper fills before it is asked to finish, and the share
// at which it is stopped. nudges: how often a turn that wants to end with helpers at work is sent back to wait.
// compact: the share of its model's window a helper's conversation fills before it is summed up, as a chat's is; full:
// the share at which a helper whose summary failed is asked to finish, cut: what one of its steps keeps in the summary.
const HELPERS = { most: 3, wait: 600, longest: 1800, log: 6, compact: 0.82, full: 0.94, nudges: 3, title: 40, cut: 2400 };
// Calm tones a helper's ghost is drawn in, one each, in the order they start.
const TONES = ['120, 178, 255', '186, 150, 255', '110, 214, 168', '240, 188, 110'];
const OWN = new Set(['spawn_agent', 'wait_agent', 'send_message', 'interrupt_agent', 'list_agents']);
const KEPT = new Set([...OWN, 'ask_user', 'plan', 'notepad', 'routine', 'memory', 'record', 'show_pictures']);

const NOTE = {
 role: (task, title) => `This message comes from the app, not from the user. You are a helper of the main agent of this chat: it gave you one part of the user's task, named “${title}”, and works on other parts meanwhile, as other helpers may. Everyone works in the same folder at the same time, so change only the files your part needs, and leave the others' files to them. You cannot ask the user anything and nobody sees your work while you do it: when something only the user can decide comes up, take the safest reasonable choice, or stop there, and say so in your report. Check your work as the instructions say before you call it done. When you are done, end your turn with your report to the main agent: what you did, which files you changed, how you checked it and what you saw, and what is left or uncertain. Short and plain. Your report goes to the main agent, not to the user.\n\nYour part of the task:\n${task}`,
 fromAgent: text => `A message from the main agent:\n${text}`,
 fromUser: text => `This message comes from the app: the user wrote to you directly, in the window where they watch the helpers. Take it into account from now on:\n${text}`,
 finish: 'This note comes from the app: your conversation is nearly as long as this model can hold. Finish now: end your turn with your report of what is done and what is left.',
 still: list => `This note comes from the app, not from the user: your helpers are still at work: ${list}. Wait for them with wait_agent and look at their work before you end your turn, or stop the ones you no longer need with interrupt_agent.`,
 unread: list => `This note comes from the app, not from the user: these helpers have finished and you have not read their reports yet: ${list}. Read them with wait_agent before you end your turn.`,
 ultra: 'This note comes from the app, not from the user: the user chose the highest effort, Ultra. Hand work out to helpers whenever parts of the task can go on at the same time, or whenever a helper would make the result better: this is what Ultra is for. A small or single-file task still stays with you.',
 notUltra: 'This note comes from the app, not from the user: the effort is no longer Ultra. Decide about helpers as the instructions say.',
};

const words = text => String(text || '').replace(/\s+/g, ' ').trim();
const short = (text, most) => { const one = words(text); return one.length > most ? `${one.slice(0, most - 1)}…` : one; };
const seconds = ms => Math.round(ms / 1000);
const changed = conv => window.dispatchEvent(new CustomEvent('helpers-change', { detail: { conv } }));

// The helpers of a chat, in the order they started.
const listOf = conv => conv?.helpers ? [...conv.helpers.values()] : [];
const working = conv => listOf(conv).filter(helper => helper.state === 'working');

// A helper's name as the agent writes it may differ in case and spaces from how it was started.
function find(conv, name) {
 const key = words(name).toLowerCase();
 return listOf(conv).find(helper => helper.title.toLowerCase() === key || helper.id === key) || null;
}

function wake(conv) {
 const pulse = conv.helperPulse;
 conv.helperPulse = null;
 pulse?.resolve();
 changed(conv);
}

function pulseOf(conv) {
 if (!conv.helperPulse) {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  conv.helperPulse = { promise, resolve };
 }
 return conv.helperPulse.promise;
}

function line(helper) {
 const now = helper.deed ? `${helper.deed.verb}${helper.deed.what ? ` ${helper.deed.what}` : ''}` : '';
 const time = `${seconds((helper.ended || Date.now()) - helper.started)} s`;
 if (helper.state === 'working') return `- “${helper.title}”: at work for ${time}${now ? `, now: ${now}` : ''}${helper.files.size ? `; files it changed: ${[...helper.files].slice(-8).join(', ')}` : ''}.`;
 return `- “${helper.title}”: ${helper.state === 'done' ? 'done' : helper.state === 'stopped' ? 'stopped' : 'failed'} after ${time}.`;
}

function report(helper) {
 helper.reported = true;
 const head = helper.state === 'done' ? `Helper “${helper.title}” finished. Its report:` : helper.state === 'stopped' ? `Helper “${helper.title}” was stopped${helper.stoppedBy === 'user' ? ' by the user' : ''} before it finished.${helper.final ? ' What it said last:' : ''}` : `Helper “${helper.title}” could not go on: ${helper.error || 'its model failed'}.${helper.final ? ' What it said last:' : ''}`;
 const files = helper.files.size ? `\nFiles it changed: ${[...helper.files].join(', ')}.` : '';
 return `${head}${helper.final ? `\n${helper.final.trim()}` : ''}${files}`;
}

const proto = Chat.prototype;

// The tools of a chat: a chat with no island of helpers never gets theirs.
const schemas = proto.toolSchemas;
proto.toolSchemas = function toolSchemas() {
 const all = schemas.call(this);
 return this.helpersOn ? all : all.filter(tool => !OWN.has(tool.function.name));
};

const useTool = proto.useTool;
proto.useTool = function (conv, turn, view, call) {
 const name = call.function.name;
 if (!OWN.has(name)) return useTool.call(this, conv, turn, view, call);
 let args;
 try {
  args = JSON.parse(call.function.arguments || '{}') || {};
 } catch {
  return `Error: the arguments are not valid JSON: ${String(call.function.arguments).slice(0, 300)}. Call the tool again with valid JSON.`;
 }
 if (!this.helpersOn || conv.helperOf) return 'Error: helpers are not available here.';
 // What the step does, in the line beside the agent's ghost, as for its other steps (agent-line.js).
 const deed = AgentLine.deed(name, args, this.cwd(conv));
 if (deed && view) {
  this.showGhost(turn.next || view);
  AgentLine.show((turn.next || view).status, deed);
 }
 if (name === 'spawn_agent') return this.spawnHelper(conv, turn, args);
 if (name === 'wait_agent') return this.waitHelpers(conv, turn, args);
 if (name === 'send_message') return this.messageHelper(conv, turn, args);
 if (name === 'interrupt_agent') return this.interruptHelper(conv, args);
 return this.listHelpers(conv);
};

proto.spawnHelper = function (conv, turn, args) {
 const title = short(args.task_name || args.title, HELPERS.title), task = String(args.message || '').trim();
 if (!title || !task) return 'Error: spawn_agent needs task_name (a short name of the part, in the user\'s language) and message (the whole task for the helper).';
 if (working(conv).length >= HELPERS.most) return `Error: ${HELPERS.most} helpers are at work already, the most there can be at once: ${working(conv).map(helper => `“${helper.title}”`).join(', ')}. Wait for one to finish (wait_agent), or do this part yourself.`;
 if (find(conv, title)) return `Error: there is a helper named “${title}” already. Give this one another name, or send that one more work with send_message.`;
 conv.helpers ||= new Map();
 const id = `h${conv.helpers.size + 1}`;
 const helperConv = new (Object.getPrototypeOf(conv).constructor)(conv.record);
 Object.assign(helperConv, { helperOf: conv, brief: conv.brief, pad: null, model: conv.model, effort: conv.effort, speed: conv.speed, mode: conv.mode });
 const helper = {
  id, title, task, conv: helperConv, tone: TONES[(conv.helpers.size) % TONES.length], state: 'working', started: Date.now(), ended: 0,
  deed: null, log: [], files: new Set(), final: '', error: '', reported: false, stoppedBy: '', inbox: [], messages: [{ role: 'user', content: NOTE.role(task, title) }], warned: false,
 };
 helperConv.helper = helper;
 conv.helpers.set(id, helper);
 // The chat's Stop stops its helpers too.
 turn.controller.signal.addEventListener('abort', () => this.stopHelper(conv, helper, 'stop'), { once: true });
 this.runHelper(conv, helper, turn.config);
 changed(conv);
 return `Helper “${title}” started. It works on its own, at the same time as you, in the same folder; the user sees it at work. Do your own part meanwhile (not its part), then read its report with wait_agent.`;
};

// A helper's turn: its own requests and steps, until it answers without a step. Never thrown out of: what went wrong
// is its report.
proto.runHelper = async function (parent, helper, config) {
 const conv = helper.conv, controller = new AbortController();
 helper.controller = controller;
 helper.state = 'working';
 helper.ended = 0;
 const panel = this.browserOf(parent);
 conv.turn = { id: `${parent.turn?.id || 'x'}-${helper.id}`, controller, config, browser: panel, part: null, parts: [], next: null, queue: [], pills: [], approvals: new Set(), tool: '', retryBudget: { used: 0 } };
 Desk.enter(conv, this);
 const room = this.settings.windowOf(config.id) || 128000;
 const tools = this.agent(conv) ? AgentTools.schemas.filter(tool => !KEPT.has(tool.function.name)) : null;
 try {
  for (;;) {
   controller.signal.throwIfAborted();
   const system = (await this.system(conv)).map(content => ({ role: 'system', content }));
   if (this.agent(conv)) await Desk.refresh().catch(() => {});
   const messages = [...system, ...helper.messages];
   const notes = this.notes(conv, messages);
   messages.push(...notes);
   let result;
   try {
    result = await Providers.stream(config, { messages, tools, signal: controller.signal, session: `${this.session(parent)}-${helper.id}`, retryBudget: conv.turn.retryBudget });
   } catch (error) {
    if (error?.name === 'AbortError' || controller.signal.aborted) throw error;
    helper.messages.push(...notes);
    const again = await Providers.retry(config, error, { signal: controller.signal, retryBudget: conv.turn.retryBudget }).catch(() => false);
    if (!again) throw error;
    helper.messages.push({ role: 'user', content: TOOL_NOTES.reconnect });
    continue;
   }
   const step = assistantStep(result);
   helper.messages.push(...notes, step);
   const entry = parent.turn?.part?.entry;
   if (entry) spend(entry, result.usage);
   if (typeof result.content === 'string' && result.content.trim()) helper.final = result.content;
   const calls = step.tool_calls || [];
   if (!calls.length) {
    if (helper.inbox.length) { helper.messages.push(...helper.inbox.splice(0)); continue; }
    helper.state = 'done';
    break;
   }
   const images = [];
   for (const call of calls) {
    const result = controller.signal.aborted ? TOOL_NOTES.cancelled : await this.helperTool(parent, helper, call);
    const output = typeof result === 'string' ? result : result.text;
    helper.messages.push({ role: 'tool', tool_call_id: call.id, content: output });
    if (result.images?.length) images.push(...result.images);
   }
   if (images.length) helper.messages.push(imageStep(images));
   if (helper.inbox.length) helper.messages.push(...helper.inbox.splice(0));
   // Near the end of its model's window a helper's conversation is summed up, as a chat's is, and it goes on from the
   // summary. Should the summary fail, it is asked to finish, and stopped at the very end.
   const used = estimate(helper.messages);
   if (used > room * HELPERS.compact && !helper.warned) {
    if (await this.compactHelper(parent, helper, config).catch(error => { if (error?.name === 'AbortError') throw error; return false; })) continue;
    helper.warned = true;
    helper.messages.push({ role: 'user', content: NOTE.finish });
   }
   if (used > room * HELPERS.full) { helper.error = 'its conversation grew longer than its model can hold'; helper.state = 'failed'; break; }
  }
 } catch (error) {
  if (error?.name === 'AbortError' || controller.signal.aborted) helper.state = 'stopped';
  else { helper.state = 'failed'; helper.error = words(error?.message || String(error)).slice(0, 300); }
 } finally {
  for (const pending of conv.turn.approvals) pending.card.settle('deny');
  conv.turn.browser?.drive(conv, false);
  conv.turn = null;
  Desk.leave(conv);
  helper.ended = Date.now();
  helper.deed = null;
  wake(parent);
 }
};

// A step of a helper: the tools of the chat's agent, run the same way, for this helper's own conversation.
proto.helperTool = async function (parent, helper, call) {
 const conv = helper.conv, turn = conv.turn, name = call.function.name, cwd = this.cwd(conv);
 let args;
 try {
  args = JSON.parse(call.function.arguments || '{}') || {};
 } catch {
  return `Error: the arguments are not valid JSON: ${String(call.function.arguments).slice(0, 300)}. Call the tool again with valid JSON.`;
 }
 if (KEPT.has(name)) return `Error: a helper cannot use ${name}. Say what you need in your report instead.`;
 if (name === 'write_file' || name === 'edit_file') {
  const path = AgentTools.place(cwd, args.path), held = path && Desk.holder(conv, path);
  if (held) {
   const task = held.chat.taskOf(held.conv);
   return `Error: ${this.peerName(conv, held)} is changing ${args.path} right now${task ? `, as part of its own task (“${short(task, 120)}”)` : ''}. Leave this file to it: do another part of your work first, or wait until it is done and read the file again before you change it.`;
  }
  if (path) { Desk.claim(conv, path, String(args.path)); helper.files.add(String(args.path)); }
 }
 const shared = name === AgentTools.shell || name === 'git' ? sharedKinds(name, args) : null;
 const refused = shared && this.sharedRefusal(conv, cwd, shared);
 if (refused) return refused;
 const panel = this.browserOf(parent), apart = conv;
 let asks = AgentTools.needsApproval(name, args, { mode: this.modeOf(parent), cwd, attached: this.attachedFiles(parent), apart, panel });
 if (asks && this.modeOf(parent) === 'ask') {
  const rule = AgentTools.approvalRule?.(name, args, { cwd, apart, panel });
  if (rule && this.library.permissions) asks = !(await this.library.permissions(parent.id).catch(() => [])).includes(rule.key);
 }
 if (asks) {
  const host = parent.turn;
  if (!host) return TOOL_NOTES.cancelled;
  helper.asking = true;
  changed(parent);
  const answer = await this.approve(parent, host, host.part.view, { name, args, cwd, apart, panel, helper: helper.title });
  helper.asking = false;
  changed(parent);
  if (answer !== 'allow') return answer === 'deny' ? TOOL_NOTES.declined : answer;
 }
 if (turn.controller.signal.aborted) return TOOL_NOTES.cancelled;
 // A command says what it does in the agent's own plain words (its description), not as the command itself.
 const said = name === AgentTools.shell && typeof args.description === 'string' ? args.description.replace(/s+/g, ' ').trim() : '';
 const deed = said ? { verb: said, what: '' } : AgentLine.deed(name, args, cwd, apart);
 if (deed) {
  helper.deed = deed;
  helper.log.push({ ...deed, at: Date.now() });
  if (helper.log.length > HELPERS.log) helper.log.shift();
  changed(parent);
 }
 const id = turn.tool = `${parent.id}-${helper.id}-${++this.tools}`;
 const stopped = new Promise(resolve => turn.controller.signal.addEventListener('abort', () => resolve(TOOL_NOTES.cancelled), { once: true }));
 const browser = name.startsWith('browser_') ? panel : null;
 if (browser) {
  browser.chats?.add(conv);
  browser.drive(conv, true, true);
 }
 try {
  if (shared) return await this.runShared(conv, turn, { el: document.createElement('div'), content: document.createElement('div'), status: null }, { name, args, id, cwd, apart: browser ? conv : null, shared, stopped });
  const done = await Promise.race([AgentTools.run(name, args, { id, cwd, apart: browser ? conv : null, panel: browser }), stopped]);
  return done;
 } catch (error) {
  return `Error: ${error.message}`;
 } finally {
  turn.tool = '';
 }
};

// A helper's conversation summed up, the way a chat's is (chat.js compact), with the same words for the model: its steps
// go as text, the summary takes their place after its task, and it goes on. The user's compaction of the chat leaves
// helpers alone; what a summary cost is counted in the chat's reply, as all a helper spends.
const plain = content => typeof content === 'string' ? content : (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');
const cut = (text, most) => text.length > most ? `${text.slice(0, most)} […]` : text;
function helperTranscript(messages) {
 const out = [];
 for (const message of messages.slice(1)) {
  if (message.role === 'user') out.push(`Main agent or app: ${cut(plain(message.content), COMPACT.text)}`);
  else if (message.role === 'tool') out.push(`[Result] ${cut(plain(message.content), HELPERS.cut)}`);
  else if (message.role === 'assistant') {
   if (message.content) out.push(`Helper: ${cut(plain(message.content), COMPACT.text)}`);
   for (const call of message.tool_calls || []) out.push(`[Tool ${call.function.name}] ${cut(call.function.arguments || '', HELPERS.cut)}`);
  }
 }
 const text = out.join('\n\n');
 return text.length > COMPACT.total ? `${text.slice(0, COMPACT.total / 4)}

[… middle left out …]

${text.slice(-COMPACT.total * 3 / 4)}` : text;
}

proto.compactHelper = async function (parent, helper, config) {
 const was = helper.deed;
 helper.deed = { verb: I18n.t('helpers.compacting'), what: '' };
 changed(parent);
 let cost = null;
 try {
  const summary = await Providers.complete(config, {
   messages: [{ role: 'system', content: COMPACT.prompt }, { role: 'user', content: `${helper.messages[0].content}

${helperTranscript(helper.messages)}` }],
   maxTokens: compactRoom(config),
   signal: helper.controller.signal,
   waited: true,
   onUsage: usage => { cost = usage; },
  });
  if (!summary) return false;
  helper.messages = [helper.messages[0], { role: 'user', content: `${COMPACT.head}

${summary}

${COMPACT.resume}` }];
  helper.compacted = (helper.compacted || 0) + 1;
  return true;
 } finally {
  const entry = parent.turn?.part?.entry;
  if (entry && cost) spend(entry, cost);
  helper.deed = was;
  changed(parent);
 }
};

proto.stopHelper = function (conv, helper, by = 'agent') {
 if (helper.state !== 'working') return false;
 helper.stoppedBy = by;
 helper.controller?.abort();
 return true;
};

// Waits until a helper finishes, the user writes, the chat is stopped, or the time is up; then tells what is new.
proto.waitHelpers = async function (conv, turn, args) {
 const fresh = () => listOf(conv).filter(helper => helper.state !== 'working' && !helper.reported);
 if (!fresh().length && !working(conv).length) return listOf(conv).length ? 'All your helpers have finished and you have read their reports.' : 'You have no helpers.';
 const limit = Math.min(HELPERS.longest, Math.max(5, Number(args.timeout_seconds) || HELPERS.wait)) * 1000;
 let why = '';
 if (!fresh().length) {
  let timer = 0;
  why = await new Promise(resolve => {
   timer = setTimeout(() => resolve('time'), limit);
   turn.release = resolve;
   pulseOf(conv).then(() => resolve('helper'));
   turn.controller.signal.addEventListener('abort', () => resolve('abort'), { once: true });
  });
  clearTimeout(timer);
  turn.release = null;
 }
 if (why === 'abort' || turn.controller.signal.aborted) return TOOL_NOTES.cancelled;
 const out = fresh().map(report);
 const still = working(conv);
 if (still.length) out.push(`Still at work:\n${still.map(line).join('\n')}`);
 if (why === 'message') out.push(TOOL_NOTES.message);
 else if (why === 'time' && !out.length) out.push(`No helper finished in ${seconds(limit)} s.`);
 return out.join('\n\n');
};

// More work for a helper: told at its next step while it works, a turn of its own when it has finished.
proto.messageHelper = function (conv, turn, args) {
 const helper = find(conv, args.target || args.task_name), text = String(args.message || '').trim();
 if (!helper) return `Error: no helper is named “${words(args.target)}”. Your helpers: ${listOf(conv).map(item => `“${item.title}”`).join(', ') || 'none'}.`;
 if (!text) return 'Error: the message is empty.';
 if (helper.state === 'working') {
  helper.inbox.push({ role: 'user', content: NOTE.fromAgent(text) });
  return `Sent: “${helper.title}” reads it after its current step.`;
 }
 if (working(conv).length >= HELPERS.most) return `Error: ${HELPERS.most} helpers are at work already. Wait for one to finish first.`;
 helper.messages.push({ role: 'user', content: NOTE.fromAgent(text) });
 helper.final = '';
 helper.reported = false;
 helper.error = '';
 helper.stoppedBy = '';
 helper.started = Date.now();
 turn.controller.signal.addEventListener('abort', () => this.stopHelper(conv, helper, 'stop'), { once: true });
 this.runHelper(conv, helper, turn.config);
 changed(conv);
 return `“${helper.title}” is at work again on your message. Read its report with wait_agent.`;
};

proto.interruptHelper = function (conv, args) {
 const helper = find(conv, args.target || args.task_name);
 if (!helper) return `Error: no helper is named “${words(args.target)}”.`;
 if (!this.stopHelper(conv, helper, 'agent')) return `“${helper.title}” is not at work.`;
 return `“${helper.title}” is stopped. Its files stay as they are; read what it said with wait_agent.`;
};

proto.listHelpers = function (conv) {
 return listOf(conv).length ? listOf(conv).map(line).join('\n') : 'You have no helpers.';
};

// The user writes to a helper, or stops it, from the island.
proto.tellHelper = function (conv, id, text) {
 const helper = conv?.helpers?.get(id), said = String(text || '').trim();
 if (!helper || !said || helper.state !== 'working') return false;
 helper.inbox.push({ role: 'user', content: NOTE.fromUser(said) });
 helper.told = (helper.told || 0) + 1;
 changed(conv);
 return true;
};

proto.haltHelper = function (conv, id) {
 const helper = conv?.helpers?.get(id);
 return !!helper && this.stopHelper(conv, helper, 'user');
};

proto.helpersOf = function (conv) {
 return listOf(conv);
};

// A turn that would end while its helpers work, or with their reports unread, is sent back to them.
const planBack = proto.planBack;
proto.planBack = function (conv, turn, finish) {
 const back = planBack.call(this, conv, turn, finish);
 if (back || !conv.helpers || conv.helperOf) return back;
 const still = working(conv), unread = listOf(conv).filter(helper => helper.state !== 'working' && !helper.reported);
 if (!still.length && !unread.length) return '';
 turn.helperNudges = (turn.helperNudges || 0) + 1;
 if (turn.helperNudges > HELPERS.nudges) { for (const helper of still) this.stopHelper(conv, helper, 'end'); return ''; }
 return still.length ? NOTE.still(still.map(helper => `“${helper.title}”`).join(', ')) : NOTE.unread(unread.map(helper => `“${helper.title}”`).join(', '));
};

// When the chat's turn ends, however it ends, its helpers end with it.
const end = proto.end;
proto.end = function (conv, turn, error, finish) {
 for (const helper of working(conv)) this.stopHelper(conv, helper, 'end');
 const out = end.call(this, conv, turn, error, finish);
 changed(conv);
 return out;
};

// A new message of the user starts afresh: the helpers of the turn before are gone from the island.
const run = proto.run;
proto.run = function (conv, prompt, config, bubble) {
 if (conv.helpers && !working(conv).length) { conv.helpers = null; changed(conv); }
 return run.call(this, conv, prompt, config, bubble);
};

// A helper works in a tab of its own, always.
const seat = proto.seat;
proto.seat = function (conv) {
 return conv?.helperOf ? conv : seat.call(this, conv);
};

// How a helper and the agents around it are named to one another.
const peerName = proto.peerName;
proto.peerName = function (conv, peer) {
 const other = peer.conv;
 if (other?.helper) return conv === other.helperOf ? `your helper “${other.helper.title}”` : `the helper “${other.helper.title}” of the main agent of this chat`;
 if (conv?.helperOf && other === conv.helperOf) return 'the main agent of this chat, the one that gave you your task';
 return peerName.call(this, conv, peer);
};

// What a helper is doing, as other agents are told of it: its own part of the task, not the whole note it began with.
const taskOf = proto.taskOf;
proto.taskOf = function (conv) {
 return conv?.helper ? conv.helper.title : taskOf.call(this, conv);
};

// On Ultra the agent is told to hand work out; off it again, that it no longer has to. Told as a note, so the system
// prompt stays the same in every chat (see notes in chat.js).
const notes = proto.notes;
proto.notes = function (conv, messages) {
 const out = notes.call(this, conv, messages);
 if (!this.helpersOn || conv?.helperOf || !this.agent(conv)) return out;
 const ultra = this.config(conv).effort === 'ultra';
 const lastOn = messages.findLastIndex(message => message.role === 'user' && message.content === NOTE.ultra);
 const lastOff = messages.findLastIndex(message => message.role === 'user' && message.content === NOTE.notUltra);
 if (ultra && lastOn <= lastOff) out.push({ role: 'user', content: NOTE.ultra });
 else if (!ultra && lastOn > lastOff) out.push({ role: 'user', content: NOTE.notUltra });
 return out;
};

Chat.HELPERS = HELPERS;
window.Helpers = { HELPERS, TONES, listOf, working };
})();
