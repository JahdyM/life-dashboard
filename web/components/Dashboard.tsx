"use client";

import { useEffect, useState } from "react";
import Header from "./Header";
import HabitsTab from "./tabs/HabitsTab";
import CalendarTab from "./tabs/CalendarTab";
import StatsTab from "./tabs/StatsTab";
import MoodTab from "./tabs/MoodTab";
import CoupleTab from "./tabs/CoupleTab";
import { fetchJson } from "@/lib/client/api";

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

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      fetchJson("/api/settings/timezone", {
        method: "PUT",
        body: JSON.stringify({ timezone }),
      }).catch(() => {
        return;
      });
    }
  }, []);

  return (
    <div className="app-shell">
      <Header />
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
      <div className="tab-content">
        {activeTab === "habits" && <HabitsTab userEmail={userEmail} />}
        {activeTab === "calendar" && <CalendarTab userEmail={userEmail} />}
        {activeTab === "stats" && <StatsTab userEmail={userEmail} />}
        {activeTab === "mood" && <MoodTab userEmail={userEmail} />}
        {activeTab === "couple" && <CoupleTab userEmail={userEmail} />}
      </div>
    </div>
  );
}
