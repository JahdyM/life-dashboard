import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import MoodTab from "@/components/tabs/MoodTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function MoodPage() {
  const userEmail = await getAuthenticatedPageEmail();

  return (
    <div className="route-stack">
      <PageSectionIntro title="Mood" />
      <ErrorBoundary name="Mood">
        <MoodTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
