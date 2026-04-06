import type { Metadata } from "next";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import SpiritualStreaksClient from "@/components/spiritual-streaks/SpiritualStreaksClient";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";
import { getTodayIsoForUser } from "@/lib/server/settings";
import { getSpiritualStreaksPageData } from "@/lib/server/spiritualStreaks";

export const metadata: Metadata = {
  title: "Spiritual Streaks",
};

export default async function SpiritualStreaksPage() {
  const userEmail = await getAuthenticatedPageEmail();
  const todayIso = await getTodayIsoForUser(userEmail);
  const initialData = await getSpiritualStreaksPageData(userEmail, todayIso.slice(0, 7));

  return (
    <div className="route-stack">
      <PageSectionIntro
        eyebrow="Spiritual Streaks"
        title="Keep consistency visible without turning it into noise."
        description="Four dedicated boards, one day per square, and respectful streak tracking that stays calm even for sensitive areas. Success days fill the month, while missed or unmarked days stay restrained and easy to review."
      />
      <ErrorBoundary name="Spiritual Streaks">
        <SpiritualStreaksClient initialData={initialData} />
      </ErrorBoundary>
    </div>
  );
}
