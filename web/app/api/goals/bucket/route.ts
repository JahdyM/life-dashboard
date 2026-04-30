import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import {
  getBucketList,
  addBucketItem,
  toggleBucketItem,
  removeBucketItem,
} from "@/lib/server/coupleSettings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userEmail = await requireUserEmail();
    const items = await getBucketList(userEmail);
    return jsonOk({ items });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load bucket list", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const body = await request.json();
    const { title } = body;
    if (!title) return jsonError("title required", 400);
    const record = await addBucketItem(userEmail, String(title));
    return jsonOk(record, 201);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to add bucket item", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const body = await request.json();
    const { id } = body;
    if (!id) return jsonError("id required", 400);
    await toggleBucketItem(userEmail, String(id));
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to toggle bucket item", 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("id required", 400);
    await removeBucketItem(userEmail, id);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to delete bucket item", 500);
  }
}
