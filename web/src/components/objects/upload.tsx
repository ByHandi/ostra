import { type DragEvent, type ReactNode, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type { Upload } from "@/hooks/use-uploads";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Opens the file picker; selected files are passed to onFiles. */
export function UploadButton({ onFiles }: { onFiles(files: FileList): void }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        size="sm"
        startContent={<Icon name="upload" className="size-4" />}
        onClick={() => input.current?.click()}
      >
        Upload
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
}: {
  onFiles(files: FileList): void;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

  return (
    <div
      className="relative"
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

const STATUS_LABEL: Record<Upload["status"], string> = {
  queued: "Waiting",
  uploading: "Uploading",
  done: "Uploaded",
  error: "Failed",
  canceled: "Canceled",
};

interface UploadQueueProps {
  uploads: Upload[];
  onCancel(id: number): void;
  onClear(): void;
}

/** Progress of the current and recent uploads. Hidden when there are none. */
export function UploadQueue({ uploads, onCancel, onClear }: UploadQueueProps) {
  if (uploads.length === 0) return null;
  const active = uploads.filter((u) => u.status === "queued" || u.status === "uploading").length;

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3" aria-label="Uploads">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {active > 0 ? `Uploading ${active} of ${uploads.length}` : "Uploads finished"}
        </h2>
        {active < uploads.length && (
          <Button variant="ghost" size="xs" onClick={onClear}>
            Clear finished
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {uploads.map((u) => (
          <UploadRow key={u.id} upload={u} onCancel={() => onCancel(u.id)} />
        ))}
      </ul>
    </section>
  );
}

function UploadRow({ upload: u, onCancel }: { upload: Upload; onCancel(): void }) {
  const percent = u.total > 0 ? Math.round((u.loaded / u.total) * 100) : 0;
  const inFlight = u.status === "queued" || u.status === "uploading";

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate" title={u.key}>
          {u.name}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className={cn(u.status === "error" && "text-destructive")}>
            {u.status === "uploading"
              ? `${percent}% of ${formatBytes(u.total)}`
              : STATUS_LABEL[u.status]}
          </span>
          {inFlight && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Cancel upload of ${u.name}`}
              onClick={onCancel}
            >
              <Icon name="x" />
            </Button>
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            u.status === "error" ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${u.status === "done" ? 100 : percent}%` }}
        />
      </div>
      {u.error && <p className="text-xs text-destructive">{u.error}</p>}
    </li>
  );
}
