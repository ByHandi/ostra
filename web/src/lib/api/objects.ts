import { infiniteQueryOptions } from "@tanstack/react-query";

import { api, refreshSession } from "./client";
import { API_URL } from "./config";
import { ApiError } from "./errors";
import { getAccessToken } from "./token";

// ── Types (mirror control/internal/objects) ──────────────────────────────────

export interface StoredObject {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  contentType?: string;
}

export interface ObjectPage {
  /** Full prefixes of sub-folders, each ending in "/". */
  folders: string[];
  objects: StoredObject[];
  nextCursor?: string;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export const objectKeys = {
  bucket: (bucketId: string) => ["objects", bucketId] as const,
  folder: (bucketId: string, prefix: string) => ["objects", bucketId, prefix] as const,
};

function objectsPath(bucketId: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return `/buckets/${encodeURIComponent(bucketId)}/objects${search ? `?${search}` : ""}`;
}

/** One folder, page by page ("Load more"). */
export const folderQuery = (bucketId: string, prefix: string) =>
  infiniteQueryOptions({
    queryKey: objectKeys.folder(bucketId, prefix),
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string> = { prefix };
      if (pageParam) params.cursor = pageParam;
      return (await api.get<ObjectPage>(objectsPath(bucketId, params))).data as ObjectPage;
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor || undefined,
  });

// ── Mutations ────────────────────────────────────────────────────────────────

export const deleteObject = (bucketId: string, key: string) =>
  api.delete(objectsPath(bucketId, { key }));

export const deleteFolder = (bucketId: string, prefix: string) =>
  api.delete<{ deleted: number }>(objectsPath(bucketId, { prefix }));

/**
 * Starts a browser download. The API first issues a short-lived signed link (a plain
 * navigation cannot send the Authorization header), then the browser follows it.
 */
export async function downloadObject(bucketId: string, key: string): Promise<void> {
  const res = await api.post<{ url: string }>(
    `/buckets/${encodeURIComponent(bucketId)}/objects/download-link`,
    { key },
  );
  const url = res.data?.url;
  if (!url) throw new ApiError("The server did not return a download link.", 500);

  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export interface UploadOptions {
  onProgress?(loaded: number, total: number): void;
  signal?: AbortSignal;
}

/**
 * Uploads one file as the raw request body. Uses XMLHttpRequest rather than fetch because
 * fetch cannot report upload progress. A 401 refreshes the session once and retries.
 */
export async function uploadObject(
  bucketId: string,
  key: string,
  file: File,
  options: UploadOptions = {},
): Promise<StoredObject> {
  const first = await sendUpload(bucketId, key, file, options);
  if (first.status !== 401) return readUpload(first);

  if (!(await refreshSession())) {
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }
  return readUpload(await sendUpload(bucketId, key, file, options));
}

interface UploadResult {
  status: number;
  body: string;
}

function sendUpload(
  bucketId: string,
  key: string,
  file: File,
  { onProgress, signal }: UploadOptions,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${API_URL}${objectsPath(bucketId, { key })}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new ApiError("Can't reach the server", 0));
    xhr.onabort = () => reject(new DOMException("Upload canceled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(file);
  });
}

function readUpload({ status, body }: UploadResult): StoredObject {
  let parsed: { success?: boolean; data?: StoredObject; error?: { message?: string } } | null =
    null;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Not JSON (e.g. a proxy error page); handled below.
  }
  if (status >= 200 && status < 300 && parsed?.success && parsed.data) return parsed.data;
  throw new ApiError(parsed?.error?.message ?? `Upload failed (${status})`, status);
}
