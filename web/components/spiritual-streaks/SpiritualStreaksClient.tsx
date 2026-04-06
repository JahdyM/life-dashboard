"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fetchJson } from "@/lib/client/api";
import { shiftMonthKey } from "@/lib/spiritualStreaks";
import type {
  SpiritualStreakBoard,
  SpiritualStreakBoardKey,
  SpiritualStreaksPageData,
} from "@/lib/types";
import SpiritualStreakBoardCard from "./SpiritualStreakBoard";

function patchBoard(
  data: SpiritualStreaksPageData | undefined,
  nextBoard: SpiritualStreakBoard
): SpiritualStreaksPageData | undefined {
  if (!data) return data;
  return {
    ...data,
    boards: data.boards.map((board) =>
      board.key === nextBoard.key ? nextBoard : board
    ),
  };
}

export default function SpiritualStreaksClient({
  initialData,
}: {
  initialData: SpiritualStreaksPageData;
}) {
  const queryClient = useQueryClient();
  const [monthKey, setMonthKey] = useState(initialData.monthKey);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingBoardKey, setPendingBoardKey] = useState<SpiritualStreakBoardKey | null>(null);
  const streaksQueryKey = ["spiritual-streaks", monthKey] as const;
  const monthInitialData =
    monthKey === initialData.monthKey ? initialData : undefined;

  const streaksQuery = useQuery<SpiritualStreaksPageData>({
    queryKey: streaksQueryKey,
    queryFn: () =>
      fetchJson<SpiritualStreaksPageData>(`/api/spiritual-streaks?month=${monthKey}`),
    ...(monthInitialData ? { initialData: monthInitialData } : {}),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      boardKey,
      date,
      success,
    }: {
      boardKey: SpiritualStreakBoardKey;
      date: string;
      success: boolean | null;
    }) =>
      fetchJson<{ item: SpiritualStreakBoard }>(`/api/spiritual-streaks/${boardKey}`, {
        method: "PATCH",
        body: JSON.stringify({
          month: monthKey,
          date,
          success,
          note: null,
        }),
      }),
  });

  const data = streaksQuery.data ?? monthInitialData;

  return (
    <div className="route-stack spiritual-streaks-shell">
      <section className="spiritual-streaks-toolbar card">
        <div>
          <h3>{data?.monthLabel || monthKey}</h3>
        </div>

        <div className="spiritual-streaks-month-controls">
          <button
            type="button"
            className="secondary subtle icon-only"
            onClick={() => setMonthKey((current) => shiftMonthKey(current, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            value={monthKey}
            onChange={(event) => {
              if (event.target.value) setMonthKey(event.target.value);
            }}
            aria-label="Select month"
          />
          <button
            type="button"
            className="secondary subtle icon-only"
            onClick={() => setMonthKey((current) => shiftMonthKey(current, 1))}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </section>

      {streaksQuery.isPending ? <div className="query-status">Loading…</div> : null}
      {streaksQuery.isError ? (
        <div className="query-status error">
          <span>Couldn&apos;t load streaks.</span>
          <button className="secondary" onClick={() => streaksQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {feedback ? <div className="warning">{feedback}</div> : null}

      {data ? (
        <section className="spiritual-streaks-grid" aria-label="Spiritual streak boards">
          {data.boards.map((board) => (
            <SpiritualStreakBoardCard
              key={board.key}
              board={board}
              todayIso={data.todayIso}
              pending={updateMutation.isPending && pendingBoardKey === board.key}
              onMark={({ boardKey, date, success }) => {
                setFeedback(null);
                setPendingBoardKey(boardKey);
                updateMutation.mutate(
                  { boardKey, date, success },
                  {
                    onSuccess: ({ item }) => {
                      queryClient.setQueryData<SpiritualStreaksPageData | undefined>(
                        streaksQueryKey,
                        (current) => patchBoard(current, item)
                      );
                      void queryClient.invalidateQueries({ queryKey: ["spiritual-streaks"] });
                    },
                    onError: (error) => {
                      setFeedback(
                        error instanceof Error
                          ? error.message
                          : "Could not update spiritual streak."
                      );
                    },
                    onSettled: () => {
                      setPendingBoardKey(null);
                    },
                  }
                );
              }}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
