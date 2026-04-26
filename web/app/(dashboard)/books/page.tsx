import type { Metadata } from "next";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageSectionIntro from "@/components/PageSectionIntro";
import BooksClient from "@/components/books/BooksClient";
import { getAuthenticatedPageEmail } from "@/lib/server/pageAuth";
import { getBooksPageData } from "@/lib/server/books";
import { getTodayIsoForUser } from "@/lib/server/settings";

export const metadata: Metadata = {
  title: "Books",
};

export default async function BooksPage() {
  const userEmail = await getAuthenticatedPageEmail();
  const year = Number((await getTodayIsoForUser(userEmail)).slice(0, 4));
  const initialData = await getBooksPageData(userEmail, year);

  return (
    <div className="route-stack">
      <PageSectionIntro title="Books" />
      <ErrorBoundary name="Books">
        <BooksClient initialData={initialData} />
      </ErrorBoundary>
    </div>
  );
}
