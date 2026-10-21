import { Link } from "@tanstack/react-router";

import { DomainStatusBadge } from "./domain-status-badge";

import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { Domain } from "@/lib/api/storage";
import { formatDate, formatRelative } from "@/lib/format";

function DomainSummary({ domain }: { domain: Domain }) {
  const items = [
    { label: "Status", value: <DomainStatusBadge status={domain.status} /> },
    {
      label: "Bucket",
      value: (
        <Link
          to="/buckets/$bucketId"
          params={{ bucketId: domain.bucketId }}
          className="hover:underline"
        >
          {domain.bucketName}
        </Link>
      ),
    },
    { label: "Last checked", value: formatRelative(domain.lastCheckedAt) },
    {
      label: domain.activatedAt ? "Active since" : "Added",
      value: formatDate(domain.activatedAt ?? domain.createdAt),
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

      {domain.lastError && domain.status !== "active" && (
        <div
          className={
            domain.status === "error"
              ? "flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              : "flex gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
          }
        >
          <Icon
            name={domain.status === "error" ? "circle-alert" : "info"}
            className="mt-0.5 size-4 shrink-0"
          />
          <span className="min-w-0 break-words">{domain.lastError}</span>
        </div>
      )}

      {domain.status === "active" && (
        <a
          href={`https://${domain.domain}/`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
        >
          Open https://{domain.domain}
          <Icon name="external-link" className="size-3.5" />
        </a>
      )}
    </div>
  );
}

function DomainSummarySkeleton() {
  return (
    <div
      className="grid gap-4 panel p-4 sm:grid-cols-2 lg:grid-cols-4"
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-28" />
        </div>
      ))}
    </div>
  );
}

DomainSummary.Skeleton = DomainSummarySkeleton;
export default DomainSummary;
