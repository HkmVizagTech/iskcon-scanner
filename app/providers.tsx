"use client";

import { useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Register service worker ONLY in production
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    }
  }, []);

  return <>{children}</>;
}
