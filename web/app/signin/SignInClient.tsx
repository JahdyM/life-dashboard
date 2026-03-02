"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

export default function SignInClient() {
  const router = useRouter();
  const { status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState<string>("/");
  const [reconnectGoogle, setReconnectGoogle] = useState(false);
  const reconnectStartedRef = useRef(false);

  useEffect(() => {
    if (status === "authenticated" && !reconnectGoogle) {
      router.replace("/");
    }
  }, [status, reconnectGoogle, router]);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    setError(params.get("error"));
    const rawCallback = params.get("callbackUrl");
    if (rawCallback && rawCallback.trim()) {
      setCallbackUrl(rawCallback);
    }
    setReconnectGoogle(params.get("reconnect") === "google");
  }, []);

  useEffect(() => {
    if (!reconnectGoogle) return;
    if (status === "loading") return;
    if (reconnectStartedRef.current) return;
    reconnectStartedRef.current = true;
    void signIn("google", { callbackUrl });
  }, [callbackUrl, reconnectGoogle, status]);

  const errorMessage = useMemo(() => resolveSignInErrorMessage(error), [error]);
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
          onClick={() => signIn("google", { callbackUrl })}
        >
          {loading ? "Redirecting..." : "Sign in"}
        </button>
      </div>
    </div>
  );
}
