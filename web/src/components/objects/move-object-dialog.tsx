import { useInfiniteQuery, useMutation } from "@tanstack/react-query";

import { useMemo, useState } from "react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvalidateBucketContents } from "@/hooks/use-invalidate-bucket-contents";
import { folderQuery, moveObject } from "@/lib/api/objects";
import { cn } from "@/lib/utils";

interface MoveObjectDialogProps {
  bucketId: string;
  objectKey?: string;
  prefix?: string;
  currentName: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function MoveObjectDialog(props: MoveObjectDialogProps) {
  const { open, onOpenChange } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">{open && <MoveObjectContent {...props} />}</DialogContent>
    </Dialog>
  );
}

function resolveParent(isFolder: boolean, prefix?: string, objectKey?: string): string {
  if (isFolder && prefix) {
    const withoutTrailing = prefix.slice(0, -1);
    const lastSlash = withoutTrailing.lastIndexOf("/");
    return lastSlash >= 0 ? withoutTrailing.slice(0, lastSlash + 1) : "";
  }
  if (objectKey) {
    const lastSlash = objectKey.lastIndexOf("/");
    return lastSlash >= 0 ? objectKey.slice(0, lastSlash + 1) : "";
  }
  return "";
}

function normalizeManualPath(path: string): string {
  let p = path.trim();
  if (p.startsWith("/")) p = p.slice(1);
  if (p && !p.endsWith("/")) p += "/";
  return p;
}

function MoveObjectContent(props: MoveObjectDialogProps) {
  const { bucketId, objectKey, prefix, currentName, onOpenChange } = props;

  const isFolder = Boolean(prefix);
  const invalidate = useInvalidateBucketContents(bucketId);
  const currentParent = useMemo(
    () => resolveParent(isFolder, prefix, objectKey),
    [isFolder, prefix, objectKey],
  );

  const [browsePrefix, setBrowsePrefix] = useState("");
  const [manual, setManual] = useState(false);
  const [manualPath, setManualPath] = useState(currentParent);

  const targetFolder = manual ? normalizeManualPath(manualPath) : browsePrefix;
  const isCurrentLocation = targetFolder === currentParent;

  const mutation = useMutation({
    mutationFn: async () => {
      if (isFolder && prefix) {
        const destPrefix = `${targetFolder}${currentName}/`;
        if (destPrefix === prefix) {
          throw new Error("Destination folder must be different from current folder");
        }
        return moveObject(bucketId, prefix, destPrefix);
      }
      if (objectKey) {
        const destKey = `${targetFolder}${currentName}`;
        if (destKey === objectKey) {
          throw new Error("Destination folder must be different from current folder");
        }
        return moveObject(bucketId, objectKey, destKey);
      }
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(`Moved ${currentName}`);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Couldn't move object");
    },
  });

  return (
    <>
      <DialogHeader>
        <div className="flex items-center justify-between pr-5">
          <DialogTitle>Move {isFolder ? "folder" : "file"}</DialogTitle>
          <button
            type="button"
            onClick={() => {
              setManual((m) => !m);
              setManualPath(targetFolder);
            }}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            {manual ? "Browse folders" : "Enter path manually"}
          </button>
        </div>
        <DialogDescription>
          Choose a destination for{" "}
          <span className="font-medium text-foreground">{currentName}</span>.
        </DialogDescription>
      </DialogHeader>

      {manual ? (
        <div className="grid gap-2 py-2">
          <label htmlFor="manual-dest-path" className="text-sm font-medium">
            Destination folder path
          </label>
          <Input
            id="manual-dest-path"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            placeholder="e.g. archive/2026/ or leave empty for root"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Enter the folder path ending in / (leave blank for bucket root).
          </p>
        </div>
      ) : (
        <FolderPickerExplorer
          bucketId={bucketId}
          browsePrefix={browsePrefix}
          onSelectPrefix={setBrowsePrefix}
          excludePrefix={isFolder ? prefix : undefined}
          isCurrentLocation={isCurrentLocation}
          targetFolder={targetFolder}
        />
      )}

      <DialogFooter className="gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="button"
          onClick={() => mutation.mutate()}
          isLoading={mutation.isPending}
          loadingText="Moving"
          disabled={isCurrentLocation}
        >
          Move here
        </Button>
      </DialogFooter>
    </>
  );
}

