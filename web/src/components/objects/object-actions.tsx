import { useState } from "react";
import { toast } from "sonner";

import { CopyObjectDialog } from "./copy-object-dialog";
import { CreateShareLinkDialog } from "./create-share-link-dialog";
import { EditMetadataDialog } from "./edit-metadata-dialog";
import { MoveObjectDialog } from "./move-object-dialog";
import { ObjectPreviewDialog } from "./object-preview-dialog";
import { RenameObjectDialog } from "./rename-object-dialog";

import { ConfirmDialog } from "@/components/confirm-dialog";
import ButtonMenu, { type ButtonMenuItem } from "@/components/ui/button-menu";
import Icon from "@/components/ui/icon";
import { useInvalidateBucketContents } from "@/hooks/use-invalidate-bucket-contents";
import { ApiError } from "@/lib/api/errors";
import { deleteFolder, deleteObject, downloadObject, previewKind } from "@/lib/api/objects";
import { publicUrl } from "@/lib/object-path";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

interface FileActionsProps {
  bucketId: string;
  objectKey: string;
  name: string;
  publicBaseUrl: string;
  contentType?: string;
}

export function FileActions(props: FileActionsProps) {
  const { bucketId, objectKey, name, publicBaseUrl, contentType } = props;

  const [confirming, setConfirming] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const preview = previewKind(objectKey, contentType);
  const invalidate = useInvalidateBucketContents(bucketId);

  const items: ButtonMenuItem[] = [];
  if (preview) {
    items.push({
      label: "Preview",
      icon: <Icon name="eye" className="size-4" />,
      onClick: () => setPreviewing(true),
    });
  }

  items.push(
    {
      label: "Download",
      icon: <Icon name="download" className="size-4" />,
      onClick: () =>
        downloadObject(bucketId, objectKey).catch((e) =>
          toast.error(errorMessage(e, "Couldn't start the download")),
        ),
    },
    {
      label: "Create share link",
      icon: <Icon name="link" className="size-4" />,
      onClick: () => setSharing(true),
    },
  );

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

  items.push(
    {
      label: "Rename",
      icon: <Icon name="pencil" className="size-4" />,
      onClick: () => setRenaming(true),
    },
    {
      label: "Move",
      icon: <Icon name="folder-input" className="size-4" />,
      onClick: () => setMoving(true),
    },
    {
      label: "Duplicate",
      icon: <Icon name="copy" className="size-4" />,
      onClick: () => setCopying(true),
    },
    {
      label: "Edit metadata",
      icon: <Icon name="tag" className="size-4" />,
      onClick: () => setEditingMetadata(true),
    },
    {
      label: "Delete",
      icon: <Icon name="trash-2" className="size-4" />,
      className: "text-destructive",
      onClick: () => setConfirming(true),
    },
  );

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

      {preview && previewing && (
        <ObjectPreviewDialog
          bucketId={bucketId}
          objectKey={objectKey}
          name={name}
          kind={preview}
          open={previewing}
          onOpenChange={setPreviewing}
        />
      )}

      <CreateShareLinkDialog
        bucketId={bucketId}
        objectKey={objectKey}
        name={name}
        open={sharing}
        onOpenChange={setSharing}
      />

      <RenameObjectDialog
        bucketId={bucketId}
        objectKey={objectKey}
        currentName={name}
        open={renaming}
        onOpenChange={setRenaming}
      />

      <MoveObjectDialog
        bucketId={bucketId}
        objectKey={objectKey}
        currentName={name}
        open={moving}
        onOpenChange={setMoving}
      />

      <CopyObjectDialog
        bucketId={bucketId}
        objectKey={objectKey}
        currentName={name}
        open={copying}
        onOpenChange={setCopying}
      />

      <EditMetadataDialog
        bucketId={bucketId}
        objectKey={objectKey}
        name={name}
        open={editingMetadata}
        onOpenChange={setEditingMetadata}
      />

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
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [copying, setCopying] = useState(false);
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
            label: "Rename",
            icon: <Icon name="pencil" className="size-4" />,
            onClick: () => setRenaming(true),
          },
          {
            label: "Move",
            icon: <Icon name="folder-input" className="size-4" />,
            onClick: () => setMoving(true),
          },
          {
            label: "Duplicate",
            icon: <Icon name="copy" className="size-4" />,
            onClick: () => setCopying(true),
          },
          {
            label: "Delete folder",
            icon: <Icon name="trash-2" className="size-4" />,
            className: "text-destructive",
            onClick: () => setConfirming(true),
          },
        ]}
      />

      <RenameObjectDialog
        bucketId={bucketId}
        prefix={prefix}
        currentName={name}
        open={renaming}
        onOpenChange={setRenaming}
      />

      <MoveObjectDialog
        bucketId={bucketId}
        prefix={prefix}
        currentName={name}
        open={moving}
        onOpenChange={setMoving}
      />

      <CopyObjectDialog
        bucketId={bucketId}
        prefix={prefix}
        currentName={name}
        open={copying}
        onOpenChange={setCopying}
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
