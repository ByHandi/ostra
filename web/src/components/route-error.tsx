import type { ErrorComponentProps } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { PageError } from "@/components/ui/page-error";
import { ApiError } from "@/lib/api/errors";

function describe(error: Error): { title: string; message: string } {
  if (error instanceof ApiError) {
    if (error.isNetworkError) {
      return {
        title: "Server tidak bisa dihubungi",
        message: "Periksa koneksi lalu coba lagi.",
      };
    }

    if (error.status === 403) {
      return {
        title: "Kamu tidak punya akses ke halaman ini",
        message: error.message,
      };
    }

    return { title: "Halaman gagal dimuat", message: error.message };
  }

  return {
    title: "Terjadi kesalahan",
    // Only in dev: a raw exception message can leak internals in production.
    message: import.meta.env.DEV ? error.message : "Terjadi kesalahan yang tidak terduga.",
  };
}

/**
 * Router-level error UI. Every route falls back to this via the router's
 * `defaultErrorComponent`, so a throw from a loader — or from the API gate, which
 * throws on every failure by design — lands somewhere deliberate.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const { title, message } = describe(error);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <PageError title={title} message={message} className="min-h-0" />

      <Button
        variant="outline"
        onClick={reset}
        startContent={<Icon name="rotate-ccw" className="size-4" />}
      >
        Coba lagi
      </Button>
    </div>
  );
}
