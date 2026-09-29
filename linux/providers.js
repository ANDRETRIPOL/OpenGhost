(() => {
'use strict';

// Every model call goes through here. DeepSeek is called straight from the page; OpenAI, ChatGPT and Anthropic go through the main process.
// A local or custom OpenAI-compatible server goes through the main process too when there is one, out of reach of the browser's
// cross-origin rules, and straight from the page otherwise. Whatever the route, a call resolves to the same result:
// content, reasoning, tool calls, finish reason and usage.
const bridge = window.openghost?.llm || null;
const listeners = new Map();
bridge?.onEvent(data => listeners.get(data.id)?.(data));

const NAMES = { deepseek: 'DeepSeek', openai: 'OpenAI', chatgpt: 'ChatGPT', anthropic: 'Anthropic' };

class ProviderError extends Error {
 constructor(message, status = 0) {
  super(message);
  this.name = 'ProviderError';
  this.status = status;
 }
}

// What an error names: the provider, or for a custom server its host.
function nameOf(config) {
 if (config.provider === 'custom') return OpenAICompat.hostOf(config.endpoint?.baseURL) || I18n.t('provider.custom');
 return NAMES[config.provider] || config.provider;
}

function explain(config, { status = 0, code = '', message = '' }) {
 const provider = nameOf(config);
 if (code === 'network') return I18n.t('error.connect', { provider });
 if (code === 'interrupted') return I18n.t('error.interrupted', { provider });
 if (status === 401 || code === 'key') return I18n.t(config.provider === 'chatgpt' ? 'error.signin' : 'error.key', { provider });
 if (status === 402 || code === 'insufficient_quota' || code === 'billing_error') return I18n.t('error.quota', { provider });
 if (status === 429) return I18n.t('error.rate', { provider });
 if (status >= 500) return I18n.t('error.server', { provider });
 return message || I18n.t('error.statusOf', { provider, status });
}

const aborted = partial => Object.assign(new DOMException('Aborted', 'AbortError'), { partial });

// The server a config talks to: DeepSeek's own, or the address from the settings.
const endpointOf = config => config.provider === 'custom'
 ? { ...config.endpoint, kind: 'custom' }
 : { baseURL: OpenAICompat.DEEPSEEK_URL, key: config.key, kind: 'deepseek' };

// Which calls the page makes itself.
const direct = config => config.provider === 'deepseek' || (config.provider === 'custom' && !bridge);

// A server without a model list still answers chats; the model is then the one the settings name.
const unlisted = (config, error) => config.provider === 'custom' && (error.status === 404 || error.status === 405);

// Errors from the page's own calls get the same wording as those relayed from the main process.
async function guarded(config, work) {
 try {
  return await work();
 } catch (error) {
  if (error.name === 'AbortError') throw error;
  throw new ProviderError(explain(config, error), error.status || 0);
 }
}

function viaMain(config, { messages, tools, signal, onReasoning, onContent, maxTokens, session }) {
 if (!bridge) return Promise.reject(new ProviderError(I18n.t('error.desktop', { provider: nameOf(config) })));
 const id = `llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
 const request = {
  provider: config.provider, key: config.key, baseURL: config.endpoint?.baseURL, model: config.model, effort: config.effort, vision: config.vision,
  thinking: config.thinking, output: config.output, messages, tools, maxTokens, session,
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
    resolve({ ...partial, ...event.result });
   } else if (event.type === 'error') {
    finish();
    reject(event.aborted ? aborted(partial) : new ProviderError(explain(config, event), event.status));
   }
  });
  signal?.addEventListener('abort', stop, { once: true });
  bridge.start(id, request);
 });
}

function stream(config, options) {
 if (!direct(config)) return viaMain(config, options);
 const { messages, tools, signal, onReasoning, onContent } = options;
 return guarded(config, () => OpenAICompat.streamChat({
  endpoint: endpointOf(config), model: config.model, effort: config.effort, vision: config.vision, messages, tools, signal, onReasoning, onContent,
 }));
}

// Short side jobs, such as naming a chat or compacting it, think as little as the model allows.
async function complete(config, { messages, signal, maxTokens = 40 }) {
 if (direct(config)) return guarded(config, () => OpenAICompat.complete({ endpoint: endpointOf(config), model: config.model, messages, signal, maxTokens }));
 const efforts = config.efforts || [];
 const effort = efforts.includes('none') ? 'none' : efforts[0] || 'low';
 const room = config.provider === 'anthropic' ? Math.max(maxTokens, 2048) : maxTokens;
 const result = await viaMain({ ...config, effort }, { messages, signal, maxTokens: room });
 return result.content.trim();
}

// The models a provider offers for a key, or for a custom server's address and key.
async function models(provider, options = {}) {
 const config = { provider, key: options.key || '', endpoint: { baseURL: options.baseURL || '', key: options.key || '' } };
 if (direct(config)) {
  try {
   const found = await OpenAICompat.listModels(endpointOf(config));
   return found.map(model => ({ ...model, provider, api: model.id }));
  } catch (error) {
   if (error.name === 'AbortError') throw error;
   if (unlisted(config, error)) return [];
   throw new ProviderError(explain(config, error), error.status || 0);
  }
 }
 if (!bridge) return [];
 const reply = await bridge.models(provider, { key: config.key, baseURL: config.endpoint.baseURL });
 if (reply.error) {
  if (unlisted(config, reply.error)) return [];
  throw new ProviderError(explain(config, reply.error), reply.error.status);
 }
 return reply.models;
}

window.Providers = { stream, complete, models, NAMES, available: !!bridge };
})();
