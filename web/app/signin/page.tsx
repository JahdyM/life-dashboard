import { Suspense } from "react";
import SignInClient from "./SignInClient";

export const dynamic = "force-dynamic";

type SignInPageProps = {
  searchParams?: {
    error?: string | string[];
  };
};

export default function SignInPage({ searchParams }: SignInPageProps) {
  const rawError = searchParams?.error;
  const error = Array.isArray(rawError) ? rawError[0] || null : rawError || null;

  return (
    <Suspense fallback={<div className="signin"><div className="signin-card"><p>Loading...</p></div></div>}>
      <SignInClient error={error} />
    </Suspense>
  );
}
