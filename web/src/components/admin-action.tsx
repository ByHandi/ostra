import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsAdmin } from "@/lib/api/session";

interface AdminActionProps {
  /** The action element to render when the user is an admin. */
  children: ReactNode;
  /**
   * If provided and user is not admin, renders this fallback (e.g. disabled button with tooltip).
   * If omitted, renders nothing when user is not admin.
   */
  fallback?: ReactNode;
  /** Tooltip message when fallback is disabled. Default: "Administrator role required" */
  tooltip?: string;
}

export function AdminAction({
  children,
  fallback,
  tooltip = "Administrator role required",
}: AdminActionProps) {
  const isAdmin = useIsAdmin();

  if (isAdmin) {
    return <>{children}</>;
  }

  if (!fallback) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block cursor-not-allowed">{fallback}</span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
