'use strict';

// Sign in with ChatGPT: the OAuth flow of OpenAI's Codex CLI, which OpenAI lets other coding tools use too,
// so the ChatGPT plan (Free, Plus or Pro) pays for the models. Tokens stay in the main process, encrypted with the OS keychain.
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { app, safeStorage, shell } = require('electron');

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ISSUER = 'https://auth.openai.com';
const PORT = 1455;
const REDIRECT = `http://localhost:${PORT}/auth/callback`;
const ORIGINATOR = 'openghost';
const LOGIN_TIMEOUT = 5 * 60 * 1000;
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
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

// The page the browser shows once ChatGPT has sent the user back: a white card on black with the ghost, a sign of how
// it went (a green tick, or a red cross), a line of words and, when there is an app to go back to, a button that brings
// OpenGhost to the front. English only: the page is the same for everyone. The text may come from the address the
// browser was sent back to, so it goes into the page as text only.
const GHOST = '<svg viewBox="-1 -1 60 62" aria-hidden="true"><path fill="#0f0f0f" d="M0 29A29 29 0 0 1 58 29L58 57A2.5 2.5 0 0 1 53 57A6 6 0 0 0 41 57A3 3 0 0 1 35 57A6 6 0 0 0 23 57A3 3 0 0 1 17 57A6 6 0 0 0 5 57A2.5 2.5 0 0 1 0 57Z"/><ellipse fill="#fff" cx="17" cy="29.5" rx="3.8" ry="4.1"/><ellipse fill="#fff" cx="41" cy="29.5" rx="3.8" ry="4.1"/></svg>';
const SIGNS = {
 ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.6l3.6 3.6 7.4-8.2"/></svg>',
 bad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/></svg>',
};
function page(title, text, { sign = 'ok', button = '' } = {}) {
 text = String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
 return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>
  *{box-sizing:border-box}html{color-scheme:dark;background:#000}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font:500 15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  main{width:min(100%,400px);padding:30px 32px 32px;border-radius:28px;background:#fff;color:#0f0f0f;text-align:center;animation:in .6s cubic-bezier(.32,.72,0,1) both}
  .brand{display:flex;align-items:center;justify-content:center;gap:9px;font-size:15px;font-weight:650;letter-spacing:-.01em}
  .brand svg{width:19px;height:20px}
  .sign{display:grid;place-items:center;width:72px;height:72px;margin:30px auto 22px;border-radius:50%;background:#e4f5e9;animation:pop .7s cubic-bezier(.34,1.4,.64,1) .12s both}
  .sign svg{width:34px;height:34px;fill:none;stroke:#23a559;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;stroke-dashoffset:24;animation:draw .5s cubic-bezier(.32,.72,0,1) .45s forwards}
  .sign.bad{background:#fbe9e7}.sign.bad svg{stroke:#d5483c}
  h1{margin:0 0 8px;font-size:23px;line-height:1.25;font-weight:680;letter-spacing:-.02em}
  p{margin:0;color:rgba(0,0,0,.56)}
  a{display:block;margin-top:28px;padding:13px 20px;border-radius:999px;background:#0f0f0f;color:#fff;font-weight:620;text-decoration:none;transition:transform .35s cubic-bezier(.34,1.4,.64,1),background-color .2s ease}
  a:hover{background:#262626}a:active{transform:scale(.97)}a:focus-visible{outline:2px solid #23a559;outline-offset:3px}
  @keyframes in{from{opacity:0;transform:translateY(10px) scale(.98)}}@keyframes pop{from{opacity:0;transform:scale(.6)}}@keyframes draw{to{stroke-dashoffset:0}}
  @media (prefers-reduced-motion:reduce){main,.sign,.sign svg{animation:none}.sign svg{stroke-dashoffset:0}}
 </style><main><div class="brand">${GHOST}<span>OpenGhost</span></div><div class="sign ${sign}">${SIGNS[sign]}</div><h1>${title}</h1><p>${text}</p>${button ? `<a href="/open">${button}</a>` : ''}</main>`;
}

// After the answer has come the address stays open a little longer, for the page's button: it brings OpenGhost to the
// front. One press, or two minutes, or another sign-in, and it is closed.
const LINGER = 2 * 60 * 1000;
let lingering = null;
function linger() {
 lingering?.();
 const servers = [];
 // Resolves once the address is free again, so that a new sign-in can take it at once.
 const close = () => {
  clearTimeout(timer);
  if (lingering === close) lingering = null;
  return Promise.all(servers.map(server => new Promise(resolve => { if (!server.listening) { resolve(); return; } server.close(resolve); server.closeAllConnections?.(); })));
 };
 const timer = setTimeout(close, LINGER);
 const handle = (request, response) => {
  if (new URL(request.url || '/', `http://localhost:${PORT}`).pathname !== '/open') { response.writeHead(404).end(); return; }
  app.emit('openghost:show');
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page('OpenGhost is open', 'You can close this tab.'));
  close();
 };
 // The servers of the sign-in itself are still letting the address go: it is asked for again until it is free.
 for (const host of HOSTS) {
  const server = http.createServer(handle);
  let tries = 0;
  server.on('error', error => { if (error.code === 'EADDRINUSE' && lingering === close && tries++ < 40) setTimeout(() => server.listen(PORT, host), 100); });
  server.listen(PORT, host);
  servers.push(server);
 }
 lingering = close;
}

function cancel() {
 attempt?.fail(failure('Sign-in cancelled'));
}

// Opens the OpenAI sign-in page in the browser and waits on the fixed local redirect the Codex client is registered with.
async function login() {
 cancel();
 await lingering?.();
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
   // The connection is not kept: the address is closed right after the answer and opened anew for the page's button.
   const html = (status, title, text, look) => response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' }).end(page(title, text, look));
   const BACK = { sign: 'bad', button: 'Back to OpenGhost' };
   if (error) { html(400, 'Sign-in failed', error, BACK); current.fail(failure(error)); linger(); return; }
   if (!value || url.searchParams.get('state') !== state) { html(400, 'Sign-in failed', 'The answer did not match this sign-in. Try again from OpenGhost.', BACK); current.fail(failure('Sign-in did not match, try again')); linger(); return; }
   html(200, 'You’re signed in', 'Your ChatGPT account is connected. You can close this tab and go back to the app.', { button: 'Open OpenGhost' });
   current.done(value);
   linger();
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

// A limit window as the app shows it: how long it runs, how much of it is used, and when it starts over.
function span(raw) {
 if (!raw) return null;
 const resets = Number(raw.reset_at) * 1000 || (raw.reset_after_seconds != null ? Date.now() + Number(raw.reset_after_seconds) * 1000 : 0);
 return { seconds: Number(raw.limit_window_seconds) || 0, used: Math.max(0, Math.min(100, Number(raw.used_percent) || 0)), resets };
}

const windows = limit => [span(limit?.primary_window), span(limit?.secondary_window)].filter(Boolean);

// The subscription's limits as ChatGPT keeps them: the plan, each window with how much of it is used and when it starts over,
// limits of their own for some models, and credits. It is the read the Codex CLI makes for its usage screen and uses nothing up.
// Which windows a plan has changes over time (a five-hour one comes and goes), so they are taken as they come.
async function limits() {
 const account = await credentials();
 const headers = { Authorization: `Bearer ${account.access}`, originator: ORIGINATOR, 'User-Agent': `OpenGhost/${app.getVersion()} (${os.platform()} ${os.release()}; ${os.arch()})` };
 if (account.account) headers['ChatGPT-Account-Id'] = account.account;
 const response = await fetch(USAGE_URL, { headers });
 if (!response.ok) throw failure(`ChatGPT limits are unavailable (${response.status})`, response.status);
 const body = await response.json();
 const credits = body.credits || {};
 return {
  plan: body.plan_type || account.plan || '',
  windows: windows(body.rate_limit),
  reached: !!body.rate_limit?.limit_reached,
  models: (body.additional_rate_limits || []).map(item => ({ name: item.limit_name || item.metered_feature || '', windows: windows(item.rate_limit) })).filter(item => item.name && item.windows.length),
  credits: credits.unlimited ? { unlimited: true } : credits.has_credits ? { balance: String(credits.balance ?? '') } : null,
 };
}

module.exports = { login, cancel, logout, status, credentials, limits, ORIGINATOR };
