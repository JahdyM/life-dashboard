import type { Metadata } from "next";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import OnboardingClient from "@/components/onboarding/OnboardingClient";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";
import { getDashboardOnboardingPreferences } from "@/lib/server/onboarding";

export const metadata: Metadata = {
  title: "Onboarding",
};

export default async function OnboardingPage() {
  const userEmail = await getAuthenticatedPageEmail();
  const preferences = await getDashboardOnboardingPreferences(userEmail);

  return (
    <div className="route-stack">
      <PageSectionIntro title="Customize" />
      <ErrorBoundary name="Onboarding">
        <OnboardingClient initialPreferences={preferences} />
      </ErrorBoundary>
    </div>
  );
}
