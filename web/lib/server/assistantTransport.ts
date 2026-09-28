/** Each candidate gets its own deadline, leaving time for another candidate to answer. */
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

/**
 * Thrown only when every candidate raised an exception (none ever produced an
 * HTTP response to judge). Carries what was tried and why, so a total-failure
 * case — otherwise a bare "AI_REQUEST_FAILED" with no further detail — can
 * still be logged with enough context to diagnose.
 */
export class AssistantFallbackError extends Error {
  attemptedModels: string[];
  attempts: Array<{ model: string; error: string }>;
  constructor(message: string, attemptedModels: string[], attempts: Array<{ model: string; error: string }>) {
    super(message);
    this.name = "AssistantFallbackError";
    this.attemptedModels = attemptedModels;
    this.attempts = attempts;
  }
}

/**
 * Tries each candidate in order and returns the first ok response. A candidate
 * may be a single provider's model, or (as Orbit uses it) a "provider::model"
 * pair spanning several independent providers — so a failure never assumed to
 * mean anything about the next candidate (a bad key or exhausted quota on one
 * provider says nothing about the next one's key or quota) always falls
 * through instead of giving up early. If every candidate fails, the last
 * response received (if any) is returned so the caller can report its exact
 * status; otherwise every candidate raised an exception (e.g. a network
 * failure) and an AssistantFallbackError listing each attempt is thrown.
 */
export async function withAssistantFallback<T extends { response: Response }>(
  models: string[],
  request: (model: string) => Promise<T>,
  signal: AbortSignal
): Promise<{ model: string; result: T; attemptedModels: string[] }> {
  const attemptedModels: string[] = [];
  const attempts: Array<{ model: string; error: string }> = [];
  let lastErrorMessage = "AI_REQUEST_FAILED";
  let lastResponse: { model: string; result: T } | null = null;
  for (const model of Array.from(new Set(models))) {
    if (signal.aborted) throw new Error("AI_REQUEST_TIMEOUT");
    attemptedModels.push(model);
    try {
      const result = await request(model);
      lastResponse = { model, result };
      if (result.response.ok) {
        return { model, result, attemptedModels };
      }
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : String(error);
      attempts.push({ model, error: lastErrorMessage });
    }
  }
  if (signal.aborted) throw new Error("AI_REQUEST_TIMEOUT");
  if (lastResponse) return { ...lastResponse, attemptedModels };
  throw new AssistantFallbackError(lastErrorMessage, attemptedModels, attempts);
}
