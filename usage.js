(() => {
'use strict';

// The app's own count of the tokens each provider was sent and wrote back, kept by day and model on this computer only.
// Providers bill these same numbers. The count starts with the version that brought it: nothing was kept before.
const KEY = 'usage';
const SAVE_DELAY = 800;
const PROVIDERS = ['chatgpt', 'openai', 'anthropic', 'deepseek', 'compatible'];
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

class Usage {
 constructor(store) {
  this.store = store;
  this.providers = PROVIDERS;
  this.data = { version: 1, since: 0, days: {}, names: {} };
  this.listeners = new Set();
  this.timer = 0;
  this.ready = store.read(KEY).then(saved => {
   if (saved?.version === 1) this.data = { ...this.data, ...saved };
  }).catch(() => {});
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
   const data = this.data, id = `${provider}|${model}`;
   data.since ||= Date.now();
   const row = (data.days[daysAgo(0)] ||= {})[id] ||= [0, 0, 0, 0, 0];
   row[INPUT] += input;
   row[CACHED] += cached;
   row[WRITTEN] += written;
   row[OUTPUT] += output;
   row[REQUESTS] += 1;
   if (name) data.names[id] = name;
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
   this.store.write(KEY, this.data).catch(() => {});
  }, SAVE_DELAY);
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
