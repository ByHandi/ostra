import { queryOptions } from "@tanstack/react-query";

import { api } from "./client";

// ── Types (mirror control/internal/service and control/internal/api) ──────────

export interface Permissions {
  read: boolean;
  write: boolean;
  owner: boolean;
}

export interface Bucket {
  id: string;
  name: string;
  created: string;
  objects: number;
  bytes: number;
  websiteAccess: boolean;
  /** Custom domains currently attached as aliases. */
  domains: string[];
}

export interface BucketKeyAccess {
  keyId: string;
  keyName: string;
  permissions: Permissions;
}

export interface BucketDetail extends Bucket {
  keys: BucketKeyAccess[];
  domainRecords: Domain[];
}

export interface AccessKey {
  id: string;
  name: string;
  created: string;
  expired: boolean;
}

export interface KeyBucketAccess {
  bucketId: string;
  bucketName: string;
  permissions: Permissions;
}

export interface AccessKeyDetail extends AccessKey {
  buckets: KeyBucketAccess[];
}

/** Only ever returned by createKey — the secret cannot be read back afterwards. */
export interface CreatedKey extends AccessKeyDetail {
  secretAccessKey: string;
}

export type DomainStatus = "pending" | "active" | "error";

export interface DnsRecord {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
}

export interface Domain {
  id: number;
  domain: string;
  bucketId: string;
  bucketName: string;
  status: DomainStatus;
  lastError: string;
  lastCheckedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  dnsRecords: DnsRecord[];
}

export interface Overview {
  cluster: {
    status: string;
    knownNodes: number;
    connectedNodes: number;
    storageNodes: number;
    storageNodesUp: number;
    partitions: number;
    partitionsAllOk: number;
  };
  buckets: number;
  objects: number;
  bytes: number;
  keys: number;
  domains: Record<DomainStatus, number>;
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const storageKeys = {
  overview: ["overview"] as const,
  buckets: ["buckets"] as const,
  bucket: (id: string) => ["buckets", id] as const,
  keys: ["keys"] as const,
  key: (id: string) => ["keys", id] as const,
  domains: ["domains"] as const,
  domain: (id: number) => ["domains", id] as const,
};

async function data<T>(promise: Promise<{ data?: T }>): Promise<T> {
  return (await promise).data as T;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export const overviewQuery = () =>
  queryOptions({
    queryKey: storageKeys.overview,
    queryFn: () => data(api.get<Overview>("/overview")),
  });

export const bucketsQuery = () =>
  queryOptions({
    queryKey: storageKeys.buckets,
    queryFn: () => data(api.get<Bucket[]>("/buckets")),
  });

export const bucketQuery = (id: string) =>
  queryOptions({
    queryKey: storageKeys.bucket(id),
    queryFn: () => data(api.get<BucketDetail>(`/buckets/${encodeURIComponent(id)}`)),
  });

export const keysQuery = () =>
  queryOptions({
    queryKey: storageKeys.keys,
    queryFn: () => data(api.get<AccessKey[]>("/keys")),
  });

export const keyQuery = (id: string) =>
  queryOptions({
    queryKey: storageKeys.key(id),
    queryFn: () => data(api.get<AccessKeyDetail>(`/keys/${encodeURIComponent(id)}`)),
  });

/** Pending domains are re-checked by the server every 30s; poll so the UI follows. */
function pollWhilePending(domains: Domain | Domain[] | undefined): number | false {
  const list = Array.isArray(domains) ? domains : domains ? [domains] : [];
  return list.some((d) => d.status === "pending") ? 10_000 : false;
}

export const domainsQuery = () =>
  queryOptions({
    queryKey: storageKeys.domains,
    queryFn: () => data(api.get<Domain[]>("/domains")),
    refetchInterval: (query) => pollWhilePending(query.state.data),
  });

export const domainQuery = (id: number) =>
  queryOptions({
    queryKey: storageKeys.domain(id),
    queryFn: () => data(api.get<Domain>(`/domains/${id}`)),
    refetchInterval: (query) => pollWhilePending(query.state.data),
  });

// ── Mutations ────────────────────────────────────────────────────────────────

export const createBucket = (input: { name: string }) => data(api.post<Bucket>("/buckets", input));

export const deleteBucket = (id: string) => api.delete(`/buckets/${encodeURIComponent(id)}`);

export const createKey = (input: { name: string }) => data(api.post<CreatedKey>("/keys", input));

export const deleteKey = (id: string) => api.delete(`/keys/${encodeURIComponent(id)}`);

export const setKeyPermissions = (keyId: string, bucketId: string, permissions: Permissions) =>
  data(
    api.put<AccessKeyDetail>(
      `/keys/${encodeURIComponent(keyId)}/buckets/${encodeURIComponent(bucketId)}`,
      permissions,
    ),
  );

export const createDomain = (input: { domain: string; bucket: string }) =>
  data(api.post<Domain>("/domains", input));

export const verifyDomain = (id: number) => data(api.post<Domain>(`/domains/${id}/verify`));

export const deleteDomain = (id: number) => api.delete(`/domains/${id}`);
