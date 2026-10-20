import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { PageError } from "@/components/ui/page-error";
import { ApiError } from "@/lib/api/errors";

interface QueryErrorProps {
  error: Error;
  onRetry(): void;
  /** Where "back" goes when the thing was not found (deleted, bad link). */
  backTo?: "/buckets" | "/domains" | "/keys";
}

/** In-page error for a failed query: keeps the page header and offers a retry. */
export function QueryError({ error, onRetry, backTo }: QueryErrorProps) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <PageError title="Not found" message={error.message} className="min-h-0" />
        {backTo && (
          <Button variant="outline" asChild>
            <Link to={backTo}>Back to list</Link>
          </Button>
        )}
      </div>
    );
  }

  const message =
    error instanceof ApiError
      ? error.isNetworkError
        ? "Can't reach the server. Check your connection and try again."
        : error.message
      : "An unexpected error occurred.";

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <PageError title="Couldn't load data" message={message} className="min-h-0" />
      <Button
        variant="outline"
        onClick={onRetry}
        startContent={<Icon name="rotate-ccw" className="size-4" />}
      >
        Try again
      </Button>
    </div>
  );
}
