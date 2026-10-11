'use strict';

// The app's own engine for local models (desktop/local.js) against a real Ollama, started by the workflow beside it.
// Nothing here stands in for the server: every answer is Ollama's. Prints what it got, and fails when a check fails.
const path = require('node:path');
const Local = require(path.join(__dirname, '..', '..', 'desktop', 'local.js'));

const ROOT = 'http://127.0.0.1:11434';
const MODEL = process.env.MODEL || 'qwen2.5:3b';
const PLAIN = process.env.PLAIN || 'tinyllama:latest';
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`); };
const raw = async (url, init) => { const response = await fetch(url, init); return { status: response.status, text: await response.text() }; };
const running = async () => JSON.parse((await raw(`${ROOT}/api/ps`)).text).models || [];
const TOOLS = [{ type: 'function', function: { name: 'get_weather', description: 'Get the current weather in a city', parameters: { type: 'object', properties: { city: { type: 'string', description: 'The city' } }, required: ['city'] } } }];
const SYSTEM = { role: 'system', content: 'You are a helpful assistant. When the user asks about the weather, call the get_weather tool. Answer briefly.' };
const ASK = { role: 'user', content: 'What is the weather in Paris right now?' };

(async () => {
 console.log('version:', (await raw(`${ROOT}/api/version`)).text);
 console.log('raw /api/tags:', (await raw(`${ROOT}/api/tags`)).text.slice(0, 700));
 console.log('raw /api/show:', (await raw(`${ROOT}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL }) })).text.replace(/"(modelfile|template|license|parameters)":"(?:[^"\\]|\\.)*"/g, '"$1":"…"').slice(0, 1500));

 // 1. The list, before anything is loaded.
 let list = await Local.models({ key: ROOT });
 console.log('models:', JSON.stringify(list.map(m => ({ api: m.api, context: m.context, limit: m.limit, vision: m.vision, tools: m.tools }))));
 const model = list.find(item => item.api === MODEL), plain = list.find(item => item.api === PLAIN);
 check('the list holds the model by the name Ollama gives it', !!model, list.map(m => m.api).join());
 check('its limit is read from /api/show, and the window is what the app will ask for', !!model && model.limit > 0 && model.context === Math.min(model.limit, Local.AUTO), JSON.stringify(model));
 check('a model with tools is listed as calling tools, one without is not', !!model && model.tools === true && (!plain || plain.tools === false), JSON.stringify(plain));

 // 2. A chat with a tool: the model is loaded with the window the app asks for.
 const got = [];
 let result = await Local.stream({ key: ROOT, model: MODEL, window: model.context, vision: false, messages: [SYSTEM, ASK], tools: TOOLS }, { onEvent: event => got.push(event) });
 console.log('first answer:', JSON.stringify(result));
 const call = result.toolCalls[0];
 check('the model called the tool, with arguments the app can read', !!call && call.function.name === 'get_weather' && /paris/i.test(JSON.parse(call.function.arguments).city || ''), JSON.stringify(result.toolCalls));
 check('the answer ends as a tool call and the tokens are counted', result.finishReason === 'tool_calls' && result.usage && result.usage.prompt_tokens > 0 && result.usage.completion_tokens > 0, JSON.stringify(result.usage));
 let ps = await running();
 console.log('raw /api/ps after the chat:', JSON.stringify(ps.map(item => ({ name: item.name, context_length: item.context_length, size_vram: item.size_vram }))));
 check(`Ollama really runs the model with the window the app asked for (${model.context})`, ps.find(item => item.name === MODEL)?.context_length === model.context, JSON.stringify(ps.map(item => [item.name, item.context_length])));

 // 3. The tool's result goes back, and the model answers with it.
 const talk = [SYSTEM, ASK, { role: 'assistant', content: result.content, tool_calls: result.toolCalls }, { role: 'tool', tool_call_id: call?.id, content: 'Paris: 18 degrees Celsius, sunny' }];
 got.length = 0;
 result = await Local.stream({ key: ROOT, model: MODEL, window: model.context, vision: false, messages: talk, tools: TOOLS }, { onEvent: event => got.push(event) });
 console.log('second answer:', JSON.stringify(result));
 check('given the tool\'s result, the model answers with what it said', /18/.test(result.content) && result.finishReason === 'stop', result.content);
 check('the words came in pieces', got.filter(event => event.type === 'content').length > 1, String(got.length));

 // 4. A window written by hand.
 await Local.stream({ key: ROOT, model: MODEL, window: 8192, vision: false, messages: [{ role: 'user', content: 'Say hi.' }] }, {});
 ps = await running();
 check('a window written by hand (8192) is the one Ollama runs the model with', ps.find(item => item.name === MODEL)?.context_length === 8192, JSON.stringify(ps.map(item => [item.name, item.context_length])));
 list = await Local.models({ key: ROOT });
 check('running with less than the app needs, the model is listed with the window the app will ask for', list.find(item => item.api === MODEL).context === Math.min(model.limit, Local.AUTO), JSON.stringify(list.find(item => item.api === MODEL)));

 // 5. What Ollama itself says to tools sent to a model that takes none, and what the app does with it.
 if (plain) {
  const refusal = await raw(`${ROOT}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: PLAIN, messages: [ASK], tools: TOOLS, stream: false }) });
  console.log('raw refusal of tools:', refusal.status, refusal.text.slice(0, 300));
  result = await Local.stream({ key: ROOT, model: PLAIN, window: 2048, vision: false, messages: [{ role: 'user', content: 'Say hi in one word.' }], tools: TOOLS }, {});
  console.log('plain model through the app:', JSON.stringify(result));
  check('a model that takes no tools still answers through the app when it is sent some', result.content.length > 0 && result.toolCalls.length === 0, result.content);
 }

 // 6. A model that does not exist: Ollama's own words reach the user.
 const missing = await Local.stream({ key: ROOT, model: 'no-such-model:1b', window: 4096, messages: [ASK] }, {}).catch(error => error);
 console.log('missing model:', missing.status, missing.message);
 check('a model Ollama does not have is told in Ollama\'s own words', missing instanceof Error && missing.status >= 400 && /not found|no such|pull/i.test(missing.message), `${missing.status} ${missing.message}`);

 // 7. The same server as an OpenAI-compatible service, the way the separate section talks to one.
 const service = { provider: 'custom', address: `${ROOT}/v1`, key: '' };
 const served = await Local.models(service);
 console.log('as a service:', JSON.stringify(served.map(m => ({ api: m.api, context: m.context, vision: m.vision, tools: m.tools }))));
 check('as a service its models are listed from /v1/models', served.some(item => item.api === MODEL));
 result = await Local.stream({ ...service, model: MODEL, vision: true, messages: [SYSTEM, ASK], tools: TOOLS }, {});
 console.log('service answer:', JSON.stringify(result));
 check('through Chat Completions the tool call comes back whole too', result.toolCalls[0]?.function.name === 'get_weather' && /paris/i.test(JSON.parse(result.toolCalls[0].function.arguments).city || '') && result.finishReason === 'tool_calls' && result.usage?.total_tokens > 0, JSON.stringify(result.toolCalls));
 const again = [SYSTEM, ASK, { role: 'assistant', content: result.content, tool_calls: result.toolCalls }, { role: 'tool', tool_call_id: result.toolCalls[0]?.id, content: 'Paris: 18 degrees Celsius, sunny' }];
 result = await Local.stream({ ...service, model: MODEL, vision: true, messages: again, tools: TOOLS }, {});
 check('and the tool\'s result is taken there as well', /18/.test(result.content), result.content);

 console.log(failures ? `FAILED ${failures}` : 'ALL PASSED');
 process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
