import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import {
  getMonthlyFinance,
  saveMonthlyFinance,
  computeFinanceSummary,
} from "@/lib/server/coupleSettings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);
    const data = await getMonthlyFinance(userEmail, year, month);
    const summary = computeFinanceSummary(data);
    return jsonOk({ data, summary });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load finance data", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);
    const body = await request.json();
    await saveMonthlyFinance(userEmail, year, month, body);
    const summary = computeFinanceSummary(body);
    return jsonOk({ ok: true, summary });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save finance data", 500);
  }
}