interface FolderPickerExplorerProps {
  bucketId: string;
  browsePrefix: string;
  onSelectPrefix(prefix: string): void;
  excludePrefix?: string;
  isCurrentLocation: boolean;
  targetFolder: string;
}

function FolderPickerExplorer(props: FolderPickerExplorerProps) {
  const { bucketId, browsePrefix, onSelectPrefix, excludePrefix, isCurrentLocation, targetFolder } =
    props;

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery(folderQuery(bucketId, browsePrefix));

  const subfolders = useMemo(() => {
    const list = data?.pages.flatMap((page) => page.folders) ?? [];
    if (!excludePrefix) return list;
    return list.filter((f) => !f.startsWith(excludePrefix));
  }, [data, excludePrefix]);

  const breadcrumbs = useMemo(() => {
    return browsePrefix.split("/").filter(Boolean);
  }, [browsePrefix]);

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newFolderName.trim().replace(/\/+$/, "");
    if (!clean) return;
    onSelectPrefix(`${browsePrefix}${clean}/`);
    setNewFolderName("");
    setCreatingFolder(false);
  };

  return (
    <div className="flex flex-col gap-3 py-1">
      {/* Breadcrumb Navigation & New Folder button */}
      <div className="flex items-center justify-between gap-2 text-sm">
        <nav
          aria-label="Target folder"
          className="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden text-xs"
        >
          <button
            type="button"
            onClick={() => onSelectPrefix("")}
            className={cn(
              "flex items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-muted",
              browsePrefix === "" ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon name="archive" className="size-3.5" />
            Root
          </button>

          {breadcrumbs.map((segment, index) => {
            const target = `${breadcrumbs.slice(0, index + 1).join("/")}/`;
            const isLast = index === breadcrumbs.length - 1;
            return (
              <div key={target} className="flex items-center gap-1">
                <Icon name="chevron-right" className="size-3 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => onSelectPrefix(target)}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-muted",
                    isLast ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  {segment}
                </button>
              </div>
            );
          })}
        </nav>

        {!creatingFolder && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs"
            onClick={() => setCreatingFolder(true)}
            startContent={<Icon name="folder-plus" className="size-3.5" />}
          >
            New folder
          </Button>
        )}
      </div>

      {/* Inline New Folder Input */}
      {creatingFolder && (
        <form
          onSubmit={handleCreateFolder}
          className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2"
        >
          <Icon name="folder" className="size-4 text-muted-foreground" />
          <Input
            size={1}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder name"
            className="h-7 flex-1 text-xs"
            autoFocus
          />
          <Button type="submit" size="sm" className="h-7 text-xs">
            Create
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setCreatingFolder(false);
              setNewFolderName("");
            }}
          >
            Cancel
          </Button>
        </form>
      )}

      {/* Folder List Explorer */}
      <div className="flex h-52 flex-col overflow-y-auto rounded-md border border-border bg-card p-1">
        {isLoading ? (
          <div className="space-y-1 p-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
            Couldn&apos;t load subfolders
          </div>
        ) : subfolders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground">
            <Icon name="folder" className="size-7 opacity-30" />
            <span>No subfolders here</span>
            <span className="text-[11px] text-muted-foreground/70">
              Use &ldquo;Move here&rdquo; to place it in this folder.
            </span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {subfolders.map((folder) => {
              const folderName = folder.slice(browsePrefix.length, -1);
              return (
                <button
                  key={folder}
                  type="button"
                  onClick={() => onSelectPrefix(folder)}
                  className="flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Icon name="folder" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{folderName}</span>
                  </div>
                  <Icon name="chevron-right" className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
            {hasNextPage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Loading..." : "Load more folders"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Selected Destination Indicator */}
      <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">
          Destination:{" "}
          <span className="font-mono font-medium text-foreground">
            {targetFolder ? `/${targetFolder}` : "/ (Root)"}
          </span>
        </span>
        {isCurrentLocation && (
          <span className="flex items-center gap-1 font-medium text-amber-500">
            <Icon name="alert-circle" className="size-3.5" />
            Already in this folder
          </span>
        )}
      </div>
    </div>
  );
}
