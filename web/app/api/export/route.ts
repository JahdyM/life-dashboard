import { NextRequest, NextResponse } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, zodErrorMessage } from "@/lib/server/response";
import { exportQuerySchema } from "@/lib/server/schemas";
import { getExportPayload, toExportCsv } from "@/lib/server/stats/behavior";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const parsed = exportQuerySchema.safeParse({
      format: searchParams.get("format") || "csv",
      start: searchParams.get("start"),
      end: searchParams.get("end"),
    });
    if (!parsed.success) {
      return jsonError(zodErrorMessage(parsed.error), 400);
    }
    const payload = await getExportPayload(
      userEmail,
      parsed.data.start,
      parsed.data.end
    );
    if (parsed.data.format === "json") {
      return NextResponse.json(payload, { status: 200 });
    }
    const csv = toExportCsv(payload);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="life-dashboard-${parsed.data.start}-to-${parsed.data.end}.csv"`,
      },
    });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/export",
      message: "Unhandled error while exporting data",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to export data", 500);
  }
}
