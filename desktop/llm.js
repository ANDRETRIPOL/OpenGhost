'use strict';

// Requests to OpenAI, Anthropic and OpenRouter run here in the main process: the Codex backend and the ChatGPT sign-in are out of reach of the page.
// The page starts a run by id and gets its deltas, then the result or the error, back as events.
const { app, ipcMain } = require('electron');
const OpenAI = require('./openai');
const Claude = require('./anthropic');
const ChatGPT = require('./chatgpt');
const OpenRouter = require('./openrouter');

const runs = new Map();
const ENGINES = { openai: OpenAI, chatgpt: OpenAI, anthropic: Claude, openrouter: OpenRouter };
const PROVIDERS = new Set(Object.keys(ENGINES));

const engine = provider => ENGINES[provider];

async function start(sender, id, request) {
 const controller = new AbortController();
 runs.set(id, controller);
 const send = data => { if (!sender.isDestroyed()) sender.send('llm:event', { id, ...data }); };
 try {
  if (!PROVIDERS.has(request?.provider)) throw new Error('Unknown provider');
  const result = await engine(request.provider).stream(request, {
   signal: controller.signal,
   onEvent: send,
   chatgpt: ChatGPT.credentials,
   version: app.getVersion(),
  });
  send({ type: 'done', result });
 } catch (error) {
  const aborted = controller.signal.aborted || error.name === 'AbortError';
  send({ type: 'error', aborted, status: error.status || 0, code: error.code || '', message: aborted ? '' : error.message });
 } finally {
  runs.delete(id);
 }
}

function register(fromApp) {
 ipcMain.on('llm:start', (event, id, request) => { if (fromApp(event)) start(event.sender, id, request); });
 ipcMain.on('llm:abort', (event, id) => { if (fromApp(event)) runs.get(id)?.abort(); });
 ipcMain.handle('llm:models', async (event, provider, key) => {
  if (!fromApp(event) || !PROVIDERS.has(provider)) return { models: [] };
  try {
   return { models: await engine(provider).models({ provider, key }, { chatgpt: ChatGPT.credentials, version: app.getVersion() }) };
  } catch (error) {
   return { error: { status: error.status || 0, code: error.code || '', message: error.message } };
  }
 });
 // What a provider tells of the account behind a key, where it tells anything.
 ipcMain.handle('llm:account', async (event, provider, key) => {
  if (!fromApp(event) || typeof engine(provider)?.account !== 'function') return null;
  try {
   return { account: await engine(provider).account({ provider, key }) };
  } catch (error) {
   return { error: error.message, status: error.status || 0 };
  }
 });
 const auth = action => async event => {
  if (!fromApp(event)) return { connected: false };
  try {
   return await action();
  } catch (error) {
   return { ...(await ChatGPT.status()), error: error.message };
  }
 };
 ipcMain.handle('auth:login', auth(() => ChatGPT.login()));
 ipcMain.handle('auth:logout', auth(() => ChatGPT.logout()));
 ipcMain.handle('auth:status', auth(() => ChatGPT.status()));
 ipcMain.handle('auth:cancel', auth(async () => { ChatGPT.cancel(); return ChatGPT.status(); }));
 ipcMain.handle('auth:limits', async event => {
  if (!fromApp(event)) return null;
  try {
   return { limits: await ChatGPT.limits() };
  } catch (error) {
   return { error: error.message, status: error.status || 0 };
  }
 });
}

function cancelAll() {
 for (const controller of runs.values()) controller.abort();
 ChatGPT.cancel();
}

module.exports = { register, cancelAll };
