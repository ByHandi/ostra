import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";

import { useForm } from "react-hook-form";

import InputText from "@/components/form/input-text";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/api/auth";
import { applyApiError } from "@/lib/form-errors";

export const Route = createFileRoute("/(auth)/login")({
  /**
   * Where the guard wanted to go before it bounced us here. Sanitised at the
   * boundary: only same-origin absolute paths survive, so a crafted
   * `?redirect=https://evil.com` (or `//evil.com`) cannot turn the login page
   * into an open redirect. Returning no key at all — rather than
   * `{ redirect: undefined }` — keeps `search` optional on links to /login.
   */
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const target = search.redirect;

    if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//")) {
      return {};
    }

    return { redirect: target };
  },
  component: Login,
});

interface LoginValues {
  email: string;
  password: string;
}

const FIELDS = ["email", "password"] as const;

function Login() {
  const { redirect: redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();

  const { control, handleSubmit, setError, formState } = useForm<LoginValues>({
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);

      if (redirectTo) {
        // `navigate` needs a `to` known at compile time; this target is not, so
        // go through history. Already sanitised by `validateSearch` above.
        router.history.push(redirectTo);
        return;
      }

      await navigate({ to: "/" });
    } catch (error) {
      applyApiError(error, setError, FIELDS);
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl">Masuk</h1>
        <p className="text-sm text-muted-foreground">
          Kelola bucket, custom domain, dan access key.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <InputText.WithRHF
          control={control}
          name="email"
          type="email"
          label="Email"
          placeholder="admin@contoh.com"
          autoComplete="email"
          autoFocus
          required
        />
        <InputText.WithRHF
          control={control}
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" isLoading={formState.isSubmitting} loadingText="Memproses">
        Masuk
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Lupa password? Reset lewat server: <code>control setpassword --email …</code>
      </p>
    </form>
  );
}
