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

type ProviderId = "groq" | "cerebras" | "gemini";

/** Providers are tried in this order: fast/generous free tiers first, Gemini last. */
const PROVIDER_ORDER: ProviderId[] = ["groq", "cerebras", "gemini"];

type ProviderDef = {
  id: ProviderId;
  envKey: string;
  /** Used only if discovery fails or returns nothing — kept short and best-effort. */
  staticModels: string[];
  discoveryUrl: string;
  discoveryHeaders(apiKey: string): Record<string, string>;
  parseDiscovery(payload: RawPayload): string[];
  buildRequest(
    model: string,
    apiKey: string,
    systemInstruction: string,
    messages: ChatMessage[]
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
  const error = payload?.error as { message?: string; type?: string; code?: string } | undefined;
  const choice = (payload?.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const message = choice?.message as { content?: string } | undefined;
  const text = message?.content?.trim() || null;
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  return {
    text,
    errorStatus: error?.type || error?.code || null,
    errorMessage: error?.message || null,
    truncated: finishReason === "length",
  };
}

// Groq and Cerebras count prompt + max_tokens against a per-minute budget, so
// asking for 8192 up front rejects requests that would have fit. A plan that
// really needs more gets cut off (finish_reason "length") and is retried on
// the next candidate, which has the larger Gemini limit.
const OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS = 3072;

function buildOpenAiCompatibleRequest(
  baseUrl: string,
  model: string,
  apiKey: string,
  systemInstruction: string,
  messages: ChatMessage[]
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
        max_tokens: OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
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

const PROVIDERS: Record<ProviderId, ProviderDef> = {
  groq: {
    id: "groq",
    envKey: "GROQ_API_KEY",
    staticModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"],
    discoveryUrl: "https://api.groq.com/openai/v1/models",
    discoveryHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseDiscovery: parseOpenAiCompatibleDiscovery,
    buildRequest: (model, apiKey, systemInstruction, messages) =>
      buildOpenAiCompatibleRequest("https://api.groq.com/openai/v1", model, apiKey, systemInstruction, messages),
    parseResponse: parseOpenAiCompatibleResponse,
  },
  cerebras: {
    id: "cerebras",
    envKey: "CEREBRAS_API_KEY",
    staticModels: ["llama-3.3-70b", "llama3.1-8b"],
    discoveryUrl: "https://api.cerebras.ai/v1/models",
    discoveryHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    parseDiscovery: parseOpenAiCompatibleDiscovery,
    buildRequest: (model, apiKey, systemInstruction, messages) =>
      buildOpenAiCompatibleRequest("https://api.cerebras.ai/v1", model, apiKey, systemInstruction, messages),
    parseResponse: parseOpenAiCompatibleResponse,
  },
  gemini: {
    id: "gemini",
    envKey: "GEMINI_API_KEY",
    staticModels: ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"],
    discoveryUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    discoveryHeaders: (apiKey) => ({ "x-goog-api-key": apiKey }),
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
    buildRequest: (model, apiKey, systemInstruction, messages) => ({
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
            maxOutputTokens: 8192,
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

const MAX_MODELS_PER_PROVIDER = 2;

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
    const models = Array.from(new Set([
      ...(preferredModel ? [preferredModel] : []),
      ...(configuredModel ? [configuredModel] : []),
      ...available,
    ])).filter((model) => !discovered.length || discovered.includes(model))
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

export async function callOrbitCandidate(
  candidate: string,
  systemInstruction: string,
  messages: ChatMessage[],
  signal: AbortSignal
) {
  const { provider, model } = decodeCandidate(candidate);
  if (!provider) throw new Error("AI_REQUEST_FAILED");
  const apiKey = process.env[provider.envKey]?.trim() || "";
  const { url, init } = provider.buildRequest(model, apiKey, systemInstruction, messages);
  const { response, payload } = await requestAssistantModel<RawPayload>(url, init, signal);
  // A retired model must not remain preferred through the discovery cache TTL.
  if (response.status === 404) discoveryCache.delete(provider.id);
  return { response, normalized: provider.parseResponse(payload), providerId: provider.id, model };
}
