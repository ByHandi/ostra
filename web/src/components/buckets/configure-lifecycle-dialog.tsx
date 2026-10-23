import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import InputNumber from "@/components/form/input-number";
import InputSwitch from "@/components/form/input-switch";
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
import { type LifecycleConfiguration, storageKeys, updateBucketLifecycle } from "@/lib/api/storage";
import { applyApiError } from "@/lib/form-errors";

interface Values {
  hasExpiration: boolean;
  expirationDays: string;
  hasAbort: boolean;
  abortIncompleteMultipartUploadDays: string;
}

const FIELDS = ["expirationDays", "abortIncompleteMultipartUploadDays"] as const;

function defaultLifecycleValues(lifecycle?: LifecycleConfiguration | null): Values {
  const hasExpiration = Boolean(lifecycle?.expirationDays && lifecycle.expirationDays > 0);
  const expirationDays = hasExpiration ? String(lifecycle!.expirationDays) : "";

  const hasAbort = Boolean(
    lifecycle?.abortIncompleteMultipartUploadDays &&
    lifecycle.abortIncompleteMultipartUploadDays > 0,
  );
  const abortIncompleteMultipartUploadDays = hasAbort
    ? String(lifecycle!.abortIncompleteMultipartUploadDays)
    : "";

  return {
    hasExpiration,
    expirationDays,
    hasAbort,
    abortIncompleteMultipartUploadDays,
  };
}

interface ConfigureLifecycleDialogProps {
  bucketId: string;
  bucketName: string;
  lifecycle?: LifecycleConfiguration | null;
  trigger?: React.ReactNode;
}

export function ConfigureLifecycleDialog({
  bucketId,
  bucketName,
  lifecycle,
  trigger,
}: ConfigureLifecycleDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: defaultLifecycleValues(lifecycle),
  });

  const hasExpiration = useWatch({ control, name: "hasExpiration" });
  const hasAbort = useWatch({ control, name: "hasAbort" });

  const mutation = useMutation({
    mutationFn: (values: Values) => {
      const expDays =
        values.hasExpiration && values.expirationDays ? parseInt(values.expirationDays, 10) : null;
      const abortDays =
        values.hasAbort && values.abortIncompleteMultipartUploadDays
          ? parseInt(values.abortIncompleteMultipartUploadDays, 10)
          : null;

      return updateBucketLifecycle(bucketId, {
        expirationDays: expDays,
        abortIncompleteMultipartUploadDays: abortDays,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(storageKeys.bucketLifecycle(bucketId), updated);
      queryClient.invalidateQueries({ queryKey: storageKeys.bucketLifecycle(bucketId) });
      toast.success("Lifecycle rules updated");
      setOpen(false);
    },
    onError: (error) => applyApiError(error, setError, FIELDS),
  });

  const onSubmit = handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined));

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      reset(defaultLifecycleValues(lifecycle));
    }
  };

  const isConfigured = Boolean(
    (lifecycle?.expirationDays && lifecycle.expirationDays > 0) ||
    (lifecycle?.abortIncompleteMultipartUploadDays &&
      lifecycle.abortIncompleteMultipartUploadDays > 0),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            startContent={<Icon name="history" className="size-4" />}
          >
            {isConfigured ? "Edit lifecycle" : "Configure lifecycle"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="history" className="size-5 text-primary" />
              Lifecycle rules
            </DialogTitle>
            <DialogDescription>
              Automate object expiration and incomplete multipart cleanup for {bucketName}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            {/* Object Expiration */}
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <InputSwitch.WithRHF
                control={control}
                name="hasExpiration"
                label="Expire old objects"
                description="Automatically delete objects after a specified number of days."
              />

              {hasExpiration && (
                <div className="pt-1">
                  <InputNumber.WithRHF
                    control={control}
                    name="expirationDays"
                    label="Days after object creation"
                    placeholder="30"
                    min={1}
                    step={1}
                    required={hasExpiration}
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Abort Incomplete Multipart Uploads */}
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <InputSwitch.WithRHF
                control={control}
                name="hasAbort"
                label="Abort incomplete multipart uploads"
                description="Clean up incomplete multipart uploads that were not finalized."
              />

              {hasAbort && (
                <div className="pt-1">
                  <InputNumber.WithRHF
                    control={control}
                    name="abortIncompleteMultipartUploadDays"
                    label="Days after initiation"
                    placeholder="7"
                    min={1}
                    step={1}
                    required={hasAbort}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={formState.isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={formState.isSubmitting} loadingText="Saving">
              Save rules
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
