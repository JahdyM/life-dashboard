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
