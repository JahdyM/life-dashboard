import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import GoalsTab from "@/components/tabs/GoalsTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function GoalsPage() {
  const userEmail = await getAuthenticatedPageEmail();
  return (
    <div className="route-stack">
      <PageSectionIntro title="Metas & Planos" />
      <ErrorBoundary name="Goals">
        <GoalsTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
