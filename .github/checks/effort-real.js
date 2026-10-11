'use strict';

// The effort of local models against real servers with real models that think: what the app's engine makes the effort
// control offer for each, and whether a choice really changes how the model answers.
// Env: ENGINE (the engine file), SERVER (ollama | llamacpp), ADDRESS, and for llama.cpp PLAIN_ADDRESS (a second server
// with a model that does not think).
const path = require('node:path');
const Local = require(process.env.ENGINE || path.join(__dirname, '..', '..', 'desktop', 'local.js'));
const SERVER = process.env.SERVER, ROOT = process.env.ADDRESS;
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`); };
const ASK = [{ role: 'user', content: 'What is 17 times 23? Answer with the number.' }];
const brief = list => JSON.stringify(list.map(m => ({ api: m.api, efforts: m.efforts, usual: m.defaultEffort, thinking: m.thinking })));
const chat = async (root, model, effort) => {
 const result = await Local.stream({ key: root, model: model.api, window: Math.min(model.context || 8192, 8192), effort, thinking: model.thinking, messages: ASK, maxTokens: 500 }, {});
 console.log(`  ${model.api} with effort ${effort}: ${result.reasoning.length} characters of thinking, answer ${JSON.stringify(result.content.slice(0, 70))}`);
 return result;
};

(async () => {
 const list = await Local.models({ key: ROOT });
 console.log('models:', brief(list));
 if (SERVER === 'ollama') {
  const of = name => list.find(m => m.api === name);
  const sw = of('qwen3:1.7b'), always = of('deepseek-r1:1.5b'), plain = of('qwen2.5:1.5b');
  check('a model with a switch (qwen3) offers no thinking and thinking', sw?.efforts.join() === 'none,on' && sw.thinking === 'levels' && sw.defaultEffort === 'on', JSON.stringify(sw?.efforts));
  check('a model that always thinks (deepseek-r1) offers thinking alone', always?.efforts.join() === 'on' && always.thinking === 'fixed', JSON.stringify(always?.efforts));
  check('a model that does not think (qwen2.5) offers nothing', plain?.efforts.join() === 'none' && plain.thinking === 'none', JSON.stringify(plain?.efforts));
  let result = await chat(ROOT, sw, 'none');
  check('with no thinking chosen, qwen3 answers without a thought', result.reasoning.length === 0 && result.content.trim().length > 0 && !result.content.includes('<think>'));
  result = await chat(ROOT, sw, 'on');
  check('with thinking chosen, qwen3 thinks first', result.reasoning.length > 0);
  result = await chat(ROOT, always, 'on');
  check('deepseek-r1 answers with its thinking, and nothing is refused', result.reasoning.length > 0 && !result.stale);
  result = await chat(ROOT, plain, 'none');
  check('qwen2.5 answers, and nothing is refused', result.content.trim().length > 0 && result.reasoning.length === 0 && !result.stale);
 } else {
  const model = list[0];
  check('llama.cpp offers the model left to itself, or no thinking', model?.efforts.join() === 'none,auto' && model.thinking === 'levels' && model.defaultEffort === 'auto', JSON.stringify(model?.efforts));
  let result = await chat(ROOT, model, 'auto');
  check('left to itself, the thinking model thinks first', result.reasoning.length > 0);
  result = await chat(ROOT, model, 'none');
  check('with no thinking chosen, it answers without a thought', result.reasoning.length === 0 && result.content.trim().length > 0 && !result.content.includes('<think>'));
  const other = (await Local.models({ key: process.env.PLAIN_ADDRESS }))[0];
  result = await chat(process.env.PLAIN_ADDRESS, other, 'none');
  check('a model that never thinks takes "no thinking" without harm', result.content.trim().length > 0 && !result.stale);
  result = await chat(process.env.PLAIN_ADDRESS, other, 'auto');
  check('and answers when left to itself', result.content.trim().length > 0);
 }
 console.log(failures ? `FAILED ${failures}` : 'ALL PASSED');
 process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
