"use client";

import { useCallback, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

export type TodayMoodOption = {
  key: string;
  label: string;
  emoji: string;
  color: string;
};

type MoodChipStyle = CSSProperties & {
  "--mood-color": string;
};

type TodayQuickLogProps = {
  todayIso: string;
  initialMoodCategory: string | null;
  initialSleepHours: number | null;
  moodOptions: TodayMoodOption[];
};

function currentTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

async function postJson(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
}

async function patchJson(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
}

export default function TodayQuickLog({
  todayIso,
  initialMoodCategory,
  initialSleepHours,
  moodOptions,
}: TodayQuickLogProps) {
  const router = useRouter();
  const defaultMood = initialMoodCategory || moodOptions[0]?.key || "neutral";
  const [selectedMood, setSelectedMood] = useState(defaultMood);
  const [sleepHours, setSleepHours] = useState(
    initialSleepHours === null || initialSleepHours === undefined
      ? ""
      : String(initialSleepHours)
  );
  const [savingMood, setSavingMood] = useState(false);
  const [savingSleep, setSavingSleep] = useState(false);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleMoods = useMemo(
    () => moodOptions.filter((mood) => mood.key && mood.emoji).slice(0, 18),
    [moodOptions]
  );

  const saveMood = useCallback(
    async (moodKey: string) => {
      if (!moodKey || savingMood) return;
      setSelectedMood(moodKey);
      setSavingMood(true);
      setError(null);
      try {
        await postJson("/api/mood", {
          day_iso: todayIso,
          logged_time: currentTimeValue(),
          mood_category: moodKey,
          mood_note: null,
        });
        setSavedLabel("Mood saved");
        router.refresh();
      } catch (_error) {
        setError("Mood failed");
      } finally {
        setSavingMood(false);
      }
    },
    [router, savingMood, todayIso]
  );

  const saveSleep = useCallback(async () => {
    if (savingSleep) return;
    const normalized = sleepHours.trim();
    if (!normalized) return;
    const value = Number(normalized);
    if (!Number.isFinite(value) || value < 0 || value > 24) {
      setError("Sleep must be 0-24h");
      return;
    }
    setSavingSleep(true);
    setError(null);
    try {
      await patchJson(`/api/day/${todayIso}`, {
        sleep_hours: value,
      });
      setSavedLabel("Sleep saved");
      router.refresh();
    } catch (_error) {
      setError("Sleep failed");
    } finally {
      setSavingSleep(false);
    }
  }, [router, savingSleep, sleepHours, todayIso]);

  const handleSleepKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void saveSleep();
        event.currentTarget.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSleepHours(
          initialSleepHours === null || initialSleepHours === undefined
            ? ""
            : String(initialSleepHours)
        );
        event.currentTarget.blur();
      }
    },
    [initialSleepHours, saveSleep]
  );

  return (
    <article className="today-panel today-quick-log">
      <div className="today-panel-head compact">
        <div>
          <p className="panel-kicker">Now</p>
          <h2>Check-in</h2>
        </div>
        <span className="today-save-state">
          {savingMood || savingSleep ? "Saving..." : error || savedLabel || "Auto"}
        </span>
      </div>

      <div className="today-quick-section">
        <span className="today-quick-label">Mood</span>
        <div className="today-mood-picker" role="list" aria-label="Mood now">
          {visibleMoods.map((mood) => (
            <button
              key={mood.key}
              type="button"
              className={`today-mood-chip ${selectedMood === mood.key ? "active" : ""}`}
              onClick={() => {
                void saveMood(mood.key);
              }}
              title={mood.label}
              style={{ "--mood-color": mood.color } as MoodChipStyle}
              aria-pressed={selectedMood === mood.key}
            >
              <span>{mood.emoji}</span>
              <small>{mood.label}</small>
            </button>
          ))}
        </div>
      </div>

      <label className="today-sleep-field">
        <span className="today-quick-label">Sleep</span>
        <span className="today-sleep-input-wrap">
          <input
            type="number"
            min="0"
            max="24"
            step="0.5"
            value={sleepHours}
            onChange={(event) => setSleepHours(event.target.value)}
            onBlur={() => {
              void saveSleep();
            }}
            onKeyDown={handleSleepKeyDown}
            placeholder="7.5"
            aria-label="Sleep hours"
          />
          <small>hours</small>
        </span>
      </label>
    </article>
  );
}
