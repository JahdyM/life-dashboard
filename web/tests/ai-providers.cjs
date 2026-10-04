// Run: node web/tests/ai-providers.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

let mockFetch;
const sandbox = {
  AbortController,
  setTimeout,
  clearTimeout,
  Response,
  process: { env: {} },
  fetch: (...args) => mockFetch(...args),
};
vm.createContext(sandbox);

function loadModule(relPath, requireMap) {
  const src = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, relPath), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
  ).outputText;
  const moduleExports = {};
  sandbox.exports = moduleExports;
  sandbox.module = { exports: moduleExports };
  sandbox.require = (id) => {
    if (id in requireMap) return requireMap[id];
    throw new Error(`unexpected require: ${id}`);
  };
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
}

const transport = loadModule('../lib/server/assistantTransport.ts', {});
const providers = loadModule('../lib/server/aiProviders.ts', { './assistantTransport': transport });

// Arrays returned from the vm sandbox are a different realm than this file's,
// which trips assert.deepEqual's reference-equality check on structurally
// identical arrays. Comparing serialized forms sidesteps that harmlessly.
function assertArrayEqual(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

(async () => {
  // No provider configured: nothing to try.
  sandbox.process.env = {};
  assert.equal(providers.configuredProviderIds().length, 0);
  assert.equal((await providers.resolveOrbitCandidates(null)).length, 0);

  // Groq only: discovery filters out non-chat models and ranks by size; statics fill in the rest.
  sandbox.process.env = { GROQ_API_KEY: 'groq-key' };
  mockFetch = async (url) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/models');
    return new Response(JSON.stringify({
      data: [
        { id: 'llama-3.3-70b-versatile' },
        { id: 'new-chat-model' },
        { id: 'whisper-large-v3' },
        { id: 'llama-guard-3-8b' },
      ],
    }));
  };
  const groqOnly = await providers.resolveOrbitCandidates(null);
  assertArrayEqual(groqOnly, [
    'groq::llama-3.3-70b-versatile',
    'groq::new-chat-model',
  ], 'whisper/guard models must be excluded, and at most 2 models tried per provider');

  // Groq + Gemini configured: groq (higher priority) candidates come first, gemini's after.
  sandbox.process.env = { GROQ_API_KEY: 'groq-key', GEMINI_API_KEY: 'gemini-key' };
  mockFetch = async (url) => {
    if (url.includes('groq.com')) return new Response(JSON.stringify({ data: [] }));
    return new Response(JSON.stringify({ models: [] }));
  };
  const cascadeOrder = await providers.resolveOrbitCandidates(null);
  assert.ok(cascadeOrder[0].startsWith('groq::'), 'groq must be tried before gemini');
  assert.ok(cascadeOrder.some((c) => c.startsWith('gemini::')), 'gemini must still be in the cascade');

  // A previously-resolved candidate is retried first on the next call.
  const withPreferred = await providers.resolveOrbitCandidates('gemini::gemini-2.5-flash');
  assert.equal(withPreferred[0], 'gemini::gemini-2.5-flash');

  // Every provider must get a turn before the 45s shared budget is exhausted.
  sandbox.process.env.CEREBRAS_API_KEY = 'cerebras-key';
  const threeProviders = await providers.resolveOrbitCandidates(null);
  assertArrayEqual(threeProviders.slice(0, 3).map((c) => c.split('::')[0]),
    ['groq', 'cerebras', 'gemini']);
  const preferredOrder = await providers.resolveOrbitCandidates('gemini::gemini-2.5-flash');
  assertArrayEqual(preferredOrder.slice(0, 3).map((c) => c.split('::')[0]),
    ['gemini', 'groq', 'cerebras']);
  delete sandbox.process.env.GEMINI_API_KEY;
  const removedProvider = await providers.resolveOrbitCandidates('gemini::gemini-2.5-flash');
  assert.ok(removedProvider.every((c) => !c.startsWith('gemini::')));
  sandbox.process.env.GROQ_MODEL = 'explicit-model';
  assert.equal((await providers.resolveOrbitCandidates(null))[0], 'groq::llama-3.3-70b-versatile',
    'stale configured models must not displace discovered models');
  const stalePreferred = await providers.resolveOrbitCandidates('groq::retired-model');
  assert.ok(stalePreferred.every((c) => !c.includes('retired-model')));
  delete sandbox.process.env.GROQ_MODEL;
  sandbox.process.env.GEMINI_API_KEY = 'gemini-key';

  // callOrbitCandidate: Groq (OpenAI-compatible) success parsing.
  mockFetch = async (url, init) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.messages[0].role, 'system');
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"message":"oi"}' }, finish_reason: 'stop' }],
    }));
  };
  const groqCall = await providers.callOrbitCandidate(
    'groq::llama-3.3-70b-versatile', 'You are Orbit.', [{ role: 'user', content: 'oi' }],
    new AbortController().signal
  );
  assert.equal(groqCall.normalized.text, '{"message":"oi"}');
  assert.equal(groqCall.normalized.truncated, false);
  assert.equal(groqCall.providerId, 'groq');

  // callOrbitCandidate: Gemini success parsing.
  mockFetch = async (url) => {
    assert.ok(url.includes(':generateContent'));
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"message":"oi"}' }] }, finishReason: 'STOP' }],
    }));
  };
  const geminiCall = await providers.callOrbitCandidate(
    'gemini::gemini-2.5-flash', 'You are Orbit.', [{ role: 'user', content: 'oi' }],
    new AbortController().signal
  );
  assert.equal(geminiCall.normalized.text, '{"message":"oi"}');

  // callOrbitCandidate: truncation and error surfaces are normalized the same way across providers.
  mockFetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'cut off' }, finish_reason: 'length' }],
  }));
  const truncated = await providers.callOrbitCandidate(
    'groq::llama-3.3-70b-versatile', 'sys', [], new AbortController().signal
  );
  assert.equal(truncated.normalized.truncated, true);

  mockFetch = async () => new Response(
    JSON.stringify({ error: { message: 'invalid api key', type: 'invalid_request_error' } }),
    { status: 401 }
  );
  const authFailure = await providers.callOrbitCandidate(
    'groq::llama-3.3-70b-versatile', 'sys', [], new AbortController().signal
  );
  assert.equal(authFailure.response.status, 401);
  assert.equal(authFailure.normalized.errorMessage, 'invalid api key');

  // Per-provider limits: Groq/Cerebras get a small context and reply cap, Gemini a large one.
  assert.ok(providers.contextBudgetFor('groq::x') < providers.contextBudgetFor('gemini::x'),
    'Groq takes less live data than Gemini');
  assert.equal(providers.contextBudgetFor('unknown::x') > 0, true);

  const requestBodyFor = async (candidate) => {
    let body;
    mockFetch = async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
    };
    await providers.callOrbitCandidate(candidate, 'sys', [{ role: 'user', content: 'oi' }],
      new AbortController().signal);
    return body;
  };
  const gptOss = await requestBodyFor('groq::openai/gpt-oss-120b');
  assert.equal(gptOss.max_tokens, 2048, 'reply cap must leave room inside the per-minute budget');
  assert.equal(gptOss.reasoning_effort, 'low', 'gpt-oss reasoning must not eat the reply budget');
  const qwen = await requestBodyFor('groq::qwen/qwen3.8-27b');
  assert.equal('reasoning_effort' in qwen, false, 'other models must not receive gpt-oss-only params');

  let geminiBody;
  mockFetch = async (_url, init) => {
    geminiBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ candidates: [] }));
  };
  await providers.callOrbitCandidate('gemini::gemini-3.8-flash', 'sys', [], new AbortController().signal);
  assert.equal(geminiBody.generationConfig.maxOutputTokens, 8192);

  console.log('PASS: provider cascade ordering, discovery filtering, request/response normalization, per-provider limits');
})().catch((error) => { console.error(error); process.exitCode = 1; });
