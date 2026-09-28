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
  await api.withAssistantFallback(['bad-key', 'other'], async (model) => {
    calls.push(model); return reply(403);
  }, signal);
  assert.deepEqual(calls, ['bad-key'], 'authentication failures must not be retried');
  const fallback = await api.withAssistantFallback(['quota', 'available'], async (model) =>
    reply(model === 'quota' ? 429 : 200), signal);
  assert.equal(fallback.model, 'available');
  mockFetch = async () => { throw new Error('network unavailable'); };
  await assert.rejects(api.requestAssistantModel('offline', {}, signal, 15), /AI_REQUEST_FAILED/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.withAssistantFallback(['unused'], async () => {
    throw new Error('must not call');
  }, controller.signal), /AI_REQUEST_TIMEOUT/);

  mockFetch = async (url) => {
    assert.ok(String(url).endsWith('/v1beta/models'));
    return new Response(JSON.stringify({
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
      ],
    }));
  };
  const discovered = await api.discoverGeminiModels('key-a');
  assert.deepEqual(discovered, ['gemini-2.5-flash', 'gemini-2.5-pro'],
    'discovery must rank text-capable models and drop image/embedding-only ones');

  mockFetch = async () => { throw new Error('must use cache, not network'); };
  assert.deepEqual(await api.discoverGeminiModels('key-a'), discovered,
    'a repeat call for the same key must be served from cache');

  const freshKeyResult = await api.discoverGeminiModels('key-b');
  assert.equal(freshKeyResult.length, 0,
    'discovery failure for a different key must not leak another key\'s cached models');

  console.log('PASS: slow model fallback, auth stop, quota fallback, network failure, cancellation, model discovery');
})().catch((error) => { console.error(error); process.exitCode = 1; });
