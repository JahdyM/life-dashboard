type LogLevel = "error" | "warn" | "info";

type LogContext = {
  endpoint: string;
  userEmail?: string | null;
  message: string;
  error?: unknown;
  meta?: Record<string, unknown>;
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
};

export function logServerEvent(level: LogLevel, context: LogContext) {
  const payload = {
    level,
    endpoint: context.endpoint,
    message: context.message,
    userEmail: context.userEmail || null,
    meta: context.meta || {},
    error: context.error ? serializeError(context.error) : undefined,
    timestamp: new Date().toISOString(),
  };

  if (level === "error") {
    console.error(payload);
    return;
  }
  if (level === "warn") {
    console.warn(payload);
    return;
  }
  console.info(payload);
}
