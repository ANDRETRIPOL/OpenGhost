'use strict';
// Actual OpenAI adapter + loopback HTTP/SSE. No account, credentials or external request.
const http = require('node:http'), assert = require('node:assert/strict');
const OpenAI = require('../desktop/openai.js');
const baseline = process.argv.includes('--baseline'), checks = [], routes = new Map();
const check = (name, pass) => { checks.push({ name, pass: !!pass }); if (!pass && !baseline) assert.fail(name); };
const fail = (code, param, message, status = 400) => ({ status, error: { code, param, message } });
const unsupported = param => fail('unsupported_parameter', param, `Unsupported parameter: '${param}' is not supported with this model.`);
const invalid = effort => fail('invalid_value', 'reasoning.effort', `Unsupported value for reasoning.effort: '${effort}'. Supported values: low, medium, high.`);
const server = http.createServer(async (req, res) => {
 let text = ''; for await (const chunk of req) text += chunk;
 if (req.method === 'GET') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(req.url.startsWith('/api/models') ? { data: [...routes.keys()].map(id => ({ id })) } : { models: [] })); return;
 }
 const body = JSON.parse(text), route = routes.get(body.model);
 if (!route) { res.writeHead(500); res.end('Unexpected fixture model'); return; }
 const entry = { path: req.url, body }; route.requests.push(entry);
 const reply = route.reply(body, route.requests.length, req.url);
 if (reply?.error) { res.writeHead(reply.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: reply.error })); return; }
 res.writeHead(200, { 'Content-Type': 'text/event-stream' });
 const events = reply?.events || [
  { type: 'response.output_text.delta', item_id: 'reply', delta: 'OK' },
  { type: 'response.completed', response: { usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
 ];
 res.end(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''));
});
async function main() {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = `http://127.0.0.1:${server.address().port}`;
 const context = { apiUrl: base + '/api', codexUrl: base + '/codex', chatgpt: async () => ({ access: 'fixture-only' }) };
 let serial = 0;
 const fixture = reply => { const model = 'gpt-9-effort-fixture-' + ++serial, route = { requests: [], reply }; routes.set(model, route); return { model, ...route }; };
 const call = (model, effort, provider = 'openai') => OpenAI.stream({ provider, key: 'fixture-only', model, effort, session: 'effort-fixture', messages: [{ role: 'user', content: 'local fixture' }] }, { ...context, signal: AbortSignal.timeout(5000) });
 const caught = promise => promise.then(() => null, error => error);
 try {
  const cases = [
   invalid('ultra'), invalid('none'),
   fail('unsupported_value', 'reasoning.effort', 'Unsupported reasoning effort value'),
   fail('invalid_request_error', 'reasoning.effort', 'reasoning.effort must be one of low, medium, high'),
   unsupported('reasoning.effort'),
   fail('invalid_value', 'reasoning', 'The reasoning.effort value is invalid'),
   fail('invalid_value', 'include[0]', "Invalid value: reasoning.encrypted_content"),
   fail('invalid_request_error', 'tools', 'Invalid schema in reasoning_helper'),
   fail('invalid_request_error', undefined, 'Something about reasoning is invalid'),
   fail('invalid_api_key', 'reasoning', 'Invalid key for reasoning endpoint', 401),
   fail('rate_limit_exceeded', 'reasoning', 'reasoning rate limit', 429),
   fail('server_error', 'reasoning', 'reasoning backend failed', 500),
  ];
  for (const problem of cases) {
   const f = fixture((_body, n) => n === 1 ? problem : null);
   const error = await caught(call(f.model, 'ultra'));
   check(problem.error.code + '/' + (problem.error.param || 'no-param') + ': original failure is exposed without a downgraded retry', error?.status === problem.status && error?.code === problem.error.code && f.requests.length === 1);
   const good = await call(f.model, 'high');
   check(problem.error.code + '/' + (problem.error.param || 'no-param') + ': next High and encrypted reasoning are unchanged', good.content === 'OK' && f.requests.at(-1).body.reasoning?.effort === 'high' && f.requests.at(-1).body.include?.[0] === 'reasoning.encrypted_content');
  }
  const cross = fixture((_body, n, url) => n === 1 && url.startsWith('/api/') ? invalid('ultra') : null);
  await caught(call(cross.model, 'ultra'));
  await call(cross.model, 'high', 'chatgpt');
  check('An API error cannot poison ChatGPT sign-in for the same model ID', cross.requests.at(-1).path === '/codex/responses' && cross.requests.at(-1).body.reasoning?.effort === 'high');
  await call(cross.model, 'medium');
  check('Another API conversation of the same model still sends its own effort', cross.requests.at(-1).body.reasoning?.effort === 'medium');
  const other = fixture(() => null);
  await Promise.all([call(cross.model, 'high'), call(other.model, 'low')]);
  check('Concurrent models preserve their independently selected levels', cross.requests.at(-1).body.reasoning?.effort === 'high' && other.requests.at(-1).body.reasoning?.effort === 'low');
  const listed = await OpenAI.models({ provider: 'openai', key: 'fixture-only' }, context);
  check('Invalid effort never rewrites model capability lists to None', listed.find(model => model.api === cross.model)?.efforts.includes('high'));
  if (baseline) {
   const failures = checks.filter(item => !item.pass);
   console.log(JSON.stringify({ baseline, count: checks.length, passed: checks.length - failures.length, failures }, null, 2));
   return;
  }
  const noThinking = fixture((_body, n) => n === 1 ? unsupported('reasoning') : null);
  const compatible = await call(noThinking.model, 'high');
  check('Explicitly unsupported whole reasoning parameter retains request-local legacy compatibility', compatible.content === 'OK' && noThinking.requests.length === 2 && !noThinking.requests[1].body.reasoning && !noThinking.requests[1].body.include);
  await call(noThinking.model, 'high');
  check('Whole-parameter compatibility is never memorized for later requests', noThinking.requests.at(-1).body.reasoning?.effort === 'high');
  const summary = fixture((_body, n) => n === 1 ? unsupported('reasoning.summary') : null);
  await call(summary.model, 'high');
  check('Unsupported optional summary does not remove the chosen effort or encrypted reasoning', summary.requests.length === 2 && summary.requests[1].body.reasoning?.effort === 'high' && !('summary' in summary.requests[1].body.reasoning) && !!summary.requests[1].body.include);
  const include = fixture((_body, n) => n === 1 ? unsupported('include') : null);
  await call(include.model, 'high');
  check('Unsupported optional include does not remove the chosen effort', include.requests.length === 2 && include.requests[1].body.reasoning?.effort === 'high' && !include.requests[1].body.include);
  const repeated = fixture(() => unsupported('include'));
  const repeatedError = await caught(call(repeated.model, 'high'));
  check('Repeated compatibility errors stop instead of looping', repeatedError?.status === 400 && repeated.requests.length === 2);
  const failedFallback = fixture((_body, n) => n === 1 ? unsupported('reasoning') : n === 2 ? fail('server_error', undefined, 'temporary fixture error', 500) : null);
  await caught(call(failedFallback.model, 'high')); await call(failedFallback.model, 'medium');
  check('A failed compatibility attempt cannot mutate the next request', failedFallback.requests.at(-1).body.reasoning?.effort === 'medium');
  const none = fixture(() => null); await call(none.model, 'none');
  check('A supported explicit None is still transmitted as None', none.requests[0].body.reasoning?.effort === 'none');
  const unchanged = fixture((_body, n) => n === 1 ? invalid('ultra') : null);
  await caught(call(unchanged.model, 'ultra')); await call(unchanged.model, 'ultra');
  check('Adapter does not change a saved selection behind the user’s back', unchanged.requests.at(-1).body.reasoning?.effort === 'ultra');
  const failures = checks.filter(item => !item.pass);
  console.log(JSON.stringify({ baseline, count: checks.length, passed: checks.length - failures.length, failures }, null, 2));
  if (!baseline) console.log(`${checks.length} checks passed`);
 } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; server.closeAllConnections(); server.close(); });
