import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import InputNumber from "@/components/form/input-number";
import InputSelect from "@/components/form/input-select";
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
import { ApiError } from "@/lib/api/errors";
import {
  type BucketDetail,
  type BucketQuotas,
  storageKeys,
  updateBucketQuotas,
} from "@/lib/api/storage";

interface Values {
  hasSize: boolean;
  size: string;
  unit: string;
  hasObjects: boolean;
  objects: string;
}

const UNIT_OPTIONS = [
  { label: "MB", value: "MB" },
  { label: "GB", value: "GB" },
  { label: "TB", value: "TB" },
];

const UNIT_MULTIPLIERS: Record<string, number> = {
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
};

function defaultQuotaValues(quotas?: BucketQuotas | null): Values {
  let hasSize = false;
  let size = "";
  let unit = "GB";

  if (quotas?.maxSize && quotas.maxSize > 0) {
    hasSize = true;
    const bytes = quotas.maxSize;
    const tb = 1024 * 1024 * 1024 * 1024;
    const gb = 1024 * 1024 * 1024;
    const mb = 1024 * 1024;
    if (bytes >= tb && bytes % tb === 0) {
      size = String(bytes / tb);
      unit = "TB";
    } else if (bytes >= gb && bytes % gb === 0) {
      size = String(bytes / gb);
      unit = "GB";
    } else {
      size = String(Math.round((bytes / mb) * 100) / 100);
      unit = "MB";
    }
  }

  let hasObjects = false;
  let objects = "";
  if (quotas?.maxObjects && quotas.maxObjects > 0) {
    hasObjects = true;
    objects = String(quotas.maxObjects);
  }

  return {
    hasSize,
    size,
    unit,
    hasObjects,
    objects,
  };
}

interface SetQuotaDialogProps {
  bucket: BucketDetail;
  trigger?: React.ReactNode;
}

export function SetQuotaDialog({ bucket, trigger }: SetQuotaDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: defaultQuotaValues(bucket.quotas),
  });

  const hasSize = useWatch({ control, name: "hasSize" });
  const hasObjects = useWatch({ control, name: "hasObjects" });

  const mutation = useMutation({
    mutationFn: (values: Values) => {
      const mult = UNIT_MULTIPLIERS[values.unit] || UNIT_MULTIPLIERS.GB;
      const maxSize = values.hasSize && values.size ? Math.round(Number(values.size) * mult) : null;
      const maxObjects =
        values.hasObjects && values.objects ? Math.round(Number(values.objects)) : null;

      return updateBucketQuotas(bucket.id, { maxSize, maxObjects });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(storageKeys.bucket(bucket.id), updated);
      queryClient.invalidateQueries({ queryKey: storageKeys.buckets });
      toast.success("Bucket quotas updated");
      setOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors) {
        if (error.fieldErrors.maxSize?.[0]) {
          setError("size", { type: "server", message: error.fieldErrors.maxSize[0] });
          return;
        }
        if (error.fieldErrors.maxObjects?.[0]) {
          setError("objects", { type: "server", message: error.fieldErrors.maxObjects[0] });
          return;
        }
      }
      toast.error(
        error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
      );
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          reset(defaultQuotaValues(bucket.quotas));
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            startContent={<Icon name="scale" className="size-4" />}
          >
            Quotas
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Bucket quotas</DialogTitle>
            <DialogDescription>
              Set limits on storage space and object count for {bucket.name}. Leave limits disabled
              for unlimited capacity.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            {/* Storage Quota */}
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <InputSwitch.WithRHF
                control={control}
                name="hasSize"
                label="Limit storage size"
                description="Reject uploads when total size exceeds this threshold."
              />

              {hasSize && (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="col-span-2">
                    <InputNumber.WithRHF
                      control={control}
                      name="size"
                      placeholder="10"
                      min={1}
                      step="any"
                      required={hasSize}
                      autoFocus
                    />
                  </div>
                  <div>
                    <InputSelect.WithRHF control={control} name="unit" options={UNIT_OPTIONS} />
                  </div>
                </div>
              )}
            </div>

            {/* Object Count Quota */}
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <InputSwitch.WithRHF
                control={control}
                name="hasObjects"
                label="Limit object count"
                description="Reject uploads when total object count reaches this limit."
              />

              {hasObjects && (
                <div className="pt-1">
                  <InputNumber.WithRHF
                    control={control}
                    name="objects"
                    placeholder="10000"
                    min={1}
                    step={1}
                    required={hasObjects}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={formState.isSubmitting} loadingText="Saving">
              Save quotas
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
