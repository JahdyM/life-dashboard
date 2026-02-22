"use client";

import { useEffect, useState } from "react";
import Header from "./Header";
import HabitsTab from "./tabs/HabitsTab";
import CalendarTab from "./tabs/CalendarTab";
import StatsTab from "./tabs/StatsTab";
import MoodTab from "./tabs/MoodTab";
import CoupleTab from "./tabs/CoupleTab";
import { fetchJson } from "@/lib/client/api";
import ErrorBoundary from "./ErrorBoundary";

const TABS = [
  { key: "habits", label: "Habits" },
  { key: "calendar", label: "Calendar" },
  { key: "stats", label: "Stats" },
  { key: "mood", label: "Mood" },
  { key: "couple", label: "Couple" },
];

type TabKey = (typeof TABS)[number]["key"];

export default function Dashboard({ userEmail }: { userEmail: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>("habits");
  const [timezoneSyncError, setTimezoneSyncError] = useState<string | null>(null);
  const [timezoneSyncing, setTimezoneSyncing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      setTimezoneSyncing(true);
      fetchJson("/api/settings/timezone", {
        method: "PUT",
        body: JSON.stringify({ timezone }),
      })
        .then(() => {
          if (!isMounted) return;
          setTimezoneSyncing(false);
          setTimezoneSyncError(null);
        })
        .catch((error) => {
          if (!isMounted) return;
          setTimezoneSyncing(false);
          const message =
            error instanceof Error && error.message
              ? error.message
              : "Could not sync timezone.";
          setTimezoneSyncError(message);
        });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const renderTab = () => {
    if (activeTab === "habits") {
      return (
        <ErrorBoundary name="Habits tab">
          <HabitsTab userEmail={userEmail} />
        </ErrorBoundary>
      );
    }
    if (activeTab === "calendar") {
      return (
        <ErrorBoundary name="Calendar tab">
          <CalendarTab userEmail={userEmail} />
        </ErrorBoundary>
      );
    }
    if (activeTab === "stats") {
      return (
        <ErrorBoundary name="Stats tab">
          <StatsTab userEmail={userEmail} />
        </ErrorBoundary>
      );
    }
    if (activeTab === "mood") {
      return (
        <ErrorBoundary name="Mood tab">
          <MoodTab userEmail={userEmail} />
        </ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary name="Couple tab">
        <CoupleTab userEmail={userEmail} />
      </ErrorBoundary>
    );
  };

  return (
    <ErrorBoundary name="dashboard">
      <div className="app-shell">
        <ErrorBoundary name="header">
          <Header />
        </ErrorBoundary>
        {timezoneSyncing ? (
          <div className="query-status">Syncing timezone preferences...</div>
        ) : null}
        {timezoneSyncError ? (
          <div className="warning">
            Timezone sync failed. Data is still usable locally. ({timezoneSyncError})
          </div>
        ) : null}
        <div className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="tab-content">{renderTab()}</div>
      </div>
    </ErrorBoundary>
  );
}
