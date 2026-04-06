import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import StatsTab from "@/components/tabs/StatsTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function StatsPage() {
  const userEmail = await getAuthenticatedPageEmail();

  return (
    <div className="route-stack">
      <PageSectionIntro
        eyebrow="Stats"
        title="See the signals without drowning in analysis."
        description="The core time-series charts stay front and center, while deeper analytics remain available when you want to inspect patterns more carefully."
      />
      <ErrorBoundary name="Stats">
        <StatsTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
