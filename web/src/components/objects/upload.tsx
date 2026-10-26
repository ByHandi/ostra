import { type DragEvent, type ReactNode, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/** Opens the file picker; selected files are passed to onFiles. */
export function UploadButton({ onFiles }: { onFiles(files: FileList): void }) {
  const input = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  return (
    <>
      <Button
        size={isMobile ? "icon-sm" : "sm"}
        startContent={<Icon name="upload" className="size-4" />}
        onClick={() => input.current?.click()}
      >
        {isMobile ? " " : "Upload"}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = ""; // allow picking the same file again
        }}
      />
    </>
  );
}

/** Wraps the file list; dropping files anywhere on it uploads them to the current folder. */
export function DropZone({
  onFiles,
  children,
  className,
  disabled = false,
}: {
  onFiles(files: FileList): void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

  if (disabled) {
    return <div className={cn("relative", className)}>{children}</div>;
  }

  return (
    <div
      className={cn("relative", className)}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-sm font-medium">
          <span className="inline-flex items-center gap-2 rounded-md bg-background px-3 py-2 shadow-sm">
            <Icon name="upload" className="size-4" />
            Drop to upload to this folder
          </span>
        </div>
      )}
    </div>
  );
}
