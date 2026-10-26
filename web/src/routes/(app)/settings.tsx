import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import AppHeader from "@/components/app-header";
import InputSelect from "@/components/form/input-select";
import InputText from "@/components/form/input-text";
import Section from "@/components/section";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { changePassword, logout } from "@/lib/api/auth";
import { sessionContextQuery } from "@/lib/api/session";
import { versionQuery } from "@/lib/api/storage";
import { applyApiError } from "@/lib/form-errors";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/(app)/settings")({
  head: () => pageMeta("Settings", "Your account and the dashboard's appearance."),
  component: Settings,
});

function Settings() {
  return (
    <>
      <AppHeader title="Settings" description="Your account and the dashboard's appearance." />

      <div className="flex max-w-2xl flex-col gap-6 p-4 md:p-6">
        <Profile />
        <UserManagement />
        <ChangePassword />
        <Appearance />
        <About />
        <SignOut />
      </div>
    </>
  );
}

function Profile() {
  const session = useQuery(sessionContextQuery());
  const user = session.data?.user;

  return (
    <Section title="Profile" description="Your account credentials and current role.">
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">Name</dt>
          <dd className="text-sm">{user ? user.name : <Skeleton className="h-5 w-32" />}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="text-sm">{user ? user.email : <Skeleton className="h-5 w-48" />}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">Role</dt>
          <dd className="text-sm">
            {user ? (
              <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                {user.role === "admin" ? "Admin" : "Viewer"}
              </Badge>
            ) : (
              <Skeleton className="h-5 w-16" />
            )}
          </dd>
        </div>
      </dl>
    </Section>
  );
}

function UserManagement() {
  const session = useQuery(sessionContextQuery());
  const user = session.data?.user;

  if (user?.role !== "admin") return null;

  return (
    <Section
      title="User Management"
      description="Invite, edit roles, and manage access for operators."
    >
      <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Dashboard Users</p>
          <p className="text-xs text-muted-foreground">
            Manage admin and viewer accounts directly from the dashboard.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/users">Manage users</Link>
        </Button>
      </div>
    </Section>
  );
}

interface PasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const PASSWORD_FIELDS = ["currentPassword", "newPassword"] as const;

function ChangePassword() {
  const { control, handleSubmit, setError, reset, getValues, formState } = useForm<PasswordValues>({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await changePassword({ currentPassword, newPassword });
      reset();
      toast.success("Password changed. Sessions on other devices have been ended.");
    } catch (error) {
      applyApiError(error, setError, PASSWORD_FIELDS);
    }
  });

  return (
    <Section
      title="Change password"
      description="All other sessions will be signed out once the password is changed."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <InputText.WithRHF
          control={control}
          name="currentPassword"
          type="password"
          label="Current password"
          placeholder="Enter your current password"
          startContent={<Icon name="lock" />}
          autoComplete="current-password"
          required
        />
        <InputText.WithRHF
          control={control}
          name="newPassword"
          type="password"
          label="New password"
          placeholder="Enter a new password"
          startContent={<Icon name="lock-keyhole" />}
          autoComplete="new-password"
          required
          description="At least 8 characters."
          rules={{ minLength: { value: 8, message: "Must be at least 8 characters" } }}
        />
        <InputText.WithRHF
          control={control}
          name="confirmPassword"
          type="password"
          label="Confirm new password"
          placeholder="Re-enter the new password"
          startContent={<Icon name="lock-keyhole" />}
          autoComplete="new-password"
          required
          rules={{
            validate: (value) => value === getValues("newPassword") || "Passwords don't match",
          }}
        />
        <Button
          type="submit"
          className="self-start"
          isLoading={formState.isSubmitting}
          loadingText="Saving"
        >
          Change password
        </Button>
      </form>
    </Section>
  );
}

const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function Appearance() {
  const { theme, setTheme } = useTheme();

  return (
    <Section title="Appearance" description="Press D anywhere to quickly toggle the theme.">
      <InputSelect
        label="Theme"
        placeholder="Select a theme"
        startContent={<Icon name="sun-moon" />}
        className="max-w-xs"
        value={theme}
        onValueChange={(value) => setTheme(value as typeof theme)}
        options={THEMES}
      />
    </Section>
  );
}

function About() {
  const version = useQuery(versionQuery());

  return (
    <Section title="About" description="The Ostra version currently running.">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">Version</dt>
          <dd className="font-mono text-sm">
            {version.data ? version.data.version : <Skeleton className="h-5 w-20" />}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">Commit</dt>
          <dd className="font-mono text-sm">
            {version.data ? version.data.commit : <Skeleton className="h-5 w-24" />}
          </dd>
        </div>
      </dl>
    </Section>
  );
}

/** Phones only — on desktop, logging out lives in the sidebar footer. */
function SignOut() {
  const [isLoggingOut, startLogout] = useTransition();

  return (
    <Button
      variant="destructive"
      className="h-11 text-base md:hidden"
      isLoading={isLoggingOut}
      loadingText="Logging out"
      startContent={<Icon name="log-out" className="size-4" />}
      onClick={() => startLogout(async () => void (await logout()))}
    >
      Log out
    </Button>
  );
}
