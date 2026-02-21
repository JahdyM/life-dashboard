"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/client/api";
import { format, subDays } from "date-fns";

export default function StatsTab({ userEmail }: { userEmail: string }) {
  const end = format(new Date(), "yyyy-MM-dd");
  const start = format(subDays(new Date(), 6), "yyyy-MM-dd");
  const entriesQuery = useQuery({
    queryKey: ["entries", start, end],
    queryFn: () => fetchJson<{ items: any[] }>(`/api/entries?start=${start}&end=${end}`),
  });

  const summary = useMemo(() => {
    const items = entriesQuery.data?.items || [];
    const totals = items.reduce(
      (acc, entry) => {
        acc.sleep += entry.sleepHours || 0;
        acc.work += entry.workHours || 0;
        acc.anxiety += entry.anxietyLevel || 0;
        acc.boredom += entry.boredomMinutes || 0;
        acc.days += 1;
        return acc;
      },
      { sleep: 0, work: 0, anxiety: 0, boredom: 0, days: 0 }
    );
    const denom = totals.days || 1;
    return {
      avgSleep: (totals.sleep / denom).toFixed(1),
      avgWork: (totals.work / denom).toFixed(1),
      avgAnxiety: (totals.anxiety / denom).toFixed(1),
      avgBoredom: (totals.boredom / denom).toFixed(1),
    };
  }, [entriesQuery.data]);

  return (
    <div className="card">
      <h2>Weekly averages</h2>
      <div className="stats-grid">
        <div>
          <span>Sleep hours</span>
          <strong>{summary.avgSleep}</strong>
        </div>
        <div>
          <span>Work hours</span>
          <strong>{summary.avgWork}</strong>
        </div>
        <div>
          <span>Anxiety</span>
          <strong>{summary.avgAnxiety}</strong>
        </div>
        <div>
          <span>Boredom</span>
          <strong>{summary.avgBoredom}</strong>
        </div>
      </div>
    </div>
  );
}
