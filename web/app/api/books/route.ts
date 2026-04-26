import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { createBook, getBooksPageData } from "@/lib/server/books";
import { logServerEvent } from "@/lib/server/logger";
import {
  bookCreateSchema,
  booksYearQuerySchema,
} from "@/lib/server/schemas";
import { getTodayIsoForUser } from "@/lib/server/settings";
import { handleAuthError, jsonError, jsonOk, zodErrorMessage } from "@/lib/server/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const fallbackYear = Number((await getTodayIsoForUser(userEmail)).slice(0, 4));
    const parsed = booksYearQuerySchema.safeParse({
      year: searchParams.get("year") || fallbackYear,
    });
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);

    const data = await getBooksPageData(userEmail, parsed.data.year || fallbackYear);
    return jsonOk(data);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/books",
      message: "Unhandled error while loading books",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load books", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = bookCreateSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);

    const payload = parsed.data;
    const created = await createBook({
      userEmail,
      year: payload.year,
      title: payload.title,
      author: payload.author ?? null,
      coverUrl: payload.cover_url ?? null,
      totalPages: payload.total_pages ?? null,
      pagesRead: payload.pages_read,
      status: payload.status,
      rating: payload.rating ?? null,
    });

    return jsonOk(created, 201);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "POST /api/books",
      message: "Unhandled error while creating book",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && err.message === "INVALID_BOOK") {
      return jsonError("Invalid book payload", 400);
    }
    return jsonError("Failed to create book", 500);
  }
}
