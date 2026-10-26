import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdminAction } from "@/components/admin-action";
import AppHeader from "@/components/app-header";
import { CreateDomainDialog } from "@/components/domains/create-domain-dialog";
import DomainTable from "@/components/domains/domain-table";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useIsAdmin } from "@/lib/api/session";
import { domainsQuery } from "@/lib/api/storage";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/(app)/domains/")({
  head: () =>
    pageMeta(
      "Custom Domains",
      "Serve a bucket's contents publicly on your own domain, with automatic HTTPS.",
    ),
  component: Domains,
});

function Domains() {
  const domains = useQuery(domainsQuery());
  const isAdmin = useIsAdmin();

  return (
    <>
      <AppHeader
        title="Custom Domains"
        description="Serve a bucket's contents publicly on your own domain, with automatic HTTPS."
        endContent={
          <AdminAction
            fallback={
              <Button
                variant="outline"
                size="sm"
                disabled
                startContent={<Icon name="plus" className="size-4" />}
              >
                Register domain
              </Button>
            }
            tooltip="Administrator role required to register custom domains"
          >
            <CreateDomainDialog />
          </AdminAction>
        }
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
            description={
              isAdmin
                ? "Add a domain, set up two DNS records, and the domain goes live automatically once verified."
                : "No custom domains have been registered yet."
            }
            action={isAdmin ? <CreateDomainDialog /> : undefined}
          />
        ) : (
          <DomainTable domains={domains.data} />
        )}
      </div>
    </>
  );
}
