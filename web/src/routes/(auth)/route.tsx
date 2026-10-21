import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import Icon from "@/components/ui/icon";
import { ensureSession, isAuthenticated } from "@/lib/api/auth";

export const Route = createFileRoute("/(auth)")({
  beforeLoad: async () => {
    await ensureSession();

    // Already signed in — no reason to show a sign-in form.
    if (isAuthenticated()) {
      throw redirect({ to: "/" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-aurora text-white glow-primary">
            <Icon name="cloud" className="size-4" />
          </span>
          <span className="font-medium">storage-edge</span>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
