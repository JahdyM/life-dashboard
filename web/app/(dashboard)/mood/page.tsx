import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import MoodTab from "@/components/tabs/MoodTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function MoodPage() {
  const userEmail = await getAuthenticatedPageEmail();

  return (
    <div className="route-stack">
      <PageSectionIntro
        eyebrow="Mood"
        title="Capture emotional context while it is still easy to remember."
        description="The goal here is not complexity. It is to make the day legible: mood, note, and emotional texture in a format that helps future reflection."
      />
      <ErrorBoundary name="Mood">
        <MoodTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
