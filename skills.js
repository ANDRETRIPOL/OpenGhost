(() => {
'use strict';

// Skills as the page sees them: the app finds them and puts them in (desktop/skills.js); here they are listed for the
// search and the message field, named to the agent, and handed to it, when it uses one or when the user picks one with
// /name in a message. A skill's instructions go to the model wrapped in <skill_content>, which is also how a summary of
// the chat finds them again and keeps them.
const bridge = window.openghost?.skills;
const listeners = new Set();
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
// A skill named in a message: /name standing on its own, at the start or after a space or a new line.
const MENTION = /(^|[\s(])\/([a-z0-9][a-z0-9-]{0,63})(?=$|[\s.,;:!?)])/g;
const BLOCK = /<skill_content name="([^"]+)">[\s\S]*?<\/skill_content>/g;

const Skills = {
 // The user's own skills, for the search and the field; and those of each project folder asked for since.
 items: [],
 folders: new Map(),
 available: !!bridge,
 // The folder of the chat on screen: the field and the sent messages know its own skills too.
 folder: '',
 ready: Promise.resolve(),

 load() {
  if (!bridge) return this.ready;
  bridge.onChange(() => this.refresh());
  return this.ready = this.refresh();
 },

 // Read again: the user's own, and those of the folders already asked for.
 async refresh(folder) {
  if (!bridge) return [];
  const folders = new Set([...this.folders.keys(), ...(folder ? [folder] : [])]);
  const [own, ...theirs] = await Promise.all([bridge.list(null), ...[...folders].map(dir => bridge.list(dir))]).catch(() => [[]]);
  const was = JSON.stringify(this.items);
  this.items = Array.isArray(own) ? own : [];
  [...folders].forEach((dir, k) => this.folders.set(dir, Array.isArray(theirs[k]) ? theirs[k] : []));
  // Those who show the skills are told only when the user's own have changed.
  if (JSON.stringify(this.items) !== was) for (const listener of listeners) listener(this.items);
  return folder ? this.of(folder) : this.items;
 },

 watch(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
 },

 // Those a chat working in `folder` can use, as last read: a project's own ones with the user's.
 of(folder) {
  return (folder && this.folders.get(folder)) || this.items;
 },

 find(name, folder) {
  return this.of(folder).find(item => item.name === name) || this.items.find(item => item.name === name) || null;
 },

 // The skills a message picks, in order, each once: /name of a skill there is.
 mentions(text, folder) {
  const out = [];
  for (const m of String(text || '').matchAll(MENTION)) if (this.find(m[2], folder) && !out.includes(m[2])) out.push(m[2]);
  return out;
 },

 // Where /name stands in a text, for the field and the sent message to show it as a chip.
 spans(text, folder) {
  const out = [];
  for (const m of String(text || '').matchAll(MENTION)) {
   if (!this.find(m[2], folder)) continue;
   const index = m.index + m[1].length;
   out.push({ index, length: m[2].length + 1, name: m[2] });
  }
  return out;
 },

 // What the agent is told of the skills it can use, a line each.
 lines(folder) {
  return this.of(folder).map(item => `- ${item.name}: ${item.description}${item.from === 'project' ? ' (this project\'s own)' : ''}`).join('\n');
 },

 // A skill's instructions as the model gets them, with where its files are.
 async content(name, folder) {
  const skill = await bridge?.read(name, folder);
  if (!skill) return null;
  const files = skill.files.length ? ['<skill_resources>', ...skill.files.map(file => `  <file>${file}</file>`), '</skill_resources>'] : [];
  const needs = skill.compatibility ? [`It says it needs: ${skill.compatibility}`] : [];
  return [
   `<skill_content name="${skill.name}">`,
   skill.body,
   '',
   `Skill directory: ${skill.dir}`,
   'Relative paths in this skill are relative to the skill directory.',
   ...needs,
   ...files,
   '</skill_content>',
  ].join('\n');
 },

 // The names of the skills whose instructions are already in these messages.
 loaded(messages) {
  const out = new Set();
  const look = text => { for (const m of String(text || '').matchAll(BLOCK)) out.add(m[1]); };
  for (const message of messages) {
   if (typeof message.content === 'string') look(message.content);
   else if (Array.isArray(message.content)) for (const part of message.content) if (part.type === 'text') look(part.text);
  }
  return out;
 },

 // The whole instructions of each skill in these messages, the latest of each, for a summary to keep.
 blocks(messages) {
  const found = new Map();
  const look = text => { for (const m of String(text || '').matchAll(BLOCK)) found.set(m[1], m[0]); };
  for (const message of messages) {
   if (typeof message.content === 'string') look(message.content);
   else if (Array.isArray(message.content)) for (const part of message.content) if (part.type === 'text') look(part.text);
  }
  return [...found.values()].join('\n\n');
 },

 // A skill from a link is fetched first and waits beside the others (prepare); it goes in once the user says yes
 // (commit), or away (discard).
 prepare(url, name) {
  return bridge?.prepare(url, name) || Promise.resolve({ error: 'Skills are not available here.' });
 },

 async commit(token) {
  const result = await bridge?.commit(token) || { error: 'Skills are not available here.' };
  if (result.skill) await this.refresh();
  return result;
 },

 discard(token) {
  return bridge?.discard(token) || Promise.resolve(false);
 },

 valid: name => NAME.test(name),

 // A sent message's words, with each skill it picked as a chip like a link's, and its links as their chips.
 fill(el, text, folder = this.folder) {
  let last = 0;
  for (const span of this.spans(text, folder)) {
   LinkChip.fill(el, text.slice(last, span.index));
   const chip = element('span', 'link-chip skill-chip-inline');
   chip.innerHTML = `<span class="skill-chip-icon" aria-hidden="true">${Glyphs.skill}</span>`;
   chip.append(span.name);
   chip.title = this.find(span.name, folder)?.description || '';
   el.append(chip);
   last = span.index + span.length;
  }
  LinkChip.fill(el, text.slice(last));
 },
};

