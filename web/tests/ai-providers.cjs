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
const json = (value) => JSON.stringify(value);

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

  // Gemini + Groq configured: the provider with room for a whole request goes first, Groq's tiny window after.
  sandbox.process.env = { GROQ_API_KEY: 'groq-key', GEMINI_API_KEY: 'gemini-key' };
  mockFetch = async (url) => {
    if (url.includes('groq.com')) return new Response(JSON.stringify({ data: [] }));
    return new Response(JSON.stringify({ models: [] }));
  };
  const cascadeOrder = await providers.resolveOrbitCandidates(null);
  assert.ok(cascadeOrder[0].startsWith('gemini::'), 'gemini must be tried before groq');
  assert.ok(cascadeOrder.some((c) => c.startsWith('groq::')), 'groq must still be in the cascade');

  // A previously-resolved candidate is retried first on the next call.
  const withPreferred = await providers.resolveOrbitCandidates('gemini::gemini-2.5-flash');
  assert.equal(withPreferred[0], 'gemini::gemini-2.5-flash');

  // Every provider must get a turn before the 45s shared budget is exhausted.
  sandbox.process.env.CEREBRAS_API_KEY = 'cerebras-key';
  const threeProviders = await providers.resolveOrbitCandidates(null);
  assertArrayEqual(threeProviders.slice(0, 3).map((c) => c.split('::')[0]),
    ['gemini', 'groq', 'cerebras']);
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

  // --- Gemini: dead models are quarantined, attempts are spread over capacity pools ---
  sandbox.process.env = { GEMINI_API_KEY: 'gemini-key-2', GEMINI_MODEL: 'gemini-2.5-flash' };
  mockFetch = async (url) => {
    assert.ok(String(url).endsWith('/v1beta/models'));
    return new Response(JSON.stringify({ models: [
      'gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite',
    ].map((name) => ({ name: `models/${name}`, supportedGenerationMethods: ['generateContent'] })) }));
  };
  const beforeRetirement = await providers.resolveOrbitCandidates(null);
  assert.equal(beforeRetirement[0], 'gemini::gemini-2.5-flash', 'an explicit model choice is tried first');
  assertArrayEqual(beforeRetirement.slice(1), ['gemini::gemini-3.8-flash', 'gemini::gemini-3.5-flash-lite'].slice(0, 2),
    'then the best model and a lite one (separate capacity), not two flagships');

  mockFetch = async () => new Response(JSON.stringify({ error: {
    status: 'NOT_FOUND', message: 'This model is no longer available to new users.' } }), { status: 404 });
  const retired = await providers.callOrbitCandidate('gemini::gemini-2.5-flash', 'sys', [], new AbortController().signal);
  assert.equal(retired.response.status, 404);
  assert.equal(retired.normalized.errorStatus, 'NOT_FOUND');
  const afterRetirement = await providers.resolveOrbitCandidates(null);
  assert.ok(afterRetirement.every((c) => c !== 'gemini::gemini-2.5-flash'),
    'a model that answered 404 must stop taking a slot');
  assert.equal(afterRetirement.length, 3, 'and the slot goes to the next usable model');

  // --- Mistral: only chat aliases, small first; its top-level error shape is understood ---
  sandbox.process.env = { MISTRAL_API_KEY: 'mistral-key' };
  mockFetch = async (url) => {
    assert.equal(url, 'https://api.mistral.ai/v1/models');
    return new Response(JSON.stringify({ data: [
      'mistral-embed', 'mistral-large-latest', 'codestral-latest', 'mistral-small-latest',
      'mistral-medium-latest', 'ministral-8b-latest',
    ].map((id) => ({ id })) }));
  };
  assertArrayEqual(await providers.resolveOrbitCandidates(null), [
    'mistral::mistral-small-latest', 'mistral::mistral-medium-latest', 'mistral::mistral-large-latest',
  ]);
  mockFetch = async () => new Response(JSON.stringify({
    object: 'error', message: 'Rate limit exceeded', type: 'rate_limited', code: '1300' }), { status: 429 });
  const limited = await providers.callOrbitCandidate('mistral::mistral-small-latest', 'sys', [], new AbortController().signal);
  assert.equal(limited.normalized.errorMessage, 'Rate limit exceeded');
  assert.equal(limited.normalized.errorStatus, 'rate_limited');

  // --- "Request too large": read the numbers, then shrink replies first and live data second ---
  const tooLarge = 'Request too large for model `openai/gpt-oss-120b` in organization `org_x` service tier ' +
    '`on_demand` on tokens per minute (TPM): Limit 8000, Requested 9876, please reduce your message size.';
  assert.equal(json(providers.parseTokenLimit(tooLarge)), json({ limit: 8000, requested: 9876 }));
  assert.equal(providers.parseTokenLimit(null), null);
  assert.equal(providers.parseTokenLimit('Limit 8000, Requested 100'), null, 'only a real overshoot counts');
  assert.equal(providers.parseTokenLimit('invalid api key'), null);

  const bigOvershoot = providers.shrinkToFit({ limit: 8000, requested: 9876 }, { maxOutputTokens: 2048, contextChars: 5000 });
  assert.equal(bigOvershoot.maxOutputTokens, 768, 'reply cap gives way first, down to its floor');
  assert.ok(bigOvershoot.contextChars < 5000 && bigOvershoot.contextChars > 0, 'the rest comes out of live data');
  const smallOvershoot = providers.shrinkToFit({ limit: 8000, requested: 8100 }, { maxOutputTokens: 2048, contextChars: 5000 });
  assert.ok(smallOvershoot.maxOutputTokens < 2048 && smallOvershoot.maxOutputTokens > 768);
  assert.equal(smallOvershoot.contextChars, 5000, 'a small overshoot does not touch the data');
  assert.equal(providers.shrinkToFit({ limit: 8000, requested: 9000 }, { maxOutputTokens: 768, contextChars: 0 }), null,
    'nothing left to give means no pointless retry');

  // --- sendWithAdaptation: the two failures worth a second try on the same provider ---
  const outcome = (status, errorMessage = null) =>
    ({ response: new Response('{}', { status }), normalized: { errorMessage } });
  const script = (...outcomes) => {
    const sizes = [];
    return {
      sizes,
      send: async (size) => { sizes.push(json(size)); return outcomes[Math.min(sizes.length, outcomes.length) - 1]; },
    };
  };
  const start = { maxOutputTokens: 2048, contextChars: 5000 };

  const overloaded = script(outcome(503), outcome(200));
  const afterOverload = await providers.sendWithAdaptation(overloaded.send, start, { retryDelayMs: 1 });
  assert.equal(afterOverload.response.status, 200, 'a quick 503 is retried once');
  assert.equal(overloaded.sizes.length, 2);
  assert.equal(overloaded.sizes[0], overloaded.sizes[1], 'an overload retry resends the same request');

  const stillOverloaded = script(outcome(503), outcome(503), outcome(200));
  assert.equal((await providers.sendWithAdaptation(stillOverloaded.send, start, { retryDelayMs: 1 })).response.status, 503,
    'only one retry: the next provider is the better second chance');
  assert.equal(stillOverloaded.sizes.length, 2);

  const tooBig = script(outcome(413, tooLarge), outcome(200));
  const notes = [];
  const afterShrink = await providers.sendWithAdaptation(tooBig.send, start, { onShrink: (m) => notes.push(m) });
  assert.equal(afterShrink.response.status, 200, '413 with numbers is answered with a smaller request');
  assert.equal(tooBig.sizes.length, 2);
  const [first, second] = tooBig.sizes.map(JSON.parse);
  assert.ok(second.maxOutputTokens < first.maxOutputTokens && second.contextChars < first.contextChars);
  assert.equal(notes.length, 1, 'the shrink is reported so it shows up in the diagnostics');

  for (const hopeless of [outcome(413, 'Request too large'), outcome(413, null), outcome(429, tooLarge), outcome(400), outcome(401)]) {
    const once = script(hopeless, outcome(200));
    assert.equal((await providers.sendWithAdaptation(once.send, start)).response.status, hopeless.response.status);
    assert.equal(once.sizes.length, 1, `status ${hopeless.response.status} must not be retried`);
  }

  const shrunkOnce = script(outcome(413, tooLarge), outcome(413, tooLarge));
  assert.equal((await providers.sendWithAdaptation(shrunkOnce.send, start)).response.status, 413);
  assert.equal(shrunkOnce.sizes.length, 2, 'a request is shrunk once, not in a loop');

  await assert.rejects(providers.sendWithAdaptation(async () => { throw new Error('AI_REQUEST_FAILED'); }, start),
    /AI_REQUEST_FAILED/, 'network errors reach the caller untouched');

  console.log('PASS: provider cascade ordering, discovery filtering, request/response normalization, per-provider limits, quarantine, Mistral, 413 shrinking, retry policy');
})().catch((error) => { console.error(error); process.exitCode = 1; });
