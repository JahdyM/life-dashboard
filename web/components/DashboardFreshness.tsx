"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

function isUserEditing() {
  const active = document.activeElement;
  if (!active) return false;
  if (active instanceof HTMLInputElement) return true;
  if (active instanceof HTMLTextAreaElement) return true;
  if (active instanceof HTMLSelectElement) return true;
  return active instanceof HTMLElement && active.isContentEditable;
}

export default function DashboardFreshness() {
  const router = useRouter();
  const lastRefreshRef = useRef(Date.now());

  useEffect(() => {
    const maybeRefresh = () => {
      if (document.hidden || isUserEditing()) return;
      const now = Date.now();
      if (now - lastRefreshRef.current < 30_000) return;
      lastRefreshRef.current = now;
      router.refresh();
    };

    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", maybeRefresh);

    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", maybeRefresh);
    };
  }, [router]);

  return null;
}
