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
import { applyApiError } from "@/lib/form-errors";

export const Route = createFileRoute("/(app)/settings")({
  component: Settings,
});

function Settings() {
  return (
    <>
      <AppHeader title="Pengaturan" description="Akun dan tampilan dashboard." />

      <div className="flex max-w-2xl flex-col gap-6 p-4 md:p-6">
        <Profile />
        <ChangePassword />
        <Appearance />
      </div>
    </>
  );
}

function Profile() {
  const session = useQuery(sessionContextQuery());
  const user = session.data?.user;

  return (
    <Section
      title="Profil"
      description="Nama dan email diatur lewat CLI di server (control createuser)."
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-xs text-muted-foreground">Nama</dt>
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
      toast.success("Password diganti. Sesi di perangkat lain sudah diakhiri.");
    } catch (error) {
      applyApiError(error, setError, PASSWORD_FIELDS);
    }
  });

  return (
    <Section
      title="Ganti password"
      description="Semua sesi lain akan keluar setelah password diganti."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <InputText.WithRHF
          control={control}
          name="currentPassword"
          type="password"
          label="Password saat ini"
          autoComplete="current-password"
          required
        />
        <InputText.WithRHF
          control={control}
          name="newPassword"
          type="password"
          label="Password baru"
          autoComplete="new-password"
          required
          description="Minimal 8 karakter."
          rules={{ minLength: { value: 8, message: "Minimal 8 karakter" } }}
        />
        <InputText.WithRHF
          control={control}
          name="confirmPassword"
          type="password"
          label="Ulangi password baru"
          autoComplete="new-password"
          required
          rules={{
            validate: (value) => value === getValues("newPassword") || "Password tidak sama",
          }}
        />
        <Button
          type="submit"
          className="self-start"
          isLoading={formState.isSubmitting}
          loadingText="Menyimpan"
        >
          Ganti password
        </Button>
      </form>
    </Section>
  );
}

const THEMES = [
  { value: "system", label: "Ikuti sistem" },
  { value: "light", label: "Terang" },
  { value: "dark", label: "Gelap" },
];

function Appearance() {
  const { theme, setTheme } = useTheme();

  return (
    <Section title="Tampilan" description="Tekan D di mana saja untuk mengganti tema dengan cepat.">
      <InputSelect
        label="Tema"
        className="max-w-xs"
        value={theme}
        onValueChange={(value) => setTheme(value as typeof theme)}
        options={THEMES}
      />
    </Section>
  );
}
