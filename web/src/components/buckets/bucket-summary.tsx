import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { BucketDetail } from "@/lib/api/storage";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";

function BucketSummary({ bucket }: { bucket: BucketDetail }) {
  const items = [
    { label: "Objects", value: formatNumber(bucket.objects) },
    { label: "Size", value: formatBytes(bucket.bytes) },
    { label: "Created", value: formatDate(bucket.created) },
    {
      label: "Website access",
      value: bucket.websiteAccess ? (
        <Badge variant="success">Public (read-only)</Badge>
      ) : (
        <Badge variant="secondary">Private</Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 panel p-4">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="text-sm">{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Bucket ID</p>
        <div className="flex items-center gap-1">
          <code className="truncate font-mono text-xs">{bucket.id}</code>
          <CopyButton value={bucket.id} label="Copy bucket ID" />
        </div>
      </div>
    </div>
  );
}

function BucketSummarySkeleton() {
  return (
    <div className="flex flex-col gap-4 panel p-4" role="status" aria-label="Loading">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
    </div>
  );
}

BucketSummary.Skeleton = BucketSummarySkeleton;
export default BucketSummary;
