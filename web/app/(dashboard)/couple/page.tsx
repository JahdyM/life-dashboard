import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import CoupleTab from "@/components/tabs/CoupleTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function CouplePage() {
  const userEmail = await getAuthenticatedPageEmail();

  return (
    <div className="route-stack">
      <PageSectionIntro
        eyebrow="Couple"
        title="Keep shared rhythms visible, gentle, and actionable."
        description="This section should help both of you notice connection points, shared consistency, and small ways to support each other during the week."
      />
      <ErrorBoundary name="Couple">
        <CoupleTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
