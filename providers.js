(() => {
'use strict';

// Every model call goes through here: DeepSeek straight from the page, OpenAI, ChatGPT, Anthropic and OpenRouter through the main process.
// Whatever the provider, a call resolves to the same result: content, reasoning, tool calls, finish reason and usage.
const bridge = window.openghost?.llm || null;
const listeners = new Map();
bridge?.onEvent(data => listeners.get(data.id)?.(data));

// The least window a model needs to hold the agent's instructions and tools (about 12,400 tokens) and still answer.
const NEED = 16000;
const NAMES = { deepseek: 'DeepSeek', openai: 'OpenAI', chatgpt: 'ChatGPT', anthropic: 'Anthropic', openrouter: 'OpenRouter', local: 'Local', custom: 'Custom API' };

class ProviderError extends Error {
 constructor(message, status = 0) {
  super(message);
  this.name = 'ProviderError';
  this.status = status;
 }
}

function explain(provider, { status = 0, code = '', message = '' }) {
 const name = NAMES[provider] || provider;
 // A local server is the user's own program: when it is not there the app says so in plain words, and when it answers
 // with an error, its own words say more than a status would (a model too large for the memory, a name it does not know).
 if (provider === 'local') return code === 'network' ? I18n.t('error.local') : message || I18n.t('error.statusOf', { provider: name, status });
 // A service at the user's own address: the same, but a key it does not take is said as with any other provider.
 if (provider === 'custom' && status !== 401) return code === 'network' ? I18n.t('error.custom') : message || I18n.t('error.statusOf', { provider: name, status });
 if (code === 'network') return I18n.t('error.connect', { provider: name });
 if (status === 401) return I18n.t(provider === 'chatgpt' ? 'error.signin' : 'error.key', { provider: name });
 if (status === 402 || code === 'insufficient_quota' || code === 'billing_error') return I18n.t('error.quota', { provider: name });
 if (status === 429) return I18n.t('error.rate', { provider: name });
 if (status >= 500) return I18n.t('error.server', { provider: name });
 return message || I18n.t('error.statusOf', { provider: name, status });
}

const aborted = partial => Object.assign(new DOMException('Aborted', 'AbortError'), { partial });

// `once`: a request nothing will follow, so there is no point in paying a provider to keep its start in a cache.
function viaMain(config, { messages, tools, signal, onReasoning, onContent, maxTokens, session, once = false, aside = false }) {
 if (!bridge) return Promise.reject(new ProviderError(I18n.t('error.desktop', { provider: NAMES[config.provider] })));
 const id = `llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
 const request = {
  provider: config.provider, key: config.key, address: config.address, window: config.window, model: config.model, effort: config.effort, vision: config.vision,
  thinking: config.thinking, output: config.output, messages, tools, maxTokens, session, once, aside,
 };
 return new Promise((resolve, reject) => {
  const partial = { content: '', reasoning: '', toolCalls: [], finishReason: null, usage: null };
  if (signal?.aborted) { reject(aborted(partial)); return; }
  const stop = () => bridge.abort(id);
  const finish = () => {
   listeners.delete(id);
   signal?.removeEventListener('abort', stop);
  };
  listeners.set(id, event => {
   if (event.type === 'content') {
    partial.content += event.delta;
    onContent?.(event.delta, partial);
   } else if (event.type === 'reasoning') {
    partial.reasoning += event.delta;
    onReasoning?.(event.delta, partial);
   } else if (event.type === 'done') {
    finish();
    // The provider learned something about the model on the way: what the picker and the effort control show is out of date.
    if (event.result?.stale) window.dispatchEvent(new CustomEvent('models-stale', { detail: config.provider }));
    resolve({ ...partial, ...event.result });
   } else if (event.type === 'error') {
    finish();
    reject(event.aborted ? aborted(partial) : new ProviderError(explain(config.provider, event), event.status));
   }
  });
  signal?.addEventListener('abort', stop, { once: true });
  bridge.start(id, request);
 });
}

// Every answer's tokens go into the app's own count of usage, whatever the call was for.
function counted(config, result) {
 Usage.record(config, result.usage);
 return result;
}

async function stream(config, options) {
 // A model whose window is smaller than the agent's instructions would lose them without a word: said before it is asked.
 if (config.window && config.window < NEED) throw new ProviderError(I18n.t('error.window', { window: config.window.toLocaleString('en-US'), need: NEED.toLocaleString('en-US') }));
 if (config.provider !== 'deepseek') return counted(config, await viaMain(config, options));
 const { messages, tools, signal, onReasoning, onContent } = options;
 return counted(config, await DeepSeek.streamChat({ key: config.key, model: config.model, effort: config.effort, vision: config.vision, messages, tools, signal, onReasoning, onContent }));
}

// Short side jobs, such as naming a chat or compacting it, think as little as the model allows. `onUsage` hears what the job
// cost, for a chat that keeps count of its own tokens.
async function complete(config, { messages, signal, maxTokens = 40, onUsage }) {
 if (config.provider === 'deepseek') {
  const result = counted(config, await DeepSeek.complete({ key: config.key, model: config.model, messages, signal, maxTokens }));
  onUsage?.(result.usage);
  return result.content;
 }
 const efforts = config.efforts || [];
 const effort = efforts.includes('none') ? 'none' : efforts[0] || 'low';
 // A model that always thinks spends its room on thinking first, so it gets room for both.
 const room = config.provider === 'anthropic' || !efforts.includes('none') ? Math.max(maxTokens, 2048) : maxTokens;
 const result = counted(config, await viaMain({ ...config, effort }, { messages, signal, maxTokens: room, once: true }));
 onUsage?.(result.usage);
 return result.content.trim();
}

// A prediction of the user's next message (predictions.js): the chat's own request with a word from the app at its end,
// so that a provider reads the chat from its cache and is paid for little more than the answer.
// - It thinks as the chat does, not less. Asking for less thinking was tried and costs more: Claude's documentation says
//   a change of thinking or effort always invalidates the cache of the messages, and DeepSeek, measured, keeps a cache
//   apart for every setting of them, so the whole new part of the chat was paid for a second time, where the thinking
//   a one-line answer takes is some tens of tokens. With GPT the cache reads either way, but told to think less it
//   predicted nothing where it otherwise did. Only its two highest levels are brought down to `high`.
// - A model on the user's own computer has no price and no cache to lose, only time: it thinks as little as it can.
// - The answer is a few words: the room for it is small, larger where the model thinks first, and an answer that runs
//   on is cut off.
const PREDICT = { plain: 80, thinking: 2048, most: 400, steep: ['xhigh', 'max'], openai: ['openai', 'chatgpt'] };
async function predict(config, { messages, tools, signal, session }) {
 const efforts = config.efforts || [];
 let effort = config.effort;
 if (config.provider === 'local') effort = efforts.includes('none') ? 'none' : efforts[0] || effort;
 else if (PREDICT.openai.includes(config.provider) && PREDICT.steep.includes(effort) && efforts.includes('high')) effort = 'high';
 const maxTokens = effort === 'none' ? PREDICT.plain : PREDICT.thinking;
 const stop = new AbortController(), cut = () => stop.abort();
 signal?.addEventListener('abort', cut, { once: true });
 let long = false;
 const onContent = (delta, partial) => { if (partial.content.length > PREDICT.most) { long = true; cut(); } };
 const options = { messages, tools, signal: stop.signal, onContent, maxTokens, session, aside: true };
 try {
  if (signal?.aborted) return '';
  const result = counted(config, config.provider === 'deepseek'
   ? await DeepSeek.streamChat({ key: config.key, model: config.model, effort, vision: config.vision, ...options })
   : await viaMain({ ...config, effort }, options));
  // Told not to call tools, a model that calls one all the same has predicted nothing.
  return result.toolCalls?.length ? '' : result.content;
 } catch (error) {
  if (long || error.name === 'AbortError') return '';
  throw error;
 } finally {
  signal?.removeEventListener('abort', cut);
 }
}

// `extra`: what a provider needs besides its key (see the main process's side).
async function models(provider, key, extra) {
 if (provider === 'deepseek') return (await DeepSeek.listModels(key)).map(model => ({ ...model, provider: 'deepseek', api: model.id }));
 if (!bridge) return [];
 const reply = await bridge.models(provider, key, extra);
 if (reply.error) throw new ProviderError(explain(provider, reply.error), reply.error.status);
 return reply.models;
}

// What a provider tells of the account behind a key, for the providers asked through the main process; null when it
// can't be read.
async function account(provider, key) {
 const reply = await bridge?.account?.(provider, key).catch(() => null);
 return reply?.account || null;
}

window.Providers = { stream, complete, predict, models, account, NAMES, NEED, available: !!bridge };
})();
