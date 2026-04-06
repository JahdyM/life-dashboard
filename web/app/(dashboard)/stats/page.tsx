import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import StatsTab from "@/components/tabs/StatsTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function StatsPage() {
  const userEmail = await getAuthenticatedPageEmail();

  return (
    <div className="route-stack">
      <PageSectionIntro title="Stats" />
      <ErrorBoundary name="Stats">
        <StatsTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
