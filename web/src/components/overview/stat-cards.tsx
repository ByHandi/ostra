import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { Overview } from "@/lib/api/storage";
import { formatBytes, formatNumber } from "@/lib/format";

type IconName = React.ComponentProps<typeof Icon>["name"];

interface Stat {
  label: string;
  value: string;
  hint: string;
  icon: IconName;
}

function stats(o: Overview): Stat[] {
  return [
    {
      label: "Storage",
      value: formatBytes(o.bytes),
      hint: `${formatNumber(o.objects)} objects`,
      icon: "hard-drive",
    },
    {
      label: "Buckets",
      value: formatNumber(o.buckets),
      hint: "total buckets",
      icon: "archive",
    },
    {
      label: "Custom domains",
      value: formatNumber(o.domains.active),
      hint:
        o.domains.pending || o.domains.error
          ? `${o.domains.pending} awaiting DNS · ${o.domains.error} error`
          : "all active",
      icon: "globe",
    },
    {
      label: "Access keys",
      value: formatNumber(o.keys),
      hint: "for the S3 API",
      icon: "key-round",
    },
  ];
}

const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";

function StatCards({ overview }: { overview: Overview }) {
  return (
    <div className={GRID}>
      {stats(overview).map((stat) => (
        <div
          key={stat.label}
          className="group relative flex flex-col gap-2 overflow-hidden panel p-4 transition-shadow hover:glow-primary"
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-aurora opacity-60 transition-opacity group-hover:opacity-100"
          />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm">{stat.label}</span>
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon name={stat.icon} className="size-4" />
            </span>
          </div>
          <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
            {stat.value}
          </span>
          <span className="text-xs text-muted-foreground">{stat.hint}</span>
        </div>
      ))}
    </div>
  );
}

function StatCardsSkeleton() {
  return (
    <div className={GRID} role="status" aria-label="Loading statistics">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 panel p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-4 rounded-full" />
          </div>
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

StatCards.Skeleton = StatCardsSkeleton;
export default StatCards;
