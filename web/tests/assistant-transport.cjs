// Run: node web/tests/assistant-transport.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const api = {};
let mockFetch;
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../lib/server/assistantTransport.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: api, AbortController, setTimeout, clearTimeout,
  fetch: (...args) => mockFetch(...args) });
const reply = (status) => ({ response: new Response('{}', { status }), payload: {} });
(async () => {
  const signal = new AbortController().signal;
  let calls = [];
  mockFetch = async (url, init) => {
    calls.push(url);
    if (url === 'slow') return new Promise((_, reject) =>
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    return new Response('{"message":"Volei 19:00-23:00"}');
  };
  const result = await api.withAssistantFallback(['slow', 'fast', 'fast'],
    (model) => api.requestAssistantModel(model, {}, signal, 15), signal);
  assert.equal(result.model, 'fast');
  assert.equal(result.result.payload.message, 'Volei 19:00-23:00');
  assert.deepEqual(calls, ['slow', 'fast']);

  calls = [];
  const crossProvider = await api.withAssistantFallback(
    ['groq::bad-key', 'cerebras::other'],
    async (candidate) => {
      calls.push(candidate);
      return reply(candidate === 'groq::bad-key' ? 401 : 200);
    },
    signal
  );
  assert.deepEqual(calls, ['groq::bad-key', 'cerebras::other'],
    'a rejection from one provider must not block trying the next provider');
  assert.equal(crossProvider.model, 'cerebras::other');

  for (const code of ['AI_EMPTY_RESPONSE', 'AI_INVALID_RESPONSE', 'AI_RESPONSE_TOO_LARGE']) {
    const recovered = await api.withAssistantFallback(['unusable', 'valid'], async (candidate) => {
      if (candidate === 'unusable') throw new Error(code);
      return reply(200);
    }, signal);
    assert.equal(recovered.model, 'valid', `${code} must not end the fallback chain`);
    await assert.rejects(api.withAssistantFallback(['unusable'], async () => {
      throw new Error(code);
    }, signal), new RegExp(code));
  }

  calls = [];
  await api.withAssistantFallback(['quota-a', 'quota-b'], async (model) => {
    calls.push(model);
    return reply(429);
  }, signal);
  assert.deepEqual(calls, ['quota-a', 'quota-b'],
    'every candidate is tried before giving up when all are rate-limited');

  mockFetch = async () => { throw new Error('network unavailable'); };
  await assert.rejects(api.requestAssistantModel('offline', {}, signal, 15), /AI_REQUEST_FAILED/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.withAssistantFallback(['unused'], async () => {
    throw new Error('must not call');
  }, controller.signal), /AI_REQUEST_TIMEOUT/);

  console.log('PASS: slow model fallback, cross-provider fallback, exhausted quota, network failure, cancellation');
})().catch((error) => { console.error(error); process.exitCode = 1; });
