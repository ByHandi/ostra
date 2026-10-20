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
      label: "Penyimpanan",
      value: formatBytes(o.bytes),
      hint: `${formatNumber(o.objects)} objek`,
      icon: "hard-drive",
    },
    {
      label: "Bucket",
      value: formatNumber(o.buckets),
      hint: "total bucket",
      icon: "archive",
    },
    {
      label: "Custom domain",
      value: formatNumber(o.domains.active),
      hint:
        o.domains.pending || o.domains.error
          ? `${o.domains.pending} menunggu DNS · ${o.domains.error} error`
          : "semua aktif",
      icon: "globe",
    },
    {
      label: "Access key",
      value: formatNumber(o.keys),
      hint: "untuk S3 API",
      icon: "key-round",
    },
  ];
}

const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";

function StatCards({ overview }: { overview: Overview }) {
  return (
    <div className={GRID}>
      {stats(overview).map((stat) => (
        <div key={stat.label} className="flex flex-col gap-2 rounded-lg border p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm">{stat.label}</span>
            <Icon name={stat.icon} className="size-4" />
          </div>
          <span className="font-heading text-2xl">{stat.value}</span>
          <span className="text-xs text-muted-foreground">{stat.hint}</span>
        </div>
      ))}
    </div>
  );
}

function StatCardsSkeleton() {
  return (
    <div className={GRID} role="status" aria-label="Memuat statistik">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border p-4">
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
