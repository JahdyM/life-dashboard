/**
 * `timeoutMs` is opt-in: some callers stream or upload large payloads and must
 * not be cut off. Pass it for requests that should never hang the UI forever.
 */
export async function fetchJson<T>(
  url: string,
  options?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs, ...init } = options || {};
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = timeoutMs ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  if (controller && init.signal) {
    init.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal: controller ? controller.signal : init.signal,
    });
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text
    ? (() => {
        try {
          return JSON.parse(text);
        } catch (_error) {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    const message = payload?.error || response.statusText;
    throw new Error(message);
  }

  return payload as T;
}
