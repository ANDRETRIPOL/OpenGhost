'use strict';

// The key store in the main process, with Electron stood in for: a data folder in a temp directory and a keychain that
// reverses its own encryption, so a file on disk can be told from its contents.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openghost-keys-'));
const handlers = {};
const electron = {
 app: { getPath: () => dir },
 ipcMain: { handle: (channel, handler) => { handlers[channel] = handler; } },
 safeStorage: {
  available: true,
  isEncryptionAvailable: () => electron.safeStorage.available,
  encryptString: text => Buffer.from(`sealed:${text}`),
  decryptString: data => data.toString('utf8').slice('sealed:'.length),
 },
};
const load = Module._load;
Module._load = function (request, ...rest) {
 return request === 'electron' ? electron : load.call(this, request, ...rest);
};
const Keys = require('../desktop/keys');

const file = path.join(dir, 'store', 'auth', 'keys.bin');
const onDisk = () => fs.readFileSync(file, 'utf8');

before(() => Keys.register(event => event.trusted));
after(() => { Module._load = load; fs.rmSync(dir, { recursive: true, force: true }); });

describe('key store', () => {
 test('starts empty, with no file', async () => {
  assert.deepEqual(await Keys.read(), {});
  assert.equal(fs.existsSync(file), false);
 });

 test('a key written is read back, and sits sealed on disk', async () => {
  await Keys.write('deepseek', 'sk-deep');
  assert.deepEqual(await Keys.read(), { deepseek: 'sk-deep' });
  assert.equal(onDisk(), 'sealed:{"deepseek":"sk-deep"}');
 });

 test('quick changes land in order, and the last one is what stays', async () => {
  await Promise.all([Keys.write('openai', 'sk-1'), Keys.write('openai', 'sk-2'), Keys.write('custom', 'not-a-secret')]);
  assert.deepEqual(await Keys.read(), { deepseek: 'sk-deep', openai: 'sk-2', custom: 'not-a-secret' });
  assert.equal(onDisk(), 'sealed:{"deepseek":"sk-deep","openai":"sk-2","custom":"not-a-secret"}');
 });

 test('what is read is a copy', async () => {
  const keys = await Keys.read();
  keys.deepseek = 'changed';
  assert.equal((await Keys.read()).deepseek, 'sk-deep');
 });

 test('an empty key removes the slot, and the last one removed takes the file with it', async () => {
  await Keys.write('openai', '');
  await Keys.write('custom', '');
  assert.deepEqual(await Keys.read(), { deepseek: 'sk-deep' });
  await Keys.write('deepseek', '');
  assert.deepEqual(await Keys.read(), {});
  assert.equal(fs.existsSync(file), false);
 });

 test('only a provider\'s slot takes a key, and only a key', async () => {
  await assert.rejects(Keys.write('chatgpt', 'x'), /Unknown key/);
  await assert.rejects(Keys.write('openai', 42), /Not a key/);
  await assert.rejects(Keys.write('openai', 'k'.repeat(5000)), /Not a key/);
 });

 test('without a keychain the file holds the keys as they are', async () => {
  electron.safeStorage.available = false;
  await Keys.write('anthropic', 'sk-ant');
  assert.equal(onDisk(), '{"anthropic":"sk-ant"}');
  electron.safeStorage.available = true;
  await Keys.write('anthropic', '');
 });

 test('the page reaches the store only from the app itself', async () => {
  assert.deepEqual(await handlers['keys:read']({ trusted: false }), {});
  assert.equal(await handlers['keys:write']({ trusted: false }, 'openai', 'sk-x'), undefined);
  assert.deepEqual(await Keys.read(), {});
  await handlers['keys:write']({ trusted: true }, 'openai', 'sk-x');
  assert.deepEqual(await handlers['keys:read']({ trusted: true }), { openai: 'sk-x' });
 });
});
