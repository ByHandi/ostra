import { SetQuotaDialog } from "@/components/buckets/set-quota-dialog";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { BucketDetail } from "@/lib/api/storage";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function QuotaBar({
  label,
  used,
  max,
  formattedUsed,
  formattedMax,
}: {
  label: string;
  used: number;
  max: number;
  formattedUsed: string;
  formattedMax: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const isDanger = percent >= 90;
  const isWarn = percent >= 75 && !isDanger;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {formattedUsed} / {formattedMax} ({percent}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            isDanger ? "bg-destructive" : isWarn ? "bg-amber-500" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ObjectsValue({ bucket }: { bucket: BucketDetail }) {
  if (!bucket.quotas?.maxObjects) {
    return formatNumber(bucket.objects);
  }
  return (
    <div className="flex items-baseline gap-1">
      <span>{formatNumber(bucket.objects)}</span>
      <span className="text-xs text-muted-foreground">
        / {formatNumber(bucket.quotas.maxObjects)}
      </span>
    </div>
  );
}

function SizeValue({ bucket }: { bucket: BucketDetail }) {
  if (!bucket.quotas?.maxSize) {
    return formatBytes(bucket.bytes);
  }
  return (
    <div className="flex items-baseline gap-1">
      <span>{formatBytes(bucket.bytes)}</span>
      <span className="text-xs text-muted-foreground">/ {formatBytes(bucket.quotas.maxSize)}</span>
    </div>
  );
}

function WebsiteAccessValue({ bucket }: { bucket: BucketDetail }) {
  if (!bucket.websiteAccess) {
    return <Badge variant="secondary">Private</Badge>;
  }

  const indexDoc = bucket.websiteConfig?.indexDocument || "index.html";
  const errorDoc = bucket.websiteConfig?.errorDocument;

  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="success">Public (read-only)</Badge>
      <span className="font-mono text-[11px] text-muted-foreground">
        {indexDoc}
        {errorDoc ? ` · ${errorDoc}` : ""}
      </span>
    </div>
  );
}

function BucketSummary({ bucket }: { bucket: BucketDetail }) {
  const items = [
    { label: "Objects", value: <ObjectsValue bucket={bucket} /> },
    { label: "Size", value: <SizeValue bucket={bucket} /> },
    { label: "Created", value: formatDate(bucket.created) },
    { label: "Website access", value: <WebsiteAccessValue bucket={bucket} /> },
  ];

  const hasQuotas = Boolean(bucket.quotas?.maxSize || bucket.quotas?.maxObjects);

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

      {hasQuotas && (
        <div className="grid gap-4 border-t border-border/60 pt-3 sm:grid-cols-2">
          {bucket.quotas?.maxSize && (
            <QuotaBar
              label="Storage quota"
              used={bucket.bytes}
              max={bucket.quotas.maxSize}
              formattedUsed={formatBytes(bucket.bytes)}
              formattedMax={formatBytes(bucket.quotas.maxSize)}
            />
          )}
          {bucket.quotas?.maxObjects && (
            <QuotaBar
              label="Object count quota"
              used={bucket.objects}
              max={bucket.quotas.maxObjects}
              formattedUsed={formatNumber(bucket.objects)}
              formattedMax={formatNumber(bucket.quotas.maxObjects)}
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Bucket ID</p>
          <div className="flex items-center gap-1">
            <code className="truncate font-mono text-xs">{bucket.id}</code>
            <CopyButton value={bucket.id} label="Copy bucket ID" />
          </div>
        </div>

        <SetQuotaDialog
          bucket={bucket}
          trigger={
            <Button
              variant="outline"
              size="xs"
              startContent={<Icon name="scale" className="size-3.5" />}
              className="self-start sm:self-auto"
            >
              {hasQuotas ? "Edit quotas" : "Set quotas"}
            </Button>
          }
        />
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
