import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import type { DomainStatus } from "@/lib/api/storage";

const STATUS = {
  active: { label: "Active", variant: "success", icon: "circle-check" },
  pending: { label: "Awaiting DNS", variant: "warning", icon: "clock" },
  error: { label: "Error", variant: "destructive", icon: "circle-alert" },
} as const;

export function DomainStatusBadge({ status }: { status: DomainStatus }) {
  const s = STATUS[status];
  return (
    <Badge variant={s.variant}>
      <Icon name={s.icon} />
      {s.label}
    </Badge>
  );
}
