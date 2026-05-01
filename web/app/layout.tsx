import "../styles/globals.css";
import { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import AtomCursor from "@/components/AtomCursor";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Life Dashboard",
  description: "Private personal control center for habits, tasks, mood, and shared life rhythms.",
  applicationName: "Life Dashboard",
  manifest: "/manifest.webmanifest",
  // Note: icon.svg, icon0.tsx and apple-icon.tsx in app/ are auto-injected by Next.
  appleWebApp: {
    capable: true,
    title: "Dashboard",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Dashboard",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#12100f" },
    { media: "(prefers-color-scheme: dark)", color: "#12100f" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AtomCursor />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
