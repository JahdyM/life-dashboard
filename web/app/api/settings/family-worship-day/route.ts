import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import { getFamilyWorshipDay, setFamilyWorshipDay } from "@/lib/server/settings";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const day = await getFamilyWorshipDay(userEmail);
    return jsonOk({ day });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load family worship day", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const payload = await request.json();
    await setFamilyWorshipDay(userEmail, payload.day);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to update family worship day", 500);
  }
}
