import { useCallback, useRef, useState } from "react";

import { ApiError } from "@/lib/api/errors";
import { uploadObject } from "@/lib/api/objects";

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "canceled";

export interface Upload {
  id: number;
  name: string;
  key: string;
  loaded: number;
  total: number;
  status: UploadStatus;
  error?: string;
}

/** Uploads at the same time; the rest wait in the queue. */
const CONCURRENCY = 3;

interface Job {
  id: number;
  file: File;
  key: string;
}

/**
 * Upload queue for one bucket. `start` adds files under a folder prefix; `onUploaded` runs
 * after each successful upload so listings can refresh as files land.
 */
export function useUploads(bucketId: string, onUploaded: () => void) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const queue = useRef<Job[]>([]);
  const running = useRef(0);
  const controllers = useRef(new Map<number, AbortController>());
  const nextId = useRef(1);

  const update = useCallback((id: number, patch: Partial<Upload>) => {
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  // Named so it can schedule itself again when an upload finishes.
  const pump = useCallback(
    function run() {
      while (running.current < CONCURRENCY && queue.current.length > 0) {
        const job = queue.current.shift()!;
        const controller = new AbortController();
        controllers.current.set(job.id, controller);
        running.current++;
        update(job.id, { status: "uploading" });

        uploadObject(bucketId, job.key, job.file, {
          signal: controller.signal,
          onProgress: (loaded, total) => update(job.id, { loaded, total }),
        })
          .then(() => {
            update(job.id, { status: "done", loaded: job.file.size });
            onUploaded();
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") {
              update(job.id, { status: "canceled" });
              return;
            }
            const message = error instanceof ApiError ? error.message : "Upload failed";
            update(job.id, { status: "error", error: message });
          })
          .finally(() => {
            controllers.current.delete(job.id);
            running.current--;
            run();
          });
      }
    },
    [bucketId, onUploaded, update],
  );

  const start = useCallback(
    (files: FileList | File[], prefix: string) => {
      const jobs = Array.from(files).map((file) => ({
        id: nextId.current++,
        file,
        key: prefix + file.name,
      }));
      if (jobs.length === 0) return;

      setUploads((list) => [
        ...list,
        ...jobs.map((j) => ({
          id: j.id,
          name: j.file.name,
          key: j.key,
          loaded: 0,
          total: j.file.size,
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
      const queued = queue.current.findIndex((j) => j.id === id);
      if (queued >= 0) {
        queue.current.splice(queued, 1);
        update(id, { status: "canceled" });
        return;
      }
      controllers.current.get(id)?.abort();
    },
    [update],
  );

  /** Removes finished, failed, and canceled uploads from the list. */
  const clearFinished = useCallback(() => {
    setUploads((list) => list.filter((u) => u.status === "queued" || u.status === "uploading"));
  }, []);

  return { uploads, start, cancel, clearFinished };
}
