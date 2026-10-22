(() => {
'use strict';

// What of a chat is worth keeping, asked apart of the chat's own model once the agent has finished a reply (chat.js
// keepFacts). Models of every size let facts pass by while they work, the weaker ones nearly all of them: the chat's
// record, which outlives its summaries, and the memory every chat shares are kept here whatever the agent did itself.
// The model sees the exchange since the last look, the record and the memory as they stand, and answers with what
// to add or change; the app writes it the way the agent's own tools would.
const KEEP = {
 // What goes to the model of the exchange, of the record and of the memory, in characters: the latest is kept.
 exchange: 9000,
 record: 8000,
 memory: 4000,
 // Of one tool call: its arguments and its result.
 args: 160,
 result: 260,
 answer: 900,
 // At most from one look: lines of the record, records of the memory, and how long either may be.
 lines: 8,
 saves: 6,
 line: 400,
 // A look is worth asking for once the user has said this many words since the last, or the agent has worked.
 words: 4,
};

// The agent's own hands on these stores, and the plan, are not facts of the work.
const OWN = new Set(['record', 'memory', 'plan', 'notepad', 'skill']);

const SYSTEM = [
 'You keep two stores for an AI assistant, from the latest exchange between the user and the assistant. Facts come from the exchange alone: what the stores hold already is shown so that nothing is written twice, never as a source.',
 '',
 '1. The chat\'s record: a private file of this chat that outlives the summaries the chat is cut down to. It holds the exact facts a summary would blur and that would still matter in two weeks: what the user wants and why, what they liked and did not; decisions, constraints, names, prices, dates, addresses, numbers, versions, paths and ports; what was tried, what came of it and why it failed; what a test or a page showed. One fact a line, short. Never the date or the time of the moment: the app stamps every line. No diary of steps, no retelling of the chat, no small talk, no secrets (passwords, keys, card and document numbers).',
 '',
 '2. The memory of the user, shared by all their chats: who they are (name, work, languages, where they live, what they are building), their computer and the tools they use, how they want answers and work done, and corrections of the assistant they would not want to make twice. One thing a record: who they are, what they work with and how they want answers are separate records. One or two plain sentences each, in the third person, that read right alone a year from now. Not what belongs to this task or this chat alone (that goes into the record), not guesses, and health, money, beliefs or family only when the user asked to remember them.',
 '',
 'Write in the language the user writes in, with names spelled as they spell them.',
 '',
 'A request goes in only for the lasting goal or constraint it holds (dates, a budget, what they want made), never as a report that it was asked. A request that came to nothing, a refusal, a question answered from general knowledge: there is nothing to keep, and both lists stay empty.',
 '',
 'Look at what each store holds already and put in only what this exchange adds. A fact already there, in any words, is not written again. A fact that changed is an edit, so that no two lines ever disagree: in the record, "old" is the exact text to replace, copied from it, and "new" what replaces it; to take out a line no longer true, "old" is that whole line and "new" is empty. In the memory, "id" is the record\'s id and "text" its whole new wording. Keep what the user said and what the work established, never what you guess. When unsure whether a fact will matter later, keep it in the record: a line too many costs little, a lost fact costs much.',
 '',
 'Answer with JSON only, nothing around it: {"record":[{"add":"..."},{"old":"...","new":"..."}],"memory":[{"save":"..."},{"id":"m3","text":"..."}]}. Leave a list empty when there is nothing for it.',
].join('\n');

// The memory is off, the chat is protected, or the agent changed the memory itself in this exchange.
const OFF = 'The memory is not yours to change this time: leave "memory" empty.';

const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(part => part?.text || '').join(' ') : '';
const squeeze = (value, max) => {
 const flat = String(value || '').replace(/\s+/g, ' ').trim();
 return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

// The exchange as the model is given it: what the user wrote, what the agent did (each tool call with the start of its
// result) and what it said. Pills and summaries are the app's own, not the exchange.
function exchange(entries) {
 const lines = [];
 for (const entry of entries) {
  if (entry.role === 'user') {
   const said = (entry.text ?? text(entry.content)).trim();
   if (said) lines.push(`User: ${said}`);
   continue;
  }
  if (entry.role !== 'assistant') continue;
  const results = new Map((entry.steps || []).filter(step => step.role === 'tool').map(step => [step.tool_call_id, text(step.content)]));
  for (const step of entry.steps || []) {
   for (const call of step.tool_calls || []) {
    const name = call.function?.name || '';
    if (OWN.has(name)) continue;
    lines.push(`Tool ${name} ${squeeze(call.function?.arguments, KEEP.args)} → ${squeeze(results.get(call.id), KEEP.result)}`);
   }
  }
  if (entry.content?.trim()) lines.push(`Assistant: ${entry.content.trim()}`);
 }
 const all = lines.join('\n');
 return all.length > KEEP.exchange ? `[…]\n${all.slice(-KEEP.exchange)}` : all;
}

// Whether the agent itself changed the memory in the exchange: then the memory is its own doing, and the look leaves it,
// so that what it wrote is not written a second time in other words.
function touched(entries, name) {
 return entries.some(entry => entry.role === 'assistant' && (entry.steps || []).some(step => (step.tool_calls || []).some(call => call.function?.name === name)));
}

// Whether an exchange has enough in it to look at: words of the user's, or work of the agent's.
function worth(entries) {
 const words = entries.filter(entry => entry.role === 'user').map(entry => (entry.text ?? text(entry.content)).trim().split(/\s+/).filter(Boolean).length).reduce((a, b) => a + b, 0);
 const worked = entries.some(entry => entry.role === 'assistant' && (entry.steps || []).some(step => (step.tool_calls || []).some(call => !OWN.has(call.function?.name))));
 return words >= KEEP.words || worked;
}

function messages({ exchange: said, record = '', memory = '', memoryOn = true }) {
 const brief = record.length > KEEP.record ? `[…]\n${record.slice(-KEEP.record)}` : record;
 const kept = memory.length > KEEP.memory ? memory.slice(0, KEEP.memory) : memory;
 const parts = [
  `The chat's record now:\n${brief.trim() || '(empty)'}`,
  memoryOn ? `The memory now, a record a line with its id:\n${kept.trim() || '(empty)'}` : OFF,
  `The exchange:\n${said}`,
 ];
 return [{ role: 'system', content: SYSTEM }, { role: 'user', content: parts.join('\n\n') }];
}

// The model's answer as facts to write, each checked for its shape: anything else is left out.
function verdict(answer) {
 const out = { record: [], memory: [] };
 const raw = String(answer || ''), from = raw.indexOf('{'), to = raw.lastIndexOf('}');
 if (from < 0 || to <= from) return out;
 let found;
 try { found = JSON.parse(raw.slice(from, to + 1)); } catch { return out; }
 const clean = value => typeof value === 'string' ? value.trim().slice(0, KEEP.line) : '';
 for (const fact of Array.isArray(found?.record) ? found.record : []) {
  if (out.record.length >= KEEP.lines) break;
  if (clean(fact?.add)) out.record.push({ add: clean(fact.add) });
  else if (typeof fact?.old === 'string' && fact.old.trim() && typeof fact?.new === 'string') out.record.push({ old: fact.old, new: fact.new.slice(0, KEEP.line) });
 }
 for (const fact of Array.isArray(found?.memory) ? found.memory : []) {
  if (out.memory.length >= KEEP.saves) break;
  if (clean(fact?.save)) out.memory.push({ save: clean(fact.save) });
  else if (/^\[?m\d+\]?$/.test(String(fact?.id ?? '').trim()) && clean(fact?.text)) out.memory.push({ id: String(fact.id).trim().replace(/^\[|\]$/g, ''), text: clean(fact.text) });
 }
 return out;
}

window.FactKeeper = { KEEP, SYSTEM, exchange, worth, touched, messages, verdict };
})();
