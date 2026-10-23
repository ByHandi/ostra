import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import { BucketTabs } from "@/components/buckets/bucket-tabs";
import { CreateDomainDialog } from "@/components/domains/create-domain-dialog";
import DomainTable from "@/components/domains/domain-table";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import Section from "@/components/section";
import { bucketQuery } from "@/lib/api/storage";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/(app)/buckets/$bucketId/domains")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(bucketQuery(params.bucketId)).then(
      (b) => b.name,
      () => undefined,
    ),
  head: ({ loaderData }) =>
    pageMeta(
      loaderData ? `Domains · ${loaderData}` : "Domains",
      "Custom domains that serve this bucket's contents publicly.",
    ),
  component: BucketDomainsPage,
});

function BucketDomainsPage() {
  const { bucketId } = Route.useParams();
  const bucket = useQuery(bucketQuery(bucketId));

  return (
    <>
      <AppHeader
        backTo="/buckets"
        title={bucket.data?.name ?? "Bucket"}
        description="Custom domains that serve this bucket's contents publicly (read-only)."
        bottomContent={<BucketTabs bucketId={bucketId} />}
        endContent={bucket.data && <CreateDomainDialog bucket={bucket.data.name} />}
      />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {bucket.isPending ? (
          <Section.Skeleton rows={3} />
        ) : bucket.isError ? (
          <QueryError error={bucket.error} onRetry={() => bucket.refetch()} backTo="/buckets" />
        ) : bucket.data.domainRecords.length === 0 ? (
          <EmptyState
            icon="globe"
            title="No custom domains yet"
            description="Add a domain to make the bucket's contents publicly accessible, e.g. for website assets."
            action={<CreateDomainDialog bucket={bucket.data.name} />}
          />
        ) : (
          <Section
            title="Custom domains"
            description="Domains configured to serve this bucket's files over HTTPS."
            action={<CreateDomainDialog bucket={bucket.data.name} />}
          >
            <DomainTable domains={bucket.data.domainRecords} hideBucket />
          </Section>
        )}
      </div>
    </>
  );
}
