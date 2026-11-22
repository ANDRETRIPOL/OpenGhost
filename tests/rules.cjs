'use strict';
// Rules (rules.js): matchers and `if` as Claude Code reads them, conditions of the app's own rules, the app's tools as a
// hook written for Claude Code sees them, answers by exit code and JSON per moment, several answers put together,
// Claude Code's hooks brought over and what keeps one from running here. Real source in a VM.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const results = [];
const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });

const context = { window: {}, console, Promise, setTimeout, clearTimeout, URL };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'rules.js'), 'utf8'), context);
const R = context.window.Rules;
const plain = value => JSON.parse(JSON.stringify(value));

// Matchers.
check('Empty and * match every tool', [R.matches('', ['Bash']), R.matches('*', ['Edit'])], [true, true]);
check('A list of names matches exactly', [R.matches('Edit|Write', ['Write']), R.matches('Edit, Write', ['Edit']), R.matches('Edit|Write', ['NotebookEdit'])], [true, true, false]);
check('Anything else is a regular expression, not anchored', [R.matches('Edit.*', ['NotebookEdit']), R.matches('^Edit$', ['NotebookEdit']), R.matches('mcp__browser__.*', ['mcp__browser__navigate'])], [true, false, true]);
check('Matchers are case-sensitive', R.matches('bash', ['Bash']), false);

// The app's tools as Claude Code names them.
const place = p => `C:\\work\\site\\${p}`;
check('A PowerShell command is PowerShell, a git command is a Bash command', [plain(R.asClaude('run_powershell', { command: 'npm test', description: 'Run tests' })), plain(R.asClaude('git', { args: ['push', 'origin', 'main'] }))],
 [{ tool_name: 'PowerShell', tool_input: { command: 'npm test', description: 'Run tests' } }, { tool_name: 'Bash', tool_input: { command: 'git push origin main', description: '' } }]);
check('Files carry their full path, as file_path', plain(R.asClaude('edit_file', { path: 'a.js', old_string: 'x', new_string: 'y' }, place)), { tool_name: 'Edit', tool_input: { file_path: 'C:\\work\\site\\a.js', old_string: 'x', new_string: 'y', replace_all: false } });
check('The browser is an MCP server named browser', R.asClaude('browser_navigate', { url: 'bank.com' }).tool_name, 'mcp__browser__navigate');
check('A rewritten git command goes back into its arguments', plain(R.fromClaude('git', { command: 'git push --dry-run origin main' }, { args: ['push', 'origin', 'main'], description: 'd' })), { args: ['push', '--dry-run', 'origin', 'main'], description: 'd' });
check('A rewritten file path goes back as path', R.fromClaude('write_file', { file_path: 'C:\\x\\b.txt' }, { path: 'a.txt', content: 'q' }).path, 'C:\\x\\b.txt');

// `if`, Claude Code's one permission rule.
const push = R.stepFacts('git', { args: ['push', 'origin', 'main'] });
const cdPush = R.stepFacts('run_powershell', { command: 'cd site; git push' });
check('Bash(git *) holds for git push and for a git push after cd', [R.permitted('Bash(git *)', push), R.permitted('Bash(git push*)', cdPush), R.permitted('PowerShell(git push*)', cdPush)], [true, false, true]);
check('A tool alone holds for every call of it', R.permitted('Bash', push), true);
const ts = R.stepFacts('edit_file', { path: 'src/app.ts' }, { place });
check('Edit(*.ts) holds for a .ts file anywhere, not for .js', [R.permitted('Edit(*.ts)', ts), R.permitted('Edit(*.js)', ts), R.permitted('Write(*.ts)', ts)], [true, false, false]);
const site = R.stepFacts('fetch_url', { url: 'https://www.bank.com/login' });
check('WebFetch(domain:…) checks the site', [R.permitted('WebFetch(domain:bank.com)', site), R.permitted('WebFetch(domain:shop.com)', site)], [true, false]);

// Conditions of the app's own rules.
check('starts with on a command checks each part', [R.holds({ field: 'command', op: 'startsWith', value: 'git push' }, cdPush), R.holds({ field: 'command', op: 'contains', value: 'push' }, push)], [true, true]);
check('A path condition reads the file name too', [R.holds({ field: 'path', op: 'contains', value: 'site/src' }, ts), R.holds({ field: 'path', op: 'endsWith', value: '.ts' }, ts), R.holds({ field: 'path', op: 'is', value: 'app.ts' }, ts)], [true, true, true]);
check('matches is a glob, regex a regular expression', [R.holds({ field: 'site', op: 'matches', value: '*bank*' }, site), R.holds({ field: 'url', op: 'regex', value: 'bank\\.com/log' }, site)], [true, true]);
check('A risky click is a fact to compare', R.holds({ field: 'risky', op: 'isOn' }, R.stepFacts('browser_click', { ref: 4 }, { element: 'button "Pay now"', risky: true })), true);

