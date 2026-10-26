'use strict';
// Chat-scoped ASK permissions: actual tool policy, storage, crypto and Chat dispatch in VMs.
// The disk, browser and commands are fixtures. No application profile or network is used.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let count = 0;
function check(name, value) { assert.ok(value, name); count++; console.log('ok  ' + name); }
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

async function main() {
 const refs = { 1: 'link "More results"', 2: 'button "Buy now"', 3: 'button "Send"', 4: 'button "Удалить"', 5: 'combobox "Sort"', 6: 'button "Confirm"' };
 const c = { window: { openghost: { platform: 'win32', tools: {} }, browserPanel: {
  run: async () => ({ text: 'Page: Fixture\nURL: https://fixture.invalid/', refs }), tabsLine: () => '',
  drive() {}, userHolds: () => false, took: () => false,
 } }, console, AbortController, DOMException, setTimeout, clearTimeout, TextEncoder, TextDecoder, Uint8Array, btoa, atob,
 crypto: require('node:crypto').webcrypto, URL, I18n: { t: key => key }, Usage: { parts: () => null }, Skills: { blocks: () => '' }, Providers: {}, AgentLine: { show() {}, deed: () => '' } };
 vm.createContext(c);
 vm.runInContext(read('agent-tools.js'), c);
 const A = c.AgentTools = c.window.AgentTools;
 await A.run('browser_snapshot', {}, { id: 'fixture', cwd: 'C:\\project' });
 const opts = { cwd: 'C:\\project' };
 const rule = (name, args = {}, more = {}) => A.approvalRule(name, args, { ...opts, ...more });
 check('Web search has a repeatable action-kind rule', rule('web_search', { query: 'one' }).key === rule('web_search', { query: 'two' }).key);
 check('Another action kind is separate', rule('web_search').key !== rule('fetch_url').key);
 check('Unknown tools never get an exception', !rule('invented_tool'));
 check('Shell permission is only for the exact command', rule(A.shell, { command: 'Get-ChildItem' }).key !== rule(A.shell, { command: 'Remove-Item x' }).key);
 check('A shell command in another folder needs a new permission', rule(A.shell, { command: 'Get-ChildItem' }).key !== rule(A.shell, { command: 'Get-ChildItem' }, { cwd: 'C:\\other' }).key);
 check('Command descriptions cannot broaden or change a rule', rule(A.shell, { command: 'Get-ChildItem', description: 'a' }).key === rule(A.shell, { command: 'Get-ChildItem', description: 'b' }).key);
 check('Empty or oversized commands cannot be remembered', !rule(A.shell, {}) && !rule(A.shell, { command: 'x'.repeat(13000) }));
 check('Git permissions match the exact arguments', rule('git', { args: ['status'] }).key !== rule('git', { args: ['reset', '--hard'] }).key);
 check('A file-write rule covers only its project folder', rule('write_file', { path: 'a.txt' }).key === rule('write_file', { path: 'b.txt' }).key && rule('write_file', { path: 'a.txt' }).key !== rule('write_file', { path: 'C:\\outside\\b.txt' }).key);
 check('An outside file-write permission never covers another file', rule('edit_file', { path: 'C:\\outside\\a.txt' }).key !== rule('edit_file', { path: 'C:\\outside\\b.txt' }).key);
 check('An absolute parent traversal does not inherit the project rule', rule('write_file', { path: 'a.txt' }).key !== rule('write_file', { path: 'C:\\project\\..\\outside.txt' }).key);
 check('Equivalent project paths keep the same rule', rule('edit_file', { path: 'a.txt' }).key === rule('edit_file', { path: 'C:\\project\\sub\\..\\b.txt' }).key);
 check('Changing the project invalidates its write rule', rule('edit_file', { path: 'a.txt' }).key !== rule('edit_file', { path: 'a.txt' }, { cwd: 'C:\\other' }).key);
 check('Watching and saving video frames are separate permissions', rule('video_frames', { path: 'a.mp4' }).key !== rule('video_frames', { path: 'a.mp4', save_to: 'frames' }).key);
 check('Saving frames somewhere else still asks', rule('video_frames', { save_to: 'frames' }).key !== rule('video_frames', { save_to: 'other' }).key);
 check('Ordinary browser links can be remembered', !!rule('browser_click', { ref: 1 }));
 check('Purchase, send, delete and confirmation clicks cannot be remembered', [2, 3, 4, 6].every(ref => !rule('browser_click', { ref })));
 check('Coordinate clicks and stale references cannot bypass approval', !rule('browser_click', { x: 1, y: 1 }) && !rule('browser_click', { ref: 100 }));
 check('Browser references belong to their own agent tab', !rule('browser_click', { ref: 1 }, { apart: {} }));
 check('Typing with submit never uses a remembered typing rule', !!rule('browser_type', { text: 'search' }) && !rule('browser_type', { text: 'send', submit: true }));
 check('Enter, Space and keyboard shortcuts still ask', ['Enter', 'Space', 'Control+Enter', 'Control+W'].every(key => !rule('browser_press', { key })));
 check('Navigation keys can be remembered without granting Enter', !!rule('browser_press', { key: 'Tab' }) && !!rule('browser_press', { key: 'ArrowDown' }));
 check('A destructive select option still asks', !!rule('browser_select', { ref: 5, option: 'Newest' }) && !rule('browser_select', { ref: 5, option: 'Delete' }));
 check('Web navigation rules do not cover local or data pages', !!rule('browser_navigate', { url: 'https://example.com' }) && !!rule('browser_navigate', { url: 'find pizza' }) && ['file:///C:/private.json', 'C:\\private.json', '/private.json', 'data:text/html,hello', 'javascript:alert(1)'].every(url => !rule('browser_navigate', { url })));
 check('An HTTPS address with an explicit port is a web action', !!rule('browser_navigate', { url: 'https://example.com:8443/page' }));
 check('New web tabs and local tabs do not share a rule', !!rule('browser_tabs', { action: 'new', url: 'https://example.com' }) && !rule('browser_tabs', { action: 'new', url: 'file:///C:/x' }));

 for (const [platform, shell] of [['linux', 'run_bash'], ['darwin', 'run_zsh']]) {
  const unix = { window: { openghost: { platform, tools: {} } }, URL, I18n: { t: key => key } };
  vm.createContext(unix); vm.runInContext(read('agent-tools.js'), unix);
  const U = unix.window.AgentTools, place = { cwd: '/tmp/project' };
  check(platform + ': uses the platform shell for exact commands', U.shell === shell && U.approvalRule(shell, { command: 'ls' }, place).key !== U.approvalRule(shell, { command: 'rm x' }, place).key);
  check(platform + ': parent traversal remains outside the project rule', U.approvalRule('write_file', { path: 'a.txt' }, place).key !== U.approvalRule('write_file', { path: '/tmp/project/../outside.txt' }, place).key);
 }
 vm.runInContext(read('chat-lock.js'), c); c.ChatLock = c.window.ChatLock;
 vm.runInContext(read('library.js'), c);
 function library(disk = new Map(), chats = [{ id: 'a', title: 'A', folder: 'C:\\project' }, { id: 'b', title: 'B', folder: 'C:\\project' }]) {
  const fault = { read: false, write: false, remove: false };
  const lib = Object.create(c.window.Library.prototype);
  Object.assign(lib, { chats, folders: [], home: { path: '' }, keys: new Map(), titles: new Map(), writes: new Map(), fresh: new Set(), gone: new Set(), changed() {}, onChange() {}, persist: async () => {}, store: {
   read: async key => { if (fault.read && key.startsWith('permissions/')) throw Error('read failure'); return clone(disk.get(key)); },
   write: async (key, value) => { if (fault.write && key.startsWith('permissions/')) throw Error('write failure'); disk.set(key, clone(value)); },
   remove: async key => { if (fault.remove && key.startsWith('permissions/')) throw Error('remove failure'); disk.delete(key); },
  } });
  return { lib, disk, fault };
 }
 const { lib, disk, fault } = library();
 const searchRule = rule('web_search').key;
 check('Older chats start without remembered rules', (await lib.permissions('a')).length === 0);
 check('Grant is persisted before it succeeds', await lib.allowPermission('a', searchRule) && disk.has('permissions/a'));
 check('The next step reads the saved grant', (await lib.permissions('a')).includes(searchRule));
 check('A second chat in the same folder has no access to the grant', (await lib.permissions('b')).length === 0);
 check('Repeated grants are deduplicated', await lib.allowPermission('a', searchRule) && (await lib.permissions('a')).length === 1);
 const restarted = library(disk).lib;
 check('A fresh library after restart reads the same grant', (await restarted.permissions('a')).includes(searchRule));
 const fork = await lib.fork('a', { messages: [], tokens: 0 });
 check('A fork does not inherit permissions', fork && (await lib.permissions(fork.id)).length === 0);
 await lib.resetPermissions('a');
 check('Reset removes the grant on disk', !disk.has('permissions/a') && !(await restarted.permissions('a')).length);
 fault.write = true;
 await assert.rejects(lib.allowPermission('a', searchRule)); count++;
 check('A failed grant leaves no saved exception', !(await lib.permissions('a')).length);
 fault.write = false; await lib.allowPermission('a', searchRule); fault.remove = true;
 await assert.rejects(lib.resetPermissions('a')); count++;
 check('A failed reset retains the previous rule', (await lib.permissions('a')).includes(searchRule)); fault.remove = false;
 const stopped = new AbortController(); stopped.abort();
 await assert.rejects(lib.allowPermission('b', searchRule, stopped.signal)); count++;
 check('An aborted grant is not persisted', !disk.has('permissions/b'));
 check('Missing chats cannot acquire rules', !await lib.allowPermission('missing', searchRule));
 // Real PBKDF2/AES-GCM, fixture files, including rollback at the permissions file.
 check('Protecting the chat seals its permission file', await lib.protect('a', 'fixture-password') && !!disk.get('permissions/a').sealed && !JSON.stringify(disk.get('permissions/a')).includes(searchRule));
 check('A locked chat grants no exceptions', !(await lib.permissions('a')).length && !await lib.allowPermission('a', searchRule));
 check('Unlock restores access to saved exceptions', await lib.unlock('a', 'fixture-password') && (await lib.permissions('a')).includes(searchRule));
 await lib.allowPermission('a', rule('fetch_url').key);
 check('New rules in an open protected chat stay encrypted', !!disk.get('permissions/a').sealed);
 fault.write = true;
 check('A failed password removal restores the locked format', !await lib.unprotect('a') && !!lib.chat('a').lock && !!disk.get('permissions/a').sealed); fault.write = false;
 check('Removing the password preserves all permission rules', await lib.unprotect('a') && !(disk.get('permissions/a').sealed) && (await lib.permissions('a')).length === 2);
 const rollback = library(); await rollback.lib.allowPermission('a', searchRule); rollback.fault.write = true;
 check('A permissions write failure rolls back password protection', !await rollback.lib.protect('a', 'password') && !rollback.lib.chat('a').lock && (await rollback.lib.permissions('a')).includes(searchRule));
 lib.remove('a'); await Promise.all([...lib.writes.values()]);
 check('Deleting a chat also deletes its permissions', !disk.has('permissions/a'));

 vm.runInContext(read('agent-plan.js'), c); c.AgentPlan = c.window.AgentPlan;
 vm.runInContext(read('plan-proof.js'), c); c.PlanProof = c.window.PlanProof;
 vm.runInContext(read('chat.js'), c);
 const live = library(), chat = Object.create(c.window.Chat.prototype);
 let asked = 0, ran = 0, decision = 'allow';
 Object.assign(chat, { settings: { mode: 'ask' }, library: live.lib, tools: 0, cwd: () => opts.cwd, attachedFiles: () => ({}), seat: () => null,
  approve: async () => { asked++; return decision; }, showGhost() {}, runShared: async () => { ran++; return 'done'; } });
 A.run = async () => { ran++; return 'done'; };
 const conv = { id: 'a', record: live.lib.chat('a') }, view = { status: {} };
 const turn = () => ({ controller: new AbortController(), queue: [], approvals: new Set() });
 const call = (name, args = {}) => ({ id: 'call', function: { name, arguments: JSON.stringify(args) } });
 await chat.useTool(conv, turn(), view, call('web_search', { query: 'one' }));
 check('ASK still asks before the first action', asked === 1 && ran === 1);
 await live.lib.allowPermission('a', searchRule);
 await chat.useTool(conv, turn(), view, call('web_search', { query: 'two' }));
 check('The saved kind runs without another prompt', asked === 1 && ran === 2);
 await chat.useTool({ id: 'b', record: live.lib.chat('b') }, turn(), view, call('web_search'));
 check('Chat dispatch does not reuse another chat’s grant', asked === 2);
 await chat.useTool(conv, turn(), view, call('fetch_url', { url: 'https://example.com' }));
 check('Another kind still asks', asked === 3);
 await live.lib.resetPermissions('a');
 await chat.useTool(conv, turn(), view, call('web_search'));
 check('The next action after reset asks again', asked === 4);
 live.fault.read = true; await chat.useTool(conv, turn(), view, call('web_search'));
 check('A storage read error fails closed', asked === 5); live.fault.read = false;
 decision = 'deny'; const before = ran;
 await chat.useTool(conv, turn(), view, call('web_search'));
 check('Deny does not run or remember the action', ran === before && !(await live.lib.permissions('a')).length);
 decision = 'allow'; await live.lib.allowPermission('a', rule('browser_click', { ref: 1 }).key);
 await chat.useTool(conv, turn(), view, call('browser_click', { ref: 1 })); const normalAsked = asked;
 await chat.useTool(conv, turn(), view, call('browser_click', { ref: 2 }));
 check('A remembered normal click never suppresses the purchase prompt', asked === normalAsked + 1);
 const command = 'Remove-Item x'; await live.lib.allowPermission('a', rule(A.shell, { command }).key);
 chat.settings.mode = 'auto'; const autoAsked = asked;
 await chat.useTool(conv, turn(), view, call(A.shell, { command }));
 check('ASK exceptions do not change AUTO’s safeguards', asked === autoAsked + 1);
 check('The original ASK mode itself was never changed by a grant', live.lib.chat('a').mode === undefined);
 console.log(`\n${count} checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
