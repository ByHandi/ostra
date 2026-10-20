import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import { ApiError } from "@/lib/api/errors";

/**
 * Routes a failed submit to the right place: per-field messages onto the fields
 * that caused them, anything else to a toast. Falls back to a toast when the API
 * reports field errors for fields this form does not have.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[],
): void {
  if (error instanceof ApiError && error.fieldErrors) {
    let applied = false;

    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      const message = messages?.[0];
      if (!message) continue;
      if (!knownFields.includes(field as Path<T>)) continue;

      setError(field as Path<T>, { type: "server", message });
      applied = true;
    }

    if (applied) return;
  }

  toast.error(
    error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
  );
}
