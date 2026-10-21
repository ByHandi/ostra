import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import { BucketTabs } from "@/components/buckets/bucket-tabs";
import { EmptyState } from "@/components/empty-state";
import Breadcrumbs from "@/components/objects/breadcrumbs";
import ObjectTable from "@/components/objects/object-table";
import { DropZone, UploadButton, UploadQueue } from "@/components/objects/upload";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { useInvalidateBucketContents } from "@/hooks/use-invalidate-bucket-contents";
import { useUploads } from "@/hooks/use-uploads";
import { type ObjectPage, folderQuery } from "@/lib/api/objects";
import { bucketQuery } from "@/lib/api/storage";

export const Route = createFileRoute("/(app)/buckets/$bucketId/files")({
  /** ?prefix= is the open folder; anything that is not a folder path means the bucket root. */
  validateSearch: (search: Record<string, unknown>): { prefix?: string } => {
    const prefix = search.prefix;
    return typeof prefix === "string" && prefix.endsWith("/") && !prefix.startsWith("/")
      ? { prefix }
      : {};
  },
  component: FilesPage,
});

function FilesPage() {
  const { bucketId } = Route.useParams();
  const { prefix = "" } = Route.useSearch();
  const navigate = useNavigate();

  const bucket = useQuery(bucketQuery(bucketId));
  const folder = useInfiniteQuery(folderQuery(bucketId, prefix));
  const invalidate = useInvalidateBucketContents(bucketId);
  const { uploads, start, cancel, clearFinished } = useUploads(bucketId, invalidate);

  const upload = (files: FileList) => start(files, prefix);

  return (
    <>
      <AppHeader
        showBackButton
        onBack={() => navigate({ to: "/buckets" })}
        title={bucket.data?.name ?? "Bucket"}
        description="Browse, upload, download, and delete the files in this bucket."
        bottomContent={<BucketTabs bucketId={bucketId} />}
      />

      {/* Desktop: the file table takes the remaining height and scrolls inside. */}
      <div className="flex flex-col gap-4 p-4 md:p-6">
        {/*
          Phones: pinned under the collapsed header (--app-header-pinned, set by the
          header) while the window scrolls, bleeding to the screen edges so rows
          slide under a full-width bar. Desktop needs none of that — only the
          table body scrolls there.
        */}
        <div className="sticky top-(--app-header-pinned,0px) z-10 -mx-4 -my-2 flex flex-wrap items-center justify-between gap-2 bg-background/80 px-4 py-2 backdrop-blur-lg md:static md:m-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          {bucket.data ? (
            <Breadcrumbs bucketId={bucketId} bucketName={bucket.data.name} prefix={prefix} />
          ) : (
            <Breadcrumbs.Skeleton />
          )}
          <UploadButton onFiles={upload} />
        </div>

        <UploadQueue uploads={uploads} onCancel={cancel} onClear={clearFinished} />

        <DropZone onFiles={upload} className="md:flex md:min-h-0 md:flex-col">
          <FolderContents
            bucketId={bucketId}
            prefix={prefix}
            folder={folder}
            publicBaseUrl={bucket.data?.publicBaseUrl ?? ""}
          />
        </DropZone>

        {folder.hasNextPage && (
          <Button
            variant="outline"
            className="self-center"
            isLoading={folder.isFetchingNextPage}
            loadingText="Loading"
            onClick={() => folder.fetchNextPage()}
          >
            Load more
          </Button>
        )}
      </div>
    </>
  );
}

interface FolderContentsProps {
  bucketId: string;
  prefix: string;
  folder: UseInfiniteQueryResult<InfiniteData<ObjectPage>>;
  publicBaseUrl: string;
}

function FolderContents({ bucketId, prefix, folder, publicBaseUrl }: FolderContentsProps) {
  if (folder.isPending) return <ObjectTable.Skeleton />;
  if (folder.isError) {
    return <QueryError error={folder.error} onRetry={() => folder.refetch()} backTo="/buckets" />;
  }

  const folders = folder.data.pages.flatMap((p) => p.folders);
  const objects = folder.data.pages.flatMap((p) => p.objects);
  if (folders.length === 0 && objects.length === 0) {
    return (
      <EmptyState
        icon="folder-open"
        title={prefix ? "This folder is empty" : "This bucket is empty"}
        description="Drop files here or use Upload. Folders are created from the file paths you upload into."
      />
    );
  }
  return (
    <ObjectTable
      bucketId={bucketId}
      folders={folders}
      objects={objects}
      publicBaseUrl={publicBaseUrl}
    />
  );
}
