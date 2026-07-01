import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUserEmail } from "@/lib/server/auth";
import { handleAuthError, jsonError, jsonOk, zodErrorMessage } from "@/lib/server/response";
import { getSetting, setSetting } from "@/lib/server/settings";
import { logServerEvent } from "@/lib/server/logger";

export const dynamic = "force-dynamic";

const FOCUS_TIMER_KEY = "calendar_focus_timer_v1";
const MAX_RUNNING_MS = 8 * 60 * 60 * 1000;

type FocusTimerStatus = "idle" | "running" | "paused" | "review";

type FocusTimerState = {
  taskId: string;
  minutes: number;
  status: FocusTimerStatus;
  accumulatedSeconds: number;
  startedAt: number | null;
  reviewElapsedSeconds: number;
  updatedAt: number;
  expiresAt: number | null;
};

const focusTimerSchema = z
  .object({
    taskId: z.string().trim().max(100).default(""),
    minutes: z.number().int().min(1).max(240).default(25),
    status: z.enum(["idle", "running", "paused", "review"]).default("idle"),
    accumulatedSeconds: z.number().int().min(0).max(MAX_RUNNING_MS / 1000).default(0),
    startedAt: z.union([z.number().int().positive(), z.null()]).default(null),
    reviewElapsedSeconds: z.number().int().min(0).max(MAX_RUNNING_MS / 1000).default(0),
    updatedAt: z.number().int().positive().optional(),
    expiresAt: z.union([z.number().int().positive(), z.null()]).optional(),
  })
  .strict();

function normalizeState(raw: unknown): FocusTimerState | null {
  const parsed = focusTimerSchema.safeParse(raw);
  if (!parsed.success) return null;
  const now = Date.now();
  const state = parsed.data;
  const targetSeconds = Math.max(60, state.minutes * 60);
  const startedAt = state.status === "running" ? state.startedAt || now : null;
  const expiresAt =
    state.status === "running" && startedAt
      ? Math.min(
          startedAt + MAX_RUNNING_MS,
          startedAt + Math.max(targetSeconds * 1000 * 4, 2 * 60 * 60 * 1000)
        )
      : null;
  return {
    taskId: state.taskId,
    minutes: state.minutes,
    status: state.status,
    accumulatedSeconds: state.accumulatedSeconds,
    startedAt,
    reviewElapsedSeconds: state.reviewElapsedSeconds,
    updatedAt: state.updatedAt || now,
    expiresAt: state.expiresAt ?? expiresAt,
  };
}

function applyExpiry(state: FocusTimerState | null): FocusTimerState | null {
  if (!state || state.status !== "running" || !state.startedAt || !state.expiresAt) return state;
  const now = Date.now();
  if (now < state.expiresAt) return state;
  const elapsedAtExpiry =
    state.accumulatedSeconds + Math.max(0, Math.floor((state.expiresAt - state.startedAt) / 1000));
  return {
    ...state,
    status: "review",
    startedAt: null,
    accumulatedSeconds: elapsedAtExpiry,
    reviewElapsedSeconds: elapsedAtExpiry,
    updatedAt: now,
    expiresAt: null,
  };
}

export async function GET(_request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    const raw = await getSetting(userEmail, FOCUS_TIMER_KEY);
    if (!raw) return jsonOk({ state: null });
    let rawState: unknown;
    try {
      rawState = JSON.parse(raw);
    } catch (_err) {
      return jsonOk({ state: null });
    }
    const parsed = normalizeState(rawState);
    const state = applyExpiry(parsed);
    if (state && parsed?.status === "running" && state.status === "review") {
      await setSetting(userEmail, FOCUS_TIMER_KEY, JSON.stringify(state));
    }
    return jsonOk({ state });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "GET /api/focus-timer",
      message: "Unhandled error while loading focus timer",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to load focus timer", 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userEmail = await requireUserEmail();
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch (_err) {
      return jsonError("Invalid JSON body", 400);
    }
    const parsed = focusTimerSchema.safeParse(rawPayload);
    if (!parsed.success) return jsonError(zodErrorMessage(parsed.error), 400);
    const state = normalizeState({ ...parsed.data, updatedAt: Date.now() });
    if (!state) return jsonError("Invalid focus timer state", 400);
    await setSetting(userEmail, FOCUS_TIMER_KEY, JSON.stringify(state));
    return jsonOk({ ok: true, state });
  } catch (err) {
    logServerEvent("error", {
      endpoint: "PUT /api/focus-timer",
      message: "Unhandled error while saving focus timer",
      error: err,
    });
    const authError = handleAuthError(err);
    if (authError) return authError;
    return jsonError("Failed to save focus timer", 500);
  }
}
