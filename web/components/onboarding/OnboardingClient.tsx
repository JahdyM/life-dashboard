"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Sparkles } from "lucide-react";
import InlineActionNotice from "@/components/common/InlineActionNotice";
import { fetchJson } from "@/lib/client/api";
import type {
  DashboardModuleView,
  DashboardOnboardingPreferences,
  OnboardingHabitStarterPreference,
  OnboardingNamedPreference,
  WorkspaceMode,
} from "@/lib/config/dashboard";

type OnboardingResponse = {
  preferences: DashboardOnboardingPreferences;
};

function modulePayload(modules: DashboardModuleView[]) {
  return modules.map((module, index) => ({
    key: module.key,
    label: module.label,
    enabled: module.key === "today" ? true : module.enabled,
    nav_group: module.navGroup,
    order: (index + 1) * 10,
  }));
}

function namedPayload(items: OnboardingNamedPreference<string>[]) {
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    enabled: item.enabled,
  }));
}

function starterPayload(items: OnboardingHabitStarterPreference[]) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    enabled: item.enabled,
  }));
}

function sortModules(modules: DashboardModuleView[]) {
  return [...modules].sort((a, b) => a.order - b.order);
}

export default function OnboardingClient({
  initialPreferences,
}: {
  initialPreferences: DashboardOnboardingPreferences;
}) {
  const router = useRouter();
  const [modules, setModules] = useState(() => sortModules(initialPreferences.modules));
  const [sharedHabits, setSharedHabits] = useState(initialPreferences.sharedHabits);
  const [customHabitStarters, setCustomHabitStarters] = useState(
    initialPreferences.customHabitStarters
  );
  const [spiritualStreaks, setSpiritualStreaks] = useState(initialPreferences.spiritualStreaks);
  const [moods, setMoods] = useState(initialPreferences.moods);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(initialPreferences.workspaceMode);
  const [partnerEmail, setPartnerEmail] = useState(initialPreferences.partnerEmail || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabledCount = useMemo(
    () => modules.filter((module) => module.enabled).length,
    [modules]
  );
  const primaryCount = useMemo(
    () => modules.filter((module) => module.enabled && module.navGroup === "primary").length,
    [modules]
  );

  const updateModule = (key: DashboardModuleView["key"], patch: Partial<DashboardModuleView>) => {
    setModules((current) =>
      current.map((module) => {
        if (module.key !== key) return module;
        const enabled = module.key === "today" ? true : (patch.enabled ?? module.enabled);
        return { ...module, ...patch, enabled };
      })
    );
  };

  const updateNamedItem = (
    setter: Dispatch<SetStateAction<OnboardingNamedPreference<string>[]>>,
    key: string,
    patch: Partial<OnboardingNamedPreference<string>>
  ) => {
    setter((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  };

  const updateStarterHabit = (
    id: string,
    patch: Partial<OnboardingHabitStarterPreference>
  ) => {
    setCustomHabitStarters((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const moveModule = (index: number, direction: -1 | 1) => {
    setModules((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next.map((module, orderIndex) => ({ ...module, order: (orderIndex + 1) * 10 }));
    });
  };

  const save = async (complete: boolean) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetchJson<OnboardingResponse>("/api/onboarding", {
        method: "PUT",
        body: JSON.stringify({
          completed: complete,
          workspace_mode: workspaceMode,
          partner_email: workspaceMode === "shared" ? partnerEmail.trim() : null,
          modules: modulePayload(modules),
          shared_habits: namedPayload(sharedHabits),
          custom_habit_starters: starterPayload(customHabitStarters),
          spiritual_streaks: namedPayload(spiritualStreaks),
          moods: namedPayload(moods),
        }),
      });
      setModules(sortModules(response.preferences.modules));
      setSharedHabits(response.preferences.sharedHabits);
      setCustomHabitStarters(response.preferences.customHabitStarters);
      setSpiritualStreaks(response.preferences.spiritualStreaks);
      setMoods(response.preferences.moods);
      setMessage(complete ? "Workspace ready." : "Saved.");
      router.refresh();
      if (complete) {
        router.push("/today");
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to save.";
      setError(`Could not save onboarding. ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-shell">
      {error ? <InlineActionNotice tone="error" body={error} /> : null}
      {message ? <InlineActionNotice tone="default" body={message} /> : null}

      <section className="onboarding-hero-card">
        <div>
          <p className="panel-kicker">Customize</p>
          <h2>Your observatory</h2>
          <p>Choose what belongs on the desk.</p>
        </div>
        <div className="onboarding-hero-orb" aria-hidden="true">
          <Sparkles size={30} />
        </div>
      </section>

      <section className="onboarding-section">
        <div className="onboarding-section-head">
          <div>
            <p className="panel-kicker">Mode</p>
            <h3>Solo or shared</h3>
          </div>
        </div>
        <div className="onboarding-mode-grid">
          <button
            type="button"
            className={`onboarding-choice ${workspaceMode === "solo" ? "active" : ""}`}
            onClick={() => setWorkspaceMode("solo")}
          >
            <strong>Solo</strong>
            <span>Private tracking.</span>
          </button>
          <button
            type="button"
            className={`onboarding-choice ${workspaceMode === "shared" ? "active" : ""}`}
            onClick={() => setWorkspaceMode("shared")}
          >
            <strong>Shared</strong>
            <span>Prepare for couple streaks.</span>
          </button>
        </div>
        {workspaceMode === "shared" ? (
          <label className="onboarding-partner-field">
            Partner email
            <input
              type="email"
              value={partnerEmail}
              onChange={(event) => setPartnerEmail(event.target.value)}
              placeholder="person@example.com"
            />
          </label>
        ) : null}
      </section>

      <section className="onboarding-section">
        <div className="onboarding-section-head">
          <div>
            <p className="panel-kicker">Modules</p>
            <h3>Tabs</h3>
          </div>
          <span>{enabledCount} on · {primaryCount} primary</span>
        </div>

        <div className="onboarding-module-list">
          {modules.map((module, index) => (
            <article key={module.key} className={`onboarding-module-card ${module.enabled ? "enabled" : ""}`}>
              <div className="onboarding-module-main">
                <label className="onboarding-module-toggle">
                  <input
                    type="checkbox"
                    checked={module.enabled}
                    disabled={module.key === "today"}
                    onChange={(event) => updateModule(module.key, { enabled: event.target.checked })}
                  />
                  <span>{module.defaultLabel}</span>
                </label>
                <input
                  type="text"
                  value={module.label}
                  onChange={(event) => updateModule(module.key, { label: event.target.value })}
                  aria-label={`${module.defaultLabel} label`}
                />
              </div>

              <div className="onboarding-module-actions">
                <button
                  type="button"
                  className={`chip ${module.navGroup === "primary" ? "active" : ""}`}
                  disabled={!module.enabled}
                  onClick={() =>
                    updateModule(module.key, {
                      navGroup: module.navGroup === "primary" ? "secondary" : "primary",
                    })
                  }
                >
                  Primary
                </button>
                <button
                  type="button"
                  className="chip"
                  disabled={index === 0}
                  onClick={() => moveModule(index, -1)}
                  aria-label={`Move ${module.label} up`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="chip"
                  disabled={index === modules.length - 1}
                  onClick={() => moveModule(index, 1)}
                  aria-label={`Move ${module.label} down`}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="onboarding-section">
        <div className="onboarding-section-head">
          <div>
            <p className="panel-kicker">Habits</p>
            <h3>Shared checks</h3>
          </div>
          <span>{sharedHabits.filter((habit) => habit.enabled).length} on</span>
        </div>

        <div className="onboarding-module-list compact">
          {sharedHabits.map((habit) => (
            <article key={habit.key} className={`onboarding-module-card ${habit.enabled ? "enabled" : ""}`}>
              <div className="onboarding-module-main">
                <label className="onboarding-module-toggle">
                  <input
                    type="checkbox"
                    checked={habit.enabled}
                    onChange={(event) =>
                      updateNamedItem(setSharedHabits, habit.key, { enabled: event.target.checked })
                    }
                  />
                  <span>{habit.key.replaceAll("_", " ")}</span>
                </label>
                <input
                  type="text"
                  value={habit.label}
                  onChange={(event) =>
                    updateNamedItem(setSharedHabits, habit.key, { label: event.target.value })
                  }
                  aria-label={`${habit.label} label`}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="onboarding-section">
        <div className="onboarding-section-head">
          <div>
            <p className="panel-kicker">Starter habits</p>
            <h3>Personal list</h3>
          </div>
          <span>{customHabitStarters.filter((habit) => habit.enabled).length} selected</span>
        </div>

        <div className="onboarding-module-list compact">
          {customHabitStarters.map((habit) => (
            <article key={habit.id} className={`onboarding-module-card ${habit.enabled ? "enabled" : ""}`}>
              <div className="onboarding-module-main">
                <label className="onboarding-module-toggle">
                  <input
                    type="checkbox"
                    checked={habit.enabled}
                    onChange={(event) => updateStarterHabit(habit.id, { enabled: event.target.checked })}
                  />
                  <span>Starter</span>
                </label>
                <input
                  type="text"
                  value={habit.name}
                  onChange={(event) => updateStarterHabit(habit.id, { name: event.target.value })}
                  aria-label={`${habit.name} name`}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="onboarding-section">
        <div className="onboarding-section-head">
          <div>
            <p className="panel-kicker">Spiritual streaks</p>
            <h3>Boards</h3>
          </div>
          <span>{spiritualStreaks.filter((board) => board.enabled).length} boards</span>
        </div>

        <div className="onboarding-module-list compact">
          {spiritualStreaks.map((board) => (
            <article key={board.key} className={`onboarding-module-card ${board.enabled ? "enabled" : ""}`}>
              <div className="onboarding-module-main">
                <label className="onboarding-module-toggle">
                  <input
                    type="checkbox"
                    checked={board.enabled}
                    onChange={(event) =>
                      updateNamedItem(setSpiritualStreaks, board.key, { enabled: event.target.checked })
                    }
                  />
                  <span>{board.key.replaceAll("_", " ")}</span>
                </label>
                <input
                  type="text"
                  value={board.label}
                  onChange={(event) =>
                    updateNamedItem(setSpiritualStreaks, board.key, { label: event.target.value })
                  }
                  aria-label={`${board.label} label`}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="onboarding-section">
        <div className="onboarding-section-head">
          <div>
            <p className="panel-kicker">Mood</p>
            <h3>Emotion palette</h3>
          </div>
          <span>{moods.filter((mood) => mood.enabled).length} moods</span>
        </div>

        <div className="onboarding-mood-grid">
          {moods.map((mood) => (
            <button
              key={mood.key}
              type="button"
              className={`onboarding-mood-chip ${mood.enabled ? "active" : ""}`}
              onClick={() => updateNamedItem(setMoods, mood.key, { enabled: !mood.enabled })}
            >
              {mood.label}
            </button>
          ))}
        </div>
      </section>

      <section className="onboarding-actions">
        <button type="button" className="secondary" onClick={() => void save(false)} disabled={saving}>
          Save
        </button>
        <button type="button" className="primary" onClick={() => void save(true)} disabled={saving}>
          <Check size={16} />
          {saving ? "Saving..." : "Start"}
        </button>
      </section>
    </div>
  );
}
