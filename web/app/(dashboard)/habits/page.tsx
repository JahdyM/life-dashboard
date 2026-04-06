import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import HabitsTab from "@/components/tabs/HabitsTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function HabitsPage() {
  const userEmail = await getAuthenticatedPageEmail();

  return (
    <div className="route-stack">
      <PageSectionIntro
        eyebrow="Habits"
        title="Keep daily rhythm easy to review and easy to act on."
        description="Track only what applies today, edit personal habits cleanly, and keep the daily metrics visible without crowding the rest of the dashboard."
      />
      <ErrorBoundary name="Habits">
        <HabitsTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
