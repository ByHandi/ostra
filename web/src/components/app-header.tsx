import { useRouter } from "@tanstack/react-router";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
import { cn } from "@/lib/utils";

export interface AppHeaderProps {
  title?: string;
  description?: string;
  endContent?: ReactNode;
  bottomContent?: ReactNode;
  className?: string;
  showBackButton?: boolean;
  onBack?(): void;
}

function AppHeader(props: AppHeaderProps) {
  const {
    title,
    description,
    endContent,
    bottomContent,
    className,
    showBackButton = false,
    onBack,
  } = props;

  const router = useRouter();
  const hidden = useHideOnScroll();

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex flex-col gap-1 bg-background/95 px-4 pt-4 backdrop-blur supports-backdrop-filter:bg-background/60 md:px-6 md:pt-6",
        "transition-transform duration-300 ease-in-out will-change-transform",
        hidden && "-translate-y-full",
        !title && !description && !endContent && "md:hidden",
        className,
      )}
    >
      {showBackButton && (
        <Button
          variant="link"
          className="w-fit"
          startContent={<Icon name="arrow-left" className="size-4" />}
          onClick={onBack ?? (() => router.history.back())}
        >
          Back
        </Button>
      )}

      <div className="flex justify-between gap-1">
        {title || description ? (
          <>
            <div className="space-y-1">
              {title && <h1 className="text-lg font-semibold">{title}</h1>}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>

            {endContent}
          </>
        ) : null}
      </div>

      {bottomContent && <div className="pb-4">{bottomContent}</div>}
    </div>
  );
}

export default AppHeader;
