'use strict';

// API keys stay in the main process, in one file encrypted with the OS keychain, the way the ChatGPT sign-in is kept.
// The page asks for them once at start and hands over each change; it keeps none in its own storage.
const fs = require('node:fs');
const path = require('node:path');
const { app, ipcMain, safeStorage } = require('electron');

// One slot per provider that takes a key; the custom server's key is the fourth.
const NAMES = new Set(['openai', 'anthropic', 'deepseek', 'custom']);
const MAX_LENGTH = 4096;

let cache;
let writing = Promise.resolve();

const file = () => path.join(app.getPath('userData'), 'store', 'auth', 'keys.bin');

async function load() {
 if (cache) return cache;
 try {
  const data = await fs.promises.readFile(file());
  const saved = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString('utf8'));
  cache = Object.fromEntries([...NAMES].filter(name => typeof saved[name] === 'string' && saved[name]).map(name => [name, saved[name]]));
 } catch {
  cache = {};
 }
 return cache;
}

// Writes queue up, so two quick changes never race for the file; with no keys left the file goes.
function save() {
 writing = writing.catch(() => {}).then(async () => {
  if (!Object.keys(cache).length) {
   await fs.promises.rm(file(), { force: true });
   return;
  }
  await fs.promises.mkdir(path.dirname(file()), { recursive: true });
  const text = JSON.stringify(cache);
  await fs.promises.writeFile(file(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : text);
 });
 return writing;
}

async function read() {
 return { ...await load() };
}

async function write(name, value) {
 if (!NAMES.has(name)) throw new Error(`Unknown key: ${name}`);
 if (typeof value !== 'string' || value.length > MAX_LENGTH) throw new Error('Not a key');
 await load();
 if (value) cache[name] = value;
 else delete cache[name];
 await save();
}

function register(fromApp) {
 ipcMain.handle('keys:read', event => fromApp(event) ? read() : {});
 ipcMain.handle('keys:write', (event, name, value) => { if (fromApp(event)) return write(name, value); });
}

module.exports = { register, read, write };
