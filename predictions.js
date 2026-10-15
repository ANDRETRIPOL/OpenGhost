(() => {
'use strict';

// Predictions in the composer: once the agent has answered, the model is asked in a short request of its own what the
// user is likely to send next, and the answer waits in the empty message field as grey words. Tab or the right arrow
// puts them into the field, to be changed or sent; typing anything else sends them away. Nothing is ever sent by itself.
//
// The request is the chat's own, word for word and with the chat's own effort, with one message from the app at its
// end, so a provider that keeps the chat in a cache reads it from there and the prediction costs a few words of output
// (providers.js, which also says why it does not think less than the chat). It is not
// made when it would be wasted: the setting is off, the chat has had one exchange only, the answer ended in an error or
// was stopped, or the last predictions were left unused, when only every few answers get one until one is used again.
const STORAGE = { on: 'openghost.predictions', unused: 'openghost.predictions.unused' };
// After `patience` predictions in a row left unused, one answer in `sparse` gets a prediction.
const PACE = { patience: 5, sparse: 3 };
// A prediction is one short message: longer than this, or of more than one line, it is the model talking instead.
const SHAPE = { most: 140, none: /^none[.!]?$/i };
const PROMPT = [
 'This message comes from the app, not from the user. Do not answer it, do not go on with the work and do not call any tool.',
 'Predict the message the user is most likely to send next in this conversation, and reply with that message alone, written as the user would write it: in their language, in their manner, addressed to you.',
 'It is a natural next step: going on to the next part of what they asked for, agreeing to something you offered, asking for the obvious follow-up or fix. Keep it to one short sentence of at most twelve words, with no quotes round it and no explanation.',
 'If no next message is clearly likely (the work is done and you offered nothing, the user has said they are done or has thanked you and closed the matter, or you asked the user something only they can answer), reply with the single word NONE.',
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
 // What the model said, as the message it stands for; '' when it is none.
 clean(text) {
  const said = String(text || '').trim().replace(/^["'«“„]+|["'»”]+$/g, '').trim();
  if (!said || SHAPE.none.test(said) || said.length > SHAPE.most || said.includes('\n')) return '';
  return said;
 },
};

window.Predictions = Predictions;
})();
