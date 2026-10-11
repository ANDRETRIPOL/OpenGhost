'use strict';

// The app's engine for local models against a real llama.cpp server, started by the workflow beside it.
// ENGINE: the engine file to test (the one unpacked from the release). Prints what the server really answers.
const path = require('node:path');
const Local = require(process.env.ENGINE || path.join(__dirname, '..', '..', 'desktop', 'local.js'));

const ROOT = process.env.ADDRESS || 'http://127.0.0.1:8080';
const CTX = Number(process.env.WINDOW || 32768);
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`); };
const raw = async (url, init) => { const response = await fetch(url, init); return { status: response.status, text: await response.text() }; };
const TOOLS = [{ type: 'function', function: { name: 'get_weather', description: 'Get the current weather in a city', parameters: { type: 'object', properties: { city: { type: 'string', description: 'The city' } }, required: ['city'] } } }];
const SYSTEM = { role: 'system', content: 'You are a helpful assistant. When the user asks about the weather, call the get_weather tool. Answer briefly.' };
const ASK = { role: 'user', content: 'What is the weather in Paris right now?' };

(async () => {
 const props = JSON.parse((await raw(`${ROOT}/props`)).text);
 console.log('raw /props:', JSON.stringify({ n_ctx: props.default_generation_settings?.n_ctx, modalities: props.modalities, model_path: props.model_path, total_slots: props.total_slots, build_info: props.build_info }));
 console.log('raw /v1/models:', (await raw(`${ROOT}/v1/models`)).text.slice(0, 700));

 const list = await Local.models({ key: ROOT });
 console.log('models:', JSON.stringify(list.map(m => ({ api: m.api, context: m.context, limit: m.limit, vision: m.vision, tools: m.tools }))));
 const model = list[0];
 check('the server\'s model is listed', list.length === 1 && !!model?.api);
 check(`its window is the one the server was started with (${CTX}), read from /props`, model?.context === CTX, JSON.stringify(model));
 check('it is not taken to see pictures, as /props says', model?.vision === false, JSON.stringify(props.modalities));

 const got = [];
 let result = await Local.stream({ key: ROOT, model: model.api, window: model.context, vision: false, messages: [SYSTEM, ASK], tools: TOOLS }, { onEvent: event => got.push(event) });
 console.log('first answer:', JSON.stringify(result));
 const call = result.toolCalls[0];
 check('the model called the tool, with arguments the app can read', !!call && call.function.name === 'get_weather' && /paris/i.test(JSON.parse(call.function.arguments).city || ''), JSON.stringify(result.toolCalls));
 check('the answer ends as a tool call and the tokens are counted', result.finishReason === 'tool_calls' && result.usage?.prompt_tokens > 0 && result.usage?.completion_tokens > 0, JSON.stringify(result.usage));

 const talk = [SYSTEM, ASK, { role: 'assistant', content: result.content, tool_calls: result.toolCalls }, { role: 'tool', tool_call_id: call?.id, content: 'Paris: 18 degrees Celsius, sunny' }];
 got.length = 0;
 result = await Local.stream({ key: ROOT, model: model.api, window: model.context, vision: false, messages: talk, tools: TOOLS }, { onEvent: event => got.push(event) });
 console.log('second answer:', JSON.stringify(result));
 check('given the tool\'s result, the model answers with what it said', /18/.test(result.content) && result.finishReason === 'stop', result.content);
 check('the words came in pieces', got.filter(event => event.type === 'content').length > 1, String(got.length));

 // The same server through the separate section for OpenAI-compatible services.
 const service = { provider: 'custom', address: `${ROOT}/v1`, key: '' };
 const served = await Local.models(service);
 console.log('as a service:', JSON.stringify(served.map(m => ({ api: m.api, context: m.context, limit: m.limit }))));
 check('as a service its model is listed', served.length === 1);
 result = await Local.stream({ ...service, model: served[0].api, vision: false, messages: [SYSTEM, ASK], tools: TOOLS }, {});
 check('and the tool call comes back whole there too', result.toolCalls[0]?.function.name === 'get_weather' && result.finishReason === 'tool_calls', JSON.stringify(result.toolCalls));

 console.log(failures ? `FAILED ${failures}` : 'ALL PASSED');
 process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
