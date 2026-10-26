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
import { copyObject } from "@/lib/api/objects";
import { applyApiError } from "@/lib/form-errors";

interface Values {
  dest: string;
}

const FIELDS = ["dest"] as const;

interface CopyObjectDialogProps {
  bucketId: string;
  objectKey?: string;
  prefix?: string;
  currentName: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

function defaultCopyName(name: string, isFolder: boolean): string {
  if (isFolder) {
    return `${name}-copy`;
  }
  const lastDot = name.lastIndexOf(".");
  if (lastDot > 0) {
    return `${name.slice(0, lastDot)}-copy${name.slice(lastDot)}`;
  }
  return `${name}-copy`;
}

export function CopyObjectDialog(props: CopyObjectDialogProps) {
  const { bucketId, objectKey, prefix, currentName, open, onOpenChange } = props;
  const isFolder = Boolean(prefix);
  const invalidate = useInvalidateBucketContents(bucketId);
  const initialName = defaultCopyName(currentName, isFolder);

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: { dest: initialName },
  });

  useEffect(() => {
    if (open) {
      reset({ dest: defaultCopyName(currentName, isFolder) });
    }
  }, [open, currentName, isFolder, reset]);

  const mutation = useMutation({
    mutationFn: async (values: Values) => {
      const cleanName = values.dest.trim();
      if (cleanName === currentName) {
        throw new Error("Copy name must be different from source name");
      }
      if (isFolder && prefix) {
        const withoutTrailing = prefix.slice(0, -1);
        const lastSlash = withoutTrailing.lastIndexOf("/");
        const parentPrefix = lastSlash >= 0 ? withoutTrailing.slice(0, lastSlash + 1) : "";
        const destPrefix = `${parentPrefix}${cleanName}/`;
        return copyObject(bucketId, prefix, destPrefix);
      }
      if (objectKey) {
        const lastSlash = objectKey.lastIndexOf("/");
        const parentPrefix = lastSlash >= 0 ? objectKey.slice(0, lastSlash + 1) : "";
        const destKey = `${parentPrefix}${cleanName}`;
        return copyObject(bucketId, objectKey, destKey);
      }
    },
    onSuccess: async (_data, variables) => {
      await invalidate();
      toast.success(`Copied to ${variables.dest.trim()}`);
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
            <DialogTitle>Duplicate {isFolder ? "folder" : "file"}</DialogTitle>
            <DialogDescription>
              Create a copy of <span className="font-medium text-foreground">{currentName}</span> in
              the current folder.
            </DialogDescription>
          </DialogHeader>

          <InputText.WithRHF
            control={control}
            name="dest"
            label="Copy name"
            startContent={<Icon name="copy" />}
            autoComplete="off"
            autoFocus
            required
            description={
              isFolder
                ? "All files in this folder will be copied to the new folder."
                : "A duplicate file will be created."
            }
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={formState.isSubmitting} loadingText="Copying">
              Duplicate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