// Whether a rule applies.
const rule = { id: 'a', name: 'Ask before push', on: true, event: 'PreToolUse', matcher: 'Bash|PowerShell', if: [{ field: 'command', op: 'contains', value: 'git push' }], then: [{ type: 'ask' }] };
check('A rule applies at its moment, to its tools, when its conditions hold', [R.applies(rule, 'PreToolUse', push), R.applies(rule, 'PostToolUse', push), R.applies({ ...rule, on: false }, 'PreToolUse', push), R.applies(rule, 'PreToolUse', R.stepFacts('git', { args: ['status'] }))], [true, false, false, false]);

// Answers by exit code.
const A = (event, result, handler) => plain(R.readAnswer(event, result, handler));
check('Exit 2 before a step denies it, with standard error as the reason', [A('PreToolUse', { code: 2, stdout: '', stderr: 'No pushes on Friday\n' }).decision, A('PreToolUse', { code: 2, stdout: '', stderr: 'No pushes on Friday\n' }).reason], ['deny', 'No pushes on Friday']);
check('Exit 2 at Stop keeps the agent going', [A('Stop', { code: 2, stderr: 'Tests fail' }).block, A('Stop', { code: 2, stderr: 'Tests fail' }).blockReason], [true, 'Tests fail']);
check('Exit 2 after a step only tells the agent', [A('PostToolUse', { code: 2, stderr: 'Lint: 3 errors' }).context, A('PostToolUse', { code: 2, stderr: 'x' }).decision], [['Lint: 3 errors'], null]);
check('Exit 2 is not honored at PermissionRequest', A('PermissionRequest', { code: 2, stderr: 'no' }).decision, null);
check('Another exit code is a failure that lets the step go, unless onFailure is block', [A('PreToolUse', { code: 1, stderr: 'oops' }).decision, A('PreToolUse', { code: 1, stderr: 'oops' }).failed.length, A('PreToolUse', { code: 1, stderr: 'oops' }, { onFailure: 'block' }).decision], [null, 1, 'deny']);
check('Running out of time lets the step go', A('PreToolUse', { code: null, timedOut: true }).decision, null);
check('Plain text on exit 0 is context where Claude Code adds it, else nothing', [A('UserPromptSubmit', { code: 0, stdout: 'Today is Friday' }).context, A('PreToolUse', { code: 0, stdout: 'hello' }).context], [['Today is Friday'], []]);
check('PreCompact text becomes the summary\'s instructions', A('PreCompact', { code: 0, stdout: 'Keep the file names' }).instructions, 'Keep the file names');

