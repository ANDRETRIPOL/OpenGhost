(() => {
'use strict';

// Rules: what the app does at moments of the agent's work, whatever the model thinks — before a step (block it, ask
// the user, let it go without asking, change it), after it, when the user sends a message, when the agent wants to
// finish (keep it going until a check passes), when it waits for the user, and so on. The model does not hold them:
// the app does, so a rule holds every time.
//
// The moments and what a handler may answer at each are those of Claude Code's hooks (code.claude.com/docs/en/hooks),
// named as there, and a hook written for Claude Code runs here as it is: its command gets the same JSON on standard
// input (the tool named as Claude Code names it: Bash, Edit, Write, WebFetch…), and its exit code and its JSON answer
// mean what they mean there. A rule of the app's own is a chain of blocks: a moment, what it is about (conditions),
// and what then happens (actions) — some done by the app itself (ask, block, allow, a note for the agent, a check, a
// notification, the journal), others by a handler (a command, an address on the web, or a question to the model).
//
// The page side (this file): the rules as they stand, which ones a moment calls, running them and putting their answers
// together. The files and the handlers' processes are the main process's (desktop/rules.js).

// The moments. `matcher`: what a rule's matcher is read against (Claude Code's own matcher field for that event).
const EVENTS = {
 SessionStart: { matcher: 'source' },
 UserPromptSubmit: {},
 PreToolUse: { matcher: 'tool' },
 PermissionRequest: { matcher: 'tool' },
 PostToolUse: { matcher: 'tool' },
 PostToolUseFailure: { matcher: 'tool' },
 PostToolBatch: {},
 Notification: { matcher: 'notification_type' },
 SubagentStart: { matcher: 'agent_type' },
 SubagentStop: { matcher: 'agent_type' },
 TaskCreated: {},
 TaskCompleted: {},
 Stop: {},
 StopFailure: { matcher: 'error' },
 PreCompact: { matcher: 'trigger' },
 PostCompact: { matcher: 'trigger' },
 PostModelSwitch: { matcher: 'to_model' },
};
// Claude Code's moments the app has no counterpart for: such a hook is brought over only by adapting it.
const FOREIGN_EVENTS = ['Setup', 'UserPromptExpansion', 'PermissionDenied', 'MessageDisplay', 'TeammateIdle', 'InstructionsLoaded', 'ConfigChange', 'CwdChanged', 'DirectoryAdded', 'FileChanged', 'WorktreeCreate', 'WorktreeRemove', 'Elicitation', 'ElicitationResult', 'SessionEnd', 'PreModelSwitch'];
const HANDLERS = new Set(['command', 'http', 'prompt']);
const NATIVE = new Set(['allow', 'deny', 'ask', 'context', 'check', 'keepGoing', 'notify', 'log', 'stop']);
// What each moment can be made to do by a rule's own actions.
const CAN = {
 PreToolUse: ['deny', 'ask', 'allow', 'context', 'check', 'notify', 'log', 'stop'],
 PermissionRequest: ['allow', 'deny', 'notify', 'log'],
 PostToolUse: ['context', 'check', 'notify', 'log', 'stop'],
 PostToolUseFailure: ['context', 'notify', 'log'],
 PostToolBatch: ['context', 'check', 'notify', 'log', 'stop'],
 UserPromptSubmit: ['deny', 'context', 'notify', 'log'],
 SessionStart: ['context', 'notify', 'log'],
 Stop: ['keepGoing', 'check', 'context', 'notify', 'log'],
 SubagentStop: ['keepGoing', 'check', 'notify', 'log'],
 SubagentStart: ['context', 'notify', 'log'],
 TaskCreated: ['deny', 'notify', 'log'],
 TaskCompleted: ['deny', 'check', 'notify', 'log'],
 Notification: ['notify', 'log'],
 StopFailure: ['notify', 'log'],
 PreCompact: ['deny', 'context', 'notify', 'log'],
 PostCompact: ['notify', 'log'],
 PostModelSwitch: ['context', 'notify', 'log'],
};
// A stop sent back this many times in a row is let go, as Claude Code lets it go after 8.
const STOP_CAP = 8;
// What a handler says is cut to this, as Claude Code cuts additionalContext and the like.
const TEXT_MOST = 10000;
// How long a handler may take by default, in seconds: as Claude Code's, shorter where the user waits for it.
const TIMEOUT = { command: 600, http: 600, prompt: 30, quick: 30 };
const QUICK = new Set(['UserPromptSubmit', 'PostModelSwitch']);
const PROJECT_FRESH = 3000;

// --- The app's tools as Claude Code names them ------------------------------------------------------------------

const SHELLS = new Set(['run_powershell', 'run_bash', 'run_zsh']);
const PLACED = { read_file: 'Read', write_file: 'Write', edit_file: 'Edit', pdf_pages: 'Read', video_frames: 'Read' };

// The step as a hook written for Claude Code sees it: { tool_name, tool_input }. A command of git is a Bash command
// ("git push …"), so a hook that guards git in Bash guards it here too; the built-in browser is an MCP server named
// browser (mcp__browser__navigate…).
function asClaude(name, args = {}, place = p => p) {
 const a = args || {};
 if (SHELLS.has(name)) return { tool_name: name === 'run_powershell' ? 'PowerShell' : 'Bash', tool_input: { command: String(a.command || ''), description: String(a.description || ''), ...(a.timeout ? { timeout: Number(a.timeout) * 1000 } : {}) } };
 if (name === 'git') return { tool_name: 'Bash', tool_input: { command: ['git', ...(Array.isArray(a.args) ? a.args : [])].map(part => /\s/.test(part) ? JSON.stringify(part) : part).join(' '), description: String(a.description || '') } };
 if (name === 'read_file') return { tool_name: 'Read', tool_input: { file_path: place(a.path), ...(a.offset ? { offset: a.offset } : {}), ...(a.limit ? { limit: a.limit } : {}) } };
 if (name === 'write_file') return { tool_name: 'Write', tool_input: { file_path: place(a.path), content: String(a.content ?? '') } };
 if (name === 'edit_file') return { tool_name: 'Edit', tool_input: { file_path: place(a.path), old_string: String(a.old_string ?? ''), new_string: String(a.new_string ?? ''), replace_all: !!a.replace_all } };
 if (name === 'list_files') return { tool_name: 'Glob', tool_input: { pattern: '**/*', path: place(a.path || '.') } };
 if (name === 'web_search') return { tool_name: 'WebSearch', tool_input: { query: String(a.query || '') } };
 if (name === 'fetch_url') return { tool_name: 'WebFetch', tool_input: { url: String(a.url || ''), prompt: '' } };
 if (name === 'ask_user') return { tool_name: 'AskUserQuestion', tool_input: { questions: a.questions || [] } };
 if (name === 'helper') return { tool_name: 'Agent', tool_input: { prompt: String(a.task || a.prompt || ''), description: String(a.name || a.description || ''), subagent_type: String(a.kind || 'general-purpose') } };
 if (name.startsWith('browser_')) return { tool_name: `mcp__browser__${name.slice(8)}`, tool_input: { ...a } };
 if (PLACED[name]) return { tool_name: PLACED[name], tool_input: { ...a, file_path: place(a.path) } };
 return { tool_name: name, tool_input: { ...a } };
}

// Back from Claude Code's shape to the app's own arguments, for a hook that rewrote a step (updatedInput).
function fromClaude(name, input, args) {
 if (!input || typeof input !== 'object') return args;
 if (SHELLS.has(name)) return { ...args, command: String(input.command ?? args.command ?? '') };
 if (name === 'git') {
  const words = String(input.command || '').trim().match(/"[^"]*"|\S+/g) || [];
  if (words[0] !== 'git') return args;
  return { ...args, args: words.slice(1).map(word => word.replace(/^"(.*)"$/, '$1')) };
 }
 if (name === 'write_file') return { ...args, ...(input.file_path ? { path: input.file_path } : {}), ...(input.content !== undefined ? { content: input.content } : {}) };
 if (name === 'edit_file') return { ...args, ...(input.file_path ? { path: input.file_path } : {}), ...(input.old_string !== undefined ? { old_string: input.old_string } : {}), ...(input.new_string !== undefined ? { new_string: input.new_string } : {}), ...(input.replace_all !== undefined ? { replace_all: input.replace_all } : {}) };
 if (name === 'read_file') return { ...args, ...(input.file_path ? { path: input.file_path } : {}) };
 if (name === 'web_search') return { ...args, ...(input.query ? { query: input.query } : {}) };
 if (name === 'fetch_url') return { ...args, ...(input.url ? { url: input.url } : {}) };
 if (name.startsWith('browser_')) return { ...args, ...input };
 return { ...args, ...input };
}

// --- Matching ----------------------------------------------------------------------------------------------------

// A matcher as Claude Code reads one: empty or * for all; letters, digits, _, -, spaces, commas and | as exact names (a
// list); anything else a regular expression, not anchored.
function matches(matcher, values) {
 const m = String(matcher ?? '').trim();
 if (!m || m === '*') return true;
 const list = values.filter(value => value !== undefined && value !== null).map(String);
 if (/^[A-Za-z0-9_\- ,|]+$/.test(m)) {
  const names = m.split(/[|,]/).map(part => part.trim()).filter(Boolean);
  return list.some(value => names.includes(value));
 }
 try { const re = new RegExp(m); return list.some(value => re.test(value)); } catch { return false; }
}

const globRe = (pattern, whole = true) => new RegExp(`${whole ? '^' : ''}${String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^]*').replace(/\u0000/g, '[^]*').replace(/\?/g, '.')}${whole ? '$' : ''}`, 'i');
const slashes = text => String(text || '').replace(/\\/g, '/');
// The parts of a shell command, each checked on its own: `cd x && git push` is a git push.
const parts = command => String(command || '').split(/&&|\|\||;|\||\n/).map(part => part.trim().replace(/^([A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '')).filter(Boolean);

// Claude Code's `if` on a handler: one permission rule, `Tool(pattern)` or `Tool`. The pattern is a glob over the
// command (each part of it), the file's path, or for the web `domain:example.com`.
function permitted(rule, facts) {
 const m = String(rule || '').trim().match(/^([A-Za-z_][\w]*)(?:\((.*)\))?$/);
 if (!m) return false;
 const [, tool, pattern] = m;
 if (tool !== facts.tool_name && tool !== facts.tool) return false;
 if (pattern === undefined || pattern === '' || pattern === '*') return true;
 if (facts.command !== undefined && /^(Bash|PowerShell)$/.test(facts.tool_name)) return parts(facts.command).some(part => globRe(pattern).test(part)) || globRe(pattern).test(facts.command);
 if (facts.path) {
  const full = slashes(facts.path), p = slashes(pattern);
  return globRe(p).test(full) || globRe(`**/${p.replace(/^\.?\//, '')}`).test(full) || globRe(p).test(full.split('/').pop());
 }
 if (facts.url) {
  if (pattern.startsWith('domain:')) return globRe(pattern.slice(7)).test(facts.site || '');
  return globRe(pattern).test(facts.url);
 }
 return globRe(pattern).test(JSON.stringify(facts.tool_input || ''));
}

// A condition of a rule of the app's own: one fact, a way to compare, a value.
const folderOf = text => slashes(text).replace(/\/+$/, '').toLowerCase();
// A name standing in a command as a part of a path: between slashes, quotes, spaces or brackets.
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namedIn = (command, name) => new RegExp(`(^|[\\\\/'"\`\\s(])${escapeRe(name)}([\\\\/'"\`\\s;|)]|$)`, 'i').test(String(command || ''));
const OPS = {
 inFolder: (a, b) => { const path = folderOf(a), folder = folderOf(b); return !!folder && (path === folder || path.startsWith(`${folder}/`)); },
 is: (a, b) => a.toLowerCase() === b.toLowerCase(),
 isNot: (a, b) => a.toLowerCase() !== b.toLowerCase(),
 contains: (a, b) => a.toLowerCase().includes(b.toLowerCase()),
 notContains: (a, b) => !a.toLowerCase().includes(b.toLowerCase()),
 startsWith: (a, b) => a.toLowerCase().startsWith(b.toLowerCase()),
 endsWith: (a, b) => a.toLowerCase().endsWith(b.toLowerCase()),
 matches: (a, b) => globRe(b).test(a) || globRe(b, false).test(a),
 regex: (a, b) => { try { return new RegExp(b, 'i').test(a); } catch { return false; } },
 isOn: a => a === 'true',
};

function holds(condition, facts) {
 const op = OPS[condition?.op];
 if (!op) return false;
 const raw = facts[condition.field];
 const value = typeof raw === 'boolean' ? String(raw) : raw === undefined || raw === null ? '' : String(raw);
 const want = String(condition.value ?? '');
 // A command is checked part by part too: "starts with git push" holds for `cd site && git push`.
 if (condition.field === 'command' && (condition.op === 'startsWith' || condition.op === 'is')) return op(value, want) || parts(value).some(part => op(part, want));
 if (condition.field === 'path') {
  const places = facts.paths?.length ? facts.paths : [value];
  // A command may build a path the text never spells out (Join-Path $HOME 'Desktop\DS', cd into it step by step):
  // one that names the folder as a part of a path is taken as going there. For a rule that keeps the agent out, being
  // wary is right: another folder of the same name is held too.
  if (condition.op === 'inFolder' && facts.command && places.every(place => !op(place, want))) {
   const name = folderOf(want).split('/').pop();
   if (name && name.length > 1 && namedIn(facts.command, name)) return true;
  }
  if (condition.op === 'isNot' || condition.op === 'notContains') return places.every(place => op(place, want) && op(slashes(place), slashes(want)));
  return places.some(place => op(place, want) || op(slashes(place), slashes(want)) || (condition.op !== 'inFolder' && op(slashes(place).split('/').pop(), want)));
 }
 return op(value, want);
}

// Whether a rule is called at a moment: its moment, its matcher, its `if`, every one of its conditions.
function applies(rule, event, facts) {
 if (!rule || rule.on === false || rule.event !== event) return false;
 const spec = EVENTS[event];
 if (!spec) return false;
 if (spec.matcher && rule.matcher) {
  const values = spec.matcher === 'tool' ? [facts.tool_name, facts.tool] : [facts[spec.matcher]];
  if (!matches(rule.matcher, values)) return false;
 }
 if (rule.ccIf && !permitted(rule.ccIf, facts)) return false;
 return (rule.if || []).every(condition => holds(condition, facts));
}

// --- What a handler answered -------------------------------------------------------------------------------------

const cut = text => { const s = String(text ?? ''); return s.length > TEXT_MOST ? `${s.slice(0, TEXT_MOST)}\n[… cut at ${TEXT_MOST} characters]` : s; };
const blank = () => ({ decision: null, reason: '', block: false, blockReason: '', context: [], shown: [], stop: false, stopReason: '', input: null, output: null, instructions: '', failed: [] });

// One JSON object and nothing else on standard output, or nothing.
function json(text) {
 const s = String(text || '').trim();
 if (!s.startsWith('{') || !s.endsWith('}')) return null;
 try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return undefined; }
}

// A blocking answer means at each moment what it means in Claude Code.
function blocking(event, out, reason) {
 const why = cut(reason).trim();
 if (event === 'PreToolUse') { out.decision = 'deny'; out.reason = why; }
 else if (event === 'PermissionRequest') {}
 else if (event === 'PostToolUse' || event === 'PostToolUseFailure') { if (why) out.context.push(why); }
 else if (event === 'PostToolBatch') { out.stop = true; out.stopReason = why; }
 else if (['UserPromptSubmit', 'Stop', 'SubagentStop', 'TaskCreated', 'TaskCompleted', 'PreCompact'].includes(event)) { out.block = true; out.blockReason = why; }
}

// A command's or an address's answer (exit code, standard output and error) → what it decides.
function readAnswer(event, result, handler = {}) {
 const out = blank();
 const failed = why => {
  if (handler.onFailure === 'block') { blocking(event, out, why); if (event === 'PermissionRequest') out.decision = 'deny'; }
  else out.failed.push(why);
  return out;
 };
 if (!result || result.error && result.code === null && !result.timedOut) return failed(result?.error || 'it did not run');
 if (result.timedOut) return failed('it ran out of time');
 const code = result.code, parsed = json(result.stdout);
 if (code === 2) {
  blocking(event, out, result.stderr || result.stdout || 'blocked');
  if (parsed) {
   if (parsed.continue === false && (event === 'Stop' || event === 'SubagentStop')) { out.block = false; out.stop = true; out.stopReason = cut(parsed.stopReason || ''); }
   if (parsed.systemMessage) out.shown.push(cut(parsed.systemMessage));
  }
  return out;
 }
 if (code !== 0) return failed(`it ended with code ${code}${result.stderr ? `: ${String(result.stderr).trim().slice(0, 400)}` : ''}`);
 if (parsed === undefined) return failed('its answer looked like JSON but could not be read');
 if (!parsed) {
  const text = String(result.stdout || '').trim();
  if (text && ['UserPromptSubmit', 'SessionStart', 'PostModelSwitch'].includes(event)) out.context.push(cut(text));
  if (text && event === 'PreCompact') out.instructions = cut(text);
  return out;
 }
 const own = parsed.hookSpecificOutput && typeof parsed.hookSpecificOutput === 'object' ? parsed.hookSpecificOutput : {};
 if (parsed.continue === false) { out.stop = true; out.stopReason = cut(parsed.stopReason || ''); }
 if (parsed.systemMessage) out.shown.push(cut(parsed.systemMessage));
 if (own.additionalContext) out.context.push(cut(own.additionalContext));
 if (event === 'PreToolUse') {
  const legacy = { approve: 'allow', block: 'deny' }[parsed.decision];
  const decision = own.permissionDecision || legacy;
  if (['allow', 'deny', 'ask'].includes(decision)) { out.decision = decision; out.reason = cut(own.permissionDecisionReason || parsed.reason || ''); }
  if (own.updatedInput && typeof own.updatedInput === 'object' && decision !== 'deny') out.input = own.updatedInput;
 } else if (event === 'PermissionRequest') {
  const d = own.decision || {};
  if (d.behavior === 'allow') { out.decision = 'allow'; if (d.updatedInput && typeof d.updatedInput === 'object') out.input = d.updatedInput; }
  if (d.behavior === 'deny') { out.decision = 'deny'; out.reason = cut(d.message || ''); if (d.interrupt) out.stop = true; }
 } else if (event === 'PostToolUse') {
  if (parsed.decision === 'block') out.context.push(cut(parsed.reason || ''));
  if (own.updatedToolOutput !== undefined) out.output = own.updatedToolOutput;
 } else if (parsed.decision === 'block') blocking(event, out, parsed.reason || '');
 if (event === 'UserPromptSubmit' && !own.additionalContext && parsed.additionalContext) out.context.push(cut(parsed.additionalContext));
 return out;
}

// A question to the model (a prompt handler): its { ok, reason } as Claude Code reads it.
function readVerdict(event, text, handler = {}) {
 const out = blank();
 const m = String(text || '').match(/\{[\s\S]*\}/);
 let v = null;
 try { v = m ? JSON.parse(m[0]) : null; } catch {}
 if (!v || typeof v.ok !== 'boolean') { out.failed.push('the model gave no answer that can be read'); return out; }
 if (v.ok) return out;
 const why = cut(v.reason || 'the rule says no');
 if (event === 'Stop' || event === 'SubagentStop') { if (!v.impossible) { out.block = true; out.blockReason = why; } }
 else if (event === 'PreToolUse') { out.decision = 'deny'; out.reason = why; if (!handler.continueOnBlock) { out.stop = true; out.stopReason = why; } }
 else if (event === 'PostToolUse') { if (handler.continueOnBlock) out.context.push(why); else { out.stop = true; out.stopReason = why; } }
 else if (event === 'PostToolUseFailure' || event === 'TaskCreated' || event === 'TaskCompleted') { out.block = true; out.blockReason = why; }
 else if (event === 'PostToolBatch' || event === 'UserPromptSubmit') { out.stop = true; out.stopReason = why; if (event === 'UserPromptSubmit') { out.block = true; out.blockReason = why; } }
 return out;
}

// Several answers to one moment, one outcome: deny over ask over allow, every note kept.
function merge(results) {
 const out = blank();
 const rank = { deny: 3, ask: 2, allow: 1 };
 for (const r of results) {
  if (r.decision && (rank[r.decision] || 0) > (rank[out.decision] || 0)) { out.decision = r.decision; out.reason = r.reason; }
  if (r.block && !out.block) { out.block = true; out.blockReason = r.blockReason; }
  if (r.stop && !out.stop) { out.stop = true; out.stopReason = r.stopReason; }
  if (r.input && !out.input) out.input = r.input;
  if (r.output !== null && r.output !== undefined && out.output === null) out.output = r.output;
  if (r.instructions) out.instructions = [out.instructions, r.instructions].filter(Boolean).join('\n\n');
  out.context.push(...r.context.filter(Boolean));
  out.shown.push(...r.shown.filter(Boolean));
  out.failed.push(...r.failed);
 }
 if (out.decision === 'deny') out.input = null;
 return out;
}

// --- Rules of the app's own, and those brought from Claude Code ---------------------------------------------------

const uid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Claude Code's hooks (the `hooks` of its settings) as rules here: one rule for each handler, as it stands there.
function importClaude(hooks, from = {}) {
 const rules = [];
 for (const [event, groups] of Object.entries(hooks || {})) {
  if (!Array.isArray(groups)) continue;
  for (const group of groups) {
   for (const handler of Array.isArray(group?.hooks) ? group.hooks : []) {
    if (!handler || typeof handler !== 'object') continue;
    const { if: ccIf, statusMessage, once, ...rest } = handler;
    // Named by what it runs: its script's file, the address's site, the MCP tool, or the start of its words.
    const script = String(handler.command || '').match(/([\w.-]+\.(?:sh|ps1|py|js|mjs|cjs|ts|rb|bat|cmd))\b/i)?.[1];
    const what = handler.type === 'command' ? (script || String(handler.command || '').replace(/\s+/g, ' ').trim().slice(0, 32))
     : handler.type === 'http' ? String(handler.url || '').replace(/^https?:\/\//, '').split('/')[0]
     : handler.type === 'mcp_tool' ? [handler.server, handler.tool].filter(Boolean).join(' · ')
     : String(handler.prompt || '').replace(/\$ARGUMENTS/g, '').replace(/\s+/g, ' ').trim().slice(0, 32) || handler.type;
    rules.push({
     id: uid(), on: true, event,
     name: what || event,
     ...(group.matcher ? { matcher: String(group.matcher) } : {}),
     ...(ccIf ? { ccIf: String(ccIf) } : {}),
     if: [], then: [rest],
     from: { kind: 'claude-code', ...(from.file ? { file: from.file } : {}), ...(from.scope ? { scope: from.scope } : {}) },
    });
   }
  }
 }
 return rules;
}

// Text pasted in: Claude Code's settings (with "hooks"), the hooks alone ({ "PreToolUse": [...] }), or rules of this app.
function readPasted(text) {
 let data;
 try { data = JSON.parse(String(text || '').trim()); } catch { return null; }
 if (!data || typeof data !== 'object') return null;
 if (Array.isArray(data.rules)) return { kind: 'rules', rules: data.rules.map(rule => ({ ...rule, id: uid() })) };
 if (Array.isArray(data)) return data.every(item => item?.event) ? { kind: 'rules', rules: data.map(rule => ({ ...rule, id: uid() })) } : null;
 const hooks = data.hooks && typeof data.hooks === 'object' ? data.hooks : data;
 if (Object.keys(hooks).some(key => EVENTS[key] || FOREIGN_EVENTS.includes(key))) return { kind: 'claude-code', rules: importClaude(hooks, { scope: 'pasted' }) };
 if (data.event) return { kind: 'rules', rules: [{ ...data, id: uid() }] };
 return null;
}

// What keeps a rule from running here as it is: [] when nothing does. Each line says what, for the user and for the
// model that adapts it.
// What keeps a rule from running here as it is, each as { code, text, ...what it is about }: the text in English for
// the model that adapts it, the code for the page to say it in the user's language. [] when nothing does.
function issues(rule) {
 const out = [];
 const add = (code, text, extra = {}) => out.push({ code, text, ...extra });
 if (!rule || typeof rule !== 'object') { add('notRule', 'It is not a rule'); return out; }
 if (FOREIGN_EVENTS.includes(rule.event)) add('foreignEvent', `The moment ${rule.event} does not happen in OpenGhost`, { event: rule.event });
 else if (!EVENTS[rule.event]) add('unknownEvent', `The moment ${rule.event || '(none)'} is unknown`, { event: rule.event || '' });
 const then = Array.isArray(rule.then) ? rule.then : [];
 if (!then.length) add('noAction', 'It does nothing: it has no action');
 for (const action of then) {
  const type = action?.type;
  if (type === 'mcp_tool') add('mcp', 'It calls a tool of an MCP server, and OpenGhost has no MCP servers');
  else if (type === 'agent') add('agent', 'It starts a helper with tools to judge, which OpenGhost does not do in a rule');
  else if (!HANDLERS.has(type) && !NATIVE.has(type)) add('unknownAction', `The action ${type || '(none)'} is unknown`, { type: type || '' });
  else if (NATIVE.has(type) && EVENTS[rule.event] && !(CAN[rule.event] || []).includes(type)) add('cannot', `At ${rule.event} a rule cannot ${type}`, { event: rule.event, type });
  if (type === 'command' && !action.command) add('emptyCommand', 'Its command is empty');
  if (type === 'http' && !/^https?:\/\//i.test(String(action.url || ''))) add('badUrl', 'Its address is not one of the web');
  if (type === 'prompt' && !String(action.prompt || '').trim()) add('emptyPrompt', 'Its question to the model is empty');
  if (type === 'check' && !String(action.command || '').trim()) add('emptyCheck', 'Its check has no command');
 }
 for (const condition of rule.if || []) {
  if (!OPS[condition?.op]) add('unknownOp', `The comparison ${condition?.op || '(none)'} is unknown`, { op: condition?.op || '' });
  else if (condition.op === 'regex') { try { new RegExp(condition.value); } catch { add('badRegex', `The pattern ${condition.value} is not a JavaScript regular expression`, { value: condition.value }); } }
 }
 if (rule.matcher) { const m = String(rule.matcher); if (!/^[A-Za-z0-9_\- ,|*]*$/.test(m)) { try { new RegExp(m); } catch { add('badMatcher', `Its matcher ${m} cannot be read`, { value: m }); } } }
 return out;
}
const problems = rule => issues(rule).map(item => item.text);

// --- The facts of a moment ----------------------------------------------------------------------------------------

// Facts of a step for conditions and matchers: the tool both ways, and what it is about (command, path, address...).
// The places a step touches, as full paths: the file it reads or writes, the folder it lists, and for a command the
// folder it runs in and every full path written in it. A rule on a folder holds whatever tool the agent takes there.
const PATHS = /"((?:[A-Za-z]:|\\\\|~)[\\/][^"]*)"|'((?:[A-Za-z]:|\\\\|~)[\\/][^']*)'|((?:[A-Za-z]:|\\\\|~)[\\/][^\s"'`|;&<>]*)/g;
function pathsIn(command, place) {
 const out = [];
 for (const m of String(command || '').matchAll(PATHS)) out.push(place(m[1] || m[2] || m[3]));
 return out;
}

function stepFacts(name, args, { place = p => p, element = '', risky = false, cwd = '' } = {}) {
 const claude = asClaude(name, args, place), input = claude.tool_input;
 const facts = { tool: name, tool_name: claude.tool_name, tool_input: input };
 if (input.command !== undefined && /^(Bash|PowerShell)$/.test(claude.tool_name)) facts.command = input.command;
 if (input.file_path) facts.path = input.file_path;
 const paths = [];
 if (input.file_path) paths.push(input.file_path);
 if (claude.tool_name === 'Glob' && input.path) paths.push(input.path);
 if (facts.command !== undefined) { if (cwd) paths.push(cwd); paths.push(...pathsIn(facts.command, place)); }
 if (name.startsWith('browser_') && (args?.path || args?.save_to)) paths.push(place(args.path || args.save_to));
 if (args?.save_to && !name.startsWith('browser_')) paths.push(place(args.save_to));
 facts.paths = [...new Set(paths.filter(Boolean).map(String))];
 if (!facts.path && facts.paths.length) facts.path = facts.paths[0];
 const url = input.url || (name === 'browser_navigate' || name === 'browser_tabs' ? args?.url : '');
 if (url) { facts.url = String(url); try { facts.site = new URL(/^[a-z]+:/i.test(facts.url) ? facts.url : `https://${facts.url}`).host.replace(/^www\./, ''); } catch { facts.site = ''; } }
 if (input.query) facts.query = String(input.query);
 if (input.content !== undefined) facts.content = String(input.content);
 if (input.new_string !== undefined) facts.content = String(input.new_string);
 if (element) facts.element = element;
 facts.risky = !!risky;
 return facts;
}

// --- Running ------------------------------------------------------------------------------------------------------

const bridge = () => window.openghost?.rules || null;
const state = { user: [], loaded: null, projects: new Map(), listeners: new Set() };

function load() {
 const b = bridge();
 if (!b) { state.loaded = Promise.resolve(); return state.loaded; }
 state.loaded = b.read().then(data => { state.user = (data?.rules || []).map(rule => ({ ...rule, scope: 'user' })); state.error = data?.error || ''; state.file = data?.file || ''; for (const fn of state.listeners) fn(); }).catch(() => {});
 return state.loaded;
}

// A project's rules, as its file holds them, and whether the user has trusted that file as it is now.
async function project(cwd, fresh = false) {
 const b = bridge();
 if (!b || !cwd) return { rules: [], trusted: true, file: '' };
 const kept = state.projects.get(cwd);
 if (!fresh && kept && Date.now() - kept.at < PROJECT_FRESH) return kept;
 const data = await b.project(cwd).catch(() => null);
 const got = { at: Date.now(), file: data?.file || '', trusted: !!data?.trusted, rules: (data?.rules || []).map(rule => ({ ...rule, scope: 'project' })) };
 state.projects.set(cwd, got);
 return got;
}

// Only a trusted project's rules run: an untrusted one's are held back until the user trusts them (settings-rules.js).
async function projectRules(cwd) {
 const got = await project(cwd);
 return got.trusted ? got.rules : [];
}

async function untrusted(cwd) {
 const got = await project(cwd);
 return !got.trusted && got.rules.length ? got : null;
}

async function trust(cwd) {
 await bridge()?.trust(cwd);
 state.projects.delete(cwd);
 for (const fn of state.listeners) fn();
 return project(cwd, true);
}

async function saveProject(cwd, rules) {
 await bridge()?.writeProject(cwd, rules.map(({ scope, ...rule }) => rule));
 state.projects.delete(cwd);
 for (const fn of state.listeners) fn();
 return project(cwd, true);
}

async function all(cwd) {
 if (!state.loaded) load();
 await state.loaded;
 return [...state.user, ...(await projectRules(cwd))];
}

// Whether any rule waits for a moment: a moment nobody watches costs nothing more.
async function watched(event, cwd) {
 return (await all(cwd)).some(rule => rule.on !== false && rule.event === event);
}

// The JSON a handler gets: Claude Code's common fields and the moment's own.
function inputOf(event, facts, ctx) {
 const mode = { ask: 'default', auto: 'acceptEdits', full: 'bypassPermissions' }[ctx.mode] || 'default';
 const base = { session_id: String(ctx.chat || ''), transcript_path: '', cwd: ctx.cwd || '', permission_mode: mode, hook_event_name: event, ...(ctx.effort ? { effort: { level: ctx.effort } } : {}), ...(ctx.agent ? { agent_id: ctx.agent.id, agent_type: ctx.agent.type } : {}) };
 const own = { ...(facts.extra || {}) };
 if (EVENTS[event]?.matcher === 'tool') { own.tool_name = facts.tool_name; own.tool_input = facts.tool_input; if (facts.tool_use_id) own.tool_use_id = facts.tool_use_id; }
 return { ...base, ...own, openghost: { tool: facts.tool || undefined, chat: ctx.chat || undefined, folder: ctx.cwd || undefined } };
}

let seq = 0;

// One action of a rule at a moment → its answer.
async function act(rule, action, event, facts, ctx) {
 const out = blank();
 const type = action?.type;
 // A text may name what the moment is about: {command}, {path}, ${tool_input.file_path}...
 const pick = key => key.split('.').reduce((at, part) => at?.[part], { ...facts, ...(facts.extra || {}) });
 const say = text => String(text || '').replace(/\$?\{([\w.]+)\}/g, (all, key) => { const value = pick(key); return value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); });
 if (type === 'allow') out.decision = 'allow';
 else if (type === 'deny') { if (event === 'PreToolUse' || event === 'PermissionRequest') { out.decision = 'deny'; out.reason = say(action.reason) || `The rule “${rule.name}” does not allow this`; } else { out.block = true; out.blockReason = say(action.reason) || `The rule “${rule.name}” does not allow this`; } }
 else if (type === 'ask') { out.decision = 'ask'; out.reason = say(action.reason); }
 else if (type === 'context') out.context.push(say(action.text));
 else if (type === 'keepGoing') { out.block = true; out.blockReason = say(action.reason) || `Not done yet, by the rule “${rule.name}”.`; }
 else if (type === 'stop') { out.stop = true; out.stopReason = say(action.reason) || `Stopped by the rule “${rule.name}”`; }
 else if (type === 'notify') ctx.notify?.(rule, say(action.text) || rule.name);
 else if (type === 'log') ctx.log?.({ rule: rule.name, id: rule.id, decision: 'log', event, tool: facts.tool, command: facts.command, path: facts.path, url: facts.url, chat: ctx.chat });
 else if (type === 'check') {
  const result = await bridge()?.run(`rule-${++seq}`, { type: 'command', command: action.command, shell: action.shell, timeout: action.timeout || TIMEOUT.command }, inputOf(event, facts, ctx), { cwd: ctx.cwd }).catch(error => ({ code: null, error: error.message }));
  if (result && result.code !== 0) {
   const said = [result.stdout, result.stderr].filter(Boolean).join('\n').trim().split('\n').slice(-40).join('\n');
   const why = `The check \`${action.command}\` of the rule “${rule.name}” failed${result.timedOut ? ' (out of time)' : result.code !== null ? ` (exit code ${result.code})` : `: ${result.error || ''}`}.${said ? `\n${cut(said)}` : ''}`;
   if (event === 'PreToolUse') { out.decision = 'deny'; out.reason = why; }
   else if (event === 'Stop' || event === 'SubagentStop' || event === 'TaskCompleted') { out.block = true; out.blockReason = `${why}\nFix it, and finish only when it passes.`; }
   else if (event === 'PostToolBatch' && action.halt) { out.stop = true; out.stopReason = why; }
   else out.context.push(why);
  }
 }
 else if (type === 'command' || type === 'http') {
  const handler = { ...action, timeout: action.timeout || (QUICK.has(event) ? TIMEOUT.quick : TIMEOUT[type]) };
  if (action.async) { bridge()?.run(`rule-${++seq}`, handler, inputOf(event, facts, ctx), { cwd: ctx.cwd }).catch(() => {}); return out; }
  const result = await bridge()?.run(`rule-${++seq}`, handler, inputOf(event, facts, ctx), { cwd: ctx.cwd, env: ctx.effort ? { CLAUDE_EFFORT: ctx.effort } : {} }).catch(error => ({ code: null, error: error.message }));
  return readAnswer(event, result, handler);
 }
 else if (type === 'prompt') {
  if (!ctx.ask) { out.failed.push('no model to ask'); return out; }
  const input = JSON.stringify(inputOf(event, facts, ctx));
  const asked = String(action.prompt || '').includes('$ARGUMENTS') ? String(action.prompt).replace(/(?<!\\)\$ARGUMENTS/g, input).replace(/\\\$/g, '$') : `${action.prompt}\n\n${input}`;
  const text = await ctx.ask([{ role: 'system', content: `${PROMPT_JUDGE}${ctx.lang && LANGUAGES[ctx.lang] ? ` Write the reason in ${LANGUAGES[ctx.lang]}.` : ''}` }, { role: 'user', content: asked }], action).catch(() => '');
  return readVerdict(event, text, action);
 }
 return out;
}

const PROMPT_JUDGE = 'You check one moment of an AI agent\'s work against a rule the user set. You get the rule and the moment as JSON. Answer with one JSON object and nothing else: {"ok": true} when the rule lets the work go on, or {"ok": false, "reason": "what is wrong, in one or two plain sentences for the agent"}. Add "impossible": true only when the agent cannot possibly meet the rule.';

// A moment of the agent's work: every rule that applies runs, all at once; their answers are put together.
//   ctx: { cwd, chat, mode, effort, agent, ask(messages, action) → text, notify(rule, text), log(line), signal }
// → null when no rule applies, else { ...outcome, rules: [the rules that applied] }
async function fire(event, facts, ctx = {}) {
 const rules = (await all(ctx.cwd)).filter(rule => applies(rule, event, facts) && !problems(rule).length);
 if (!rules.length) return null;
 const answers = await Promise.all(rules.map(async rule => {
  const results = [];
  for (const action of rule.then || []) results.push(await act(rule, action, event, facts, ctx).catch(error => ({ ...blank(), failed: [error.message] })));
  const outcome = merge(results);
  return { rule, outcome };
 }));
 const outcome = merge(answers.map(item => item.outcome));
 const acted = answers.filter(({ outcome: o }) => o.decision || o.block || o.stop || o.context.length || o.input || o.output !== null || o.shown.length);
 for (const { rule, outcome: o } of acted) ctx.log?.({ rule: rule.name, id: rule.id, event, decision: o.decision || (o.block ? 'block' : o.stop ? 'stop' : 'note'), tool: facts.tool, command: facts.command, path: facts.path, url: facts.url, chat: ctx.chat });
 return { ...outcome, rules: rules.map(rule => ({ id: rule.id, name: rule.name })), acted: acted.map(({ rule, outcome: o }) => ({ id: rule.id, name: rule.name, decision: o.decision, block: o.block, stop: o.stop })) };
}

// --- Words into a rule, and a foreign hook adapted ----------------------------------------------------------------

// The model never writes a hook as it likes: it fills in the same blocks the user sees, as JSON of a fixed shape, and
// the app checks every part (problems) and sends the model back what is wrong, twice at most.
const SHAPE = `A rule is one JSON object:
{"name": "a short name, 2 to 5 words, in the user's language",
 "event": one of ${Object.keys(EVENTS).join(', ')},
 "matcher": optional; for PreToolUse, PermissionRequest, PostToolUse, PostToolUseFailure a list of tools such as "Bash|PowerShell" (commands; git is a Bash command), "Edit|Write" (changing files), "Read", "WebFetch|mcp__browser__navigate|mcp__browser__tabs" (opening sites), "WebSearch", "mcp__browser__.*" (anything in the built-in browser); for Notification "permission_prompt|agent_needs_input|agent_completed",
 To keep the agent out of a folder or a file altogether (not to open, read, list, search, change or run anything there), use event PreToolUse with no matcher (every step) and the condition {"field": "path", "op": "inFolder", "value": "<the folder's full path, as the user's real folders below give it>"}: every step has the places it touches as its path (files, folders listed, the folder a command runs in and paths written in it).
 "if": [ conditions, all must hold: {"field": one of command, path, site, url, query, content, element, risky, prompt, message, task_subject, tool, "op": one of ${Object.keys(OPS).join(', ')}, "value": "text"} ] — matches takes a simple pattern with * (*.env, *bank*); regex a JavaScript regular expression without inline flags, the case never counts; one of several values is a regex with |,
 "then": [ actions, in order ] }
A text in an action may name what the moment is about: {command}, {path}, {url}, {site}, {query}, {prompt}, {tool_input.file_path} and the like.
Actions: {"type":"deny","reason":"..."} block it (before a step, a message, a plan step) · {"type":"ask"} ask the user even in Full access (before a step) · {"type":"allow"} let a step go without asking · {"type":"context","text":"..."} tell the agent something · {"type":"check","command":"...","shell":"powershell"} run a check: before a step a failure blocks it, at Stop it keeps the agent working until the check passes, after a step its output goes to the agent · {"type":"keepGoing","reason":"..."} at Stop: not done yet · {"type":"notify","text":"..."} a notification to the user · {"type":"log"} write it to the journal · {"type":"stop","reason":"..."} end the agent's turn · {"type":"command","command":"...","shell":"powershell"} the user's own script, as a Claude Code hook · {"type":"http","url":"https://..."} · {"type":"prompt","prompt":"..."} ask the model whether the rule holds.
Which actions each moment takes: ${Object.entries(CAN).map(([event, list]) => `${event}: ${list.join(', ')}`).join('; ')}; command, http and prompt everywhere.
Moments: PreToolUse before a step of the agent (a command, a file change, a page), PermissionRequest when the user would be asked, PostToolUse after a step, PostToolUseFailure after a failed step, PostToolBatch after all steps of one answer, UserPromptSubmit when the user sends a message, SessionStart at the first message of a chat, Stop when the agent wants to finish, SubagentStart/SubagentStop a helper starts/finishes, TaskCreated/TaskCompleted a plan step is added/closed, Notification the app tells the user something, StopFailure a request to the model failed, PreCompact/PostCompact the history is summed up, PostModelSwitch the model changed.
The computer runs ${{ win32: 'Windows: commands are PowerShell', darwin: 'macOS: commands are zsh', linux: 'Linux: commands are bash' }[window.openghost?.platform] || 'Windows: commands are PowerShell'}.`;

const EXAMPLES = `Examples.
"never push to git without asking me" → {"name":"Ask before push","event":"PreToolUse","matcher":"Bash|PowerShell","if":[{"field":"command","op":"contains","value":"git push"}],"then":[{"type":"ask"}]}
"don't let it finish until the tests pass" → {"name":"Tests must pass","event":"Stop","then":[{"type":"check","command":"npm test","shell":"powershell"}]}
"keep away from bank sites" → {"name":"No bank sites","event":"PreToolUse","matcher":"WebFetch|mcp__browser__navigate|mcp__browser__tabs","if":[{"field":"site","op":"contains","value":"bank"}],"then":[{"type":"deny","reason":"Bank sites are off limits"}]}
"ask before it pays or sends a form" → {"name":"Ask before paying","event":"PreToolUse","matcher":"mcp__browser__.*","if":[{"field":"risky","op":"isOn","value":"true"}],"then":[{"type":"ask"}]}
"tell me when it waits for me" → {"name":"Ping when it waits","event":"Notification","matcher":"permission_prompt|agent_needs_input","then":[{"type":"notify","text":"The agent waits for you"}]}
"remind it that we write in British English" → {"name":"British English","event":"UserPromptSubmit","then":[{"type":"context","text":"Write in British English."}]}`;

const COMPOSE_SYSTEM = `You turn what the user says into one rule for OpenGhost, an app where an AI agent works on the user's computer. The app itself carries out the rule at a moment of the agent's work, whatever the agent thinks.\n\n${SHAPE}\n\n${EXAMPLES}\n\nAnswer with the JSON object only, no words around it. Use the plainest blocks that do what the user said; a script (command) only when no other action can.`;
const ADAPT_SYSTEM = `You adapt a hook written for another agent (Claude Code, Codex, OpenCode...) into one rule for OpenGhost that does the same, or as near to it as OpenGhost can. You get the hook as it was, and what keeps it from running as it is.\n\n${SHAPE}\n\nKeep what works as it is (its script, its matcher). Answer with the JSON object only.`;

function parseRule(text) {
 const m = String(text || '').match(/\{[\s\S]*\}/);
 if (!m) return null;
 try { const v = JSON.parse(m[0]); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}

// What a model wrote, made a rule and checked. → { rule } or { error }
function tidyCondition(c) {
 const out = { field: String(c.field || ''), op: String(c.op || ''), value: String(c.value ?? '') };
 if (out.op === 'regex' || out.op === 'matches') {
  const bare = out.value.replace(/^\(\?[a-z]+\)/i, '');
  const regexish = /[\\^$()|[\]{}+]/.test(bare);
  if (out.op === 'matches' && regexish) out.op = 'regex';
  if (out.op === 'regex') out.value = bare;
 }
 return out;
}

function shaped(raw) {
 if (!raw) return { error: 'The answer was not one JSON object' };
 const rule = { id: uid(), on: true, name: String(raw.name || '').slice(0, 60) || 'New rule', event: raw.event, ...(raw.matcher ? { matcher: String(raw.matcher) } : {}), if: Array.isArray(raw.if) ? raw.if.filter(c => c && typeof c === 'object').map(tidyCondition) : [], then: Array.isArray(raw.then) ? raw.then.filter(a => a && typeof a === 'object') : [] };
 const wrong = problems(rule);
 return wrong.length ? { rule, error: wrong.join('; ') } : { rule };
}

// complete(messages) → the model's text. → { rule, tries } or { error }
async function writeRule(system, user, complete) {
 const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
 let last = null;
 for (let tries = 1; tries <= 3; tries++) {
  const text = await complete(messages);
  const got = shaped(parseRule(text));
  if (!got.error) return { rule: got.rule, tries };
  last = got;
  messages.push({ role: 'assistant', content: String(text || '') }, { role: 'user', content: `That rule cannot be used: ${got.error}. Write it again, the JSON object only.` });
 }
 return { error: last?.error || 'no rule', rule: last?.rule || null };
}

const LANGUAGES = { en: 'English', ru: 'Russian', fr: 'French', it: 'Italian' };
const said = lang => `The user's language: ${LANGUAGES[lang] || 'English'}; write the name and every text in it.`;
// The user's real folders (Windows keeps the desktop in OneDrive under a name in its language), so a rule on «the DS
// folder on the desktop» names the folder that is there.
const where = places => places && Object.keys(places).length ? `\n\nThe user's real folders on this computer: ${Object.entries(places).map(([name, path]) => `${name}: ${path}`).join('; ')}.` : '';
const compose = (words, complete, lang = 'en', places = null) => writeRule(COMPOSE_SYSTEM, `${String(words || '').trim()}\n\n(${said(lang)})${where(places)}`, complete);
const REVISE_SYSTEM = `You change one rule of OpenGhost as the user asks, keeping what they do not ask to change.\n\n${SHAPE}\n\nAnswer with the whole changed rule as one JSON object only.`;
async function revise(rule, words, complete, lang = 'en', places = null) {
 const { id, scope, from, on, ...as } = rule || {};
 const got = await writeRule(REVISE_SYSTEM, `The rule:\n${JSON.stringify(as, null, 1)}\n\nWhat the user wants changed: ${String(words || '').trim()}\n\n${said(lang)}${where(places)}`, complete);
 if (got.rule) { got.rule.id = id || got.rule.id; got.rule.on = on !== false; if (from) got.rule.from = from; }
 return got;
}
async function adapt(rule, complete, lang = 'en', places = null) {
 const { id, scope, ...as } = rule || {};
 const got = await writeRule(ADAPT_SYSTEM, `The hook:\n${JSON.stringify(as, null, 1)}\n\nWhat keeps it from running in OpenGhost: ${problems(rule).join('; ') || 'nothing'}\n\n${said(lang)}${where(places)}`, complete);
 if (got.rule) { got.rule.id = id || got.rule.id; got.rule.from = { ...(rule.from || {}), adapted: true }; }
 return got;
}

// Where a rule would have acted in chats gone by: their steps and messages, as the rule sees them now (its conditions;
// no handler is run). chats: [{ title, at, cwd, messages }] → [{ at, chat, what }]
function past(rule, chats, place = (cwd, p) => p) {
 const out = [];
 const toolEvents = new Set(['PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure']);
 for (const chat of chats) {
  for (const entry of chat.messages || []) {
   if (rule.event === 'UserPromptSubmit' && entry.role === 'user' && applies(rule, 'UserPromptSubmit', { prompt: entry.text || '' })) out.push({ at: entry.at || chat.at, chat: chat.title, what: String(entry.text || '').slice(0, 120) });
   if (entry.role !== 'assistant') continue;
   if (rule.event === 'Stop' && applies(rule, 'Stop', {})) out.push({ at: entry.at || chat.at, chat: chat.title, what: String(entry.content || '').replace(/\s+/g, ' ').slice(0, 120) });
   if (!toolEvents.has(rule.event)) continue;
   const results = new Map((entry.steps || []).filter(s => s.role === 'tool').map(s => [s.tool_call_id, String(s.content || '')]));
   for (const step of entry.steps || []) {
    for (const call of step.tool_calls || []) {
     let args = {};
     try { args = JSON.parse(call.function?.arguments || '{}') || {}; } catch {}
     const name = call.function?.name || '';
     if (RULE_FREE_NAMES.has(name)) continue;
     const facts = stepFacts(name, args, { cwd: chat.cwd, place: p => place(chat.cwd, p) });
     const result = results.get(call.id) || '';
     const failed = /^Error\b/.test(result) || /^Exit code (?!0\b)/.test(result);
     if (rule.event === 'PostToolUse' && failed) continue;
     if (rule.event === 'PostToolUseFailure' && !failed) continue;
     if (applies(rule, rule.event, facts)) out.push({ at: entry.at || chat.at, chat: chat.title, what: facts.command || facts.path || facts.url || facts.query || name });
    }
   }
  }
 }
 return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}
const RULE_FREE_NAMES = new Set(['notepad', 'routine', 'calendar', 'memory', 'record', 'plan', 'ask_user', 'skill']);

// --- Keeping them -------------------------------------------------------------------------------------------------

function list() { return state.user.slice(); }
async function save(rules) {
 const b = bridge();
 const clean = rules.map(({ scope, ...rule }) => rule);
 if (!b) { state.user = clean.map(rule => ({ ...rule, scope: 'user' })); for (const fn of state.listeners) fn(); return; }
 const data = await b.write(clean);
 state.user = (data?.rules || clean).map(rule => ({ ...rule, scope: 'user' }));
 for (const fn of state.listeners) fn();
}
function onChange(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }
if (bridge()) bridge().onChange(() => load());

window.Rules = {
 EVENTS, FOREIGN_EVENTS, CAN, OPS, STOP_CAP, TIMEOUT,
 asClaude, fromClaude, matches, permitted, holds, applies, stepFacts,
 readAnswer, readVerdict, merge, importClaude, readPasted, problems, issues, inputOf,
 load, all, watched, fire, list, save, onChange, uid,
 compose, adapt, revise, past, shaped, parseRule, SHAPE, pathsIn,
 project, untrusted, trust, saveProject,
 get ready() { if (!state.loaded) load(); return state.loaded; },
};
})();
