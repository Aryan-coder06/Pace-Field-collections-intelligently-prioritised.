"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
export function Providers({ children }: { children: React.ReactNode }) {
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          if (registration.waiting) setUpdate(registration);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setUpdate(registration);
            });
          });
        })
        .catch(() => undefined);
      const reload = () => window.location.reload();
      navigator.serviceWorker.addEventListener("controllerchange", reload);
      return () =>
        navigator.serviceWorker.removeEventListener("controllerchange", reload);
    }
  }, []);
  return (
    <QueryClientProvider client={client}>
      {children}
      {update?.waiting && (
        <div className="update-toast" role="status">
          <span>
            <b>Pace update ready</b>
            <small>Refresh to use the latest field workflow.</small>
          </span>
          <button
            onClick={() =>
              update.waiting?.postMessage({ type: "SKIP_WAITING" })
            }
          >
            Update
          </button>
        </div>
      )}
    </QueryClientProvider>
  );
}
