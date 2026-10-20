import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import AppSidebar from "@/components/app-sidebar";
import { MobileFloatingNav } from "@/components/mobile-floating-nav";
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

      <SidebarInset className="pb-20 md:pb-0">
        <Outlet />
      </SidebarInset>

      {/* The only way to open the sidebar on mobile — the desktop rail is hidden there. */}
      <MobileFloatingNav />
    </SidebarProvider>
  );
}