// What the agent did with a skill, in the chat: the notes' capsule with the book, a word for what happened, the skill's
// name in a chip and what it is for. Kinds: added, updated, used.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const element = (tag, className) => Object.assign(document.createElement(tag), { className });
const PILL = { room: 460, settle: 520, signAt: 100, wordsAt: 200, label: 320, chipAt: 300, words: 620 };
const LABELS = { added: 'skill.pill.added', updated: 'skill.pill.updated', used: 'skill.pill.used' };

const SkillPill = {
 build(entry) {
  const kind = LABELS[entry.kind] ? entry.kind : 'used';
  const el = element('div', `thread-note is-skill is-${kind}`);
  el.__entry = entry;
  const pill = element('div', 'thread-note-pill');
  pill.innerHTML = `<span class="thread-note-sign" aria-hidden="true">${Glyphs.skill}</span><span class="thread-note-label"></span><span class="skill-chip"></span><span class="thread-note-text"></span>`;
  pill.querySelector('.thread-note-label').textContent = I18n.t(LABELS[kind]);
  pill.querySelector('.skill-chip').textContent = entry.name || '';
  const text = pill.querySelector('.thread-note-text');
  text.textContent = entry.text || '';
  pill.setAttribute('role', 'note');
  pill.setAttribute('aria-label', [I18n.t(LABELS[kind]), entry.name, entry.text].filter(Boolean).join(': '));
  // What the skill is for, too long for the pill, is told in full under the pointer.
  pill.addEventListener('pointerenter', () => { pill.title = text.scrollWidth > text.clientWidth ? text.textContent : ''; });
  el.append(pill);
  return el;
 },

 // Just come into the chat: the chat makes room, the pill settles, the book opens, the word and the chip come up, and
 // what the skill is for is written out from the left.
 enter(el) {
  if (reducedMotion() || !el.isConnected) return;
  const pill = el.querySelector('.thread-note-pill');
  const height = el.offsetHeight, gap = el.previousElementSibling || el.nextElementSibling ? parseFloat(getComputedStyle(el.parentElement).rowGap) || 0 : 0;
  const free = () => { el.style.overflow = ''; };
  el.style.overflow = 'clip';
  el.animate([{ height: '0px', marginTop: `${-gap}px` }, { height: `${height}px`, marginTop: '0px' }], { duration: PILL.room, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }).finished.then(free, free);
  pill.animate([{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, offset: 0.45 }, { opacity: 1, transform: 'none' }], { duration: PILL.settle, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)' });
  for (const [side, from] of [['.skill-left', 'scaleX(0.2)'], ['.skill-right', 'scaleX(0.2)']]) {
   el.querySelector(side)?.animate([{ transform: from }, { transform: 'none' }], { duration: 460, delay: PILL.signAt, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
  }
  const shut = 'inset(-6px 100% -6px 0)', open = 'inset(-6px -2px -6px 0)';
  el.querySelector('.thread-note-label').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.4 }, { clipPath: open, opacity: 1 }], { duration: PILL.label, delay: PILL.wordsAt, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
  el.querySelector('.skill-chip').animate([{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: PILL.chipAt, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)', fill: 'backwards' });
  el.querySelector('.thread-note-text').animate([{ clipPath: shut, opacity: 0 }, { opacity: 1, offset: 0.3 }, { clipPath: open, opacity: 1 }], { duration: PILL.words, delay: PILL.chipAt + 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
 },
};

// The card that asks before a skill goes in, in every permission mode, Full access too: a skill is new instructions
// for the agent in every chat, so the user sees what it is first. A sheet in the chat, as a phone's sheet: the skill's
// own pages fanned out at its top and fading into it, the book, where it comes from, "Add the skill" with the skill's
// name in blue under it, what it is for, how many files and programs it brings, and one large button. "What's inside"
// opens what SKILL.md says and every file. The sheet comes and goes as the search's panel does: quickly out of a blur,
// a little wider and flatter than it will stand; away growing a little into a deeper blur, quicker still, and then
// the chat closes up where it stood. Inside it, as it comes, the pages fan out from the middle, the book rises, the
// words come out of a blur and the rest follows.
const CARD = {
 reveal: { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
 // The search's own (spotlight.js).
 open: { duration: 133, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' },
 close: { duration: 110, easing: 'ease-out', fill: 'forwards' },
 from: { opacity: 0, transform: 'scale(1.09, 0.96)', filter: 'blur(4px)' },
 rest: { opacity: 1, transform: 'none', filter: 'blur(0px)' },
 away: { opacity: 0, transform: 'scale(1.06)', filter: 'blur(12px)' },
 shut: { duration: 260, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' },
};
// Where each page lies in the fan, by how many there are: left edge in % of the card, turn, drop.
const FAN = {
 1: [[36, -2, 6]],
 2: [[19, -6, 14], [52, 5, 8]],
 3: [[6, -8, 22], [36, -2, 4], [66, 7, 16]],
 4: [[-3, -9, 24], [20, -3, 6], [46, 4, 0], [73, 10, 20]],
};
const CODE = /\.(py|js|mjs|cjs|ts|sh|ps1|rb|json|ya?ml|html|css)$/i;
const KEYWORDS = /\b(import|from|def|class|return|for|in|if|else|elif|function|const|let|var|export|async|await|with|as)\b/g;
// A count in the words of the user's language: 1 file, 3 files; in Russian 1 файл, 3 файла, 12 файлов.
const counted = (key, n) => { const form = `${key}.${new Intl.PluralRules(I18n.lang).select(n)}`; return I18n.t(I18n.has(form) ? form : `${key}.other`, { n }); };
const PLUS = '<svg viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" aria-hidden="true"><path d="M60 43v34M43 60h34"/></svg>';

// A page of the fan: its heading (a document's first heading, a program's name) and the start of its text.
function fanPage({ name, text }) {
 const page = element('div', `skill-page${CODE.test(name) ? ' is-code' : ''}`);
 const base = name.split('/').pop();
 const heading = !CODE.test(name) && text.match(/^#{1,3}\s+(.+)$/m)?.[1];
 const title = element('h6', 'skill-page-title');
 title.textContent = (heading ? heading.replace(/[*_`]/g, '') : base).slice(0, 40);
 const lines = element('div', 'skill-page-text');
 const rest = (heading ? text.replace(/^#{1,3}\s+.+$/m, '') : text).trim().split('\n').slice(0, 12).join('\n');
 if (CODE.test(name)) {
  // A program's words of the language stand out, as in an editor, faintly.
  let at = 0;
  for (const m of rest.matchAll(KEYWORDS)) {
   lines.append(rest.slice(at, m.index), Object.assign(element('span', 'skill-page-key'), { textContent: m[0] }));
   at = m.index + m[0].length;
  }
  lines.append(rest.slice(at));
 } else lines.textContent = rest.replace(/[#*_`>]/g, '').replace(/^[ \t]+/gm, '');
 const label = element('span', 'skill-page-name');
 label.textContent = name;
 page.append(title, lines, label);
 return page;
}

class SkillCard {
 constructor(skill) {
  this.settled = false;
  this.answer = new Promise(resolve => { this.resolve = resolve; });
  const runs = skill.scripts?.length || 0;
  const el = this.el = element('div', 'skill-sheet');
  el.setAttribute('role', 'group');
  const head = I18n.t(skill.updated ? 'skill.card.update' : 'skill.card.title', { name: skill.name });
  el.setAttribute('aria-label', head);

  const fan = element('div', 'skill-fan');
  fan.setAttribute('aria-hidden', 'true');
  const pages = (skill.pages || []).slice(0, 4);
  pages.forEach((item, k) => {
   const page = fanPage(item), [left, turn, drop] = FAN[pages.length][k];
   page.style.left = `${left}%`;
   page.style.setProperty('--turn', `${turn}deg`);
   page.style.setProperty('--drop', `${drop}px`);
   page.style.setProperty('--k', k);
   page.style.setProperty('--from', `${(50 - left - 13) * 2.2}px`);
   fan.append(page);
  });
  const icon = element('div', 'skill-sheet-icon');
  icon.innerHTML = Glyphs.skill;
  icon.setAttribute('aria-hidden', 'true');

  const body = element('div', 'skill-sheet-body');
  if (skill.from) {
   const tag = element('span', 'skill-sheet-tag');
   tag.innerHTML = Glyphs.globe;
   tag.append(skill.from);
   tag.title = skill.source || '';
   body.append(tag);
  }
  // "Add the skill" over the skill's name in blue; each word out of a blur after the one before.
  const title = element('h3', 'skill-sheet-title');
  const words = I18n.t(skill.updated ? 'skill.card.updateHead' : 'skill.card.addHead').split(/\s+/);
  let k = 0;
  const line = element('span', 'skill-sheet-line');
  for (const word of words) { line.append(Object.assign(element('span', 'skill-sheet-word'), { textContent: word }), ' '); }
  const name = element('span', 'skill-sheet-name');
  name.textContent = skill.name;
  title.append(line, name);
  title.querySelectorAll('.skill-sheet-word, .skill-sheet-name').forEach(word => word.style.setProperty('--w', k++));
  body.append(title);
  const about = element('p', 'skill-sheet-about');
  about.textContent = skill.description;
  about.title = skill.description;
  body.append(about);
  if (skill.compatibility) body.append(Object.assign(element('p', 'skill-sheet-needs'), { textContent: I18n.t('skill.card.needs', { what: skill.compatibility }) }));

  const facts = element('div', 'skill-sheet-facts');
  facts.append(Object.assign(element('span', 'skill-sheet-fact'), { textContent: counted('skill.card.files', (skill.count || 0) + 1) }));
  if (runs) {
   const programs = Object.assign(element('span', 'skill-sheet-fact is-programs'), { textContent: counted('skill.card.programs', runs) });
   programs.title = I18n.t('skill.card.programsNote');
   facts.append(programs);
  }
  this.reveal = Object.assign(element('button', 'skill-sheet-inside'), { type: 'button', textContent: I18n.t('skill.card.show') });
  this.reveal.setAttribute('aria-expanded', 'false');
  this.reveal.addEventListener('click', () => this.open(!el.classList.contains('is-open')));
  facts.append(this.reveal);
  body.append(facts);

  // What SKILL.md says and every file it brings; a program among them stands amber.
  const inner = element('div', 'skill-sheet-inner');
  if (skill.body) inner.append(Object.assign(element('pre', 'skill-sheet-text'), { textContent: skill.body }));
  const list = element('div', 'skill-sheet-files');
  for (const file of ['SKILL.md', ...(skill.files || [])]) list.append(Object.assign(element('div', `skill-sheet-file${skill.scripts?.includes(file) ? ' is-program' : ''}`), { textContent: file }));
  if ((skill.count || 0) > (skill.files || []).length) list.append(Object.assign(element('div', 'skill-sheet-file is-more'), { textContent: I18n.t('approve.more', { count: skill.count - skill.files.length }) }));
  inner.append(list);
  this.details = element('div', 'skill-sheet-details');
  this.details.append(inner);
  this.details.hidden = true;
  body.append(this.details);

  this.allow = element('button', 'skill-sheet-add');
  this.allow.type = 'button';
  this.allow.innerHTML = PLUS;
  this.allow.append(I18n.t(skill.updated ? 'skill.card.replace' : 'skill.card.add'));
  this.deny = Object.assign(element('button', 'skill-sheet-later'), { type: 'button', textContent: I18n.t('skill.card.later') });
  this.allow.addEventListener('click', () => this.settle('allow'));
  this.deny.addEventListener('click', () => this.settle('deny'));
  body.append(this.allow, this.deny);
  el.append(fan, icon, body);
  if (!reducedMotion()) {
   el.classList.add('is-coming');
   el.animate([CARD.from, CARD.rest], CARD.open);
  }
  el.addEventListener('animationend', event => { if (event.target === this.allow) el.classList.remove('is-coming'); });
 }

 open(open) {
  const box = this.details, el = this.el;
  el.classList.toggle('is-open', open);
  this.reveal.setAttribute('aria-expanded', String(open));
  this.reveal.textContent = I18n.t(open ? 'skill.card.hide' : 'skill.card.show');
  if (reducedMotion()) { box.hidden = !open; return; }
  const from = box.hidden ? 0 : box.offsetHeight;
  box.hidden = false;
  const to = open ? box.scrollHeight : 0;
  for (const animation of box.getAnimations({ subtree: true })) animation.cancel();
  box.animate([{ height: `${from}px` }, { height: `${to}px` }], CARD.reveal).finished.then(() => { if (!el.classList.contains('is-open')) box.hidden = true; }, () => {});
  box.firstChild.animate(open
   ? [{ opacity: 0, filter: 'blur(4px)', transform: 'translateY(-6px)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }]
   : [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(4px)' }], { ...CARD.reveal, duration: open ? CARD.reveal.duration : 220 });
 }

 settle(value) {
  if (this.settled) return;
  this.settled = true;
  this.el.classList.add('is-answered');
  this.el.classList.toggle('is-allowed', value === 'allow');
  this.deny.disabled = this.allow.disabled = this.reveal.disabled = true;
  this.resolve(value);
 }

 dismiss() {
  const el = this.el;
  if (!el.isConnected) return;
  if (reducedMotion()) { el.remove(); return; }
  const done = () => el.remove();
  el.animate([CARD.rest, CARD.away], CARD.close).finished.then(() => {
   // Gone from sight, it still holds its room in the chat for a moment: the room closes, and then it is taken out.
   const style = getComputedStyle(el);
   el.animate([{ height: `${el.offsetHeight}px`, marginTop: style.marginTop, marginBottom: style.marginBottom, opacity: 0 }, { height: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0 }], CARD.shut).finished.then(done, done);
  }, done);
 }
}

window.Skills = Skills;
window.SkillPill = SkillPill;
window.SkillCard = SkillCard;
})();
