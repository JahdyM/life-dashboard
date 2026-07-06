import type { Metadata } from "next";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import DissertationClient from "@/components/dissertation/DissertationClient";
import { isDissertationFrontComplete } from "@/lib/dissertation";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";
import { loadDissertationProject } from "@/lib/server/dissertation";

export const metadata: Metadata = {
  title: "Dissertação",
};

export const dynamic = "force-dynamic";

export default async function DissertationPage() {
  const userEmail = await getAuthenticatedPageEmail();
  const initialProject = await loadDissertationProject(userEmail);
  const activeFrontCount = initialProject.fronts.filter(
    (front) => !isDissertationFrontComplete(front)
  ).length;
  const introDescription =
    activeFrontCount === 0
      ? "Tudo concluído."
      : `${activeFrontCount} frente${activeFrontCount === 1 ? "" : "s"} ativa${activeFrontCount === 1 ? "" : "s"}.`;

  return (
    <div className="route-stack">
      <PageSectionIntro
        title="Dissertação"
        description={introDescription}
      />
      <ErrorBoundary name="Dissertation">
        <DissertationClient initialProject={initialProject} />
      </ErrorBoundary>
    </div>
  );
}
