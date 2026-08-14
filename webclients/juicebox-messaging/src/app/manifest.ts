import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Juicebox Messaging",
    short_name: "JB Messages",
    description: "Private purchase support and project community messaging.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff7e8",
    theme_color: "#4864c8",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
