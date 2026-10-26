import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api/errors";
import { useIsAdmin } from "@/lib/api/session";
import {
  type AccessKeyDetail,
  type Bucket,
  type Permissions,
  setKeyPermissions,
  storageKeys,
} from "@/lib/api/storage";

const PERMS: { key: keyof Permissions; label: string; hint: string }[] = [
  { key: "read", label: "Read", hint: "Read and list objects" },
  { key: "write", label: "Write", hint: "Upload and delete objects" },
  { key: "owner", label: "Owner", hint: "Change bucket settings" },
];

const COLUMNS = ["Bucket", ...PERMS.map((p) => p.label)];
const NONE: Permissions = { read: false, write: false, owner: false };

interface KeyPermissionsProps {
  accessKey: AccessKeyDetail;
  buckets: Bucket[];
}

/** One row per bucket; every checkbox saves immediately. */
function KeyPermissions({ accessKey, buckets }: KeyPermissionsProps) {
  if (buckets.length === 0) {
    return (
      <EmptyState
        icon="archive"
        title="No buckets yet"
        description="Create a bucket first, then give this key access to it."
      />
    );
  }

  const granted = new Map(accessKey.buckets.map((b) => [b.bucketId, b.permissions]));

  return (
    <div className="panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bucket</TableHead>
            {PERMS.map((p) => (
              <TableHead key={p.key} title={p.hint} className="w-24 text-center">
                {p.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {buckets.map((b) => (
            <PermissionRow
              key={b.id}
              keyId={accessKey.id}
              bucket={b}
              permissions={granted.get(b.id) ?? NONE}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface PermissionRowProps {
  keyId: string;
  bucket: Bucket;
  permissions: Permissions;
}

function PermissionRow({ keyId, bucket, permissions }: PermissionRowProps) {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  const mutation = useMutation({
    mutationFn: (next: Permissions) => setKeyPermissions(keyId, bucket.id, next),
    onSuccess: (detail) => {
      queryClient.setQueryData(storageKeys.key(keyId), detail);
      queryClient.invalidateQueries({ queryKey: storageKeys.bucket(bucket.id) });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save permissions");
    },
  });

  // Show the value being saved, so the checkbox does not snap back while the request runs.
  const shown = mutation.isPending && mutation.variables ? mutation.variables : permissions;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Link
            to="/buckets/$bucketId"
            params={{ bucketId: bucket.id }}
            className="font-medium hover:underline"
          >
            {bucket.name}
          </Link>
          {mutation.isPending && <Spinner className="size-3.5 text-muted-foreground" />}
        </div>
      </TableCell>
      {PERMS.map((p) => (
        <TableCell key={p.key} className="text-center">
          <Checkbox
            className="mx-auto"
            aria-label={`${p.label} for ${bucket.name}`}
            checked={shown[p.key]}
            disabled={!isAdmin || mutation.isPending}
            onCheckedChange={
              isAdmin
                ? (checked) => mutation.mutate({ ...shown, [p.key]: checked === true })
                : undefined
            }
          />
        </TableCell>
      ))}
    </TableRow>
  );
}

KeyPermissions.Skeleton = () => <TableSkeleton columns={COLUMNS} rows={3} />;
export default KeyPermissions;
