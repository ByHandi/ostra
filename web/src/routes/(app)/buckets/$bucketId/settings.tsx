import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { toast } from "sonner";

import AppHeader from "@/components/app-header";
import { BucketCors } from "@/components/buckets/bucket-cors";
import { BucketLifecycle } from "@/components/buckets/bucket-lifecycle";
import { BucketTabs } from "@/components/buckets/bucket-tabs";
import { ConfigureWebsiteDialog } from "@/components/buckets/configure-website-dialog";
import { SetQuotaDialog } from "@/components/buckets/set-quota-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { QueryError } from "@/components/query-error";
import Section from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { ApiError } from "@/lib/api/errors";
import { type BucketDetail, bucketQuery, deleteBucket, storageKeys } from "@/lib/api/storage";
import { formatBytes, formatNumber } from "@/lib/format";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/(app)/buckets/$bucketId/settings")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(bucketQuery(params.bucketId)).then(
      (b) => b.name,
      () => undefined,
    ),
  head: ({ loaderData }) =>
    pageMeta(
      loaderData ? `Settings · ${loaderData}` : "Settings",
      "Configure CORS rules, lifecycle rules, storage quotas, and bucket settings.",
    ),
  component: BucketSettingsPage,
});

function BucketSettingsPage() {
  const { bucketId } = Route.useParams();
  const bucket = useQuery(bucketQuery(bucketId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const remove = async () => {
    try {
      await deleteBucket(bucketId);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete bucket");
      throw error;
    }
    queryClient.removeQueries({ queryKey: storageKeys.bucket(bucketId) });
    queryClient.invalidateQueries({ queryKey: storageKeys.buckets });
    queryClient.invalidateQueries({ queryKey: storageKeys.overview });
    toast.success(`Bucket ${bucket.data?.name ?? ""} deleted`);
    navigate({ to: "/buckets", replace: true });
  };

  return (
    <>
      <AppHeader
        backTo="/buckets"
        title={bucket.data?.name ?? "Bucket"}
        description="Configure CORS rules, storage limits, and manage bucket lifecycle."
        bottomContent={<BucketTabs bucketId={bucketId} />}
      />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {bucket.isPending ? (
          <>
            <Section.Skeleton rows={2} />
            <BucketLifecycle.Skeleton />
            <Section.Skeleton rows={2} />
            <Section.Skeleton rows={1} />
          </>
        ) : bucket.isError ? (
          <QueryError error={bucket.error} onRetry={() => bucket.refetch()} backTo="/buckets" />
        ) : (
          <>
            <BucketCors bucketId={bucketId} />
            <BucketLifecycle bucketId={bucketId} bucketName={bucket.data.name} />
            <StorageQuotasSection bucket={bucket.data} />
            <WebsiteSection bucket={bucket.data} />
            <DangerZoneSection bucket={bucket.data} onRemove={remove} />
          </>
        )}
      </div>
    </>
  );
}

function StorageQuotasSection({ bucket }: { bucket: BucketDetail }) {
  const hasQuotas = Boolean(bucket.quotas?.maxSize || bucket.quotas?.maxObjects);

  return (
    <Section
      title="Storage quotas"
      description="Maximum capacity and object count limits enforced by Garage."
      action={<SetQuotaDialog bucket={bucket} />}
    >
      {hasQuotas ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">Storage limit</dt>
            <dd className="text-sm font-medium">
              {bucket.quotas?.maxSize ? formatBytes(bucket.quotas.maxSize) : "Unlimited"}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs text-muted-foreground">Object limit</dt>
            <dd className="text-sm font-medium">
              {bucket.quotas?.maxObjects ? formatNumber(bucket.quotas.maxObjects) : "Unlimited"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          No quotas configured. This bucket can store unlimited files up to available cluster
          storage.
        </p>
      )}
    </Section>
  );
}

function WebsiteSection({ bucket }: { bucket: BucketDetail }) {
  return (
    <Section
      title="Static website hosting"
      description="Host static HTML, client-side SPAs, or public assets directly from this bucket."
      action={<ConfigureWebsiteDialog bucket={bucket} />}
    >
      {bucket.websiteAccess ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Hosting enabled</Badge>
            {bucket.publicBaseUrl && (
              <a
                href={bucket.publicBaseUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-mono text-xs text-primary hover:underline"
              >
                {bucket.publicBaseUrl}
                <Icon name="external-link" className="size-3" />
              </a>
            )}
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">Index document</dt>
              <dd className="font-mono text-sm font-medium">
                {bucket.websiteConfig?.indexDocument || "index.html"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">Error document</dt>
              <dd className="font-mono text-sm font-medium">
                {bucket.websiteConfig?.errorDocument || "None (default 404)"}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Static website hosting is disabled. Objects cannot be viewed anonymously over HTTP.
        </p>
      )}
    </Section>
  );
}

function DangerZoneSection({
  bucket,
  onRemove,
}: {
  bucket: BucketDetail;
  onRemove: () => Promise<void>;
}) {
  return (
    <Section
      title="Danger zone"
      description="Permanently delete this bucket."
      className="border-destructive/30"
    >
      <div className="flex flex-col justify-between gap-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center">
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-destructive">Delete this bucket</div>
          <div className="text-xs text-muted-foreground">
            Only empty buckets without custom domains can be deleted. This action cannot be undone.
          </div>
        </div>
        <ConfirmDialog
          title={`Delete bucket ${bucket.name}?`}
          description="Only an empty bucket with no custom domains can be deleted. This action can't be undone."
          confirmText="Delete bucket"
          onConfirm={onRemove}
          trigger={
            <Button
              variant="destructive"
              size="sm"
              startContent={<Icon name="trash-2" className="size-4" />}
            >
              Delete bucket
            </Button>
          }
        />
      </div>
    </Section>
  );
}
