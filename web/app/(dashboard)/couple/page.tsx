import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import CoupleTab from "@/components/tabs/CoupleTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function CouplePage() {
  const userEmail = await getAuthenticatedPageEmail();

  return (
    <div className="route-stack">
      <PageSectionIntro title="Couple" />
      <ErrorBoundary name="Couple">
        <CoupleTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
