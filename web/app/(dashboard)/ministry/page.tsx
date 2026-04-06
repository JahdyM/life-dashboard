import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import MinistryHoursClient from "@/components/ministry/MinistryHoursClient";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";
import { getTodayIsoForUser } from "@/lib/server/settings";
import { getMinistryMonthData } from "@/lib/server/ministry";

export default async function MinistryPage() {
  const userEmail = await getAuthenticatedPageEmail();
  const todayIso = await getTodayIsoForUser(userEmail);
  const initialData = await getMinistryMonthData(userEmail, todayIso.slice(0, 7));

  return (
    <div className="route-stack">
      <PageSectionIntro
        eyebrow="Ministry hours"
        title="Track the month without losing the meaning of each day."
        description="Set one monthly target, enter manual goals only when you choose, and compare planned versus completed time with a clean month view."
      />
      <ErrorBoundary name="Ministry hours">
        <MinistryHoursClient initialData={initialData} />
      </ErrorBoundary>
    </div>
  );
}
