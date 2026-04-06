import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import CalendarTab from "@/components/tabs/CalendarTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function CalendarPage() {
  const userEmail = await getAuthenticatedPageEmail();

  return (
    <div className="route-stack">
      <PageSectionIntro title="Calendar" />
      <ErrorBoundary name="Calendar">
        <CalendarTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
