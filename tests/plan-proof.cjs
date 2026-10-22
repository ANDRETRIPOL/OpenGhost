'use strict';
// What the app sees itself before a step of the agent's plan closes (plan-proof.js), and what it reads of documents,
// projects and folders in the main process (desktop/proof.js, desktop/tools.js). Real source in VMs; the app's eyes
// (facts, project, glimpse, judge) are stand-ins where a window or a model would be needed.
const fs = require('node:fs');
const os = require('node:os');
const vm = require('node:vm');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const results = [];
const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });

const context = { window: {}, URL, console };
vm.createContext(context);
vm.runInContext(read('agent-plan.js'), context);
vm.runInContext(read('plan-proof.js'), context);
const P = context.window.PlanProof, PLAN = context.window.AgentPlan.PLAN, { TEXT } = P;
const place = shown => `C:\\p\\${String(shown).replace(/\//g, '\\')}`.toLowerCase();
const opts = { place, worked: true, shell: 'run_powershell', check: PLAN.check };
const note = (conv, name, args, output, extra = {}) => P.note(conv, P.read(name, args, output, { ...opts, ...extra }));
const fresh = () => { const conv = {}; P.begin(conv); return conv; };
const plain = value => JSON.parse(JSON.stringify(value));

// A stand-in for the app's eyes, counting what it was asked.
function eyes(over = {}) {
 const asked = { project: 0, facts: [], glimpse: [], judge: 0, pdf: 0 };
 const io = {
  project: async () => { asked.project++; return over.project || { checks: [], tests: false }; },
  facts: async file => { asked.facts.push(file); return over.facts ? over.facts(file) : { exists: true, kind: 'text', words: 120, headings: ['Intro', 'Prices'], excerpt: 'Our menu', text: 'Our menu and prices' }; },
  pdf: async () => { asked.pdf++; return { images: [{ label: 'Page 1', url: 'data:image/jpeg;base64,AA' }] }; },
  servers: async () => over.servers || [],
  glimpse: async (url, shots) => { asked.glimpse.push([url, shots]); return over.glimpse ? over.glimpse(url, shots) : { ok: true, errors: [], shots: shots ? [{ label: '390 px wide, light', url: 'data:image/jpeg;base64,AA' }] : [], title: 'Site' }; },
  judge: async docs => { asked.judge++; return over.judge ? over.judge(docs) : { unmet: [] }; },
 };
 return { io, asked };
}

