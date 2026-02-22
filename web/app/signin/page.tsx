"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

function resolveSignInErrorMessage(error: string | null): string {
  if (!error) return "";
  if (error === "AccessDenied") {
    return "This Google account is not allowed. Use Jahdy or Guilherme account.";
  }
  if (error === "OAuthAccountNotLinked") {
    return "This email is linked with a different login method. Use Google for this account.";
  }
  return "Login failed. Please try again.";
}

export default function SignInPage() {
  const router = useRouter();
  const { status } = useSession();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    setErrorMessage(resolveSignInErrorMessage(params.get("error")));
  }, []);

  const loading = status === "loading" || status === "authenticated";

  return (
    <div className="signin">
      <div className="signin-card">
        <h1>Life Dashboard</h1>
        <p>{loading ? "Checking your session..." : "Sign in with Google to continue."}</p>
        {errorMessage ? <p className="warning">{errorMessage}</p> : null}
        <button
          className="primary"
          disabled={loading}
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          {loading ? "Redirecting..." : "Sign in"}
        </button>
      </div>
    </div>
  );
}
