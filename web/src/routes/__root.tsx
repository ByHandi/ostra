import type { QueryClient } from "@tanstack/react-query";
import { Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Handed to every route's `beforeLoad`/`loader` from `main.tsx`. Passing the
 * QueryClient through router context — rather than importing the singleton
 * inside loaders — keeps loaders free of module-level state.
 */
export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});

/**
 * Global shell — app-wide concerns only, no visual chrome. Per-section layout
 * lives in the route groups: `(app)/route.tsx` renders the sidebar, and
 * `(auth)/route.tsx` centres the sign-in forms.
 *
 * `TooltipProvider` is required here because `ui/sidebar.tsx` renders a bare
 * `Tooltip` for its `tooltip` prop without providing the context itself, and
 * Radix throws without a provider ancestor.
 */
function RootLayout() {
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center text-sm">
      <div>
        <h1 className="font-medium">Page not found</h1>
        <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
      </div>
      <Link to="/" className="underline underline-offset-4">
        Back to dashboard
      </Link>
    </div>
  );
}
