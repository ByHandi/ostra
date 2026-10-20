import Section from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Overview } from "@/lib/api/storage";

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "destructive" }> = {
  healthy: { label: "Healthy", variant: "success" },
  degraded: { label: "Degraded", variant: "warning" },
  unavailable: { label: "Unavailable", variant: "destructive" },
};

function ClusterHealth({ cluster }: { cluster: Overview["cluster"] }) {
  const status = STATUS[cluster.status] ?? { label: cluster.status, variant: "warning" as const };
  const rows = [
    {
      label: "Storage nodes up",
      value: `${cluster.storageNodesUp} / ${cluster.storageNodes}`,
    },
    { label: "Connected nodes", value: `${cluster.connectedNodes} / ${cluster.knownNodes}` },
    { label: "Healthy partitions", value: `${cluster.partitionsAllOk} / ${cluster.partitions}` },
  ];

  return (
    <Section
      title="Garage cluster"
      description="Status from the Garage admin API."
      action={<Badge variant={status.variant}>{status.label}</Badge>}
    >
      <dl className="grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="space-y-1">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd className="font-mono text-sm">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function ClusterHealthSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4" role="status" aria-label="Loading">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-48" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

ClusterHealth.Skeleton = ClusterHealthSkeleton;
export default ClusterHealth;
