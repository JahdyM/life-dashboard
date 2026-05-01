import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { revokeApiToken } from "@/lib/server/apiTokens";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const id = String(context.params.id || "").trim();
    if (!id) return jsonError("Missing token id", 400);
    const removed = await revokeApiToken(userEmail, id);
    if (!removed) return jsonError("Token not found", 404);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to revoke token", 500);
  }
}
