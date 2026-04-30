import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import FinancesTab from "@/components/tabs/FinancesTab";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";

export default async function FinancesPage() {
  const userEmail = await getAuthenticatedPageEmail();
  return (
    <div className="route-stack">
      <PageSectionIntro title="Finanças do Casal" />
      <ErrorBoundary name="Finances">
        <FinancesTab userEmail={userEmail} />
      </ErrorBoundary>
    </div>
  );
}
