import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { deleteBook, updateBook } from "@/lib/server/books";
import { logServerEvent } from "@/lib/server/logger";
import { bookPatchSchema, booksYearQuerySchema, taskIdSchema } from "@/lib/server/schemas";
import { getTodayIsoForUser } from "@/lib/server/settings";
import { handleAuthError, jsonError, jsonOk, zodErrorMessage } from "@/lib/server/response";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const idParsed = taskIdSchema.safeParse(context.params.id);
    if (!idParsed.success) return jsonError(zodErrorMessage(idParsed.error), 400);

    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = bookPatchSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);

    const payload = parsed.data;
    const updated = await updateBook({
      userEmail,
      bookId: idParsed.data,
      patch: {
        year: payload.year,
        title: payload.title,
        author: payload.author,
        coverUrl: payload.cover_url,
        totalPages: payload.total_pages,
        pagesRead: payload.pages_read,
        status: payload.status,
        rating: payload.rating,
      },
    });

    return jsonOk(updated);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PATCH /api/books/[id]",
      message: "Unhandled error while updating book",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && err.message === "INVALID_BOOK") {
      return jsonError("Invalid book payload", 400);
    }
    if (err instanceof Error && err.message === "RESOURCE_NOT_FOUND") {
      return jsonError("Book not found", 404);
    }
    return jsonError("Failed to update book", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const userEmail = await requireUserEmail();
    const idParsed = taskIdSchema.safeParse(context.params.id);
    if (!idParsed.success) return jsonError(zodErrorMessage(idParsed.error), 400);

    const { searchParams } = new URL(request.url);
    const fallbackYear = Number((await getTodayIsoForUser(userEmail)).slice(0, 4));
    const parsedYear = booksYearQuerySchema.safeParse({
      year: searchParams.get("year") || fallbackYear,
    });
    if (!parsedYear.success) return jsonError(zodErrorMessage(parsedYear.error), 400);

    const data = await deleteBook({
      userEmail,
      bookId: idParsed.data,
      year: parsedYear.data.year || fallbackYear,
    });

    return jsonOk(data);
  } catch (err) {
    logServerEvent("error", {
      endpoint: "DELETE /api/books/[id]",
      message: "Unhandled error while deleting book",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && err.message === "RESOURCE_NOT_FOUND") {
      return jsonError("Book not found", 404);
    }
    return jsonError("Failed to delete book", 500);
  }
}
