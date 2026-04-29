import type { Metadata } from "next";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import DespertaiClient from "@/components/despertai/DespertaiClient";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";
import { getReadingPageData } from "@/lib/server/reading";

export const metadata: Metadata = {
  title: "Despertai",
};

export default async function DespertaiPage() {
  const userEmail = await getAuthenticatedPageEmail();
  const data = await getReadingPageData(userEmail);

  return (
    <div className="route-stack">
      <PageSectionIntro title="Despertai" />
      <ErrorBoundary name="Despertai">
        <DespertaiClient initialData={data} />
      </ErrorBoundary>
    </div>
  );
}