// Answers by JSON.
const J = (event, value) => A(event, { code: 0, stdout: JSON.stringify(value) });
const deny = J('PreToolUse', { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Use the staging branch' } });
check('permissionDecision deny with its reason', [deny.decision, deny.reason], ['deny', 'Use the staging branch']);
const rewrite = J('PreToolUse', { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { command: 'npm run lint' }, additionalContext: 'Rewritten' } });
check('allow with a rewritten input and a note', [rewrite.decision, rewrite.input, rewrite.context], ['allow', { command: 'npm run lint' }, ['Rewritten']]);
check('The old decision words still work', [J('PreToolUse', { decision: 'approve' }).decision, J('PreToolUse', { decision: 'block', reason: 'r' }).decision], ['allow', 'deny']);
const perm = J('PermissionRequest', { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Not this', interrupt: true } } });
check('PermissionRequest decides with its decision object', [perm.decision, perm.reason, perm.stop], ['deny', 'Not this', true]);
const stopBlock = J('Stop', { decision: 'block', reason: 'Run the tests first' });
check('Stop with decision block keeps the agent going', [stopBlock.block, stopBlock.blockReason], [true, 'Run the tests first']);
const halt = J('PostToolUse', { continue: false, stopReason: 'Build failed', systemMessage: 'Stopped by a hook' });
check('continue false stops the turn, with a message for the user', [halt.stop, halt.stopReason, halt.shown], [true, 'Build failed', ['Stopped by a hook']]);
const out = J('PostToolUse', { decision: 'block', reason: 'Looks wrong', hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: { stdout: '[redacted]' } } });
check('PostToolUse block is a note next to the result; updatedToolOutput replaces it', [out.context, out.output], [['Looks wrong'], { stdout: '[redacted]' }]);
check('Broken JSON is a failure', A('PreToolUse', { code: 0, stdout: '{ nope }' }).failed.length, 1);

// Questions to the model.
const V = (event, text, handler) => plain(R.readVerdict(event, text, handler));
check('ok false at Stop keeps the agent going, impossible lets it stop', [V('Stop', '{"ok": false, "reason": "Docs missing"}').block, V('Stop', '{"ok": false, "reason": "x", "impossible": true}').block], [true, false]);
check('ok false before a step denies it and ends the turn, unless continueOnBlock', [V('PreToolUse', '{"ok":false,"reason":"no"}').stop, V('PreToolUse', '{"ok":false,"reason":"no"}', { continueOnBlock: true }).stop, V('PreToolUse', '{"ok":false,"reason":"no"}').decision], [true, false, 'deny']);
check('An answer that cannot be read is a failure', V('Stop', 'sure!').failed.length, 1);

// Several answers.
const merged = plain(R.merge([J('PreToolUse', { hookSpecificOutput: { permissionDecision: 'allow' } }), J('PreToolUse', { hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: 'Check it' } }), A('PreToolUse', { code: 0, stdout: '' })]));
check('ask wins over allow', [merged.decision, merged.reason], ['ask', 'Check it']);
check('deny wins over everything and drops a rewrite', (m => [m.decision, m.input])(plain(R.merge([rewrite, deny]))), ['deny', null]);

// Claude Code's hooks brought over.
const hooks = {
 PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', if: 'Bash(rm *)', command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh' }] }],
 PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx prettier --write', timeout: 30 }, { type: 'mcp_tool', server: 'memory', tool: 'note' }] }],
 WorktreeCreate: [{ hooks: [{ type: 'command', command: 'make-worktree.sh' }] }],
 Stop: [{ hooks: [{ type: 'prompt', prompt: 'Are all tasks done? $ARGUMENTS' }] }],
};
const brought = plain(R.importClaude(hooks, { file: 'C:/u/.claude/settings.json' }));
check('Each handler is a rule of its own', brought.map(r => [r.event, r.matcher || '', r.ccIf || '', r.then[0].type]), [['PreToolUse', 'Bash', 'Bash(rm *)', 'command'], ['PostToolUse', 'Edit|Write', '', 'command'], ['PostToolUse', 'Edit|Write', '', 'mcp_tool'], ['WorktreeCreate', '', '', 'command'], ['Stop', '', '', 'prompt']]);
check('What runs here as it is, and what needs adapting', brought.map(r => R.problems(r).length > 0), [false, false, true, true, false]);
check('The reason an MCP tool cannot run is said plainly', R.problems(brought[2])[0], 'It calls a tool of an MCP server, and OpenGhost has no MCP servers');
check('Pasted settings, pasted hooks alone and pasted rules are all read', [R.readPasted(JSON.stringify({ hooks })).kind, R.readPasted(JSON.stringify(hooks)).rules.length, R.readPasted(JSON.stringify({ rules: [rule] })).kind, R.readPasted('nonsense')], ['claude-code', 5, 'rules', null]);
check('A native action a moment cannot take is a problem', R.problems({ event: 'Notification', then: [{ type: 'deny' }] }), ['At Notification a rule cannot deny']);

// The JSON a handler gets.
const input = plain(R.inputOf('PreToolUse', { ...push, tool_use_id: 't1' }, { cwd: 'C:/work/site', chat: 'c1', mode: 'full', effort: 'high' }));
check('A handler gets Claude Code\'s common fields and the step', [input.session_id, input.cwd, input.permission_mode, input.hook_event_name, input.tool_name, input.tool_input.command, input.tool_use_id, input.effort.level], ['c1', 'C:/work/site', 'bypassPermissions', 'PreToolUse', 'Bash', 'git push origin main', 't1', 'high']);

// What a model writes is checked and set right where it is plainly meant: a regular expression put under "matches", or
// with an inline flag JavaScript refuses, becomes a regex the app can run.
const secrets = R.shaped({ name: 'Secrets', event: 'PreToolUse', matcher: 'Edit|Write', if: [{ field: 'path', op: 'matches', value: String.raw`(?i)(^|[\\/])\.env(?:\.[^\\/]*)?$|\.pem$` }], then: [{ type: 'deny', reason: 'r' }] });
check('A regex written under matches becomes a regex, without its inline flag', [secrets.error || '', secrets.rule.if[0].op, secrets.rule.if[0].value.startsWith('(?i)')], ['', 'regex', false]);
check('…and catches what it was meant to', ['C:\\x\\.env', 'C:\\x\\.env.local', 'C:\\x\\key.pem', 'C:\\x\\app.js'].map(file => R.applies(secrets.rule, 'PreToolUse', R.stepFacts('edit_file', { path: file }))), [true, true, true, false]);
check('A plain pattern stays a pattern', R.shaped({ name: 'x', event: 'PreToolUse', if: [{ field: 'site', op: 'matches', value: '*bank*' }], then: [{ type: 'deny' }] }).rule.if[0].op, 'matches');
check('A broken regex is a problem with its own code', R.issues({ event: 'PreToolUse', if: [{ field: 'command', op: 'regex', value: '(' }], then: [{ type: 'deny' }] }).map(item => item.code), ['badRegex']);

