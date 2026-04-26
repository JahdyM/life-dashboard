"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Sparkles } from "lucide-react";
import InlineActionNotice from "@/components/common/InlineActionNotice";
import { fetchJson } from "@/lib/client/api";
import type {
  DashboardModuleView,
  DashboardOnboardingPreferences,
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
        }),
      });
      setModules(sortModules(response.preferences.modules));
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
