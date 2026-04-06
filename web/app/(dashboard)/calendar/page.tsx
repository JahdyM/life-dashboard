import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import CalendarTab from "@/components/tabs/CalendarTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function CalendarPage() {
  const userEmail = await getAuthenticatedPageEmail();

  return (
    <div className="route-stack">
      <PageSectionIntro
        eyebrow="Calendar"
        title="Schedule the day without losing clarity."
        description="Use the calendar for today&apos;s task flow, Google sync when you want it, and a cleaner split between pending work, completed work, and notes."
      />
      <ErrorBoundary name="Calendar">
        <CalendarTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
