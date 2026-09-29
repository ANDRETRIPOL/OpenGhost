'use strict';

// A local or custom OpenAI-compatible server, called from the main process: the page's own fetch would run into the server's
// cross-origin rules, which LM Studio and llama.cpp don't always relax, and Node has none. The protocol itself lives in
// openai-compat.js, the same file the page uses for DeepSeek.
const Compat = require('../openai-compat');

const endpoint = request => ({ baseURL: request.baseURL, key: request.key, kind: 'custom' });

async function models(request) {
 return (await Compat.listModels(endpoint(request))).map(model => ({ ...model, provider: 'custom', api: model.id }));
}

async function stream(request, { signal, onEvent = () => {} }) {
 const { model, effort, vision = true, messages, tools, maxTokens } = request;
 return Compat.streamChat({
  endpoint: endpoint(request), model, effort, vision, messages, tools, signal, maxTokens,
  onContent: delta => onEvent({ type: 'content', delta }),
  onReasoning: delta => onEvent({ type: 'reasoning', delta }),
 });
}

module.exports = { models, stream };
