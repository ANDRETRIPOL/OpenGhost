(() => {
'use strict';

const FOLLOW_DISTANCE = 48;
const FOLLOW_SPRING = [130, 23];
const BOTTOM_SHOW = 120;
const JUMP = { base: 420, perPixel: 0.05, max: 950 };
const COPIED_TIME = 1600;
const FINISH_NOTES = ['length', 'content_filter', 'insufficient_system_resource'];
const LEAVE = { duration: 260, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
const SWITCH = { duration: 280, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const PIN_TIME = 2000;
// How far below the top of the chat a card too tall for the room over the composer keeps its top: where the first message sits.
const ANCHOR_GAP = 56;
// The chat on screen keeps its messages under the lock screen while it frosts over (FROST in lock-ui.js), then lets them go.
const LOCK_FADE = 700;
const REMOVE = { duration: 240, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
const { TOOL_NOTES, userContent, tokens, addUp, estimate } = AgentRuntime;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const samePath = (a, b) => Library.samePath(a, b);

// A pasted text keeps only its first line and length here; the text itself went to the model with the message.
// A video keeps its place on the disk, so the agent can go on watching it, and the frame its card shows.
const slim = ({ name, size, image, width, height, note, pasted, payload }) => ({
 name, size, image: !!image, width, height, note,
 pasted: pasted && { preview: pasted.preview, lines: pasted.lines },
 video: payload?.type === 'video' ? { path: payload.path, duration: payload.duration, poster: payload.poster } : undefined,
});
function splitQuotes(text) {
 const quotes = [];
 let rest = text || '', m;
 while ((m = rest.match(/^\s*((?:>[^\n]*(?:\n|$))+)/))) {
  quotes.push(m[1].replace(/^> ?/gm, '').trim());
  rest = rest.slice(m[0].length);
 }
 return { quotes: quotes.filter(Boolean), rest: rest.trim() };
}

function snapshot(messages) {
 const out = [];
 for (const entry of messages) {
  if (entry.role !== 'assistant' || !entry.steps) { out.push(entry); continue; }
  const steps = [];
  for (let k = 0; k < entry.steps.length; k++) {
   const step = entry.steps[k], calls = step.tool_calls?.length || 0;
   if (calls && entry.steps.slice(k + 1, k + 1 + calls).filter(next => next.role === 'tool').length < calls) break;
   steps.push(step);
  }
  if (steps.length) out.push({ ...entry, steps });
  else if (entry.content) out.push({ role: 'assistant', content: entry.content });
 }
 return out;
}

const drop = (list, item) => {
 const at = list.indexOf(item);
 if (at >= 0) list.splice(at, 1);
};

function settle(root) {
 for (const animation of root.getAnimations({ subtree: true })) {
  if (animation.effect?.getComputedTiming().iterations === Infinity) continue;
  try { animation.finish(); } catch {}
 }
}

function collapse(el) {
 if (!el.isConnected) return;
 if (reducedMotion()) { el.remove(); return; }
 el.style.overflow = 'hidden';
 el.animate([{ height: `${el.offsetHeight}px`, opacity: 1 }, { height: '0px', marginTop: '0px', paddingTop: '0px', opacity: 0 }], REMOVE)
  .finished.then(() => el.remove(), () => el.remove());
}

class Conversation {
 constructor(record, list = document.createElement('div')) {
  this.record = record;
  this.folder = null;
  this.model = '';
  this.messages = [];
  this.tokens = 0;
  // How many messages the latest request held, the system prompt's included (see Chat.seam).
  this.sent = 0;
  this.list = list;
  this.list.className = 'thread-list';
  this.list.__conversation = this;
  this.turn = null;
  this.follow = true;
  this.scrollTop = 0;
  this.unread = false;
  this.ready = null;
 }

 get id() {
  return this.record?.id || '';
 }
}

// The chat on screen. The agent it drives, from the model's prompts to the tools and compaction, is AgentRuntime.
class Chat extends AgentRuntime {
 constructor({ main, thread, bottom, settings, library, onChange, onList }) {
  super();
  this.main = main;
  this.thread = thread;
  this.bottom = bottom;
  this.settings = settings;
  this.library = library;
  this.onChange = onChange;
  this.onList = onList;
  this.conversations = new Map();
  this.nodes = new WeakMap();
  this.active = null;
  this.draft = null;
  this.opening = 0;
  this.tools = 0;
  this.follow = true;
  this.lastTop = 0;
  this.followFrame = 0;
  this.followLast = 0;
  this.followPos = 0;
  this.followVel = 0;
  this.followMoving = false;
  this.jumpFrame = 0;
  this.followStep = this.followStep.bind(this);
  this.pinUntil = 0;
  this.resize = new ResizeObserver(() => {
   if (this.follow && this.busy) this.followBottom();
   else if (this.follow && performance.now() < this.pinUntil) this.pin();
   this.syncBottom();
  });
  thread.addEventListener('scroll', () => this.onScroll());
  thread.addEventListener('click', event => this.onClick(event));
  thread.addEventListener('diagram-edit', event => this.onDiagramEdit(event));
  thread.addEventListener('stats-remove', event => this.onStatsRemove(event));
  bottom.addEventListener('scroll-bottom', () => this.scrollToBottom());
  new RowGlide(thread);
  this.activate(this.newDraft(thread.querySelector('.thread-list') || undefined));
 }

 get busy() {
  return !!this.active?.turn;
 }

 get model() {
  return this.modelOf(this.active);
 }

 modelOf(conv) {
  return this.settings.resolve(conv?.record?.model || conv?.model);
 }

 config(conv) {
  return this.settings.configFor(this.modelOf(conv));
 }

 // Whether the chat has turns no summary covers yet: a new model would need them compacted first.
 hasHistory(conv = this.active) {
  const messages = conv?.messages || [], last = messages.findLastIndex(entry => entry.role === 'compact');
  return messages.slice(last + 1).some(entry => entry.role === 'user' || entry.role === 'assistant');
 }

 setModel(id) {
  const conv = this.active;
  if (!conv || conv.turn || id === this.modelOf(conv)) return;
  if (conv.record) this.library.update(conv.id, { model: id });
  else conv.model = id;
  this.settings.setModel(id);
  this.onChange();
 }

 // The model the chat worked with summarizes it first, so the new one starts from a history that fits its own window.
 switchModel(id) {
  const conv = this.active;
  if (!conv?.record || conv.turn || id === this.modelOf(conv)) return;
  if (!this.hasHistory(conv)) { this.setModel(id); return; }
  const turn = this.begin(conv, this.config(conv));
  turn.switch = this.modelOf(conv);
  this.library.update(conv.id, { model: id });
  this.settings.setModel(id);
  this.summarize(conv, turn);
 }

 // Whether the chat on screen can be compacted now: it has turns no summary covers yet, and nothing is being written.
 get canCompact() {
  const conv = this.active;
  return !!conv?.record && !conv.turn && !conv.locked && this.hasHistory(conv);
 }

 // Whether the chat on screen has anything to count: a message in it, and no reply being written.
 get canStats() {
  const conv = this.active;
  return !!conv?.record && !conv.turn && !conv.locked && conv.messages.some(entry => entry.role === 'user' || entry.role === 'assistant');
 }

 // How full the chat's context is, out of its model's window, from 0 to 1.
 get fill() {
  const conv = this.active;
  return conv?.record ? Math.min(1, (conv.tokens || 0) / this.settings.windowOf(this.modelOf(conv))) : 0;
 }

 // Compacts the chat on screen on the user's word: the same summary a full window brings, shown the same way.
 compactNow() {
  const conv = this.active;
  if (!this.canCompact) return false;
  const config = this.config(conv);
  if (!config.ready) {
   this.settings.open(I18n.t('settings.key.needed'), config.provider);
   return false;
  }
  const turn = this.begin(conv, config);
  turn.compacting = true;
  this.summarize(conv, turn);
  return true;
 }

 // A turn with nothing of its own to say, only the summary's line in the chat. Messages sent meanwhile wait and go right after it.
 summarize(conv, turn) {
  turn.quiet = true;
  this.openPart(conv, turn);
  const view = turn.part.view;
  view.status.remove();
  view.el.hidden = true;
  this.follow = true;
  this.onChange();
  this.drive(conv, turn);
  this.followBottom();
 }

 get activeId() {
  return this.active?.id || '';
 }

 get folder() {
  return this.active && !this.active.record ? this.active.folder : null;
 }

 // A new chat not written in yet: it has no place in the list until its first message, only a stand-in row.
 get isDraft() {
  return !!this.active && !this.active.record;
 }

 isBusy(id) {
  return !!this.conversations.get(id)?.turn;
 }

 isUnread(id) {
  return !!this.conversations.get(id)?.unread;
 }

 setFolder(folder) {
  if (!this.active || this.active.record) return;
  this.active.folder = folder;
  this.onChange();
 }

 newDraft(list) {
  return this.draft = new Conversation(null, list);
 }

 newChat(folder = null) {
  const draft = this.draft || this.newDraft();
  draft.folder = folder;
  draft.model = '';
  this.opening++;
  this.activate(draft);
  this.onChange();
 }

 open(id) {
  if (this.active?.id === id) return Promise.resolve();
  const token = ++this.opening;
  let conv = this.conversations.get(id);
  if (!conv) {
   const record = this.library.chat(id);
   if (!record) return Promise.resolve();
   conv = new Conversation(record);
   this.conversations.set(id, conv);
   // A locked chat opens onto its lock screen; its messages are read only once the password is in.
   if (this.library.isLocked(id)) conv.locked = true;
   else conv.ready = this.load(conv);
  }
  return Promise.resolve(conv.ready).then(() => {
   if (token !== this.opening) return;
   this.activate(conv);
   this.onChange();
  });
 }

 load(conv) {
  return this.library.conversation(conv.id).then(({ messages, tokens }) => {
   conv.messages = messages;
   conv.tokens = tokens;
   this.restore(conv);
  });
 }

 isLocked(id) {
  const conv = this.conversations.get(id);
  return conv ? !!conv.locked : this.library.isLocked(id);
 }

 // Locks a protected chat: its view closes at once, and its messages leave memory as soon as no reply is being written into them.
 seal(conv, delay = 0) {
  conv.locked = true;
  const drop = () => {
   if (!conv.locked || conv.turn) return;
   this.library.relock(conv.id);
   conv.messages = [];
   conv.tokens = 0;
   conv.ready = null;
   conv.list.replaceChildren();
  };
  if (delay && !reducedMotion()) setTimeout(drop, delay);
  else drop();
 }

 lock(id) {
  const conv = this.conversations.get(id);
  if (!conv || conv.locked || !this.library.isProtected(id)) return;
  this.seal(conv, conv === this.active ? LOCK_FADE : 0);
  this.onChange();
 }

 // The password opens the chat; its messages are read again unless a reply still running kept them in memory.
 async unlock(id, password) {
  const conv = this.conversations.get(id);
  if (!conv?.locked) return true;
  if (!(await this.library.unlock(id, password))) return false;
  if (!conv.ready) {
   try {
    await (conv.ready = this.load(conv));
   } catch (error) {
    // Messages that would not open must never pass for an empty chat: a reply saved into it would overwrite them.
    conv.ready = null;
    this.library.relock(id);
    throw error;
   }
  }
  conv.locked = false;
  if (conv === this.active) {
   this.main.classList.toggle('is-empty', !conv.list.childElementCount);
   this.follow = true;
   this.pin();
   this.pinUntil = performance.now() + PIN_TIME;
  }
  this.onChange();
  return true;
 }

 // Setting a password locks the chat straight away, so the first thing its owner does is open it with the new password.
 async protect(id, password) {
  const conv = this.conversations.get(id);
  if (conv?.turn || conv?.locked) return false;
  const loaded = conv?.ready ? { messages: conv.messages, tokens: conv.tokens } : null;
  if (!(await this.library.protect(id, password, loaded))) return false;
  if (conv) this.seal(conv, conv === this.active ? LOCK_FADE : 0);
  this.onChange();
  return true;
 }

 async unprotect(id) {
  const conv = this.conversations.get(id);
  if (!conv || conv.locked) return false;
  const done = await this.library.unprotect(id, conv.ready ? { messages: conv.messages, tokens: conv.tokens } : null);
  this.onChange();
  return done;
 }

 remove(id) {
  const conv = this.conversations.get(id), record = this.library.chat(id);
  if (conv) {
   this.abort(conv);
   this.conversations.delete(id);
  }
  if (this.active?.id === id) {
   const folder = record && !this.library.isHome(record) && this.library.folders.find(item => samePath(item.path, record.folder));
   this.newChat(folder ? { path: folder.path, name: folder.name } : null);
  }
  conv?.list.remove();
 }

 removeFolder(path, ids) {
  for (const id of ids) this.remove(id);
  const gone = folder => folder && samePath(folder.path, path);
  if (this.active && !this.active.record && gone(this.active.folder)) this.newChat(null);
  if (this.draft && gone(this.draft.folder)) this.draft.folder = null;
 }

 attach(conv) {
  if (conv.list.isConnected) return;
  conv.list.classList.add('is-parked');
  this.thread.append(conv.list);
  this.onList?.(conv.list);
 }

 activate(conv) {
  const prev = this.active;
  if (prev === conv) return;
  this.stopFollow();
  this.anchor = null;
  if (prev) {
   prev.follow = this.follow;
   prev.scrollTop = this.thread.scrollTop;
   prev.list.classList.add('is-parked');
   this.resize.unobserve(prev.list);
   // A protected chat locks again as soon as it is left.
   if (prev.record && !prev.locked && this.library.isProtected(prev.id)) this.seal(prev);
  }
  this.attach(conv);
  this.active = conv;
  conv.unread = false;
  conv.list.classList.remove('is-parked');
  this.resize.observe(conv.list);
  const empty = !conv.list.childElementCount;
  this.main.classList.toggle('is-empty', empty && !conv.locked);
  this.follow = conv.follow;
  if (conv.follow) this.pin();
  else this.thread.scrollTop = conv.scrollTop;
  this.lastTop = this.thread.scrollTop;
  this.pinUntil = performance.now() + PIN_TIME;
  if (prev?.list.childElementCount && !empty && !reducedMotion()) conv.list.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], SWITCH);
  this.syncBottom();
 }

 // Holds the end of the chat in view. A card taller than the room over the composer (postStats) holds its own top in view
 // instead, clear of the buttons over the chat.
 pin() {
  const thread = this.thread, anchor = this.anchor?.isConnected ? this.anchor : null;
  let top = thread.scrollHeight;
  if (anchor) top = Math.min(top, anchor.getBoundingClientRect().top - thread.getBoundingClientRect().top + thread.scrollTop - ANCHOR_GAP);
  thread.scrollTop = top;
  this.lastTop = thread.scrollTop;
 }

 stopFollow() {
  cancelAnimationFrame(this.followFrame);
  cancelAnimationFrame(this.jumpFrame);
  this.followFrame = 0;
  this.jumpFrame = 0;
  this.followMoving = false;
 }

 send(text, attachments = []) {
  const conv = this.active, config = this.config(conv);
  if (conv.locked) return false;
  this.anchor = null;
  if (!config.ready) {
   this.settings.open(I18n.t('settings.key.needed'), config.provider);
   return false;
  }
  if (!conv.record) {
   conv.record = this.library.create({ folder: conv.folder, text, attachments });
   this.library.update(conv.id, { model: this.modelOf(conv) });
   this.conversations.set(conv.id, conv);
   this.draft = null;
  } else {
   this.library.update(conv.id, { updated: Date.now() });
  }
  for (const actions of conv.list.querySelectorAll('.message-actions')) actions.remove();
  const prompt = { text, attachments };
  this.follow = true;
  if (conv.turn) {
   this.interject(conv, prompt);
  } else {
   const bubble = this.userMessage(prompt);
   conv.list.append(bubble);
   this.main.classList.remove('is-empty');
   this.run(conv, prompt, config, bubble);
  }
  this.followBottom();
  return true;
 }

 stop() {
  if (this.active?.turn) this.abort(this.active);
 }

 abort(conv) {
  const turn = conv.turn;
  if (!turn) return;
  turn.controller.abort();
  turn.release?.('abort');
  if (turn.tool) AgentTools.cancel(turn.tool);
  for (const pending of turn.approvals) pending.card.settle('deny');
 }

 onModeChange() {
  const mode = this.settings.mode;
  for (const conv of this.conversations.values()) {
   for (const pending of conv.turn?.approvals || []) {
    if (!AgentTools.needsApproval(pending.name, pending.args, { mode, cwd: pending.cwd, attached: this.attachedVideos(conv) })) pending.card.settle('allow');
   }
  }
 }

 onScroll() {
  const top = this.thread.scrollTop, distance = this.thread.scrollHeight - top - this.thread.clientHeight;
  if (distance <= FOLLOW_DISTANCE) this.follow = true;
  else if (top < this.lastTop - 1) this.follow = false;
  this.lastTop = top;
  this.syncBottom();
 }

 syncBottom() {
  const thread = this.thread, distance = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
  this.bottom.classList.toggle('is-shown', !this.follow && distance > BOTTOM_SHOW);
 }

 scrollToBottom() {
  const thread = this.thread, start = thread.scrollTop;
  this.follow = true;
  this.syncBottom();
  cancelAnimationFrame(this.followFrame);
  cancelAnimationFrame(this.jumpFrame);
  this.followFrame = 0;
  this.followMoving = false;
  const gap = thread.scrollHeight - thread.clientHeight - start;
  // An instant jump notes where it landed, like every animated step does, so scrolling away right after it still lets go.
  if (reducedMotion() || gap < 2) { thread.scrollTop = thread.scrollHeight; this.lastTop = thread.scrollTop; return; }
  const duration = Math.min(JUMP.max, JUMP.base + gap * JUMP.perPixel), begin = performance.now();
  const step = now => {
   this.jumpFrame = 0;
   if (!this.follow) return;
   const p = Math.min(1, Math.max(0, (now - begin) / duration)), max = thread.scrollHeight - thread.clientHeight;
   thread.scrollTop = start + (max - start) * (1 - (1 - p) ** 4);
   this.lastTop = thread.scrollTop;
   if (p < 1) { this.jumpFrame = requestAnimationFrame(step); return; }
   this.followPos = thread.scrollTop;
   this.followBottom();
  };
  this.jumpFrame = requestAnimationFrame(step);
 }

 onDiagramEdit(event) {
  const entry = event.target.closest('.message')?.__entry, { from, to } = event.detail;
  if (!entry || !from || !entry.content.includes(from)) return;
  entry.content = entry.content.replace(from, to);
  const conv = event.target.closest('.thread-list')?.__conversation;
  if (conv?.record && conv.messages.includes(entry)) this.library.saveMessages(conv.id, conv.messages, conv.tokens);
 }

 followBottom() {
  if (!this.follow || this.followFrame || this.jumpFrame) return;
  if (!this.followMoving) {
   this.followPos = this.thread.scrollTop;
   this.followVel = 0;
  }
  this.followLast = performance.now();
  this.followFrame = requestAnimationFrame(this.followStep);
 }

 followStep(now) {
  this.followFrame = 0;
  const thread = this.thread, max = thread.scrollHeight - thread.clientHeight;
  if (!this.follow || reducedMotion()) {
   if (this.follow) { thread.scrollTop = max; this.lastTop = thread.scrollTop; }
   this.followMoving = false;
   return;
  }
  if (Math.abs(thread.scrollTop - this.followPos) > 1.5) {
   this.followPos = thread.scrollTop;
   this.followVel = 0;
  }
  const dt = Math.min(Math.max((now - this.followLast) / 1000, 0), 0.05), [k, c] = FOLLOW_SPRING;
  this.followLast = now;
  const steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
   this.followVel += ((max - this.followPos) * k - this.followVel * c) * h;
   this.followPos += this.followVel * h;
  }
  if (this.followPos >= max) {
   this.followPos = max;
   this.followVel = Math.min(0, this.followVel);
  }
  if (max - this.followPos < 0.5 && Math.abs(this.followVel) < 4) {
   thread.scrollTop = max;
   this.followPos = thread.scrollTop;
   this.lastTop = thread.scrollTop;
   this.followMoving = false;
   return;
  }
  thread.scrollTop = this.followPos;
  this.lastTop = thread.scrollTop;
  this.followMoving = true;
  this.followFrame = requestAnimationFrame(this.followStep);
 }

 async onClick(event) {
  const button = event.target.closest('.md-copy');
  if (!button) return;
  const own = button.classList.contains('message-copy');
  const text = own ? this.copyText(button.closest('.message')) : button.closest('.md-code, .md-calc').querySelector('pre').textContent;
  try {
   await navigator.clipboard.writeText(text);
  } catch {
   return;
  }
  button.classList.add('is-copied');
  button.setAttribute('aria-label', I18n.t('code.copied'));
  clearTimeout(button.copiedTimer);
  button.copiedTimer = setTimeout(() => {
   button.classList.remove('is-copied');
   button.setAttribute('aria-label', I18n.t(own ? 'message.copy' : 'code.copy'));
  }, COPIED_TIME);
 }

 copyText(el) {
  const entry = el.__entry;
  if (!entry?.turn) return entry?.content ?? '';
  const messages = el.closest('.thread-list')?.__conversation?.messages || [];
  const parts = messages.filter(item => item.role === 'assistant' && item.turn === entry.turn && item.content?.trim());
  return parts.length ? parts.map(item => item.content.trim()).join('\n\n') : entry.content;
 }

 begin(conv, config) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return conv.turn = { id, controller: new AbortController(), config, part: null, parts: [], next: null, queue: [], approvals: new Set(), tool: '', text: false };
 }

 run(conv, prompt, config, bubble) {
  const turn = this.begin(conv, config);
  const entry = { role: 'user', text: prompt.text, attachments: prompt.attachments.map(slim), content: prompt.text };
  conv.messages.push(entry);
  if (bubble) this.nodes.set(entry, bubble);
  this.openPart(conv, turn);
  this.onChange();
  return this.drive(conv, turn, async () => { await this.compose(conv, entry, prompt); });
 }

 // The message as the model gets it, once every attachment is read; a video's place and frame are known only then.
 async compose(conv, entry, prompt) {
  entry.content = await userContent(prompt, this.agent(conv));
  entry.attachments = prompt.attachments.map(slim);
 }

 resume(conv, config) {
  const turn = this.begin(conv, config);
  this.openPart(conv, turn);
  this.onChange();
  return this.drive(conv, turn);
 }

 interject(conv, prompt) {
  const turn = conv.turn, bubble = this.userMessage(prompt);
  if (turn.next) {
   turn.next.el.before(bubble);
  } else {
   turn.next = this.assistantMessage(conv);
   conv.list.append(bubble, turn.next.el);
  }
  turn.queue.push({ prompt, bubble });
  this.dismissGhost(turn.part.view);
  for (const pending of turn.approvals) pending.card.settle(TOOL_NOTES.message);
  turn.release?.('message');
 }

 async drive(conv, turn, prepare) {
  let error = null, finish = null;
  try {
   if (prepare) await prepare();
   turn.controller.signal.throwIfAborted();
   finish = await this.loop(conv, turn);
  } catch (e) {
   error = e;
  }
  await this.end(conv, turn, error, finish);
 }

 async approve(conv, turn, view, request) {
  this.dismissGhost(view);
  const card = new ApprovalCard(AgentTools.describe(request.name, request.args, request.cwd));
  const pending = { ...request, card };
  view.el.append(card.el);
  turn.approvals.add(pending);
  if (conv === this.active) this.followBottom();
  const answer = await card.answer;
  turn.approvals.delete(pending);
  card.dismiss();
  return answer;
 }

 async takeQueue(conv, turn) {
  const queued = turn.queue.splice(0);
  this.closePart(conv, turn.part);
  for (const { prompt, bubble } of queued) {
   const entry = { role: 'user', text: prompt.text };
   await this.compose(conv, entry, prompt);
   conv.messages.push(entry);
   this.nodes.set(entry, bubble);
   conv.tokens += estimate([entry]);
  }
  this.openPart(conv, turn, turn.next);
  turn.next = null;
 }

 openPart(conv, turn, view = null) {
  view ||= this.assistantMessage(conv);
  if (!view.el.isConnected) conv.list.append(view.el);
  // Each part of a reply notes the model that wrote it, for the chat's stats and for a model that later takes over.
  const entry = { role: 'assistant', content: '', steps: [], turn: turn.id, model: turn.config.id };
  conv.messages.push(entry);
  view.el.__entry = entry;
  turn.part = { view, entry };
  turn.parts.push(turn.part);
 }

 closePart(conv, { view, entry }) {
  this.dismissGhost(view);
  if (!entry.steps.length && !entry.content) drop(conv.messages, entry);
  view.stream.finish().then(() => {
   view.el.classList.remove('is-streaming');
   if (!entry.content.trim()) collapse(view.el);
  });
 }

 async end(conv, turn, error, finish) {
  if (conv.turn !== turn) return;
  const { view, entry } = turn.part, aborted = error?.name === 'AbortError';
  for (const pending of turn.approvals) pending.card.settle('deny');
  conv.turn = null;
  if (turn.switch && this.library.chat(conv.id)) {
   this.library.update(conv.id, { model: turn.switch });
   this.settings.setModel(turn.switch);
  }
  window.browserPanel?.drive(conv, false);
  if (!entry.steps.length) drop(conv.messages, entry);
  if (turn.next) collapse(turn.next.el);
  const queued = turn.queue.splice(0).map(({ prompt, bubble }) => {
   const item = { role: 'user', text: prompt.text, attachments: prompt.attachments.map(slim), content: prompt.text };
   conv.messages.push(item);
   this.nodes.set(item, bubble);
   return this.compose(conv, item, prompt).catch(() => {});
  });
  await Promise.all(queued);
  if (conv.record && this.library.chat(conv.id)) {
   this.save(conv);
   if (turn.text && !conv.record.named) this.name(conv, turn.config);
  }
  if (conv !== this.active) conv.unread = true;
  this.dismissGhost(view);
  this.onChange();
  await view.stream.finish();
  view.el.classList.remove('is-streaming');
  const text = !!entry.content.trim();
  let noted = true;
  if (error && !aborted) this.fail(conv, view, error);
  else if (turn.quiet) noted = false;
  else if (aborted) this.note(view, I18n.t('chat.stopped'));
  else if (FINISH_NOTES.includes(finish)) this.note(view, I18n.t(`finish.${finish}`));
  else if (!turn.text) this.note(view, I18n.t('chat.empty'));
  else noted = false;
  const last = text ? view : turn.parts.findLast(item => item.entry.content.trim() && item.view.el.isConnected)?.view;
  if (last) {
   const tools = this.toolbar(), box = last === view && view.el.querySelector('.message-error, .message-note');
   if (box) box.before(tools);
   else last.el.append(tools);
  }
  if (!text && !noted) collapse(view.el);
  if (conv === this.active) this.followBottom();
  // A protected chat left while it was replying locks fully once the reply is saved.
  if (conv.locked && !conv.turn) this.seal(conv);
 }

 switchLabels(from, to) {
  const name = id => this.settings.find(id)?.name || id;
  return {
   running: I18n.t('compact.switch.running', { name: name(to) }),
   done: I18n.t('compact.switch.done', { name: name(to) }),
   failed: I18n.t('compact.switch.failed', { name: name(from) }),
  };
 }

 // Shows that the chat is being compacted, where the summary will go: after the part of the reply that compaction cut
 // short, or before the messages it leaves out.
 compactStart(conv, turn, at, labels) {
  const messages = conv.messages, notice = this.compactNotice(true, labels);
  if (at === messages.length) {
   this.closePart(conv, turn.part);
   conv.list.append(notice);
  } else {
   const first = this.nodes.get(messages[at]);
   if (first?.isConnected) first.before(notice);
   else turn.part.view.el.before(notice);
  }
  if (conv === this.active) this.followBottom();
  return notice;
 }

 compactNotice(live, labels = null) {
  const el = document.createElement('div');
  el.className = `thread-compact${live ? ' is-live' : ''}`;
  el.labels = labels;
  const text = document.createElement('span');
  text.className = 'thread-compact-text';
  text.textContent = live ? labels?.running || I18n.t('compact.running') : I18n.t('compact.done');
  el.append(text);
  return el;
 }

 finishNotice(el, ok) {
  const text = el.querySelector('.thread-compact-text');
  el.classList.remove('is-live');
  text.textContent = ok ? el.labels?.done || I18n.t('compact.done') : el.labels?.failed || I18n.t('compact.failed');
  if (!reducedMotion()) text.animate([{ opacity: 0, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 360, easing: 'ease-out' });
 }

 save(conv) {
  if (!this.library.chat(conv.id)) return;
  this.library.saveMessages(conv.id, conv.messages, conv.tokens);
  this.library.update(conv.id, { updated: Date.now() });
 }

 // What a chat has spent, per model and per reply, with its mini chat and how full its context is. Only what was counted is
 // here: replies written before the app kept count are only numbered.
 async stats(conv = this.active) {
  const models = new Map(), turns = new Map(), uncounted = new Set();
  for (const entry of conv.messages) {
   if (entry.role !== 'assistant' && entry.role !== 'compact') continue;
   const turn = entry.role === 'assistant' ? entry.turn || entry : null;
   if (!entry.usage) {
    if (turn && entry.steps?.length) uncounted.add(turn);
    continue;
   }
   const model = entry.model || this.modelOf(conv);
   if (!models.has(model)) models.set(model, tokens());
   addUp(models.get(model), entry.usage);
   if (!turn) continue;
   if (!turns.has(turn)) turns.set(turn, { model, spent: tokens() });
   addUp(turns.get(turn).spent, entry.usage);
  }
  const side = await this.library.side?.(conv.id);
  let mini = null;
  for (const entry of side?.messages || []) if (entry.usage && (entry.role === 'assistant' || entry.role === 'compact')) addUp(mini ||= tokens(), entry.usage);
  const order = [...models.keys()];
  return {
   version: 1,
   models: order.map(id => ({ id, name: this.settings.find(id)?.name || String(id).split(':').pop(), ...models.get(id) })),
   turns: [...turns.values()].map(({ model, spent }) => ({ m: order.indexOf(model), t: spent.input + spent.output, c: spent.cached })),
   mini,
   context: { used: conv.tokens || 0, window: this.settings.windowOf(this.modelOf(conv)) },
   uncounted: uncounted.size,
  };
 }

 // Puts the chat's numbers into it as a card. The card is the user's only: it is kept with the chat, but no model ever sees it.
 async postStats(from = null) {
  const conv = this.active;
  if (!this.canStats) return false;
  const stats = await this.stats(conv);
  if (conv !== this.active || conv.turn) return false;
  const entry = { role: 'stats', stats };
  conv.messages.push(entry);
  const el = this.entryView(entry);
  this.nodes.set(entry, el);
  this.main.classList.remove('is-empty');
  this.follow = true;
  this.pinUntil = performance.now() + PIN_TIME;
  this.anchor = el;
  setTimeout(() => { if (this.anchor === el) this.anchor = null; }, PIN_TIME);
  conv.list.append(el);
  StatsCard.enter(el, { from, pin: () => this.pin() });
  // Saved without moving the chat up the list: nothing was said in it.
  this.library.saveMessages(conv.id, conv.messages, conv.tokens);
  return true;
 }

 onStatsRemove(event) {
  const el = event.target.closest('.stats-item'), entry = el?.__entry, conv = el?.closest('.thread-list')?.__conversation;
  if (!entry || !conv) return;
  drop(conv.messages, entry);
  // A card taken away right after it came in no longer holds the chat's view.
  if (this.anchor === el) this.anchor = null;
  StatsCard.leave(el);
  if (conv.record && this.library.chat(conv.id)) this.library.saveMessages(conv.id, conv.messages, conv.tokens);
 }

 restore(conv) {
  this.attach(conv);
  const ends = new Map();
  for (const entry of conv.messages) if (entry.role === 'assistant' && entry.content?.trim()) ends.set(entry.turn || entry, entry);
  for (const entry of conv.messages) {
   const el = this.entryView(entry, ends.get(entry.turn || entry) === entry);
   if (!el) continue;
   conv.list.append(el);
   this.nodes.set(entry, el);
  }
  settle(conv.list);
 }

 // What a saved entry shows as when its chat opens; `last` marks the reply that ends its turn.
 entryView(entry, last) {
  if (entry.role === 'user') return this.userMessage(this.promptOf(entry));
  if (entry.role === 'compact') return this.compactNotice(false);
  if (entry.role === 'stats') {
   const el = StatsCard.build(entry.stats);
   el.__entry = entry;
   return el;
  }
  if (entry.content?.trim()) return this.restoredMessage(entry, last);
  return null;
 }

 promptOf(entry) {
  const urls = Array.isArray(entry.content) ? entry.content.filter(part => part.type === 'image_url').map(part => part.image_url.url) : [];
  let k = 0;
  const attachments = (entry.attachments || []).map(item => ({
   ...item, info: FileKinds.describe(item.name), url: item.image ? urls[k++] || '' : item.video?.poster || '', duration: item.video?.duration || 0,
  }));
  return { text: entry.text || '', attachments };
 }

 restoredMessage(entry, last = true) {
  const el = document.createElement('div');
  el.className = 'message is-assistant';
  const content = document.createElement('div');
  content.className = 'message-content markdown';
  el.append(content);
  StreamView.render(content, entry.content);
  el.__entry = entry;
  if (last) el.append(this.toolbar());
  return el;
 }

 toolbar() {
  const tools = document.createElement('div');
  tools.className = 'message-tools';
  tools.innerHTML = `<button class="md-copy message-copy" type="button" aria-label="${I18n.t('message.copy')}">${Markdown.COPY_ICON}</button>`;
  return tools;
 }

 showGhost(view) {
  const current = view.status;
  if (current?.isConnected && !current.classList.contains('is-leaving')) {
   if (current !== view.el.lastElementChild && view.content.hasChildNodes()) view.el.append(current);
   return;
  }
  const status = document.createElement('div');
  status.className = 'message-status is-working';
  status.innerHTML = '<ghost-thinking></ghost-thinking>';
  view.el.append(status);
  view.status = status;
  if (view.el.closest('.thread-list') === this.active?.list) this.followBottom();
 }

 dismissGhost(view) {
  const status = view.status;
  if (!status?.isConnected || status.classList.contains('is-leaving')) return;
  status.classList.add('is-leaving');
  if (reducedMotion()) { status.remove(); return; }
  const style = getComputedStyle(status);
  status.animate([
   { height: `${status.offsetHeight}px`, paddingTop: style.paddingTop, opacity: 1, transform: 'none' },
   { height: '0px', paddingTop: '0px', opacity: 0, transform: 'scale(0.7)' },
  ], LEAVE).finished.then(() => status.remove());
 }

 fail(conv, view, error) {
  const box = document.createElement('div');
  box.className = 'message-error';
  box.textContent = error.message;
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  if (error.status === 401) actions.append(this.action(I18n.t('chat.open-settings'), () => this.settings.open()));
  actions.append(this.action(I18n.t('chat.retry'), () => this.retry(conv, view)));
  view.el.append(box, actions);
 }

 retry(conv, view) {
  if (conv.turn) return;
  const config = this.config(conv);
  if (!config.ready) {
   this.settings.open(I18n.t('settings.key.needed'), config.provider);
   return;
  }
  for (const node of view.el.querySelectorAll('.message-error, .message-actions')) node.remove();
  if (!conv.messages.includes(view.el.__entry)) view.el.remove();
  if (conv === this.active) this.follow = true;
  this.resume(conv, config);
  if (conv === this.active) this.followBottom();
 }

 note(view, text) {
  const note = document.createElement('div');
  note.className = 'message-note';
  note.textContent = text;
  view.el.append(note);
 }

 action(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'message-action';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
 }

 userMessage({ text, attachments }) {
  const el = document.createElement('div');
  el.className = 'message is-user';
  // A video sent the moment it was added may still be having its frame taken: the attachments come in once it is there.
  if (attachments.some(item => item.info?.glyph === 'video' && item.ready && !item.payload)) {
   Promise.all(attachments.map(item => item.ready)).then(() => el.prepend(...this.attachmentViews(attachments)));
  } else {
   el.append(...this.attachmentViews(attachments));
  }
  const { quotes, rest } = splitQuotes(text);
  for (const quote of quotes) {
   const box = document.createElement('div');
   box.className = 'message-quote';
   box.innerHTML = Glyphs.quote;
   const body = document.createElement('span');
   body.className = 'message-quote-text';
   body.textContent = quote;
   box.title = quote;
   box.append(body);
   el.append(box);
  }
  if (rest) {
   const bubble = document.createElement('div');
   bubble.className = 'message-bubble';
   LinkChip.fill(bubble, rest);
   el.append(bubble);
  }
  if (text) {
   el.append(this.toolbar());
   el.__entry = { content: text };
  }
  return el;
 }

 // Photos and videos with a frame go into the stack of pictures; everything else is a file's card.
 attachmentViews(attachments) {
  const views = [], media = attachments.filter(item => (item.image || item.video) && item.url), files = attachments.filter(item => !item.image && !media.includes(item));
  if (media.length) views.push(new MediaSlider(media.map(({ url, width, height, name, note, video, duration }) => ({ url, width, height, name, note, video: !!video, duration }))).el);
  if (files.length) {
   const box = document.createElement('div');
   box.className = 'message-files';
   for (const item of files) box.append(this.fileCard(item));
   views.push(box);
  }
  return views;
 }

 fileCard(item) {
  const card = document.createElement('div');
  card.className = 'file-card';
  card.title = item.pasted?.preview || item.name;
  card.innerHTML = FileKinds.icon(item.info);
  const text = document.createElement('div');
  text.className = 'file-card-text';
  const name = document.createElement('div');
  name.className = 'file-card-name';
  name.textContent = item.pasted?.preview || item.name;
  const meta = document.createElement('div');
  meta.className = 'file-card-meta';
  meta.textContent = item.pasted ? Attachments.pastedLabel(item.pasted, item.size)
   : [item.info.name, item.duration ? FileKinds.formatDuration(item.duration) : '', FileKinds.formatSize(item.size)].filter(Boolean).join(' · ');
  text.append(name, meta);
  if (item.note) {
   const note = document.createElement('div');
   note.className = 'file-card-note';
   note.textContent = item.note;
   text.append(note);
  }
  card.append(text);
  return card;
 }

 assistantMessage(conv) {
  const el = document.createElement('div');
  el.className = 'message is-assistant is-streaming';
  el.innerHTML = '<div class="message-status"><ghost-thinking></ghost-thinking></div><div class="message-content markdown"></div>';
  const content = el.querySelector('.message-content');
  return { el, status: el.querySelector('.message-status'), content, stream: new StreamView(content, { onChange: () => { if (conv === this.active) this.followBottom(); } }) };
 }
}

// What the model of the mini chat is told, in notes from the app between the chat and the mini chat's own messages.
const SIDE = {
 note: [
  'This note comes from the app, not from the user.',
  '# Mini chat',
  'Everything above is the main conversation, as it stands right now. What follows is the mini chat: a small side window the user opened over it for quick questions about it, or about anything else.',
  '- Answer briefly and to the point.',
  '- Nothing from the mini chat goes into the main conversation: the agent working there never sees these questions or your answers.',
  '- The mini chat keeps its messages while the user goes back to the main conversation. Where the main conversation moved on in between, a note says so: answers before such a note may be out of date, so go by the main conversation as it is now.',
 ].join('\n'),
 busy: '- The agent of the main conversation is still working on its latest request, so its last steps may be missing above.',
 moved: 'This note comes from the app, not from the user: here the user went back to the main conversation, and it has moved on since. The main conversation above is as it stands now; the side questions and answers before this note were asked earlier.',
 compacted: 'This note comes from the app, not from the user. It is about the mini chat, not the main conversation.',
 // The mini chat folds its own messages away only once they take this share of the model's window: the chat compacts itself.
 share: 0.05,
};

function movedNotice() {
 const el = document.createElement('div');
 el.className = 'thread-compact thread-moved';
 const text = document.createElement('span');
 text.className = 'thread-compact-text';
 text.textContent = I18n.t('mini.moved');
 el.append(text);
 return el;
}

// The mini chat over a chat. It keeps its own messages with that chat, and reads the chat afresh for every request, so a
// question asked after the chat has moved on is answered against the chat as it is now. Its request opens exactly like the
// chat's own, the same system prompt and the same history, so the provider serves that part from the cache the chat has
// already paid for; the mini chat's own words come after it.
class SideChat extends Chat {
 constructor({ library, origin, model, ...options }) {
  const state = { seen: 0 };
  const record = { id: origin.id, title: '', folder: origin.record.folder, created: 0, updated: 0, pinned: false, named: true, model };
  if (library.isHome(origin.record)) record.space = origin.record.space;
  super({ ...options, library: {
   folders: [],
   chats: [record],
   chat: id => id === record.id ? record : null,
   update: (id, changes) => id === record.id ? Object.assign(record, changes) : null,
   conversation: id => library.side(id).then(body => { state.seen = body.seen; return body; }),
   saveMessages: (id, messages, tokens) => library.saveSide(id, { messages, tokens, seen: state.seen }),
   clear: id => library.clearSide(id),
   isProtected: () => false,
   isLocked: () => false,
   relock() {},
   isHome: chat => library.isHome(chat),
   cwdOf: chat => library.cwdOf(chat),
  } });
  this.state = state;
  this.origin = origin;
  this.waiting = null;
  this.driving = null;
 }

 get hasMessages() {
  return !!this.active?.record && this.active.messages.some(entry => entry.role === 'user');
 }

 // The chat has changed since the latest question asked here.
 get behind() {
  return this.hasMessages && (this.origin.record?.updated || 0) > this.state.seen;
 }

 // Opens the mini chat's own messages, and where the chat has moved on since, a line says the mini chat caught up with it.
 async start() {
  await this.open(this.origin.id);
  if (!this.behind) return;
  this.waiting = movedNotice();
  this.active.list.append(this.waiting);
  this.pin();
 }

 send(text, attachments = []) {
  const conv = this.active;
  if (!conv?.record) return false;
  if (conv.turn) return super.send(text, attachments);
  const mark = this.behind ? { role: 'moved' } : null, seen = this.state.seen;
  if (mark) {
   conv.messages.push(mark);
   if (!this.waiting) conv.list.append(this.waiting = movedNotice());
  }
  this.state.seen = this.origin.record?.updated || 0;
  if (!super.send(text, attachments)) {
   if (mark) drop(conv.messages, mark);
   this.state.seen = seen;
   return false;
  }
  if (mark) this.nodes.set(mark, this.waiting);
  this.waiting = null;
  return true;
 }

 history(conv) {
  const model = this.modelOf(conv);
  const own = conv.messages.map(entry => {
   if (entry.role === 'moved') return { role: 'user', content: SIDE.moved };
   // An answer another model wrote goes back without its signed blocks, which only that model can read.
   if (entry.role === 'assistant' && entry.steps && entry.model && entry.model !== model) return { ...entry, steps: entry.steps.map(({ native, ...step }) => step) };
   return entry;
  });
  const note = [SIDE.note, this.origin.turn ? SIDE.busy : ''].filter(Boolean).join('\n');
  // A summary of the mini chat's own start stays a note after the chat: as a system message it would change the prompt's start.
  const side = super.history({ messages: own }).map(message => message.role === 'system' ? { role: 'user', content: `${SIDE.compacted}\n\n${message.content}` } : message);
  return [...super.history({ messages: snapshot(this.origin.messages) }), { role: 'user', content: note }, ...side];
 }

 // The mini chat's request opens with the chat itself, and the chat has paid for a cache that ends where it ends: the
 // mark goes on the chat's last message, however many of the mini chat's own have come after it.
 seam(conv, messages) {
  return messages.findIndex(message => message.role === 'user' && typeof message.content === 'string' && message.content.startsWith(SIDE.note)) - 1;
 }

 async compactIfNeeded(conv, turn) {
  if (estimate(super.history(conv)) < this.settings.windowOf(turn.config.id) * SIDE.share) return;
  await super.compactIfNeeded(conv, turn);
 }

 entryView(entry, last) {
  return entry.role === 'moved' ? movedNotice() : super.entryView(entry, last);
 }

 // The mini chat's model reads the chat too, so the videos attached there are the user's to show here as well.
 attachedVideos(conv) {
  return [...super.attachedVideos({ messages: this.origin.messages }), ...super.attachedVideos(conv)];
 }

 run(conv, prompt, config, bubble) {
  return this.driving = super.run(conv, prompt, config, bubble);
 }

 resume(conv, config) {
  return this.driving = super.resume(conv, config);
 }

 // Resolves once no reply is being written here and what the last one wrote is on its way to the disk.
 idle() {
  return Promise.resolve(this.driving).catch(() => {});
 }

 // Starts the mini chat over: its messages go, from the screen and from the disk.
 clear() {
  const conv = this.active;
  if (!conv?.record) return Promise.resolve();
  this.abort(conv);
  conv.messages = [];
  conv.tokens = 0;
  this.state.seen = 0;
  this.waiting = null;
  conv.list.replaceChildren();
  this.main.classList.add('is-empty');
  this.syncBottom();
  this.onChange();
  return this.library.clear(conv.id);
 }
}

window.Chat = Chat;
window.SideChat = SideChat;
})();
