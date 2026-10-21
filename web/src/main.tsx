import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { routeTree } from "./routeTree.gen";

import { RouteError } from "@/components/route-error";
import { RoutePending } from "@/components/route-pending";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { queryClient } from "@/lib/query-client";

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultErrorComponent: RouteError,
  defaultPendingComponent: RoutePending,
  // Loads that finish faster than this never show a spinner at all.
  defaultPendingMs: 300,
  // Cross-fade between pages where the browser supports it (styled in index.css).
  defaultViewTransition: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
