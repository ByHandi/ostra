import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import { CreateDomainDialog } from "@/components/domains/create-domain-dialog";
import DomainTable from "@/components/domains/domain-table";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { domainsQuery } from "@/lib/api/storage";

export const Route = createFileRoute("/(app)/domains/")({
  component: Domains,
});

function Domains() {
  const domains = useQuery(domainsQuery());

  return (
    <>
      <AppHeader
        title="Custom Domains"
        description="Serve a bucket's contents publicly on your own domain, with automatic HTTPS."
        endContent={<CreateDomainDialog />}
      />

      {/* Desktop: a flex column, so the table shrinks to the viewport and scrolls inside. */}
      <div className="p-4 md:flex md:flex-col md:p-6">
        {domains.isPending ? (
          <DomainTable.Skeleton />
        ) : domains.isError ? (
          <QueryError error={domains.error} onRetry={() => domains.refetch()} />
        ) : domains.data.length === 0 ? (
          <EmptyState
            icon="globe"
            title="No custom domains yet"
            description="Add a domain, set up two DNS records, and the domain goes live automatically once verified."
            action={<CreateDomainDialog />}
          />
        ) : (
          <DomainTable domains={domains.data} />
        )}
      </div>
    </>
  );
}
