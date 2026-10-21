import { type NavigateOptions, useRouter } from "@tanstack/react-router";

import { type ReactNode, type Ref, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useCollapsingHeader } from "@/hooks/use-collapsing-header";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface AppHeaderProps {
  title?: string;
  description?: string;
  endContent?: ReactNode;
  bottomContent?: ReactNode;
  className?: string;
  /**
   * Shows a back button. It pops the history entry (a real back, like the
   * browser's) when there is one inside the app, else replaces the current entry
   * with this parent page (e.g. a deep link opened in a fresh tab) — it never
   * pushes a new entry.
   */
  backTo?: NavigateOptions["to"];
}

interface HeaderViewProps extends AppHeaderProps {
  onBack?(): void;
}

/**
 * Page header. Desktop: sticky, hides while scrolling down. Phones: an iOS-style
 * collapsing large title (see `MobileHeader`).
 */
function AppHeader(props: AppHeaderProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { backTo } = props;
  const back =
    backTo === undefined
      ? undefined
      : () => {
          if (router.history.canGoBack()) router.history.back();
          else router.navigate({ to: backTo, replace: true });
        };

  return isMobile ? (
    <MobileHeader {...props} onBack={back} />
  ) : (
    <DesktopHeader {...props} onBack={back} />
  );
}

interface MobileActionsProps {
  children?: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/** Header actions on phones: round icon-only buttons (the label stays for screen readers). */
function MobileActions({ children, className, ref }: MobileActionsProps) {
  if (!children) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center [&_button]:size-9 [&_button]:gap-0 [&_button]:rounded-full [&_button]:p-0 [&_button]:text-[0px] [&>div]:gap-1.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Phones: a fixed header that collapses as the page scrolls. The large title
 * travels up into the nav row next to the back chevron (replacing the "Back"
 * label), the description fades, and `bottomContent` (tabs) rides up and stays
 * pinned under the nav row.
 *
 * Actions: on detail pages (with Back) they sit at the right of the nav row;
 * on top-level pages they sit right of the large title and ride up with it.
 */
function MobileHeader({ title, description, endContent, bottomContent, onBack }: HeaderViewProps) {
  const header = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const backIcon = useRef<HTMLSpanElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const refs = useMemo(
    () => ({ header, content, nav, title: titleRef, backIcon, bottom, actions }),
    [],
  );
  const fullHeight = useCollapsingHeader(refs);

  return (
    <>
      <header
        ref={header}
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--sidebar) calc(var(--p, 0) * 100%), transparent)",
          borderColor:
            "color-mix(in oklch, var(--sidebar-border) calc(var(--p, 0) * 100%), transparent)",
          backdropFilter: "blur(calc(var(--p, 0) * 20px))",
        }}
        className="fixed inset-x-0 top-0 z-30 overflow-hidden border-b"
      >
        <div className="overflow-hidden">
          <div ref={content} className="relative pt-[env(safe-area-inset-top)]">
            <div ref={nav} className="relative h-11">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="absolute top-0 left-1 flex h-11 items-center pr-2 text-[17px] text-primary active:opacity-60"
                >
                  {/* Fixed size: the icon loads async, and the collapsed title is positioned off this box. */}
                  <span ref={backIcon} className="flex size-7 shrink-0">
                    <Icon name="chevron-left" className="size-7" />
                  </span>
                  <span style={{ opacity: "calc(1 - var(--p, 0) * 2.5)" }}>Back</span>
                </button>
              )}
              {onBack && (
                <MobileActions className="absolute top-0 right-2 h-11">{endContent}</MobileActions>
              )}
            </div>

            <div className="px-4 pb-3">
              <div className="flex items-center justify-between gap-3">
                {title && (
                  <h1
                    ref={titleRef}
                    className="w-fit max-w-full min-w-0 origin-top-left truncate text-[32px] leading-10 font-bold tracking-tight will-change-transform"
                  >
                    {title}
                  </h1>
                )}
                {!onBack && (
                  <MobileActions ref={actions} className="shrink-0 will-change-transform">
                    {endContent}
                  </MobileActions>
                )}
              </div>
              {description && (
                <p
                  style={{ opacity: "calc(1 - var(--p, 0) * 2.5)" }}
                  className="mt-1 line-clamp-2 text-sm text-muted-foreground"
                >
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>

        {bottomContent && (
          <div ref={bottom} className="absolute inset-x-0 bottom-0 px-4 [&_nav]:m-0">
            {bottomContent}
          </div>
        )}
      </header>

      {/* Reserves the expanded header's space; the fixed header shrinks over it as the page scrolls. */}
      <div aria-hidden style={{ height: fullHeight }} />
    </>
  );
}

/**
 * Desktop: a static header above the page's own scroll area (the app layout
 * pins the viewport, see `(app)/route.tsx`). A hairline marks where content
 * scrolls under; pages with tabs get it from the tab strip instead.
 */
function DesktopHeader(props: HeaderViewProps) {
  const { title, description, endContent, bottomContent, className, onBack } = props;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-1 px-6 pt-6",
        !bottomContent && "border-b pb-4",
        !title && !description && !endContent && "hidden",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {title || description ? (
          <>
            <div className="min-w-0 space-y-1">
              {/* The back button leads the title on one line: "‹ bucket-name". */}
              <div className="flex min-w-0 items-center gap-1">
                {onBack && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="-ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Back"
                    onClick={onBack}
                  >
                    <Icon name="chevron-left" className="size-5" />
                  </Button>
                )}
                {title && <h1 className="truncate text-lg font-semibold">{title}</h1>}
              </div>
              {description && (
                <p className={cn("text-sm text-muted-foreground", onBack && "pl-8")}>
                  {description}
                </p>
              )}
            </div>
            {endContent && <div className="shrink-0">{endContent}</div>}
          </>
        ) : null}
      </div>

      {bottomContent && <div className="pb-4">{bottomContent}</div>}
    </div>
  );
}

export default AppHeader;
