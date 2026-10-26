import { useMutation } from "@tanstack/react-query";

import { useEffect } from "react";
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
} from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { useInvalidateBucketContents } from "@/hooks/use-invalidate-bucket-contents";
import { moveObject } from "@/lib/api/objects";
import { applyApiError } from "@/lib/form-errors";

interface Values {
  dest: string;
}

const FIELDS = ["dest"] as const;

interface RenameObjectDialogProps {
  bucketId: string;
  objectKey?: string;
  prefix?: string;
  currentName: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function RenameObjectDialog(props: RenameObjectDialogProps) {
  const { bucketId, objectKey, prefix, currentName, open, onOpenChange } = props;

  const isFolder = Boolean(prefix);
  const invalidate = useInvalidateBucketContents(bucketId);

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: { dest: currentName },
  });

  useEffect(() => {
    if (open) {
      reset({ dest: currentName });
    }
  }, [open, currentName, reset]);

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const cleanName = values.dest.trim();
      if (cleanName === currentName) {
        throw new Error("New name must be different from current name");
      }
      if (isFolder && prefix) {
        const withoutTrailing = prefix.slice(0, -1);
        const lastSlash = withoutTrailing.lastIndexOf("/");
        const parentPrefix = lastSlash >= 0 ? withoutTrailing.slice(0, lastSlash + 1) : "";
        const destPrefix = `${parentPrefix}${cleanName}/`;
        return moveObject(bucketId, prefix, destPrefix);
      }
      if (objectKey) {
        const lastSlash = objectKey.lastIndexOf("/");
        const parentPrefix = lastSlash >= 0 ? objectKey.slice(0, lastSlash + 1) : "";
        const destKey = `${parentPrefix}${cleanName}`;
        return moveObject(bucketId, objectKey, destKey);
      }
    },
    onSuccess: async (_data, variables) => {
      await invalidate();
      toast.success(`Renamed to ${variables.dest.trim()}`);
      onOpenChange(false);
      reset();
    },
    onError: (error) => applyApiError(error, setError, FIELDS),
  });

  const onSubmit = handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Rename {isFolder ? "folder" : "file"}</DialogTitle>
            <DialogDescription>
              Enter a new name for{" "}
              <span className="font-medium text-foreground">{currentName}</span>.
            </DialogDescription>
          </DialogHeader>

          <InputText.WithRHF
            control={control}
            name="dest"
            label="Name"
            startContent={<Icon name={isFolder ? "folder" : "file-text"} />}
            autoComplete="off"
            autoFocus
            required
            description={
              isFolder
                ? "The folder and all its contents will be moved to the new name."
                : "The file will be renamed in the current folder."
            }
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={formState.isSubmitting} loadingText="Renaming">
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
