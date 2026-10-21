import { CopyButton } from "@/components/copy-button";
import Section from "@/components/section";
import { Skeleton } from "@/components/ui/skeleton";
import type { DnsRecord } from "@/lib/api/storage";

const HINT: Record<DnsRecord["type"], string> = {
  CNAME:
    "Points the domain at the edge. For an apex domain, use ALIAS/ANAME or an A record to the edge IP.",
  TXT: "Proves that you own this domain.",
};

function DnsRecords({ records }: { records: DnsRecord[] }) {
  return (
    <Section
      title="DNS records"
      description="Add both records at your domain's DNS provider. Checks run automatically every 30 seconds."
    >
      <div className="flex flex-col gap-3">
        {records.map((r) => (
          <div key={r.type} className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
            <div className="flex items-center gap-2">
              <span className="rounded bg-background px-1.5 py-0.5 font-mono text-xs font-semibold ring-1 ring-border">
                {r.type}
              </span>
              <span className="text-xs text-muted-foreground">{HINT[r.type]}</span>
            </div>
            <Field label="Name" value={r.name} />
            <Field label="Value" value={r.value} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 truncate font-mono text-xs" title={value}>
        {value}
      </code>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

function DnsRecordsSkeleton() {
  return (
    <div className="flex flex-col gap-4 panel p-4" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-md bg-muted/50 p-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

DnsRecords.Skeleton = DnsRecordsSkeleton;
export default DnsRecords;
