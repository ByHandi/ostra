import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import InputSwitch from "@/components/form/input-switch";
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
import { type BucketDetail, storageKeys, updateBucketWebsite } from "@/lib/api/storage";
import { applyApiError } from "@/lib/form-errors";

interface Values {
  enabled: boolean;
  indexDocument: string;
  errorDocument: string;
}

const FIELDS = ["indexDocument", "errorDocument"] as const;

interface ConfigureWebsiteDialogProps {
  bucket: BucketDetail;
  trigger?: React.ReactNode;
}

export function ConfigureWebsiteDialog({ bucket, trigger }: ConfigureWebsiteDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: {
      enabled: bucket.websiteAccess,
      indexDocument: bucket.websiteConfig?.indexDocument || "index.html",
      errorDocument: bucket.websiteConfig?.errorDocument || "",
    },
  });

  const enabled = useWatch({ control, name: "enabled" });

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      updateBucketWebsite(bucket.id, {
        enabled: values.enabled,
        indexDocument: values.enabled ? values.indexDocument.trim() || "index.html" : undefined,
        errorDocument: values.enabled ? values.errorDocument.trim() || null : null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(storageKeys.bucket(bucket.id), updated);
      queryClient.invalidateQueries({ queryKey: storageKeys.buckets });
      toast.success(
        enabled ? "Static website hosting configured" : "Static website hosting disabled",
      );
      setOpen(false);
    },
    onError: (error) => applyApiError(error, setError, FIELDS),
  });

  const onSubmit = handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined));

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      reset({
        enabled: bucket.websiteAccess,
        indexDocument: bucket.websiteConfig?.indexDocument || "index.html",
        errorDocument: bucket.websiteConfig?.errorDocument || "",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            startContent={<Icon name="globe" className="size-4" />}
          >
            Configure website
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="globe" className="size-5 text-primary" />
            Static website hosting
          </DialogTitle>
          <DialogDescription>
            Expose this bucket as a static website. Visitors can access files without
            authentication.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 pt-1">
          <InputSwitch.WithRHF
            control={control}
            name="enabled"
            label="Enable website hosting"
            description="Allow anonymous public HTTP requests to access objects in this bucket."
          />

          {enabled && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <InputText.WithRHF
                control={control}
                name="indexDocument"
                label="Index document"
                description="The file served when a request ends in a slash or targets the root."
                placeholder="index.html"
                startContent={<Icon name="file-code" className="size-4 text-muted-foreground" />}
                required
              />

              <InputText.WithRHF
                control={control}
                name="errorDocument"
                label="Error document (optional)"
                description="The file served on 404 errors. Single Page Applications (SPAs) can use index.html."
                placeholder="404.html"
                startContent={
                  <Icon name="file-question" className="size-4 text-muted-foreground" />
                }
              />
            </div>
          )}

          <DialogFooter className="pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={formState.isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={formState.isSubmitting}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
