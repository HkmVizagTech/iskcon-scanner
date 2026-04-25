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
    screenshots: [
      {
        src: "/splash.png",
        sizes: "1170x2532",
        type: "image/png",
      },
    ],
    categories: ["utility", "productivity"],
    prefer_related_applications: false,
  };
}
