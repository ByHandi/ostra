import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { Logo } from "@/components/logo";
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
        <Logo />
        <Outlet />
      </div>
    </div>
  );
}
