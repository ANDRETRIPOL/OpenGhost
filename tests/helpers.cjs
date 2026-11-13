'use strict';
// The agent's helpers (helpers.js, helper-island.js), read from the files: only the main window's chat and the second
// pane of Split View have them, a helper never speaks for the chat (no questions to the user, no plan, no memory), and
// every word the island shows is there in the four languages.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), results = [];
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const check = (name, ok, detail = '') => { assert.ok(ok, `${name}${detail ? ` — ${detail}` : ''}`); results.push(name); };

const tools = read('agent-tools.js'), helpers = read('helpers.js'), island = read('helper-island.js'), html = read('index.html');
const OWN = ['spawn_agent', 'wait_agent', 'send_message', 'interrupt_agent', 'list_agents'];
check('The agent has the five tools of helpers', OWN.every(name => tools.includes(`fn('${name}'`)));
check('Only a chat with an island of helpers gets them', /return this\.helpersOn \? all : all\.filter\(tool => !OWN\.has/.test(helpers) && /chat\.helpersOn = true/.test(island));
const kept = /const KEPT = new Set\(\[\.\.\.OWN, ([^\]]+)\]\)/.exec(helpers)?.[1] || '';
check('A helper cannot ask the user, plan, keep notes, routines, memory, the record or show pictures', ['ask_user', 'plan', 'notepad', 'routine', 'memory', 'record', 'show_pictures'].every(name => kept.includes(`'${name}'`)), kept);
check('A helper starts no helpers of its own', /if \(!this\.helpersOn \|\| conv\.helperOf\) return 'Error: helpers are not available here\.'/.test(helpers));
check('The chat\'s Stop and its end stop the helpers', /addEventListener\('abort', \(\) => this\.stopHelper\(conv, helper, 'stop'\)/.test(helpers) && /proto\.end = function[\s\S]{0,120}stopHelper\(conv, helper, 'end'\)/.test(helpers));
check('A helper\'s step waits for the user\'s OK in the chat\'s own card, named', /this\.approve\(parent, host, host\.part\.view, \{ name, args, cwd, apart, panel, helper: helper\.title \}\)/.test(helpers) && /request\.helper\) about\.title = I18n\.t\('helpers\.asks'/.test(read('chat.js')));
check('helpers.js comes after chat.js, the island after the plan\'s', html.indexOf('chat.js') < html.indexOf('helpers.js') && html.indexOf('plan-island.js') < html.indexOf('helper-island.js'));
const script = read('script.js'), split = read('split-view.js');
check('The main window has the island, the quick chat\'s window none', /if \(MAIN_WINDOW\) helperIsland = new HelperIsland\(\{ main, chat, plan: planIsland \}\)/.test(script));
check('The second pane of Split View has its own', /this\.helpers = new HelperIsland\(\{ main, chat: this\.chat, plan: this\.plan \}\)/.test(split));
check('The mini chat has none', !/HelperIsland/.test(read('mini-chat.js')) && !/HelperIsland/.test(read('quick-chat.js')));
const keys = [...new Set([...`${island}\n${helpers}\n${read('agent-line.js')}\n${read('chat.js')}`.matchAll(/I18n\.t\(`?'?((?:helpers|deed)\.[A-Za-z]+)/g)].map(match => match[1]))]
 .filter(key => key.startsWith('helpers.') || ['deed.helper', 'deed.helpers', 'deed.tellHelper', 'deed.stopHelper'].includes(key));
const states = ['helpers.done', 'helpers.stopped', 'helpers.failed'];
for (const file of ['i18n.js', 'i18n-ru.js', 'i18n-fr.js', 'i18n-it.js']) {
 const text = read(file), missing = [...keys, ...states, 'deed.helper', 'deed.helpers', 'deed.tellHelper', 'deed.stopHelper'].filter(key => !text.includes(`'${key}':`));
 check(`${file} has every word of the helpers`, !missing.length, missing.join(', '));
}
check('A helper\'s conversation is summed up near its model\'s limit, with the chat\'s own words for it, and it goes on', /proto\.compactHelper = async function/.test(helpers) && /content: COMPACT\.prompt/.test(helpers) && /used > room \* HELPERS\.compact && !helper\.warned[\s\S]{0,160}compactHelper\(parent, helper, config\)[\s\S]{0,120}\) continue;/.test(helpers));
check('The plan island leaves room for the helpers\' one', /- \(this\.beside \|\| 0\)/.test(read('plan-island.js')));
check('A class on the plan island is set only when it changes (no endless watch)', /const flag = \(el, name, on\) => \{ if \(el\.classList\.contains\(name\) !== on\)/.test(island) && !/plan\.root\.classList\.(remove|add)\(/.test(island));
for (const name of results) console.log(`ok  ${name}`);
console.log(`\n${results.length} checks passed`);
