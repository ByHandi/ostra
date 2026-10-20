import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import DomainTable from "@/components/domains/domain-table";
import ClusterHealth from "@/components/overview/cluster-health";
import StatCards from "@/components/overview/stat-cards";
import { QueryError } from "@/components/query-error";
import Section from "@/components/section";
import { Button } from "@/components/ui/button";
import { domainsQuery, overviewQuery } from "@/lib/api/storage";

export const Route = createFileRoute("/(app)/")({
  component: Dashboard,
});

function Dashboard() {
  const overview = useQuery(overviewQuery());
  const domains = useQuery(domainsQuery());
  const needsAttention = (domains.data ?? []).filter((d) => d.status !== "active");

  return (
    <>
      <AppHeader title="Dashboard" description="Ringkasan storage dan custom domain." />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {overview.isPending ? (
          <>
            <StatCards.Skeleton />
            <ClusterHealth.Skeleton />
          </>
        ) : overview.isError ? (
          <QueryError error={overview.error} onRetry={() => overview.refetch()} />
        ) : (
          <>
            <StatCards overview={overview.data} />
            <ClusterHealth cluster={overview.data.cluster} />
          </>
        )}

        {domains.isPending ? (
          <Section.Skeleton rows={2} />
        ) : (
          needsAttention.length > 0 && (
            <Section
              title="Domain yang perlu perhatian"
              description="Domain ini belum aktif. Pastikan record DNS-nya sudah terpasang."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/domains">Semua domain</Link>
                </Button>
              }
            >
              <DomainTable domains={needsAttention} />
            </Section>
          )
        )}
      </div>
    </>
  );
}
