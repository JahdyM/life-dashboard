// Run: node web/tests/orbit-cascade.cjs
// Replays the failure reported on 2026-10-04 against the real provider modules:
//   groq/gpt-oss-120b: 413 · gemini/gemini-2.5-flash: 404 · groq/qwen3.8-27b: 413 · gemini/gemini-3.8-flash: 503
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

let mockFetch;
const sandbox = {
  AbortController, setTimeout, clearTimeout, Response, Date, Math, Set, Map, JSON, Object, Array,
  process: { env: {} },
  fetch: (...args) => mockFetch(...args),
};
vm.createContext(sandbox);

function loadModule(relPath, requireMap) {
  const src = ts.transpileModule(fs.readFileSync(path.join(__dirname, relPath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
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

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const PLAN = '{"message":"Vou revisar as tags de hoje.","actions":[]}';
const tooLarge = (requested) => ({ error: { type: 'tokens', message:
  `Request too large for model \`m\` in organization \`org_x\` service tier \`on_demand\` on tokens per minute (TPM): Limit 8000, Requested ${requested}, please reduce your message size.` } });

/** Mirrors askAssistant: every candidate gets sendWithAdaptation, the first usable answer wins. */
async function runCascade() {
  const calls = [];
  const attempt = async (candidate) => {
    const result = await providers.sendWithAdaptation(
      (size) => providers.callOrbitCandidate(candidate, 'sys', [{ role: 'user', content: 'revisar tags' }],
        new AbortController().signal, size.maxOutputTokens),
      { maxOutputTokens: providers.maxOutputTokensFor(candidate), contextChars: providers.contextBudgetFor(candidate) },
      { retryDelayMs: 1 }
    );
    calls.push(`${candidate}=${result.response.status}`);
    return result;
  };
  const candidates = await providers.resolveOrbitCandidates(null);
  const outcome = await transport.withAssistantFallback(candidates, attempt, new AbortController().signal);
  return { outcome, calls: calls.slice(), candidates };
}

(async () => {
  // The reported setup: a stale GEMINI_MODEL, Gemini 3.x discovered, Groq with its 8k/min window.
  sandbox.process.env = { GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-2.5-flash', GROQ_API_KEY: 'q' };
  const geminiModels = ['gemini-2.5-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
  const groqModels = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'whisper-large-v3'];
  let groqAccepts = () => false;

  mockFetch = async (url, init) => {
    url = String(url);
    if (url.endsWith('/v1beta/models')) {
      return json({ models: geminiModels.map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) });
    }
    if (url.endsWith('/openai/v1/models')) return json({ data: groqModels.map((id) => ({ id })) });
    if (url.includes(':generateContent')) {
      if (url.includes('gemini-2.5-flash:')) return json({ error: { status: 'NOT_FOUND', message: 'no longer available to new users' } }, 404);
      if (url.includes('gemini-3.8-flash:')) return json({ error: { status: 'UNAVAILABLE', message: 'high demand' } }, 503);
      if (url.includes('lite:')) return json({ candidates: [{ content: { parts: [{ text: PLAN }] }, finishReason: 'STOP' }] });
      return json({ error: { status: 'UNAVAILABLE', message: 'high demand' } }, 503);
    }
    if (url.endsWith('/chat/completions')) {
      const body = JSON.parse(init.body);
      return groqAccepts(body)
        ? json({ choices: [{ message: { content: PLAN }, finish_reason: 'stop' }] })
        : json(tooLarge(9_400), 413);
    }
    throw new Error(`unexpected url ${url}`);
  };

  // 1) Gemini's lite model rescues the request even though the flagship is overloaded,
  //    the env-forced model is gone, and Groq cannot take it.
  let { outcome, calls, candidates } = await runCascade();
  assert.equal(outcome.result.response.status, 200, `the cascade must end in an answer, saw: ${calls}`);
  assert.match(outcome.model, /gemini::gemini-3\.5-flash-lite|groq::/);
  assert.ok(calls.some((c) => c === 'gemini::gemini-2.5-flash=404'), 'the retired model is tried once and fails fast');
  assert.ok(candidates.some((c) => c.includes('3.5-flash-lite')), 'a lite model is always among the Gemini attempts');

  // 2) The retired model is not offered again, so it cannot take a slot (or time) next request.
  ({ candidates } = await runCascade());
  assert.ok(!candidates.includes('gemini::gemini-2.5-flash'));

  // 3) Groq alone: a 413 is answered with a smaller request instead of being a dead end.
  sandbox.process.env = { GROQ_API_KEY: 'q' };
  groqAccepts = (body) => body.max_tokens <= 1024;
  ({ outcome, calls } = await runCascade());
  assert.equal(outcome.result.response.status, 200, `Groq must succeed on the shrunken retry, saw: ${calls}`);
  assert.equal(outcome.model.split('::')[0], 'groq');

  // 4) Nothing can serve it: the last failure comes back as a response the caller can classify.
  groqAccepts = () => false;
  ({ outcome } = await runCascade());
  assert.equal(outcome.result.response.status, 413);

  console.log('PASS: reported incident replayed — retired model, overloaded flagship, Groq 413 all handled');
})().catch((error) => { console.error(error); process.exitCode = 1; });
