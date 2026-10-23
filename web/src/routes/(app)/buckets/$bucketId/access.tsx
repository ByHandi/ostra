import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import BucketAccess from "@/components/buckets/bucket-access";
import { BucketTabs } from "@/components/buckets/bucket-tabs";
import { QueryError } from "@/components/query-error";
import Section from "@/components/section";
import { bucketQuery } from "@/lib/api/storage";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/(app)/buckets/$bucketId/access")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(bucketQuery(params.bucketId)).then(
      (b) => b.name,
      () => undefined,
    ),
  head: ({ loaderData }) =>
    pageMeta(
      loaderData ? `Access · ${loaderData}` : "Access",
      "S3 access keys with permissions on this bucket.",
    ),
  component: BucketAccessPage,
});

function BucketAccessPage() {
  const { bucketId } = Route.useParams();
  const bucket = useQuery(bucketQuery(bucketId));

  return (
    <>
      <AppHeader
        backTo="/buckets"
        title={bucket.data?.name ?? "Bucket"}
        description="Access keys with permissions on this bucket. Permissions are managed from each key's page."
        bottomContent={<BucketTabs bucketId={bucketId} />}
      />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {bucket.isPending ? (
          <Section.Skeleton rows={3} />
        ) : bucket.isError ? (
          <QueryError error={bucket.error} onRetry={() => bucket.refetch()} backTo="/buckets" />
        ) : (
          <Section
            title="S3 API access"
            description="Access keys that can read, write, or manage this bucket through S3."
          >
            <BucketAccess keys={bucket.data.keys} />
          </Section>
        )}
      </div>
    </>
  );
}
