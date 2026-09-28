const MODEL_LIST_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;
const MODEL_DISCOVERY_TIMEOUT_MS = 3_000;

let modelCache: { apiKey: string; models: string[]; expiresAt: number } | null = null;

const NON_TEXT_MODEL = /(image|audio|tts|live|embedding|robotics|computer-use)/;

/** Ranks candidate model names so newer, cheaper, text-capable models are tried first. */
function modelScore(name: string) {
  if (NON_TEXT_MODEL.test(name)) return -1;
  let score = 0;
  const version = name.match(/^gemini-(\d+)(?:\.(\d+))?-/);
  if (version) score += Number(version[1]) * 100 + Number(version[2] || 0) * 10;
  if (/^gemini-\d+(?:\.\d+)?-flash$/.test(name)) score += 120;
  else if (name.includes("flash-latest")) score += 110;
  else if (name.includes("flash")) score += 90;
  else if (name.includes("pro")) score += 50;
  if (name.includes("lite")) score -= 5;
  if (/(preview|experimental|exp-)/.test(name)) score -= 25;
  return score;
}

/**
 * Fetches the Gemini models actually available for this API key, so the fallback
 * chain stays generic instead of hardcoded to model names that Google can rename
 * or retire at any time. Cached in memory for an hour; on any failure it silently
 * returns the last known list (or none) rather than throwing.
 */
export async function discoverGeminiModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (modelCache && modelCache.apiKey === apiKey && modelCache.expiresAt > now) {
    return modelCache.models;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(MODEL_LIST_URL, {
      headers: { "x-goog-api-key": apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      return modelCache?.apiKey === apiKey ? modelCache.models : [];
    }
    const payload = (await response.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    const models = (payload.models || [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => (model.name || "").replace(/^models\//, ""))
      .filter((name) => name && modelScore(name) > 0)
      .sort((left, right) => modelScore(right) - modelScore(left));
    modelCache = { apiKey, models, expiresAt: now + MODEL_CACHE_TTL_MS };
    return models;
  } catch {
    return modelCache?.apiKey === apiKey ? modelCache.models : [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Each model gets its own deadline, leaving time for another model to answer. */
export async function requestAssistantModel<T>(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  timeoutMs = 12_000
): Promise<{ response: Response; payload: T | null }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => null) as T | null;
    if (controller.signal.aborted) throw new Error("AI_REQUEST_TIMEOUT");
    return { response, payload };
  } catch {
    throw new Error(controller.signal.aborted ? "AI_REQUEST_TIMEOUT" : "AI_REQUEST_FAILED");
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export async function withAssistantFallback<T extends { response: Response }>(
  models: string[],
  request: (model: string) => Promise<T>,
  signal: AbortSignal
): Promise<{ model: string; result: T; attemptedModels: string[] }> {
  const attemptedModels: string[] = [];
  let lastError: unknown = new Error("AI_REQUEST_FAILED");
  let lastResponse: { model: string; result: T } | null = null;
  for (const model of Array.from(new Set(models))) {
    if (signal.aborted) throw new Error("AI_REQUEST_TIMEOUT");
    attemptedModels.push(model);
    try {
      const result = await request(model);
      lastResponse = { model, result };
      const status = result.response.status;
      if (result.response.ok || !([404, 408, 429].includes(status) || status >= 500)) {
        return { model, result, attemptedModels };
      }
    } catch (error) {
      lastError = error;
    }
  }
  if (signal.aborted) throw new Error("AI_REQUEST_TIMEOUT");
  if (lastResponse) return { ...lastResponse, attemptedModels };
  throw lastError;
}
