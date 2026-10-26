import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { CopyButton } from "@/components/copy-button";
import DatePicker from "@/components/form/date-picker";
import InputSelect from "@/components/form/input-select";
import InputText from "@/components/form/input-text";
import { ConnectionSnippetsDialog } from "@/components/keys/connection-snippets-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { ApiError } from "@/lib/api/errors";
import { type CreatedKey, createKey, storageKeys } from "@/lib/api/storage";
import { applyApiError } from "@/lib/form-errors";
import { formatDate } from "@/lib/format";
import {
  PRESET_EXPIRATION_OPTIONS,
  type PresetExpiration,
  calculateExpiresAt,
} from "@/lib/key-expiration";

interface Values {
  name: string;
}

const FIELDS = ["name"] as const;

/**
 * Two steps in one dialog: the name form, then the one-time secret. The secret
 * lives only in this component's state and is dropped when the dialog closes.
 */
export function CreateKeyDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [preset, setPreset] = useState<PresetExpiration>("never");
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [customError, setCustomError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: { name: "" },
  });

  const mutation = useMutation({
    mutationFn: (input: { name: string; expiresAt?: string | null }) => createKey(input),
    onSuccess: (key) => {
      setCreated(key);
      queryClient.invalidateQueries({ queryKey: storageKeys.keys });
      queryClient.invalidateQueries({ queryKey: storageKeys.overview });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors?.expiresAt) {
        setCustomError(error.fieldErrors.expiresAt[0]);
      }
      applyApiError(error, setError, FIELDS);
    },
  });

  const onSubmit = handleSubmit((values) => {
    setCustomError(null);
    const { expiresAt, error } = calculateExpiresAt(preset, customDate);
    if (error) {
      setCustomError(error);
      return;
    }

    return mutation.mutateAsync({ name: values.name, expiresAt }).catch(() => undefined);
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset();
      setCreated(null);
      setPreset("never");
      setCustomDate(undefined);
      setCustomError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" startContent={<Icon name="plus" className="size-4" />}>
          New access key
        </Button>
      </DialogTrigger>
      <DialogContent
        // A stray click outside must not throw away a secret that cannot be shown again.
        onInteractOutside={(e) => created && e.preventDefault()}
      >
        {created ? (
          <div className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Save the secret key now</DialogTitle>
              <DialogDescription>
                This secret is shown only once. If you lose it, create a new access key.
              </DialogDescription>
            </DialogHeader>

            <dl className="flex flex-col gap-3">
              <SecretRow label="Access key ID" value={created.id} />
              <SecretRow label="Secret access key" value={created.secretAccessKey} />
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Expires</dt>
                <dd className="rounded-md bg-muted/60 px-3 py-1.5 text-xs font-medium">
                  {created.expiresAt ? formatDate(created.expiresAt) : "Never expires"}
                </dd>
              </div>
            </dl>

            <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
              <div className="space-y-0.5">
                <p className="text-xs font-medium">Ready-to-use snippets</p>
                <p className="text-xs text-muted-foreground">
                  View snippets pre-filled with this key and secret.
                </p>
              </div>
              <ConnectionSnippetsDialog
                keyId={created.id}
                keyName={created.name}
                secretAccessKey={created.secretAccessKey}
                trigger={
                  <Button
                    variant="outline"
                    size="xs"
                    startContent={<Icon name="code" className="size-3.5" />}
                  >
                    View snippets
                  </Button>
                }
              />
            </div>

            <p className="text-sm text-muted-foreground">
              A new key has no access to any bucket yet. Set its permissions on the key's detail
              page.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button asChild>
                <Link
                  to="/keys/$keyId"
                  params={{ keyId: created.id }}
                  onClick={() => onOpenChange(false)}
                >
                  Set bucket permissions
                </Link>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>New access key</DialogTitle>
              <DialogDescription>
                Used by apps or tools (aws-cli, rclone, SDKs) to access the S3 API.
              </DialogDescription>
            </DialogHeader>

            <InputText.WithRHF
              control={control}
              name="name"
              label="Name"
              placeholder="backend-production"
              startContent={<Icon name="key-round" />}
              autoComplete="off"
              autoFocus
              required
              description="Helps you recognize this key later, e.g. the app's name."
            />

            <InputSelect
              label="Expiration"
              value={preset}
              onValueChange={(val) => {
                setPreset(val as PresetExpiration);
                setCustomError(null);
              }}
              options={PRESET_EXPIRATION_OPTIONS}
              startContent={<Icon name="calendar" className="size-4 text-muted-foreground" />}
              description="Choose how long this key remains active. Expired keys stop working automatically."
            />

            {preset === "custom" && (
              <DatePicker
                label="Custom expiration date"
                value={customDate}
                onValueChange={(d) => {
                  setCustomDate(d);
                  setCustomError(null);
                }}
                required
                errorMessage={customError || undefined}
                description="The key will expire after this date."
              />
            )}

            {preset !== "custom" && customError && (
              <p className="text-xs text-destructive">{customError}</p>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" isLoading={formState.isSubmitting} loadingText="Creating">
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 rounded-md bg-muted/60 py-1 pr-1 pl-3">
        <code className="min-w-0 flex-1 font-mono text-xs break-all">{value}</code>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </dd>
    </div>
  );
}
