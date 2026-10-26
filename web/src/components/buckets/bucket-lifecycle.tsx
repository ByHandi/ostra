import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "sonner";

import { ConfigureLifecycleDialog } from "@/components/buckets/configure-lifecycle-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import Section from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { useIsAdmin } from "@/lib/api/session";
import {
  type LifecycleConfiguration,
  bucketLifecycleQuery,
  deleteBucketLifecycle,
  storageKeys,
} from "@/lib/api/storage";

interface BucketLifecycleProps {
  bucketId: string;
  bucketName: string;
}

export function BucketLifecycle({ bucketId, bucketName }: BucketLifecycleProps) {
  const queryClient = useQueryClient();
  const lifecycleQuery = useQuery(bucketLifecycleQuery(bucketId));
  const isAdmin = useIsAdmin();

  const deleteMutation = useMutation({
    mutationFn: () => deleteBucketLifecycle(bucketId),
    onSuccess: () => {
      queryClient.setQueryData<LifecycleConfiguration>(storageKeys.bucketLifecycle(bucketId), {
        expirationDays: null,
        abortIncompleteMultipartUploadDays: null,
      });
      queryClient.invalidateQueries({ queryKey: storageKeys.bucketLifecycle(bucketId) });
      toast.success("Lifecycle rules cleared");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't clear lifecycle rules");
    },
  });

  if (lifecycleQuery.isPending) {
    return <BucketLifecycleSkeleton />;
  }

  if (lifecycleQuery.isError) {
    return (
      <Section
        title="Lifecycle rules"
        description="Automated object expiration and multipart upload cleanup."
      >
        <div className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <span>Failed to load lifecycle rules.</span>
          <Button variant="outline" size="sm" onClick={() => lifecycleQuery.refetch()}>
            Retry
          </Button>
        </div>
      </Section>
    );
  }

  const lifecycle = lifecycleQuery.data;
  const hasExpiration = Boolean(lifecycle?.expirationDays && lifecycle.expirationDays > 0);
  const hasAbort = Boolean(
    lifecycle?.abortIncompleteMultipartUploadDays &&
    lifecycle.abortIncompleteMultipartUploadDays > 0,
  );
  const hasRules = hasExpiration || hasAbort;

  return (
    <Section
      title="Lifecycle rules"
      description="Automated object expiration after N days and automatic cleanup of incomplete multipart uploads."
      action={
        isAdmin && hasRules ? (
          <div className="flex gap-2">
            <ConfigureLifecycleDialog
              bucketId={bucketId}
              bucketName={bucketName}
              lifecycle={lifecycle}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  startContent={<Icon name="pencil" className="size-4" />}
                >
                  Edit
                </Button>
              }
            />
            <ConfirmDialog
              title="Clear lifecycle rules?"
              description="This will remove all automated expiration and cleanup rules from the bucket. Objects will be retained indefinitely."
              confirmText="Clear rules"
              onConfirm={() => deleteMutation.mutateAsync()}
              trigger={
                <Button
                  variant="destructive"
                  size="sm"
                  startContent={<Icon name="trash-2" className="size-4" />}
                >
                  Clear
                </Button>
              }
            />
          </div>
        ) : undefined
      }
    >
      {hasRules ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 rounded-lg border p-4">
            <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Icon name="clock" className="size-4 text-muted-foreground" />
              Object expiration
            </dt>
            <dd className="text-sm font-medium">
              {hasExpiration ? (
                <span>
                  Delete objects after{" "}
                  <Badge variant="outline" className="font-mono">
                    {lifecycle!.expirationDays} days
                  </Badge>
                </span>
              ) : (
                <span className="text-muted-foreground">Disabled</span>
              )}
            </dd>
          </div>

          <div className="space-y-1 rounded-lg border p-4">
            <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Icon name="trash" className="size-4 text-muted-foreground" />
              Incomplete multipart uploads
            </dt>
            <dd className="text-sm font-medium">
              {hasAbort ? (
                <span>
                  Abort after{" "}
                  <Badge variant="outline" className="font-mono">
                    {lifecycle!.abortIncompleteMultipartUploadDays} days
                  </Badge>
                </span>
              ) : (
                <span className="text-muted-foreground">Disabled</span>
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <EmptyState
          icon="history"
          title="No lifecycle rules configured"
          description="Automate file expiration and multipart upload cleanup to prevent temporary data from accumulating."
          action={
            isAdmin ? (
              <ConfigureLifecycleDialog
                bucketId={bucketId}
                bucketName={bucketName}
                lifecycle={lifecycle}
              />
            ) : undefined
          }
        />
      )}
    </Section>
  );
}

function BucketLifecycleSkeleton() {
  return (
    <Section
      title="Lifecycle rules"
      description="Automated object expiration after N days and automatic cleanup of incomplete multipart uploads."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="space-y-2 rounded-lg border p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
    </Section>
  );
}

BucketLifecycle.Skeleton = BucketLifecycleSkeleton;
