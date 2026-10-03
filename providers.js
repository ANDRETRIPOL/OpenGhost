(() => {
'use strict';

// Every model call goes through here: DeepSeek straight from the page, OpenAI, ChatGPT and Anthropic through the main process.
// Whatever the provider, a call resolves to the same result: content, reasoning, tool calls, finish reason and usage.
const bridge = window.openghost?.llm || null;
const listeners = new Map();
bridge?.onEvent(data => listeners.get(data.id)?.(data));

const NAMES = { compatible: 'OpenAI-compatible', deepseek: 'DeepSeek', openai: 'OpenAI', chatgpt: 'ChatGPT', anthropic: 'Anthropic' };

class ProviderError extends Error {
 constructor(message, status = 0) {
  super(message);
  this.name = 'ProviderError';
  this.status = status;
 }
}

function explain(provider, { status = 0, code = '', message = '' }) {
 const name = NAMES[provider] || provider;
 if (code === 'network') return I18n.t('error.connect', { provider: name });
 if (status === 401) return I18n.t(provider === 'chatgpt' ? 'error.signin' : 'error.key', { provider: name });
 if (status === 402 || code === 'insufficient_quota' || code === 'billing_error') return I18n.t('error.quota', { provider: name });
 if (status === 429) return I18n.t('error.rate', { provider: name });
 if (status >= 500) return I18n.t('error.server', { provider: name });
 return message || I18n.t('error.statusOf', { provider: name, status });
}

const aborted = partial => Object.assign(new DOMException('Aborted', 'AbortError'), { partial });

// `once`: a request nothing will follow, so there is no point in paying a provider to keep its start in a cache.
function viaMain(config, { messages, tools, signal, onReasoning, onContent, maxTokens, session, once = false }) {
 if (!bridge) return Promise.reject(new ProviderError(I18n.t('error.desktop', { provider: NAMES[config.provider] })));
 const id = `llm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
 const request = {
  provider: config.provider, baseUrl: config.baseUrl, key: config.key, model: config.model, effort: config.effort, vision: config.vision,
  thinking: config.thinking, output: config.output, messages, tools, maxTokens, session, once,
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
 const room = config.provider === 'anthropic' ? Math.max(maxTokens, 2048) : maxTokens;
 const result = counted(config, await viaMain({ ...config, effort }, { messages, signal, maxTokens: room, once: true }));
 onUsage?.(result.usage);
 return result.content.trim();
}

async function models(provider, key, options) {
 if (provider === 'deepseek') return (await DeepSeek.listModels(key)).map(model => ({ ...model, provider: 'deepseek', api: model.id }));
 if (!bridge) return [];
 const reply = await bridge.models(provider, key, options);
 if (reply.error) throw new ProviderError(explain(provider, reply.error), reply.error.status);
 return reply.models;
}

window.Providers = { stream, complete, models, NAMES, available: !!bridge };
})();
