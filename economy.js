(() => {
'use strict';

// Economy: a chat keeps less of itself in mind, and costs less for it.
//
// Every request of a chat carries the whole chat again. A provider's cache makes the part it has seen cheaper, not
// free: a chat grown to 800K tokens pays for 800K at every step of the agent. So the chat is summarized sooner, at a
// size the user picks on the arc in the composer (economy-arc.js), and goes on from the summary (the compaction in
// chat.js). The agent is told nothing of it and works as before; what changes is how much of the far past it carries
// word for word.
//
// Some models also charge more for the whole of a long request once it passes a step (prices.js): Claude Haiku 5.5
// five times as much past 100K, GPT models twice as much past 272K. A chat that saves at all stays under such a step.
//
// A chat keeps the size it was given (`economy` in its record: tokens, 0 for none). New chats get the last one picked.
const KEY = 'economy';
// The sizes the arc stops at, the first being none: the chat is summarized near the end of its model's window, as always.
const STOPS = [0, 500000, 300000, 200000, 150000, 100000];
// A price step lower than this is not kept under: below it the chat would be summarized every few steps, and every
// summary makes the provider read the chat anew, past its cache. That costs more than it saves.
const LOWEST_STEP = 64000;
// How far under a price step a chat stays: what the app counts by itself between two answers of the model can be off a
// little, and notes from the app ride along with each request.
const UNDER = { share: 0.03, least: 3000 };
// A chat without economy is summarized at this share of its model's window (chat.js, CONTEXT.reserve).
const FULL = 0.9;
// What every request carries before anything said in the chat (its base: instructions, tools, memory, the chat's
// record, the user's files) stays whatever the size: the size is never so small that less than this is left for the
// work, or the chat would be summarized every few steps. A price step is kept under only while this much is left above
// the base; with less, staying under it would cost the work more than the step does.
const ROOM = 48000;
const STEP_ROOM = 24000;
// The providers whose models are priced by the companies' own lists: their steps and prices are read from
// OpenRouter's list (prices.js) under the company's name.
const LISTED = { anthropic: 'anthropic', openai: 'openai', deepseek: 'deepseek' };
// What a long session of the agent looks like when the app works out what a size saves: the instructions and tools,
// what one step adds (its call and its result), what it writes, how long a summary and the turns kept after it are.
const SESSION = { steps: 300, system: 18000, adds: 3000, writes: 1000, summary: 6000, kept: 10000 };
// The ChatGPT subscription is not billed by tokens; its limits are, roughly as Codex's credits weigh them.
const LIMIT_WEIGHTS = { in: 1, hit: 0.05, write: 1, out: 5, over: [] };
// A model whose prices nobody lists is weighed as most are priced.
const USUAL_WEIGHTS = { in: 1, hit: 0.1, write: 1, out: 4, over: [] };
// Ghost Max: the other way from economy, for work where the agent must miss nothing. The chat's private record holds
// more (`record` characters instead of 40,000), a summary is written fuller (up to about `words` words), and more of
// the chat stays word for word after it: the last `turns` messages and replies (within `kept` of the window, at most
// `keptMost` tokens) and the task's latest steps with their tool results (at most `tail` tokens).
const RECORD_CHARS = 40000;
const GHOST = {
 1: { record: 80000, words: 3000, turns: 4, kept: 0.15, keptMost: 30000, tail: 30000 },
 2: { record: 120000, words: 6000, turns: 6, kept: 0.2, keptMost: 45000, tail: 50000 },
};
// Characters per token of a full record, the fewer of the two languages measured on GPT-6 Luna (3.38 in Russian, 4.2
// in English), so a record is never counted short; and tokens per word of a summary in either.
const RECORD_CHARS_PER_TOKEN = 3.3;
const SUMMARY_TOKENS_PER_WORD = 2.2;

const norm = id => String(id || '').toLowerCase().replace(/^~/, '').split(':')[0].replace(/\./g, '-').replace(/-20\d{6}$/, '');
const size = value => Math.max(0, Math.round(Number(value) || 0));

class Economy {
 constructor(store, bridge) {
  this.store = store;
  this.bridge = bridge;
  // The size new chats get, and their Ghost Max: the last ones picked.
  this.value = 0;
  this.ghostLevel = 0;
  this.listed = {};
  this.asked = false;
  this.listeners = new Set();
  this.timer = 0;
  store?.onChange?.(key => { if (key === KEY && !this.timer) this.load(); });
  this.ready = this.load();
 }

 get stops() { return STOPS; }
 get room() { return ROOM; }
 get stepRoom() { return STEP_ROOM; }

 async load() {
  const saved = await this.store?.read(KEY).catch(() => null);
  this.value = saved?.version === 2 ? size(saved.value) : 0;
  this.ghostLevel = saved?.version === 2 && GHOST[saved.ghost] ? saved.ghost : 0;
  if (this.value) this.wantPrices();
  this.emit();
 }

 onChange(listener) {
  this.listeners.add(listener);
  return () => this.listeners.delete(listener);
 }

 emit() {
  for (const listener of this.listeners) listener();
 }

 // The size new chats get (and their Ghost Max, which takes the place of any size); written a moment later, so a drag
 // along the arc is one write.
 set(value, ghost = 0) {
  this.value = size(value);
  this.ghostLevel = GHOST[ghost] ? ghost : 0;
  if (this.ghostLevel) this.value = 0;
  if (this.value) this.wantPrices();
  clearTimeout(this.timer);
  this.timer = setTimeout(() => { this.timer = 0; this.write(); }, 300);
  this.emit();
 }

 write() {
  this.store?.write(KEY, { version: 2, value: this.value, ghost: this.ghostLevel }).catch(() => {});
 }

 flush() {
  if (!this.timer) return;
  clearTimeout(this.timer);
  this.timer = 0;
  this.write();
 }

 // The prices of Claude, GPT and DeepSeek used with their own keys are read once some chat saves (prices.js).
 wantPrices() {
  if (this.asked || !this.bridge?.steps) return;
  this.asked = true;
  this.bridge.steps().then(found => {
   this.listed = found?.models && typeof found.models === 'object' ? found.models : {};
   // A list that could not be read is asked for again a little later, at the next look at a chat's size.
   if (!found?.at) setTimeout(() => { this.asked = false; }, 30 * 1000);
   this.emit();
  }).catch(() => { setTimeout(() => { this.asked = false; }, 30 * 1000); });
 }

 listing(model) {
  const vendor = LISTED[model?.provider];
  return vendor ? this.listed[`${vendor}/${norm(model.api)}`] || null : null;
 }

 // The token count past which a model costs more for the whole request, if it has one worth staying under. The
 // ChatGPT subscription has none: OpenAI charges it no more for a long request.
 stepOf(model) {
  if (!model || model.provider === 'chatgpt') return 0;
  const steps = Array.isArray(model.steps) ? model.steps : this.listing(model)?.steps;
  return (Array.isArray(steps) ? steps : []).find(at => at >= LOWEST_STEP) || 0;
 }

 // Where a price step is kept under, if it is.
 under(step) {
  return step ? step - Math.max(UNDER.least, Math.round(step * UNDER.share)) : 0;
 }

 // How much a chat on `model` may carry when it saves down to `value` tokens (0: it doesn't), with `base` tokens in
 // every request whatever is said, and what set that: { limit, window, value, base, step, by, on }. `by` is 'window',
 // 'value', 'base' (the size was raised to leave room for the work) or 'step'. `on` is whether economy holds the chat
 // below where it would be summarized anyway.
 limit(model, value, window, base = 0) {
  const full = Math.floor(window * FULL), want = size(value), fixed = size(base);
  const out = { limit: full, window, value: want, base: fixed, step: 0, by: 'window', on: false };
  if (!want) return out;
  this.wantPrices();
  const step = this.stepOf(model), need = Math.max(want, fixed + ROOM);
  out.step = step;
  if (need < out.limit) Object.assign(out, { limit: need, by: need > want ? 'base' : 'value' });
  const under = this.under(step);
  if (under && under - fixed >= STEP_ROOM && under < out.limit) Object.assign(out, { limit: under, by: 'step' });
  out.on = out.limit < full;
  return out;
 }

 // ---- Ghost Max

 ghost(level) { return GHOST[level] || null; }
 get recordChars() { return RECORD_CHARS; }

 // How many tokens a record of `chars` characters takes, counted so it is never short.
 recordTokens(chars) { return Math.ceil(Math.max(0, chars) / RECORD_CHARS_PER_TOKEN); }

 // What a summary of a level may run to, in tokens.
 summaryTokens(level) { return GHOST[level] ? Math.ceil(GHOST[level].words * SUMMARY_TOKENS_PER_WORD) : 0; }

 // Whether a level fits a model's window: what every request carries with the record grown to the level's size, a full
 // summary, the turns kept after it and the work's room, under where the chat is summarized.
 ghostFits(level, window, base = 0, recordChars = 0) {
  const g = GHOST[level];
  if (!g || !window) return false;
  const grown = size(base) + this.recordTokens(g.record) - this.recordTokens(Math.min(recordChars, g.record));
  const need = grown + this.summaryTokens(level) + Math.min(window * g.kept, g.keptMost) + ROOM;
  return need <= window * FULL;
 }

 // How many more tokens every request carries once the record is as full as the level lets it be.
 ghostExtra(level) {
  return GHOST[level] ? this.recordTokens(GHOST[level].record) - this.recordTokens(RECORD_CHARS) : 0;
 }

 // What a model costs, per token, as its provider lists it: { in, hit, write, out, over: [{ at, in, hit, write, out }] }.
 // `kind` says what the saving is in: money, or the subscription's limits. A model on the user's own computer costs
 // nothing, and gets no figure.
 priceOf(model) {
  if (!model || model.provider === 'local' || model.provider === 'custom') return null;
  if (model.provider === 'chatgpt') return { kind: 'limit', price: LIMIT_WEIGHTS };
  const price = model.price || this.listing(model)?.price;
  return { kind: 'money', price: price?.in > 0 ? price : USUAL_WEIGHTS, known: !!(price?.in > 0) };
 }

 // What a long session costs when the chat is summarized at `limit`, in the model's own prices.
 session(price, limit, base = SESSION.system) {
  const at = prompt => {
   let tier = price;
   for (const over of price.over || []) if (prompt > over.at) tier = { ...price, ...over };
   const input = tier.in, hit = tier.hit ?? input / 10, write = tier.write ?? input;
   return { hit, write, out: tier.out ?? input * 4 };
  };
  const { steps, adds, writes, summary, kept } = SESSION, system = base;
  let context = system + 2000, cached = system, total = 0;
  for (let k = 0; k < steps; k++) {
   if (context >= limit) {
    const p = at(context);
    total += cached * p.hit + (context - cached) * p.write + summary * p.out;
    context = system + summary + kept;
    cached = system;
   }
   const p = at(context);
   total += cached * p.hit + (context - cached) * p.write + writes * p.out;
   cached = context;
   context += adds + writes;
  }
  return total;
 }

 // How many times less a long session costs at `value` than without economy, for the arc to show: { times, kind }, or
 // null where there is nothing to tell (a model on the user's computer, a size that changes nothing).
 saving(model, value, window, base = 0) {
  const priced = this.priceOf(model), plan = this.limit(model, value, window, base);
  if (!priced || !plan.on) return null;
  const system = Math.max(SESSION.system, size(base));
  const times = this.session(priced.price, Math.floor(window * FULL), system) / this.session(priced.price, plan.limit, system);
  return { times, kind: priced.kind, plan };
 }
}

window.Economy = new Economy(window.ChatStore, window.openghost?.llm);
window.Economy.Class = Economy;
})();
