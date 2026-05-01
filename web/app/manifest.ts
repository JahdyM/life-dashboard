import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Life Dashboard",
    short_name: "Dashboard",
    description: "Private personal control center for habits, tasks, mood and shared life rhythms.",
    id: "/",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#12100f",
    theme_color: "#12100f",
    categories: ["productivity", "lifestyle", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon0", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon0", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today", short_name: "Today", url: "/today" },
      { name: "Calendar", short_name: "Calendar", url: "/calendar" },
      { name: "Habits", short_name: "Habits", url: "/habits" },
      { name: "Mood", short_name: "Mood", url: "/mood" },
    ],
  };
}
