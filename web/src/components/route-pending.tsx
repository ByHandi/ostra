import { Spinner } from "@/components/ui/spinner";

/**
 * Shown while a route's loader is in flight. The router only mounts this after
 * `defaultPendingMs`, so quick loads never flash a spinner.
 */
export function RoutePending() {
  return (
    <div
      className="flex min-h-[50vh] items-center justify-center"
      role="status"
      aria-label="Memuat"
    >
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
