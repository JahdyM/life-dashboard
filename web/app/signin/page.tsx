"use client";

import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <div className="signin">
      <div className="signin-card">
        <h1>Life Dashboard</h1>
        <p>Sign in with Google to continue.</p>
        <button className="primary" onClick={() => signIn("google")}>
          Sign in
        </button>
      </div>
    </div>
  );
}
