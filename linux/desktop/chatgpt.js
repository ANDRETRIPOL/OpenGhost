'use strict';

// Sign in with ChatGPT: the OAuth flow of OpenAI's Codex CLI, which OpenAI lets other coding tools use too,
// so the ChatGPT plan (Free, Plus or Pro) pays for the models. Tokens stay in the main process, encrypted with the OS keychain.
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, safeStorage, shell } = require('electron');

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ISSUER = 'https://auth.openai.com';
const PORT = 1455;
const REDIRECT = `http://localhost:${PORT}/auth/callback`;
const ORIGINATOR = 'openghost';
const LOGIN_TIMEOUT = 5 * 60 * 1000;
const EARLY_REFRESH = 60 * 1000;
const HOSTS = ['127.0.0.1', '::1'];

let cache;
let refreshing = null;
let attempt = null;

const file = () => path.join(app.getPath('userData'), 'store', 'auth', 'chatgpt.bin');
const base64url = buffer => Buffer.from(buffer).toString('base64url');
const failure = (message, status = 0) => Object.assign(new Error(message), { status });

function claims(token) {
 try {
  return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());
 } catch {
  return {};
 }
}

// The account id, e-mail and plan come from the id token; a refresh keeps whatever the new tokens leave out.
function describe(tokens, previous = {}) {
 const id = claims(tokens.id_token), access = claims(tokens.access_token);
 const auth = id['https://api.openai.com/auth'] || access['https://api.openai.com/auth'] || {};
 const residency = auth.chatgpt_compute_residency || access.chatgpt_compute_residency;
 return {
  access: tokens.access_token,
  refresh: tokens.refresh_token || previous.refresh,
  expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  account: id.chatgpt_account_id || auth.chatgpt_account_id || id.organizations?.[0]?.id || previous.account || '',
  email: id.email || previous.email || '',
  plan: auth.chatgpt_plan_type || previous.plan || '',
  residency: residency && residency !== 'no_constraint' ? residency : '',
 };
}

async function load() {
 if (cache !== undefined) return cache;
 try {
  const data = await fs.promises.readFile(file());
  cache = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString('utf8'));
 } catch {
  cache = null;
 }
 return cache;
}

async function save(value) {
 cache = value;
 if (!value) {
  await fs.promises.rm(file(), { force: true });
  return;
 }
 await fs.promises.mkdir(path.dirname(file()), { recursive: true });
 const text = JSON.stringify(value);
 await fs.promises.writeFile(file(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : text);
}

async function token(params) {
 const response = await fetch(`${ISSUER}/oauth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString(),
 });
 if (!response.ok) throw failure(`ChatGPT sign-in failed (${response.status})`, response.status);
 return response.json();
}

function page(title, text) {
 return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>
  html{color-scheme:dark;background:#161616}body{margin:0;min-height:100vh;display:grid;place-items:center;font:500 15px system-ui,"Segoe UI",sans-serif;color:rgba(255,255,255,.85)}
  main{text-align:center}h1{margin:0 0 8px;font-size:22px;font-weight:650;letter-spacing:-.01em;color:#fafafa}p{margin:0;color:rgba(255,255,255,.55)}
 </style><main><h1>${title}</h1><p>${text}</p></main>`;
}

function cancel() {
 attempt?.fail(failure('Sign-in cancelled'));
}

// Opens the OpenAI sign-in page in the browser and waits on the fixed local redirect the Codex client is registered with.
async function login() {
 cancel();
 const verifier = base64url(crypto.randomBytes(48));
 const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
 const state = base64url(crypto.randomBytes(32));
 const code = await new Promise((resolve, reject) => {
  const servers = [];
  const current = attempt = {
   fail: error => { finish(); reject(error); },
   done: value => { finish(); resolve(value); },
  };
  const timer = setTimeout(() => current.fail(failure('Sign-in took too long, try again')), LOGIN_TIMEOUT);
  function finish() {
   clearTimeout(timer);
   for (const server of servers) server.close();
   if (attempt === current) attempt = null;
  }
  const handle = (request, response) => {
   const url = new URL(request.url || '/', `http://localhost:${PORT}`);
   if (url.pathname !== '/auth/callback') { response.writeHead(404).end(); return; }
   const error = url.searchParams.get('error_description') || url.searchParams.get('error');
   const value = url.searchParams.get('code');
   const html = (status, title, text) => response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(title, text));
   if (error) { html(400, 'Sign-in failed', error); current.fail(failure(error)); return; }
   if (!value || url.searchParams.get('state') !== state) { html(400, 'Sign-in failed', 'The answer did not match this sign-in. Try again from OpenGhost.'); current.fail(failure('Sign-in did not match, try again')); return; }
   html(200, 'Signed in to OpenGhost', 'You can close this tab and go back to the app.');
   current.done(value);
  };
  // Both loopback addresses listen, since the browser may resolve localhost to either.
  let listening = 0, failed = 0;
  for (const host of HOSTS) {
   const server = http.createServer(handle);
   servers.push(server);
   server.once('error', error => {
    if (++failed < HOSTS.length || listening) return;
    current.fail(failure(error.code === 'EADDRINUSE' ? `Port ${PORT} is busy: close Codex or another app that is signing in to ChatGPT` : error.message));
   });
   server.listen(PORT, host, () => {
    if (listening++) return;
    const params = new URLSearchParams({
     response_type: 'code',
     client_id: CLIENT_ID,
     redirect_uri: REDIRECT,
     scope: 'openid profile email offline_access',
     code_challenge: challenge,
     code_challenge_method: 'S256',
     id_token_add_organizations: 'true',
     codex_cli_simplified_flow: 'true',
     state,
     originator: ORIGINATOR,
    });
    shell.openExternal(`${ISSUER}/oauth/authorize?${params}`);
   });
  }
 });
 const account = describe(await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier }));
 await save(account);
 return status();
}

async function logout() {
 cancel();
 await save(null);
 return status();
}

async function status() {
 const account = await load();
 return account ? { connected: true, email: account.email, plan: account.plan } : { connected: false };
}

// A valid access token for the Codex backend, refreshed a minute before it runs out; one refresh serves every waiting request.
async function credentials() {
 const account = await load();
 if (!account) throw failure('Sign in to ChatGPT in settings first', 401);
 if (account.access && account.expires - EARLY_REFRESH > Date.now()) return account;
 refreshing ||= token({ grant_type: 'refresh_token', refresh_token: account.refresh })
  .then(async tokens => {
   const next = describe(tokens, account);
   await save(next);
   return next;
  }, async error => {
   if (error.status === 400 || error.status === 401) await save(null);
   throw failure('The ChatGPT sign-in has expired, sign in again in settings', 401);
  })
  .finally(() => { refreshing = null; });
 return refreshing;
}

module.exports = { login, cancel, logout, status, credentials, ORIGINATOR };
