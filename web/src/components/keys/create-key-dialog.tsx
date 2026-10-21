import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { CopyButton } from "@/components/copy-button";
import InputText from "@/components/form/input-text";
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
import { type CreatedKey, createKey, storageKeys } from "@/lib/api/storage";
import { applyApiError } from "@/lib/form-errors";

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
  const queryClient = useQueryClient();

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: { name: "" },
  });

  const mutation = useMutation({
    mutationFn: createKey,
    onSuccess: (key) => {
      setCreated(key);
      queryClient.invalidateQueries({ queryKey: storageKeys.keys });
      queryClient.invalidateQueries({ queryKey: storageKeys.overview });
    },
    onError: (error) => applyApiError(error, setError, FIELDS),
  });

  const onSubmit = handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined));

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset();
      setCreated(null);
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
            </dl>

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
