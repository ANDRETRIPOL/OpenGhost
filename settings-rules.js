(() => {
'use strict';

// Settings → Rules (rules.js): the user's rules as Shortcuts lays out its shortcuts. A wall of tiles, one for each rule,
// its colour what it does (ask, block, check, a script...), switched on and off with the round button in its corner.
// A rule opens out of its tile into a chain of blocks: the moment, the conditions, the actions, each a sentence with
// tokens to pick or type in, dragged into another order by the block itself. Three ways to a new rule: say it in words
// (the chat's model fills in the same blocks, checked by the app), build it from blocks, or paste a hook written for
// Claude Code (or this app's rules); one that cannot run here as it is is adapted by the model, the blocks turning
// over into the new ones. Every rule can be tried on the past week's work before it is switched on.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SPRING = 'cubic-bezier(0.34, 1.32, 0.64, 1)';
const esc = text => String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const t = (key, params) => I18n.t(`rules.${key}`, params);
// Every label in its own span, trimmed to its capitals, so it stands in the middle of its button by its ink.
const L = text => `<span class="rl">${esc(text)}</span>`;
// A choice in a menu reads as a sentence of its own, whatever it continues on its block.
const capital = text => { const s = String(text || ''); return s.charAt(0).toLocaleUpperCase(window.I18n?.lang || undefined) + s.slice(1); };
const svg = (d, w = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const G = {
 terminal: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M7.5 10l2.5 2-2.5 2"/><path d="M12.5 14.5h4"/>', 2),
 file: svg('<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/><path d="M9 14.5l2 2 4-4.5"/>', 2),
 doc: svg('<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/><path d="M9 13h6M9 16.5h4"/>', 2),
 globe: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.5 5.2 3.5 8.5s-1.1 6.2-3.5 8.5c-2.4-2.3-3.5-5.2-3.5-8.5S9.6 5.8 12 3.5z"/>', 2),
 cursor: svg('<path d="M6 4.5l12 6.2-5.4 1.6-2.3 5.2z"/><path d="M12.6 12.3l4.4 4.4"/>', 2),
 search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>', 2.2),
 bolt: svg('<path d="M13 3.5L5.5 13.5h6l-1 7 7.5-10h-6z"/>', 2),
 hand: svg('<path d="M8.5 12V6a1.5 1.5 0 0 1 3 0v5"/><path d="M11.5 10.5V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14.5 10V7a1.5 1.5 0 0 1 3 0v6.5a6.5 6.5 0 0 1-6.5 6.5c-2.5 0-4-1.2-5.5-3.5L4 13.8a1.4 1.4 0 0 1 2.3-1.6l2.2 2.3"/>', 1.9),
 after: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.6-4.9"/>', 2),
 warn: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4.5"/><path d="M12 17.5v.1"/>', 2),
 layers: svg('<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/>', 2),
 bubble: svg('<path d="M12 4c4.7 0 8.5 3 8.5 7s-3.8 7-8.5 7c-1 0-2-.1-2.9-.4L4.5 20l1.1-3.9C4.3 14.8 3.5 13 3.5 11c0-4 3.8-7 8.5-7z"/>', 2),
 play: svg('<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>', 1.5),
 flag: svg('<path d="M5.5 20.5v-16"/><path d="M5.5 4.5h11l-2 4 2 4h-11"/>', 2),
 bell: svg('<path d="M6.5 16V11a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>', 2),
 reply: svg('<path d="M9.5 7.5L4.5 12l5 4.5"/><path d="M4.5 12H14a5.5 5.5 0 0 1 5.5 5.5"/>', 2),
 helper: svg('<path d="M4 18V11a6 6 0 0 1 12 0v7l-1.6-1.2-1.6 1.2-1.6-1.2-1.6 1.2-1.6-1.2z"/><path d="M17.5 8.5a3 3 0 0 1 2.5 3V17"/>', 1.9),
 list: svg('<path d="M9.5 7h10M9.5 12h10M9.5 17h10"/><path d="M4.5 7h.1M4.5 12h.1M4.5 17h.1"/>', 2.4),
 stack: svg('<rect x="4" y="5" width="16" height="4" rx="1.5"/><rect x="4" y="11" width="16" height="4" rx="1.5"/><path d="M6 18.5h12"/>', 2),
 error: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/><path d="M12 16.3v.1"/>', 2),
 chip: svg('<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9.5 3.5v2.5M14.5 3.5v2.5M9.5 18v2.5M14.5 18v2.5M3.5 9.5H6M3.5 14.5H6M18 9.5h2.5M18 14.5h2.5"/>', 1.8),
 if: svg('<path d="M6.5 4.5v3a5.5 5.5 0 0 0 11 0v-3"/><path d="M12 13v6.5"/>', 2.4),
 ask: svg('<path d="M12 3.5c4.7 0 8.5 3.2 8.5 7.3s-3.8 7.2-8.5 7.2c-1 0-1.9-.1-2.8-.4L4.5 20l1-4.1C4.3 14.6 3.5 12.8 3.5 10.8 3.5 6.7 7.3 3.5 12 3.5z"/><path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.4"/><path d="M12 14.6v.1"/>'),
 deny: svg('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'),
 allow: svg('<path d="M5 12h14"/><path d="M14.5 7.5L19 12l-4.5 4.5"/>', 2.2),
 context: svg('<path d="M12 4c4.7 0 8.5 3 8.5 7s-3.8 7-8.5 7c-1 0-2-.1-2.9-.4L4.5 20l1.1-3.9C4.3 14.8 3.5 13 3.5 11c0-4 3.8-7 8.5-7z"/><path d="M8.5 10h7M8.5 13h4.5"/>', 1.9),
 check: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4.5h-4.5"/><path d="M8.5 12.3l2.4 2.4 4.6-4.9"/>'),
 keepGoing: svg('<path d="M4.5 12a7.5 7.5 0 0 1 13-5"/><path d="M17.5 3.5V7H14"/><path d="M19.5 12a7.5 7.5 0 0 1-13 5"/><path d="M6.5 20.5V17H10"/>', 2),
 notify: svg('<path d="M6.5 16V11a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>', 2),
 log: svg('<path d="M6 4.5h10.5a1.5 1.5 0 0 1 1.5 1.5v14H7.5A1.5 1.5 0 0 1 6 18.5z"/><path d="M6 18.5A1.5 1.5 0 0 1 7.5 17H18"/><path d="M9.5 8.5h5"/>', 1.9),
 stop: svg('<rect x="6" y="6" width="12" height="12" rx="2.5"/>', 2.2),
 command: svg('<path d="M8.5 7.5L4 12l4.5 4.5"/><path d="M15.5 7.5L20 12l-4.5 4.5"/><path d="M13.2 5.5l-2.4 13"/>'),
 http: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 2),
 prompt: svg('<path d="M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>', 1.6),
 tick: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.8),
 plus: svg('<path d="M12 5v14M5 12h14"/>', 2.2),
 back: svg('<path d="M15 5l-7 7 7 7"/>', 2.6),
 // The composer's own send arrow (send-button.js): the same drawing, size and weight.
 up: '<svg viewBox="30 30 60 60" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M60 84V37"/><path d="M41 56 60 37 79 56"/></svg>',
 cross: svg('<path d="M7 7l10 10M17 7L7 17"/>', 2.2),
 grip: svg('<path d="M9 7h.1M15 7h.1M9 12h.1M15 12h.1M9 17h.1M15 17h.1"/>', 3),
 ghost: '<svg viewBox="-1 -1 60 62" aria-hidden="true"><path fill="currentColor" d="M0 29A29 29 0 0 1 58 29L58 57A2.5 2.5 0 0 1 53 57A6 6 0 0 0 41 57A3 3 0 0 1 35 57A6 6 0 0 0 23 57A3 3 0 0 1 17 57A6 6 0 0 0 5 57A2.5 2.5 0 0 1 0 57Z"/><ellipse class="rules-ghost-eye" cx="17" cy="29.5" rx="3.8" ry="4.1"/><ellipse class="rules-ghost-eye" cx="41" cy="29.5" rx="3.8" ry="4.1"/></svg>',
};
// Each glyph moved so the box of its ink, stroke and caps included, stands in the middle of its 24 field: measured from
// the rendered glyphs (harness rules-glyphs-scenario.js), not guessed. The play triangle stays where its eye-centre is.
const CENTRE = { warn: [0, -0.6], cursor: [-0.25, 0.85], search: [-0.25, -0.25], bolt: [0.25, 0], hand: [1.35, 0.25], layers: [0, 1.5], flag: [1, -0.5], bell: [0, -1.6], notify: [0, -1.6], reply: [0, -0.5], helper: [0, 0.5], stack: [0, 0.25], ask: [0, 0.25], prompt: [-1.35, -0.5], tick: [0, -0.25], back: [0.55, 0], log: [0, -0.25], check: [0, 0.1] };
for (const [name, [x, y]] of Object.entries(CENTRE)) G[name] = G[name].replace(/(<svg[^>]*>)([\s\S]*)(<\/svg>)/, `$1<g transform="translate(${x} ${y})">$2</g>$3`);
const ARROWS = '<svg class="lang-arrows" viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.2 5.2L5 2.4l2.8 2.8M2.2 8.8L5 11.6l2.8-2.8"/></svg>';
const CHECK = '<svg class="lang-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.6 6.3l2.3 2.3 4.6-4.9"/></svg>';

// The moments, as the user picks them. A step of the agent's has two parts in the sentence: when (before it, before
// the user is asked about it, after it, when it failed) and what step (a command, a file...).
const WHEN = [
 { key: 'before', event: 'PreToolUse', icon: 'bolt', group: 'step' },
 { key: 'asked', event: 'PermissionRequest', icon: 'hand', group: 'step' },
 { key: 'after', event: 'PostToolUse', icon: 'after', group: 'step' },
 { key: 'failed', event: 'PostToolUseFailure', icon: 'warn', group: 'step' },
 { key: 'batch', event: 'PostToolBatch', icon: 'layers', group: 'step' },
 { key: 'message', event: 'UserPromptSubmit', icon: 'bubble', group: 'talk' },
 { key: 'start', event: 'SessionStart', icon: 'play', group: 'talk' },
 { key: 'done', event: 'Stop', icon: 'flag', group: 'talk' },
 { key: 'waits', event: 'Notification', matcher: 'permission_prompt|agent_needs_input', icon: 'bell', group: 'talk' },
 { key: 'replied', event: 'Notification', matcher: 'agent_completed', icon: 'reply', group: 'talk' },
 { key: 'helperStart', event: 'SubagentStart', icon: 'helper', group: 'more' },
 { key: 'helperDone', event: 'SubagentStop', icon: 'helper', group: 'more' },
 { key: 'planAdd', event: 'TaskCreated', icon: 'list', group: 'more' },
 { key: 'planDone', event: 'TaskCompleted', icon: 'list', group: 'more' },
 { key: 'compact', event: 'PreCompact', icon: 'stack', group: 'more' },
 { key: 'compacted', event: 'PostCompact', icon: 'stack', group: 'more' },
 { key: 'failure', event: 'StopFailure', icon: 'error', group: 'more' },
 { key: 'model', event: 'PostModelSwitch', icon: 'chip', group: 'more' },
];
// What step: the tools a matcher names, as the user knows them.
const STEPS = [
 { key: 'command', matcher: 'Bash|PowerShell', icon: 'terminal' },
 { key: 'file', matcher: 'Edit|Write', icon: 'file' },
 { key: 'read', matcher: 'Read', icon: 'doc' },
 { key: 'site', matcher: 'WebFetch|mcp__browser__navigate|mcp__browser__tabs', icon: 'globe' },
 { key: 'page', matcher: 'mcp__browser__.*', icon: 'cursor' },
 { key: 'search', matcher: 'WebSearch', icon: 'search' },
 { key: 'step', matcher: '', icon: 'bolt' },
];
const TOOL_EVENTS = new Set(['PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure']);
const FIELDS = {
 tool: ['command', 'path', 'site', 'url', 'element', 'risky', 'query', 'content', 'tool'],
 UserPromptSubmit: ['prompt'],
 Notification: ['message'],
 TaskCreated: ['task_subject'],
 TaskCompleted: ['task_subject'],
};
const OPS = ['contains', 'startsWith', 'endsWith', 'is', 'isNot', 'notContains', 'matches', 'regex'];
const HANDLERS = ['command', 'http', 'prompt'];
// The colour of a rule: what its strongest action does.
const KIND = { deny: 'block', stop: 'block', ask: 'ask', check: 'check', keepGoing: 'check', command: 'script', http: 'script', prompt: 'script', notify: 'notify', context: 'tell', allow: 'tell', log: 'log' };
const KIND_ORDER = ['deny', 'stop', 'ask', 'check', 'keepGoing', 'command', 'http', 'prompt', 'notify', 'context', 'allow', 'log'];
const ICON_OF = { block: 'deny', ask: 'ask', check: 'check', script: 'command', notify: 'notify', tell: 'context', log: 'log' };
const COLOR = { when: 'rgb(10,132,255)', if: 'rgb(142,142,150)', ask: 'rgb(247,143,46)', deny: 'rgb(238,72,92)', stop: 'rgb(238,72,92)', allow: 'rgb(10,132,255)', context: 'rgb(10,132,255)', check: 'rgb(40,178,96)', keepGoing: 'rgb(40,178,96)', notify: 'rgb(26,170,230)', log: 'rgb(142,142,150)', command: 'rgb(98,84,232)', http: 'rgb(98,84,232)', prompt: 'rgb(98,84,232)' };
const PAST_DAYS = 7, PAST_CHATS = 60, PAST_SHOWN = 6;
const MODEL_KEY = 'openghost.rules.model';
// The highlight of a menu follows the pointer on the springs the chat's menu has (row-menu.js): it keeps its speed from
// row to row, and fades in and out.
const GLIDE_SPRING = [520, 40], FADE_SPRING = [320, 32];
function spring(s, goal, [k, c], dt) {
 const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
 for (let i = 0; i < steps; i++) { s[1] += ((goal - s[0]) * k - s[1] * c) * h; s[0] += s[1] * h; }
 if (Math.abs(goal - s[0]) < 0.01 && Math.abs(s[1]) < 0.05) { s[0] = goal; s[1] = 0; return false; }
 return true;
}

const whenOf = rule => WHEN.find(w => w.event === rule.event && (w.matcher === undefined || (w.matcher || '') === (rule.matcher || ''))) || null;
const stepOf = rule => STEPS.find(item => item.matcher === (rule.matcher || '')) || null;
const kindOf = rule => { if (Rules.problems(rule).length) return 'wrong'; if (rule.on === false) return 'off'; const top = KIND_ORDER.find(type => (rule.then || []).some(a => a.type === type)); return KIND[top] || 'log'; };
const clone = value => JSON.parse(JSON.stringify(value));

class RulesSettings {
 constructor({ root, chat, settings }) {
  this.root = root;
  this.chat = chat;
  RulesSettings.current = this;
  this.settings = settings;
  this.view = 'wall';
  this.menu = document.createElement('div');
  this.menu.className = 'lang-menu rules-menu';
  this.menu.setAttribute('popover', '');
  this.menu.setAttribute('role', 'listbox');
  settings.dialog.append(this.menu);
  this.menu.addEventListener('pointermove', event => { const row = event.target.closest('.lang-option'); if (row) this.point(row); });
  this.menu.addEventListener('pointerleave', () => this.point(null));
  this.g = { y: [0, 0], o: [0, 0] };
  this.tick = this.tick.bind(this);
  this.menu.addEventListener('toggle', event => { if (event.newState === 'closed') { this.root.querySelectorAll('.is-open').forEach(el => el.classList.remove('is-open')); this.picking = null; this.menuShut = performance.now(); } });
  // Escape closes a token's menu, not the settings; in a rule it goes back to the wall, keeping what was changed.
  // The settings close by Escape and by a click past them; neither may lose a rule being made. Only Escape goes back
  // from a rule (a draft is let go by it, as by Discard); a click past the settings leaves the rule open as it is.
  settings.dialog.addEventListener('keydown', event => { if (event.key === 'Escape') this.escAt = performance.now(); }, true);
  settings.dialog.addEventListener('cancel', event => {
   if (performance.now() - (this.menuShut || 0) < 200 || this.menu.matches(':popover-open')) { event.preventDefault(); return; }
   if (this.root.hidden) return;
   const escape = performance.now() - (this.escAt || 0) < 300;
   if (this.root.querySelector('.rules-lib')) { event.preventDefault(); if (escape) this.closeLibrary(); return; }
   if (this.view === 'edit') { event.preventDefault(); if (!escape) return; if (this.editing?.draft) this.close(null); else this.keep(); }
  });
  this.menu.addEventListener('click', event => {
   const tab = event.target.closest('.rules-seg-tab');
   if (tab) {
    for (const each of this.menu.querySelectorAll('.rules-seg-tab')) each.setAttribute('aria-selected', String(each === tab));
    // The menu grows or shrinks to the group shown, from where it stands, its top kept.
    const from = this.menu.offsetHeight;
    for (const group of this.menu.querySelectorAll('.rules-menu-group')) group.hidden = group.dataset.group !== tab.dataset.tab;
    this.segment(this.menu, tab.dataset.tab);
    const to = this.menu.offsetHeight, edge = this.settings.dialog.getBoundingClientRect(), top = this.menu.getBoundingClientRect().top;
    if (top + to > edge.bottom - 8) this.menu.style.top = `${Math.round(Math.max(edge.top + 8, edge.bottom - 8 - to))}px`;
    if (!reducedMotion()) {
     this.menu.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 300, easing: EASE });
     [...this.menu.querySelectorAll('.rules-menu-group:not([hidden]) .lang-option')].forEach((row, k) => row.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: 15 * k, easing: EASE, fill: 'backwards' }));
    }
    const first = this.menu.querySelector('.rules-menu-group:not([hidden]) .lang-option');
    if (first) this.glide(first, true);
    return;
   }
   const row = event.target.closest('.lang-option');
   if (row && this.picking) { const pick = this.picking; this.menu.hidePopover(); pick(row.dataset.value); }
  });
  root.addEventListener('click', event => this.onClick(event));
  root.addEventListener('input', event => this.onInput(event));
  root.addEventListener('keydown', event => this.onKey(event));
  root.addEventListener('pointerdown', event => this.onPointerDown(event));
  Rules.onChange(() => { if (this.view === 'wall' && !this.quiet && this.signature() !== this.wallSig) this.wall({ enter: false }); });
  this.scope = 'user';
  // The model's name is read anew whenever the page comes into view: the models may have come in after it was drawn.
  new MutationObserver(() => { if (!root.hidden) this.refreshPills(); }).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  settings.dialog.addEventListener('focusin', () => { if (!root.hidden) this.refreshPills(); });
  window.addEventListener('rules-project', () => { this.scope = 'project'; this.projectData = null; this.loadProject(this.projectOf()); this.wall(); });
  this.wall();
  Rules.ready.then(() => { if (this.view === 'wall') this.wall(); });
 }

 // --- The wall ---------------------------------------------------------------------------------------------------

 // What the wall shows, so a change of the file that changed nothing on it (the file just saved) draws nothing anew.
 signature() {
  return JSON.stringify([this.scope, this.projectData?.trusted, this.listNow()]);
 }

 wall({ from = null, status = '', enter = true } = {}) {
  this.view = 'wall';
  this.editing = null;
  const project = this.projectOf();
  if (!project) this.scope = 'user';
  if (this.scope === 'project' && this.projectData?.cwd !== project) this.loadProject(project);
  const rules = this.listNow();
  const held = this.scope === 'project' && this.projectData && !this.projectData.trusted && rules.length;
  const commands = held ? [...new Set(rules.flatMap(rule => (rule.then || []).map(action => action.command || action.url || '').filter(Boolean)))].slice(0, 4) : [];
  this.wallSig = this.signature();
  this.root.innerHTML = `
   <p class="settings-lead rules-lead">${esc(t('lead'))}</p>
   ${project ? `<div class="rules-seg is-scope" role="tablist"><span class="rules-seg-glide" aria-hidden="true"></span><button type="button" class="rules-seg-tab" data-scope="user" aria-selected="${this.scope === 'user'}">${L(t('mine'))}</button><button type="button" class="rules-seg-tab" data-scope="project" aria-selected="${this.scope === 'project'}">${L(t('project', { name: project.split(/[\\/]/).filter(Boolean).pop() || project }))}</button></div>` : ''}
   ${held ? `<div class="rules-banner is-wrong is-trust">${G.warn}<div class="rules-banner-text"><b>${esc(t('heldTitle'))}</b><p>${esc(t('heldText'))}</p>${commands.length ? `<ul>${commands.map(command => `<li><code>${esc(String(command).replace(/\s+/g, ' ').slice(0, 90))}</code></li>`).join('')}</ul>` : ''}</div><button type="button" class="rules-btn is-primary" data-action="trust">${L(t('trust'))}</button></div>` : ''}
   <div class="rules-ask">${G.ghost.replace('<svg', '<svg class="rules-ask-ghost"')}<textarea class="rules-ask-input" rows="1" spellcheck="true" placeholder="${esc(t('ask'))}" aria-label="${esc(t('ask'))}"></textarea>${this.modelPill()}<button type="button" class="rules-send" aria-label="${esc(t('make'))}">${G.up}</button></div>
   <p class="settings-status rules-status" role="status">${esc(status)}</p>
   <h3 class="rules-title">${esc(t('all'))}</h3>
   <div class="rules-grid">
    ${rules.map(rule => this.tile(rule)).join('')}
    <button type="button" class="rules-tile is-new" data-action="new">${G.plus}<span class="rules-tile-name">${L(t('new'))}</span></button>
   </div>
   <div class="rules-foot">
    <button type="button" class="rules-link" data-action="claude">${G.reply.replace('<svg', '<svg class="rules-link-glyph"')}${L(t('fromClaude'))}</button>
    <button type="button" class="rules-link" data-action="folder">${L(t('file'))}</button>
   </div>`;
  this.grid = this.root.querySelector('.rules-grid');
  this.input = this.root.querySelector('.rules-ask-input');
  this.sizeAsk();
  const seg = this.root.querySelector('.rules-seg.is-scope');
  if (seg) requestAnimationFrame(() => this.segment(seg, this.scope, true));
  // The tiles come in one after another when the wall is first shown. Back from a rule, they stand still: only the
  // rule's own tile settles (close).
  if (reducedMotion() || !enter || from !== null) return;
  [...this.grid.children].forEach((tile, k) => {
   tile.animate([{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 30 * k, easing: EASE, fill: 'backwards' });
  });
 }

 // The project of the chat in use: its folder, unless the chat has no project (a chat's own folder is none).
 projectOf() {
  const chat = this.chat(), conv = chat?.active;
  if (!conv) return '';
  if (conv.record && chat.library?.isHome?.(conv.record)) return '';
  if (!conv.record && !conv.folder) return '';
  const cwd = chat.cwd(conv) || '';
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(cwd) ? cwd : '';
 }

 async loadProject(cwd, fresh = true) {
  const got = await Rules.project(cwd, fresh).catch(() => null);
  this.projectData = { cwd, rules: got?.rules || [], trusted: !!got?.trusted, file: got?.file || '' };
  if (this.view === 'wall' && this.scope === 'project' && this.signature() !== this.wallSig) this.wall({ enter: false });
 }

 listNow() {
  if (this.scope === 'project') return clone(this.projectData?.rules || []);
  return Rules.list();
 }

 async saveList(list) {
  if (this.scope === 'project' && this.projectData?.cwd) {
   const got = await Rules.saveProject(this.projectData.cwd, list);
   this.projectData = { cwd: this.projectData.cwd, rules: got.rules, trusted: got.trusted, file: got.file };
   return;
  }
  await Rules.save(list);
 }

 tile(rule) {
  const kind = kindOf(rule), when = whenOf(rule);
  const icon = kind === 'wrong' ? 'warn' : kind === 'off' ? ((TOOL_EVENTS.has(rule.event) ? stepOf(rule)?.icon : when?.icon) || 'bolt') : ICON_OF[kind];
  return `<div class="rules-tile is-${kind}${rule.on === false ? ' is-paused' : ''}" data-rule="${esc(rule.id)}" role="button" tabindex="0" aria-label="${esc(rule.name)}">
   <span class="rules-tile-top"><span class="rules-tile-icon">${G[icon] || G.bolt}</span>${kind === 'wrong' ? `<span class="rules-tile-badge">${L(t('needsAdapt'))}</span>` : `<button type="button" class="rules-on" data-action="toggle" role="switch" aria-checked="${rule.on !== false}" aria-label="${esc(t('on'))}">${G.tick}</button>`}</span>
   <span class="rules-tile-name">${L(rule.name || t('untitled'))}</span>
  </div>`;
 }

 sizeAsk() {
  const field = this.input;
  if (!field) return;
  field.style.height = 'auto';
  field.style.height = `${Math.min(160, field.scrollHeight)}px`;
  this.root.querySelector('.rules-ask')?.classList.toggle('is-filled', !!field.value.trim());
 }

 status(text, tone = '') {
  const el = this.root.querySelector('.rules-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
 }

 async toggle(id) {
  const list = this.listNow(), rule = list.find(item => item.id === id);
  if (!rule) return;
  rule.on = rule.on === false;
  const tile = this.grid?.querySelector(`[data-rule="${CSS.escape(id)}"]`);
  if (tile) {
   tile.className = `rules-tile is-${kindOf(rule)}${rule.on === false ? ' is-paused' : ''}`;
   tile.querySelector('.rules-on')?.setAttribute('aria-checked', String(rule.on !== false));
  }
  this.quiet = true;
  await this.saveList(list);
  this.quiet = false;
 }

 // --- Say it, or paste it ----------------------------------------------------------------------------------------

 async ask() {
  const text = this.input?.value.trim();
  if (!text || this.busy) return;
  const pasted = Rules.readPasted(text);
  if (pasted) return this.bring(pasted.rules, pasted.kind === 'claude-code' ? 'claude' : 'pasted');
  if (/^[[{]/.test(text)) return this.status(t('unreadable'), 'error');
  const complete = this.completer();
  if (!complete) return this.status(t('noModel'), 'error');
  this.busy = true;
  // While the model builds it, a light runs round the field: no line of words under it.
  this.root.querySelector('.rules-ask')?.classList.add('is-building');
  this.status('');
  const got = await Rules.compose(text, complete, I18n.lang, await this.places()).catch(error => ({ error: error.message }));
  this.busy = false;
  this.root.querySelector('.rules-ask')?.classList.remove('is-building');
  if (!got.rule) return this.status(t('notBuilt', { why: got.error || '' }), 'error');
  this.edit(got.rule, { draft: true, words: text, building: true });
 }

 // The chat's model, for words and for adapting: the open chat's, or the one picked for new chats.
 // The model that writes rules: the one the user picked for them, else the chat's own. Its effort is kept modest: a
 // rule is a short answer.
 builder() {
  const chat = this.chat(), models = this.settings.models || [];
  let picked = '';
  try { picked = localStorage.getItem(MODEL_KEY) || ''; } catch {}
  const id = models.some(model => model.id === picked) ? picked : chat?.config?.(chat.active)?.id || models[0]?.id || '';
  return this.settings.configFor(id, 'medium');
 }

 completer() {
  const config = this.builder();
  if (!config?.ready) return null;
  return messages => Providers.complete(config, { messages, maxTokens: 1200, waited: true });
 }

 modelPill() {
  const config = this.builder();
  const name = config?.name || t('noModelShort');
  return `<button type="button" class="rules-model" data-action="model" title="${esc(`${t('modelHint')}: ${name}`)}">${L(name.length > 20 ? `${name.slice(0, 19).trim()}…` : name)}${ARROWS}</button>`;
 }

 refreshPills() {
  const html = this.modelPill();
  for (const pill of this.root.querySelectorAll('.rules-model')) if (pill.outerHTML !== html && !pill.classList.contains('is-open')) pill.outerHTML = html;
 }

 pickModel(button) {
  const models = this.settings.models || [], now = this.builder()?.id;
  this.open(button, models.map(model => ({ value: model.id, label: model.name || model.id })), now, id => {
   try { localStorage.setItem(MODEL_KEY, id); } catch {}
   for (const pill of this.root.querySelectorAll('.rules-model')) pill.outerHTML = this.modelPill();
  });
 }

 // The user's real folders, for a rule that names one: the desktop, documents and downloads as the system has them,
 // the home, and the projects of the chats.
 async places() {
  const env = await AgentTools.environment().catch(() => null), out = { ...(env?.places || {}) };
  if (env?.home) out.home = env.home;
  for (const folder of (this.chat()?.library?.folders || []).slice(0, 12)) if (folder?.path) out[`project «${folder.name || folder.path.split(/[\\/]/).pop()}»`] = folder.path;
  return out;
 }

 // Rules brought in (pasted, or from Claude Code's settings): one opens to be looked at; several go on the wall.
 async bring(rules, from) {
  if (!rules.length) return this.status(t('nothing'), 'error');
  for (const rule of rules) rule.from = { ...(rule.from || {}), kind: rule.from?.kind || (from === 'claude' ? 'claude-code' : 'pasted') };
  if (rules.length === 1) return this.edit(rules[0], { draft: true, pasted: from });
  const list = this.listNow(), known = new Set(list.map(rule => JSON.stringify([rule.event, rule.matcher || '', rule.then])));
  const fresh = rules.filter(rule => !known.has(JSON.stringify([rule.event, rule.matcher || '', rule.then])));
  await this.saveList([...list, ...fresh]);
  const wrong = fresh.filter(rule => Rules.problems(rule).length).length;
  this.wall({ status: fresh.length ? t('brought', { count: fresh.length, wrong }) : t('allThere'), enter: false });
 }

 async fromClaude() {
  const chat = this.chat(), cwd = chat?.active ? chat.cwd(chat.active) : '';
  const found = await window.openghost?.rules?.claude(cwd).catch(() => []) || [];
  const rules = found.flatMap(item => Rules.importClaude(item.hooks, { file: item.file, scope: item.scope }));
  if (!rules.length) return this.status(t('noClaude'), 'error');
  return this.bring(rules, 'claude');
 }

 // --- The editor ---------------------------------------------------------------------------------------------------

 edit(rule, { draft = false, words = '', pasted = '', building = false, origin = null } = {}) {
  this.view = 'edit';
  this.editing = { rule: clone(rule), draft, words, pasted, id: rule.id };
  const tile = origin || this.grid?.querySelector(`[data-rule="${CSS.escape(rule.id)}"]`);
  const from = tile?.getBoundingClientRect();
  this.render();
  const sheet = this.root.querySelector('.rules-editor');
  if (reducedMotion() || !sheet) return;
  // The rule opens out of its tile: the sheet grows from the tile's place, and its blocks come in one after another.
  if (from) {
   const box = sheet.getBoundingClientRect();
   const inset = `inset(${from.top - box.top}px ${box.right - from.right}px ${Math.max(0, box.bottom - from.bottom)}px ${from.left - box.left}px round 18px)`;
   sheet.animate([{ clipPath: inset, opacity: 0.6 }, { clipPath: 'inset(0 0 0 0 round 0px)', opacity: 1 }], { duration: 460, easing: EASE });
  }
  this.blocksIn(building ? 160 : 45, building ? 260 : 120);
 }

 blocksIn(step = 45, delay = 120) {
  if (reducedMotion()) return;
  [...this.root.querySelectorAll('.rules-chain > *')].forEach((el, k) => {
   el.animate([{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 480, delay: delay + step * k, easing: EASE, fill: 'backwards' });
  });
 }

 render() {
  const { rule, draft, words, pasted } = this.editing;
  const wrong = Rules.issues(rule);
  const banner = wrong.length
   ? `<div class="rules-banner is-wrong">${G.warn}<div class="rules-banner-text"><b>${esc(t('cannotRun'))}</b><ul>${wrong.map(item => `<li>${esc(I18n.has(`rules.problem.${item.code}`) ? t(`problem.${item.code}`, item) : item.text)}</li>`).join('')}</ul></div><button type="button" class="rules-btn is-primary" data-action="adapt">${L(t('adapt'))}</button></div>`
   : words ? `<div class="rules-banner">${G.ghost}<span>${esc(t('fromWords', { words }))}</span></div>`
   : pasted ? `<div class="rules-banner">${G.reply}<span>${esc(t(pasted === 'claude' ? 'fromClaudeCode' : 'fromPaste'))}</span></div>` : '';
  this.root.innerHTML = `
   <div class="rules-editor">
    <div class="rules-bar">
     <button type="button" class="rules-back" data-action="back">${G.back}${L(t('all'))}</button>
     <input class="rules-name" value="${esc(rule.name || '')}" placeholder="${esc(t('untitled'))}" aria-label="${esc(t('name'))}" spellcheck="false">
     ${draft ? '<span></span>' : `<button type="button" class="rules-done" data-action="done" aria-label="${esc(t('done'))}">${G.tick}</button>`}
    </div>
    <div class="rules-ask is-revise">${G.ghost.replace('<svg', '<svg class="rules-ask-ghost"')}<textarea class="rules-revise-input" rows="1" spellcheck="true" placeholder="${esc(t('revise'))}" aria-label="${esc(t('revise'))}"></textarea>${this.modelPill()}<button type="button" class="rules-send" data-action="revise" aria-label="${esc(t('reviseGo'))}">${G.up}</button></div>
    ${banner}
    <div class="rules-chain">${this.chainHtml(rule)}</div>
    <button type="button" class="rules-add" data-action="add">${G.plus}${L(t('addStep'))}</button>
    <div class="rules-try">
     <button type="button" class="rules-btn" data-action="try">${L(t('try'))}</button>
     <div class="rules-past"></div>
    </div>
    <div class="rules-actions">
     ${draft ? `<button type="button" class="rules-btn is-primary" data-action="turnOn"${wrong.length ? ' disabled' : ''}>${L(t('turnOn'))}</button><button type="button" class="rules-btn" data-action="discard">${L(t('discard'))}</button>`
      : `<button type="button" class="rules-btn is-danger" data-action="delete">${L(t('delete'))}</button>`}
    </div>
   </div>`;
 }

 chainHtml(rule) {
  const when = whenOf(rule), out = [];
  let whenBlock;
  if (TOOL_EVENTS.has(rule.event)) {
   const step = stepOf(rule), done = rule.event === 'PostToolUse';
   whenBlock = this.block('when', -1, step?.icon || 'bolt', COLOR.when, [this.token(t(`moment.${rule.event}`), 'when'), step ? this.token(t(`${done ? 'did' : 'does'}.${step.key}`), 'steps') : this.token(rule.matcher || '', 'matcher', 'code')]);
  } else if (when) whenBlock = this.block('when', -1, when.icon, COLOR.when, [t('whenAgent'), this.token(t(`when.${when.key}`), 'when')]);
  else whenBlock = this.block('when', -1, 'bolt', COLOR.when, [t('whenRaw'), this.token(rule.event || '?', 'when'), ...(rule.matcher ? [t('matching'), this.token(rule.matcher, 'matcher', 'code')] : [])]);
  out.push(whenBlock);
  const conditions = rule.if || [];
  if (rule.ccIf) out.push(this.block('ccif', -1, 'if', COLOR.if, ['If it matches', this.token(rule.ccIf, 'ccIf', 'code')]));
  conditions.forEach((condition, k) => out.push(this.condition(condition, k, rule)));
  const inside = conditions.length || rule.ccIf;
  (rule.then || []).forEach((action, k) => out.push(this.action(action, k, rule, inside)));
  if (inside) out.push(`<div class="rules-end">${L(t('endIf'))}</div>`);
  return out.join('');
 }

 token(text, part, kind = '', index = -1) {
  const editable = kind === 'value' || kind === 'code';
  if (editable) return `<input class="rules-tok is-${kind}" data-part="${part}" data-index="${index}" value="${esc(text)}" size="${Math.max(4, String(text).length + 1)}" spellcheck="false" aria-label="${esc(part)}">`;
  return `<button type="button" class="rules-tok" data-part="${part}" data-index="${index}">${L(text)}${ARROWS}</button>`;
 }

 block(kind, index, icon, color, words, sub = null, extra = '', inside = false) {
  const draggable = kind === 'cond' || kind === 'act';
  return `<div class="rules-block is-${kind}${inside ? ' is-in' : ''}" data-kind="${kind}" data-index="${index}">
   <div class="rules-line"><span class="rules-icon" style="--c:${color}">${G[icon] || G.bolt}</span>${words.map(word => word.startsWith('<') ? word : L(word)).join('')}${draggable ? `<button type="button" class="rules-remove" data-action="remove" aria-label="${esc(t('remove'))}">${G.cross}</button>` : ''}</div>
   ${sub ? `<div class="rules-line is-sub">${sub.map(word => word.startsWith('<') ? word : L(word)).join('')}</div>` : ''}${extra}
  </div>`;
 }

 condition(condition, k, rule) {
  if (condition.field === 'risky') return this.block('cond', k, 'if', COLOR.if, [t('if'), this.token(t('field.risky'), 'field', '', k)]);
  return this.block('cond', k, 'if', COLOR.if, [t('if'), this.token(t(`field.${condition.field}`), 'field', '', k), this.token(t(`op.${condition.op}`), 'op', '', k), this.token(condition.value || '', 'value', 'value', k)]);
 }

 action(action, k, rule, inside) {
  const type = action.type, color = COLOR[type] || COLOR.command;
  const val = (key, kind = 'value') => this.token(action[key] || '', key, kind, k);
  const say = (words, sub, extra) => this.block('act', k, type, color, words, sub, extra, inside);
  if (type === 'ask') return say([t('act.ask')], [t('act.askSub')]);
  if (type === 'deny') return say([t(rule.event === 'UserPromptSubmit' ? 'act.denyMessage' : 'act.deny'), t('saying'), val('reason')]);
  if (type === 'allow') return say([t('act.allow')]);
  if (type === 'context') return say([t('act.context'), val('text')]);
  if (type === 'check') return say([t('act.check'), val('command', 'code')], [t(rule.event === 'Stop' || rule.event === 'SubagentStop' ? 'act.checkStop' : rule.event === 'PreToolUse' ? 'act.checkBefore' : 'act.checkAfter')]);
  if (type === 'keepGoing') return say([t('act.keepGoing'), val('reason')]);
  if (type === 'notify') return say([t('act.notify'), val('text')]);
  if (type === 'log') return say([t('act.log')]);
  if (type === 'stop') return say([t('act.stop'), t('saying'), val('reason')]);
  if (type === 'http') return say([t('act.http'), val('url', 'code')]);
  if (type === 'prompt') return say([t('act.prompt')], null, `<textarea class="rules-code is-prompt" data-part="prompt" data-index="${k}" rows="2" spellcheck="true">${esc(action.prompt || '')}</textarea>`);
  if (type === 'command') {
   const shell = action.shell === 'powershell' ? 'PowerShell' : action.shell === 'bash' ? 'Bash' : window.openghost?.platform === 'win32' ? 'PowerShell' : 'Bash';
   return say([t('act.command'), this.token(shell, 'shell', '', k)], null, `<textarea class="rules-code" data-part="command" data-index="${k}" rows="1" spellcheck="false">${esc(action.command || '')}</textarea><div class="rules-io"><span class="rules-chip">${L(t('io.gets'))}</span><span class="rules-chip">${L(t('io.zero'))}</span><span class="rules-chip">${L(t('io.two'))}</span></div>`);
  }
  if (type === 'mcp_tool') return say([t('act.mcp'), this.token([action.server, action.tool].filter(Boolean).join(' · ') || 'MCP', 'mcpTool', 'code', k)]);
  if (type === 'agent') return say([t('act.agent')], null, action.prompt ? `<textarea class="rules-code is-prompt" data-part="prompt" data-index="${k}" rows="2" spellcheck="true">${esc(action.prompt)}</textarea>` : '');
  return say([type]);
 }

 // After a change of the rule: the chain drawn anew, the editor's own parts kept (the focus, what is typed in).
 redraw() {
  const chain = this.root.querySelector('.rules-chain');
  if (!chain) return;
  chain.innerHTML = this.chainHtml(this.editing.rule);
  this.fitCode();
  const wrong = Rules.problems(this.editing.rule);
  const on = this.root.querySelector('[data-action="turnOn"]');
  if (on) on.disabled = !!wrong.length;
 }

 fitCode() {
  for (const area of this.root.querySelectorAll('.rules-code')) { area.style.height = 'auto'; area.style.height = `${area.scrollHeight}px`; }
 }

 // --- Picking in a token's menu ------------------------------------------------------------------------------------

 // items: a list, or columns (a list of lists) laid side by side so a long choice needs no scrolling.
 open(button, items, current, pick) {
  const row = item => item === null ? '<div class="rules-menu-sep"></div>' : item.head ? `<div class="rules-menu-head">${L(item.head)}</div>` : `<button type="button" class="lang-option" role="option" data-value="${esc(item.value)}" aria-selected="${item.value === current}">${item.icon ? `<span class="rules-menu-icon" style="--c:${item.color || COLOR.when}">${G[item.icon] || ''}</span>` : ''}<span class="lang-name">${L(capital(item.label))}</span>${item.note ? `<span class="lang-note">${L(item.note)}</span>` : ''}${CHECK}</button>`;
  // Groups: tabs at the menu's head, one group shown at a time, the one with the choice in use first.
  const groups = items[0]?.items ? items : null;
  const columns = false;
  this.menu.classList.toggle('is-tabbed', !!groups);
  if (groups) {
   const on = groups.find(group => group.items.some(item => item.value === current))?.key || groups[0].key;
   this.menu.innerHTML = `<div class="rules-seg is-menu" role="tablist"><span class="rules-seg-glide" aria-hidden="true"></span>${groups.map(group => `<button type="button" class="rules-seg-tab" data-tab="${group.key}" aria-selected="${group.key === on}">${L(group.label)}</button>`).join('')}</div><div class="rules-menu-list"><span class="lang-glide" aria-hidden="true"></span>${groups.map(group => `<div class="rules-menu-group" data-group="${group.key}"${group.key === on ? '' : ' hidden'}>${group.items.map(row).join('')}</div>`).join('')}</div>`;
  } else this.menu.innerHTML = '<span class="lang-glide" aria-hidden="true"></span>' + items.map(row).join('');
  this.picking = pick;
  // The menu is never wider than the settings' page, nor taller than the window, in any language: what does not fit
  // goes on to a second line in its column.
  const page = this.settings.scroller.getBoundingClientRect(), edge = this.settings.dialog.getBoundingClientRect();
  this.menu.style.maxWidth = `${Math.floor(page.width - 16)}px`;
  this.menu.style.maxHeight = `${Math.floor(edge.height - 16)}px`;
  this.menu.showPopover();
  const at = [...this.menu.querySelectorAll('.lang-option')].find(row => row.getAttribute('aria-selected') === 'true') || this.menu.querySelector('.lang-option');
  const r = button.getBoundingClientRect();
  const h = this.menu.offsetHeight;
  const top = at && current ? r.top + r.height / 2 - at.offsetTop - at.offsetHeight / 2 : r.bottom + 6 + h > edge.bottom - 8 ? r.top - 6 - h : r.bottom + 6;
  const w = this.menu.offsetWidth;
  this.menu.style.left = `${Math.round(Math.max(page.left + 8, Math.min(r.left - 8, page.right - 8 - w)))}px`;
  this.menu.style.top = `${Math.round(Math.max(edge.top + 8, Math.min(top, edge.bottom - 8 - this.menu.offsetHeight)))}px`;
  if (at && !at.closest('[hidden]')) this.glide(at, true);
  if (groups) {
   this.segment(this.menu, this.menu.querySelector('.rules-seg-tab[aria-selected="true"]').dataset.tab, true);
  }
  button.classList.add('is-open');
 }

 // The highlight goes to the row under the pointer, on springs (row-menu.js).
 point(row) {
  if (row === this.pointed) return;
  this.pointed = row;
  if (this.raf) return;
  this.last = performance.now();
  this.raf = requestAnimationFrame(this.tick);
 }

 tick(now) {
  this.raf = 0;
  const glider = this.menu.querySelector('.lang-glide'), row = this.pointed?.isConnected && !this.pointed.closest('[hidden]') ? this.pointed : null;
  if (!glider) return;
  const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.032), g = this.g;
  this.last = now;
  let moving = false;
  if (reducedMotion()) {
   if (row) g.y = [row.offsetTop, 0];
   g.o = [row ? 1 : 0, 0];
  } else {
   if (row && g.o[0] < 0.02) g.y = [row.offsetTop, 0];
   if (row) moving = spring(g.y, row.offsetTop, GLIDE_SPRING, dt) || moving;
   moving = spring(g.o, row ? 1 : 0, FADE_SPRING, dt) || moving;
  }
  glider.style.transition = 'none';
  glider.style.transform = `translateY(${g.y[0].toFixed(2)}px)`;
  glider.style.opacity = Math.min(1, Math.max(0, g.o[0])).toFixed(3);
  if (moving) this.raf = requestAnimationFrame(this.tick);
 }

 glide(row, instant = false) {
  // A menu opened lays its highlight on the row in use at once; the pointer moves it on springs from there.
  this.pointed = row;
  this.g = { y: [row.offsetTop, 0], o: [1, 0] };
  const glider = this.menu.querySelector('.lang-glide');
  if (!glider) return;
  if (instant) glider.style.transition = 'none';
  glider.style.transform = `translateY(${row.offsetTop}px)`;
  if (instant) { void glider.offsetHeight; glider.style.transition = ''; }
 }

 pickToken(button) {
  const rule = this.editing.rule, part = button.dataset.part, k = Number(button.dataset.index);
  if (part === 'steps') {
   return this.open(button, [...STEPS.map(item => ({ value: item.key, label: t(`does.${item.key}`), icon: item.icon, color: COLOR.when })), null, { value: 'custom', label: t('customTools') }], stepOf(rule)?.key || 'custom', key => {
    const step = STEPS.find(item => item.key === key);
    if (step) { if (step.matcher) rule.matcher = step.matcher; else delete rule.matcher; }
    else rule.matcher = rule.matcher && !stepOf(rule) ? rule.matcher : 'mcp__browser__.*';
    this.redraw();
    if (!step) this.root.querySelector('.rules-block.is-when input.rules-tok')?.focus();
   });
  }
  if (part === 'when') {
   const now = whenOf(rule)?.key;
   const groups = ['step', 'talk', 'more'].map(group => ({ key: group, label: t(`tab.${group}`), items: WHEN.filter(item => item.group === group).map(w => ({ value: w.key, label: t(`when.${w.key}`), icon: w.icon, color: COLOR.when })) }));
   return this.open(button, groups, now, key => {
    const w = WHEN.find(item => item.key === key);
    const wasStep = TOOL_EVENTS.has(rule.event);
    rule.event = w.event;
    // A step's moment keeps what step it is about; one coming from elsewhere starts with commands.
    if (TOOL_EVENTS.has(w.event)) { if (!wasStep) rule.matcher = 'Bash|PowerShell'; }
    else if (w.matcher !== undefined && w.matcher) rule.matcher = w.matcher; else delete rule.matcher;
    // What the new moment cannot do or check goes: the chain stays a rule that can run.
    const can = new Set([...(Rules.CAN[w.event] || []), ...HANDLERS]);
    rule.then = (rule.then || []).filter(a => can.has(a.type));
    const fields = new Set(this.fields(rule));
    rule.if = (rule.if || []).filter(c => fields.has(c.field));
    this.redraw();
    this.flash(this.root.querySelector('.rules-block.is-when'));
   });
  }
  if (part === 'field') {
   return this.open(button, this.fields(rule).map(field => ({ value: field, label: t(`field.${field}`) })), rule.if[k].field, field => {
    rule.if[k] = field === 'risky' ? { field, op: 'isOn', value: 'true' } : { field, op: rule.if[k].op === 'isOn' ? 'contains' : rule.if[k].op, value: rule.if[k].field === 'risky' ? '' : rule.if[k].value };
    this.redraw();
   });
  }
  if (part === 'op') return this.open(button, (rule.if[k].field === 'path' ? ['inFolder', ...OPS] : OPS).map(op => ({ value: op, label: t(`op.${op}`) })), rule.if[k].op, op => { rule.if[k].op = op; this.redraw(); });
  if (part === 'shell') return this.open(button, [{ value: 'powershell', label: 'PowerShell' }, { value: 'bash', label: 'Bash' }], rule.then[k].shell || 'powershell', shell => { rule.then[k].shell = shell; this.redraw(); });
 }

 fields(rule) {
  return TOOL_EVENTS.has(rule.event) ? FIELDS.tool : FIELDS[rule.event] || [];
 }

 // The step to add: a condition of what this moment is about, or an action it can take.
 // The library of steps, as Shortcuts has one: the add button opens in place into it — a switch between conditions and
 // actions, and the steps as small tiles that wrap to the page's width, so it never stands out past the settings. A
 // tile picked becomes its block where it belongs; the library folds back into the button.
 pickStep(button) {
  if (this.root.querySelector('.rules-lib')) return this.closeLibrary();
  const rule = this.editing.rule, fields = this.fields(rule);
  const sets = {
   then: [...(Rules.CAN[rule.event] || []), ...HANDLERS].map(type => ({ value: `then:${type}`, label: t(`add.${type}`), icon: type, color: COLOR[type] })),
   if: fields.map(field => ({ value: `if:${field}`, label: t(`field.${field}`), icon: 'if', color: COLOR.if })),
  };
  const tab = this.libTab && sets[this.libTab]?.length ? this.libTab : 'then';
  const chips = list => list.map(item => `<button type="button" class="rules-chip-add" data-pick="${esc(item.value)}"><span class="rules-icon" style="--c:${item.color}">${G[item.icon] || ''}</span>${L(item.label)}</button>`).join('');
  const lib = document.createElement('div');
  lib.className = 'rules-lib';
  lib.innerHTML = `
   <div class="rules-lib-head">
    ${sets.if.length ? `<div class="rules-seg" role="tablist"><span class="rules-seg-glide" aria-hidden="true"></span>${['then', 'if'].map(key => `<button type="button" class="rules-seg-tab" role="tab" data-tab="${key}" aria-selected="${key === tab}">${L(t(key === 'if' ? 'conditions' : 'actions'))}</button>`).join('')}</div>` : `<span class="rules-lib-title">${L(t('actions'))}</span>`}
    <button type="button" class="rules-lib-close" aria-label="${esc(t('remove'))}">${G.cross}</button>
   </div>
   <div class="rules-lib-chips" data-set="then"${tab === 'then' ? '' : ' hidden'}>${chips(sets.then)}</div>
   <div class="rules-lib-chips" data-set="if"${tab === 'if' ? '' : ' hidden'}>${chips(sets.if)}</div>`;
  button.after(lib);
  button.classList.add('is-hidden');
  this.segment(lib, tab, true);
  lib.addEventListener('click', event => {
   const tabButton = event.target.closest('.rules-seg-tab');
   if (tabButton) return this.switchLibrary(lib, tabButton.dataset.tab);
   if (event.target.closest('.rules-lib-close')) return this.closeLibrary();
   const chip = event.target.closest('[data-pick]');
   if (chip) this.addStep(chip.dataset.pick, chip);
  });
  if (reducedMotion()) return;
  const h = lib.offsetHeight;
  lib.animate([{ height: '40px', opacity: 0.4, filter: 'blur(4px)' }, { height: `${h}px`, opacity: 1, filter: 'blur(0)' }], { duration: 380, easing: EASE });
  [...lib.querySelectorAll('.rules-lib-chips:not([hidden]) .rules-chip-add')].forEach((chip, k) => chip.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 60 + 18 * k, easing: EASE, fill: 'backwards' }));
 }

 segment(lib, tab, instant = false) {
  const glide = lib.querySelector('.rules-seg-glide'), at = lib.querySelector(`.rules-seg-tab[data-tab="${tab}"]`);
  if (!glide || !at) return;
  if (instant) glide.style.transition = 'none';
  glide.style.transform = `translateX(${at.offsetLeft}px)`;
  glide.style.width = `${at.offsetWidth}px`;
  if (instant) { void glide.offsetWidth; glide.style.transition = ''; }
 }

 switchLibrary(lib, tab) {
  this.libTab = tab;
  for (const button of lib.querySelectorAll('.rules-seg-tab')) button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  this.segment(lib, tab);
  const from = lib.offsetHeight;
  for (const set of lib.querySelectorAll('.rules-lib-chips')) set.hidden = set.dataset.set !== tab;
  if (reducedMotion()) return;
  const to = lib.offsetHeight;
  lib.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 300, easing: EASE });
  [...lib.querySelectorAll(`.rules-lib-chips[data-set="${tab}"] .rules-chip-add`)].forEach((chip, k) => chip.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 14 * k, easing: EASE, fill: 'backwards' }));
 }

 closeLibrary() {
  const lib = this.root.querySelector('.rules-lib'), button = this.root.querySelector('.rules-add');
  if (!lib) return;
  const done = () => { lib.remove(); button?.classList.remove('is-hidden'); };
  if (reducedMotion()) return done();
  lib.animate([{ height: `${lib.offsetHeight}px`, opacity: 1 }, { height: '40px', opacity: 0, filter: 'blur(4px)' }], { duration: 260, easing: EASE }).finished.then(done, done);
 }

 addStep(value, chip) {
  const rule = this.editing.rule, [where, what] = value.split(':');
  const from = chip?.getBoundingClientRect();
  if (where === 'if') {
   rule.if = [...(rule.if || []), what === 'risky' ? { field: what, op: 'isOn', value: 'true' } : { field: what, op: what === 'path' ? 'inFolder' : 'contains', value: '' }];
  } else {
   const action = { type: what };
   if (what === 'check' || what === 'command') { action.command = ''; action.shell = window.openghost?.platform === 'win32' ? 'powershell' : 'bash'; }
   if (what === 'http') action.url = 'https://';
   if (what === 'prompt') action.prompt = '';
   rule.then = [...(rule.then || []), action];
  }
  this.root.querySelector('.rules-lib')?.remove();
  this.root.querySelector('.rules-add')?.classList.remove('is-hidden');
  this.redraw();
  // The tile flies to where its block now stands, and the block opens out of it.
  const added = where === 'if' ? this.root.querySelector(`.rules-block.is-cond[data-index="${rule.if.length - 1}"]`) : this.root.querySelector(`.rules-block.is-act[data-index="${rule.then.length - 1}"]`);
  if (added && from && !reducedMotion()) {
   const to = added.getBoundingClientRect();
   added.animate([
    { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${Math.min(1, from.width / to.width)}, ${Math.min(1, from.height / to.height)})`, transformOrigin: '0 0', opacity: 0.7, borderRadius: '17px' },
    { transform: 'none', transformOrigin: '0 0', opacity: 1, borderRadius: '16px' },
   ], { duration: 460, easing: SPRING });
  }
  added?.querySelector('input, textarea')?.focus({ preventScroll: true });
 }

 flash(el) {
  if (!el || reducedMotion()) return;
  el.animate([{ boxShadow: '0 0 0 0 rgba(10,132,255,0)' }, { boxShadow: '0 0 0 3px rgba(10,132,255,0.35)' }, { boxShadow: '0 0 0 0 rgba(10,132,255,0)' }], { duration: 900, easing: 'ease-out' });
 }

 // --- Dragging a block into another place --------------------------------------------------------------------------

 onPointerDown(event) {
  const block = event.target.closest('.rules-block.is-cond, .rules-block.is-act');
  if (!block || event.button !== 0 || event.target.closest('input, textarea, button')) return;
  const kind = block.dataset.kind, from = Number(block.dataset.index);
  const siblings = [...this.root.querySelectorAll(`.rules-block.is-${kind}`)];
  if (siblings.length < 2) return;
  const y0 = event.clientY, boxes = siblings.map(el => el.getBoundingClientRect());
  let dragging = false, to = from;
  const move = e => {
   const dy = e.clientY - y0;
   if (!dragging) {
    if (Math.abs(dy) < 5) return;
    dragging = true;
    block.classList.add('is-lifted');
    this.root.classList.add('is-dragging');
   }
   block.style.transform = `translateY(${dy}px) scale(1.02)`;
   // Where it would land: past the middle of a neighbour, that neighbour steps aside.
   const mid = boxes[from].top + boxes[from].height / 2 + dy;
   to = from;
   for (let k = 0; k < boxes.length; k++) {
    if (k < from && mid < boxes[k].top + boxes[k].height / 2) { to = k; break; }
    if (k > from && mid > boxes[k].top + boxes[k].height / 2) to = k;
   }
   const shift = boxes[from].height + 14;
   siblings.forEach((el, k) => {
    if (el === block) return;
    const by = from < to && k > from && k <= to ? -shift : from > to && k >= to && k < from ? shift : 0;
    el.style.transform = by ? `translateY(${by}px)` : '';
   });
  };
  const up = () => {
   window.removeEventListener('pointermove', move);
   window.removeEventListener('pointerup', up);
   window.removeEventListener('pointercancel', up);
   this.root.classList.remove('is-dragging');
   if (!dragging) return;
   const lifted = block.getBoundingClientRect();
   const list = kind === 'cond' ? this.editing.rule.if : this.editing.rule.then;
   const [moved] = list.splice(from, 1);
   list.splice(to, 0, moved);
   this.redraw();
   // It settles into its new place from where it was let go.
   const placed = this.root.querySelector(`.rules-block.is-${kind}[data-index="${to}"]`);
   if (placed && !reducedMotion()) {
    const now = placed.getBoundingClientRect();
    placed.animate([{ transform: `translateY(${lifted.top - now.top}px) scale(1.02)`, boxShadow: '0 12px 30px rgba(0,0,0,0.25)' }, { transform: 'none', boxShadow: '0 0 0 rgba(0,0,0,0)' }], { duration: 420, easing: SPRING });
   }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
 }

 // --- Adapting a hook that cannot run here ---------------------------------------------------------------------------

 // The blocks turn over into the new rule, one after another; the ones that changed keep a light a moment.
 async turnOver(rule, banner = '') {
  const old = [...this.root.querySelectorAll('.rules-chain > *')];
  if (!reducedMotion()) await Promise.all(old.map((el, k) => el.animate([{ opacity: 1, filter: 'blur(0)', transform: 'none' }, { opacity: 0, filter: 'blur(8px)', transform: 'translateY(-6px) rotateX(40deg)' }], { duration: 260, delay: 40 * k, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {})));
  const oldText = old.map(el => el.textContent.replace(/\s+/g, ' ').trim());
  this.editing.rule = rule;
  this.render();
  const now = [...this.root.querySelectorAll('.rules-chain > *')];
  if (!reducedMotion()) now.forEach((el, k) => {
   el.animate([{ opacity: 0, filter: 'blur(8px)', transform: 'translateY(8px) rotateX(-40deg)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], { duration: 520, delay: 60 + 70 * k, easing: EASE, fill: 'backwards' });
   if (!oldText.includes(el.textContent.replace(/\s+/g, ' ').trim()) && el.classList.contains('rules-block')) el.animate([{ boxShadow: '0 0 0 0 rgba(98,84,232,0)' }, { boxShadow: '0 0 0 3px rgba(98,84,232,0.45)' }, { boxShadow: '0 0 0 0 rgba(98,84,232,0)' }], { duration: 1400, delay: 300 + 70 * k, easing: 'ease-out' });
  });
  if (banner) {
   const note = Object.assign(document.createElement('div'), { className: 'rules-banner is-adapted', innerHTML: `${G.prompt}<span>${esc(banner)}</span>` });
   const old = this.root.querySelector('.rules-banner');
   if (old) old.replaceWith(note); else this.root.querySelector('.rules-chain')?.before(note);
  }
  this.fitCode();
 }

 // The rule changed as the user asks, by the model that writes rules.
 async revise() {
  const field = this.root.querySelector('.rules-revise-input'), words = field?.value.trim();
  if (!words || this.busy) return;
  const complete = this.completer();
  if (!complete) return this.status(t('noModel'), 'error');
  this.busy = true;
  // The field's own light runs round it while the model changes the rule: nothing else moves.
  const bar = this.root.querySelector('.rules-ask.is-revise');
  bar?.classList.add('is-building');
  const got = await Rules.revise({ ...this.editing.rule, name: this.root.querySelector('.rules-name')?.value || this.editing.rule.name }, words, complete, I18n.lang, await this.places()).catch(error => ({ error: error.message }));
  this.busy = false;
  bar?.classList.remove('is-building');
  if (!got.rule) {
   this.root.querySelector('.rules-revise-error')?.remove();
   bar?.insertAdjacentHTML('afterend', `<p class="settings-status rules-revise-error" data-tone="error">${esc(t('notRevised', { why: got.error || '' }))}</p>`);
   return;
  }
  await this.turnOver(got.rule, t('revised', { words }));
 }

 async adapt() {
  const complete = this.completer();
  if (!complete) return this.status(t('noModel'), 'error');
  const editor = this.root.querySelector('.rules-editor');
  editor?.classList.add('is-adapting');
  const button = this.root.querySelector('[data-action="adapt"]');
  if (button) { button.disabled = true; button.innerHTML = L(t('adapting')); }
  const before = clone(this.editing.rule);
  const got = await Rules.adapt(before, complete, I18n.lang, await this.places()).catch(error => ({ error: error.message }));
  editor?.classList.remove('is-adapting');
  if (!got.rule) {
   if (button) { button.disabled = false; button.innerHTML = L(t('adapt')); }
   const banner = this.root.querySelector('.rules-banner-text');
   banner?.insertAdjacentHTML('beforeend', `<p class="rules-banner-error">${esc(t('notAdapted', { why: got.error || '' }))}</p>`);
   return;
  }
  await this.turnOver({ ...got.rule, name: got.rule.name || before.name }, t('adapted'));
 }

 // --- Trying it on the past ------------------------------------------------------------------------------------------

 async tryIt() {
  const rule = this.editing.rule, box = this.root.querySelector('.rules-past');
  if (!box) return;
  box.innerHTML = `<p class="rules-past-head">${esc(t('looking'))}</p>`;
  const chat = this.chat(), library = chat?.library;
  const since = Date.now() - PAST_DAYS * 86400000;
  const recent = (library?.chats || []).filter(item => (item.updated || item.created || 0) >= since && !item.lock).sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, PAST_CHATS);
  const chats = [];
  for (const item of recent) {
   const body = await library.conversation(item.id).catch(() => null);
   if (body) chats.push({ title: item.title || t('untitled'), at: item.updated, cwd: library.cwdOf(item), messages: body.messages });
  }
  const found = Rules.past(rule, chats, (cwd, shown) => AgentTools.place(cwd, shown) || shown);
  const day = at => at ? new Date(at).toLocaleString(I18n.lang || undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  box.innerHTML = found.length
   ? `<p class="rules-past-head">${esc(t('wouldHave', { count: found.length }))}</p><ul>${found.slice(0, PAST_SHOWN).map(item => `<li><time>${esc(day(item.at))}</time><span><code>${esc(String(item.what).slice(0, 90))}</code> · ${esc(item.chat)}</span></li>`).join('')}</ul>`
   : `<p class="rules-past-head">${esc(t('never', { days: PAST_DAYS }))}</p>`;
  if (!reducedMotion()) box.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE });
 }

 // --- Saving --------------------------------------------------------------------------------------------------------

 async keep() {
  const rule = this.editing.rule;
  rule.name = (this.root.querySelector('.rules-name')?.value || '').trim() || rule.name || t('untitled');
  const list = this.listNow(), at = list.findIndex(item => item.id === this.editing.id);
  if (at >= 0) list[at] = { ...rule, id: this.editing.id };
  else list.push({ ...rule, id: this.editing.id || Rules.uid(), on: true });
  this.quiet = true;
  await this.saveList(list);
  this.quiet = false;
  this.close(this.editing.id);
 }

 async remove() {
  const button = this.root.querySelector('[data-action="delete"]');
  if (button && !button.classList.contains('is-sure')) {
   button.classList.add('is-sure');
   button.innerHTML = L(t('deleteSure'));
   clearTimeout(this.sureTimer);
   this.sureTimer = setTimeout(() => { if (button.isConnected) { button.classList.remove('is-sure'); button.innerHTML = L(t('delete')); } }, 4000);
   return;
  }
  await this.saveList(this.listNow().filter(item => item.id !== this.editing.id));
  this.close(null);
 }

 // Back to the wall: the sheet folds into its tile.
 async close(id) {
  const sheet = this.root.querySelector('.rules-editor');
  const box = sheet?.getBoundingClientRect();
  this.wall({ from: id || '', enter: false });
  const tile = id && this.grid.querySelector(`[data-rule="${CSS.escape(id)}"]`);
  if (!tile || !box || reducedMotion()) return;
  // The tile it went back into settles from a little larger, and keeps a light a moment: that is where the rule is.
  tile.animate([{ transform: 'scale(1.08)', opacity: 0, filter: 'blur(6px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], { duration: 460, easing: SPRING });
  tile.animate([{ boxShadow: '0 0 0 0 rgba(255,255,255,0)' }, { boxShadow: '0 0 0 3px rgba(255,255,255,0.55)' }, { boxShadow: '0 0 0 0 rgba(255,255,255,0)' }], { duration: 1100, delay: 200, easing: 'ease-out' });
 }

 // --- Events --------------------------------------------------------------------------------------------------------

 onClick(event) {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const tile = event.target.closest('.rules-tile[data-rule]');
  if (action === 'toggle' && tile) { event.stopPropagation(); return this.toggle(tile.dataset.rule); }
  if (action === 'new') return this.edit({ id: Rules.uid(), on: true, name: '', event: 'PreToolUse', matcher: 'Bash|PowerShell', if: [], then: [{ type: 'ask' }] }, { draft: true, origin: event.target.closest('.rules-tile') });
  if (tile && !action) { const rule = this.listNow().find(item => item.id === tile.dataset.rule); if (rule) return this.edit(rule); }
  const scope = event.target.closest('.rules-seg-tab[data-scope]');
  if (scope && scope.dataset.scope !== this.scope) {
   this.scope = scope.dataset.scope;
   if (this.scope === 'project') { this.projectData = null; this.loadProject(this.projectOf()); }
   const seg = this.root.querySelector('.rules-seg.is-scope');
   for (const tab of seg.querySelectorAll('.rules-seg-tab')) tab.setAttribute('aria-selected', String(tab === scope));
   this.segment(seg, this.scope);
   return setTimeout(() => this.wall(), 160);
  }
  if (action === 'trust' && this.projectData?.cwd) return Rules.trust(this.projectData.cwd).then(got => { this.projectData = { cwd: this.projectData.cwd, rules: got.rules, trusted: got.trusted, file: got.file }; this.wall({ status: t('trusted'), enter: false }); });
  // The arrow in an open rule changes it; the arrow on the wall makes a new one.
  if (action === 'revise') return this.revise();
  if (event.target.closest('.rules-send')) return this.ask();
  if (action === 'claude') return this.fromClaude();
  if (action === 'folder') return (this.scope === 'project' && this.projectData?.file ? Promise.resolve(this.projectData.file) : window.openghost?.rules?.file()).then(file => file && window.openghost.revealFolder(file.replace(/[\\/][^\\/]+$/, '')));
  if (action === 'back') return this.editing?.draft ? this.close(null) : this.keep();
  if (action === 'done' || action === 'turnOn') return this.keep();
  if (action === 'discard') return this.close(null);
  if (action === 'delete') return this.remove();
  if (action === 'add') return this.pickStep(event.target.closest('[data-action]'));
  if (event.target.closest('.rules-lib')) return;
  if (action === 'adapt') return this.adapt();
  if (action === 'model') return this.pickModel(event.target.closest('[data-action]'));
  if (action === 'try') return this.tryIt();
  if (action === 'remove') {
   const block = event.target.closest('.rules-block'), k = Number(block.dataset.index);
   const list = block.dataset.kind === 'cond' ? this.editing.rule.if : this.editing.rule.then;
   const done = () => { list.splice(k, 1); this.redraw(); };
   if (reducedMotion()) return done();
   block.animate([{ height: `${block.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0, filter: 'blur(6px)', paddingTop: '0px', paddingBottom: '0px' }], { duration: 300, easing: EASE }).finished.then(done, done);
   return;
  }
  const token = event.target.closest('button.rules-tok');
  if (token) return this.pickToken(token);
 }

 onInput(event) {
  const el = event.target;
  if (el === this.input) return this.sizeAsk();
  if (el.classList.contains('rules-revise-input')) { el.style.height = 'auto'; el.style.height = `${Math.min(140, el.scrollHeight)}px`; el.closest('.rules-ask')?.classList.toggle('is-filled', !!el.value.trim()); return; }
  if (!this.editing) return;
  if (el.classList.contains('rules-name')) { this.editing.rule.name = el.value; return; }
  const part = el.dataset.part, k = Number(el.dataset.index);
  if (!part) return;
  if (el.classList.contains('rules-tok')) el.size = Math.max(4, el.value.length + 1);
  if (el.classList.contains('rules-code')) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  const rule = this.editing.rule;
  if (part === 'value' && rule.if[k]) rule.if[k].value = el.value;
  else if (part === 'ccIf') rule.ccIf = el.value;
  else if (part === 'matcher') rule.matcher = el.value;
  else if (rule.then[k]) rule.then[k][part] = el.value;
  const on = this.root.querySelector('[data-action="turnOn"]');
  if (on) on.disabled = !!Rules.problems(rule).length;
 }

 onKey(event) {
  if (event.target === this.input && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); this.ask(); }
  if (event.target.classList?.contains('rules-revise-input') && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); this.revise(); }
  if (event.key === 'Enter' && event.target.closest?.('.rules-tile[data-rule]') && !event.target.closest('button')) event.target.click();
 }
}

// The glyphs, for a check of how each sits in its field.
RulesSettings.glyphs = G;
window.RulesSettings = RulesSettings;
})();
