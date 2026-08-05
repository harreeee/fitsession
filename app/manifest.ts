import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FXA FITNESS",
    short_name: "FXA",
    description: "FXA Fitness management application",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#facc15",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}