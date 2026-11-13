'use strict';
// The actual providers.js with a stand-in for the main process: the speed a chat's side requests go at. What the user
// waits on in the middle of a reply (a chat's summary, the look at a plan's step) goes at the chat's own speed, so a
// chat with Fast on stays fast; a job done behind the user's back (a title, the facts kept) goes at the standard one.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), results = [];
const check = (name, ok, detail = '') => { assert.ok(ok, `${name}${detail ? ` — ${detail}` : ''}`); results.push(name); };

const sent = [];
let listener = null;
const bridge = {
 onEvent: fn => { listener = fn; },
 start: (id, request) => { sent.push(request); setTimeout(() => listener({ id, type: 'done', result: { content: 'ok', usage: null } }), 0); },
 abort: () => {},
};
const window = { openghost: { llm: bridge }, dispatchEvent: () => {}, addEventListener: () => {} };
const context = { window, Usage: { record: () => {} }, I18n: { t: key => key }, CustomEvent: class {}, AbortController, setTimeout, clearTimeout, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'providers.js'), 'utf8'), context, { filename: 'providers.js' });
const { Providers } = window;

(async () => {
 const fast = { provider: 'chatgpt', model: 'gpt-6-luna', ready: true, fast: true, speed: 'fast', effort: 'high', efforts: ['none', 'low', 'high'] };
 await Providers.complete(fast, { messages: [{ role: 'user', content: 'x' }], waited: true });
 check('A waited side answer of a Fast chat asks for Fast', sent.at(-1).speed === 'fast' && sent.at(-1).fast === true);
 await Providers.complete(fast, { messages: [{ role: 'user', content: 'x' }] });
 check('A background side answer of a Fast chat goes at the standard speed', sent.at(-1).speed === 'standard');
 await Providers.complete({ ...fast, speed: 'standard' }, { messages: [{ role: 'user', content: 'x' }], waited: true });
 check('A waited side answer of a standard chat stays standard', sent.at(-1).speed === 'standard');
 check('Side answers still think as little as they can', sent.every(request => request.effort === 'none'));
 const chat = fs.readFileSync(path.join(root, 'chat.js'), 'utf8');
 check('The chat summary is a waited answer', /maxTokens: compactRoom\(turn\.config\),\s*signal: turn\.controller\.signal,\s*waited: true/.test(chat));
 check('The plan step look is a waited answer', /PlanProof\.JUDGE\.answer, waited: true/.test(chat));
 for (const name of results) console.log(`ok  ${name}`);
 console.log(`\n${results.length} checks passed`);
})().catch(error => { console.error(error); process.exit(1); });
