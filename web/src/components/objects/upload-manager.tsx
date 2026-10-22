import { useQueryClient } from "@tanstack/react-query";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { UploadManagerContext } from "@/hooks/use-upload-manager";
import { ApiError } from "@/lib/api/errors";
import { objectKeys, uploadObject } from "@/lib/api/objects";
import { storageKeys } from "@/lib/api/storage";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "canceled";

export interface Upload {
  id: number;
  bucketId: string;
  name: string;
  key: string;
  loaded: number;
  total: number;
  status: UploadStatus;
  error?: string;
}

interface Job {
  id: number;
  bucketId: string;
  file: File;
  key: string;
}

const CONCURRENCY = 3;

export function UploadManagerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const queue = useRef<Job[]>([]);
  const running = useRef(0);
  const controllers = useRef(new Map<number, AbortController>());
  const nextID = useRef(1);

  const update = useCallback((id: number, patch: Partial<Upload>) => {
    setUploads((list) =>
      list.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload)),
    );
  }, []);

  const invalidateBucket = useCallback(
    (bucketId: string) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: objectKeys.bucket(bucketId) }),
        queryClient.invalidateQueries({ queryKey: storageKeys.bucket(bucketId) }),
        queryClient.invalidateQueries({ queryKey: storageKeys.buckets }),
        queryClient.invalidateQueries({ queryKey: storageKeys.overview }),
      ]),
    [queryClient],
  );

  const pump = useCallback(
    function run() {
      while (running.current < CONCURRENCY && queue.current.length > 0) {
        const job = queue.current.shift()!;
        const controller = new AbortController();
        controllers.current.set(job.id, controller);
        running.current++;
        update(job.id, { status: "uploading" });

        uploadObject(job.bucketId, job.key, job.file, {
          signal: controller.signal,
          onProgress: (loaded, total) => update(job.id, { loaded, total }),
        })
          .then(() => {
            update(job.id, { status: "done", loaded: job.file.size });
            void invalidateBucket(job.bucketId);
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") {
              update(job.id, { status: "canceled" });
              return;
            }
            update(job.id, {
              status: "error",
              error: error instanceof ApiError ? error.message : "Upload failed",
            });
          })
          .finally(() => {
            controllers.current.delete(job.id);
            running.current--;
            run();
          });
      }
    },
    [invalidateBucket, update],
  );

  const start = useCallback(
    (bucketId: string, files: FileList | File[], prefix: string) => {
      const jobs = Array.from(files).map((file) => ({
        id: nextID.current++,
        bucketId,
        file,
        key: prefix + file.name,
      }));
      if (jobs.length === 0) return;
      setUploads((list) => [
        ...list,
        ...jobs.map((job) => ({
          id: job.id,
          bucketId: job.bucketId,
          name: job.file.name,
          key: job.key,
          loaded: 0,
          total: job.file.size,
          status: "queued" as const,
        })),
      ]);
      queue.current.push(...jobs);
      pump();
    },
    [pump],
  );

  const cancel = useCallback(
    (id: number) => {
      const queued = queue.current.findIndex((job) => job.id === id);
      if (queued >= 0) {
        queue.current.splice(queued, 1);
        update(id, { status: "canceled" });
        return;
      }
      controllers.current.get(id)?.abort();
    },
    [update],
  );

  const clearFinished = useCallback(() => {
    setUploads((list) =>
      list.filter((upload) => upload.status === "queued" || upload.status === "uploading"),
    );
  }, []);

  const active = uploads.some(
    (upload) => upload.status === "queued" || upload.status === "uploading",
  );
  useEffect(() => {
    const confirmLeave = (event: BeforeUnloadEvent) => {
      if (!active) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmLeave);
    return () => window.removeEventListener("beforeunload", confirmLeave);
  }, [active]);

  return (
    <UploadManagerContext.Provider value={{ start, cancel, clearFinished }}>
      {children}
      <FloatingUploadManager uploads={uploads} onCancel={cancel} onClear={clearFinished} />
    </UploadManagerContext.Provider>
  );
}

function FloatingUploadManager({
  uploads,
  onCancel,
  onClear,
}: {
  uploads: Upload[];
  onCancel(id: number): void;
  onClear(): void;
}) {
  const [expanded, setExpanded] = useState(true);
  if (uploads.length === 0) return null;
  const active = uploads.filter(
    (upload) => upload.status === "queued" || upload.status === "uploading",
  ).length;

  return (
    <aside className="fixed right-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-40 w-[calc(100%-1.5rem)] max-w-sm overflow-hidden rounded-lg border bg-background shadow-lg md:right-6 md:bottom-6">
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon name="upload" className="size-4 text-muted-foreground" />
        <button
          className="min-w-0 flex-1 text-left text-sm font-semibold"
          onClick={() => setExpanded((value) => !value)}
        >
          {active > 0 ? `Uploading ${active} of ${uploads.length}` : "Uploads finished"}
        </button>
        {active < uploads.length && (
          <Button variant="ghost" size="xs" onClick={onClear}>
            Clear
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={expanded ? "Minimize uploads" : "Expand uploads"}
          onClick={() => setExpanded((value) => !value)}
        >
          <Icon name={expanded ? "chevron-down" : "chevron-up"} />
        </Button>
      </div>
      {expanded && (
        <ul className="max-h-72 space-y-2 overflow-y-auto border-t p-3">
          {uploads.map((upload) => (
            <UploadRow key={upload.id} upload={upload} onCancel={() => onCancel(upload.id)} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function UploadRow({ upload, onCancel }: { upload: Upload; onCancel(): void }) {
  const percent = upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0;
  const inFlight = upload.status === "queued" || upload.status === "uploading";
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate" title={upload.key}>
          {upload.name}
        </span>
        <span
          className={cn(
            "shrink-0 text-xs text-muted-foreground",
            upload.status === "error" && "text-destructive",
          )}
        >
          {upload.status === "uploading"
            ? `${percent}% of ${formatBytes(upload.total)}`
            : STATUS_LABEL[upload.status]}
        </span>
        {inFlight && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Cancel upload of ${upload.name}`}
            onClick={onCancel}
          >
            <Icon name="x" />
          </Button>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            upload.status === "error" ? "bg-destructive" : "bg-aurora",
          )}
          style={{ width: `${upload.status === "done" ? 100 : percent}%` }}
        />
      </div>
      {upload.error && <p className="text-xs text-destructive">{upload.error}</p>}
    </li>
  );
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  queued: "Waiting",
  uploading: "Uploading",
  done: "Uploaded",
  error: "Failed",
  canceled: "Canceled",
};
