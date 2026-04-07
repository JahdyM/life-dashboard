"use client";

import Link from "next/link";
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
  const isTodayIntent = callbackUrl.startsWith("/today");

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
    ? "Refresh Google Calendar access."
    : isTodayIntent
      ? "Sign in to open your real Today view."
      : "Continue with your private Google account.";

  return (
    <div className="signin-shell">
      <section className="signin-hero">
        <p className="signin-chip">Private study desk</p>
        <h1>Life Dashboard</h1>
        <p className="signin-copy">
          A calm observatory for habits, tasks, mood, and reflection.
        </p>
        <ul className="signin-list">
          <li>One sign in for your full workspace.</li>
          <li>Focused, private, and daily.</li>
        </ul>
        <div className="signin-preview-links">
          <Link href="/" className="page-link">
            Back home
          </Link>
          <Link href="/today" className="page-link">
            See today preview
          </Link>
        </div>
      </section>

      <section className="signin-card">
        <div className="signin-card-head">
          <p className="panel-kicker">{reconnectGoogle ? "Reconnect Google" : "Sign in"}</p>
          <h2>{reconnectGoogle ? "Restore calendar access" : "Open dashboard"}</h2>
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
              ? "Reconnect"
              : "Continue"}
        </button>
        <p className="signin-note">
          Private access is limited to invited accounts.
        </p>
      </section>
    </div>
  );
}
