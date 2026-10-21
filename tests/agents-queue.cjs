'use strict';
// Agents sharing a folder: which commands are refused or wait their turn, the files a command changed, the ports
// servers take, and chats without a project folder kept to their own folders. Real source in VMs; the folder checks run
// on a temporary folder, and the port check opens one port of its own for a moment.
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const results = [];
const check = (name, actual, expected) => results.push({ name, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });

function chatVM(ports) {
 const inside = (dir, file) => file === dir || file.startsWith(dir + '\\');
 const context = { window: {}, console, AbortController, setTimeout, clearTimeout, Promise,
  Skills: { blocks: () => '' }, Usage: { parts: () => null }, Providers: {}, I18n: { t: (key, values) => `${key}${values ? JSON.stringify(values) : ''}` },
  AgentTools: { shell: 'run_powershell', inside, place: (cwd, file) => path.win32.resolve(cwd, file), ports: async () => ports.list } };
 vm.createContext(context);
 vm.runInContext(read('chat.js').replace('Chat.splitQuotes = splitQuotes;', 'window.audit = { gitCalls, sweeps, sharedKinds, Desk, DESK, TOOL_NOTES }; Chat.splitQuotes = splitQuotes;'), context);
 return context;
}

async function main() {
 const ports = { list: [] };
 const c = chatVM(ports), { gitCalls, sweeps, sharedKinds, Desk, DESK } = c.window.audit;
 const subs = calls => calls.map(call => call.sub);

 // Reading what a step does.
 check('Git calls from the git tool', subs(gitCalls('git', { args: ['-C', 'x', 'commit', '-m', 'Fix'] })), ['commit']);
 check('Git calls inside a shell command', subs(gitCalls('run_powershell', { command: 'cd src; git add -A; git -c user.name=x commit -m "Fix it"\ngit status' })), ['add', 'commit', 'status']);
 const sweep = command => sweeps(gitCalls('run_powershell', { command })[0]);
 check('Sweeping git steps are named', ['git checkout main', 'git switch -c x', 'git reset --hard', 'git stash', 'git clean -fd', 'git restore a.js', 'git pull', 'git add -A', 'git add .', 'git add', 'git commit -am Fix', 'git commit --all -m Fix'].map(sweep).map(Boolean), Array(12).fill(true));
 check('Careful git steps are not', ['git add src/a.js', 'git commit -m "Add a"', 'git stash list', 'git status', 'git log --oneline', 'git diff', 'git commit --amend -m x'].map(sweep).map(Boolean), Array(7).fill(false));
 const kinds = command => { const k = sharedKinds('run_powershell', { command }); return [k.git, k.build, k.server, k.writes]; };
 check('npm install is a build', kinds('npm install'), [false, true, false, false]);
 check('npm run dev starts a server and is no build', kinds('npm run dev'), [false, false, true, false]);
 check('Start-Process starts a server', kinds('Start-Process -WindowStyle Hidden npx -ArgumentList "vite"'), [false, false, true, false]);
 check('pip install and cargo build are builds', [kinds('pip install requests')[1], kinds('cargo build --release')[1], kinds('python -m pip install x')[1]], [true, true, true]);
 check('Reading git and reading files are neither', [kinds('git status'), kinds('Get-Content a.js')], [[false, false, false, false], [false, false, false, false]]);
 check('A commit changes git; a write changes files', [kinds('git commit -m x')[0], kinds('Set-Content a.js "x"')[3], kinds('echo hi > a.txt')[3]], [true, true, true]);
 check('Listing branches and stashes changes nothing', [sharedKinds('git', { args: ['branch'] }).git, sharedKinds('git', { args: ['stash', 'list'] }).git, sharedKinds('git', { args: ['branch', '-D', 'old'] }).git], [false, false, true]);

 // Two agents in one folder, a third in another.
 const agent = (title, cwd, task) => ({ conv: { id: title, record: { title } }, chat: { cwd: () => cwd, taskOf: () => task, library: { titleOf: record => record.title } } });
 const A = agent('Login', 'C:\\P', 'fix login'), B = agent('Styles', 'C:\\P\\src', 'restyle'), C = agent('Other', 'C:\\Q', 'other');
 for (const one of [A, B, C]) Desk.enter(one.conv, one.chat);
 check('Agents in one folder, or one inside the other, see each other', [Desk.others(A.conv, 'C:\\P').map(s => s.conv.id), Desk.others(C.conv, 'C:\\Q').length], [['Styles'], 0]);
 Desk.claim(A.conv, 'C:\\P\\src\\app.js', 'src/app.js');
 check('A command naming another agent\'s file is found', [Desk.named(B.conv, 'C:\\P\\src', 'Set-Content src/app.js "x"')?.shown, Desk.named(B.conv, 'C:\\P\\src', 'Remove-Item app.js')?.shown, Desk.named(B.conv, 'C:\\P\\src', 'Set-Content other.js "x"')], ['src/app.js', 'src/app.js', null]);

 // The chat's own refusals, as the agent reads them.
 const chat = Object.create(c.window.Chat.prototype);
 const refusal = command => chat.sharedRefusal(B.conv, 'C:\\P\\src', sharedKinds('run_powershell', { command }));
 check('A branch switch is refused while another agent works', /Error: the agent of the chat “Login” is working in this folder right now \(its task: “fix login”\)\. “git checkout main”/.test(refusal('git checkout main')), true);
 check('git add of another agent\'s file is refused', /src\/app\.js is one of the files it is changing/.test(chat.sharedRefusal(B.conv, 'C:\\P', sharedKinds('git', { args: ['add', 'src/app.js'] }))), true);
 check('A command writing another agent\'s file is refused', /names src\/app\.js, a file it is changing/.test(refusal('Set-Content src/app.js "x"')), true);
 check('Own careful work goes through', [refusal('git add styles.css'), refusal('git commit -m "Restyle"'), refusal('npm install'), refusal('Get-Content src/app.js')], ['', '', '', '']);
 check('Alone in a folder nothing is refused', chat.sharedRefusal(C.conv, 'C:\\Q', sharedKinds('run_powershell', { command: 'git reset --hard' })), '');

 // One at a time: a build waits for the other agent's build in the same folder, not for one elsewhere.
 const stop = new AbortController(), heard = [];
 const releaseA = await Desk.take(A.conv, 'C:\\P', 'build', stop.signal);
 const releaseC = await Desk.take(C.conv, 'C:\\Q', 'build', stop.signal);
 let bStarted = false;
 const waiting = Desk.take(B.conv, 'C:\\P\\src', 'build', stop.signal, peer => heard.push(peer.conv.id)).then(release => { bStarted = true; return release; });
 await new Promise(resolve => setTimeout(resolve, 20));
 check('A build waits while another agent builds in the same folder, told whom for', [bStarted, heard], [false, ['Login']]);
 releaseA();
 const releaseB = await waiting;
 check('and starts once that one is done; a build elsewhere never waited', [bStarted, typeof releaseC], [true, 'function']);
 const stopped = new AbortController();
 const blocked = Desk.take(A.conv, 'C:\\P', 'build', stopped.signal);
 stopped.abort();
 check('A wait ends when the turn is stopped', await blocked, null);
 releaseB(); releaseC();
 check('Git and builds are queues of their own', typeof (await Desk.take(A.conv, 'C:\\P', 'git', stop.signal)), 'function');

 // An agent that finished: its files are free, its work is named to the next one for a while.
 Desk.leave(A.conv);
 check('A finished agent\'s files are free', Desk.holder(B.conv, 'C:\\P\\src\\app.js'), null);
 check('and its work is named to an agent there', Desk.finished(B.conv, 'C:\\P\\src').map(item => item.files), [['src/app.js']]);
 Desk.recent.get(A.conv).at -= DESK.recent + 1;
 check('until a while has passed', Desk.finished(B.conv, 'C:\\P\\src').length, 0);

 // Servers: a port is kept while it listens, and let go once it stops.
 Desk.servers.set(5173, { conv: C.conv, chat: C.chat, at: Date.now() - DESK.starting - 1 });
 Desk.servers.set(3000, { conv: C.conv, chat: C.chat, at: Date.now() });
 ports.list = [];
 await Desk.refresh();
 check('A server that stopped lets its port go; one just started is kept a moment', [...Desk.servers.keys()], [3000]);
 for (const one of [B, C]) Desk.leave(one.conv);

 // The main process: the files a command changed, the ports this computer listens on, and chats kept to their folders.
 const tools = { module: { exports: {} }, exports: {}, process, Buffer, TextDecoder, URL, AbortController, setTimeout, clearTimeout,
  require: name => name === 'electron' ? { app: { getPath: () => path.join(os.tmpdir(), 'og-audit-profile') }, net: {} } : name.startsWith('./') ? {} : require(name) };
 vm.createContext(tools);
 vm.runInContext(read('desktop/tools.js') + '\nmodule.exports.audit = { resolvePath, CHATS };', tools);
 const T = tools.module.exports;
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-queue-'));
 fs.mkdirSync(path.join(dir, 'src'));
 fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
 for (const [file, text] of [['a.txt', 'a'], ['src/b.js', 'b'], ['gone.txt', 'g'], ['node_modules/x/i.js', 'i']]) fs.writeFileSync(path.join(dir, file), text);
 const token = await T.mark(dir);
 await new Promise(resolve => setTimeout(resolve, 30));
 fs.writeFileSync(path.join(dir, 'src', 'b.js'), 'bb');
 fs.writeFileSync(path.join(dir, 'new.txt'), 'n');
 fs.rmSync(path.join(dir, 'gone.txt'));
 fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'i.js'), 'ii');
 const touched = (await T.changed(token)).map(file => file.split(path.sep).join('/')).sort();
 check('A command\'s changed, new and removed files are found; node_modules is not looked into', touched, ['gone.txt', 'new.txt', 'src/b.js']);
 check('A token is good once', await T.changed(token), []);
 fs.rmSync(dir, { recursive: true, force: true });
 const server = net.createServer().listen(0, '127.0.0.1');
 await new Promise(resolve => server.once('listening', resolve));
 const port = server.address().port, seen = await T.ports();
 server.close();
 check('The ports this computer listens on include one just opened', [Array.isArray(seen), seen.includes(port)], [true, true]);
 const chats = T.audit.CHATS, mine = path.join(chats, 'Trip'), blockedPath = () => { try { T.audit.resolvePath(mine, path.join('..', 'Budget', 'notes.txt')); return 'opened'; } catch (error) { return error.message; } };
 check('A chat without a project folder cannot reach another such chat\'s folder', /belongs to another chat/.test(blockedPath()), true);
 check('Its own folder and the rest of the computer stay open', [T.audit.resolvePath(mine, 'plan.md'), T.audit.resolvePath(mine, path.join(os.tmpdir(), 'x.txt'))], [path.join(mine, 'plan.md'), path.join(os.tmpdir(), 'x.txt')]);
 check('A project chat is not kept to anything', T.audit.resolvePath(path.join(os.tmpdir(), 'proj'), path.join(chats, 'Trip', 'a.txt')), path.join(chats, 'Trip', 'a.txt'));

 const report = { count: results.length, passed: results.filter(r => r.pass).length, results };
 if (report.passed !== report.count) process.exitCode = 1;
 console.log(JSON.stringify({ ...report, results: results.filter(r => !r.pass) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
