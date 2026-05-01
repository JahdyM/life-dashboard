import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { createApiToken, listApiTokens } from "@/lib/server/apiTokens";

export const dynamic = "force-dynamic";

// Token management endpoints require cookie session auth (not Bearer) —
// preventing tokens from minting more tokens.

export async function GET() {
  try {
    const userEmail = await requireUserEmail();
    const tokens = await listApiTokens(userEmail);
    return jsonOk({ tokens });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to list tokens", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
    const { name, scope } = (body || {}) as { name?: unknown; scope?: unknown };
    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName) return jsonError("Token name required", 400);
    const cleanScope = scope === "read" ? "read" : "write";

    const created = await createApiToken(userEmail, cleanName, cleanScope);
    // Plaintext is returned ONCE here. Caller must store it client-side.
    return jsonOk({ token: created.plaintext, record: created.record });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to create token", 500);
  }
}