(async () => {
 // What a call shows.
 const conv = fresh();
 note(conv, 'write_file', { path: 'src/app.js', content: 'a\nb\nc' }, 'Created C:\\p\\src\\app.js (3 lines)');
 note(conv, 'edit_file', { path: 'README.md', old_string: 'x', new_string: 'y\nz' }, 'Edited C:\\p\\README.md, 1 place changed');
 note(conv, 'read_file', { path: 'README.md' }, 'y\nz');
 note(conv, 'list_files', {}, 'C:\\p\nsrc/');
 note(conv, 'run_powershell', { command: 'npm test' }, 'Exit code 0\n3 passing');
 note(conv, 'git', { args: ['status'] }, 'Exit code 0\nclean');
 note(conv, 'fetch_url', { url: 'https://example.com/a' }, 'Page text');
 note(conv, 'browser_click', { ref: 2 }, 'Page: Thanks\nURL: https://shop.test/thanks\nheading "Thanks"');
 note(conv, 'browser_type', { ref: 1, text: 'x' }, 'Error: no field 1', { worked: false });
 note(conv, 'find_media', { query: 'pizza' }, '![p](https://img.test/p.jpg)');
 note(conv, 'show_pictures', { pictures: [{ path: 'shot.png', caption: 'x' }] }, 'shown');
 const kinds = conv.planLog.map(event => `${event.kind}${event.how ? `:${event.how}` : ''}${event.ok === false ? ':failed' : ''}`);
 check('Each call is noted as what it shows', kinds, ['change:added', 'change:changed', 'look', 'look', 'ran', 'check', 'ran', 'opened', 'page', 'page:failed', 'searched', 'look']);
 check('Changes keep their place, how they came and how many lines', [conv.planLog[0].path, conv.planLog[0].lines, conv.planLog[1].lines, conv.planLog[0].by], ['c:\\p\\src\\app.js', 3, 2, 'tool']);
 check('A command\'s end and a page\'s address and title are read', [conv.planLog[5].command, conv.planLog[5].code, conv.planLog[8].url, conv.planLog[8].title], ['npm test', 0, 'https://shop.test/thanks', 'Thanks']);
 check('Nothing is noted while no plan stands', (() => { const none = {}; P.note(none, { kind: 'look' }); return none.planLog; })(), undefined);
 const moved = P.changes({ touched: ['new.txt', 'b.js'], added: ['new.txt'], removed: ['gone.txt'] }, place);
 check('What a command did to the folder: made, changed, removed', moved.map(event => `${event.shown}:${event.how}:${event.by}`), ['new.txt:added:command', 'b.js:changed:command', 'gone.txt:removed:command']);

 // Code in a project with checks.
 let c = fresh(), e = eyes({ project: { checks: ['npm test'], tests: true } });
 note(c, 'edit_file', { path: 'src/app.js', new_string: 'x' }, 'Edited');
 let gate = await P.gate(c, 1, { io: e.io });
 check('Code changed with no check after it keeps the step open, naming the project\'s check', [!!gate.refuse, gate.refuse.includes('npm test'), gate.refuse.startsWith('Error:')], [true, true, true]);
 note(c, 'run_powershell', { command: 'npm test' }, 'Exit code 1\n1 failing');
 gate = await P.gate(c, 1, { io: e.io });
 check('A check that failed after the change keeps it open', gate.refuse.includes('exit code 1'), true);
 note(c, 'run_powershell', { command: 'npm test' }, 'Exit code 0\n4 passing');
 gate = await P.gate(c, 1, { io: e.io });
 check('A check that passed after the change closes it, by the check', plain(gate), { by: 'check', saw: [{ k: 'check', command: 'npm test' }] });
 note(c, 'edit_file', { path: 'src/app.js', new_string: 'y' }, 'Edited');
 check('A change after the check makes the check stale again', !!(await P.gate(c, 1, { io: e.io })).refuse, true);
 c = fresh();
 note(c, 'run_powershell', { command: 'npx vitest run' }, 'Exit code 0');
 note(c, 'edit_file', { path: 'a.py', new_string: 'x' }, 'Edited');
 check('A check run in this plan counts as the project\'s, even with none declared', (await P.gate(c, 1, { io: eyes().io })).refuse.includes('npx vitest run'), true);

 // Code with no checks to run.
 c = fresh(); e = eyes();
 note(c, 'write_file', { path: 'tool.py', content: 'print(1)' }, 'Rewrote tool.py (1 lines)');
 gate = await P.gate(c, 2, { io: e.io });
 check('Code never run or read since is shown once, not refused', [!!gate.refuse, gate.refuse.startsWith('Error:'), gate.refuse.includes('tool.py')], [true, false, true]);
 gate = await P.gate(c, 2, { io: e.io });
 check('Closed again with nothing changed, it closes on the agent\'s word', plain(gate), { by: 'word', saw: [] });
 c = fresh();
 note(c, 'write_file', { path: 'tool.py', content: 'print(1)' }, 'Rewrote tool.py (1 lines)');
 note(c, 'run_powershell', { command: 'python tool.py' }, 'Exit code 0\n1');
 check('Run after the change, it closes as seen', plain(await P.gate(c, 2, { io: eyes().io })), { by: 'seen', saw: [{ k: 'ran' }] });

 // Tests along with a good deal of new code.
 c = fresh(); e = eyes({ project: { checks: ['npm test'], tests: true } });
 note(c, 'write_file', { path: 'src/cart.js', content: 'x\n'.repeat(40) }, 'Created src/cart.js (41 lines)');
 note(c, 'run_powershell', { command: 'npm test' }, 'Exit code 0');
 gate = await P.gate(c, 1, { io: e.io });
 check('New code and no test in a project with tests: asked for one, once', [!!gate.refuse, gate.refuse.includes('no test')], [true, true]);
 check('then it closes, by the check', (await P.gate(c, 1, { io: e.io })).by, 'check');
 c = fresh();
 note(c, 'write_file', { path: 'src/cart.js', content: 'x\n'.repeat(40) }, 'Created src/cart.js (41 lines)');
 note(c, 'write_file', { path: 'src/cart.test.js', content: 'test' }, 'Created src/cart.test.js (1 lines)');
 note(c, 'run_powershell', { command: 'npm test' }, 'Exit code 0');
 check('With a test changed too, nothing is asked', (await P.gate(c, 1, { io: e.io })).by, 'check');
 c = fresh();
 note(c, 'edit_file', { path: 'src/cart.js', new_string: 'one line' }, 'Edited');
 note(c, 'run_powershell', { command: 'npm test' }, 'Exit code 0');
 check('A small change needs no new test', (await P.gate(c, 1, { io: e.io })).by, 'check');

 // Documents.
 c = fresh(); e = eyes();
 note(c, 'write_file', { path: 'menu.md', content: '# Menu' }, 'Created menu.md (1 lines)');
 gate = await P.gate(c, 1, { io: e.io });
 check('A document not read back is shown as it is now', [gate.refuse.startsWith('Step 1 is not closed yet'), gate.refuse.includes('menu.md as it is now: text, 120 words, headings: Intro / Prices'), gate.refuse.includes('It begins: “Our menu”')], [true, true, true]);
 check('then it closes, as seen by the app', plain(await P.gate(c, 1, { io: e.io })), { by: 'seen', saw: [{ k: 'shown', file: 'menu.md' }] });
 c = fresh();
 note(c, 'write_file', { path: 'menu.md', content: '# Menu' }, 'Created menu.md (1 lines)');
 note(c, 'read_file', { path: 'menu.md' }, '# Menu');
 check('A document read back after its change closes at once', plain(await P.gate(c, 1, { io: e.io })), { by: 'seen', saw: [{ k: 'read', file: 'menu.md' }] });
 c = fresh(); e = eyes();
 P.note(c, P.changes({ touched: ['cv.pdf'], added: ['cv.pdf'], removed: [] }, place));
 gate = await P.gate(c, 1, { io: e.io, vision: true });
 check('A PDF a command made is shown with its first pages as pictures', [gate.images.length, e.asked.pdf], [1, 1]);
 gate = await P.gate(fresh(), 1, { io: e.io });
 check('A step that changed nothing closes on the word', gate.by, 'word');
 c = fresh(); e = eyes({ facts: () => ({ exists: false }) });
 note(c, 'write_file', { path: 'menu.md', content: 'x' }, 'Created menu.md (1 lines)');
 check('A document that is not there any more is said so', (await P.gate(c, 1, { io: e.io })).refuse.includes('menu.md is not there now'), true);
 c = fresh(); e = eyes();
 note(c, 'write_file', { path: 'requirements.txt', content: 'flask' }, 'Created requirements.txt (1 lines)');
 check('A list of packages is no document', [(await P.gate(c, 1, { io: e.io })).by, e.asked.facts.length], ['word', 0]);
 check('A Word document\'s facts read as a line', P.describe({ kind: 'Word document', pages: 2, words: 640, headings: ['Experience', 'Education'], excerpt: 'Anna Smith' }), 'Word document, 2 pages, 640 words, headings: Experience / Education. It begins: “Anna Smith”');

 // Files a command removed.
 c = fresh();
 P.note(c, P.changes({ touched: ['b.txt'], added: ['b.txt'], removed: ['a.txt'] }, place));
 gate = await P.gate(c, 1, { io: eyes().io });
 check('Files a command removed are named, once', [gate.refuse.includes('removed a.txt'), gate.refuse.includes('made 1, moved 0, changed 0')], [true, true]);
 gate = await P.gate(c, 1, { io: eyes().io });
 check('then the step closes with what was made and removed, the text file made shown too', plain(gate.saw), [{ k: 'shown', file: 'b.txt' }, { k: 'files', added: 1, moved: 0, changed: 0, removed: 1 }]);
 // Files moved into a folder are neither new documents nor removals (seen with DeepSeek: an archive of .txt files).
 c = fresh(); e = eyes();
 P.note(c, P.changes({ touched: ['archive/a.txt', 'archive/b.txt'], added: ['archive/a.txt', 'archive/b.txt'], removed: ['a.txt', 'b.txt', 'old.log'] }, place));
 gate = await P.gate(c, 1, { io: e.io });
 check('Moved files are not shown as documents nor told as removed; a file really gone is', [e.asked.facts.length, gate.refuse.includes('removed old.log'), /removed[^.]*a\.txt/.test(gate.refuse), gate.refuse.includes('moved 2')], [0, true, false, true]);
 check('closed again, the step says what moved', plain((await P.gate(c, 1, { io: e.io })).saw), [{ k: 'files', added: 0, moved: 2, changed: 0, removed: 1 }]);
 note(c, 'run_powershell', { command: 'Remove-Item c.txt' }, 'Exit code 0');
 P.note(c, P.changes({ touched: [], added: [], removed: ['c.txt'] }, place));
 check('A new removal after it was shown is shown again', (await P.gate(c, 1, { io: eyes().io })).refuse?.includes('c.txt'), true);

 // The browser.
 c = fresh();
 note(c, 'browser_click', { ref: 3 }, 'Error: the page did not answer', { worked: false });
 gate = await P.gate(c, 1, { io: eyes().io });
 check('A last browser step that did not go through is told once, not refused: the site may be down', [gate.refuse.startsWith('Step 1 is not closed yet'), gate.refuse.includes('did not go through (click')], [true, true]);
 check('closed again, it closes on the word', (await P.gate(c, 1, { io: eyes().io })).by, 'word');
 note(c, 'browser_snapshot', {}, 'Page: Order 1042 placed\nURL: https://shop.test/done');
 check('One that did ends the step on the page it shows', plain(await P.gate(c, 1, { io: eyes().io })), { by: 'seen', saw: [{ k: 'page', title: 'Order 1042 placed' }] });

 // A page of the user's own project.
 c = fresh(); e = eyes();
 note(c, 'write_file', { path: 'site/index.html', content: '<h1>Hi</h1>' }, 'Created site/index.html (1 lines)');
 note(c, 'read_file', { path: 'site/index.html' }, '<h1>Hi</h1>');
 gate = await P.gate(c, 1, { io: e.io, vision: true });
 check('A page file changed is opened by the app, with pictures at two widths and themes', [e.asked.glimpse[0][0], e.asked.glimpse[0][1], gate.images.length, gate.refuse.includes('phone')], ['file:///c:/p/site/index.html', true, 1, true]);
 gate = await P.gate(c, 1, { io: e.io, vision: true });
 check('then it closes without opening the page again', [gate.by, e.asked.glimpse.length], ['seen', 1]);
 c = fresh(); e = eyes();
 note(c, 'write_file', { path: 'site/index.html', content: '<h1>Hi</h1>' }, 'Created site/index.html (1 lines)');
 await P.gate(c, 1, { io: e.io, vision: false });
 check('A model that sees no pictures is not sent them', e.asked.glimpse[0][1], false);
 c = fresh(); e = eyes({ glimpse: () => ({ ok: true, errors: ['Uncaught TypeError: x is undefined (app.js:4)'], shots: [], title: 'Site' }) });
 note(c, 'write_file', { path: 'site/style.css', content: 'a{}' }, 'Created');
 note(c, 'browser_navigate', { url: 'file:///c:/p/site/index.html' }, 'Page: Site\nURL: file:///c:/p/site/index.html');
 gate = await P.gate(c, 1, { io: e.io });
 check('The page the browser ended on is opened, and its console errors told', [e.asked.glimpse[0][0], gate.refuse.includes('x is undefined')], ['file:///c:/p/site/index.html', true]);
 c = fresh(); e = eyes({ servers: [5173], project: { checks: [], tests: false }, glimpse: () => ({ ok: false, error: 'the server answered 500' }) });
 note(c, 'edit_file', { path: 'server.js', new_string: 'x' }, 'Edited');
 note(c, 'run_powershell', { command: 'node server.js' }, 'Exit code 0');
 gate = await P.gate(c, 1, { io: e.io });
 check('A server of the agent\'s that answers 500 keeps the step open', [e.asked.glimpse[0][0], e.asked.glimpse[0][1], gate.refuse.startsWith('Error:'), gate.refuse.includes('500')], ['http://localhost:5173/', false, true, true]);
 c = fresh(); e = eyes();
 note(c, 'edit_file', { path: 'tool.py', new_string: 'x' }, 'Edited');
 note(c, 'run_powershell', { command: 'python tool.py' }, 'Exit code 0');
 await P.gate(c, 1, { io: e.io });
 check('No server and no page: nothing is opened', e.asked.glimpse.length, 0);

 // The last step: links, quotations, documents against the request.
 c = fresh(); e = eyes();
 note(c, 'web_search', { query: 'pizza' }, 'Result: https://a.test/one');
 note(c, 'fetch_url', { url: 'https://b.test/two' }, 'The oven heats to four hundred and fifty degrees for twenty minutes.');
 note(c, 'find_media', { query: 'pizza' }, '[video](https://video.test/v1)');
 const said = 'See https://b.test/two and https://a.test/one and https://made.up/x and https://given.test/y.\n![p](https://img.test/p.jpg) https://video.test/v1\n```\nfetch("https://code.test/api")\n```\n“The oven heats to four hundred and fifty degrees for twenty minutes.” (https://b.test/two)\n“Every pizza needs exactly nine grams of salt per kilo of flour.” (https://b.test/two)';
 gate = await P.gate(c, 3, { io: e.io, last: true, texts: [said], given: ['use https://given.test/y'] });
 check('Links never opened are named: searched-only, made-up and user-given ones; not opened ones, pictures, videos or code', [gate.refuse.includes('“https://a.test/one”, “https://made.up/x”, “https://given.test/y”'), /b\.test|img\.test|video\.test|code\.test/.test(gate.refuse.split('Quotations')[0])], [true, false]);
 check('A quotation found on no page opened is named; one found is not', [gate.refuse.includes('nine grams of salt'), gate.refuse.includes('four hundred and fifty degrees')], [true, false]);
 check('Not before the last step', (await P.gate(c, 2, { io: e.io, last: false, texts: [said] })).by, 'seen');
 // A document that quotes from memory and is read back: it is no source of its own quotes (seen with GPT-6 Luna).
 c = fresh(); e = eyes({ facts: () => ({ exists: true, kind: 'text', words: 20, excerpt: '#', text: '> “A baguette is a long, thin type of bread of French origin.”\n\nSource: https://en.wikipedia.org/wiki/Baguette' }) });
 note(c, 'fetch_url', { url: 'https://en.wikipedia.org/wiki/Sourdough' }, 'Sourdough is bread made by the fermentation of dough.');
 note(c, 'write_file', { path: 'research2.md', content: '> “A baguette is a long, thin type of bread of French origin.”\n\nSource: https://en.wikipedia.org/wiki/Baguette' }, 'Created research2.md (3 lines)');
 note(c, 'read_file', { path: 'research2.md' }, '> “A baguette is a long, thin type of bread of French origin.”\n\nSource: https://en.wikipedia.org/wiki/Baguette');
 gate = await P.gate(c, 3, { io: e.io, last: true, given: ['add a link to https://en.wikipedia.org/wiki/Baguette, do not open it'] });
 check('A quotation from memory in a document read back, and the page it names never opened, are both caught', [gate.refuse?.includes('wiki/Baguette'), gate.refuse?.includes('long, thin type of bread')], [true, true]);
 c = fresh(); e = eyes({ facts: () => ({ exists: true, kind: 'text', words: 9, excerpt: 'Report', text: 'Sources: https://never.test/opened and https://b.test/two' }) });
 note(c, 'fetch_url', { url: 'https://b.test/two' }, 'page');
 note(c, 'write_file', { path: 'report.md', content: 'x' }, 'Created report.md (1 lines)');
 note(c, 'read_file', { path: 'report.md' }, 'x');
 check('The links of a report the plan wrote are read too', (await P.gate(c, 2, { io: e.io, last: true })).refuse?.includes('“https://never.test/opened”'), true);
 // The answer written after the plan, read once.
 c = fresh();
 note(c, 'fetch_url', { url: 'https://b.test/two' }, 'The oven heats to four hundred and fifty degrees for twenty minutes.');
 const audited = P.audit(c, 'From https://b.test/two and https://made.up/x: “Every pizza needs exactly nine grams of salt per kilo of flour.”', []);
 check('An answer after the plan with a link never opened and a quotation found nowhere is sent back once', [audited.startsWith(TEXT.audit), audited.includes('https://made.up/x'), audited.includes('nine grams'), audited.includes('b.test/two')], [true, true, true, false]);
 check('One whose sources stand is not', P.audit(c, 'See https://b.test/two: “The oven heats to four hundred and fifty degrees for twenty minutes.”', []), '');
 check('Nor one from what the agent knows, with nothing opened or searched', P.audit(fresh(), 'See https://made.up/x', []), '');
 note(c, 'write_file', { path: 'index.html', content: '<h1>Bread that is baked while the whole city is still asleep</h1>' }, 'Created index.html (1 lines)');
 check('Words in quotes with no source beside them are the agent\'s own: a title it wrote is no quotation (seen with DeepSeek)', P.audit(c, 'The page opens with “A warm loaf for every family on our quiet little street”.\n\nSources: https://b.test/two', []), '');
 check('Nor are words it wrote into a file, quoted beside a link', P.audit(c, 'The heading “Bread that is baked while the whole city is still asleep” follows https://b.test/two', []), '');
 check('A quoted block with no link is a quotation still', P.audit(c, '> Every pizza needs exactly nine grams of salt per kilo of flour, always.', []).includes('nine grams'), true);
 c = fresh(); e = eyes({ judge: () => ({ unmet: e.asked.judge === 1 ? ['a vegetarian section'] : [] }) });
 note(c, 'write_file', { path: 'menu.md', content: '# Menu' }, 'Created menu.md (1 lines)');
 note(c, 'read_file', { path: 'menu.md' }, '# Menu');
 gate = await P.gate(c, 2, { io: e.io, last: true, texts: [], given: ['Make a menu with a vegetarian section'] });
 check('At the last step the documents are weighed against the request, and what is missing told once', [e.asked.judge, gate.refuse.includes('a vegetarian section')], [1, true]);
 gate = await P.gate(c, 2, { io: e.io, last: true });
 check('closed again over it with nothing changed, the step stands on what was seen, not as judged', [gate.by, e.asked.judge], ['seen', 1]);
 note(c, 'edit_file', { path: 'menu.md', new_string: '## Vegetarian' }, 'Edited');
 note(c, 'read_file', { path: 'menu.md' }, '## Vegetarian');
 gate = await P.gate(c, 2, { io: e.io, last: true });
 check('fixed and read back, it is weighed again and judged', [gate.by, e.asked.judge, plain(gate.saw)], ['judged', 2, [{ k: 'judged' }, { k: 'read', file: 'menu.md' }]]);
 c = fresh(); e = eyes();
 note(c, 'write_file', { path: 'menu.md', content: '# Menu' }, 'Created menu.md (1 lines)');
 note(c, 'read_file', { path: 'menu.md' }, '# Menu');
 check('Nothing missing: judged at once', (await P.gate(c, 2, { io: e.io, last: true })).by, 'judged');
 c = fresh(); e = eyes({ project: { checks: ['npm test'], tests: false } });
 note(c, 'write_file', { path: 'README.md', content: '# App' }, 'Created README.md (1 lines)');
 note(c, 'read_file', { path: 'README.md' }, '# App');
 note(c, 'edit_file', { path: 'app.js', new_string: 'x' }, 'Edited');
 note(c, 'run_powershell', { command: 'npm test' }, 'Exit code 0');
 await P.gate(c, 2, { io: e.io, last: true });
 check('In a plan that wrote code, a README is not weighed against the request', e.asked.judge, 0);

 // Hard and soft together, and a step answering only for its own work.
 c = fresh(); e = eyes({ project: { checks: ['npm test'], tests: false } });
 note(c, 'edit_file', { path: 'app.js', new_string: 'x' }, 'Edited');
 note(c, 'write_file', { path: 'notes.md', content: 'x' }, 'Created notes.md (1 lines)');
 gate = await P.gate(c, 1, { io: e.io });
 check('What must be right comes first, what to look at after', [gate.refuse.startsWith('Error:'), gate.refuse.indexOf('npm test') < gate.refuse.indexOf('notes.md as it is now')], [true, true]);
 note(c, 'run_powershell', { command: 'npm test' }, 'Exit code 0');
 check('With the check run, the document shown is not shown again', (await P.gate(c, 1, { io: e.io })).by, 'check');
 P.closed(c);
 check('The next step answers only for what is done after', (await P.gate(c, 2, { io: e.io })).by, 'word');
 P.begin(c);
 check('A new plan starts with nothing seen', [c.planLog.length, c.planSeq, plain(c.planShown)], [0, 0, {}]);

 // An agent that turns from one open step to another and back is not shown the same again (seen with DeepSeek).
 c = fresh(); e = eyes();
 note(c, 'write_file', { path: 'menu.md', content: 'x' }, 'Created menu.md (1 lines)');
 const turns = [];
 for (const n of [1, 2, 1, 2]) turns.push((await P.gate(c, n, { io: e.io })).refuse ? 'shown' : 'closes');
 check('Steps closed in turn: what was shown for one is not shown again for the other', turns, ['shown', 'closes', 'closes', 'closes']);
 c = fresh(); e = eyes();
 note(c, 'write_file', { path: 'index.html', content: '<h1>Hi</h1>' }, 'Created index.html (1 lines)');
 const first = await P.gate(c, 1, { io: e.io });
 const second = await P.gate(c, 2, { io: e.io });
 check('A page shown for one step is not opened again for another, and still counts', [!!first.refuse, !!second.refuse, e.asked.glimpse.length, plain(second.saw)], [true, false, 1, [{ k: 'site', errors: 0, shots: true }]]);
 note(c, 'edit_file', { path: 'index.html', new_string: '<h1>Hello</h1>' }, 'Edited');
 check('Changed after, it is opened again', [!!(await P.gate(c, 2, { io: e.io })).refuse, e.asked.glimpse.length], [true, 2]);
 // A file the agent made during the plan and removed again is its own, not the user's.
 c = fresh();
 P.note(c, P.changes({ touched: ['_check.html'], added: ['_check.html'], removed: [] }, place));
 P.note(c, P.changes({ touched: [], added: [], removed: ['_check.html', 'old.txt'] }, place));
 gate = await P.gate(c, 1, { io: eyes().io });
 check('Of what a command removed, only what was there before the plan is told', [gate.refuse?.includes('removed old.txt'), gate.refuse?.includes('_check.html')], [true, false]);

 // The judge's answer, a page file's address, what the top of the chat is told.
 check('The judge\'s answer is read from its JSON, with words around it', plain(P.verdict('Sure: {"unmet": ["a price list", " "]} ok')), { unmet: ['a price list'] });
 check('An answer that is not JSON says nothing', P.verdict('All good'), null);
 check('The judge sees the request and the files, not the agent\'s words', plain(P.judgeMessages('make a menu', [{ shown: 'menu.md', facts: { kind: 'text', words: 3, text: 'Pizza Pasta Salad' } }])).map(message => message.role), ['system', 'user']);
 check('A Windows file becomes an address the page can be opened at', P.fileUrl('C:\\My Site\\index.html'), 'file:///C:/My%20Site/index.html');
 check('The top of the chat is told two things at most, the strongest first', plain(P.short([{ k: 'files', added: 1 }, { k: 'read', file: 'a' }, { k: 'check', command: 'npm test' }])), [{ k: 'check', command: 'npm test' }, { k: 'read', file: 'a' }]);

 // The main process: documents, projects, pages allowed, and what a command did to a folder.
 const electron = { BrowserWindow: function () { throw new Error('no windows in tests'); }, app: { getPath: () => path.join(os.tmpdir(), 'og-proof-profile') }, net: {} };
 const main = { module: { exports: {} }, exports: {}, process, Buffer, TextDecoder, URL, AbortController, setTimeout, clearTimeout,
  require: name => name === 'electron' ? electron : name === './pdf' ? { study: async () => ({ text: 'Page one words', pages: 3 }) } : name.startsWith('./') ? {} : require(name) };
 vm.createContext(main);
 vm.runInContext(read('desktop/proof.js'), main);
 const D = main.module.exports;
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-proof-'));
 // A zip made here as Word, PowerPoint and Excel make theirs: one part stored, the rest deflated.
 const crc = buffer => { let c = ~0; for (const byte of buffer) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
 const zip = files => {
  const locals = [], centrals = [];
  let offset = 0;
  Object.entries(files).forEach(([name, text], k) => {
   const data = Buffer.from(text), packed = k === 0 ? data : zlib.deflateRawSync(data), method = k === 0 ? 0 : 8, nameBuf = Buffer.from(name);
   const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8); local.writeUInt32LE(crc(data), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
   const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10); central.writeUInt32LE(crc(data), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
   locals.push(local, nameBuf, packed); centrals.push(central, nameBuf);
   offset += 30 + nameBuf.length + packed.length;
  });
  const dirBuf = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dirBuf, end]);
 };
 const at = name => path.join(dir, name);
 fs.writeFileSync(at('cv.docx'), zip({
  '[Content_Types].xml': '<Types/>',
  'word/document.xml': '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Anna Smith</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Experience</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Ten years at </w:t></w:r><w:r><w:t>Acme &amp; Co</w:t></w:r></w:p></w:body></w:document>',
  'docProps/app.xml': '<Properties><Pages>2</Pages></Properties>',
 }));
 fs.writeFileSync(at('deck.pptx'), zip({ '[Content_Types].xml': '<Types/>', 'ppt/slides/slide2.xml': '<p:sld><a:t>Prices</a:t></p:sld>', 'ppt/slides/slide1.xml': '<p:sld><a:t>Welcome</a:t><a:t>to the deck</a:t></p:sld>' }));
 fs.writeFileSync(at('book.xlsx'), zip({ '[Content_Types].xml': '<Types/>', 'xl/workbook.xml': '<workbook><sheets><sheet name="Menu" sheetId="1"/><sheet name="Prices" sheetId="2"/></sheets></workbook>', 'xl/worksheets/sheet1.xml': '<sheetData><row r="1"/><row r="2"/><row r="3"/></sheetData>', 'xl/worksheets/sheet2.xml': '<sheetData><row r="1"/></sheetData>', 'xl/sharedStrings.xml': '<sst><si><t>Pizza</t></si></sst>' }));
 fs.writeFileSync(at('menu.md'), '# Menu\n\nPizza and pasta.\n\n## Prices\n');
 fs.writeFileSync(at('page.html'), '<html><head><style>h1{}</style></head><body><h1>Hello <b>you</b></h1><script>var x=1</script><p>Words here</p></body></html>');
 fs.writeFileSync(at('table.csv'), 'a,b\n1,2\n3,4\n');
 fs.writeFileSync(at('blob.bin'), Buffer.from([1, 0, 2, 0, 3]));
 fs.writeFileSync(at('doc.pdf'), '%PDF-1.4');
 const facts = async name => plain(await D.facts(at(name)));
 const word = await facts('cv.docx');
 check('A Word document: its words, headings and pages', [word.kind, word.pages, word.headings, word.words, word.text], ['Word document', 2, ['Anna Smith', 'Experience'], 8, 'Anna Smith\nExperience\nTen years at Acme & Co']);
 const deck = await facts('deck.pptx');
 check('A slide deck: its slides in order, each one\'s first words as its heading', [deck.slides, deck.headings, deck.text], [2, ['Welcome', 'Prices'], 'Welcome to the deck\nPrices']);
 const book = await facts('book.xlsx');
 check('A workbook: its sheets with their rows', [book.kind, book.sheets], ['spreadsheet', [{ name: 'Menu', rows: 3 }, { name: 'Prices', rows: 1 }]]);
 check('Markdown: its headings and words', [(await facts('menu.md')).headings, (await facts('menu.md')).words], [['Menu', 'Prices'], 5]);
 const page = await facts('page.html');
 check('A web page: headings without tags, and no script or style in its words', [page.headings, page.text.includes('var x'), page.text.includes('Words here')], [['Hello you'], false, true]);
 check('A table: its rows', (await facts('table.csv')).rows, 3);
 check('A binary file is said to be one, a PDF read for its pages', [(await facts('blob.bin')).binary, (await facts('doc.pdf')).pages], [true, 3]);
 check('A file that is not there, or not given whole', [(await facts('none.md')).exists, plain(await D.facts('menu.md')).exists], [false, false]);
 check('Something that is no zip is not read as one', D.zipParts(Buffer.from('not a zip at all, nowhere near')), null);
 // Projects.
 const project = async files => { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'og-project-')); for (const [name, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(p, name)), { recursive: true }); fs.writeFileSync(path.join(p, name), text); } const found = plain(await D.project(p)); fs.rmSync(p, { recursive: true, force: true }); return found; };
 check('npm scripts become checks; npm init\'s failing test is none', await project({ 'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1', build: 'vite build', lint: 'eslint .' } }) }), { checks: ['npm run build', 'npm run lint'], tests: false });
 check('The runner follows the lock file; tests are found by their names', await project({ 'package.json': JSON.stringify({ scripts: { test: 'vitest' } }), 'pnpm-lock.yaml': '', 'src/cart.test.ts': '' }), { checks: ['pnpm test'], tests: true });
 check('pytest, cargo and go have theirs; tests in node_modules do not count', await project({ 'pytest.ini': '[pytest]', 'Cargo.toml': '', 'go.mod': '', 'node_modules/x/a.test.js': '' }), { checks: ['python -m pytest', 'cargo test', 'go test ./...'], tests: false });
 check('An empty folder has no checks and no tests', await project({}), { checks: [], tests: false });
 // Pages the app may open itself: the project's own, nothing else.
 fs.mkdirSync(at('site'));
 fs.writeFileSync(at('site/index.html'), '<h1>x</h1>');
 check('A server on this computer may be opened; one elsewhere may not', [!!D.allowed('http://localhost:5173/', dir), !!D.allowed('http://127.0.0.1:3000/a', dir), D.allowed('https://example.com/', dir)], [true, true, '']);
 check('A page file of the project may; one outside it, a missing one or no page at all may not', [!!D.allowed(context.window.PlanProof.fileUrl(at('site/index.html')), dir), D.allowed(context.window.PlanProof.fileUrl(at('site/index.html')), at('site/inner')), D.allowed(context.window.PlanProof.fileUrl(at('site/none.html')), dir), D.allowed(context.window.PlanProof.fileUrl(at('menu.md')), dir)], [true, '', '', '']);
 fs.rmSync(dir, { recursive: true, force: true });
 // What a command did to a folder, told apart; changed() is as it was.
 const tools = { module: { exports: {} }, exports: {}, process, Buffer, TextDecoder, URL, AbortController, setTimeout, clearTimeout,
  require: name => name === 'electron' ? electron : name.startsWith('./') ? {} : require(name) };
 vm.createContext(tools);
 vm.runInContext(read('desktop/tools.js'), tools);
 const T = tools.module.exports, folder = fs.mkdtempSync(path.join(os.tmpdir(), 'og-changes-'));
 for (const [file, text] of [['a.txt', 'a'], ['b.txt', 'b'], ['gone.txt', 'g']]) fs.writeFileSync(path.join(folder, file), text);
 const marks = [await T.mark(folder), await T.mark(folder)];
 await new Promise(resolve => setTimeout(resolve, 30));
 fs.writeFileSync(path.join(folder, 'b.txt'), 'bb');
 fs.writeFileSync(path.join(folder, 'new.txt'), 'n');
 fs.rmSync(path.join(folder, 'gone.txt'));
 const told = plain(await T.changes(marks[0]));
 check('A command\'s made, changed and removed files are told apart', [told.touched.sort(), told.added, told.removed], [['b.txt', 'new.txt'], ['new.txt'], ['gone.txt']]);
 check('and changed() lists them all as before', (await T.changed(marks[1])).sort(), ['b.txt', 'gone.txt', 'new.txt']);
 fs.rmSync(folder, { recursive: true, force: true });

 const failed = results.filter(item => !item.pass);
 for (const item of results) console.log(`${item.pass ? 'ok  ' : 'FAIL'} ${item.name}${item.pass ? '' : `\n     got      ${JSON.stringify(item.actual)}\n     expected ${JSON.stringify(item.expected)}`}`);
 console.log(`\n${results.length - failed.length} of ${results.length} passed`);
 process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
