'use strict';

// Where a model starts to cost more. Some models charge a higher price for a whole request once it is longer than a
// certain number of tokens: Claude Haiku 5.5 five times as much past 100K, GPT models twice as much past 272K, Gemini
// Pro past 200K. The economy mode of a chat (economy.js) keeps a chat under that step.
//
// No model and no number is written in this file. OpenRouter lists the models of every company it serves, and with each
// the prices it charges past such a step, as the company sets them (`pricing.overrides[].min_prompt_tokens`). Its own
// models carry their steps in the list a key reads (openrouter.js); for Claude and GPT used with a key of Anthropic or
// OpenAI the app reads the same list without any key: a plain request for a public page, with nothing of the user's in
// it. It is read only while some chat saves this way, at most once a day, and kept on this computer.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { stepsOf, priceOf } = require('./openrouter');

const URL = 'https://openrouter.ai/api/v1/models';
const DAY = 24 * 60 * 60 * 1000;
// A list that could not be read is asked for again after this long, not at every look.
const RETRY = 60 * 1000;
const file = () => path.join(app.getPath('userData'), 'model-prices.json');

let kept = null;
let asking = null;
let failed = 0;

// One name for a model however it is written: OpenRouter's `anthropic/claude-haiku-5.5` and Anthropic's own
// `claude-haiku-5-5` (or `claude-haiku-5-5-20261001`) come to the same.
function norm(id) {
 return String(id || '').toLowerCase().replace(/^~/, '').split(':')[0].replace(/\./g, '-').replace(/-20\d{6}$/, '');
}

// The list as the app keeps it: { 'anthropic/claude-haiku-5-5': { steps: [100000], price: { in, hit, write, out, over } } }.
function parse(list) {
 const models = {};
 for (const model of Array.isArray(list) ? list : []) {
  const id = String(model?.id || '');
  // A variant (`:batch`, `:free`) has prices of its own; a name that follows the latest model is no model.
  if (!id || id.startsWith('~') || id.includes(':')) continue;
  const price = priceOf(model.pricing);
  if (price) models[norm(id)] = { steps: stepsOf(model.pricing), price };
 }
 return models;
}

function readKept() {
 try {
  const saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
  if (saved?.version === 2 && typeof saved.at === 'number' && saved.models && typeof saved.models === 'object') return saved;
 } catch {}
 return null;
}

async function fetchList(fetcher = fetch) {
 const response = await fetcher(URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
 if (!response.ok) throw new Error(`OpenRouter answered ${response.status}`);
 const body = await response.json();
 if (!Array.isArray(body?.data)) throw new Error('OpenRouter sent no list of models');
 return parse(body.data);
}

// The steps, from this computer when they were read today, else from OpenRouter. When the list can't be read, what
// was read before still holds.
async function steps({ fetcher } = {}) {
 kept ||= readKept();
 if (kept && Date.now() - kept.at < DAY) return kept;
 if (Date.now() - failed < RETRY) return kept || { at: 0, models: {} };
 asking ||= fetchList(fetcher).then(found => {
  kept = { version: 2, at: Date.now(), models: found };
  fs.promises.writeFile(file(), JSON.stringify(kept)).catch(() => {});
  return kept;
 }, () => {
  failed = Date.now();
  return kept || { at: 0, models: {} };
 }).finally(() => { asking = null; });
 return asking;
}

module.exports = { steps, parse, norm };
