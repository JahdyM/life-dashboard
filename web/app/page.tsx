"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Dashboard from "@/components/Dashboard";

export default function HomePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/signin");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="signin">
        <div className="signin-card">
          <h1>Life Dashboard</h1>
          <p>Loading your session...</p>
        </div>
      </div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div className="signin">
        <div className="signin-card">
          <h1>Life Dashboard</h1>
          <p>Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  return <Dashboard userEmail={session.user?.email || ""} />;
}

