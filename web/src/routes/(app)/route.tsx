import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import AppSidebar from "@/components/app-sidebar";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { SIDEBAR_COOKIE_NAME, SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ensureSession, isAuthenticated, logout } from "@/lib/api/auth";
import { sessionContextQuery } from "@/lib/api/session";

export const Route = createFileRoute("/(app)")({
  beforeLoad: async ({ location }) => {
    // Waits for the one boot-time refresh, so a reload straight onto a protected
    // route does not bounce to login before the session is restored.
    await ensureSession();

    let directPath;

    if (location.href !== "/") directPath = location.href;

    if (!isAuthenticated()) {
      throw redirect({ to: "/login", search: { redirect: directPath } });
    }
  },
  // Runs after the guard, so it always has a token. `ensureQueryData` serves the
  // cache on later navigations — this only hits the network once per staleTime.
  loader: ({ context }) => context.queryClient.ensureQueryData(sessionContextQuery()),
  component: AppLayout,
});

/**
 * SidebarProvider writes the collapsed/expanded choice to the `sidebar_state`
 * cookie but never reads it back — upstream expects a server to do that and hand
 * it in as `defaultOpen`. There is no server here, so read it ourselves.
 * Absent cookie → open, matching the provider's own default.
 */
function readSidebarDefaultOpen(): boolean {
  const entry = document.cookie
    .split(";")
    .map((row) => row.trim())
    .find((row) => row.startsWith(`${SIDEBAR_COOKIE_NAME}=`));

  return entry?.slice(SIDEBAR_COOKIE_NAME.length + 1) !== "false";
}

function AppLayout() {
  const { user } = Route.useLoaderData();
  // Only seeds the provider's initial state; it owns the value from then on.
  const defaultOpen = readSidebarDefaultOpen();

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} onLogout={logout} />

      {/*
        Phones: the window scrolls (the collapsing header tracks it), with bottom
        padding to clear the tab bar plus the home indicator.
        Desktop: the viewport is pinned — sidebar and page header stay put, and
        only the page body (each page's last child, after its AppHeader) scrolls.
      */}
      <SidebarInset className="bg-transparent pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] md:h-svh md:overflow-hidden md:pb-0 md:*:last:min-h-0 md:*:last:flex-1 md:*:last:overflow-y-auto">
        <Outlet />
      </SidebarInset>

      {/* Phones navigate with the tab bar; the sidebar is desktop-only. */}
      <MobileTabBar />
    </SidebarProvider>
  );
}
