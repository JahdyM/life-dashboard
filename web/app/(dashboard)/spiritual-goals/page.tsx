import type { Metadata } from "next";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import SpiritualGoalsClient from "@/components/spiritual-goals/SpiritualGoalsClient";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";
import { getSpiritualGoalsPageData } from "@/lib/server/spiritualGoals";

export const metadata: Metadata = {
  title: "Spiritual Goals",
};

export default async function SpiritualGoalsPage() {
  const userEmail = await getAuthenticatedPageEmail();
  const initialData = await getSpiritualGoalsPageData(userEmail);

  return (
    <div className="route-stack">
      <PageSectionIntro title="Spiritual Goals" />
      <ErrorBoundary name="Spiritual Goals">
        <SpiritualGoalsClient initialData={initialData} />
      </ErrorBoundary>
    </div>
  );
}
