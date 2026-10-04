import { requestAssistantModel } from "./assistantTransport";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type NormalizedAiResponse = {
  text: string | null;
  errorStatus: string | null;
  errorMessage: string | null;
  /** True when the provider cut the reply short for hitting its output-token cap. */
  truncated: boolean;
};

type RawPayload = Record<string, unknown> | null;

type ProviderId = "mistral" | "gemini" | "groq" | "cerebras";

/**
 * Providers are tried in this order: the ones with room for a full request
 * first, the ones with a tiny per-minute window (Groq, Cerebras) last.
 */
const PROVIDER_ORDER: ProviderId[] = ["mistral", "gemini", "groq", "cerebras"];

type ProviderDef = {
  id: ProviderId;
  envKey: string;
  /** Used only if discovery fails or returns nothing — kept short and best-effort. */
  staticModels: string[];
  /** Characters of live dashboard data the provider can take per request. */
  contextBudgetChars: number;
  /** Reply cap. Groq/Cerebras count prompt + this against a per-minute budget. */
  maxOutputTokens: number;
  /** Per-attempt deadline: Groq/Cerebras answer fast, Gemini thinks before replying. */
  requestTimeoutMs: number;
  discoveryUrl: string;
  discoveryHeaders(apiKey: string): Record<string, string>;
  parseDiscovery(payload: RawPayload): string[];
  /** Orders the usable models; default is the discovery order. */
  pickModels?(available: string[]): string[];
  buildRequest(
    model: string,
    apiKey: string,
    systemInstruction: string,
    messages: ChatMessage[],
    maxOutputTokens: number
  ): { url: string; init: RequestInit };
  parseResponse(payload: RawPayload): NormalizedAiResponse;
};

const NON_TEXT_MODEL = /(image|audio|tts|whisper|guard|moderation|embed|rerank|vision-only|live|robotics|computer-use)/i;

function scoreOpenAiCompatibleModel(name: string) {
  if (NON_TEXT_MODEL.test(name)) return -1;
  let score = 0;
  const billions = name.match(/(\d+(?:\.\d+)?)b(?:-|$)/i);
  if (billions) score += Math.min(Number(billions[1]), 120);
  if (/instant/i.test(name)) score += 5;
  if (/versatile/i.test(name)) score += 15;
  if (/(preview|experimental)/i.test(name)) score -= 10;
  return score;
}

function scoreGeminiModel(name: string) {
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

function parseOpenAiCompatibleResponse(payload: RawPayload): NormalizedAiResponse {
  const error = (payload?.error ?? (payload?.object === "error" ? payload : undefined)) as
    | { message?: string; type?: string; code?: string | number }
    | undefined;
  const choice = (payload?.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const message = choice?.message as { content?: string } | undefined;
  const text = message?.content?.trim() || null;
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  return {
    text,
    errorStatus: error?.type || (error?.code != null ? String(error.code) : null),
    errorMessage: error?.message || null,
    truncated: finishReason === "length",
  };
}

function buildOpenAiCompatibleRequest(
  baseUrl: string,
  model: string,
  apiKey: string,
  systemInstruction: string,
  messages: ChatMessage[],
  maxTokens: number
) {
  return {
    url: `${baseUrl}/chat/completions`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemInstruction }, ...messages],
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        // gpt-oss models reason before answering and the reasoning counts
        // against max_tokens; at the default effort a plan is often cut off.
        ...(/gpt-oss/i.test(model) ? { reasoning_effort: "low" } : {}),
      }),
    } satisfies RequestInit,
  };
}

function parseOpenAiCompatibleDiscovery(payload: RawPayload): string[] {
  const data = payload?.data as Array<{ id?: string }> | undefined;
  return (data || [])
    .map((model) => model.id || "")
    .filter((id) => id && scoreOpenAiCompatibleModel(id) >= 0)
    .sort((left, right) => scoreOpenAiCompatibleModel(right) - scoreOpenAiCompatibleModel(left));
}

const MISTRAL_MODEL = /^(mistral-(small|medium|large)|ministral-\d+b)-latest$/;
const MISTRAL_PREFERENCE = ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"];

