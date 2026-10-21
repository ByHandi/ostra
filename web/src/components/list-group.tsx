import type { ReactNode } from "react";

import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type IconName = React.ComponentProps<typeof Icon>["name"];

/**
 * iOS inset-grouped list — what the data tables become on phones. Each table
 * renders `<ListGroup>` under `md:hidden` and its `<Table>` under `hidden md:block`.
 */
function ListGroup({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ul className={cn("divide-y divide-border overflow-hidden panel md:hidden", className)}>
      {children}
    </ul>
  );
}

interface ListRowContentProps {
  icon?: IconName;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Show the disclosure chevron — rows that navigate somewhere. */
  chevron?: boolean;
}

function ListRowContent({ icon, title, subtitle, trailing, chevron }: ListRowContentProps) {
  return (
    <>
      {icon && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name={icon} className="size-4.5" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">{title}</span>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {trailing}
      {chevron && (
        <Icon name="chevron-right" className="size-4 shrink-0 text-muted-foreground/60" />
      )}
    </>
  );
}

function ListGroupSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-border panel md:hidden" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex min-h-14 items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-9 rounded-lg" />
          <span className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export { ListGroup, ListGroupSkeleton, ListRowContent };
