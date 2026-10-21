import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { toast } from "sonner";

import AppHeader from "@/components/app-header";
import BucketAccess from "@/components/buckets/bucket-access";
import BucketSummary from "@/components/buckets/bucket-summary";
import { BucketTabs } from "@/components/buckets/bucket-tabs";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CreateDomainDialog } from "@/components/domains/create-domain-dialog";
import DomainTable from "@/components/domains/domain-table";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import Section from "@/components/section";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { ApiError } from "@/lib/api/errors";
import { bucketQuery, deleteBucket, storageKeys } from "@/lib/api/storage";

export const Route = createFileRoute("/(app)/buckets/$bucketId/")({
  component: BucketPage,
});

function BucketPage() {
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
        description="Bucket details, custom domains, and the access keys that can access it."
        bottomContent={<BucketTabs bucketId={bucketId} />}
        endContent={
          bucket.data && (
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
                  Delete
                </Button>
              }
            />
          )
        }
      />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {bucket.isPending ? (
          <>
            <BucketSummary.Skeleton />
            <Section.Skeleton rows={2} />
            <Section.Skeleton rows={2} />
          </>
        ) : bucket.isError ? (
          <QueryError error={bucket.error} onRetry={() => bucket.refetch()} backTo="/buckets" />
        ) : (
          <>
            <BucketSummary bucket={bucket.data} />

            <Section
              title="Custom domains"
              description="Domains that serve this bucket's contents publicly (read-only)."
              action={<CreateDomainDialog bucket={bucket.data.name} />}
            >
              {bucket.data.domainRecords.length === 0 ? (
                <EmptyState
                  icon="globe"
                  title="No custom domains yet"
                  description="Add a domain to make the bucket's contents publicly accessible, e.g. for website assets."
                />
              ) : (
                <DomainTable domains={bucket.data.domainRecords} hideBucket />
              )}
            </Section>

            <Section
              title="S3 API access"
              description="Access keys with permissions on this bucket. Permissions are managed from each key's page."
            >
              <BucketAccess keys={bucket.data.keys} />
            </Section>
          </>
        )}
      </div>
    </>
  );
}
