import type { Metadata } from "next";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import DissertationClient from "@/components/dissertation/DissertationClient";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";
import { loadDissertationProject } from "@/lib/server/dissertation";

export const metadata: Metadata = {
  title: "Dissertação",
};

export const dynamic = "force-dynamic";

export default async function DissertationPage() {
  const userEmail = await getAuthenticatedPageEmail();
  const initialProject = await loadDissertationProject(userEmail);

  return (
    <div className="route-stack">
      <PageSectionIntro
        title="Dissertação"
        description="Pequenos passos, seis frentes."
      />
      <ErrorBoundary name="Dissertation">
        <DissertationClient initialProject={initialProject} />
      </ErrorBoundary>
    </div>
  );
}
