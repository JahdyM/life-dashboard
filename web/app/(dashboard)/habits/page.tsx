import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import HabitsTab from "@/components/tabs/HabitsTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function HabitsPage() {
  const userEmail = await getAuthenticatedPageEmail();

  return (
    <div className="route-stack">
      <PageSectionIntro title="Habits" />
      <ErrorBoundary name="Habits">
        <HabitsTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
