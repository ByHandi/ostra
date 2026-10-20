import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import ButtonMenu, { type ButtonMenuItem } from "@/components/ui/button-menu";
import Icon from "@/components/ui/icon";
import { useInvalidateBucketContents } from "@/hooks/use-invalidate-bucket-contents";
import { ApiError } from "@/lib/api/errors";
import { deleteFolder, deleteObject, downloadObject } from "@/lib/api/objects";
import { publicUrl } from "@/lib/object-path";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

interface FileActionsProps {
  bucketId: string;
  objectKey: string;
  name: string;
  publicBaseUrl: string;
}

export function FileActions({ bucketId, objectKey, name, publicBaseUrl }: FileActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const invalidate = useInvalidateBucketContents(bucketId);

  const items: ButtonMenuItem[] = [
    {
      label: "Download",
      icon: <Icon name="download" className="size-4" />,
      onClick: () =>
        downloadObject(bucketId, objectKey).catch((e) =>
          toast.error(errorMessage(e, "Couldn't start the download")),
        ),
    },
  ];
  if (publicBaseUrl) {
    items.push({
      label: "Copy public URL",
      icon: <Icon name="link" className="size-4" />,
      onClick: () => {
        const url = publicUrl(publicBaseUrl, objectKey);
        navigator.clipboard
          .writeText(url)
          .then(() => toast.success("Public URL copied"))
          // Clipboard access can be refused (permissions, non-secure origins): show the URL instead.
          .catch(() => toast.error("Couldn't copy to clipboard", { description: url }));
      },
    });
  }
  items.push({
    label: "Delete",
    icon: <Icon name="trash-2" className="size-4" />,
    className: "text-destructive",
    onClick: () => setConfirming(true),
  });

  const remove = async () => {
    try {
      await deleteObject(bucketId, objectKey);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't delete the file"));
      throw error;
    }
    await invalidate();
    toast.success(`${name} deleted`);
  };

  return (
    <>
      <ButtonMenu items={items} align="end" variant="ghost" classNames={{ content: "w-40" }} />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${name}?`}
        description="The file is deleted permanently. This action can't be undone."
        confirmText="Delete file"
        onConfirm={remove}
      />
    </>
  );
}

interface FolderActionsProps {
  bucketId: string;
  prefix: string;
  name: string;
}

export function FolderActions({ bucketId, prefix, name }: FolderActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const invalidate = useInvalidateBucketContents(bucketId);

  const remove = async () => {
    const res = await deleteFolder(bucketId, prefix).catch((error: unknown) => {
      toast.error(errorMessage(error, "Couldn't delete the folder"));
      throw error;
    });
    const deleted = res.data?.deleted ?? 0;
    await invalidate();
    toast.success(`${name} deleted (${deleted} ${deleted === 1 ? "file" : "files"})`);
  };

  return (
    <>
      <ButtonMenu
        align="end"
        variant="ghost"
        classNames={{ content: "w-40" }}
        items={[
          {
            label: "Delete folder",
            icon: <Icon name="trash-2" className="size-4" />,
            className: "text-destructive",
            onClick: () => setConfirming(true),
          },
        ]}
      />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete the folder ${name}?`}
        description="Every file in this folder, including sub-folders, is deleted permanently. This action can't be undone."
        confirmText="Delete folder"
        onConfirm={remove}
      />
    </>
  );
}
