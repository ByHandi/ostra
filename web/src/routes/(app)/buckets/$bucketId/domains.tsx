import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdminAction } from "@/components/admin-action";
import AppHeader from "@/components/app-header";
import { BucketTabs } from "@/components/buckets/bucket-tabs";
import { CreateDomainDialog } from "@/components/domains/create-domain-dialog";
import DomainTable from "@/components/domains/domain-table";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import Section from "@/components/section";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useIsAdmin } from "@/lib/api/session";
import { type BucketDetail, bucketQuery } from "@/lib/api/storage";
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

function BucketDomainsContent({ bucket, isAdmin }: { bucket: BucketDetail; isAdmin: boolean }) {
  if (bucket.domainRecords.length === 0) {
    return (
      <EmptyState
        icon="globe"
        title="No custom domains yet"
        description={
          isAdmin
            ? "Add a domain to make the bucket's contents publicly accessible, e.g. for website assets."
            : "No custom domains have been connected to this bucket."
        }
        action={isAdmin ? <CreateDomainDialog bucket={bucket.name} /> : undefined}
      />
    );
  }

  return (
    <Section
      title="Custom domains"
      description="Domains configured to serve this bucket's files over HTTPS."
      action={isAdmin ? <CreateDomainDialog bucket={bucket.name} /> : undefined}
    >
      <DomainTable domains={bucket.domainRecords} hideBucket />
    </Section>
  );
}

function BucketDomainsPage() {
  const { bucketId } = Route.useParams();
  const bucket = useQuery(bucketQuery(bucketId));
  const isAdmin = useIsAdmin();

  return (
    <>
      <AppHeader
        backTo="/buckets"
        title={bucket.data?.name ?? "Bucket"}
        description="Custom domains that serve this bucket's contents publicly (read-only)."
        bottomContent={<BucketTabs bucketId={bucketId} />}
        endContent={
          bucket.data && (
            <AdminAction
              fallback={
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  startContent={<Icon name="plus" className="size-4" />}
                >
                  Connect domain
                </Button>
              }
              tooltip="Administrator role required to connect custom domains"
            >
              <CreateDomainDialog bucket={bucket.data.name} />
            </AdminAction>
          )
        }
      />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {bucket.isPending && <Section.Skeleton rows={3} />}
        {bucket.isError && (
          <QueryError error={bucket.error} onRetry={() => bucket.refetch()} backTo="/buckets" />
        )}
        {bucket.data && <BucketDomainsContent bucket={bucket.data} isAdmin={isAdmin} />}
      </div>
    </>
  );
}
