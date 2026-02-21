import "../styles/globals.css";
import { Providers } from "./providers";
import { ReactNode } from "react";
import { Cormorant_Garamond, Inter } from "next/font/google";
import AtomCursor from "@/components/AtomCursor";

const headingFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-heading",
});

const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

export const metadata = {
  title: "Life Dashboard",
  description: "Personal life dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@fullcalendar/core@6.1.11/main.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@fullcalendar/timegrid@6.1.11/main.min.css"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <AtomCursor />
      </body>
    </html>
  );
}