const PROVIDERS: Record<ProviderId, ProviderDef> = {
  mistral: {
    id: "mistral",
    envKey: "MISTRAL_API_KEY",
    staticModels: ["mistral-small-latest", "mistral-medium-latest"],
    contextBudgetChars: 24_000,
    maxOutputTokens: 4096,
    requestTimeoutMs: 20_000,
    discoveryUrl: "https://api.mistral.ai/v1/models",
    discoveryHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseDiscovery: (payload) => {
      const ids = ((payload?.data as Array<{ id?: string }> | undefined) || [])
        .map((model) => model.id || "")
        .filter((id) => MISTRAL_MODEL.test(id));
      const rank = (id: string) => {
        const index = MISTRAL_PREFERENCE.indexOf(id);
        return index === -1 ? MISTRAL_PREFERENCE.length : index;
      };
      return ids.sort((left, right) => rank(left) - rank(right));
    },
    buildRequest: (model, apiKey, systemInstruction, messages, maxTokens) =>
      buildOpenAiCompatibleRequest("https://api.mistral.ai/v1", model, apiKey, systemInstruction, messages, maxTokens),
    parseResponse: parseOpenAiCompatibleResponse,
  },
  groq: {
    id: "groq",
    envKey: "GROQ_API_KEY",
    staticModels: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
    contextBudgetChars: 5_000,
    maxOutputTokens: 2048,
    requestTimeoutMs: 10_000,
    discoveryUrl: "https://api.groq.com/openai/v1/models",
    discoveryHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseDiscovery: parseOpenAiCompatibleDiscovery,
    buildRequest: (model, apiKey, systemInstruction, messages, maxTokens) =>
      buildOpenAiCompatibleRequest("https://api.groq.com/openai/v1", model, apiKey, systemInstruction, messages, maxTokens),
    parseResponse: parseOpenAiCompatibleResponse,
  },
  cerebras: {
    id: "cerebras",
    envKey: "CEREBRAS_API_KEY",
    staticModels: ["llama-3.3-70b", "llama3.1-8b"],
    contextBudgetChars: 5_000,
    maxOutputTokens: 2048,
    requestTimeoutMs: 10_000,
    discoveryUrl: "https://api.cerebras.ai/v1/models",
    discoveryHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseDiscovery: parseOpenAiCompatibleDiscovery,
    buildRequest: (model, apiKey, systemInstruction, messages, maxTokens) =>
      buildOpenAiCompatibleRequest("https://api.cerebras.ai/v1", model, apiKey, systemInstruction, messages, maxTokens),
    parseResponse: parseOpenAiCompatibleResponse,
  },
  gemini: {
    id: "gemini",
    envKey: "GEMINI_API_KEY",
    staticModels: ["gemini-flash-latest", "gemini-flash-lite-latest"],
    contextBudgetChars: 24_000,
    maxOutputTokens: 8192,
    requestTimeoutMs: 22_000,
    discoveryUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    discoveryHeaders: (apiKey) => ({ "x-goog-api-key": apiKey }),
    // The newest flagship is the one everybody hits at once ("high demand"),
    // so the second attempt goes to a lite model, which has its own capacity.
    pickModels: (available) => {
      const lite = available.find((model) => model.includes("lite"));
      return Array.from(new Set([available[0], lite, ...available.slice(1)])).filter(
        (model): model is string => Boolean(model)
      );
    },
    parseDiscovery: (payload) => {
      const models = payload?.models as
        | Array<{ name?: string; supportedGenerationMethods?: string[] }>
        | undefined;
      return (models || [])
        .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
        .map((model) => (model.name || "").replace(/^models\//, ""))
        .filter((name) => name && scoreGeminiModel(name) > 0)
        .sort((left, right) => scoreGeminiModel(right) - scoreGeminiModel(left));
    },
    buildRequest: (model, apiKey, systemInstruction, messages, maxTokens) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
          },
        }),
      },
    }),
    parseResponse: (payload) => {
      const error = payload?.error as { status?: string; message?: string } | undefined;
      const candidate = (payload?.candidates as Array<Record<string, unknown>> | undefined)?.[0];
      const content = candidate?.content as { parts?: Array<{ text?: string }> } | undefined;
      const text = content?.parts?.map((part) => part.text || "").join("").trim() || null;
      return {
        text,
        errorStatus: error?.status || null,
        errorMessage: error?.message || null,
        truncated: candidate?.finishReason === "MAX_TOKENS",
      };
    },
  },
};

