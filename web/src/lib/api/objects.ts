import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

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

export interface ObjectMetadata {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  contentType: string;
  cacheControl: string;
  contentDisposition: string;
}

export interface UpdateObjectMetadataInput {
  contentType: string;
  cacheControl?: string;
  contentDisposition?: string;
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

/** Object metadata and HTTP headers. */
export const objectMetadataQuery = (bucketId: string, key: string) =>
  queryOptions({
    queryKey: [...objectKeys.bucket(bucketId), "metadata", key] as const,
    queryFn: async () => {
      const res = await api.get<ObjectMetadata>(
        `/buckets/${encodeURIComponent(bucketId)}/objects/metadata?key=${encodeURIComponent(key)}`,
      );
      if (!res.data) throw new ApiError("Failed to fetch object metadata", 500);
      return res.data;
    },
  });

// ── Mutations ────────────────────────────────────────────────────────────────

export const deleteObject = (bucketId: string, key: string) =>
  api.delete(objectsPath(bucketId, { key }));

export const deleteFolder = (bucketId: string, prefix: string) =>
  api.delete<{ deleted: number }>(objectsPath(bucketId, { prefix }));

export const updateObjectMetadata = async (
  bucketId: string,
  key: string,
  input: UpdateObjectMetadataInput,
): Promise<ObjectMetadata> => {
  const res = await api.put<ObjectMetadata>(
    `/buckets/${encodeURIComponent(bucketId)}/objects/metadata?key=${encodeURIComponent(key)}`,
    input,
  );
  if (!res.data) throw new ApiError("Failed to update object metadata", 500);
  return res.data;
};

export interface CopyMoveResult {
  copied?: number;
  moved?: number;
}

export const copyObject = (bucketId: string, src: string, dest: string) =>
  api.post<CopyMoveResult>(`/buckets/${encodeURIComponent(bucketId)}/objects/copy`, { src, dest });

export const moveObject = (bucketId: string, src: string, dest: string) =>
  api.post<CopyMoveResult>(`/buckets/${encodeURIComponent(bucketId)}/objects/move`, { src, dest });

export type ShareLinkExpiry = "1h" | "1d" | "7d";

export interface ObjectLink {
  url: string;
  expiresAt: string;
}

export type ShareLink = ObjectLink;

export type PreviewKind = "image" | "video" | "pdf" | "text";

const TEXT_EXTENSIONS = new Set(["csv", "json", "log", "md", "txt", "xml", "yaml", "yml"]);
const IMAGE_EXTENSIONS = new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);

export function previewKind(key: string, contentType?: string): PreviewKind | null {
  const mediaType = contentType?.split(";", 1)[0].toLowerCase() ?? "";
  if (mediaType.startsWith("image/") && mediaType !== "image/svg+xml") return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType === "application/pdf") return "pdf";
  if (mediaType.startsWith("text/") && mediaType !== "text/html") return "text";

  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (extension === "pdf") return "pdf";
  return TEXT_EXTENSIONS.has(extension) ? "text" : null;
}

export async function createShareLink(
  bucketId: string,
  key: string,
  expiresIn: ShareLinkExpiry,
): Promise<ShareLink> {
  const res = await api.post<ShareLink>(
    `/buckets/${encodeURIComponent(bucketId)}/objects/share-link`,
    { key, expiresIn },
  );
  if (!res.data?.url || !res.data.expiresAt) {
    throw new ApiError("The server did not return a share link.", 500);
  }
  return res.data;
}

export async function createPreviewLink(bucketId: string, key: string): Promise<ObjectLink> {
  const res = await api.post<ObjectLink>(
    `/buckets/${encodeURIComponent(bucketId)}/objects/preview-link`,
    { key },
  );
  if (!res.data?.url || !res.data.expiresAt) {
    throw new ApiError("The server did not return a preview link.", 500);
  }
  return res.data;
}

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
