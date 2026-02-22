import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleAuthError(err: unknown) {
  if (err instanceof Error && err.message === "UNAUTHORIZED") {
    return jsonError("Unauthorized", 401);
  }
  if (err instanceof Error && err.message === "RESOURCE_NOT_FOUND") {
    return jsonError("Not found", 404);
  }
  return null;
}

export function zodErrorMessage(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid request payload";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}