const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000;
const DISCOVERY_TIMEOUT_MS = 3_000;
const discoveryCache = new Map<ProviderId, { apiKey: string; models: string[]; expiresAt: number }>();

/**
 * Fetches the models actually available for this key from the provider itself,
 * so the fallback chain stays generic instead of hardcoded to model names a
 * provider can rename or retire at any time. Cached per provider for an hour;
 * on any failure it silently returns the last known list (or none).
 */
async function discoverProviderModels(provider: ProviderDef, apiKey: string): Promise<string[]> {
  const now = Date.now();
  const cached = discoveryCache.get(provider.id);
  if (cached && cached.apiKey === apiKey && cached.expiresAt > now) {
    return cached.models;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(provider.discoveryUrl, {
      headers: provider.discoveryHeaders(apiKey),
      signal: controller.signal,
    });
    if (!response.ok) {
      return cached?.apiKey === apiKey ? cached.models : [];
    }
    const models = provider.parseDiscovery((await response.json()) as RawPayload);
    discoveryCache.set(provider.id, { apiKey, models, expiresAt: now + DISCOVERY_CACHE_TTL_MS });
    return models;
  } catch {
    return cached?.apiKey === apiKey ? cached.models : [];
  } finally {
    clearTimeout(timeout);
  }
}

function encodeCandidate(providerId: ProviderId, model: string) {
  return `${providerId}::${model}`;
}

function decodeCandidate(candidate: string): { provider: ProviderDef | undefined; model: string } {
  const separatorIndex = candidate.indexOf("::");
  if (separatorIndex === -1) return { provider: undefined, model: "" };
  const providerId = candidate.slice(0, separatorIndex) as ProviderId;
  const model = candidate.slice(separatorIndex + 2);
  return { provider: PROVIDERS[providerId], model };
}

/** The provider ids that currently have an API key configured, in try-order. */
export function configuredProviderIds(): ProviderId[] {
  return PROVIDER_ORDER.filter((id) => Boolean(process.env[PROVIDERS[id].envKey]?.trim()));
}

// A model that answers 404 (retired, or "no longer available to new users")
// stays out of the candidate list for a while instead of taking a slot on
// every request. Memory only: a fresh instance simply learns it again.
const QUARANTINE_MS = 60 * 60 * 1000;
const quarantinedCandidates = new Map<string, number>();

function isQuarantined(candidate: string) {
  const until = quarantinedCandidates.get(candidate);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  quarantinedCandidates.delete(candidate);
  return false;
}

// Three, because a retired model fails in milliseconds and should not cost
// the request its only fallback.
const MAX_MODELS_PER_PROVIDER = 3;

/** Discover in parallel, then try each provider before repeating any provider. */
export async function resolveOrbitCandidates(preferred: string | null): Promise<string[]> {
  const ids = configuredProviderIds();
  const preferredProvider = preferred ? decodeCandidate(preferred).provider : undefined;
  const activePreferred = preferredProvider && ids.includes(preferredProvider.id)
    ? preferred : null;
  if (activePreferred && preferredProvider) {
    ids.sort((left, right) => Number(right === preferredProvider.id) - Number(left === preferredProvider.id));
  }
  const groups = await Promise.all(ids.map(async (id) => {
    const provider = PROVIDERS[id];
    const apiKey = process.env[provider.envKey]!.trim();
    const discovered: string[] = await discoverProviderModels(provider, apiKey).catch((): string[] => []);
    const configuredModel = process.env[`${id.toUpperCase()}_MODEL`]?.trim();
    const preferredModel = activePreferred && preferredProvider?.id === id
      ? decodeCandidate(activePreferred).model : null;
    const available = discovered.length ? discovered : provider.staticModels;
    const ordered = provider.pickModels ? provider.pickModels(available) : available;
    const models = Array.from(new Set([
      ...(preferredModel ? [preferredModel] : []),
      ...(configuredModel ? [configuredModel] : []),
      ...ordered,
    ])).filter((model) => (!discovered.length || discovered.includes(model))
        && !isQuarantined(encodeCandidate(id, model)))
      .slice(0, MAX_MODELS_PER_PROVIDER);
    return models.map((model) => encodeCandidate(id, model));
  }));
  const candidates: string[] = [];
  for (let round = 0; round < MAX_MODELS_PER_PROVIDER; round += 1) {
    groups.forEach((group) => {
      if (group[round]) candidates.push(group[round]);
    });
  }
  return candidates;
}

