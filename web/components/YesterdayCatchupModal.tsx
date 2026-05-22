"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/client/api";
import {
  getHabitDisplayLabel,
  getHabitField,
  isHabitEntryDone,
  isHabitScheduledForWeekday,
} from "@/lib/config/habits";
import type {
  CustomHabit,
  DayEntry,
  SpiritualStreakBoard,
  SpiritualStreakBoardKey,
  SpiritualStreaksPageData,
} from "@/lib/types";

type SharedHabitPreference = {
  key: string;
  label: string;
  enabled: boolean;
};

type DayResponse = { entry: DayEntry };
type CustomHabitsResponse = { items: CustomHabit[] };
type CustomDoneResponse = { done: Record<string, number> };
type MeetingDaysResponse = { days: number[] };
type FamilyDayResponse = { day: number };

type StreakUpdateArgs = {
  boardKey: SpiritualStreakBoardKey;
  success: boolean | null;
};

const STORAGE_KEY = "life-dashboard:yesterday-catchup:last-seen";
const EMPTY_DONE: Record<string, number> = {};
const EMPTY_DAYS: number[] = [];
const MIRRORED_STREAK_BY_HABIT: Record<string, SpiritualStreakBoardKey> = {
  bible_reading: "bible_reading",
  bible_study: "bible_reading",
  daily_text: "daily_text",
  prayer_on_waking: "prayer_on_waking",
};

function addDaysIso(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function weekdayFromIso(iso: string) {
  const [year, month, day] = iso.split("-").map((value) => Number(value));
  if (!year || !month || !day) return new Date().getDay();
  return new Date(year, month - 1, day).getDay();
}

function shortDisplayDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

function patchStreakBoard(
  current: SpiritualStreaksPageData | undefined,
  item: SpiritualStreakBoard
) {
  if (!current) return current;
  return {
    ...current,
    boards: current.boards.map((board) => (board.key === item.key ? item : board)),
  };
}

function mutationMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return `${fallback}: ${error.message}`;
  return fallback;
}

