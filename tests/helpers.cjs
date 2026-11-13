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
const chatJs = read('chat.js'), endWrap = /proto\.end = function[\s\S]*?\n\};/.exec(helpers)?.[0] || '';
check('End stops the chat\'s agent and its helpers together, also with the agent not at work', /proto\.abort = function \(conv\) \{\s*abort\.call\(this, conv\);\s*this\.stopHelpers\(conv\);/.test(helpers) && /proto\.stop = function[\s\S]{0,140}if \(working\(conv\)\.length\) this\.stopHelpers\(conv\)/.test(helpers));
check('The end of the agent\'s turn leaves its helpers at work', endWrap && !/stopHelper/.test(endWrap) && !/addEventListener\('abort', \(\) => this\.stopHelper/.test(helpers));
check('A turn that ends while helpers work just ends; unread reports are read first', /const news = this\.helperNews\(conv\);\s*if \(news\) return news;\s*if \(working\(conv\)\.length\) return '';/.test(helpers));
check('Reports reach the agent by themselves, in a note at its next step', /proto\.notes = function[\s\S]*const news = this\.helperNews\(conv\);\s*if \(news\) out\.push/.test(helpers));
check('Helpers that finished bring the agent back once all are done, never after End or for helpers the user stopped', /proto\.wakeAgent = function[\s\S]{0,260}conv\.helpersHeld \|\| working\(conv\)\.length/.test(helpers) && /BY_USER = new Set\(\['user', 'restart'\]\)/.test(helpers) && /this\.resume\(conv, config\)/.test(helpers) && /finally \{[\s\S]{0,400}this\.wakeAgent\(parent\);/.test(helpers));
check('A stopped helper goes on from where it stopped, its conversation kept', /const again = helper\.state === 'stopped';\s*if \(again\) helper\.messages\.push\(\{ role: 'user', content: NOTE\.resumed\(helper\.stoppedBy\) \}\)/.test(helpers));
check('Helpers are kept on the disk with the chat, and one at work when the app closed comes back stopped', /this\.library\.saveHelpers\(conv\.id, listOf\(conv\)\.map\(stored\)\)/.test(helpers) && /stoppedBy: stopped \? 'restart'/.test(helpers) && /saveHelpers\(id, items\)/.test(read('library.js')) && /'permissions', 'helpers'\]\.map\(kind => this\.store\.remove/.test(read('library.js')));
check('The chat counts as at work while only its helpers are: End shows and the window stays awake', /Object\.defineProperty\(proto, 'working'/.test(helpers) && /busy: chat\.working, suggest: chat\.busy/.test(read('script.js')) && /conv\.turn \|\| window\.Helpers\?\.working\(conv\)\.length/.test(read('script.js')));
check('A helper\'s step waits for the user\'s OK in the chat\'s own card, named, also with the agent not at work', /const host = parent\.turn \|\| \{ approvals: \(parent\.helperApprovals \|\|= new Set\(\)\)/.test(helpers) && /helper: helper\.title, signal: turn\.controller\.signal/.test(helpers) && /request\.helper\) about\.title = I18n\.t\('helpers\.asks'/.test(chatJs) && /request\.signal\?\.addEventListener\('abort', \(\) => card\.settle\('deny'\)/.test(chatJs) && /\.\.\.\(conv\?\.helperApprovals \|\| \[\]\)/.test(chatJs));
check('The line beside the ghost goes along under a message that waits, and says when the model thinks', /if \(turn\.deed && !turn\.writing\) this\.say\(turn, turn\.next, turn\.deed\)/.test(chatJs) && /onReasoning: \(delta, stream\) => this\.think\(turn, view, stream\.reasoning\)/.test(chatJs) && /onReasoning: \(delta, stream\) => this\.helperThinks\(parent, helper, stream\.reasoning\)/.test(helpers));
{
 // What the model thinks about, from its thinking so far: GPT's latest heading, else the latest finished sentence.
 const context = { window: { matchMedia: () => ({ matches: false }) }, I18n: { t: key => key }, AgentTools: {} };
 require('node:vm').runInNewContext(read('agent-line.js'), context);
 const thought = context.window.AgentLine.thought;
 check('A thought is GPT\'s latest heading', thought('**Planning parallel research**\n\nI need…**Составляю план**') === 'Составляю план');
 check('A thought is the latest finished sentence of a model that thinks aloud, never one still being written', thought('The user wants prices. I should check OpenAI first. Then Anthrop') === 'I should check OpenAI first');
 check('A long thought is cut at a word, with an ellipsis', /…$/.test(thought(`${'слово '.repeat(30)}конец.`)) && thought(`${'слово '.repeat(30)}конец.`).length <= 71);
}
check('A stream that brings nothing for too long counts as a lost connection', /QUIET = \{ chatgpt: 30000, other: 300000 \}/.test(read('desktop/openai.js')) && /within\(reader\.read\(\)\)/.test(read('deepseek.js')));
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
