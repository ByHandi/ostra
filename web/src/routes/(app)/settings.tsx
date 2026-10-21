import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useForm } from "react-hook-form";
import { toast } from "sonner";

import AppHeader from "@/components/app-header";
import InputSelect from "@/components/form/input-select";
import InputText from "@/components/form/input-text";
import Section from "@/components/section";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { changePassword } from "@/lib/api/auth";
import { sessionContextQuery } from "@/lib/api/session";
import { versionQuery } from "@/lib/api/storage";
import { applyApiError } from "@/lib/form-errors";

export const Route = createFileRoute("/(app)/settings")({
  component: Settings,
});

function Settings() {
  return (
    <>
      <AppHeader title="Settings" description="Your account and the dashboard's appearance." />

      <div className="flex max-w-2xl flex-col gap-6 p-4 md:p-6">
        <Profile />
        <ChangePassword />
        <Appearance />
        <About />
      </div>
    </>
  );
}

function Profile() {
  const session = useQuery(sessionContextQuery());
  const user = session.data?.user;

  return (
    <Section
      title="Profile"
      description="Name and email are managed with the CLI on the server (control createuser)."
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">Name</dt>
          <dd className="text-sm">{user ? user.name : <Skeleton className="h-5 w-32" />}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="text-sm">{user ? user.email : <Skeleton className="h-5 w-48" />}</dd>
        </div>
      </dl>
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
          autoComplete="current-password"
          required
        />
        <InputText.WithRHF
          control={control}
          name="newPassword"
          type="password"
          label="New password"
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
