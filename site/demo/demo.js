// The website's demo: the real OpenGhost interface, with the models' replies written in advance (demo-scenarios.js).
// Nothing leaves the page and no key is needed. Loaded before every other script of the app.

// A page inside a frame inside another site's frame (the website shown in a viewer) gets animation-frame times counted
// from the outer page's start, seconds behind performance.now(). The app measures its animations against
// performance.now(), so typed letters and drawings would wait those seconds hidden. Every frame gets the page's own time.
(() => {
 const raf = window.requestAnimationFrame.bind(window);
 window.requestAnimationFrame = callback => raf(() => callback(performance.now()));
})();

(() => {
'use strict';

const VERSION = '3';
const KEYS = { anthropic: 'anthropic.apiKey', openai: 'openai.apiKey', deepseek: 'deepseek.apiKey', openrouter: 'openrouter.apiKey', local: 'local.address' };
const DEMO_KEYS = { anthropic: 'sk-ant-demo', openai: 'sk-demo', deepseek: 'sk-demo', openrouter: 'sk-or-demo', local: 'http://localhost:11434' };
const FIRST_MODEL = 'anthropic:claude-opus-5-5';

const store = {
 get: key => { try { return localStorage.getItem(key); } catch { return null; } },
 set: (key, value) => { try { localStorage.setItem(key, value); } catch {} },
 drop: key => { try { localStorage.removeItem(key); } catch {} },
};

// The website says which language and theme to open in. Taken once, then cleared from the address: the app's own
// reload after a language picked in its settings must keep that choice.
const params = new URLSearchParams(location.search);
if (['en', 'ru', 'it', 'fr'].includes(params.get('lang'))) store.set('openghost.lang', params.get('lang'));
if (['light', 'dark', 'system'].includes(params.get('theme'))) store.set('openghost.theme', params.get('theme'));
if (location.search) history.replaceState(null, '', location.pathname + location.hash);

// Every provider is connected, with keys that only this page knows. A visitor from an earlier version of the demo
// starts over with the new catalog.
if (store.get('openghost.demo') !== VERSION) {
 store.drop('openghost.catalog');
 store.set('openghost.model', FIRST_MODEL);
 store.set('openghost.demo', VERSION);
}
for (const [provider, name] of Object.entries(KEYS)) if (!store.get(name)) store.set(name, DEMO_KEYS[provider]);
if (!store.get('openghost.model')) store.set('openghost.model', FIRST_MODEL);

// The models each provider lists, in the shapes the app's own providers give them.
const ALL = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const claude = (api, name, context, efforts = ALL) => ({ id: `anthropic:${api}`, provider: 'anthropic', api, name, context, output: 128000, vision: true, efforts, defaultEffort: 'high', thinking: 'adaptive' });
const gpt = (api, name, context, efforts, vision = true) => ({ id: `openai:${api}`, provider: 'openai', api, name, context, vision, efforts, defaultEffort: efforts.includes('medium') ? 'medium' : efforts[0] });
const routed = (api, group, name, context, { vision = false, think = true } = {}) => ({
 id: `openrouter:${api}`, provider: 'openrouter', api, name, group, context, output: 0, vision, tools: true,
 ...(think ? { efforts: ['none', 'low', 'medium', 'high'], defaultEffort: 'medium', thinking: 'switch' } : { efforts: ['none'], defaultEffort: 'none', thinking: 'none' }),
});
const NONE = { efforts: ['none'], defaultEffort: 'none', thinking: 'none' };
const local = (api, context, think = NONE, vision = false) => ({ id: `local:${api}`, provider: 'local', api, name: api, context, limit: context, output: 0, vision, tools: true, ...think });

const CATALOG = {
 anthropic: [
  claude('claude-fable-5-1', 'Claude Fable 5.1', 1000000),
  claude('claude-opus-5-5', 'Claude Opus 5.5', 1000000),
  claude('claude-sonnet-5-5', 'Claude Sonnet 5.5', 1000000),
  claude('claude-haiku-5-5', 'Claude Haiku 5.5', 1000000, ['none', 'low', 'medium', 'high']),
  claude('claude-opus-5', 'Claude Opus 5', 1000000),
  claude('claude-sonnet-5', 'Claude Sonnet 5', 1000000),
  claude('claude-opus-4-8', 'Claude Opus 4.8', 1000000),
  { ...claude('claude-haiku-4-5', 'Claude Haiku 4.5', 200000, ['none', 'low', 'high']), output: 64000, thinking: 'budget' },
 ],
 openai: [
  gpt('gpt-5.2', 'GPT-5.2', 400000, ['none', 'low', 'medium', 'high', 'xhigh']),
  gpt('gpt-5.2-pro', 'GPT-5.2 Pro', 400000, ['medium', 'high', 'xhigh']),
  gpt('gpt-5.1-codex', 'GPT-5.1 Codex', 400000, ['low', 'medium', 'high']),
  gpt('gpt-5-mini', 'GPT-5 mini', 400000, ['minimal', 'low', 'medium', 'high']),
  gpt('gpt-5-nano', 'GPT-5 nano', 400000, ['minimal', 'low', 'medium', 'high']),
  gpt('gpt-4.1', 'GPT-4.1', 1047576, ['none']),
 ],
 deepseek: [
  { id: 'deepseek:deepseek-reasoner', provider: 'deepseek', api: 'deepseek-reasoner', name: 'DeepSeek Reasoner', context: 128000, efforts: ['none', 'low', 'high', 'max'], defaultEffort: 'high', vision: false },
  { id: 'deepseek:deepseek-chat', provider: 'deepseek', api: 'deepseek-chat', name: 'DeepSeek Chat', context: 128000, efforts: ['none'], defaultEffort: 'none', vision: false },
 ],
 openrouter: [
  routed('google/gemini-3-pro-preview', 'Google', 'Gemini 3 Pro Preview', 1048576, { vision: true }),
  routed('google/gemini-2.5-flash', 'Google', 'Gemini 2.5 Flash', 1048576, { vision: true }),
  routed('google/gemma-3-27b-it', 'Google', 'Gemma 3 27B', 131072, { vision: true, think: false }),
  routed('x-ai/grok-4', 'xAI', 'Grok 4', 256000, { vision: true }),
  routed('x-ai/grok-4-fast', 'xAI', 'Grok 4 Fast', 2000000, { vision: true }),
  routed('meta-llama/llama-4-maverick', 'Meta', 'Llama 4 Maverick', 1048576, { vision: true, think: false }),
  routed('meta-llama/llama-3.3-70b-instruct', 'Meta', 'Llama 3.3 70B Instruct', 131072, { think: false }),
  routed('mistralai/mistral-medium-3.1', 'Mistral', 'Mistral Medium 3.1', 131072, { vision: true, think: false }),
  routed('mistralai/codestral-2508', 'Mistral', 'Codestral 2508', 256000, { think: false }),
  routed('qwen/qwen3-max', 'Qwen', 'Qwen3 Max', 262144),
  routed('qwen/qwen3-coder', 'Qwen', 'Qwen3 Coder 480B A35B', 262144, { think: false }),
  routed('qwen/qwen3-235b-a22b-thinking-2507', 'Qwen', 'Qwen3 235B A22B Thinking 2507', 262144),
  routed('moonshotai/kimi-k2-thinking', 'MoonshotAI', 'Kimi K2 Thinking', 262144),
  routed('moonshotai/kimi-k2-0905', 'MoonshotAI', 'Kimi K2 0905', 262144, { think: false }),
  routed('z-ai/glm-4.6', 'Z.AI', 'GLM 4.6', 202752),
  routed('minimax/minimax-m2', 'MiniMax', 'MiniMax M2', 196608),
  routed('deepseek/deepseek-v3.2-exp', 'DeepSeek', 'DeepSeek V3.2 Exp', 163840),
  routed('deepseek/deepseek-r1-0528', 'DeepSeek', 'R1 0528', 163840),
  routed('openai/gpt-oss-120b', 'OpenAI', 'gpt-oss-120b', 131072),
  routed('openai/gpt-5.2', 'OpenAI', 'GPT-5.2', 400000, { vision: true }),
  routed('anthropic/claude-opus-5.5', 'Anthropic', 'Claude Opus 5.5', 1000000, { vision: true }),
  routed('anthropic/claude-sonnet-5.5', 'Anthropic', 'Claude Sonnet 5.5', 1000000, { vision: true }),
 ],
 // As Ollama lists them: by the names its own commands take.
 local: [
  local('gpt-oss:20b', 131072, { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium', thinking: 'levels' }),
  local('qwen3:30b', 262144, { efforts: ['none', 'on'], defaultEffort: 'on', thinking: 'levels' }),
  local('gemma3:27b', 131072, NONE, true),
  local('deepseek-r1:14b', 131072, { efforts: ['on'], defaultEffort: 'on', thinking: 'fixed' }),
  local('mistral-small3.2:24b', 131072, NONE, true),
  local('llama3.1:8b', 131072),
  local('qwen2.5-coder:14b', 32768),
  local('phi4:14b', 16384),
 ],
};

// The question decides the reply, and the language it is written in decides the reply's language.
function pick(text = '') {
 const { SCENARIOS, FALLBACK } = window.DemoScenarios;
 const scenario = SCENARIOS.find(item => item.match.test(text)) || FALLBACK;
 const lang = /[Ѐ-ӿ]/.test(text) || (!/[a-z]/i.test(text) && store.get('openghost.lang') === 'ru') ? 'ru' : 'en';
 return scenario[lang];
}

function lastUser(messages = []) {
 for (let k = messages.length - 1; k >= 0; k--) {
  const message = messages[k];
  if (message.role !== 'user') continue;
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) return message.content.map(part => part.text || '').join(' ');
 }
 return '';
}

// Text goes out the way a model writes it: in small uneven pieces, a little faster through the drawings.
function pieces(text, size) {
 const out = [];
 for (let at = 0; at < text.length;) {
  const step = size + Math.floor(Math.random() * size);
  out.push(text.slice(at, at + step));
  at += step;
 }
 return out;
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
 if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
 const timer = setTimeout(resolve, ms);
 signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

// Small models write faster than large ones.
const pace = config => /haiku|flash|mini|nano|fast|8b|14b|chat/i.test(config.model || '') ? 0.6 : /opus|pro|max|fable/i.test(config.model || '') ? 1.15 : 1;

async function stream(config, { messages, signal, onReasoning, onContent }) {
 const reply = pick(lastUser(messages)), text = reply.reply.join('\n\n'), speed = pace(config);
 const partial = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null };
 try {
  await wait(380 * speed, signal);
  if (config.effort !== 'none') {
   for (const piece of pieces(reply.thinking, 3)) {
    partial.reasoning += piece;
    onReasoning?.(piece, partial);
    await wait(22 * speed, signal);
   }
   await wait(260, signal);
  }
  let inFence = false;
  for (const piece of pieces(text, 5)) {
   if ((piece.match(/```/g) || []).length % 2) inFence = !inFence;
   partial.content += piece;
   onContent?.(piece, partial);
   await wait((inFence ? 9 : 18) * speed, signal);
  }
 } catch (error) {
  if (error?.name === 'AbortError') throw Object.assign(new DOMException('Aborted', 'AbortError'), { partial });
  throw error;
 }
 const output = Math.round((partial.content.length + partial.reasoning.length) / 4);
 const usage = { prompt_tokens: 12400, completion_tokens: output, cached_tokens: 11200 };
 window.Usage?.record?.(config, usage);
 window.parent?.postMessage({ type: 'openghost-app', event: 'done' }, '*');
 return { ...partial, finishReason: 'stop', usage };
}

// Naming a chat: the title of the reply it got, found by the question alone (the reply follows it after a blank line).
// Other side jobs, such as tidying the memory, get no answer and leave things as they were.
async function complete(config, { messages }) {
 await wait(200);
 if (!/^Name this conversation/.test(messages[0]?.content || '')) return '';
 return pick(lastUser(messages).split('\n\n')[0]).title;
}

const copy = list => list.map(model => ({ ...model, efforts: model.efforts.slice() }));

// providers.js sets window.Providers once; the demo takes the object as it is set and answers in its place.
let providers = null;
Object.defineProperty(window, 'Providers', {
 configurable: true,
 get: () => providers,
 set: real => {
  providers = {
   ...real,
   models: async (provider, key, extra) => CATALOG[provider] ? copy(CATALOG[provider]) : real.models(provider, key, extra),
   stream,
   complete,
   account: async () => null,
  };
 },
});

// The balance DeepSeek is asked for, and anything else sent to its address, is answered here.
const API = 'https://api.deepseek.com';
const realFetch = window.fetch.bind(window);
window.fetch = async (input, options = {}) => {
 const url = typeof input === 'string' ? input : input?.url || '';
 if (!url.startsWith(API)) return realFetch(input, options);
 const body = url.slice(API.length).startsWith('/user/balance') ? { is_available: true, balance_infos: [{ currency: 'USD', total_balance: '20.00' }] } : {};
 return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const tell = data => { if (window.parent !== window) window.parent.postMessage({ type: 'openghost-app', ...data }, '*'); };

// The website talks to the demo: its theme, its language, and questions sent from its buttons, which land in the
// composer and go as if typed.
window.addEventListener('message', event => {
 const data = event.data;
 if (!data || data.type !== 'openghost-demo') return;
 if (['light', 'dark', 'system'].includes(data.theme)) {
  if (store.get('openghost.theme') !== data.theme) {
   store.set('openghost.theme', data.theme);
   window.Theme?.sync();
  }
  return;
 }
 if (['en', 'ru', 'it', 'fr'].includes(data.lang)) {
  if (window.I18n?.lang !== data.lang && window.I18n?.set(data.lang)) location.reload();
  return;
 }
 if (typeof data.prompt !== 'string') return;
 const input = document.querySelector('.composer-input');
 const send = document.querySelector('.composer-send');
 if (!input || !send) return;
 input.focus();
 input.value = data.prompt;
 input.dispatchEvent(new Event('input', { bubbles: true }));
 setTimeout(() => {
  send.removeAttribute('disabled');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
 }, 120);
});

// The app tells the website what it shows: the theme (also when picked in the app's own settings) and the language,
// once every script has run.
document.addEventListener('DOMContentLoaded', () => window.Theme?.onChange(theme => tell({ theme })));
window.addEventListener('load', () => tell({ ready: true, theme: window.Theme?.current, lang: window.I18n?.lang }));
})();

// On a phone-sized frame the sidebar would leave the chat no room: the demo starts with it folded away.
window.addEventListener('load', () => {
 if (innerWidth >= 720) return;
 document.querySelector('.sidebar-toggle')?.dispatchEvent(new CustomEvent('sidebar-toggle'));
});

// Inside the website the demo must never pull the page down to itself: focus moves without scrolling until the
// visitor clicks or types in the app.
if (window.top !== window) {
 // An autofocus would scroll the website to the frame as the page is read: it is taken off every element as it arrives.
 new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) {
   if (node.nodeType !== 1) continue;
   if (node.hasAttribute('autofocus')) node.removeAttribute('autofocus');
   for (const inner of node.querySelectorAll?.('[autofocus]') || []) inner.removeAttribute('autofocus');
  }
 }).observe(document.documentElement, { childList: true, subtree: true });
 const focus = HTMLElement.prototype.focus;
 let touched = false;
 for (const type of ['pointerdown', 'keydown']) addEventListener(type, () => { touched = true; }, { capture: true, once: true });
 HTMLElement.prototype.focus = function (options) { return focus.call(this, touched ? options : { ...options, preventScroll: true }); };
 document.addEventListener('DOMContentLoaded', () => document.querySelector('.composer-input')?.removeAttribute('autofocus'));
}
