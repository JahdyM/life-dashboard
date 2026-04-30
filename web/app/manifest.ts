import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life Dashboard",
    short_name: "Dashboard",
    description: "Private personal control center for habits, tasks, mood and shared life rhythms.",
    start_url: "/today",
    display: "standalone",
    background_color: "#12100f",
    theme_color: "#8e79af",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
