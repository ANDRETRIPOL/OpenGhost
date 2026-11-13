(() => {
'use strict';

// The agent's helpers: other agents the chat's agent starts for parts of its task (spawn_agent), each working at the
// same time in the same folder, with the same model and the same tools, except those that speak for the chat itself
// (asking the user, the plan, the notepad, routines, memory, the record, pictures in the reply) and except starting
// helpers of their own. A helper starts knowing nothing but its task. Its steps are its own: they go to the model in a
// conversation of its own, never into the chat; what it changes is guarded like the files of any other agent at work
// in the folder (Desk), it works in a browser tab of its own, and what it asks to be allowed is asked in the chat's
// own card. Its last answer is its report. The user sees the helpers in the island beside the plan's
// (helper-island.js), can write to one and can stop one.
//
// Helpers work in the background, as long as their work takes: the chat's own turn may end while they go on, and the
// user talks to the chat's agent meanwhile as at any other time. Their reports reach the agent by themselves: in a
// note at its next step, in the answer to wait_agent when it waits for them, and, when its turn has ended, in a turn
// the app starts for it once they have all finished. Only the user stops them all: End stops the chat's agent and its
// helpers together. A helper that was stopped, or was at work when the app closed, keeps its conversation, kept on
// the disk with the chat: the agent sends it on from where it stopped (send_message) once the user wants the work to
// go on.
//
// Only the chats with an island of helpers have them: the main window's chat and the second pane of Split View. The
// mini chat and the quick chat have no room for them, and their agents never get the tools.

const { Desk, TOOL_NOTES, assistantStep, imageStep, estimate, spend, sharedKinds, CONTEXT, COMPACT, compactRoom } = Chat.internals;

// most: helpers at work at once. wait: how long wait_agent waits by default, and at most, in seconds. log: the deeds of a
// helper kept to be shown. compact: the share of its model's window a helper's conversation fills before it is summed
// up, as a chat's is; full: the share at which a helper whose summary failed is asked to finish, cut: what one of its
// steps keeps in the summary. save: how long after a change the helpers are written to the disk, in ms.
const HELPERS = { most: 3, wait: 600, longest: 1800, log: 6, compact: 0.82, full: 0.94, title: 40, cut: 2400, save: 800, think: 2500 };
// Calm tones a helper's ghost is drawn in, one each, in the order they start.
const TONES = ['120, 178, 255', '186, 150, 255', '110, 214, 168', '240, 188, 110'];
const OWN = new Set(['spawn_agent', 'wait_agent', 'send_message', 'interrupt_agent', 'list_agents']);
const KEPT = new Set([...OWN, 'ask_user', 'plan', 'notepad', 'routine', 'memory', 'record', 'show_pictures']);
// Who stopped a helper: the user (End, or its Stop in the island), the agent (interrupt_agent), or the app closing.
// Only a helper that finished by itself, or that the agent stopped, starts a turn of the agent's: one the user stopped
// waits for the user's next word.
const BY_USER = new Set(['user', 'restart']);

const NOTE = {
 role: (task, title) => `This message comes from the app, not from the user. You are a helper of the main agent of this chat: it gave you one part of the user's task, named “${title}”, and works on other parts meanwhile, as other helpers may. Everyone works in the same folder at the same time, so change only the files your part needs, and leave the others' files to them. You cannot ask the user anything and nobody sees your work while you do it: when something only the user can decide comes up, take the safest reasonable choice, or stop there, and say so in your report. Check your work as the instructions say before you call it done. When you are done, end your turn with your report to the main agent: what you did, which files you changed, how you checked it and what you saw, and what is left or uncertain. Short and plain. Your report goes to the main agent, not to the user.\n\nYour part of the task:\n${task}`,
 fromAgent: text => `A message from the main agent:\n${text}`,
 fromUser: text => `This message comes from the app: the user wrote to you directly, in the window where they watch the helpers. Take it into account from now on:\n${text}`,
 finish: 'This note comes from the app: your conversation is nearly as long as this model can hold. Finish now: end your turn with your report of what is done and what is left.',
 // A helper sent on again after it was stopped: its conversation is as it was.
 resumed: by => `This note comes from the app: you were stopped before you finished, ${by === 'restart' ? 'when the app was closed' : by === 'agent' ? 'by the main agent' : 'by the user'}. Your conversation above is as you left it; the files are as they are now, and others may have changed some since. Go on with your part from where you stopped: look again at what you were doing, without starting over and without redoing what is done.`,
 reports: (text, still) => `This note comes from the app, not from the user: news of your helpers.\n\n${text}${still ? `\n\nStill at work:\n${still}` : ''}\n\nRead this before you go on. Look at what they made yourself before you build on it or tell the user: their work is yours to answer for.`,
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
// Finished, stopped or failed, and the agent has not been told yet.
const unread = conv => listOf(conv).filter(helper => helper.state !== 'working' && !helper.reported);

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

// What the agent is told of a helper that is no longer at work; from then on it counts as read.
function report(helper) {
 helper.reported = true;
 const files = helper.files.size ? `\nFiles it changed: ${[...helper.files].join(', ')}.` : '';
 if (helper.state === 'done') return `Helper “${helper.title}” finished. Its report:${helper.final ? `\n${helper.final.trim()}` : ' (it said nothing)'}${files}`;
 const said = helper.final ? `\nWhat it said last:\n${helper.final.trim()}` : '';
 const did = helper.log.length ? `\nIts last steps: ${helper.log.map(item => `${item.verb}${item.what ? ` ${item.what}` : ''}`).join('; ')}.` : '';
 if (helper.state === 'failed') return `Helper “${helper.title}” could not go on: ${helper.error || 'its model failed'}.${said}${did}${files}`;
 const by = helper.stoppedBy === 'user' ? ' by the user' : helper.stoppedBy === 'restart' ? ' when the app was closed' : helper.stoppedBy === 'agent' ? ' by you' : '';
 return `Helper “${helper.title}” was stopped${by} before it finished. Its conversation is kept: when the work should go on (the user asks for it, or your task needs it), send it a message with send_message and it goes on from where it stopped, without starting over. Don't send it on against the user's wish: they may have stopped it on purpose.${said}${did}${files}`;
}

// A helper as it is kept on the disk: its conversation without the pictures it looked at, which are big and can't be
// looked at again anyway.
const SEEN = '[A picture the helper looked at was here.]';
const flat = content => Array.isArray(content) ? content.map(part => part.type === 'image_url' ? { type: 'text', text: SEEN } : part) : content;
function stored(helper) {
 return {
  id: helper.id, title: helper.title, task: helper.task, tone: helper.tone, state: helper.state, stoppedBy: helper.stoppedBy, started: helper.started, ended: helper.ended,
  final: helper.final, error: helper.error, reported: helper.reported, spent: !!helper.spent, files: [...helper.files], log: helper.log, compacted: helper.compacted || 0,
  messages: helper.messages.map(message => Array.isArray(message.content) ? { ...message, content: flat(message.content) } : message),
 };
}

// A helper read back from the disk: one that was at work when the app closed is stopped now, and goes on when sent on.
function restored(item) {
 const stopped = item.state === 'working';
 return {
  id: item.id, title: item.title, task: item.task, tone: item.tone || TONES[0], conv: null, state: stopped ? 'stopped' : item.state, stoppedBy: stopped ? 'restart' : item.stoppedBy || '',
  started: item.started || Date.now(), ended: item.ended || Date.now(), deed: null, log: Array.isArray(item.log) ? item.log : [], files: new Set(item.files || []),
  final: item.final || '', error: item.error || '', reported: stopped ? false : !!item.reported, spent: !!item.spent, inbox: [], messages: Array.isArray(item.messages) ? item.messages : [],
  warned: false, compacted: item.compacted || 0,
 };
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
 if (deed && view) this.say(turn, view, deed);
 if (name === 'spawn_agent') return this.spawnHelper(conv, turn, args);
 if (name === 'wait_agent') return this.waitHelpers(conv, turn, args);
 if (name === 'send_message') return this.messageHelper(conv, turn, args);
 if (name === 'interrupt_agent') return this.interruptHelper(conv, args);
 return this.listHelpers(conv);
};

// A helper's own conversation, with the chat's model, effort and mode as they are now.
proto.helperConv = function (parent, helper) {
 helper.conv ||= new (Object.getPrototypeOf(parent).constructor)(parent.record);
 Object.assign(helper.conv, { helperOf: parent, brief: parent.brief, pad: null, model: parent.model, effort: parent.effort, speed: parent.speed, mode: parent.mode });
 helper.conv.helper = helper;
 return helper.conv;
};

proto.spawnHelper = function (conv, turn, args) {
 const title = short(args.task_name || args.title, HELPERS.title), task = String(args.message || '').trim();
 if (!title || !task) return 'Error: spawn_agent needs task_name (a short name of the part, in the user\'s language) and message (the whole task for the helper).';
 if (working(conv).length >= HELPERS.most) return `Error: ${HELPERS.most} helpers are at work already, the most there can be at once: ${working(conv).map(helper => `“${helper.title}”`).join(', ')}. Wait for one to finish (wait_agent), or do this part yourself.`;
 if (find(conv, title)) return `Error: there is a helper named “${title}” already. Give this one another name, or send that one more work with send_message.`;
 conv.helpers ||= new Map();
 conv.helperSeq = (conv.helperSeq || 0) + 1;
 const id = `h${conv.helperSeq}`;
 const helper = {
  id, title, task, conv: null, tone: TONES[(conv.helperSeq - 1) % TONES.length], state: 'working', started: Date.now(), ended: 0,
  deed: null, log: [], files: new Set(), final: '', error: '', reported: false, stoppedBy: '', inbox: [], messages: [{ role: 'user', content: NOTE.role(task, title) }], warned: false,
 };
 this.helperConv(conv, helper);
 conv.helpers.set(id, helper);
 this.runHelper(conv, helper, turn.config);
 changed(conv);
 return `Helper “${title}” started. It works on its own, at the same time as you, in the same folder, and goes on after your turn ends; the user sees it at work. Do your own part meanwhile (not its part). Its report comes to you by itself when it finishes: at your next step, or in a new turn the app starts for you once all your helpers have finished, if yours has ended by then. Wait for it with wait_agent only when your next step needs its result.`;
};

// A helper's turn: its own requests and steps, until it answers without a step. Never thrown out of: what went wrong
// is its report.
proto.runHelper = async function (parent, helper, config) {
 const conv = this.helperConv(parent, helper), controller = new AbortController();
 helper.controller = controller;
 helper.state = 'working';
 helper.ended = 0;
 helper.spent = false;
 const panel = this.browserOf(parent);
 conv.turn = { id: `${parent.turn?.id || parent.id || 'x'}-${helper.id}`, controller, config, browser: panel, part: null, parts: [], next: null, queue: [], pills: [], approvals: new Set(), tool: '', retryBudget: { used: 0 } };
 Desk.enter(conv, this);
 this.keepHelpers(parent);
 this.onChange?.();
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
    result = await Providers.stream(config, { messages, tools, signal: controller.signal, session: `${this.session(parent)}-${helper.id}`, retryBudget: conv.turn.retryBudget, onReasoning: (delta, stream) => this.helperThinks(parent, helper, stream.reasoning) });
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
   this.owe(parent, result.usage);
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
   this.keepHelpers(parent);
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
  helper.controller = null;
  wake(parent);
  this.keepHelpers(parent);
  this.onChange?.();
  this.wakeAgent(parent);
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
  // Asked in the chat's own card: under the chat's reply while its agent works, in the composer's card all the same
  // while its turn has ended and the helper goes on alone. The card goes with the helper when it is stopped.
  const host = parent.turn || { approvals: (parent.helperApprovals ||= new Set()), next: null, controller: turn.controller };
  const view = parent.turn?.part?.view || { el: document.createElement('div'), status: null };
  helper.asking = true;
  changed(parent);
  const answer = await this.approve(parent, host, view, { name, args, cwd, apart, panel, helper: helper.title, signal: turn.controller.signal });
  helper.asking = false;
  changed(parent);
  if (answer !== 'allow') return answer === 'deny' ? TOOL_NOTES.declined : answer;
 }
 if (turn.controller.signal.aborted) return TOOL_NOTES.cancelled;
 // A command says what it does in the agent's own plain words (its description), not as the command itself.
 const said = name === AgentTools.shell && typeof args.description === 'string' ? args.description.replace(/\s+/g, ' ').trim() : '';
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

// What a helper thinks about stands in its row where its step's words do, as beside the chat's agent's ghost
// (Chat.think): a new thought at most every HELPERS.think ms. Its thoughts are no steps: they stay out of its log.
proto.helperThinks = function (parent, helper, text) {
 if (helper.state !== 'working') return;
 const about = AgentLine.thought(text);
 if (!about) return;
 const thinking = !!helper.deed?.thought;
 if (thinking && helper.deed.verb === about) return;
 if (thinking && Date.now() - (helper.thoughtAt || 0) < HELPERS.think) return;
 helper.thoughtAt = Date.now();
 helper.deed = { verb: about, what: '', thought: true };
 changed(parent);
};

// What a helper spent goes into the chat's reply under way, or into the next one when the chat's agent is not at work.
proto.owe = function (parent, usage) {
 if (!usage) return;
 const entry = parent.turn?.part?.entry;
 if (entry) spend(entry, usage);
 else (parent.helperOwed ||= []).push(usage);
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
  this.owe(parent, cost);
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

// The user stops all the chat's work: its helpers stop, and none of them starts a turn of the agent's until the user's
// next word. What they did stays, and so do their conversations.
proto.stopHelpers = function (conv) {
 if (!conv?.helpers) return;
 conv.helpersHeld = true;
 for (const helper of working(conv)) this.stopHelper(conv, helper, 'user');
 changed(conv);
};

// Waits until a helper finishes, the user writes, the chat is stopped, or the time is up; then tells what is new.
proto.waitHelpers = async function (conv, turn, args) {
 if (!unread(conv).length && !working(conv).length) return listOf(conv).length ? 'All your helpers have finished and you have read their reports.' : 'You have no helpers.';
 const limit = Math.min(HELPERS.longest, Math.max(5, Number(args.timeout_seconds) || HELPERS.wait)) * 1000;
 let why = '';
 if (!unread(conv).length) {
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
 const out = unread(conv).map(report);
 const still = working(conv);
 if (still.length) out.push(`Still at work:\n${still.map(line).join('\n')}`);
 if (why === 'message') out.push(TOOL_NOTES.message);
 else if (why === 'time' && !out.length) out.push(`No helper finished in ${seconds(limit)} s.`);
 this.keepHelpers(conv);
 return out.join('\n\n');
};

// More work for a helper: told at its next step while it works, a turn of its own when it has finished, and for one
// that was stopped, its own conversation goes on from where it stopped.
proto.messageHelper = function (conv, turn, args) {
 const helper = find(conv, args.target || args.task_name), text = String(args.message || '').trim();
 if (!helper) return `Error: no helper is named “${words(args.target)}”. Your helpers: ${listOf(conv).map(item => `“${item.title}”`).join(', ') || 'none'}.`;
 if (!text) return 'Error: the message is empty.';
 if (helper.state === 'working') {
  helper.inbox.push({ role: 'user', content: NOTE.fromAgent(text) });
  return `Sent: “${helper.title}” reads it after its current step.`;
 }
 if (working(conv).length >= HELPERS.most) return `Error: ${HELPERS.most} helpers are at work already. Wait for one to finish first.`;
 const again = helper.state === 'stopped';
 if (again) helper.messages.push({ role: 'user', content: NOTE.resumed(helper.stoppedBy) });
 helper.messages.push({ role: 'user', content: NOTE.fromAgent(text) });
 helper.final = '';
 helper.reported = false;
 helper.error = '';
 helper.stoppedBy = '';
 helper.started = Date.now();
 this.runHelper(conv, helper, turn.config);
 changed(conv);
 return again ? `“${helper.title}” goes on from where it stopped, with your message. Its report comes to you when it finishes.` : `“${helper.title}” is at work again on your message. Its report comes to you when it finishes.`;
};

proto.interruptHelper = function (conv, args) {
 const helper = find(conv, args.target || args.task_name);
 if (!helper) return `Error: no helper is named “${words(args.target)}”.`;
 if (!this.stopHelper(conv, helper, 'agent')) return `“${helper.title}” is not at work.`;
 return `“${helper.title}” is stopped. Its files stay as they are, and its conversation is kept: send it a message to have it go on.`;
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

// The note that tells the agent what its helpers came to; '' when there is nothing new. What it tells counts as read.
proto.helperNews = function (conv) {
 const fresh = unread(conv);
 if (!fresh.length) return '';
 const text = fresh.map(report).join('\n\n'), still = working(conv).map(line).join('\n');
 this.keepHelpers(conv);
 changed(conv);
 return NOTE.reports(text, still);
};

// Once all of a chat's helpers have finished while its agent is not at work, the agent gets a turn to read their
// reports and go on, as if it had waited for them. Not while the user holds the work stopped (End), not for helpers
// only the user stopped, not in a chat that is locked or gone.
proto.wakeAgent = function (conv) {
 if (conv.turn || conv.helpersHeld || working(conv).length || !conv.record || conv.locked || !this.library.chat(conv.id) || !this.agent(conv)) return false;
 if (!unread(conv).some(helper => !BY_USER.has(helper.stoppedBy))) return false;
 const config = this.config(conv);
 if (!config.ready) return false;
 this.resume(conv, config);
 return true;
};

// The helpers go to the disk with the chat, a moment after they change; a chat that is gone or sealed shut keeps none.
proto.keepHelpers = function (conv) {
 if (!this.helpersOn || !conv || conv.helperOf || !conv.record || !this.library.saveHelpers) return;
 clearTimeout(conv.helperSave);
 conv.helperSave = setTimeout(() => {
  if (!this.library.chat(conv.id)) return;
  this.library.saveHelpers(conv.id, listOf(conv).map(stored)).catch(() => {});
 }, HELPERS.save);
};

// A turn that would end with reports unread reads them first. One that ends while helpers work just ends: they go on,
// and their reports bring the agent back once they have all finished.
const planBack = proto.planBack;
proto.planBack = function (conv, turn, finish) {
 if (!conv.helpers || conv.helperOf || turn.quiet || turn.controller.signal.aborted || finish === 'length' || finish === 'content_filter') return planBack.call(this, conv, turn, finish);
 const news = this.helperNews(conv);
 if (news) return news;
 if (working(conv).length) return '';
 return planBack.call(this, conv, turn, finish);
};

// End stops the chat's agent and its helpers together.
const abort = proto.abort;
proto.abort = function (conv) {
 abort.call(this, conv);
 this.stopHelpers(conv);
};

// End with the chat's agent not at work stops the helpers that still are.
const stop = proto.stop;
proto.stop = function () {
 const conv = this.active;
 if (conv?.turn) return stop.call(this);
 if (working(conv).length) this.stopHelpers(conv);
};

// The chat is at work while its agent or any of its helpers is.
Object.defineProperty(proto, 'working', { configurable: true, get() { return !!this.active?.turn || working(this.active).length > 0; } });
const isBusy = proto.isBusy;
proto.isBusy = function (id) {
 return isBusy.call(this, id) || working(this.conversations.get(id)).length > 0;
};

// When the chat's turn ends, its helpers go on. Stopped helpers whose story the agent read in it and did not send on
// are let go at the user's next message; and helpers that finished while it was ending bring the agent back.
const end = proto.end;
proto.end = function (conv, turn, error, finish) {
 const out = end.call(this, conv, turn, error, finish);
 for (const helper of listOf(conv)) if (helper.state === 'stopped' && helper.reported) helper.spent = true;
 changed(conv);
 this.keepHelpers(conv);
 Promise.resolve(out).then(() => this.wakeAgent(conv)).catch(() => {});
 return out;
};

// A new message of the user: what is done and read is gone from the island; the rest stays, and helpers go on with
// their work. The user's word also lifts End's hold on the helpers that are left.
const run = proto.run;
proto.run = function (conv, prompt, config, bubble) {
 conv.helpersHeld = false;
 if (conv.helpers) {
  for (const helper of listOf(conv)) if (helper.state !== 'working' && helper.reported && (helper.state !== 'stopped' || helper.spent)) conv.helpers.delete(helper.id);
  if (!conv.helpers.size) conv.helpers = null;
  changed(conv);
  this.keepHelpers(conv);
 }
 return run.call(this, conv, prompt, config, bubble);
};

// A chat's helpers come back from the disk with its messages.
const load = proto.load;
proto.load = function (conv) {
 return Promise.resolve(load.call(this, conv)).then(async out => {
  if (this.helpersOn && this.library.helpers && conv.record && !conv.helpers) {
   const items = await this.library.helpers(conv.id).catch(() => []);
   if (items.length && !conv.helpers) {
    conv.helpers = new Map(items.map(item => [item.id, restored(item)]));
    conv.helperSeq = Math.max(0, ...items.map(item => Number(String(item.id).slice(1)) || 0));
    changed(conv);
   }
  }
  return out;
 });
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
// prompt stays the same in every chat (see notes in chat.js). What its helpers came to since its last step comes in a
// note too, and what they spent while it was not at work is counted in this reply.
const notes = proto.notes;
proto.notes = function (conv, messages) {
 const out = notes.call(this, conv, messages);
 if (!this.helpersOn || conv?.helperOf || !this.agent(conv)) return out;
 const ultra = this.config(conv).effort === 'ultra';
 const lastOn = messages.findLastIndex(message => message.role === 'user' && message.content === NOTE.ultra);
 const lastOff = messages.findLastIndex(message => message.role === 'user' && message.content === NOTE.notUltra);
 if (ultra && lastOn <= lastOff) out.push({ role: 'user', content: NOTE.ultra });
 else if (!ultra && lastOn > lastOff) out.push({ role: 'user', content: NOTE.notUltra });
 const entry = conv.turn?.part?.entry;
 if (entry && conv.helperOwed?.length) for (const usage of conv.helperOwed.splice(0)) spend(entry, usage);
 const news = this.helperNews(conv);
 if (news) out.push({ role: 'user', content: news });
 return out;
};

Chat.HELPERS = HELPERS;
window.Helpers = { HELPERS, TONES, listOf, working, unread };
})();
