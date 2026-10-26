import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useEffect, useState } from "react";

import { AdminAction } from "@/components/admin-action";
import AppHeader from "@/components/app-header";
import { BucketTabs } from "@/components/buckets/bucket-tabs";
import { EmptyState } from "@/components/empty-state";
import Breadcrumbs from "@/components/objects/breadcrumbs";
import ObjectTable from "@/components/objects/object-table";
import { DropZone, UploadButton } from "@/components/objects/upload";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useUploadManager } from "@/hooks/use-upload-manager";
import { type ObjectPage, type SortBy, type SortOrder, folderQuery } from "@/lib/api/objects";
import { useIsAdmin } from "@/lib/api/session";
import { bucketQuery } from "@/lib/api/storage";
import { pageMeta } from "@/lib/page-meta";

interface FilesSearch {
  prefix?: string;
  search?: string;
  sortBy?: SortBy;
  order?: SortOrder;
}

export const Route = createFileRoute("/(app)/buckets/$bucketId/files")({
  /** ?prefix= is the open folder; anything that is not a folder path means the bucket root. */
  validateSearch: (search: Record<string, unknown>): FilesSearch => {
    const out: FilesSearch = {};
    const prefix = search.prefix;
    if (typeof prefix === "string" && prefix.endsWith("/") && !prefix.startsWith("/")) {
      out.prefix = prefix;
    }
    const q = search.search;
    if (typeof q === "string" && q.trim()) {
      out.search = q.trim();
    }
    if (search.sortBy === "name" || search.sortBy === "size" || search.sortBy === "lastModified") {
      out.sortBy = search.sortBy;
    }
    if (search.order === "asc" || search.order === "desc") {
      out.order = search.order;
    }
    return out;
  },
  /**
   * Loads the bucket up front so the tab title can name it. A failure is left to
   * the page's own error state rather than the route's error screen.
   */
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(bucketQuery(params.bucketId)).then(
      (b) => b.name,
      () => undefined,
    ),
  /** "photos/2024 · my-bucket" inside a folder, "Files · my-bucket" at the root. */
  head: ({ loaderData, match }) => {
    const bucket = loaderData ?? "Bucket";
    const folder = match.search.prefix?.slice(0, -1);
    return pageMeta(
      folder ? `${folder} · ${bucket}` : `Files · ${bucket}`,
      "Browse, upload, download, and delete the files in this bucket.",
    );
  },
  component: FilesPage,
});

function FilesPage() {
  const { bucketId } = Route.useParams();
  const { prefix = "", search = "", sortBy = "name", order = "asc" } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [prevSearch, setPrevSearch] = useState(search);
  const [localSearch, setLocalSearch] = useState(search);

  if (prevSearch !== search) {
    setPrevSearch(search);
    setLocalSearch(search);
  }

  useEffect(() => {
    const trimmed = localSearch.trim();
    if (trimmed === search) return;

    const timer = setTimeout(() => {
      navigate({
        search: (prev) => ({
          ...prev,
          search: trimmed || undefined,
        }),
        replace: true,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [localSearch, search, navigate]);

  const handleClearSearch = () => {
    setLocalSearch("");
    navigate({
      search: (prev) => ({
        ...prev,
        search: undefined,
      }),
      replace: true,
    });
  };

  const handleSortChange = (newSortBy: SortBy, newOrder: SortOrder) => {
    navigate({
      search: (prev) => ({
        ...prev,
        sortBy: newSortBy,
        order: newOrder,
      }),
      replace: true,
    });
  };

  const bucket = useQuery(bucketQuery(bucketId));
  const folder = useInfiniteQuery(folderQuery(bucketId, prefix, search, sortBy, order));
  const { start } = useUploadManager();
  const isAdmin = useIsAdmin();

  const upload = (files: FileList) => start(bucketId, files, prefix);

  return (
    <>
      <AppHeader
        backTo="/buckets"
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
        <div className="sticky top-(--app-header-pinned,0px) z-10 -mx-4 -my-2 flex flex-wrap items-center justify-between gap-3 bg-background/80 px-4 py-2 backdrop-blur-lg md:static md:m-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          {bucket.data ? (
            <Breadcrumbs bucketId={bucketId} bucketName={bucket.data.name} prefix={prefix} />
          ) : (
            <Breadcrumbs.Skeleton />
          )}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Icon
                name="search"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search files and folders..."
                className="h-9 w-full rounded-md border border-input bg-background/60 pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <Icon name="x" className="size-4" />
                </button>
              )}
            </div>
            <AdminAction
              fallback={
                <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <Icon name="eye" className="size-3.5 text-muted-foreground" />
                  <span>Read-only</span>
                </div>
              }
              tooltip="Administrator role required to upload files"
            >
              <UploadButton onFiles={upload} />
            </AdminAction>
          </div>
        </div>

        <DropZone onFiles={upload} disabled={!isAdmin} className="md:flex md:min-h-0 md:flex-col">
          <FolderContents
            bucketId={bucketId}
            prefix={prefix}
            search={search}
            sortBy={sortBy}
            order={order}
            folder={folder}
            publicBaseUrl={bucket.data?.publicBaseUrl ?? ""}
            onSortChange={handleSortChange}
            onClearSearch={handleClearSearch}
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
  search: string;
  sortBy: SortBy;
  order: SortOrder;
  folder: UseInfiniteQueryResult<InfiniteData<ObjectPage>>;
  publicBaseUrl: string;
  onSortChange(sortBy: SortBy, order: SortOrder): void;
  onClearSearch(): void;
}

function FolderContents({
  bucketId,
  prefix,
  search,
  sortBy,
  order,
  folder,
  publicBaseUrl,
  onSortChange,
  onClearSearch,
}: FolderContentsProps) {
  const isAdmin = useIsAdmin();
  if (folder.isPending) return <ObjectTable.Skeleton />;
  if (folder.isError) {
    return <QueryError error={folder.error} onRetry={() => folder.refetch()} backTo="/buckets" />;
  }

  const folders = folder.data.pages.flatMap((p) => p.folders);
  const objects = folder.data.pages.flatMap((p) => p.objects);
  if (folders.length === 0 && objects.length === 0) {
    if (search) {
      return (
        <EmptyState
          icon="search"
          title="No matching objects found"
          description={`No files or folders match "${search}" in this location.`}
          action={
            <Button variant="outline" onClick={onClearSearch}>
              Clear search
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon="folder-open"
        title={prefix ? "This folder is empty" : "This bucket is empty"}
        description={
          isAdmin
            ? "Drop files here or use Upload. Folders are created from the file paths you upload into."
            : "There are no files or folders in this location."
        }
      />
    );
  }
  return (
    <ObjectTable
      bucketId={bucketId}
      folders={folders}
      objects={objects}
      publicBaseUrl={publicBaseUrl}
      sortBy={sortBy}
      order={order}
      onSortChange={onSortChange}
    />
  );
}
