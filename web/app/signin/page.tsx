"use client";

import { useEffect, useMemo } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  const errorMessage = useMemo(() => {
    const error = searchParams.get("error");
    if (!error) return "";
    if (error === "AccessDenied") {
      return "This Google account is not allowed. Use Jahdy or Guilherme account.";
    }
    if (error === "OAuthAccountNotLinked") {
      return "This email is linked with a different login method. Use Google for this account.";
    }
    return "Login failed. Please try again.";
  }, [searchParams]);

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
