import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ISKCON Seva Pass Scanner",
    short_name: "ISKCON Scanner",
    description: "QR Code Scanner for ISKCON Seva Pass Validation",
    start_url: "/",
    display: "standalone",
    background_color: "#f97316",
    theme_color: "#f97316",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // screenshots omitted — the referenced /splash.png was a placeholder
    // that never existed as a real file (404). Not required for
    // installability; add back with a real UI screenshot if desired for
    // the richer install-preview UI some browsers show.
    categories: ["utility", "productivity"],
    prefer_related_applications: false,
  };
}
