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

  const streaksQuery = useQuery({
    queryKey: ["spiritual-streaks", monthKey],
    queryFn: () =>
      fetchJson<SpiritualStreaksPageData>(`/api/spiritual-streaks?month=${monthKey}`),
    initialData: monthKey === initialData.monthKey ? initialData : undefined,
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

  const data = monthKey === initialData.monthKey ? streaksQuery.data ?? initialData : streaksQuery.data;

  return (
    <div className="route-stack spiritual-streaks-shell">
      <section className="spiritual-streaks-toolbar card">
        <div>
          <p className="panel-kicker">Consistency board</p>
          <h3>{data?.monthLabel || monthKey}</h3>
          <p className="page-intro-copy small">
            Seven focused boards, one calm month view, and a respectful way to keep daily spiritual consistency visible.
          </p>
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

      {streaksQuery.isPending ? <div className="query-status">Loading spiritual streaks...</div> : null}
      {streaksQuery.isError ? (
        <div className="query-status error">
          <span>Could not load spiritual streaks.</span>
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
                        ["spiritual-streaks", monthKey],
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
