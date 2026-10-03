const test = require('node:test');
const assert = require('node:assert/strict');
const { load, call, fakeBridge, step } = require('./harness');

const CANCELLED = 'Cancelled: the user stopped the agent.';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const toolSteps = steps => steps.filter(s => s.role === 'tool').map(s => [s.tool_call_id, s.content]);
const order = log => log.map(e => `${e.at}:${e.path || e.name}`);

test('a single read runs and is written back as before', async () => {
 const bridge = fakeBridge();
 const { finish, steps } = await step(load(bridge), [call('a', 'read_file', { path: 'a.txt' })]);
 assert.equal(finish, 'stop');
 assert.deepEqual(toolSteps(steps), [['a', 'contents of a.txt']]);
 assert.deepEqual(order(bridge.log), ['start:a.txt', 'end:a.txt']);
});

test('several reads in a row run at once', async () => {
 const bridge = fakeBridge(() => 50);
 const reads = ['a', 'b', 'c', 'd'].map(n => call(n, 'read_file', { path: `${n}.txt` }));
 const { ms } = await step(load(bridge), reads);
 assert.equal(bridge.peak, 4);
 assert.deepEqual(order(bridge.log).slice(0, 4), ['start:a.txt', 'start:b.txt', 'start:c.txt', 'start:d.txt']);
 assert.ok(ms < 150, `four 50 ms reads took ${ms.toFixed(0)} ms`);
});

test('results keep the order of the calls, not the order they finish in', async () => {
 const delays = { 'a.txt': 60, 'b.txt': 10, 'c.txt': 35 };
 const bridge = fakeBridge((name, args) => delays[args.path]);
 const reads = ['a', 'b', 'c'].map(n => call(n, 'read_file', { path: `${n}.txt` }));
 const { steps } = await step(load(bridge), reads);
 assert.deepEqual(bridge.log.filter(e => e.at === 'end').map(e => e.path), ['b.txt', 'c.txt', 'a.txt']);
 assert.deepEqual(toolSteps(steps), [['a', 'contents of a.txt'], ['b', 'contents of b.txt'], ['c', 'contents of c.txt']]);
});

test('any other call waits for the reads before it, and the reads after it wait for it', async () => {
 const bridge = fakeBridge(() => 20);
 const calls = [
  call('r1', 'read_file', { path: 'r1' }),
  call('r2', 'read_file', { path: 'r2' }),
  call('sh', 'run_bash', { command: 'make' }),
  call('r3', 'read_file', { path: 'r3' }),
  call('w', 'write_file', { path: 'out', content: 'x' }),
  call('r4', 'read_file', { path: 'r4' }),
 ];
 const { steps } = await step(load(bridge), calls, { mode: 'full' });
 assert.deepEqual(order(bridge.log), [
  'start:r1', 'start:r2', 'end:r1', 'end:r2',
  'start:run_bash', 'end:run_bash',
  'start:r3', 'end:r3',
  'start:out', 'end:out',
  'start:r4', 'end:r4',
 ]);
 assert.deepEqual(toolSteps(steps).map(([id]) => id), ['r1', 'r2', 'sh', 'r3', 'w', 'r4']);
});

test('reads that need approval are still asked for and run one at a time', async () => {
 const bridge = fakeBridge(() => 20), approvals = [];
 const calls = [
  call('in', 'read_file', { path: 'inside.txt' }),
  call('out1', 'read_file', { path: '/etc/one' }),
  call('out2', 'read_file', { path: '/etc/two' }),
 ];
 const { steps } = await step(load(bridge), calls, { mode: 'ask', approvals });
 assert.deepEqual(approvals, ['read_file', 'read_file']);
 assert.equal(bridge.peak, 1);
 assert.deepEqual(toolSteps(steps).map(([id]) => id), ['in', 'out1', 'out2']);
});

test('Stop signals every read in flight, ends the step as stopped, and starts nothing after', async () => {
 const bridge = fakeBridge(() => 200);
 const calls = [
  call('a', 'read_file', { path: 'a' }),
  call('b', 'read_file', { path: 'b' }),
  call('c', 'read_file', { path: 'c' }),
  call('sh', 'run_bash', { command: 'make' }),
  call('d', 'read_file', { path: 'd' }),
 ];
 const { error, steps, turn, ms } = await step(load(bridge), calls, { mode: 'full', stopAfter: 30 });
 // The same AbortError any stopped step ends with, which the chat shows as stopped. It comes without waiting for the reads.
 assert.equal(error?.name, 'AbortError');
 assert.ok(ms < 150, `the step ended ${ms.toFixed(0)} ms in, not at once`);
 // Each read in flight was told to stop, and none is still tracked by the turn. Whether the read itself can be
 // interrupted is up to the tool: this bridge, like a plain file read, lets it run to the end.
 assert.deepEqual(bridge.cancelled, ['c-1', 'c-2', 'c-3']);
 assert.equal(turn.tools.size, 0);
 // The calls after the group never reached the bridge.
 assert.deepEqual(bridge.log.filter(e => e.at === 'start').map(e => e.path), ['a', 'b', 'c']);
 assert.deepEqual(toolSteps(steps), ['a', 'b', 'c', 'sh', 'd'].map(id => [id, CANCELLED]));
});

test('a read that finishes after Stop is dropped and never reaches the history', async () => {
 const bridge = fakeBridge(() => 120);
 const calls = ['a', 'b'].map(n => call(n, 'read_file', { path: n }));
 const { steps } = await step(load(bridge), calls, { stopAfter: 20 });
 assert.deepEqual(toolSteps(steps), [['a', CANCELLED], ['b', CANCELLED]]);
 const before = JSON.stringify(steps);
 await wait(200);
 // The bridge ignores the cancel, so both reads did finish by now, and nothing of theirs was written.
 assert.equal(bridge.log.filter(e => e.at === 'end').length, 2);
 assert.equal(JSON.stringify(steps), before);
});

test('a read that finished before Stop keeps its result, the others are cancelled', async () => {
 const delays = { fast: 10, slow: 200 };
 const bridge = fakeBridge((name, args) => delays[args.path]);
 const calls = [call('s', 'read_file', { path: 'slow' }), call('f', 'read_file', { path: 'fast' })];
 const { steps } = await step(load(bridge), calls, { stopAfter: 40 });
 assert.deepEqual(toolSteps(steps), [['s', CANCELLED], ['f', 'contents of fast']]);
});
