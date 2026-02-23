import { prisma } from "@/lib/db/prisma";
import { format, parseISO, subDays } from "date-fns";
import { ensureTaskCompletionColumns } from "@/lib/server/dbCompat";
import type {
  EstimationBucket,
  EstimationPoint,
  EstimationResponse,
  EstimationSummary,
} from "@/lib/types";

const PRIORITY_ORDER = ["Low", "Medium", "High", "Critical"];

const DURATION_BUCKETS = [
  { key: "0-15", label: "0-15 min", min: 0, max: 15 },
  { key: "15-30", label: "15-30 min", min: 15, max: 30 },
  { key: "30-60", label: "30-60 min", min: 30, max: 60 },
  { key: "60-120", label: "1-2h", min: 60, max: 120 },
  { key: "120+", label: "2h+", min: 120, max: Number.MAX_SAFE_INTEGER },
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const round2 = (value: number | null) =>
  value === null ? null : Math.round(value * 100) / 100;

const normalizeCompletedDate = (completedAt: string | null) => {
  if (!completedAt) return null;
  const parsed = new Date(completedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "yyyy-MM-dd");
};

const buildSummary = (points: EstimationPoint[]): EstimationSummary => {
  if (!points.length) {
    return {
      totalSamples: 0,
      averageRatio: null,
      averageErrorMinutes: null,
      averageErrorPercent: null,
      averageAbsoluteErrorPercent: null,
      planningFallacyScore: null,
      tendency: "insufficient_data",
      recommendation: "Complete tasks with actual minutes to unlock estimation insights.",
    };
  }

  const ratios = points.map((point) => point.ratio);
  const errorMinutes = points.map((point) => point.errorMinutes);
  const errorPercent = points.map((point) => point.errorPercent);
  const absErrorPercent = points.map((point) => Math.abs(point.errorPercent));

  const averageRatio = average(ratios);
  const tendencyRatio = averageRatio ?? 1;
  const averageError = average(errorMinutes);
  const averagePercent = average(errorPercent);
  const averageAbsPercent = average(absErrorPercent);
  const planningFallacyScore =
    averageAbsPercent === null ? null : Math.max(0, 100 - averageAbsPercent * 2);

  let tendency: EstimationSummary["tendency"] = "balanced";
  let recommendation = "Your estimates are close to reality. Keep this planning style.";

  if (tendencyRatio > 1.05) {
    tendency = "underestimate";
    const factor = Math.min(2.5, Math.max(1.05, tendencyRatio));
    const sampleTask = Math.round(30 * factor);
    recommendation =
      `Completed-task history shows underestimation. Add ~${Math.round(
        (factor - 1) * 100
      )}% buffer (30 min tasks usually take ~${sampleTask} min).`;
  } else if (tendencyRatio < 0.95) {
    tendency = "overestimate";
    const factor = Math.min(0.95, Math.max(0.4, tendencyRatio));
    const sampleTask = Math.max(5, Math.round(30 * factor));
    recommendation =
      `Completed-task history shows overestimation. Reduce estimates by ~${Math.round(
        (1 - factor) * 100
      )}% (30 min tasks usually take ~${sampleTask} min).`;
  }

  return {
    totalSamples: points.length,
    averageRatio: round2(averageRatio),
    averageErrorMinutes: round2(averageError),
    averageErrorPercent: round2(averagePercent),
    averageAbsoluteErrorPercent: round2(averageAbsPercent),
    planningFallacyScore: round2(planningFallacyScore),
    tendency,
    recommendation,
  };
};

const aggregateBuckets = (
  points: EstimationPoint[],
  labels: string[],
  groupBy: (point: EstimationPoint) => string
): EstimationBucket[] => {
  return labels.map((label) => {
    const scoped = points.filter((point) => groupBy(point) === label);
    return {
      label,
      count: scoped.length,
      averageRatio: round2(average(scoped.map((point) => point.ratio))),
      averageErrorPercent: round2(
        average(scoped.map((point) => point.errorPercent))
      ),
    };
  });
};

export async function getEstimationStats(
  userEmail: string,
  period: "30d" | "90d" | "all"
): Promise<EstimationResponse> {
  await ensureTaskCompletionColumns();
  const today = new Date();
  const todayIso = format(today, "yyyy-MM-dd");
  const nowIso = today.toISOString();
  const where: Record<string, unknown> = {
    userEmail,
    isDone: 1,
    estimatedMinutes: { not: null },
    actualMinutes: { not: null },
  };

  if (period !== "all") {
    const days = period === "30d" ? 30 : 90;
    const startDate = format(subDays(today, days - 1), "yyyy-MM-dd");
    const startIso = subDays(today, days - 1).toISOString();
    where.AND = [
      {
        OR: [
          { scheduledDate: { gte: startDate, lte: todayIso } },
          { completedAt: { gte: startIso, lte: nowIso } },
        ],
      },
    ];
  }

  const tasks = await prisma.todoTask.findMany({
    where,
    select: {
      id: true,
      title: true,
      priorityTag: true,
      source: true,
      estimatedMinutes: true,
      actualMinutes: true,
      completedAt: true,
      scheduledDate: true,
    },
    orderBy: [{ completedAt: "desc" }, { scheduledDate: "desc" }, { updatedAt: "desc" }],
  });

  const points: EstimationPoint[] = tasks
    .filter(
      (task) =>
        typeof task.estimatedMinutes === "number" &&
        task.estimatedMinutes > 0 &&
        typeof task.actualMinutes === "number"
    )
    .map((task) => {
      const estimated = Number(task.estimatedMinutes || 0);
      const actual = Number(task.actualMinutes || 0);
      const completedDate = normalizeCompletedDate(task.completedAt || null);
      const referenceDate = task.scheduledDate || completedDate || null;
      const ratio = actual / estimated;
      const errorMinutes = actual - estimated;
      const errorPercent = (errorMinutes / estimated) * 100;
      return {
        taskId: task.id,
        title: task.title,
        estimatedMinutes: estimated,
        actualMinutes: actual,
        ratio,
        errorMinutes,
        errorPercent,
        priorityTag: task.priorityTag || "Medium",
        scheduledDate: referenceDate,
      };
    });

  const byPriority = aggregateBuckets(points, PRIORITY_ORDER, (point) => {
    return PRIORITY_ORDER.includes(point.priorityTag) ? point.priorityTag : "Medium";
  });

  const byDuration = DURATION_BUCKETS.map((bucket) => {
    const scoped = points.filter(
      (point) =>
        point.estimatedMinutes >= bucket.min && point.estimatedMinutes < bucket.max
    );
    return {
      label: bucket.label,
      count: scoped.length,
      averageRatio: round2(average(scoped.map((point) => point.ratio))),
      averageErrorPercent: round2(
        average(scoped.map((point) => point.errorPercent))
      ),
    };
  });

  const byWeekday = aggregateBuckets(points, WEEKDAY_LABELS, (point) => {
    if (!point.scheduledDate) return "Mon";
    const date = parseISO(point.scheduledDate);
    const weekday = WEEKDAY_LABELS[(date.getDay() + 6) % 7];
    return weekday;
  });

  const sourceByTaskId = new Map(
    tasks.map((task) => [task.id, String(task.source || "manual").toLowerCase()])
  );
  const sourceLabels = Array.from(new Set(sourceByTaskId.values())).sort();

  const bySource = aggregateBuckets(points, sourceLabels, (point) => {
    return sourceByTaskId.get(point.taskId) || "manual";
  });

  const sortedByDate = [...points].sort((a, b) =>
    String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || ""))
  );
  const currentWindow = sortedByDate.slice(-30);
  const previousWindow = sortedByDate.slice(-60, -30);
  const currentRatio = average(currentWindow.map((item) => item.ratio));
  const previousRatio = average(previousWindow.map((item) => item.ratio));
  const delta =
    currentRatio === null || previousRatio === null
      ? null
      : currentRatio - previousRatio;
  const trendMessage =
    delta === null
      ? "Need more completed tasks to evaluate trend."
      : delta < -0.08
        ? "Estimation precision is improving in recent tasks."
        : delta > 0.08
          ? "Recent tasks are taking longer than planned. Increase buffers."
          : "Estimation trend is stable.";

  return {
    summary: buildSummary(points),
    byPriority,
    byDuration,
    byWeekday,
    bySource,
    trend: {
      currentRatio: round2(currentRatio),
      previousRatio: round2(previousRatio),
      delta: round2(delta),
      message: trendMessage,
    },
    points,
  };
}
