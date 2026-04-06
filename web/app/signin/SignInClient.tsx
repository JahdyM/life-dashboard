"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";

function resolveSignInErrorMessage(error: string | null): string {
  if (!error) return "";
  if (error === "AccessDenied") {
    return "This Google account is not allowed for this private dashboard.";
  }
  if (error === "OAuthAccountNotLinked") {
    return "This email is linked with a different login method. Please continue with Google.";
  }
  return "Sign-in did not complete. Please try again.";
}

type SignInClientProps = {
  callbackUrl: string;
  error: string | null;
  reconnectGoogle: boolean;
};

export default function SignInClient({
  callbackUrl,
  error,
  reconnectGoogle,
}: SignInClientProps) {
  const [submitting, setSubmitting] = useState(false);
  const reconnectStartedRef = useRef(false);

  useEffect(() => {
    if (!reconnectGoogle) return;
    if (reconnectStartedRef.current) return;
    reconnectStartedRef.current = true;
    setSubmitting(true);
    void signIn("google", {
      callbackUrl,
      prompt: "consent",
      access_type: "offline",
    });
  }, [callbackUrl, reconnectGoogle]);

  const errorMessage = useMemo(() => resolveSignInErrorMessage(error), [error]);
  const helperText = reconnectGoogle
    ? "Google Calendar access needs to be refreshed before the app can sync again."
    : "Sign in once with your private Google account to open the dashboard.";

  return (
    <div className="signin-shell">
      <section className="signin-hero">
        <p className="signin-chip">Private control center</p>
        <h1>Life Dashboard</h1>
        <p className="signin-copy">
          A calm place to track the day: habits, tasks, shared rhythms, mood, and what
          needs attention next.
        </p>
        <ul className="signin-list">
          <li>See today&apos;s priorities before the rest of the app opens.</li>
          <li>Keep shared habits and calendar rhythm in one place.</li>
          <li>Use one Google sign-in for the full private workspace.</li>
        </ul>
      </section>

      <section className="signin-card">
        <div className="signin-card-head">
          <p className="panel-kicker">{reconnectGoogle ? "Reconnect Google" : "Sign in"}</p>
          <h2>{reconnectGoogle ? "Restore calendar access" : "Open your dashboard"}</h2>
          <p>{helperText}</p>
        </div>
        {errorMessage ? <p className="warning">{errorMessage}</p> : null}
        {!errorMessage && reconnectGoogle ? (
          <p className="signin-note">We&apos;ll send you through Google again and bring you back here.</p>
        ) : null}
        <button
          className="primary"
          disabled={submitting}
          onClick={() => {
            setSubmitting(true);
            void signIn("google", {
              callbackUrl,
              prompt: reconnectGoogle ? "consent" : undefined,
              access_type: "offline",
            });
          }}
        >
          {submitting
            ? "Redirecting..."
            : reconnectGoogle
              ? "Reconnect with Google"
              : "Continue with Google"}
        </button>
        <p className="signin-note">
          Only allowlisted accounts can enter this dashboard.
        </p>
      </div>
    </div>
  );
}
