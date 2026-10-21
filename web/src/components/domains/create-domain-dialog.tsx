import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import InputSelect from "@/components/form/input-select";
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
import { bucketsQuery, createDomain, storageKeys } from "@/lib/api/storage";
import { applyApiError } from "@/lib/form-errors";

interface Values {
  domain: string;
  bucket: string;
}

const FIELDS = ["domain", "bucket"] as const;

interface CreateDomainDialogProps {
  /** Preselects (and locks) the bucket, e.g. when opened from a bucket's page. */
  bucket?: string;
}

export function CreateDomainDialog({ bucket }: CreateDomainDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const buckets = useQuery({ ...bucketsQuery(), enabled: open && !bucket });

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: { domain: "", bucket: bucket ?? "" },
  });

  const mutation = useMutation({
    mutationFn: createDomain,
    onSuccess: async (domain) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: storageKeys.domains }),
        queryClient.invalidateQueries({ queryKey: storageKeys.buckets }),
        queryClient.invalidateQueries({ queryKey: storageKeys.overview }),
      ]);
      toast.success(
        domain.status === "active"
          ? `${domain.domain} is active`
          : `${domain.domain} added. Set up its DNS records.`,
      );
      setOpen(false);
      reset();
      navigate({ to: "/domains/$domainId", params: { domainId: domain.id } });
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
          Add domain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Add custom domain</DialogTitle>
            <DialogDescription>
              The bucket's contents will be publicly readable through this domain once its DNS is
              verified.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <InputText.WithRHF
              control={control}
              name="domain"
              label="Domain"
              placeholder="cdn.example.com"
              startContent={<Icon name="globe" />}
              autoComplete="off"
              autoFocus
              required
            />
            {!bucket && (
              <InputSelect.WithRHF
                control={control}
                name="bucket"
                label="Bucket"
                placeholder={buckets.isPending ? "Loading buckets…" : "Select a bucket"}
                startContent={<Icon name="archive" />}
                disabled={buckets.isPending}
                required
                options={(buckets.data ?? []).map((b) => ({ label: b.name, value: b.name }))}
              />
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={formState.isSubmitting} loadingText="Adding">
              Add domain
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
