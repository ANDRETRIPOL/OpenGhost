(() => {
'use strict';

// The app's own count of the tokens each provider was sent and wrote back, kept by day and model on this computer only.
// Providers bill these same numbers. The count starts with the version that brought it: nothing was kept before.
const KEY = 'usage';
const SAVE_DELAY = 800;
const PROVIDERS = ['chatgpt', 'openai', 'anthropic', 'deepseek', 'openrouter'];
// Per day and model: tokens sent, of them read from the provider's cache, written to it, tokens written back, requests.
const [INPUT, CACHED, WRITTEN, OUTPUT, REQUESTS] = [0, 1, 2, 3, 4];

const pad = n => String(n).padStart(2, '0');
const dayOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// The day `back` days before today, by the calendar rather than by hours, so a clock change never skips one.
function daysAgo(back) {
 const date = new Date();
 date.setDate(date.getDate() - back);
 return dayOf(date);
}

const empty = () => ({ input: 0, cached: 0, written: 0, output: 0, requests: 0, tokens: 0, models: {} });
const blank = () => ({ version: 1, since: 0, days: {}, names: {} });

// Adds what one count holds into another.
function add(into, from) {
 into.since ||= from.since;
 for (const [day, rows] of Object.entries(from.days)) {
  const mine = into.days[day] ||= {};
  for (const [id, row] of Object.entries(rows)) {
   const sum = mine[id] ||= [0, 0, 0, 0, 0];
   for (let k = 0; k < sum.length; k++) sum[k] += row[k] || 0;
  }
 }
 Object.assign(into.names, from.names);
 return into;
}

class Usage {
 constructor(store) {
  this.store = store;
  this.providers = PROVIDERS;
  this.data = blank();
  // What was counted here and is not on the disk yet. With the quick chat the app has two windows that count: each
  // adds its own to what the disk holds, so neither writes over what the other counted.
  this.fresh = null;
  this.listeners = new Set();
  this.timer = 0;
  this.ready = this.load();
  store.onChange?.(key => { if (key === KEY) this.load().then(() => { for (const listener of this.listeners) listener(); }); });
 }

 // The count as the disk has it, with what is still to be written here on top.
 async load() {
  const saved = await this.store.read(KEY).catch(() => null);
  const data = { ...blank(), ...(saved?.version === 1 ? saved : {}) };
  if (this.fresh) add(data, this.fresh);
  this.data = data;
 }

 // One answer's tokens as every provider reports them, in the same words: sent, of them read from the provider's cache or
 // written to it, and written back. Null when the provider said nothing.
 parts(usage) {
  if (!usage) return null;
  const input = usage.prompt_tokens || 0, output = usage.completion_tokens || 0;
  if (!input && !output) return null;
  const cached = usage.cached_tokens ?? usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;
  return { input, cached: Math.min(cached, input), written: usage.written_tokens || 0, output };
 }

 // One answer's tokens: what was sent (and how much of it the provider read from its cache or wrote to it) and what came back.
 record({ provider, model, name }, usage) {
  const parts = this.parts(usage);
  if (!parts || !PROVIDERS.includes(provider) || !model) return;
  const { input, cached, written, output } = parts;
  this.ready.then(() => {
   const id = `${provider}|${model}`, one = blank();
   one.since = Date.now();
   const row = (one.days[daysAgo(0)] = {})[id] = [0, 0, 0, 0, 0];
   row[INPUT] = input;
   row[CACHED] = cached;
   row[WRITTEN] = written;
   row[OUTPUT] = output;
   row[REQUESTS] = 1;
   if (name) one.names[id] = name;
   add(this.data, one);
   add(this.fresh ||= blank(), one);
   this.save();
   for (const listener of this.listeners) listener();
  });
 }

 // Every provider's tokens over the last `days` days, today included; with no count, over all the time there is.
 totals(days = 0) {
  return this.between(days ? daysAgo(days - 1) : '', '9999');
 }

 // Every provider's tokens from one day to another, both included; days are written YYYY-MM-DD.
 between(from, to) {
  const out = {};
  for (const [day, rows] of Object.entries(this.data.days)) {
   if (day < from || day > to) continue;
   for (const [id, row] of Object.entries(rows)) {
    const provider = id.slice(0, id.indexOf('|')), total = out[provider] ||= empty();
    total.input += row[INPUT];
    total.cached += row[CACHED];
    total.written += row[WRITTEN];
    total.output += row[OUTPUT];
    total.requests += row[REQUESTS];
    total.tokens += row[INPUT] + row[OUTPUT];
    total.models[id] = (total.models[id] || 0) + row[INPUT] + row[OUTPUT];
   }
  }
  return out;
 }

 // The last `count` days, oldest first, each with the tokens of every provider that day.
 daily(count) {
  return Array.from({ length: count }, (_, k) => this.day(daysAgo(count - 1 - k)));
 }

 // Every day of a month, written YYYY-MM, the days still to come included.
 month(key) {
  const [year, month] = key.split('-').map(Number), length = new Date(year, month, 0).getDate();
  return Array.from({ length }, (_, k) => this.day(`${key}-${pad(k + 1)}`));
 }

 day(day) {
  const rows = this.data.days[day] || {}, providers = {};
  for (const [id, row] of Object.entries(rows)) {
   const provider = id.slice(0, id.indexOf('|'));
   providers[provider] = (providers[provider] || 0) + row[INPUT] + row[OUTPUT];
  }
  return { day, providers };
 }

 // The months with anything counted, oldest first, written YYYY-MM.
 months() {
  return [...new Set(Object.keys(this.data.days).map(day => day.slice(0, 7)))].sort();
 }

 // This month, written YYYY-MM.
 get thisMonth() {
  return daysAgo(0).slice(0, 7);
 }

 nameOf(id) {
  return this.data.names[id] || id.slice(id.indexOf('|') + 1);
 }

 get since() {
  return this.data.since;
 }

 onChange(listener) {
  this.listeners.add(listener);
 }

 save() {
  clearTimeout(this.timer);
  this.timer = setTimeout(() => {
   this.timer = 0;
   this.write();
  }, SAVE_DELAY);
 }

 // What was counted here is added to the count on the disk as it is now, and the sum is written.
 async write() {
  const fresh = this.fresh;
  if (!fresh) return;
  this.fresh = null;
  let sum = this.data;
  try {
   const saved = await this.store.read(KEY);
   sum = add({ ...blank(), ...(saved?.version === 1 ? saved : {}) }, fresh);
   // What was counted meanwhile stays in the picture, and is written next.
   this.data = this.fresh ? add(structuredClone(sum), this.fresh) : sum;
  } catch {}
  await this.store.write(KEY, sum).catch(() => {});
 }

 flush() {
  if (!this.timer) return;
  clearTimeout(this.timer);
  this.timer = 0;
  this.store.write(KEY, this.data).catch(() => {});
 }
}

window.Usage = new Usage(window.ChatStore);
})();
