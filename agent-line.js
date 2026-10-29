(() => {
'use strict';

// What the agent is doing, in one line beside its ghost (chat.js): the light display type of the effort stage's name,
// each step rolling in over the last as the drum of the model picker turns, so the chat never fills up with steps.
// A change the agent has made to a file is shown a moment under it, its lines turning over to the new ones, and then
// folds away: the agent's own words stay the only thing left in the chat.
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const ROLL = { duration: 560, easing: EASE };
const IN = { transform: 'translateY(0.8em) rotateX(-62deg)', opacity: 0, filter: 'blur(5px)' };
const REST = { transform: 'none', opacity: 1, filter: 'blur(0px)' };
const OUT = { transform: 'translateY(-0.8em) rotateX(62deg)', opacity: 0, filter: 'blur(5px)' };
// The glance at an edit: how it opens, how its lines turn over one after another, how long the new ones keep their
// light, how long it stays in view once they have, how it folds, and how much of a change it shows at most.
const GLANCE = { open: 460, lead: 140, flip: 520, step: 110, glow: 1400, settle: 900, hold: 3200, fold: 640, rows: 10, lines: 600 };
// It folds away softly at both ends: a fold that starts at full speed reads as a jerk.
const FOLD = 'cubic-bezier(0.45, 0, 0.25, 1)';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const base = path => String(path || '').split(/[\\/]/).filter(Boolean).pop() || String(path || '');
const host = url => { try { return new URL(String(url)).host.replace(/^www\./, ''); } catch { return String(url || ''); } };
const quote = text => { const said = String(text ?? '').replace(/\s+/g, ' ').trim(); return said ? `“${said}”` : ''; };
const first = text => String(text || '').split('\n').map(line => line.trim()).find(Boolean) || '';

// The words for a step: what is done, and to what. Steps with a look of their own in the chat (the plan, the notepad,
// a question, pictures, a skill) and those that change nothing a person would follow say nothing here.
function deed(name, args = {}, cwd = '', apart = null) {
 const say = (verb, what = '') => ({ verb: I18n.t(`deed.${verb}`), what: String(what).replace(/\s+/g, ' ').trim() });
 switch (name) {
  case AgentTools.shell: return say('run', first(args.command));
  case 'git': return say('run', `git ${(Array.isArray(args.args) ? args.args : [args.args]).filter(Boolean).join(' ')}`);
  case 'read_file':
  case 'pdf_pages': return say('read', base(args.path));
  case 'write_file': return say('write', base(args.path));
  case 'edit_file': return say('edit', base(args.path));
  case 'video_frames': return say('watch', base(args.path));
  // The folder it works in is not named: its name is often only the chat's own number.
  case 'list_files': return args.path && !/^\.[\\/]?$/.test(String(args.path).trim()) ? say('look', base(args.path)) : say('folder');
  case 'web_search': return say('search', quote(args.query));
  case 'find_media': return say(args.kind === 'videos' ? 'videos' : 'pictures', quote(args.query));
  case 'fetch_url':
  case 'browser_navigate': return say('open', host(args.url));
  case 'browser_tabs': return args.action === 'new' ? (args.url ? say('open', host(args.url)) : say('newTab')) : args.action === 'switch' ? say('tab') : args.action === 'close' ? say('closeTab') : null;
  case 'browser_screenshot': return args.save_to !== undefined ? say('write', base(args.save_to)) : say('page');
  case 'browser_upload': return say('upload', (Array.isArray(args.paths) ? args.paths : []).map(base).join(', '));
  case 'browser_snapshot':
  case 'browser_read': return say('page');
  case 'browser_click': {
   // The element by the name the page gives it; a bare number or a place on the screen says nothing to a person.
   const label = AgentTools.describe(name, args, cwd, apart).quote || '';
   return say('click', /^(\[|x \d)/.test(label) ? '' : label);
  }
  // What is typed is not repeated in large letters: it may be a name, an address or a code.
  case 'browser_type': return say('type');
  case 'browser_select': return say('choose', quote(args.option));
  case 'browser_press': return say('press', args.key);
  case 'browser_scroll': return say('scroll');
  case 'browser_wait': return say('wait', quote(args.text));
  default: return null;
 }
}

// The line beside the ghost of a reply's status. The next step rolls in from below as the last rolls away up; the
// same step again leaves the line as it is.
function show(status, words) {
 if (!status?.isConnected || !words) return;
 let drum = status.querySelector(':scope > .message-deed');
 if (!drum) {
  drum = document.createElement('div');
  drum.className = 'message-deed';
  drum.setAttribute('aria-live', 'polite');
  status.append(drum);
 }
 // Held from the status's foot, where the ghost stands: the room over the ghost changes once words come before it.
 const ghost = status.querySelector('ghost-thinking');
 drum.style.bottom = `${ghost ? status.clientHeight - ghost.offsetTop - ghost.offsetHeight / 2 : status.clientHeight / 2}px`;
 const key = `${words.verb}\n${words.what}`;
 const now = [...drum.children].filter(line => !line.classList.contains('is-gone'));
 if (now.at(-1)?.dataset.key === key) return;
 const line = document.createElement('div');
 line.className = 'message-deed-line';
 line.dataset.key = key;
 const said = parent => {
  parent.append(words.verb);
  if (!words.what) return;
  const what = document.createElement('span');
  what.className = 'message-deed-what';
  what.textContent = ` ${words.what}`;
  parent.append(what);
 };
 said(line);
 // A wave of light runs along the words while the step lasts: the same words, brighter, seen through a moving band.
 const wave = document.createElement('span');
 wave.className = 'message-deed-wave';
 wave.setAttribute('aria-hidden', 'true');
 said(wave);
 line.append(wave);
 drum.append(line);
 if (reducedMotion()) { now.forEach(old => old.remove()); return; }
 line.animate([IN, REST], ROLL);
 for (const old of now) {
  old.classList.add('is-gone');
  const gone = () => old.remove();
  old.animate([REST, OUT], { ...ROLL, fill: 'forwards' }).finished.then(gone, gone);
 }
}

// Lines that stayed, went and came, from the old piece of a file to the new one (a longest common run of lines).
function diff(was, now) {
 const a = was.length, b = now.length, out = [];
 if (a * b > 250000) return [...was.map(text => ({ kind: 'del', text })), ...now.map(text => ({ kind: 'add', text }))];
 const run = new Uint16Array((a + 1) * (b + 1)), at = (i, j) => i * (b + 1) + j;
 for (let i = a - 1; i >= 0; i--) for (let j = b - 1; j >= 0; j--) run[at(i, j)] = was[i] === now[j] ? run[at(i + 1, j + 1)] + 1 : Math.max(run[at(i + 1, j)], run[at(i, j + 1)]);
 let i = 0, j = 0;
 while (i < a || j < b) {
  if (i < a && j < b && was[i] === now[j]) { out.push({ kind: 'same', text: was[i] }); i++; j++; }
  else if (j < b && (i === a || run[at(i, j + 1)] >= run[at(i + 1, j)])) out.push({ kind: 'add', text: now[j++] });
  else out.push({ kind: 'del', text: was[i++] });
 }
 return out;
}

// The rows a glance shows: a line that went and the one that came in its place turn over as one row.
function rows(was, now) {
 const split = text => String(text).replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n').slice(0, GLANCE.lines);
 const steps = diff(split(was), split(now)), out = [];
 for (let k = 0; k < steps.length;) {
  if (steps[k].kind === 'same') { out.push(steps[k++]); continue; }
  const gone = [], come = [];
  while (k < steps.length && steps[k].kind !== 'same') (steps[k].kind === 'del' ? gone : come).push(steps[k++].text);
  for (let n = 0; n < Math.max(gone.length, come.length); n++) {
   if (n < gone.length && n < come.length) out.push({ kind: 'swap', was: gone[n], now: come[n] });
   else if (n < gone.length) out.push({ kind: 'del', was: gone[n] });
   else out.push({ kind: 'add', now: come[n] });
  }
 }
 return out;
}

const lit = (text, lang) => text ? Highlight.code(text, lang) : '';

// A change to a file, under the line: its name, how many lines came and went, and the changed lines with one line
// around them, turning over to the new ones. `host` is the reply's element; the glance goes at its end, and goes away
// by itself. Returns the element, or null when there is nothing to show.
function glance(host, { path, was, now }) {
 if (!host?.isConnected || was === now) return null;
 const all = rows(was, now);
 const changed = all.findIndex(row => row.kind !== 'same');
 if (changed < 0) return null;
 const plus = all.filter(row => row.kind === 'add' || row.kind === 'swap').length;
 const minus = all.filter(row => row.kind === 'del' || row.kind === 'swap').length;
 const start = Math.max(0, changed - 1);
 let end = all.length;
 for (let k = all.length - 1; k > changed && all[k].kind === 'same'; k--) end = k;
 end = Math.min(all.length, end + 1);
 const shown = all.slice(start, Math.min(end, start + GLANCE.rows)), cut = end > start + GLANCE.rows;
 // The block keeps its shape but not the indent it has in the file.
 const texts = shown.flatMap(row => [row.text, row.was, row.now]).filter(text => text?.trim());
 const indent = texts.length ? Math.min(...texts.map(text => text.match(/^ */)[0].length)) : 0;
 const trim = text => text === undefined ? undefined : text.slice(indent);
 const lang = (base(path).match(/\.([\w-]+)$/) || [])[1] || '';
 const el = document.createElement('div');
 el.className = `edit-glance${cut ? ' is-cut' : ''}`;
 el.setAttribute('aria-hidden', 'true');
 el.innerHTML = `<div class="edit-glance-file"><span></span><span class="edit-glance-count"><i class="is-plus">+${plus}</i><i class="is-minus">−${minus}</i></span></div><div class="edit-glance-lines">${shown.map(row => {
  if (row.kind === 'same') return `<div class="edit-glance-row"><div>${lit(trim(row.text), lang)}</div></div>`;
  const dot = row.kind === 'del' ? '' : '<i class="edit-glance-dot"></i>';
  return `<div class="edit-glance-row is-${row.kind}">${row.was !== undefined ? `<div class="is-was">${lit(trim(row.was), lang)}</div>` : ''}${row.now !== undefined ? `<div class="is-now">${lit(trim(row.now), lang)}</div>` : ''}${dot}</div>`;
 }).join('')}</div>`;
 el.querySelector('.edit-glance-file span').textContent = base(path);
 host.append(el);
 const lines = [...el.querySelectorAll('.edit-glance-row')], tall = lines[0].offsetHeight;
 const moving = lines.filter(row => row.matches('.is-swap, .is-del, .is-add'));
 for (const row of moving) if (row.classList.contains('is-add')) row.style.height = '0px';
 const fold = () => {
  if (!el.isConnected) return;
  if (reducedMotion()) { el.remove(); return; }
  const gone = () => el.remove();
  el.animate([{ height: `${el.offsetHeight}px`, opacity: 1, filter: 'blur(0px)' }, { height: '0px', opacity: 0, filter: 'blur(6px)' }], { duration: GLANCE.fold, easing: FOLD, fill: 'forwards' }).finished.then(gone, gone);
 };
 if (reducedMotion()) {
  for (const row of moving) { row.style.height = row.classList.contains('is-del') ? '0px' : ''; row.querySelector('.is-was')?.remove(); }
  setTimeout(fold, GLANCE.hold + GLANCE.glow);
  return el;
 }
 el.animate([{ height: '0px', opacity: 0 }, { height: `${el.offsetHeight}px`, opacity: 1 }], { duration: GLANCE.open, easing: EASE });
 const begin = GLANCE.open + GLANCE.lead, timing = delay => ({ duration: GLANCE.flip, delay, easing: EASE, fill: 'both' });
 el.querySelector('.edit-glance-count').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: begin, fill: 'both' });
 moving.forEach((row, k) => {
  const at = begin + k * GLANCE.step;
  const was = row.querySelector('.is-was'), now = row.querySelector('.is-now'), dot = row.querySelector('.edit-glance-dot');
  if (row.classList.contains('is-del')) row.animate([{ height: `${tall}px` }, { height: '0px' }], timing(at + 120));
  if (row.classList.contains('is-add')) row.animate([{ height: '0px' }, { height: `${tall}px` }], timing(at));
  was?.animate([{ transform: 'rotateX(0deg)', opacity: 1 }, { transform: 'rotateX(90deg)', opacity: 0 }], timing(at));
  if (now) {
   now.animate([{ transform: 'rotateX(-90deg)', opacity: 0 }, { transform: 'rotateX(0deg)', opacity: 1 }], timing(at + 60));
   // The new line comes in the light of the ice and takes the colour of its words as it settles.
   now.animate([{ color: 'rgb(var(--glance-ice-rgb))' }, { color: 'rgb(var(--glance-ice-rgb))', offset: 0.55 }, { color: 'var(--fg-primary)' }], { duration: GLANCE.glow + GLANCE.settle, delay: at + 60, easing: 'ease-out', fill: 'backwards' });
  }
  dot?.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none', offset: 0.2 }, { opacity: 0.35, transform: 'none' }], { duration: GLANCE.glow + GLANCE.settle, delay: at + 200, easing: EASE, fill: 'both' });
 });
 setTimeout(fold, begin + moving.length * GLANCE.step + GLANCE.flip + GLANCE.hold);
 return el;
}

window.AgentLine = { deed, show, glance };
})();