function StreakChoiceButton({
  active,
  children,
  disabled,
  onClick,
  tone = "neutral",
}: {
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <button
      type="button"
      className={`yesterday-choice ${tone} ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function YesterdayCatchupModal({
  todayIso,
  sharedHabits,
}: {
  todayIso: string;
  sharedHabits: SharedHabitPreference[];
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const dashboardRefreshNeededRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const yesterdayIso = useMemo(() => addDaysIso(todayIso, -1), [todayIso]);
  const yesterdayMonth = yesterdayIso.slice(0, 7);

  useEffect(() => {
    if (!todayIso) return;
    try {
      const lastSeen = window.localStorage.getItem(STORAGE_KEY);
      if (lastSeen !== todayIso) setOpen(true);
    } catch (_error) {
      setOpen(true);
    }
  }, [todayIso]);

  const refreshIntegratedViews = useCallback(
    ({ habits = false, shared = false, streaks = false }: { habits?: boolean; shared?: boolean; streaks?: boolean }) => {
      dashboardRefreshNeededRef.current = true;
      void queryClient.invalidateQueries({ queryKey: ["init"] });
      void queryClient.invalidateQueries({ queryKey: ["rewards"] });
      void queryClient.invalidateQueries({ queryKey: ["entries"] });
      void queryClient.invalidateQueries({ queryKey: ["stats-heatmap"] });
      void queryClient.invalidateQueries({ queryKey: ["stats-life-balance"] });

      if (habits) {
        void queryClient.invalidateQueries({ queryKey: ["day", yesterdayIso] });
        void queryClient.invalidateQueries({ queryKey: ["custom-habits-done", yesterdayIso] });
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      }

      if (shared) {
        void queryClient.invalidateQueries({ queryKey: ["couple-streaks"] });
      }

      if (streaks) {
        void queryClient.invalidateQueries({ queryKey: ["spiritual-streaks"] });
      }
    },
    [queryClient, yesterdayIso]
  );

  const closeForToday = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, todayIso);
    } catch (_error) {
      // If storage is blocked, still avoid trapping the user in the modal.
    }
    setOpen(false);
    if (dashboardRefreshNeededRef.current) {
      dashboardRefreshNeededRef.current = false;
      router.refresh();
    }
  }, [router, todayIso]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeForToday();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeForToday, open]);

  const dayQuery = useQuery({
    queryKey: ["day", yesterdayIso],
    queryFn: () => fetchJson<DayResponse>(`/api/day/${yesterdayIso}`),
    enabled: open,
  });

  const customHabitsQuery = useQuery({
    queryKey: ["custom-habits"],
    queryFn: () => fetchJson<CustomHabitsResponse>("/api/habits/custom"),
    enabled: open,
  });

  const customDoneQuery = useQuery({
    queryKey: ["custom-habits-done", yesterdayIso],
    queryFn: () => fetchJson<CustomDoneResponse>(`/api/habits/custom/done/${yesterdayIso}`),
    enabled: open,
  });

  const meetingDaysQuery = useQuery({
    queryKey: ["meeting-days"],
    queryFn: () => fetchJson<MeetingDaysResponse>("/api/settings/meeting-days"),
    enabled: open,
  });

  const familyDayQuery = useQuery({
    queryKey: ["family-day"],
    queryFn: () => fetchJson<FamilyDayResponse>("/api/settings/family-worship-day"),
    enabled: open,
  });

  const streaksQuery = useQuery({
    queryKey: ["spiritual-streaks", yesterdayMonth],
    queryFn: () => fetchJson<SpiritualStreaksPageData>(`/api/spiritual-streaks?month=${yesterdayMonth}`),
    enabled: open,
  });

  const updateDay = useMutation({
    mutationFn: ({ habitKey, checked }: { habitKey: string; checked: boolean }) =>
      fetchJson<DayResponse>(`/api/day/${yesterdayIso}`, {
        method: "PATCH",
        body: JSON.stringify({ [habitKey]: checked ? 1 : 0 }),
      }),
    onMutate: async ({ habitKey, checked }) => {
      setFeedback(null);
      await queryClient.cancelQueries({ queryKey: ["day", yesterdayIso] });
      const previous = queryClient.getQueryData<DayResponse>(["day", yesterdayIso]);
      const field = getHabitField(habitKey);
      if (field) {
        queryClient.setQueryData<DayResponse | undefined>(["day", yesterdayIso], (current) => ({
          entry: {
            ...(current?.entry || {}),
            [field]: checked ? 1 : 0,
          },
        }));
      }
      return { previous };
    },
    onSuccess: (payload, variables) => {
      queryClient.setQueryData(["day", yesterdayIso], payload);
      refreshIntegratedViews({
        habits: true,
        shared: true,
        streaks: Boolean(MIRRORED_STREAK_BY_HABIT[variables.habitKey]),
      });
      void queryClient.invalidateQueries({ queryKey: ["spiritual-streaks", yesterdayMonth] });
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(["day", yesterdayIso], context.previous);
      setFeedback(mutationMessage(error, "Não consegui salvar o hábito"));
    },
  });

  const updateCustomDone = useMutation({
    mutationFn: (done: Record<string, number>) =>
      fetchJson<{ ok: true }>(`/api/habits/custom/done/${yesterdayIso}`, {
        method: "PUT",
        body: JSON.stringify({ done }),
      }),
    onMutate: async (done) => {
      setFeedback(null);
      await queryClient.cancelQueries({ queryKey: ["custom-habits-done", yesterdayIso] });
      const previous = queryClient.getQueryData<CustomDoneResponse>([
        "custom-habits-done",
        yesterdayIso,
      ]);
      queryClient.setQueryData<CustomDoneResponse>(["custom-habits-done", yesterdayIso], { done });
      return { previous };
    },
    onSuccess: () => {
      refreshIntegratedViews({ habits: true });
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["custom-habits-done", yesterdayIso], context.previous);
      }
      setFeedback(mutationMessage(error, "Não consegui salvar o hábito"));
    },
  });

  const updateStreak = useMutation({
    mutationFn: ({ boardKey, success }: StreakUpdateArgs) =>
      fetchJson<{ item: SpiritualStreakBoard }>(`/api/spiritual-streaks/${boardKey}`, {
        method: "PATCH",
        body: JSON.stringify({
          month: yesterdayMonth,
          date: yesterdayIso,
          success,
          note: null,
        }),
      }),
    onMutate: () => setFeedback(null),
    onSuccess: ({ item }) => {
      queryClient.setQueryData<SpiritualStreaksPageData | undefined>(
        ["spiritual-streaks", yesterdayMonth],
        (current) => patchStreakBoard(current, item)
      );
      refreshIntegratedViews({ streaks: true });
    },
    onError: (error) => {
      setFeedback(mutationMessage(error, "Não consegui salvar o streak"));
    },
  });

  const customDone = customDoneQuery.data?.done ?? EMPTY_DONE;
  const dayEntry = dayQuery.data?.entry ?? null;
  const yesterdayWeekday = weekdayFromIso(yesterdayIso);
  const meetingDays = meetingDaysQuery.data?.days ?? EMPTY_DAYS;
  const familyDay = familyDayQuery.data?.day ?? 6;

  const visibleSharedHabits = useMemo(
    () =>
      sharedHabits
        .filter((habit) => habit.enabled)
        .filter((habit) =>
          isHabitScheduledForWeekday(habit.key, yesterdayWeekday, meetingDays, familyDay)
        ),
    [familyDay, meetingDays, sharedHabits, yesterdayWeekday]
  );

  const visibleCustomHabits = useMemo(
    () => (customHabitsQuery.data?.items ?? []).filter((habit) => habit.active !== false),
    [customHabitsQuery.data?.items]
  );

  const mirroredBoardKeys = useMemo(
    () =>
      new Set(
        visibleSharedHabits
          .map((habit) => MIRRORED_STREAK_BY_HABIT[habit.key])
          .filter(Boolean)
      ),
    [visibleSharedHabits]
  );

  const streakBoards = useMemo(
    () =>
      (streaksQuery.data?.boards ?? []).filter((board) => !mirroredBoardKeys.has(board.key)),
    [mirroredBoardKeys, streaksQuery.data?.boards]
  );

  const isLoading =
    dayQuery.isPending ||
    customHabitsQuery.isPending ||
    customDoneQuery.isPending ||
    meetingDaysQuery.isPending ||
    familyDayQuery.isPending ||
    streaksQuery.isPending;
  const isSaving = updateDay.isPending || updateCustomDone.isPending || updateStreak.isPending;
  const hasLoadError =
    dayQuery.isError ||
    customHabitsQuery.isError ||
    customDoneQuery.isError ||
    meetingDaysQuery.isError ||
    familyDayQuery.isError ||
    streaksQuery.isError;

  const handleToggleCustom = (habitId: string, checked: boolean) => {
    updateCustomDone.mutate({ ...customDone, [habitId]: checked ? 1 : 0 });
  };

  if (!open) return null;

  return (
    <div className="yesterday-catchup-overlay" role="dialog" aria-modal="true" aria-labelledby="yesterday-catchup-title">
      <button
        type="button"
        className="yesterday-catchup-backdrop"
        onClick={closeForToday}
        aria-label="Fechar revisão de ontem"
      />

      <section className="yesterday-catchup-panel card">
        <header className="yesterday-catchup-head">
          <div>
            <p className="panel-kicker">Fechar ontem</p>
            <h2 id="yesterday-catchup-title">O que foi feito em {shortDisplayDate(yesterdayIso)}?</h2>
          </div>
          <button type="button" className="secondary subtle icon-only" onClick={closeForToday} aria-label="Fechar">
            ×
          </button>
        </header>

        <p className="yesterday-catchup-copy">Marque aqui; tudo entra no dia anterior.</p>

        {feedback ? <div className="warning compact">{feedback}</div> : null}
        {hasLoadError ? <div className="warning compact">Não consegui carregar ontem. Tente pela página de Hábitos.</div> : null}

        {isLoading ? (
          <div className="yesterday-catchup-loading">Carregando ontem...</div>
        ) : (
          <div className="yesterday-catchup-sections">
            <section className="yesterday-catchup-section">
              <div className="yesterday-catchup-section-head">
                <h3>Hábitos</h3>
                {isSaving ? <span>Salvando...</span> : null}
              </div>

              <div className="yesterday-catchup-list">
                {visibleSharedHabits.map((habit) => (
                  <label key={habit.key} className="yesterday-check-row">
                    <input
                      type="checkbox"
                      checked={isHabitEntryDone(dayEntry as Record<string, unknown>, habit.key)}
                      onChange={(event) =>
                        updateDay.mutate({ habitKey: habit.key, checked: event.target.checked })
                      }
                      disabled={updateDay.isPending}
                    />
                    <span>{getHabitDisplayLabel(habit.key, habit.label)}</span>
                  </label>
                ))}

                {visibleCustomHabits.map((habit) => (
                  <label key={habit.id} className="yesterday-check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(customDone[habit.id])}
                      onChange={(event) => handleToggleCustom(habit.id, event.target.checked)}
                      disabled={updateCustomDone.isPending}
                    />
                    <span>{habit.name}</span>
                  </label>
                ))}

                {visibleSharedHabits.length === 0 && visibleCustomHabits.length === 0 ? (
                  <p className="line-empty">Nada para revisar.</p>
                ) : null}
              </div>
            </section>

            {streakBoards.length > 0 ? (
              <section className="yesterday-catchup-section">
                <div className="yesterday-catchup-section-head">
                  <h3>Streaks</h3>
                </div>
                <div className="yesterday-streak-list">
                  {streakBoards.map((board) => {
                    const cell = board.cells.find((item) => item.date === yesterdayIso);
                    const success = cell?.success ?? null;
                    return (
                      <div key={board.key} className="yesterday-streak-row">
                        <div>
                          <strong>{board.title}</strong>
                          <span>{board.quickPrompt}</span>
                        </div>
                        <div className="yesterday-streak-actions" role="group" aria-label={board.title}>
                          <StreakChoiceButton
                            tone="positive"
                            active={success === true}
                            disabled={updateStreak.isPending}
                            onClick={() => updateStreak.mutate({ boardKey: board.key, success: true })}
                          >
                            Sim
                          </StreakChoiceButton>
                          <StreakChoiceButton
                            tone="negative"
                            active={success === false}
                            disabled={updateStreak.isPending}
                            onClick={() => updateStreak.mutate({ boardKey: board.key, success: false })}
                          >
                            Não
                          </StreakChoiceButton>
                          <StreakChoiceButton
                            active={success === null}
                            disabled={updateStreak.isPending}
                            onClick={() => updateStreak.mutate({ boardKey: board.key, success: null })}
                          >
                            Limpar
                          </StreakChoiceButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        )}

        <footer className="yesterday-catchup-actions">
          <button type="button" className="secondary subtle" onClick={closeForToday}>
            Pular
          </button>
          <button type="button" className="primary" onClick={closeForToday}>
            Pronto
          </button>
        </footer>
      </section>
    </div>
  );
}
