import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { toast } from "sonner";

import AppHeader from "@/components/app-header";
import { BucketCors } from "@/components/buckets/bucket-cors";
import { BucketTabs } from "@/components/buckets/bucket-tabs";
import { SetQuotaDialog } from "@/components/buckets/set-quota-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { QueryError } from "@/components/query-error";
import Section from "@/components/section";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { ApiError } from "@/lib/api/errors";
import { bucketQuery, deleteBucket, storageKeys } from "@/lib/api/storage";
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
      "Configure CORS rules, storage quotas, and bucket settings.",
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
            <Section.Skeleton rows={2} />
            <Section.Skeleton rows={1} />
          </>
        ) : bucket.isError ? (
          <QueryError error={bucket.error} onRetry={() => bucket.refetch()} backTo="/buckets" />
        ) : (
          <>
            <BucketCors bucketId={bucketId} />

            <Section
              title="Storage quotas"
              description="Maximum capacity and object count limits enforced by Garage."
              action={<SetQuotaDialog bucket={bucket.data} />}
            >
              {bucket.data.quotas?.maxSize || bucket.data.quotas?.maxObjects ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">Storage limit</dt>
                    <dd className="text-sm font-medium">
                      {bucket.data.quotas?.maxSize
                        ? formatBytes(bucket.data.quotas.maxSize)
                        : "Unlimited"}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-xs text-muted-foreground">Object limit</dt>
                    <dd className="text-sm font-medium">
                      {bucket.data.quotas?.maxObjects
                        ? formatNumber(bucket.data.quotas.maxObjects)
                        : "Unlimited"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No quotas configured. This bucket can store unlimited files up to available
                  cluster storage.
                </p>
              )}
            </Section>

            <Section
              title="Danger zone"
              description="Permanently delete this bucket."
              className="border-destructive/30"
            >
              <div className="flex flex-col justify-between gap-4 rounded-md border border-destructive/20 bg-destructive/5 p-4 sm:flex-row sm:items-center">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-destructive">Delete this bucket</div>
                  <div className="text-xs text-muted-foreground">
                    Only empty buckets without custom domains can be deleted. This action cannot be
                    undone.
                  </div>
                </div>
                <ConfirmDialog
                  title={`Delete bucket ${bucket.data.name}?`}
                  description="Only an empty bucket with no custom domains can be deleted. This action can't be undone."
                  confirmText="Delete bucket"
                  onConfirm={remove}
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
          </>
        )}
      </div>
    </>
  );
}
