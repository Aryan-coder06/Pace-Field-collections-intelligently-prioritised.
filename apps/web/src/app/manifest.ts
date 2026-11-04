import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pace Field Collections",
    short_name: "Pace",
    description: "Field collections, intelligently prioritised.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#3d4fc4",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
