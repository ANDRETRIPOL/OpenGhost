(() => {
'use strict';

// Predictions in the composer: once the agent has answered, the model is asked in a short request of its own for the
// message most worth sending next (often what the user had not thought of), and it waits in the empty message field as
// grey words. Tab or the right arrow puts them into the field, to be changed or sent; typing hides them until the field
// is empty again, and a message sent sends them away. Nothing is ever sent by itself.
//
// The request is the chat's own, word for word and with the chat's own effort, with one message from the app at its
// end, so a provider that keeps the chat in a cache reads it from there and the prediction costs a few words of output
// (providers.js, which also says why it does not think less than the chat). It is not
// made when it would be wasted: the setting is off, the chat has had one exchange only, the answer ended in an error or
// was stopped, or the last predictions were left unused, when only every few answers get one until one is used again.
const STORAGE = { on: 'openghost.predictions', unused: 'openghost.predictions.unused' };
// After `patience` predictions in a row left unused, one answer in `sparse` gets a prediction.
const PACE = { patience: 5, sparse: 3 };
// A prediction is one message of one paragraph: longer than this, or of several paragraphs, it is the model talking
// instead.
const SHAPE = { most: 400, none: /^none[.!]?$/i };
const PROMPT = [
 'This message comes from the app, not from the user. Do not answer it, do not go on with the work and do not call any tool.',
 'Suggest the next message for the user to send in this conversation: the one that would help them most from here. Reply with that message alone, written as the user would write it: in their language, in their manner, addressed to you.',
 'Best is what they may not have thought of themselves: a detail that matters for their goal and has not come up yet (a cost, a condition, a risk, a deadline, a check worth making, a better option), or the step an experienced person would take next. Ground it in this conversation and name the concrete thing, not a category. Never make up facts about the user (where they live or work, dates, what they own or have decided): say only what the conversation says.',
 'Not small talk and not a bare yes, thanks or go on: when you offered something worth doing, the message takes it up together with what matters about it.',
 'One message, as short as it can be while it says what matters, with no quotes round it and no explanation.',
 'If nothing worth suggesting is left (the work is done and nothing that matters is open, the user has closed the matter, or you asked the user something only they can answer), reply with the single word NONE.',
].join(' ');

const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

const listeners = new Set();
let skipped = 0;

const Predictions = {
 PROMPT,
 get on() { return read(STORAGE.on, '1') !== '0'; },
 setOn(on) {
  write(STORAGE.on, on ? '1' : '0');
  for (const listener of listeners) listener(on);
 },
 onChange(listener) { listeners.add(listener); },
 get unused() { return +read(STORAGE.unused, '0') || 0; },
 // Whether the answer just given gets a prediction.
 due() {
  if (!this.on) return false;
  if (this.unused < PACE.patience) return true;
  skipped = (skipped + 1) % PACE.sparse;
  return skipped === 0;
 },
 used() { write(STORAGE.unused, '0'); },
 left() { write(STORAGE.unused, String(this.unused + 1)); },
 // A prediction takes as many lines as its words need: while it stands in the empty field, the field is as tall as it
 // is and grows to it as it grows with typed words (SmoothHeight); typed words take its place.
 room({ field, input, placeholder }) {
  const fit = () => {
   const shown = field.classList.contains('is-predicted') && !field.classList.contains('has-value');
   const height = shown ? `${placeholder.offsetHeight}px` : '';
   if (input.style.minHeight !== height) input.style.minHeight = height;
  };
  new ResizeObserver(fit).observe(placeholder);
  new MutationObserver(fit).observe(field, { attributes: true, attributeFilter: ['class'] });
 },
 // What the model said, as the message it stands for; '' when it is none.
 clean(text) {
  const said = String(text || '').trim().replace(/^["'«“„]+|["'»”]+$/g, '').trim();
  if (!said || SHAPE.none.test(said) || said.length > SHAPE.most || said.includes('\n')) return '';
  return said;
 },
};

window.Predictions = Predictions;
})();
