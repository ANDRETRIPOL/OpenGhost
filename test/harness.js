// Loads the real chat.js and agent-tools.js into a bare context, with a fake desktop bridge in place of Electron,
// and runs one tool step of Chat.loop: the model asks for `calls`, then answers with no calls.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CWD = '/project';

function load(bridge, { chat = process.env.CHAT_JS || path.join(ROOT, 'chat.js') } = {}) {
 const ctx = vm.createContext({ console, setTimeout, clearTimeout, AbortController });
 ctx.window = ctx;
 ctx.openghost = { tools: bridge, platform: 'linux' };
 vm.runInContext(fs.readFileSync(path.join(ROOT, 'agent-tools.js'), 'utf8'), ctx);
 vm.runInContext(fs.readFileSync(chat, 'utf8'), ctx);
 return ctx;
}

const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

// A bridge whose tools take `delay(name, args)` ms and log when each starts and ends. A cancel is recorded but does not
// end the tool early, as with a plain file read that Node cannot interrupt.
function fakeBridge(delay = () => 30) {
 const log = [], cancelled = [];
 let running = 0, peak = 0;
 return {
  log, cancelled,
  get peak() { return peak; },
  run(id, name, args) {
   log.push({ at: 'start', id, name, path: args.path });
   running++;
   peak = Math.max(peak, running);
   return new Promise(resolve => {
    setTimeout(() => {
     running--;
     log.push({ at: 'end', id, name, path: args.path });
     resolve(name === 'read_file' ? { text: `contents of ${args.path}`, start: 1, end: 1, total: 1 } : { code: 0, output: `${name} done`, created: true, path: args.path, lines: 1 });
    }, delay(name, args));
   });
  },
  cancel(id) { cancelled.push(id); },
  environment: async () => null,
 };
}

// Runs one tool step. `stopAfter` ms in, the user presses Stop. `approve` answers approval cards.
function step(ctx, calls, { mode = 'auto', stopAfter = null, approve = 'allow', approvals = [], cwd = CWD } = {}) {
 const chat = Object.create(ctx.Chat.prototype);
 Object.assign(chat, {
  settings: { mode }, tools: 0,
  cwd: () => cwd, attachedVideos: () => [], showGhost() {}, dismissGhost() {}, save() {}, async compactIfNeeded() {},
  async approve(conv, turn, view, request) { approvals.push(request.name); return approve; },
 });
 const part = { view: {}, entry: { steps: [] } };
 let asked = 0;
 chat.request = async () => (asked++ ? { part, calls: [], finish: 'stop' } : { part, calls, finish: 'tool_calls' });
 const turn = { controller: new AbortController(), queue: [], approvals: new Set(), tools: new Set(), next: null, release: null };
 const conv = { id: 'c', tokens: 0, turn };
 if (stopAfter !== null) setTimeout(() => chat.abort(conv), stopAfter);
 const started = performance.now();
 const done = chat.loop(conv, turn).then(finish => ({ finish }), error => ({ error }));
 return done.then(out => ({ ...out, steps: part.entry.steps, turn, ms: performance.now() - started }));
}

module.exports = { load, call, fakeBridge, step, ROOT, CWD };
