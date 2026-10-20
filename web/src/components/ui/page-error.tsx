import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface PageErrorProps {
  /** Short headline; defaults to a generic load failure. */
  title?: string;
  /** The detail line (e.g. the API error message). */
  message?: string;
  className?: string;
}

/**
 * Full-height, centered error state for a page/route whose data failed to load.
 * Replaces the ad-hoc `<div className="p-4 text-sm text-destructive md:p-6">…</div>`
 * scattered across route pages so every failure looks the same.
 */
export function PageError(props: PageErrorProps) {
  const { title = "Couldn't load this page", message, className } = props;

  return (
    <div
      className={cn(
        "flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 p-6 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Icon name="triangle-alert" className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">{title}</p>
        {message && <p className="mx-auto max-w-md text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}

export default PageError;
