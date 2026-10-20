import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import BucketTable from "@/components/buckets/bucket-table";
import { CreateBucketDialog } from "@/components/buckets/create-bucket-dialog";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { bucketsQuery } from "@/lib/api/storage";

export const Route = createFileRoute("/(app)/buckets/")({
  component: Buckets,
});

function Buckets() {
  const buckets = useQuery(bucketsQuery());

  return (
    <>
      <AppHeader
        title="Buckets"
        description="Containers for objects. Accessed through the S3 API with an access key, or publicly through a custom domain."
        endContent={<CreateBucketDialog />}
      />

      <div className="p-4 md:p-6">
        {buckets.isPending ? (
          <BucketTable.Skeleton />
        ) : buckets.isError ? (
          <QueryError error={buckets.error} onRetry={() => buckets.refetch()} />
        ) : buckets.data.length === 0 ? (
          <EmptyState
            icon="archive"
            title="No buckets yet"
            description="Create your first bucket to start storing objects."
            action={<CreateBucketDialog />}
          />
        ) : (
          <BucketTable buckets={buckets.data} />
        )}
      </div>
    </>
  );
}
