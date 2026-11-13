'use strict';
// GPT's Ultra through desktop/openai.js with a stand-in for the network: the catalogue's level for it is kept with the
// model, and a request on Ultra carries that level, never "ultra" itself (the backend turns that down with a 400).
const path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), results = [];
const check = (name, ok, detail = '') => { assert.ok(ok, `${name}${detail ? ` — ${detail}` : ''}`); results.push(name); };
const OpenAI = require(path.join(root, 'desktop', 'openai.js'));

const levels = names => names.map(effort => ({ effort, description: '' }));
const catalogue = [
 { slug: 'named', visibility: 'list', priority: 1, supported_reasoning_levels: levels(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']), multi_agent_reasoning_effort: 'xhigh' },
 { slug: 'unnamed', visibility: 'list', priority: 2, supported_reasoning_levels: levels(['low', 'high', 'max', 'ultra']) },
 { slug: 'odd', visibility: 'list', priority: 3, supported_reasoning_levels: levels(['low', 'high', 'ultra']), multi_agent_reasoning_effort: 'ultra' },
 { slug: 'plain', visibility: 'list', priority: 4, supported_reasoning_levels: levels(['low', 'medium', 'high']) },
];
const sent = [];
global.fetch = async (url, init = {}) => {
 if (String(url).includes('/models')) return new Response(JSON.stringify({ models: catalogue }), { status: 200 });
 sent.push(JSON.parse(init.body));
 const events = [{ type: 'response.output_text.delta', item_id: 'a', delta: 'ok' }, { type: 'response.completed', response: { usage: {} } }];
 return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { status: 200 });
};

(async () => {
 const models = await OpenAI.models({ provider: 'chatgpt' }, { chatgpt: async () => ({ access: 'x', account: 'a' }), codexUrl: 'https://example.invalid/codex' });
 const by = Object.fromEntries(models.map(model => [model.api, model]));
 check('Ultra is the level the catalogue names for it', by.named.ultraEffort === 'xhigh');
 check('Without one named, Ultra is the model\'s Max', by.unnamed.ultraEffort === 'max');
 check('A catalogue naming Ultra itself falls back to the highest other level', by.odd.ultraEffort === 'high');
 check('A model without Ultra has nothing for it', by.plain.ultraEffort === undefined);
 const ask = async (effort, ultraEffort) => {
  await OpenAI.stream({ provider: 'chatgpt', model: 'named', effort, ultraEffort, messages: [{ role: 'user', content: 'hi' }] }, { chatgpt: async () => ({ access: 'x', account: 'a' }), codexUrl: 'https://example.invalid/codex' });
  return sent.at(-1).reasoning.effort;
 };
 check('A request on Ultra carries the catalogue\'s level', await ask('ultra', 'xhigh') === 'xhigh');
 check('A request on Ultra with a model read before this change still never carries "ultra"', await ask('ultra', undefined) === 'xhigh');
 check('Other levels go as they are', await ask('max', 'xhigh') === 'max' && await ask('low', 'xhigh') === 'low');
 const providers = require('node:fs').readFileSync(path.join(root, 'providers.js'), 'utf8'), settings = require('node:fs').readFileSync(path.join(root, 'settings.js'), 'utf8');
 check('The model\'s Ultra level reaches the request', /ultraEffort: model\?\.ultraEffort/.test(settings) && /ultraEffort: config\.ultraEffort/.test(providers));
 for (const name of results) console.log(`ok  ${name}`);
 console.log(`\n${results.length} checks passed`);
})().catch(error => { console.error(error); process.exit(1); });
