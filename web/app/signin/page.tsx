import { Suspense } from "react";
import SignInClient from "./SignInClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SignInPage() {

  return (
    <Suspense fallback={<div className="signin"><div className="signin-card"><p>Loading...</p></div></div>}>
      <SignInClient />
    </Suspense>
  );
}
