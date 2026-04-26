import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, isAllowedEmail } from "@/lib/auth";
import PublicEntryExperience from "@/components/PublicEntryExperience";
import { getDashboardOnboardingPreferences } from "@/lib/server/onboarding";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();

  if (email && isAllowedEmail(email)) {
    const preferences = await getDashboardOnboardingPreferences(email);
    redirect(preferences.completed ? "/today" : "/onboarding");
  }

  return <PublicEntryExperience mode="home" />;
}
