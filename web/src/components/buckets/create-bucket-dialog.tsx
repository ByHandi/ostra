import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { createBucket, storageKeys } from "@/lib/api/storage";
import { applyApiError } from "@/lib/form-errors";

interface Values {
  name: string;
}

const FIELDS = ["name"] as const;
const NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export function CreateBucketDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: { name: "" },
  });

  const mutation = useMutation({
    mutationFn: createBucket,
    onSuccess: async (bucket) => {
      await queryClient.invalidateQueries({ queryKey: storageKeys.buckets });
      queryClient.invalidateQueries({ queryKey: storageKeys.overview });
      toast.success(`Bucket ${bucket.name} created`);
      setOpen(false);
      reset();
      navigate({ to: "/buckets/$bucketId", params: { bucketId: bucket.id } });
    },
    onError: (error) => applyApiError(error, setError, FIELDS),
  });

  const onSubmit = handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" startContent={<Icon name="plus" className="size-4" />}>
          New bucket
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>New bucket</DialogTitle>
            <DialogDescription>
              The bucket name is used in the S3 API and can't be changed after creation.
            </DialogDescription>
          </DialogHeader>

          <InputText.WithRHF
            control={control}
            name="name"
            label="Name"
            placeholder="assets"
            startContent={<Icon name="archive" />}
            autoComplete="off"
            autoFocus
            required
            description="3–63 characters: lowercase letters, numbers, dots, or hyphens."
            rules={{
              pattern: { value: NAME_PATTERN, message: "Invalid bucket name format" },
            }}
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={formState.isSubmitting} loadingText="Creating">
              Create bucket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
