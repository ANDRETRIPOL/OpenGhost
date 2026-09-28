'use strict';

// API key store: OS keychain via safeStorage, same pattern as chatgpt.js.
// Renderer never touches disk directly; it talks to this module over IPC (see preload.js).
// When no keychain is available (headless Linux without secret-service) we fall back to
// a 0600 file with a clear `encrypted: false` status so the UI can warn instead of crashing.
const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage, ipcMain } = require('electron');

const PROVIDERS = ['openai', 'anthropic', 'deepseek'];

const file = () => path.join(app.getPath('userData'), 'store', 'auth', 'keys.bin');

const blank = () => ({ openai: '', anthropic: '', deepseek: '' });
const clean = value => (typeof value === 'string' ? value.trim() : '');

let cache;
// Read-modify-write cycles run one at a time so overlapping IPC writes can't
// interleave and leave an older value on disk (same idea as the write queue in main.js).
let queue = Promise.resolve();

const serialized = job => {
 const next = queue.catch(() => {}).then(job);
 queue = next.catch(() => {});
 return next;
};

async function loadAll() {
 if (cache !== undefined) return cache;
 try {
  const data = await fs.promises.readFile(file());
  const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString('utf8');
  const parsed = JSON.parse(text) || {};
  cache = { ...blank(), ...Object.fromEntries(PROVIDERS.map(name => [name, clean(parsed[name])])) };
 } catch {
  cache = blank();
 }
 return cache;
}

async function saveAll(next) {
 const saved = { ...blank(), ...Object.fromEntries(PROVIDERS.map(name => [name, clean(next[name])])) };
 await fs.promises.mkdir(path.dirname(file()), { recursive: true });
 const text = JSON.stringify(saved);
 const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
 // 0600 so only this user can read the fallback file. Electron's safeStorage already restricts the OS entry.
 await fs.promises.writeFile(file(), data, { mode: 0o600 });
 try { await fs.promises.chmod(file(), 0o600); } catch {}
 // The cache only learns the new state once it is really on disk, so a failed
 // save can't leave reads returning a value that was never stored.
 cache = saved;
 return cache;
}

async function write(provider, key) {
 const all = await loadAll();
 return saveAll({ ...all, [provider]: clean(key) });
}

async function remove(provider) {
 const all = await loadAll();
 return saveAll({ ...all, [provider]: '' });
}

function status() {
 return { encrypted: safeStorage.isEncryptionAvailable() };
}

function register(fromApp) {
 ipcMain.handle('keys:read', event => {
  if (!fromApp(event)) return blank();
  return serialized(loadAll);
 });
 ipcMain.handle('keys:status', event => {
  if (!fromApp(event)) return { encrypted: false };
  return status();
 });
 ipcMain.handle('keys:write', (event, provider, key) => {
  if (!fromApp(event) || !PROVIDERS.includes(provider)) return null;
  return serialized(() => write(provider, key));
 });
 ipcMain.handle('keys:remove', (event, provider) => {
  if (!fromApp(event) || !PROVIDERS.includes(provider)) return null;
  return serialized(() => remove(provider));
 });
}

module.exports = { PROVIDERS, loadAll, saveAll, status, register };
