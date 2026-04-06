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
      <PageSectionIntro
        eyebrow="Spiritual Goals"
        title="Small steps reach big goals."
        description="Keep five meaningful journeys visible without turning them into a cluttered dashboard. Each staircase grows only from the steps you choose to define, and the detail stays gently tucked behind the visual."
      />
      <ErrorBoundary name="Spiritual Goals">
        <SpiritualGoalsClient initialData={initialData} />
      </ErrorBoundary>
    </div>
  );
}