/** How much live dashboard data the candidate's provider accepts per request. */
export function contextBudgetFor(candidate: string): number {
  return decodeCandidate(candidate).provider?.contextBudgetChars ?? 5_000;
}

/** The reply cap the candidate's provider is normally given. */
export function maxOutputTokensFor(candidate: string): number {
  return decodeCandidate(candidate).provider?.maxOutputTokens ?? 2048;
}

export async function callOrbitCandidate(
  candidate: string,
  systemInstruction: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  maxOutputTokens?: number
) {
  const { provider, model } = decodeCandidate(candidate);
  if (!provider) throw new Error("AI_REQUEST_FAILED");
  const apiKey = process.env[provider.envKey]?.trim() || "";
  const { url, init } = provider.buildRequest(
    model, apiKey, systemInstruction, messages, maxOutputTokens ?? provider.maxOutputTokens);
  const { response, payload } = await requestAssistantModel<RawPayload>(
    url, init, signal, provider.requestTimeoutMs);
  if (response.status === 404) quarantinedCandidates.set(candidate, Date.now() + QUARANTINE_MS);
  return { response, normalized: provider.parseResponse(payload), providerId: provider.id, model };
}

/** Reads "Limit 8000, Requested 9876" out of a provider's too-large-request message. */
export function parseTokenLimit(message: string | null): { limit: number; requested: number } | null {
  const match = message?.match(/Limit (\d+)\D+?Requested (\d+)/i);
  if (!match) return null;
  const limit = Number(match[1]);
  const requested = Number(match[2]);
  return limit > 0 && requested > limit ? { limit, requested } : null;
}

const MIN_OUTPUT_TOKENS = 768;
const SAFETY_MARGIN_TOKENS = 250;
// Dense JSON (ids, dates, keys) is about this many characters per token.
const CHARS_PER_TOKEN = 2.2;

/**
 * How to shrink a request the provider said was too large: give back reply
 * tokens first (a plan rarely needs the whole cap), then live data. Returns
 * null when nothing is left to give.
 */
export function shrinkToFit(
  { limit, requested }: { limit: number; requested: number },
  current: { maxOutputTokens: number; contextChars: number }
): { maxOutputTokens: number; contextChars: number } | null {
  const excess = requested - limit + SAFETY_MARGIN_TOKENS;
  const maxOutputTokens = Math.max(MIN_OUTPUT_TOKENS, current.maxOutputTokens - excess);
  const stillOver = excess - (current.maxOutputTokens - maxOutputTokens);
  const contextChars = stillOver > 0
    ? Math.max(0, current.contextChars - Math.ceil(stillOver * CHARS_PER_TOKEN))
    : current.contextChars;
  return maxOutputTokens === current.maxOutputTokens && contextChars === current.contextChars
    ? null
    : { maxOutputTokens, contextChars };
}

export type RequestSize = { maxOutputTokens: number; contextChars: number };

const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);
// 5xx from an overloaded provider arrives quickly; a slow one is a real failure.
const TRANSIENT_RETRY_WINDOW_MS = 8_000;

/**
 * Sends a request and answers the two failures that are worth a second try on
 * the same provider: a quick 5xx (overload spikes pass) and "request too large"
 * (the message says by how much, so the retry is sized to fit). Anything else
 * is returned as-is for the caller to judge.
 */
export async function sendWithAdaptation<
  R extends { response: Response; normalized: { errorMessage: string | null } }
>(
  send: (size: RequestSize) => Promise<R>,
  initial: RequestSize,
  options: { onShrink?: (providerMessage: string | null) => void; retryDelayMs?: number } = {}
): Promise<R> {
  let size = initial;
  const startedAt = Date.now();
  let result = await send(size);

  if (TRANSIENT_STATUSES.has(result.response.status) && Date.now() - startedAt < TRANSIENT_RETRY_WINDOW_MS) {
    await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 700));
    result = await send(size);
  }

  if (result.response.status === 413) {
    const overLimit = parseTokenLimit(result.normalized.errorMessage);
    const smaller = overLimit ? shrinkToFit(overLimit, size) : null;
    if (smaller) {
      options.onShrink?.(result.normalized.errorMessage);
      size = smaller;
      result = await send(size);
    }
  }
  return result;
}
