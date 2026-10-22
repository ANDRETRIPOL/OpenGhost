(() => {
'use strict';

// What the app itself saw of the work under the agent's plan (agent-plan.js), and what it wants to see before a step is
// closed, so that a step stands on what is there and not on the agent's word. While a plan stands, every tool call is
// noted in the order it came: what changed (a file the agent wrote, a file a command changed, made or removed), what was
// looked at after (a file read back, a folder, a page), the checks run and how they ended, the pages opened. Before a
// step closes, what it changed asks for what fits:
//  - code in a project with checks (tests, a build, a linter): one of them run after the last change, and passed. Code
//    with no checks to run: run, read back or seen after. A good deal of new code in a project with tests: tests too;
//  - a document: read back after its last change, or shown to the agent by the app as it now is;
//  - files a command removed: named, to be put back if that was not meant;
//  - the browser: its last step went through, and the page it ended on is told;
//  - a page of the user's own project, on a server of the agent's or as a file of it: opened by the app apart from the
//    browser at a phone's and a desktop's width, light and dark, with its console's errors. A server that does not
//    answer keeps the step open;
//  - at the last step: links never opened and quotations found on no page opened, and documents weighed against the
//    user's request by a model that sees only the request and the files.
// What the app shows, it shows once: closed again with nothing changed since, the step closes. Each closed step keeps
// how it was shown to work (`by`: a check that passed, judged apart from the agent, seen, or the agent's word) and what
// the app saw of it (`saw`), for the top of the chat.
const PROOF = {
 code: /\.(m?[jt]sx?|cjs|cts|mts|py|rb|go|rs|java|kts?|swift|c|cc|cpp|h|hpp|cs|php|lua|dart|scala|sh|ps1|vue|svelte|astro|sql)$/i,
 web: /\.(html?|css|scss|sass|less|vue|svelte|astro|jsx|tsx)$/i,
 doc: /\.(md|markdown|txt|rtf|docx|docm|odt|pdf|xlsx|xlsm|ods|csv|pptx|pptm|odp)$/i,
 test: /(^|[\\/])(tests?|__tests__|specs?)[\\/]|[.-](test|spec)\.\w+$|_test\.(go|py)$|(^|[\\/])test_[\w-]+\.py$/i,
 // Files of a project that are text but no one's document: lists of packages, licences, robots.
 chores: /(^|[\\/])(requirements[\w.-]*\.txt|robots\.txt|LICEN[CS]E(\.\w+)?|CHANGELOG\.md|[\w.-]+\.lock)$/i,
 // Lines of code a step changes before a project with tests is expected to have its tests changed too.
 big: 30,
 // Shown at most in one answer: documents, files removed, console errors, links, quotations.
 docs: 3,
 removed: 10,
 errors: 6,
 links: 10,
 quotes: 6,
 // A quotation this long is looked for on the pages opened; a shorter one may be a phrase anyone writes.
 quote: 40,
 // What is kept of a page's words for quotations to be found in, each and in all.
 page: 60000,
 corpus: 1500000,
 // Calls noted while a plan stands.
 log: 600,
};
const RANK = { word: 0, seen: 1, judged: 2, check: 3 };

const TEXT = {
 must: n => `Error: step ${n} is not closed. The app looked at the result itself, and this has to be right first:`,
 look: n => `Step ${n} is not closed yet: the app looked at the result itself before closing it. Read what it found. Fix what is wrong; if it is all as it should be, close the step again as it is, with nothing to add.`,
 also: 'And before you close it, read what else the app found; if it is all as it should be, close the step again:',
 stale: (files, command) => `You changed code (${files}) after the last check. Run ${command ? `the project's check (${command})` : 'its check again'} and close the step once it passes.`,
 failed: (command, code) => `Your check after the last change failed: “${command}” ended with exit code ${code}. Fix what failed and run it again.`,
 unseen: files => `You changed ${files} and have not run it, read it back or opened it since. Do that now: the step's proof is what it showed.`,
 tests: files => `This step adds a good deal of code (${files}) and no test: the project has tests. Add or change a test for what you made, or close the step again if no test fits it.`,
 doc: (shown, facts) => `${shown} as it is now: ${facts}`,
 gone: shown => `${shown} is not there now.`,
 removed: (list, more, counts) => `This step removed ${list}${more ? ` and ${more} more` : ''} (made ${counts.added}, moved ${counts.moved}, changed ${counts.changed}). If that was not meant, put them back.`,
 browser: (action, said) => `Your last step in the browser did not go through (${action}: ${said}). Look at the page now and finish what the step needs there.`,
 down: (where, why) => `The page at ${where} does not open: ${why}. Get it working before the step is closed.`,
 console: (where, errors) => `The console of ${where} shows errors: ${errors.join(' | ')}`,
 shots: where => `The app opened ${where} at a phone's and a desktop's width, light and dark: the pictures are below. Check that it looks right at all of them.`,
 unopened: list => `Links you give that you never opened: ${list}. Open each to check it says what you say, or take it out.`,
 quotes: list => `Quotations found on no page you opened: ${list}. Quote only what a page you opened says, word for word, or say it in your own words.`,
 judge: list => `A separate check of the files against the user's request found this missing: ${list}. Do it, or say plainly in your answer that it is not done.`,
 audit: 'Note from the app: it read the sources in the answer you just gave against the pages you opened.',
 auditEnd: 'Check them now. If anything in your answer was wrong or unchecked, tell the user in a short line after it, saying what you corrected. If it all holds, end your turn without writing anything: the user needs no word about this check.',
};

const JUDGE = {
 system: 'You check work against a request. You see the user\'s request and what some files of the work now hold, and nothing of what was said about them. You see neither folders nor other files nor programs, so what the request asks to be done outside these files is not yours to judge. Name only what the request clearly asks these files themselves to hold and they clearly lack: not matters of taste, not things the request leaves open. Answer with JSON only, no other words: {"unmet": ["..."]}, an empty list when nothing is missing.',
 request: 6000,
 files: 3,
 answer: 400,
};

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const base = shown => String(shown || '').split(/[\\/]/).filter(Boolean).pop() || String(shown || '');
const listed = (items, most) => items.slice(0, most).map(item => `“${item}”`).join(', ') + (items.length > most ? ` and ${items.length - most} more` : '');
const files = items => [...new Set(items.map(item => base(item.shown)))].slice(0, 4).join(', ') + (new Set(items.map(item => item.path)).size > 4 ? '…' : '');
const parse = text => { try { return JSON.parse(text || '{}') || {}; } catch { return {}; } };
const lineCount = text => text ? String(text).split('\n').length : 0;
const canon = url => {
 try {
  const parsed = new URL(url);
  return `${parsed.host.replace(/^www\./, '').toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
 } catch { return String(url).toLowerCase(); }
};
const normal = text => String(text).toLowerCase().replace(/[“”«»„"'’`*_]/g, '').replace(/\s+/g, ' ').trim();
const LINK = /https?:\/\/[^\s)\]>"'«»“”]+/g;
const local = url => /^(https?:\/\/(localhost|127\.0\.0\.1|\[::1\])|file:|ogpic:|data:)/i.test(url);
const PICTURE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(\?|#|$)/i;

const PlanProof = {
 PROOF,
 TEXT,
 JUDGE,

 // A new plan: nothing seen yet.
 begin(conv) {
  conv.planLog = [];
  conv.planSeq = 0;
  conv.planStep = 0;
  conv.planShown = {};
  conv.planSeen = {};
 },

 // A step closed: the next one answers for what is done after it.
 closed(conv) {
  conv.planStep = conv.planSeq || 0;
  conv.planShown = {};
 },

 // Whether calls are being noted: while a plan stands, from its start on.
 watching(conv) {
  return Array.isArray(conv?.planLog);
 },

 note(conv, events) {
  if (!PlanProof.watching(conv)) return;
  for (const event of [].concat(events || [])) {
   if (!event) continue;
   conv.planSeq = (conv.planSeq || 0) + 1;
   conv.planLog.push({ ...event, seq: conv.planSeq });
  }
  if (conv.planLog.length > PROOF.log) conv.planLog.splice(0, conv.planLog.length - PROOF.log);
 },

 // What one finished tool call shows of the work. `place` turns a path the agent named into the file's own place;
 // `worked`: the call did what it was asked to.
 read(name, rawArgs, output, { place = p => p, worked = true, shell = '', check = null } = {}) {
  const args = typeof rawArgs === 'string' ? parse(rawArgs) : rawArgs || {};
  const text = typeof output === 'string' ? output : '';
  const file = value => value ? { path: place(String(value)), shown: String(value) } : null;
  if (name === 'write_file' || name === 'edit_file') {
   const at = worked && file(args.path);
   if (!at) return null;
   const written = String((name === 'write_file' ? args.content : args.new_string) ?? '');
   // What the agent wrote itself it may quote without a page behind it.
   return { kind: 'change', ...at, how: name === 'write_file' && /^Created\b/.test(text) ? 'added' : 'changed', lines: lineCount(written), by: 'tool', text: written.slice(0, PROOF.page / 3) };
  }
  if (['read_file', 'pdf_pages', 'video_frames', 'list_files'].includes(name)) {
   const at = worked && file(args.path || (name === 'list_files' ? '.' : ''));
   // What a file read says may be quoted in the answer as well as a page.
   return at ? { kind: 'look', ...at, folder: name === 'list_files', text: name === 'read_file' ? text.slice(0, PROOF.page / 3) : '' } : null;
  }
  if (name === shell || name === 'git') {
   const command = name === 'git' ? `git ${[].concat(args.args || []).join(' ')}` : String(args.command || '');
   const code = /^Exit code (-?\d+)/.exec(text)?.[1];
   const ended = { command: clean(command).slice(0, 120), code: code === undefined ? null : Number(code) };
   const out = [{ kind: 'ran', ...ended }];
   if (name === shell && check && check.test(command)) out.push({ kind: 'check', ...ended });
   return out;
  }
  if (name === 'fetch_url') return worked ? { kind: 'opened', url: String(args.url || ''), text: text.slice(0, PROOF.page) } : null;
  // What find_media gives is pictures and videos to show, not sources: its addresses are its own.
  if (name === 'web_search' || name === 'find_media') return worked ? { kind: 'searched', media: name === 'find_media', text: text.slice(0, PROOF.page) } : null;
  if (name.startsWith('browser_')) {
   const url = /^URL: (\S+)/m.exec(text)?.[1] || (name === 'browser_read' ? /^(\S+:\/\/\S+)/.exec(text)?.[1] : '') || '';
   return { kind: 'page', action: name.slice(8), ok: !!worked, url, title: clean(/^Page: (.*)$/m.exec(text)?.[1] || ''), said: worked ? '' : clean(text).slice(0, 160), text: worked ? text.slice(0, PROOF.page) : '' };
  }
  if (name === 'show_pictures') return (Array.isArray(args.pictures) ? args.pictures : []).map(item => item?.path ? { kind: 'look', ...file(item.path) } : null).filter(Boolean);
  return null;
 },

 // What a command did to the folder, as the app saw it (desktop/tools.js changes).
 changes(found, place) {
  const added = new Set(found.added || []);
  return [
   ...(found.touched || []).map(shown => ({ kind: 'change', path: place(shown), shown, how: added.has(shown) ? 'added' : 'changed', lines: 0, by: 'command' })),
   ...(found.removed || []).map(shown => ({ kind: 'change', path: place(shown), shown, how: 'removed', lines: 0, by: 'command' })),
  ].filter(event => event.path);
 },

 // Whether step `n` may close, from what the app saw since the step before it closed. `io` is how the app looks
 // itself (each part may be missing, and is then left out):
 //  project() → { checks, tests }; facts(path) → a document's facts; pdf(path) → { images } of its first pages;
 //  servers() → ports of servers of this agent that are up; glimpse(url, shots) → { ok, error, errors, shots, title };
 //  judge(docs) → { unmet } or null.
 // `last`: closing it would close the plan's last open step. `texts`: what the agent has said in this turn and its
 // proofs; `given`: what the user wrote. `vision`: the model sees pictures.
 // Gives { refuse, images } when it may not close yet, else { by, saw }.
 async gate(conv, n, { io = {}, last = false, texts = [], given = [], vision = true } = {}) {
  const all = conv.planLog || [], step = all.filter(event => event.seq > (conv.planStep || 0));
  // What was shown is kept for each step apart: an agent that turns from one open step to another and back is not
  // shown the same again.
  const kept = conv.planShown?.[n] || null;
  const changes = step.filter(event => event.kind === 'change');
  // Shown already, with nothing changed since: the agent has seen it and closes the step again.
  const fresh = !!kept && !changes.some(event => event.seq > kept.seq);
  // Or shown for another step of the plan, with nothing changed since: the same is not shown twice.
  const changedLast = changes.reduce((seq, event) => Math.max(seq, event.seq), 0);
  const told = kind => (fresh && kept.kinds.includes(kind)) || (kind !== 'browser' && (conv.planSeen?.[kind]?.seq ?? -1) >= changedLast);
  const after = (seq, test) => step.some(event => event.seq > seq && test(event));
  const hard = [], soft = [], images = [], saw = [];
  let by = 'word';
  const rise = level => { if (RANK[level] > RANK[by]) by = level; };
  const latest = list => [...list.reduce((map, event) => map.set(event.path, event), new Map()).values()];
  // Files as they stand after the step: each one's last change, and none that was removed in the end.
  const standing = list => latest(list).filter(event => event.how !== 'removed');

  // Code.
  const code = standing(changes.filter(event => PROOF.code.test(event.path)));
  const lastCode = code.reduce((seq, event) => Math.max(seq, event.seq), 0);
  let project = { checks: [], tests: false };
  if (code.length && io.project) project = await io.project().catch(() => project) || project;
  if (code.length) {
   const checks = all.filter(event => event.kind === 'check');
   const known = project.checks.length > 0 || checks.length > 0;
   const ran = checks.filter(event => event.seq > lastCode).at(-1);
   if (known) {
    if (!ran) hard.push(TEXT.stale(files(code), project.checks[0] || checks.at(-1)?.command || ''));
    else if (ran.code !== null && ran.code !== 0) hard.push(TEXT.failed(ran.command, ran.code));
    else { rise('check'); saw.push({ k: 'check', command: ran.command }); }
   } else if (after(lastCode, event => (event.kind === 'ran' && event.code === 0) || event.kind === 'look' || (event.kind === 'page' && event.ok))) {
    rise('seen');
    saw.push({ k: 'ran' });
   } else if (!told('code')) soft.push({ kind: 'code', text: TEXT.unseen(files(code)) });
   const made = code.filter(event => !PROOF.test.test(event.path));
   const lines = made.reduce((sum, event) => sum + (event.lines || 0), 0);
   if (project.tests && made.length && !code.some(event => PROOF.test.test(event.path)) && (lines >= PROOF.big || made.some(event => event.how === 'added' && event.by === 'tool')) && !told('tests')) {
    soft.push({ kind: 'tests', text: TEXT.tests(files(made)) });
   }
  } else {
   // A step that only ran the checks, and they passed (a failed one is refused by the plan itself).
   const ran = step.filter(event => event.kind === 'check').at(-1);
   if (ran && ran.code === 0) { rise('check'); saw.push({ k: 'check', command: ran.command }); }
  }

  // What commands did to the folder. A file gone from one place and come to another under the same name was moved: it
  // is neither a new document nor a removal.
  const shifted = changes.filter(event => event.by === 'command');
  const moves = PlanProof.moves(shifted);

  // Documents.
  const docs = standing(changes.filter(event => PROOF.doc.test(event.path) && !PROOF.chores.test(event.path) && !moves.to.has(event.path))).slice(-PROOF.docs);
  for (const doc of docs) {
   if (after(doc.seq, event => event.kind === 'look' && event.path === doc.path)) { rise('seen'); saw.push({ k: 'read', file: base(doc.shown) }); continue; }
   if (told(`doc:${doc.path}`)) { rise('seen'); saw.push({ k: 'shown', file: base(doc.shown) }); continue; }
   const facts = io.facts ? await io.facts(doc.path).catch(() => null) : null;
   if (!facts) continue;
   if (facts.exists === false) { soft.push({ kind: `doc:${doc.path}`, text: TEXT.gone(doc.shown) }); continue; }
   soft.push({ kind: `doc:${doc.path}`, text: TEXT.doc(doc.shown, PlanProof.describe(facts)) });
   if (vision && io.pdf && /\.pdf$/i.test(doc.path)) images.push(...((await io.pdf(doc.path).catch(() => null))?.images || []));
  }

  // Files commands made, changed and removed.
  if (shifted.length) {
   // A file made during the plan and removed again was the agent's own: only what was there before is told.
   const made = event => all.some(other => other.path === event.path && other.seq < event.seq && other.kind === 'change' && other.how === 'added');
   const removed = latest(shifted).filter(event => event.how === 'removed' && !moves.from.has(event.path) && !made(event));
   const counts = {
    added: latest(shifted).filter(event => event.how === 'added' && !moves.to.has(event.path)).length,
    moved: moves.from.size,
    changed: latest(shifted).filter(event => event.how === 'changed').length,
    removed: removed.length,
   };
   saw.push({ k: 'files', ...counts });
   if (removed.length && !told('removed')) soft.push({ kind: 'removed', text: TEXT.removed(removed.slice(0, PROOF.removed).map(event => event.shown).join(', '), Math.max(0, removed.length - PROOF.removed), counts) });
   if (after(shifted.at(-1).seq, event => event.kind === 'look' && event.folder)) rise('seen');
  }

  // Pages opened to read.
  const opening = step.filter(event => event.kind === 'opened');
  if (opening.length) { rise('seen'); saw.push({ k: 'opened', count: new Set(opening.map(event => canon(event.url))).size }); }

  // The browser. A last step that failed is told once: the page may be down for reasons the agent can't mend.
  const pages = step.filter(event => event.kind === 'page');
  if (pages.length) {
   const final = pages.at(-1);
   if (!final.ok) { if (!told('browser')) soft.push({ kind: 'browser', text: TEXT.browser(final.action, final.said || 'an error') }); }
   else { rise('seen'); saw.push({ k: 'page', title: final.title || final.url }); }
  }

  // A page of the user's own project: on a server of this agent's that is up, the page the browser ended on if it is
  // one of the project's, or a page file the step changed.
  const web = standing(changes.filter(event => PROOF.web.test(event.path)));
  const ports = (code.length || web.length || step.some(event => event.kind === 'server')) && io.servers ? await io.servers().catch(() => []) : [];
  const ended = pages.filter(event => event.ok && /^(file:|https?:\/\/(localhost|127\.0\.0\.1|\[::1\]))/i.test(event.url)).at(-1)?.url || '';
  const html = web.filter(event => /\.html?$/i.test(event.path)).at(-1);
  const target = ports.length ? `http://localhost:${ports[0]}/` : web.length ? ended || (html ? PlanProof.fileUrl(html.path) : '') : '';
  // Named for the agent as it knows it: the server's port, or the page file as it named it.
  const where = ports.length ? `localhost:${ports[0]}` : !/^file:/i.test(target) ? target : html?.shown || base(decodeURIComponent(target.replace(/^file:\/+/i, '')));
  let site = null;
  if (target && io.glimpse && !told('site')) {
   const look = await io.glimpse(target, web.length > 0 && vision).catch(error => ({ ok: false, error: error.message }));
   if (!look?.ok) hard.push(TEXT.down(where, look?.error || 'it did not load'));
   else {
    rise('seen');
    saw.push(site = { k: 'site', errors: look.errors?.length || 0, shots: !!look.shots?.length });
    const extra = [];
    if (look.errors?.length) extra.push(TEXT.console(where, look.errors.slice(0, PROOF.errors)));
    if (look.shots?.length) { extra.push(TEXT.shots(where)); images.push(...look.shots); }
    if (extra.length) soft.push({ kind: 'site', text: extra.join('\n') });
   }
  } else if (target && told('site')) {
   rise('seen');
   const was = kept?.site || conv.planSeen?.site?.site;
   if (was) saw.push(was);
  }

  // The last step: what the whole answer rests on. The documents the plan made are read once, for the sources they give
  // and to be weighed against the request.
  if (last) {
   const made = standing(all.filter(event => event.kind === 'change' && PROOF.doc.test(event.path) && !PROOF.chores.test(event.path))).slice(-JUDGE.files);
   const read = [];
   if (io.facts) {
    for (const doc of made) {
     const facts = await io.facts(doc.path).catch(() => null);
     if (facts?.exists && facts.text) read.push({ shown: doc.shown, facts });
    }
   }
   const sources = PlanProof.sources(all, [...texts, ...read.map(doc => doc.facts.text)], given);
   if (sources.links.length && !told('links')) soft.push({ kind: 'links', text: TEXT.unopened(listed(sources.links, PROOF.links)) });
   if (sources.quotes.length && !told('quotes')) soft.push({ kind: 'quotes', text: TEXT.quotes(listed(sources.quotes, PROOF.quotes)) });
   // In a plan that wrote code, a README is no measure of what was asked: documents are weighed only when they are
   // what the plan made.
   const wrote = all.some(event => event.kind === 'change' && PROOF.code.test(event.path));
   if (!wrote && read.length && io.judge && !told('judge')) {
    const verdict = await io.judge(read).catch(() => null);
    if (verdict?.unmet?.length) soft.push({ kind: 'judge', text: TEXT.judge(verdict.unmet.slice(0, 6).join('; ')) });
    else if (verdict) { rise('judged'); saw.push({ k: 'judged' }); }
   }
   // Closed again over what the judge found missing, with nothing changed: it stands on the agent's word, not judged.
  }

  if (!hard.length && !soft.length) return { by, saw: PlanProof.short(saw) };
  // What was shown is remembered, with what the page showed, so that closed again the step says so.
  conv.planSeen = { ...(conv.planSeen || {}), ...Object.fromEntries(soft.map(item => [item.kind, { seq: conv.planSeq || 0, site: item.kind === 'site' ? site : null }])) };
  conv.planShown = { ...(conv.planShown || {}), [n]: { seq: conv.planSeq || 0, kinds: [...new Set([...(fresh ? kept.kinds : []), ...soft.map(item => item.kind)])], site: site || (fresh ? kept.site : null) || null } };
  const bullets = list => list.map(item => `• ${typeof item === 'string' ? item : item.text}`).join('\n');
  const text = hard.length
   ? `${TEXT.must(n)}\n${bullets(hard)}${soft.length ? `\n\n${TEXT.also}\n${bullets(soft)}` : ''}`
   : `${TEXT.look(n)}\n${bullets(soft)}`;
  return { refuse: text, images };
 },

 // What texts give as sources and the app can't find behind them: links to pages never opened (nor given by the user,
 // nor pictures and videos found to show), and quotations found on no page opened, no file read and nothing the user
 // wrote. Only once pages were opened or searched for: an answer from what the agent knows gives no sources to check.
 sources(all, texts, given = [], { writ = false } = {}) {
  const out = { links: [], quotes: [] };
  const pagesOpened = all.filter(event => event.kind === 'opened' || (event.kind === 'page' && event.ok));
  if (!pagesOpened.length && !all.some(event => event.kind === 'searched')) return out;
  // Code is no source: what is in its blocks is left out, and pictures shown are no sources either.
  const said = texts.join('\n').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  const opened = new Set(pagesOpened.map(event => canon(event.url)));
  // A link the user gave is no exception: given as the source of what is said, it has to have been read (seen with
  // GPT-6 Luna, which cited one it was told not to open).
  const shown = new Set(all.filter(event => event.media).map(event => event.text).flatMap(text => String(text).match(LINK) || []).map(canon));
  out.links = [...new Set((said.match(LINK) || []).map(url => url.replace(/[.,;:!?]+$/, '')))].filter(url => !local(url) && !PICTURE.test(url) && !opened.has(canon(url)) && !shown.has(canon(url)));
  // Quotations are looked for in what was read: pages, search results, files read that the plan did not write, and the
  // user's own words. Not in what the agent wrote itself, read back or not, when its documents are checked: a file can't
  // be the source of its own quotes. The answer after the plan may quote those documents (`writ`), checked already.
  const own = new Set(all.filter(event => event.kind === 'change').map(event => event.path));
  let corpus = '';
  for (const event of all) {
   if (!event.text || corpus.length >= PROOF.corpus || (!writ && (event.kind === 'change' || (event.kind === 'look' && own.has(event.path))))) continue;
   corpus += `\n${normal(event.text)}`;
  }
  for (const text of given) corpus += `\n${normal(text)}`;
  // A quotation is words in quotes beside a link to where they come from, or a quoted block; words in quotes with no
  // source beside them are the agent's own, a name or a title.
  const cited = said.split(/\n\s*\n|\n(?=\s*(?:[-*•]|\d+[.)])\s)/).filter(part => /https?:\/\/\S/.test(part) || /^\s*>/m.test(part)).join('\n');
  const quoted = [...cited.matchAll(/[“«"]([^”»"\n]{40,600})[”»"]|^\s*>\s*(.{40,600})$/gm)].map(match => (match[1] || match[2]).trim());
  out.quotes = [...new Set(quoted)].filter(quote => normal(quote).length >= PROOF.quote && !corpus.includes(normal(quote))).map(quote => quote.length > 120 ? `${quote.slice(0, 117)}…` : quote);
  return out;
 },

 // The answer written after the plan's last step, read once for its sources. '' when they all stand.
 audit(conv, answer, given = []) {
  const found = PlanProof.sources(conv.planLog || [], [answer], given, { writ: true });
  if (!found.links.length && !found.quotes.length) return '';
  return [
   TEXT.audit,
   found.links.length ? `• ${TEXT.unopened(listed(found.links, PROOF.links))}` : '',
   found.quotes.length ? `• ${TEXT.quotes(listed(found.quotes, PROOF.quotes))}` : '',
   TEXT.auditEnd,
  ].filter(Boolean).join('\n');
 },

 // Files a command moved: gone from one place and come to another under the same name. `from` and `to` hold their
 // places before and after.
 moves(events) {
  const ends = [...events.reduce((map, event) => map.set(event.path, event), new Map()).values()];
  const name = event => base(event.shown).toLowerCase();
  const came = ends.filter(event => event.how === 'added'), from = new Set(), to = new Set();
  for (const gone of ends.filter(event => event.how === 'removed')) {
   const there = came.find(event => !to.has(event.path) && name(event) === name(gone));
   if (there) { from.add(gone.path); to.add(there.path); }
  }
  return { from, to };
 },

 // A document's facts in a line: what it is, how long, its headings and how it begins.
 describe(facts) {
  const parts = [];
  if (facts.kind) parts.push(facts.kind);
  if (facts.pages) parts.push(`${facts.pages} ${facts.pages === 1 ? 'page' : 'pages'}`);
  if (facts.slides) parts.push(`${facts.slides} ${facts.slides === 1 ? 'slide' : 'slides'}`);
  if (facts.sheets?.length) parts.push(`sheets ${facts.sheets.map(sheet => `${sheet.name} (${sheet.rows} rows)`).join(', ')}`);
  if (facts.rows) parts.push(`${facts.rows} rows`);
  if (Number.isFinite(facts.words)) parts.push(`${facts.words} words`);
  if (facts.headings?.length) parts.push(`headings: ${facts.headings.join(' / ')}`);
  if (facts.binary || facts.unreadable) parts.push('its words could not be read by the app');
  const start = clean(facts.excerpt || '');
  return `${parts.join(', ')}${start ? `. It begins: “${start.length > 600 ? `${start.slice(0, 597)}…` : start}”` : ''}`;
 },

 // What the top of the chat says of a closed step, two things at most, the strongest first.
 short(saw) {
  const order = ['check', 'judged', 'site', 'read', 'shown', 'page', 'opened', 'files', 'ran'];
  return [...saw].sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k)).filter((item, k, list) => list.findIndex(other => other.k === item.k) === k).slice(0, 2);
 },

 // The messages that ask a model, apart from the agent, whether the files meet the request.
 judgeMessages(request, docs) {
  const shown = docs.map(doc => `### ${doc.shown}\n(${PlanProof.describe({ ...doc.facts, excerpt: '' })})\n${doc.facts.text}`).join('\n\n');
  return [
   { role: 'system', content: JUDGE.system },
   { role: 'user', content: `The user's request:\n"""\n${String(request).slice(0, JUDGE.request)}\n"""\n\nThe files as they are now:\n\n${shown}` },
  ];
 },

 // The judge's answer: what it found missing, or null when it said nothing that can be read.
 verdict(answer) {
  const json = /\{[\s\S]*\}/.exec(String(answer || ''))?.[0];
  const found = json ? parse(json) : null;
  if (!found || !Array.isArray(found.unmet)) return null;
  return { unmet: found.unmet.map(clean).filter(Boolean).map(item => item.slice(0, 200)).slice(0, 6) };
 },

 fileUrl(file) {
  const slashed = String(file).replace(/\\/g, '/');
  return `file://${slashed.startsWith('/') ? '' : '/'}${slashed.split('/').map((part, k) => k === 0 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part)).join('/')}`;
 },
};

window.PlanProof = PlanProof;
})();
