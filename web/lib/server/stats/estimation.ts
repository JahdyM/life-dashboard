import { prisma } from "@/lib/db/prisma";
import { format, subDays } from "date-fns";
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

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const round2 = (value: number | null) =>
  value === null ? null : Math.round(value * 100) / 100;

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
  const averageError = average(errorMinutes);
  const averagePercent = average(errorPercent);
  const averageAbsPercent = average(absErrorPercent);
  const planningFallacyScore =
    averageAbsPercent === null ? null : Math.max(0, 100 - averageAbsPercent * 2);

  let tendency: EstimationSummary["tendency"] = "balanced";
  let recommendation = "Your estimates are close to reality. Keep this planning style.";

  if (averageRatio !== null && averageRatio > 1.1) {
    tendency = "underestimate";
    recommendation =
      "Tasks are taking longer than estimated. Add a 20-40% buffer to future estimates.";
  } else if (averageRatio !== null && averageRatio < 0.9) {
    tendency = "overestimate";
    recommendation =
      "You usually finish earlier than planned. Reduce estimates slightly for tighter plans.";
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
  const today = new Date();
  const todayIso = format(today, "yyyy-MM-dd");
  const nowIso = today.toISOString();
  const where: Record<string, unknown> = {
    userEmail,
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
      estimatedMinutes: true,
      actualMinutes: true,
      scheduledDate: true,
    },
    orderBy: [{ scheduledDate: "desc" }, { updatedAt: "desc" }],
    take: 2500,
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
        scheduledDate: task.scheduledDate || null,
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

  return {
    summary: buildSummary(points),
    byPriority,
    byDuration,
    points,
  };
}
