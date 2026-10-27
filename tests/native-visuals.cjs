'use strict';
// Native progress visuals: actual streaming checkpoint/Markdown/Chat methods with view and provider fixtures.
// No application profile, API, browser server or agent command is used.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
let count = 0;
function check(name, value) { assert.ok(value, name); count++; console.log('ok  ' + name); }
const CHART = 'Промежуточные результаты\n\n```mermaid\nxychart-beta\n title Проверенные значения\n x-axis [A, B, C]\n y-axis Значение 0 --> 10\n bar "Измерение" [3, 6, 9]\n```';
async function main() {
 const cancelled = { frames: [], timers: [] };
 const c = { window: { matchMedia: () => ({ matches: false }) }, console, performance: { now: () => 100 },
  requestAnimationFrame: () => 1, cancelAnimationFrame: id => cancelled.frames.push(id), setTimeout: () => 1, clearTimeout: id => cancelled.timers.push(id),
  I18n: { t: key => key }, Highlight: { code: text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;') },
  Skills: { blocks: () => '' }, Usage: { parts: () => null }, Providers: {}, UserContext: { pictures: () => [] }, AbortController,
 };
 vm.createContext(c);
 for (const file of ['markdown.js', 'stream-view.js', 'agent-prompt.js', 'agent-plan.js', 'plan-proof.js', 'chat.js']) {
  vm.runInContext(read(file), c);
  for (const name of ['Markdown', 'AgentPlan', 'PlanProof']) if (c.window[name]) c[name] = c.window[name];
 }
 const S = c.window.StreamView;
 check('A stream can checkpoint a completed response fragment without finishing the turn', typeof S.prototype.checkpoint === 'function');
 function stream(source = CHART) {
  const s = Object.create(S.prototype), painted = [];
  Object.assign(s, { root: { isConnected: true }, source, shown: 0, painted: -1, boundary: false, final: false, done: false, raf: 7, wait: 9, rate: 100, alive: [], settling: [], last: 0, resolved: 0,
   paint(n, final, now, dt, boundary = false) { this.painted = n; this.final = final; this.boundary = boundary; painted.push({ n, final, boundary }); },
   sweep(now) { this.swept = now; }, settle(now) { this.settled = now; }, wake() { this.woke = (this.woke || 0) + 1; },
  });
  s.finished = new Promise(resolve => { s.resolve = () => { s.resolved++; resolve(); }; });
  return { s, painted };
 }
 const { s, painted } = stream();
 check('Checkpoint succeeds on a connected active message', s.checkpoint());
 check('It drains the full available fragment rather than leaving a typing backlog', s.shown === CHART.length && painted[0].n === CHART.length && s.rate === 0);
 check('It marks only the rendering boundary, not the whole response final', painted[0].boundary && !painted[0].final && !s.done && s.resolved === 0);
 check('Pending animation and background timers cannot overwrite the checkpoint', s.raf === 0 && s.wait === 0 && cancelled.frames.includes(7) && cancelled.timers.includes(9));
 check('Text effects are settled at the tool boundary', s.swept === Infinity && s.settled === Infinity);
 s.checkpoint(); check('An unchanged checkpoint is not needlessly repainted', painted.length === 1);
 const next = CHART + '\n\nРабота продолжается после инструмента.';
 s.push(next); s.checkpoint();
 check('More content continues the same stream after a checkpoint', !s.done && s.source === next && s.shown === next.length && s.resolved === 0 && painted.length === 2);
 const done = s.finish(); s.tick(200); await done;
 check('Only the real finish resolves the response', s.done && s.resolved === 1 && s.final);
 check('A finished stream is not reopened by a checkpoint', s.checkpoint() === false && s.resolved === 1);
 const gone = stream(); gone.s.root.isConnected = false;
 check('A detached message does not render or block agent work', gone.s.checkpoint() === false && gone.painted.length === 0);
 const empty = stream(''); check('A tool call without text has no visual checkpoint work', empty.s.checkpoint() === false && empty.painted.length === 0);
 const originalPaint = S.prototype.paint; let markdownInput;
 const ctx = { source: CHART, tones: ['blue'], cache: new Map(), root: { children: [], querySelectorAll: () => [] }, parse: html => ({ html }), create: node => node, stagger() {}, track() {} };
 ctx.root.appendChild = node => { ctx.root.children.push(node); return node; };
 const realBlocks = c.Markdown.blocks;
 c.Markdown.blocks = (text, opts) => { markdownInput = { text, opts }; return realBlocks(text, opts); };
 originalPaint.call(ctx, CHART.length, false, 100, 0, true);
 check('A checkpoint confirms the last line with a virtual newline', markdownInput.text === CHART + '\n' && markdownInput.opts.live === true);
 check('The raw model text is never rewritten', ctx.source === CHART);
 const native = ctx.root.children.map(node => node.html).join('');
 check('A closed fence without a trailing newline becomes a native completed figure', native.includes('md-diagram') && !native.includes('data-live'));
 const openSource = '```mermaid\nflowchart LR\n A[Начало] --> B[Проверка]';
 const open = c.Markdown.blocks(openSource + '\n', { live: true }).join('');
 check('An unfinished fence remains live; the renderer does not fabricate closing markup', open.includes('md-diagram') && open.includes('data-live'));
 const exportHTML = c.Markdown.blocks('```html\n<div>Export source</div>\n```\n', { live: true }).join('');
 check('Explicit HTML code remains ordinary escaped code, not executable chat content', exportHTML.includes('md-code') && !exportHTML.includes('md-diagram') && exportHTML.includes('&lt;div>'));
 c.Markdown.blocks = realBlocks;

 const rich = '## Проверено\n\n**Три** значения, *выделение* и `код`.\n\n| Этап | Число |\n| --- | --- |\n| A | 3 |\n\n> [!NOTE]\n> Это данные теста.\n\n- Первый пункт\n- Второй пункт\n\n### Перед инструментом\n\n' + CHART;
 const palette = ['pink', 'blue', 'green'];
 const richView = { source: rich, tones: palette, cache: new Map(), root: { children: [], querySelectorAll: () => [] },
  parse: html => ({ html }), create: node => node, patch: (el, node) => Object.assign(el, node), stagger() {}, track() {},
 };
 richView.root.appendChild = node => { richView.root.children.push(node); return node; };
 const paintRich = (source, final = false) => { richView.source = source; originalPaint.call(richView, source.length, final, 100, 0, !final); return richView.root.children.map(node => node.html).join(''); };
 const before = paintRich(rich);
 const headings = html => [...html.matchAll(/<h[1-6] class="([^"]+)">([^<]*)/g)].map(match => [match[1], match[2]]);
 check('Progress headings use the ordinary distinct Markdown highlight tones', headings(before)[0][0].includes('t-pink') && headings(before)[1][0].includes('t-blue'));
 check('Bold, emphasis, inline code, table, callout and list all survive a checkpoint', ['<strong>Три</strong>', '<em>выделение</em>', '<code>код</code>', 'md-table', 'md-callout', '<ul'].every(bit => before.includes(bit)));
 const continued = rich + '\n\n## После инструмента\n\n**Готово**.\n';
 const after = paintRich(continued);
 check('Continuing preserves every prior heading color and text', JSON.stringify(headings(after).slice(0, 2)) === JSON.stringify(headings(before)));
 check('The next heading advances the same palette rather than restarting it', headings(after)[2][0].includes('t-green') && richView.tones === palette);
 const final = paintRich(continued, true);
 check('Finishing preserves progress colors, rich markup and one native figure', JSON.stringify(headings(final)) === JSON.stringify(headings(after)) && (final.match(/class="md-diagram /g) || []).length === 1 && final.includes('md-table'));
 const alreadyEnded = CHART + '\n';
 richView.root.children.length = 0;
 paintRich(alreadyEnded);
 check('A fragment that already ends in a newline is not changed by checkpoint parsing', richView.source === alreadyEnded && richView.root.children.some(node => node.html.includes('md-diagram') && !node.html.includes('data-live')));

 c.UserContext.ready = Promise.resolve(); c.UserContext.prompt = () => '';
 c.Memory = { ready: Promise.resolve() }; c.AgentPrompt = c.window.AgentPrompt;
 c.AgentTools = { environment: async () => ({ shell: 'fixture shell' }), guide: async () => null };
 for (const provider of ['openai', 'chatgpt', 'anthropic', 'deepseek', 'openrouter', 'local']) {
  for (const agent of [true, false]) {
   const chat = Object.create(c.window.Chat.prototype);
   Object.assign(chat, { config: () => ({ provider }), agent: () => agent, library: { isHome: () => true }, cwd: () => 'C:\\Fixture' });
   const prompt = (await chat.system({ record: {} })).join('\n');
   check(`${provider}/${agent ? 'agent' : 'chat'} receives native-chart defaults and the explicit-artifact exception`, prompt.includes('The built-in drawing engine is the default') && prompt.includes('when the user explicitly asks for that artifact') && prompt.includes('not only the final answer'));
   check(`${provider}/${agent ? 'agent' : 'chat'} receives colored-heading and tool-boundary guidance`, prompt.includes('automatically gives these headings different highlight colors') && prompt.includes('Before a tool call, finish and close'));
   if (agent) check(`${provider}: short tool introductions do not forbid rich progress messages`, prompt.includes('not a plain-text-only limit') && prompt.includes('do not invent progress percentages'));
   if (['openai', 'chatgpt'].includes(provider)) check(`${provider}/${agent ? 'agent' : 'chat'}: the final formatting reminder also covers progress and native output`, prompt.includes('Check every visible reply, including intermediate messages before tools') && prompt.includes('not HTML or a preview server'));
  }
 }

 async function conversation({ aggregateOnly = false, visual = CHART } = {}) {
  const events = [], entry = { role: 'assistant', content: '', steps: [] }, conv = { id: 'fixture', record: { id: 'fixture' }, messages: [entry], tokens: 0 };
  const view = { stream: { push: text => events.push(['push', text]), checkpoint: () => events.push(['checkpoint', entry.content]), finish: () => { events.push(['finish']); return Promise.resolve(); } } };
  const turn = { config: { id: 'fixture', provider: 'openai' }, controller: new AbortController(), part: { entry, view }, parts: [], approvals: new Set(), queue: [], pills: [] };
  const chat = Object.create(c.window.Chat.prototype); let requests = 0;
  Object.assign(chat, { agent: () => false, system: async () => [], history: () => [], notes: () => [], seam: () => 0, session: () => 'fixture', dismissGhost() {}, showGhost() {},
   compactIfNeeded: async () => {}, planWatch: () => false, planNudge: () => '', planBack: () => '', proofAudit: () => '', save() {},
   useTool: async () => { events.push(['tool', entry.content]); return 'fixture result'; },
  });
  c.AgentTools = { shell: 'run_powershell' };
  c.Providers.stream = async (_config, options) => {
   requests++;
   const content = requests === 1 ? visual : 'Итог: проверка завершена.';
   if (!aggregateOnly) options.onContent?.(content, { content });
   return { content, toolCalls: requests === 1 ? [{ id: 't1', function: { name: 'read_file', arguments: '{}' } }] : [], finishReason: requests === 1 ? 'tool_calls' : 'stop' };
  };
  const finish = await chat.loop(conv, turn);
  return { events, entry, finish, requests };
 }
 const live = await conversation();
 const checkpoint = live.events.findIndex(e => e[0] === 'checkpoint'), tool = live.events.findIndex(e => e[0] === 'tool');
 check('A progress figure is checkpointed before the real tool loop starts its step', checkpoint >= 0 && checkpoint < tool && live.events[checkpoint][1] === CHART);
 check('Checkpointing never closes the answer before executing tools', !live.events.some(e => e[0] === 'finish'));
 check('The same message continues after the tool and retains its progress figure', live.requests === 2 && live.finish === 'stop' && live.entry.content.includes(CHART) && live.entry.content.endsWith('Итог: проверка завершена.'));
 check('Progress figures are not duplicated in the final accumulated text', (live.entry.content.match(/```mermaid/g) || []).length === 1);
 check('Native progress does not write a file or run an HTML preview server', live.events.filter(e => e[0] === 'tool').length === 1 && live.entry.steps.some(e => e.role === 'tool' && e.content === 'fixture result'));
 const aggregated = await conversation({ aggregateOnly: true });
 check('A provider that returns text only in its final packet still shows the progress visual', aggregated.events.some(e => e[0] === 'checkpoint' && e[1] === CHART));
 check('Aggregate-only final text is also retained without losing the chart', aggregated.entry.content.startsWith(CHART) && aggregated.entry.content.endsWith('Итог: проверка завершена.'));
 const words = await conversation({ visual: 'Посмотрю следующий файл.' });
 check('Ordinary short progress text and tool dispatch still work', words.events.some(e => e[0] === 'tool') && words.entry.content.includes('Посмотрю следующий файл.'));
 console.log(`\n${count} checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
