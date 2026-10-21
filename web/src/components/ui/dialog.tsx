import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs max-md:bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

/** Drag distance (px) past which releasing the handle dismisses the sheet. */
const SWIPE_CLOSE_PX = 96;

/**
 * Swipe-down-to-dismiss for the phone bottom sheet, driven from the grab
 * handle only so it never fights text selection or inner scrolling.
 */
function useSwipeToClose(close: () => void) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const startY = React.useRef<number | null>(null);
  const offset = React.useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    offset.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (contentRef.current) contentRef.current.style.transition = "none";
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = contentRef.current;
    if (startY.current === null || !el) return;
    offset.current = Math.max(0, e.clientY - startY.current);
    el.style.transform = `translateY(${offset.current}px)`;
  };

  const onPointerUp = () => {
    const el = contentRef.current;
    startY.current = null;
    if (!el) return;
    el.style.transition = "transform 200ms cubic-bezier(0.2, 0, 0, 1)";

    if (offset.current < SWIPE_CLOSE_PX) {
      el.style.transform = "";
      return;
    }

    // Finish the slide ourselves, then close with the exit animation turned
    // off — otherwise it would replay from the resting position.
    el.style.transform = "translateY(100%)";
    window.setTimeout(() => {
      el.style.animation = "none";
      close();
    }, 200);
  };

  return {
    contentRef,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const { contentRef, handleProps } = useSwipeToClose(() => closeRef.current?.click());

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        data-slot="dialog-content"
        className={cn(
          // Anchored to the top and horizontally centered (top-center). max-height keeps tall
          // dialogs on-screen (they scroll internally). Override `top-*` per-dialog if needed.
          "fixed top-[6vh] left-1/2 z-50 grid max-h-[calc(100dvh-12vh)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 gap-6 overflow-y-auto rounded-xl bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          // Phones: an iOS-style bottom sheet that slides up, clears the home
          // indicator, and can be swiped down from its grab handle.
          "max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-h-[92dvh] max-md:max-w-none! max-md:translate-x-0 max-md:rounded-t-3xl max-md:rounded-b-none max-md:px-5 max-md:pt-7 max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-md:duration-300 max-md:ease-out max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom max-md:data-closed:zoom-out-100 max-md:data-closed:slide-out-to-bottom",
          className,
        )}
        {...props}
      >
        <div
          aria-hidden
          {...handleProps}
          className="absolute inset-x-0 top-0 flex h-7 cursor-grab touch-none items-center justify-center md:hidden"
        >
          <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {children}
        {/* Always rendered so the swipe gesture has something to close with. */}
        <DialogPrimitive.Close ref={closeRef} className="hidden" tabIndex={-1} aria-hidden />
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" className="absolute top-4 right-4 max-md:hidden" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // Phones: full-width, thumb-sized buttons stacked with the primary on top.
        "flex flex-col-reverse gap-2 max-md:**:data-[slot=button]:h-11 max-md:**:data-[slot=button]:text-base sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading leading-none font-medium max-md:text-lg max-md:font-semibold",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
