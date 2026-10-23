import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import BucketSummary from "@/components/buckets/bucket-summary";
import { BucketTabs } from "@/components/buckets/bucket-tabs";
import { SetQuotaDialog } from "@/components/buckets/set-quota-dialog";
import { QueryError } from "@/components/query-error";
import Icon from "@/components/ui/icon";
import { bucketQuery } from "@/lib/api/storage";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/(app)/buckets/$bucketId/")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(bucketQuery(params.bucketId)).then(
      (b) => b.name,
      () => undefined,
    ),
  head: ({ loaderData }) =>
    pageMeta(loaderData ?? "Bucket", "Bucket storage overview, statistics, and quick navigation."),
  component: BucketPage,
});

function BucketQuickLinks({
  bucketId,
  domainCount,
  keyCount,
}: {
  bucketId: string;
  domainCount: number;
  keyCount: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Link
        to="/buckets/$bucketId/files"
        params={{ bucketId }}
        className="group flex flex-col justify-between panel p-4 transition-colors hover:border-primary/50"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Icon name="folder-open" className="size-4 text-primary" />
            <span className="text-sm font-semibold transition-colors group-hover:text-primary">
              Files
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Browse, upload, preview, and download files stored in this bucket.
          </p>
        </div>
        <div className="mt-4 flex items-center text-xs font-medium text-primary">
          <span>Browse files</span>
          <Icon
            name="chevron-right"
            className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </Link>

      <Link
        to="/buckets/$bucketId/domains"
        params={{ bucketId }}
        className="group flex flex-col justify-between panel p-4 transition-colors hover:border-primary/50"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Icon name="globe" className="size-4 text-primary" />
            <span className="text-sm font-semibold transition-colors group-hover:text-primary">
              Custom domains
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {domainCount === 0
              ? "No domains connected yet."
              : `${domainCount} domain${domainCount === 1 ? "" : "s"} serving over HTTPS.`}
          </p>
        </div>
        <div className="mt-4 flex items-center text-xs font-medium text-primary">
          <span>Manage domains</span>
          <Icon
            name="chevron-right"
            className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </Link>

      <Link
        to="/buckets/$bucketId/access"
        params={{ bucketId }}
        className="group flex flex-col justify-between panel p-4 transition-colors hover:border-primary/50"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Icon name="key-round" className="size-4 text-primary" />
            <span className="text-sm font-semibold transition-colors group-hover:text-primary">
              S3 access keys
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {keyCount === 0
              ? "No access keys granted."
              : `${keyCount} key${keyCount === 1 ? "" : "s"} with permissions.`}
          </p>
        </div>
        <div className="mt-4 flex items-center text-xs font-medium text-primary">
          <span>View access</span>
          <Icon
            name="chevron-right"
            className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </Link>

      <Link
        to="/buckets/$bucketId/settings"
        params={{ bucketId }}
        className="group flex flex-col justify-between panel p-4 transition-colors hover:border-primary/50"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Icon name="settings" className="size-4 text-primary" />
            <span className="text-sm font-semibold transition-colors group-hover:text-primary">
              Settings
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            CORS configuration, lifecycle rules, storage quotas, and bucket deletion.
          </p>
        </div>
        <div className="mt-4 flex items-center text-xs font-medium text-primary">
          <span>Configure</span>
          <Icon
            name="chevron-right"
            className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </Link>
    </div>
  );
}

function BucketPage() {
  const { bucketId } = Route.useParams();
  const bucket = useQuery(bucketQuery(bucketId));

  return (
    <>
      <AppHeader
        backTo="/buckets"
        title={bucket.data?.name ?? "Bucket"}
        description="Overview of storage usage, object count, and bucket status."
        bottomContent={<BucketTabs bucketId={bucketId} />}
        endContent={bucket.data && <SetQuotaDialog bucket={bucket.data} />}
      />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {bucket.isPending ? (
          <>
            <BucketSummary.Skeleton />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse panel p-4" />
              ))}
            </div>
          </>
        ) : bucket.isError ? (
          <QueryError error={bucket.error} onRetry={() => bucket.refetch()} backTo="/buckets" />
        ) : (
          <>
            <BucketSummary bucket={bucket.data} />
            <BucketQuickLinks
              bucketId={bucketId}
              domainCount={bucket.data.domainRecords.length}
              keyCount={bucket.data.keys.length}
            />
          </>
        )}
      </div>
    </>
  );
}
