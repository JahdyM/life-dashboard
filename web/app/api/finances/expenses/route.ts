import { NextRequest } from "next/server";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk } from "@/lib/server/response";
import {
  getExpenses,
  addExpense,
  removeExpense,
} from "@/lib/server/coupleSettings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);
    const items = await getExpenses(userEmail, year, month);
    return jsonOk({ expenses: items });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load expenses", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const body = await request.json();
    const { amount, category, description, date, paidBy, year, month } = body;
    if (!amount || !category || !date || !year || !month) {
      return jsonError("amount, category, date, year, month required", 400);
    }
    const record = await addExpense(userEmail, Number(year), Number(month), {
      amount: Number(amount),
      category: String(category),
      description: description ? String(description) : null,
      date: String(date),
      paidBy: String(paidBy || userEmail),
    });
    return jsonOk(record, 201);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to add expense", 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const year = parseInt(searchParams.get("year") || "", 10);
    const month = parseInt(searchParams.get("month") || "", 10);
    if (!id || !year || !month) return jsonError("id, year, month required", 400);
    await removeExpense(userEmail, year, month, id);
    return jsonOk({ ok: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to delete expense", 500);
  }
}