// A folder kept out of reach: every step that touches it, whatever its tool.
const DS = 'C:\\Users\\M\\OneDrive\\Рабочий стол\\DS';
const keepOut = { id: 'ds', name: 'No DS', on: true, event: 'PreToolUse', if: [{ field: 'path', op: 'inFolder', value: DS }], then: [{ type: 'deny' }] };
const at = (name, args, cwd = 'C:\\Users\\M\\OneDrive\\Рабочий стол\\Other') => R.applies(keepOut, 'PreToolUse', R.stepFacts(name, args, { cwd, place: p => /^[A-Za-z]:/.test(p) ? p : `${cwd}\\${p}` }));
check('A folder rule holds for a command run in it, a listing, a read, and a command naming it in quotes', [
 at('run_powershell', { command: 'Get-ChildItem' }, DS),
 at('list_files', { path: DS }),
 at('read_file', { path: `${DS}\\notes.txt` }),
 at('run_powershell', { command: `Get-ChildItem "${DS}"` }),
 at('git', { args: ['status'] }, DS),
], [true, true, true, true, true]);
check('…and not for a folder of a longer name, nor for elsewhere', [at('list_files', { path: `${DS}X` }), at('run_powershell', { command: 'Get-ChildItem' }), at('read_file', { path: 'C:\\Users\\M\\Downloads\\ds.txt' })], [false, false, false]);
check('A command that builds the path itself (as GPT Luna did) is held too', [
 at('run_powershell', { command: "$p = Join-Path $HOME 'Рабочий стол\\DS'; Get-ChildItem -LiteralPath $p" }),
 at('run_powershell', { command: "Get-Content ([Environment]::GetFolderPath('Desktop') + '\\DS\\secret.txt')" }),
 at('run_powershell', { command: 'Get-ChildItem DSL; Write-Output DSX' }),
], [true, true, false]);
check('inFolder reads either slash and any case', R.OPS.inFolder('c:/users/m/onedrive/рабочий стол/ds/a.txt', DS), true);

// Words into a rule: an answer that cannot be used goes back to the model with what is wrong.
(async () => {
 const answers = ['Sure! Here is your rule.', JSON.stringify({ name: 'x', event: 'Whenever', then: [{ type: 'ask' }] }), JSON.stringify({ name: 'Ask before push', event: 'PreToolUse', matcher: 'Bash|PowerShell', if: [{ field: 'command', op: 'contains', value: 'git push' }], then: [{ type: 'ask' }] })];
 const asked = [];
 const got = await R.compose('ask me before pushing', async messages => { asked.push(messages); return answers[asked.length - 1]; }, 'ru');
 check('A wrong answer is sent back twice at most, and the third one is used', [got.tries, got.rule.name, asked[2].at(-1).content.includes('The moment Whenever is unknown')], [3, 'Ask before push', true]);
 check('The model is told the user\'s language', asked[0][1].content.includes("The user's language: Russian"), true);
 const none = await R.compose('x', async () => 'no');
 check('Three answers that cannot be used: no rule', [!!none.error, none.rule === null || !!none.rule], [true, true]);

 // Where a rule would have acted in the past.
 const chats = [{ title: 'Release', at: 5, cwd: 'C:/w', messages: [
  { role: 'user', text: 'push it' },
  { role: 'assistant', at: 7, content: 'Done', steps: [{ role: 'assistant', tool_calls: [{ id: 'a', function: { name: 'git', arguments: JSON.stringify({ args: ['push', 'origin', 'main'] }) } }, { id: 'b', function: { name: 'git', arguments: JSON.stringify({ args: ['status'] }) } }] }, { role: 'tool', tool_call_id: 'a', content: 'Exit code 0' }, { role: 'tool', tool_call_id: 'b', content: 'Exit code 0' }] },
 ] }];
 const hits = R.past(rule, chats);
 check('past finds the step the rule is about, and only that one', hits.map(hit => [hit.chat, hit.what]), [['Release', 'git push origin main']]);

 const failed = results.filter(item => !item.pass);
 for (const item of failed) console.log(`FAIL ${item.name}\n  actual:   ${JSON.stringify(item.actual)}\n  expected: ${JSON.stringify(item.expected)}`);
 console.log(`rules: ${results.length - failed.length}/${results.length} passed`);
 if (failed.length) process.exit(1);
})();
