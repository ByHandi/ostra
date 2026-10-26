import type { ReactNode } from "react";

import Icon from "@/components/ui/icon";
import { useIsAdmin } from "@/lib/api/session";
import { cn } from "@/lib/utils";

interface ReadOnlyBannerProps {
  message?: ReactNode;
  className?: string;
}

export function ReadOnlyBanner({
  message = "You are currently signed in with read-only access (Viewer role). Write and management operations are restricted to administrators.",
  className,
}: ReadOnlyBannerProps) {
  const isAdmin = useIsAdmin();
  if (isAdmin) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-border/80 bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <Icon name="info" className="size-4 shrink-0 text-muted-foreground" />
      <span>{message}</span>
    </div>
  );
}
