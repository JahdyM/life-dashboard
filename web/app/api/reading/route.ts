import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { logServerEvent } from "@/lib/server/logger";
import {
  getReadingPageData,
  importDespertaiIssues,
  setArticleSeriesRead,
  setBroadcastingVideoRead,
  setBibleChapterRead,
  setDespertaiIssueRead,
  setDespertaiIssueReadCount,
  setDespertaiTopicRead,
  setReadingVideoRead,
  setReadingBookRead,
} from "@/lib/server/reading";
import { handleAuthError, jsonError, jsonOk, zodErrorMessage } from "@/lib/server/response";
import { readingPatchSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    return jsonOk(await getReadingPageData(userEmail));
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/reading",
      message: "Unhandled error while loading reading progress",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load reading progress", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_error) {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = readingPatchSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);

    const payload = parsed.data;
    if (payload.type === "import_despertai") {
      return jsonOk(await importDespertaiIssues(userEmail, payload.raw));
    }
    if (payload.type === "toggle_despertai_topic") {
      return jsonOk(
        await setDespertaiTopicRead(userEmail, payload.issue_id, payload.topic_id, payload.read)
      );
    }
    if (payload.type === "toggle_despertai_issue") {
      return jsonOk(await setDespertaiIssueRead(userEmail, payload.issue_id, payload.read));
    }
    if (payload.type === "set_despertai_read_count") {
      return jsonOk(
        await setDespertaiIssueReadCount(userEmail, payload.issue_id, payload.read_count)
      );
    }
    if (payload.type === "toggle_reading_video") {
      return jsonOk(await setReadingVideoRead(userEmail, payload.video_id, payload.read));
    }
    if (payload.type === "toggle_broadcasting_video") {
      return jsonOk(await setBroadcastingVideoRead(userEmail, payload.video_id, payload.read));
    }
    if (payload.type === "toggle_article_series") {
      return jsonOk(await setArticleSeriesRead(userEmail, payload.video_id, payload.read));
    }
    if (payload.type === "toggle_reading_book") {
      return jsonOk(await setReadingBookRead(userEmail, payload.video_id, payload.read));
    }
    return jsonOk(
      await setBibleChapterRead(userEmail, payload.book_key, payload.chapter, payload.read)
    );
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PATCH /api/reading",
      message: "Unhandled error while updating reading progress",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    if (err instanceof Error && err.message === "INVALID_BIBLE_CHAPTER") {
      return jsonError("Invalid Bible chapter", 400);
    }
    return jsonError("Failed to update reading progress", 500);
  }
}
