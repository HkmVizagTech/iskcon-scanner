"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // Register service worker ONLY in production
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Only register in production or if explicitly needed
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("Service Worker registered:", registration.scope);
          })
          .catch((error) => {
            console.log("Service Worker registration skipped (dev mode)");
          });
      }
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
