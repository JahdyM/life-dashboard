import "../styles/globals.css";
import { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import AtomCursor from "@/components/AtomCursor";

export const metadata: Metadata = {
  title: "Life Dashboard",
  description: "Private personal control center for habits, tasks, mood, and shared life rhythms.",
  icons: {
    icon: [
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    shortcut: "/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#111215",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AtomCursor />
      </body>
    </html>
  );
}
